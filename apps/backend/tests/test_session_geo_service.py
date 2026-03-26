"""
Unit tests for session_geo_service.resolve_session_geo.

Tests the 5-level priority chain:
1. court_id → court coords
2. league_id → league home court (position=0) → court coords
3. browser geolocation
4. creator player city coords
5. None — all null

Also tests: exception suppression, 50-mile cap passthrough.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.services.session_geo_service import resolve_session_geo


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_db_row(lat, lon, city_lat=None, city_lon=None):
    """Return a mock row object with latitude/longitude (and optionally city coords)."""
    row = MagicMock()
    row.latitude = lat
    row.longitude = lon
    row.city_latitude = city_lat
    row.city_longitude = city_lon
    return row


def _make_db_session_returning(rows_by_call):
    """
    Build an AsyncSession mock where each successive .execute() call
    returns a different .one_or_none() result from rows_by_call list.
    """
    db = AsyncMock()
    results = []
    for row in rows_by_call:
        result_mock = MagicMock()
        result_mock.one_or_none.return_value = row
        results.append(result_mock)
    db.execute = AsyncMock(side_effect=results)
    return db


# ---------------------------------------------------------------------------
# Priority 1: court_id with coords
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_court_with_coords():
    """When court_id is set and court has lat/lng, use court coords."""
    court_row = _mock_db_row(40.7471, -73.9256)
    db = _make_db_session_returning([court_row])

    with patch(
        "backend.services.session_geo_service.find_closest_location",
        new_callable=AsyncMock,
        return_value={"location_id": "ny_nyc", "distance_miles": 2.5},
    ):
        lat, lon, loc_id = await resolve_session_geo(db, court_id=5)

    assert lat == 40.7471
    assert lon == -73.9256
    assert loc_id == "ny_nyc"


@pytest.mark.asyncio
async def test_court_without_coords_falls_through_to_browser():
    """When court exists but has null coords, fall through to browser."""
    court_row = _mock_db_row(None, None)
    db = _make_db_session_returning([court_row])

    with patch(
        "backend.services.session_geo_service.find_closest_location",
        new_callable=AsyncMock,
        return_value={"location_id": "socal_sd", "distance_miles": 3.0},
    ):
        lat, lon, loc_id = await resolve_session_geo(
            db, court_id=5, browser_lat=32.72, browser_lon=-117.16
        )

    assert lat == 32.72
    assert lon == -117.16
    assert loc_id == "socal_sd"


# ---------------------------------------------------------------------------
# Priority 2: league home court
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_league_home_court():
    """When no court_id but league has a home court, use home court coords."""
    home_court_row = _mock_db_row(40.7471, -73.9256)
    db = _make_db_session_returning([home_court_row])

    with patch(
        "backend.services.session_geo_service.find_closest_location",
        new_callable=AsyncMock,
        return_value={"location_id": "ny_nyc", "distance_miles": 2.5},
    ):
        lat, lon, loc_id = await resolve_session_geo(db, league_id=1)

    assert lat == 40.7471
    assert lon == -73.9256
    assert loc_id == "ny_nyc"


@pytest.mark.asyncio
async def test_league_no_home_court_falls_through():
    """When league has no home court, fall through to browser coords."""
    db = _make_db_session_returning([None])  # no home court row

    with patch(
        "backend.services.session_geo_service.find_closest_location",
        new_callable=AsyncMock,
        return_value={"location_id": "socal_la", "distance_miles": 5.0},
    ):
        lat, lon, loc_id = await resolve_session_geo(
            db, league_id=1, browser_lat=34.05, browser_lon=-118.24
        )

    assert lat == 34.05
    assert lon == -118.24
    assert loc_id == "socal_la"


# ---------------------------------------------------------------------------
# Priority 3: browser geolocation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_browser_geolocation():
    """When only browser coords provided, use them."""
    db = AsyncMock()
    db.execute = AsyncMock()  # should not be called

    with patch(
        "backend.services.session_geo_service.find_closest_location",
        new_callable=AsyncMock,
        return_value={"location_id": "socal_sd", "distance_miles": 1.0},
    ):
        lat, lon, loc_id = await resolve_session_geo(
            db, browser_lat=32.72, browser_lon=-117.16
        )

    assert lat == 32.72
    assert lon == -117.16
    assert loc_id == "socal_sd"


# ---------------------------------------------------------------------------
# Priority 4: creator player city
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_player_city_coords():
    """When no other geo source, use player's city coords."""
    player_row = _mock_db_row(None, None, city_lat=34.05, city_lon=-118.24)
    db = _make_db_session_returning([player_row])

    with patch(
        "backend.services.session_geo_service.find_closest_location",
        new_callable=AsyncMock,
        return_value={"location_id": "socal_la", "distance_miles": 4.0},
    ):
        lat, lon, loc_id = await resolve_session_geo(db, creator_player_id=42)

    assert lat == 34.05
    assert lon == -118.24
    assert loc_id == "socal_la"


@pytest.mark.asyncio
async def test_player_without_city_coords():
    """When player has no city coords, return all nulls."""
    player_row = _mock_db_row(None, None, city_lat=None, city_lon=None)
    db = _make_db_session_returning([player_row])

    lat, lon, loc_id = await resolve_session_geo(db, creator_player_id=42)

    assert lat is None
    assert lon is None
    assert loc_id is None


# ---------------------------------------------------------------------------
# Priority 5: nothing available
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_no_geo_sources():
    """When nothing provided, return all nulls."""
    db = AsyncMock()

    lat, lon, loc_id = await resolve_session_geo(db)

    assert lat is None
    assert lon is None
    assert loc_id is None


# ---------------------------------------------------------------------------
# find_closest_location returns None (beyond 50mi cap)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_location_beyond_cap_returns_null_location_id():
    """When find_closest_location returns None (>50mi), location_id is None but coords kept."""
    db = AsyncMock()

    with patch(
        "backend.services.session_geo_service.find_closest_location",
        new_callable=AsyncMock,
        return_value=None,
    ):
        lat, lon, loc_id = await resolve_session_geo(
            db, browser_lat=45.0, browser_lon=-110.0
        )

    assert lat == 45.0
    assert lon == -110.0
    assert loc_id is None


# ---------------------------------------------------------------------------
# Exception suppression
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_exception_returns_nulls():
    """Any exception in geo resolution returns nulls, never raises."""
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=Exception("connection lost"))

    lat, lon, loc_id = await resolve_session_geo(db, court_id=5)

    assert lat is None
    assert lon is None
    assert loc_id is None


# ---------------------------------------------------------------------------
# Court wins over league home court
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_court_wins_over_league():
    """When both court_id and league_id provided, court coords win."""
    court_row = _mock_db_row(32.72, -117.16)
    db = _make_db_session_returning([court_row])

    with patch(
        "backend.services.session_geo_service.find_closest_location",
        new_callable=AsyncMock,
        return_value={"location_id": "socal_sd", "distance_miles": 1.0},
    ):
        lat, lon, loc_id = await resolve_session_geo(
            db, court_id=5, league_id=1, browser_lat=40.0, browser_lon=-74.0
        )

    assert lat == 32.72
    assert lon == -117.16
    assert loc_id == "socal_sd"
