"""
Seed court tags and courts for all locations from CSV files on startup.

Idempotent: creates new rows and backfills missing coordinates on existing rows.
Does NOT overwrite existing court data — users may edit courts based on their
experience, and those changes should be preserved across restarts.
To force a full re-seed, delete rows from the courts table first.
"""

import csv
import json
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


def _make_geojson(lat: float, lng: float) -> str:
    """Build a GeoJSON Point string from latitude and longitude."""
    return json.dumps({"type": "Point", "coordinates": [lng, lat]})


async def _seed_courts_from_csv(session, csv_filename: str) -> tuple[int, int]:
    """Seed courts from a CSV file. Returns (created, updated) counts."""
    csv_path = SEED_DIR / csv_filename
    if not csv_path.exists():
        logger.warning("Courts CSV not found: %s", csv_path)
        return 0, 0

    def _bool(val: str) -> bool:
        return val.strip().lower() == "true"

    created = 0
    updated = 0
    with open(csv_path, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            lat = float(row["latitude"]) if row.get("latitude") else None
            lng = float(row["longitude"]) if row.get("longitude") else None
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
                    court_count=int(row["court_count"]) if row.get("court_count") else None,
                    surface_type=row.get("surface_type") or None,
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

    await session.flush()
    return created, updated


async def seed_courts():
    """Seed court tags and default courts. Called during app startup."""
    async with AsyncSessionLocal() as session:
        tags_created = await _seed_court_tags(session)
        if tags_created:
            logger.info("Seeded %d new court tags", tags_created)

        courts_created, courts_updated = await _seed_courts_from_csv(session, "courts.csv")
        if courts_created:
            logger.info("Seeded %d new courts", courts_created)
        if courts_updated:
            logger.info("Backfilled coordinates on %d existing courts", courts_updated)

        await session.commit()
