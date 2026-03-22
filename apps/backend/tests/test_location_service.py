"""
Unit tests for location_service and geo_utils.

- find_closest_location: mock session, verify closest returned, None on empty
- get_all_location_distances: mock session, verify sorted order, empty list
- autocomplete: monkeypatch httpx.AsyncClient, short text early return, API errors
- calculate_distance_miles: pure math, no mocking needed
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import httpx

from backend.services.location_service import (
    find_closest_location,
    get_all_location_distances,
    autocomplete,
)
from backend.utils.geo_utils import calculate_distance_miles


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_location(loc_id: str, name: str, lat: float, lon: float) -> MagicMock:
    """Return a Location-like mock with id, name, latitude, longitude."""
    loc = MagicMock()
    loc.id = loc_id
    loc.name = name
    loc.latitude = lat
    loc.longitude = lon
    return loc


def _make_session_with_locations(locations: list) -> AsyncMock:
    """
    Return an AsyncSession mock whose execute() returns the given locations
    through the .scalars().all() chain.
    """
    scalars = MagicMock()
    scalars.all.return_value = locations

    execute_result = MagicMock()
    execute_result.scalars.return_value = scalars

    session = AsyncMock()
    session.execute = AsyncMock(return_value=execute_result)
    return session


# ---------------------------------------------------------------------------
# calculate_distance_miles (pure math)
# ---------------------------------------------------------------------------


def test_calculate_distance_same_point():
    """Distance from a point to itself is zero."""
    dist = calculate_distance_miles(34.0, -118.0, 34.0, -118.0)
    assert dist == pytest.approx(0.0, abs=1e-6)


def test_calculate_distance_known_cities():
    """
    LA (34.0522, -118.2437) to NYC (40.7128, -74.0060).
    Expected ~2444 miles (haversine).
    """
    dist = calculate_distance_miles(34.0522, -118.2437, 40.7128, -74.0060)
    assert 2400 < dist < 2500


def test_calculate_distance_is_symmetric():
    """distance(A, B) == distance(B, A)."""
    d1 = calculate_distance_miles(32.7, -117.1, 37.7, -122.4)
    d2 = calculate_distance_miles(37.7, -122.4, 32.7, -117.1)
    assert d1 == pytest.approx(d2, rel=1e-9)


# ---------------------------------------------------------------------------
# find_closest_location
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_find_closest_location_returns_closest():
    """Returns the location with the shortest haversine distance."""
    # San Diego coords — SD location should win over LA
    sd = _make_location("socal_sd", "San Diego", 32.7157, -117.1611)
    la = _make_location("socal_la", "Los Angeles", 34.0522, -118.2437)

    session = _make_session_with_locations([sd, la])

    # User near San Diego
    result = await find_closest_location(session, 32.72, -117.16)

    assert result is not None
    assert result["location_id"] == "socal_sd"
    assert result["distance_miles"] < 5.0


@pytest.mark.asyncio
async def test_find_closest_location_empty_returns_none():
    """Returns None when no locations exist in the database."""
    session = _make_session_with_locations([])

    result = await find_closest_location(session, 34.0, -118.0)

    assert result is None


@pytest.mark.asyncio
async def test_find_closest_location_db_error_returns_none():
    """Returns None (and does not raise) when the DB query throws."""
    session = AsyncMock()
    session.execute = AsyncMock(side_effect=Exception("connection lost"))

    result = await find_closest_location(session, 34.0, -118.0)

    assert result is None


# ---------------------------------------------------------------------------
# get_all_location_distances
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_all_location_distances_sorted():
    """Results are sorted by distance ascending."""
    far = _make_location("nyc", "New York", 40.7128, -74.0060)
    near = _make_location("sd", "San Diego", 32.7157, -117.1611)
    mid = _make_location("la", "Los Angeles", 34.0522, -118.2437)

    # Return in an unsorted order — should come back sorted
    session = _make_session_with_locations([far, near, mid])

    # User is in San Diego
    results = await get_all_location_distances(session, 32.72, -117.16)

    assert len(results) == 3
    distances = [r["distance_miles"] for r in results]
    assert distances == sorted(distances)
    assert results[0]["id"] == "sd"


@pytest.mark.asyncio
async def test_get_all_location_distances_empty():
    """Returns an empty list when no locations exist."""
    session = _make_session_with_locations([])

    results = await get_all_location_distances(session, 34.0, -118.0)

    assert results == []


@pytest.mark.asyncio
async def test_get_all_location_distances_includes_name_and_distance():
    """Each entry has id, name, and distance_miles keys."""
    loc = _make_location("socal_sd", "San Diego", 32.7157, -117.1611)
    session = _make_session_with_locations([loc])

    results = await get_all_location_distances(session, 32.7157, -117.1611)

    assert len(results) == 1
    entry = results[0]
    assert entry["id"] == "socal_sd"
    assert entry["name"] == "San Diego"
    assert "distance_miles" in entry


# ---------------------------------------------------------------------------
# autocomplete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_autocomplete_short_text_returns_empty():
    """Text shorter than 2 chars returns early with no HTTP call."""
    with patch("backend.services.location_service.httpx.AsyncClient") as mock_client_cls:
        result_empty = await autocomplete("")
        result_single = await autocomplete("a")
        result_whitespace = await autocomplete("  ")

    assert result_empty == {"features": []}
    assert result_single == {"features": []}
    assert result_whitespace == {"features": []}
    mock_client_cls.assert_not_called()


@pytest.mark.asyncio
async def test_autocomplete_returns_api_response(monkeypatch):
    """On success, returns the parsed JSON from Geoapify."""
    fake_response_data = {"features": [{"type": "Feature", "properties": {"city": "San Diego"}}]}

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = fake_response_data

    mock_get = AsyncMock(return_value=mock_response)

    mock_client = AsyncMock()
    mock_client.get = mock_get
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    monkeypatch.setenv("GEOAPIFY_API_KEY", "fake-key")

    with patch("backend.services.location_service.httpx.AsyncClient", return_value=mock_client):
        result = await autocomplete("San Diego")

    assert result == fake_response_data
    mock_get.assert_awaited_once()


@pytest.mark.asyncio
async def test_autocomplete_missing_api_key_raises(monkeypatch):
    """Raises when GEOAPIFY_API_KEY is not set."""
    monkeypatch.delenv("GEOAPIFY_API_KEY", raising=False)

    with pytest.raises(Exception):
        await autocomplete("San Diego")


@pytest.mark.asyncio
async def test_autocomplete_http_error_propagates(monkeypatch):
    """HTTP 4xx/5xx errors bubble up as httpx.HTTPStatusError."""
    mock_response = MagicMock()
    mock_response.status_code = 403
    mock_response.text = "Forbidden"

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(
        side_effect=httpx.HTTPStatusError(
            "403 Forbidden",
            request=MagicMock(),
            response=mock_response,
        )
    )
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    monkeypatch.setenv("GEOAPIFY_API_KEY", "fake-key")

    with patch("backend.services.location_service.httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(httpx.HTTPStatusError):
            await autocomplete("San Diego")
