#!/usr/bin/env python3
"""Safely reconcile the curated court CSV with an existing database.

No rows are deleted. Courts removed from the catalog are marked inactive, and
matching catalog rows are updated in place. The command defaults to dry-run.
"""

import argparse
import asyncio
import csv
import json
import sys
from pathlib import Path

from sqlalchemy import select

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.database.db import AsyncSessionLocal  # noqa: E402
from backend.database.models import Court  # noqa: E402


RETIRED_SLUGS = {
    "baker-beach-volleyball-court-san-francisco",
    "desert-breeze-park-las-vegas",
    "dig-and-dive-wilmington",
    "emmitt-park-san-antonio",
    "folly-beach-county-park-folly-beach",
    "garland-park-denver",
    "lv-beach-volleyball-las-vegas",
    "mike-chappell-park-carolina-beach",
    "sand-key-park-clearwater",
    "sand-santa-cruz-indoor-santa-cruz",
    "vollis-beach-nashville",
    "woodlawn-lake-park-san-antonio",
}


def _bool(value: str) -> bool:
    return value.strip().lower() == "true"


def _values(row: dict[str, str]) -> dict:
    latitude = float(row["latitude"]) if row["latitude"] else None
    longitude = float(row["longitude"]) if row["longitude"] else None
    values = {
        "name": row["name"],
        "address": row["address"],
        "location_id": row["location_id"],
        "court_count": int(row["court_count"]) if row["court_count"] else None,
        "surface_type": row["surface_type"] or None,
        "is_free": _bool(row["is_free"]),
        "has_lights": _bool(row["has_lights"]),
        "has_restrooms": _bool(row["has_restrooms"]),
        "has_parking": _bool(row["has_parking"]),
        "nets_provided": _bool(row["nets_provided"]),
        "description": row["description"] or None,
        "status": "approved",
        "is_active": True,
    }
    # A verified venue may be seeded before coordinates are available. Never
    # erase coordinates already present in the database just because the CSV
    # leaves those fields blank.
    if latitude is not None and longitude is not None:
        values.update(
            latitude=latitude,
            longitude=longitude,
            geoJson=json.dumps(
                {"type": "Point", "coordinates": [longitude, latitude]}
            ),
        )
    return values


async def reconcile(apply: bool) -> tuple[int, int, int]:
    csv_path = PROJECT_ROOT / "backend" / "seed" / "courts.csv"
    with csv_path.open(encoding="utf-8", newline="") as file:
        rows = list(csv.DictReader(file))

    created = updated = retired = 0
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Court))
        existing_by_slug = {court.slug: court for court in result.scalars() if court.slug}

        for row in rows:
            values = _values(row)
            court = existing_by_slug.get(row["slug"])
            if court is None:
                created += 1
                if apply:
                    session.add(Court(slug=row["slug"], **values))
                continue

            changes = {
                key: value for key, value in values.items() if getattr(court, key) != value
            }
            if changes:
                updated += 1
                if apply:
                    for key, value in changes.items():
                        setattr(court, key, value)

        for slug in RETIRED_SLUGS:
            court = existing_by_slug.get(slug)
            if court is not None and court.is_active is not False:
                retired += 1
                if apply:
                    court.is_active = False

        if apply:
            await session.commit()
        else:
            await session.rollback()

    return created, updated, retired


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="commit the reconciliation")
    args = parser.parse_args()
    created, updated, retired = await reconcile(args.apply)
    mode = "applied" if args.apply else "dry-run"
    print(f"{mode}: {created} create, {updated} update, {retired} deactivate")


if __name__ == "__main__":
    asyncio.run(main())
