#!/usr/bin/env python3
"""
Backfill missing latitude, longitude, and geoJson on existing courts.

1. Courts with lat/lng but no geoJson → generates geoJson from coordinates.
2. Courts with no lat/lng but with an address → geocodes via Mapbox, then sets
   lat, lng, and geoJson.

Reads MAPBOX_ACCESS_TOKEN (or NEXT_PUBLIC_MAPBOX_TOKEN) from env / .env file.
Safe to run multiple times — only touches rows with missing data.
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import quote

import httpx

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

# Load .env if python-dotenv is available
try:
    from dotenv import load_dotenv

    load_dotenv(Path(project_root) / ".env")
except ImportError:
    pass

from sqlalchemy import or_, select
from backend.database.db import AsyncSessionLocal
from backend.database.models import Court

MAPBOX_GEOCODING_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places"


def _get_mapbox_token() -> str | None:
    """Read Mapbox token from environment (try both common var names)."""
    return os.environ.get("MAPBOX_ACCESS_TOKEN") or os.environ.get(
        "NEXT_PUBLIC_MAPBOX_TOKEN"
    )


def _make_geojson(lat: float, lng: float) -> str:
    """Build a GeoJSON Point string from latitude and longitude."""
    return json.dumps({"type": "Point", "coordinates": [lng, lat]})


async def _geocode(client: httpx.AsyncClient, token: str, address: str):
    """Geocode an address via Mapbox. Returns (lat, lng) or (None, None)."""
    try:
        resp = await client.get(
            f"{MAPBOX_GEOCODING_URL}/{quote(address, safe='')}.json",
            params={
                "access_token": token,
                "limit": 1,
                "types": "address,poi",
                "country": "US",
            },
        )
        resp.raise_for_status()
        features = resp.json().get("features", [])
        if not features:
            return None, None
        lng, lat = features[0]["center"]
        return float(lat), float(lng)
    except Exception as exc:
        print(f"    Geocoding error for '{address}': {exc}")
        return None, None


async def backfill():
    """Backfill coordinates and geoJson on all courts missing them."""
    token = _get_mapbox_token()
    if not token:
        print("ERROR: No Mapbox token found. Set MAPBOX_ACCESS_TOKEN or NEXT_PUBLIC_MAPBOX_TOKEN.")
        sys.exit(1)

    async with AsyncSessionLocal() as session:
        # --- Phase 1: courts with lat/lng but no geoJson ---
        result = await session.execute(
            select(Court).where(
                Court.latitude.isnot(None),
                Court.longitude.isnot(None),
                or_(Court.geoJson.is_(None), Court.geoJson == ""),
            )
        )
        phase1_courts = result.scalars().all()
        print(f"Phase 1: {len(phase1_courts)} courts with lat/lng but missing geoJson")
        for court in phase1_courts:
            court.geoJson = _make_geojson(court.latitude, court.longitude)
        if phase1_courts:
            await session.flush()
            print(f"  → Set geoJson on {len(phase1_courts)} courts")

        # --- Phase 2: courts with no lat/lng — geocode via Mapbox ---
        result = await session.execute(
            select(Court).where(
                or_(Court.latitude.is_(None), Court.longitude.is_(None)),
                Court.address.isnot(None),
                Court.address != "",
            )
        )
        phase2_courts = result.scalars().all()
        print(f"Phase 2: {len(phase2_courts)} courts missing lat/lng (will geocode)")

        geocoded = 0
        failed = 0
        async with httpx.AsyncClient(timeout=10.0) as client:
            for court in phase2_courts:
                lat, lng = await _geocode(client, token, court.address)
                if lat is not None and lng is not None:
                    court.latitude = lat
                    court.longitude = lng
                    court.geoJson = _make_geojson(lat, lng)
                    geocoded += 1
                    print(f"  ✓ {court.name}: ({lat}, {lng})")
                else:
                    failed += 1
                    print(f"  ✗ {court.name}: geocoding failed for '{court.address}'")
                # Rate limit: ~10 req/s to stay well within Mapbox free tier
                time.sleep(0.1)

        if phase2_courts:
            await session.flush()
            print(f"  → Geocoded {geocoded}, failed {failed}")

        await session.commit()
        total = len(phase1_courts) + geocoded
        print(f"\nDone. Updated {total} courts total.")


if __name__ == "__main__":
    asyncio.run(backfill())
