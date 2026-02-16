"""
Mapbox Geocoding API client.

Geocodes an address string to (latitude, longitude) coordinates.
Falls back to (None, None) on any failure so court creation is never blocked.
"""

import logging
import os
from typing import Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

MAPBOX_GEOCODING_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places"


def _get_mapbox_token() -> Optional[str]:
    """Read the Mapbox access token from the environment."""
    return os.environ.get("MAPBOX_ACCESS_TOKEN")


async def geocode_address(address: str) -> Tuple[Optional[float], Optional[float]]:
    """
    Geocode an address string to (latitude, longitude) using the Mapbox Geocoding API.

    Args:
        address: Free-form address string (e.g., "123 Main St, New York, NY 10001")

    Returns:
        Tuple of (latitude, longitude) or (None, None) if geocoding fails.
    """
    token = _get_mapbox_token()
    if not token:
        logger.warning("MAPBOX_ACCESS_TOKEN not set — skipping geocoding")
        return None, None

    try:
        url = f"{MAPBOX_GEOCODING_URL}/{httpx.URL(address).raw_path or address}.json"
        # Use the search endpoint correctly
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{MAPBOX_GEOCODING_URL}/{address}.json",
                params={
                    "access_token": token,
                    "limit": 1,
                    "types": "address,poi",
                    "country": "US",
                },
            )
            resp.raise_for_status()
            data = resp.json()

        features = data.get("features", [])
        if not features:
            logger.info("Geocoding returned no results for: %s", address)
            return None, None

        # Mapbox returns [longitude, latitude]
        lng, lat = features[0]["center"]
        return float(lat), float(lng)

    except Exception:
        logger.warning("Geocoding failed for address: %s", address, exc_info=True)
        return None, None
