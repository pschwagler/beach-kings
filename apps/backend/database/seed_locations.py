"""
Seed regions and locations from CSV file on startup.

Idempotent: skips rows that already exist by primary key.
"""

import csv
import logging
from pathlib import Path

from sqlalchemy import select

from backend.database.db import AsyncSessionLocal
from backend.database.models import Location, Region

logger = logging.getLogger(__name__)

SEED_DIR = Path(__file__).resolve().parent.parent / "seed"


async def seed_locations() -> None:
    """Seed regions and locations from locations.csv."""
    csv_path = SEED_DIR / "locations.csv"
    if not csv_path.exists():
        logger.warning("Locations CSV not found: %s", csv_path)
        return

    regions_dict: dict[str, str] = {}
    locations_data: list[dict] = []

    with open(csv_path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            region_id = row["region_id"]
            if region_id not in regions_dict:
                regions_dict[region_id] = row["region"]
            locations_data.append(
                {
                    "id": row["hub_id"],
                    "name": row["display_name"],
                    "city": row["center_city"],
                    "state": row["state"],
                    "region_id": region_id,
                    "tier": int(row["tier"]) if row.get("tier") else None,
                    "latitude": float(row["lat"]) if row.get("lat") else None,
                    "longitude": float(row["lng"]) if row.get("lng") else None,
                    "seasonality": row.get("seasonality", ""),
                    "radius_miles": float(row["radius_miles"])
                    if row.get("radius_miles")
                    else None,
                }
            )

    async with AsyncSessionLocal() as session:
        # Seed regions first (locations FK to regions)
        regions_created = 0
        for region_id, region_name in regions_dict.items():
            result = await session.execute(select(Region).where(Region.id == region_id))
            if not result.scalar_one_or_none():
                session.add(Region(id=region_id, name=region_name))
                regions_created += 1
        await session.commit()

        # Seed locations
        locations_created = 0
        for loc in locations_data:
            if not loc["id"]:
                continue
            result = await session.execute(select(Location).where(Location.id == loc["id"]))
            if not result.scalar_one_or_none():
                session.add(
                    Location(
                        id=loc["id"],
                        name=loc["name"],
                        city=loc["city"],
                        state=loc["state"],
                        country="USA",
                        region_id=loc["region_id"],
                        tier=loc["tier"],
                        latitude=loc["latitude"],
                        longitude=loc["longitude"],
                        seasonality=loc["seasonality"],
                        radius_miles=loc["radius_miles"],
                    )
                )
                locations_created += 1
        await session.commit()

    if regions_created or locations_created:
        logger.info(
            "Seeded %d new regions and %d new locations", regions_created, locations_created
        )
