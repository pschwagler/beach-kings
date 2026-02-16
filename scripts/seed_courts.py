#!/usr/bin/env python3
"""
Seed database with court tags and courts for all locations from CSV files.

Reads:
  - backend/seed/court_tags.csv  -> court_tags table
  - backend/seed/courts.csv     -> courts table (status=approved)

Idempotent: creates new rows and backfills missing coordinates on existing rows.
"""

import asyncio
import csv
import json
import os
import sys
from pathlib import Path

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from sqlalchemy import select
from backend.database.db import AsyncSessionLocal
from backend.database.models import Court, CourtTag


async def seed_court_tags(session) -> int:
    """Seed curated review tags from CSV. Returns count of new rows."""
    csv_path = Path(project_root) / "backend" / "seed" / "court_tags.csv"
    if not csv_path.exists():
        print(f"  CSV not found: {csv_path}")
        return 0

    created = 0
    with open(csv_path, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            result = await session.execute(
                select(CourtTag).where(CourtTag.slug == row["slug"])
            )
            if result.scalar_one_or_none():
                continue
            session.add(
                CourtTag(
                    name=row["name"],
                    slug=row["slug"],
                    category=row["category"],
                    sort_order=int(row["sort_order"]),
                )
            )
            created += 1

    await session.commit()
    return created


def _make_geojson(lat: float, lng: float) -> str:
    """Build a GeoJSON Point string from latitude and longitude."""
    return json.dumps({"type": "Point", "coordinates": [lng, lat]})


def _bool(val: str) -> bool:
    return val.strip().lower() == "true"


async def seed_courts(session) -> tuple[int, int]:
    """Seed courts from CSV. Returns (created, updated) counts."""
    csv_path = Path(project_root) / "backend" / "seed" / "courts.csv"
    if not csv_path.exists():
        print(f"  CSV not found: {csv_path}")
        return 0, 0

    created = 0
    updated = 0
    with open(csv_path, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            lat = float(row["latitude"]) if row["latitude"] else None
            lng = float(row["longitude"]) if row["longitude"] else None
            geo = _make_geojson(lat, lng) if lat and lng else None

            result = await session.execute(
                select(Court).where(Court.slug == row["slug"])
            )
            existing = result.scalar_one_or_none()
            if existing:
                # Backfill missing coordinates on existing courts
                changed = False
                if existing.latitude is None and lat is not None:
                    existing.latitude = lat
                    changed = True
                if existing.longitude is None and lng is not None:
                    existing.longitude = lng
                    changed = True
                if existing.geoJson is None and geo is not None:
                    existing.geoJson = geo
                    changed = True
                if changed:
                    updated += 1
                continue

            session.add(
                Court(
                    name=row["name"],
                    slug=row["slug"],
                    address=row["address"],
                    location_id=row["location_id"],
                    court_count=int(row["court_count"]) if row["court_count"] else None,
                    surface_type=row["surface_type"] or None,
                    is_free=_bool(row["is_free"]),
                    has_lights=_bool(row["has_lights"]),
                    has_restrooms=_bool(row["has_restrooms"]),
                    has_parking=_bool(row["has_parking"]),
                    nets_provided=_bool(row["nets_provided"]),
                    latitude=lat,
                    longitude=lng,
                    geoJson=geo,
                    description=row.get("description") or None,
                    status="approved",
                    is_active=True,
                )
            )
            created += 1

    await session.commit()
    return created, updated


async def main():
    """Run all court seed operations."""
    print("Seeding court discovery data...")

    async with AsyncSessionLocal() as session:
        tags_created = await seed_court_tags(session)
        print(f"  Court tags: {tags_created} created")

        courts_created, courts_updated = await seed_courts(session)
        print(f"  Courts: {courts_created} created, {courts_updated} updated")

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
