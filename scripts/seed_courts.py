#!/usr/bin/env python3
"""
Seed database with court tags and NYC courts from CSV files.

Reads:
  - backend/seed/court_tags.csv  -> court_tags table
  - backend/seed/nyc_courts.csv  -> courts table (status=approved)

Idempotent: skips rows that already exist (matched by slug).
"""

import asyncio
import csv
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


async def seed_nyc_courts(session) -> int:
    """Seed NYC courts from CSV. Returns count of new rows."""
    csv_path = Path(project_root) / "backend" / "seed" / "nyc_courts.csv"
    if not csv_path.exists():
        print(f"  CSV not found: {csv_path}")
        return 0

    created = 0
    with open(csv_path, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            result = await session.execute(
                select(Court).where(Court.slug == row["slug"])
            )
            if result.scalar_one_or_none():
                continue

            def _bool(val: str) -> bool:
                return val.strip().lower() == "true"

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
                    latitude=float(row["latitude"]) if row["latitude"] else None,
                    longitude=float(row["longitude"]) if row["longitude"] else None,
                    description=row.get("description") or None,
                    status="approved",
                    is_active=True,
                )
            )
            created += 1

    await session.commit()
    return created


async def main():
    """Run all court seed operations."""
    print("Seeding court discovery data...")

    async with AsyncSessionLocal() as session:
        tags_created = await seed_court_tags(session)
        print(f"  Court tags: {tags_created} created")

        courts_created = await seed_nyc_courts(session)
        print(f"  NYC courts: {courts_created} created")

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
