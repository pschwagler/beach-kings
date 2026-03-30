"""
Geo resolution for sessions.

Determines latitude, longitude, and location_id for a session based on
a priority chain: court → league home court → browser geolocation →
player city → null. Never raises — returns nulls on any failure so that
session creation is never blocked by geo resolution.
"""

import logging
from typing import Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import Court, LeagueHomeCourt, Player
from backend.services.location_service import find_closest_location

logger = logging.getLogger(__name__)


async def resolve_session_geo(
    db_session: AsyncSession,
    court_id: Optional[int] = None,
    league_id: Optional[int] = None,
    browser_lat: Optional[float] = None,
    browser_lon: Optional[float] = None,
    creator_player_id: Optional[int] = None,
) -> Tuple[Optional[float], Optional[float], Optional[str]]:
    """
    Resolve geo coordinates and location hub for a session.

    Priority chain (first non-null lat/lng wins):
        1. court_id → court.latitude / court.longitude
        2. league_id → LeagueHomeCourt position=0 → court lat/lng
        3. browser_lat / browser_lon (from frontend geolocation)
        4. creator_player_id → player.city_latitude / city_longitude
        5. None — all fields stay null

    Once lat/lng are resolved, calls find_closest_location() to determine
    the nearest location hub (within 50mi cap).

    Returns:
        (latitude, longitude, location_id) — any or all may be None.
    """
    try:
        lat, lon = await _resolve_coords(
            db_session, court_id, league_id, browser_lat, browser_lon, creator_player_id
        )

        if lat is None or lon is None:
            return (None, None, None)

        location_result = await find_closest_location(db_session, lat, lon)
        location_id = location_result["location_id"] if location_result else None

        return (lat, lon, location_id)

    except Exception as e:
        logger.warning("Geo resolution failed, session will have null geo: %s", e, exc_info=True)
        return (None, None, None)


async def _resolve_coords(
    db_session: AsyncSession,
    court_id: Optional[int],
    league_id: Optional[int],
    browser_lat: Optional[float],
    browser_lon: Optional[float],
    creator_player_id: Optional[int],
) -> Tuple[Optional[float], Optional[float]]:
    """
    Walk the priority chain and return the first non-null (lat, lon) pair.
    """
    # 1. Explicit court
    if court_id is not None:
        result = await db_session.execute(
            select(Court.latitude, Court.longitude).where(Court.id == court_id)
        )
        row = result.one_or_none()
        if row and row.latitude is not None and row.longitude is not None:
            return (row.latitude, row.longitude)

    # 2. League home court (position=0)
    if league_id is not None:
        result = await db_session.execute(
            select(Court.latitude, Court.longitude)
            .join(LeagueHomeCourt, LeagueHomeCourt.court_id == Court.id)
            .where(LeagueHomeCourt.league_id == league_id)
            .order_by(LeagueHomeCourt.position.asc())
            .limit(1)
        )
        row = result.one_or_none()
        if row and row.latitude is not None and row.longitude is not None:
            return (row.latitude, row.longitude)

    # 3. Browser geolocation
    if browser_lat is not None and browser_lon is not None:
        return (browser_lat, browser_lon)

    # 4. Creator's player city
    if creator_player_id is not None:
        result = await db_session.execute(
            select(Player.city_latitude, Player.city_longitude).where(
                Player.id == creator_player_id
            )
        )
        row = result.one_or_none()
        if row and row.city_latitude is not None and row.city_longitude is not None:
            return (row.city_latitude, row.city_longitude)

    # 5. Nothing available
    return (None, None)
