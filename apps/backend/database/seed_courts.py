"""
Seed court tags and default courts from CSV files on startup.

Idempotent: skips rows that already exist (matched by slug).
"""

import csv
import logging
from pathlib import Path

from sqlalchemy import select

from backend.database.db import AsyncSessionLocal
from backend.database.models import Court, CourtTag

logger = logging.getLogger(__name__)

SEED_DIR = Path(__file__).resolve().parent.parent / "seed"


async def _seed_court_tags(session) -> int:
    """Seed curated review tags from CSV. Returns count of new rows."""
    csv_path = SEED_DIR / "court_tags.csv"
    if not csv_path.exists():
        logger.warning("Court tags CSV not found: %s", csv_path)
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

    await session.flush()
    return created


async def _seed_courts_from_csv(session, csv_filename: str) -> int:
    """Seed courts from a CSV file. Returns count of new rows."""
    csv_path = SEED_DIR / csv_filename
    if not csv_path.exists():
        logger.warning("Courts CSV not found: %s", csv_path)
        return 0

    def _bool(val: str) -> bool:
        return val.strip().lower() == "true"

    created = 0
    with open(csv_path, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            result = await session.execute(
                select(Court).where(Court.slug == row["slug"])
            )
            if result.scalar_one_or_none():
                continue

            session.add(
                Court(
                    name=row["name"],
                    slug=row["slug"],
                    address=row["address"],
                    location_id=row["location_id"],
                    court_count=int(row["court_count"]) if row.get("court_count") else None,
                    surface_type=row.get("surface_type") or None,
                    is_free=_bool(row["is_free"]),
                    has_lights=_bool(row["has_lights"]),
                    has_restrooms=_bool(row["has_restrooms"]),
                    has_parking=_bool(row["has_parking"]),
                    nets_provided=_bool(row["nets_provided"]),
                    latitude=float(row["latitude"]) if row.get("latitude") else None,
                    longitude=float(row["longitude"]) if row.get("longitude") else None,
                    description=row.get("description") or None,
                    status="approved",
                    is_active=True,
                )
            )
            created += 1

    await session.flush()
    return created


async def seed_courts():
    """Seed court tags and default courts. Called during app startup."""
    async with AsyncSessionLocal() as session:
        tags_created = await _seed_court_tags(session)
        if tags_created:
            logger.info("Seeded %d new court tags", tags_created)

        courts_created = await _seed_courts_from_csv(session, "nyc_courts.csv")
        if courts_created:
            logger.info("Seeded %d new NYC courts", courts_created)

        await session.commit()
