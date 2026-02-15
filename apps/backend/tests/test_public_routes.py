"""
Tests for public_routes — HTTP-level tests for the public API endpoints.

Uses FastAPI TestClient to verify status codes, response shapes,
and error handling without needing a real database.
"""

import pytest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from backend.api.main import app


@pytest.fixture
def client():
    """Create a TestClient for the app."""
    return TestClient(app)


# ============================================================================
# GET /api/public/players (search)
# ============================================================================


@patch("backend.services.public_service.search_public_players", new_callable=AsyncMock)
def test_search_players_returns_200(mock_search, client):
    """GET /api/public/players returns 200 with paginated response."""
    mock_search.return_value = {
        "items": [{"id": 1, "full_name": "Test Player"}],
        "total_count": 1,
        "page": 1,
        "page_size": 25,
    }

    response = client.get("/api/public/players")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total_count" in data


@patch("backend.services.public_service.search_public_players", new_callable=AsyncMock)
def test_search_players_with_filters(mock_search, client):
    """Query params are forwarded to the service."""
    mock_search.return_value = {"items": [], "total_count": 0, "page": 1, "page_size": 25}

    response = client.get(
        "/api/public/players?search=alice&gender=female&level=advanced&page=2&page_size=10"
    )
    assert response.status_code == 200
    mock_search.assert_called_once()
    call_kwargs = mock_search.call_args
    # Verify params were passed through
    assert call_kwargs.kwargs.get("search") == "alice" or call_kwargs[1].get("search") == "alice"


def test_search_players_invalid_page(client):
    """Invalid page param returns 422."""
    response = client.get("/api/public/players?page=0")
    assert response.status_code == 422


def test_search_players_invalid_page_size(client):
    """Page size > 100 returns 422."""
    response = client.get("/api/public/players?page_size=200")
    assert response.status_code == 422


# ============================================================================
# GET /api/public/players/{player_id}
# ============================================================================


@patch("backend.services.public_service.get_public_player", new_callable=AsyncMock)
def test_get_player_not_found(mock_get, client):
    """Returns 404 for nonexistent player."""
    mock_get.return_value = None

    response = client.get("/api/public/players/99999")
    assert response.status_code == 404


# ============================================================================
# GET /api/public/leagues
# ============================================================================


@patch("backend.services.public_service.get_public_leagues", new_callable=AsyncMock)
def test_list_leagues_returns_200(mock_list, client):
    """GET /api/public/leagues returns 200."""
    mock_list.return_value = {"items": [], "total_count": 0, "page": 1, "page_size": 25}

    response = client.get("/api/public/leagues")
    assert response.status_code == 200


# ============================================================================
# GET /api/public/leagues/{league_id}
# ============================================================================


@patch("backend.services.public_service.get_public_league", new_callable=AsyncMock)
def test_get_league_not_found(mock_get, client):
    """Returns 404 for nonexistent league."""
    mock_get.return_value = None

    response = client.get("/api/public/leagues/99999")
    assert response.status_code == 404


# ============================================================================
# GET /api/public/locations
# ============================================================================


@patch("backend.services.public_service.get_public_locations", new_callable=AsyncMock)
def test_list_locations_returns_200(mock_list, client):
    """GET /api/public/locations returns 200."""
    mock_list.return_value = []

    response = client.get("/api/public/locations")
    assert response.status_code == 200


# ============================================================================
# GET /api/public/locations/{slug}
# ============================================================================


@patch("backend.services.public_service.get_public_location_by_slug", new_callable=AsyncMock)
def test_get_location_not_found(mock_get, client):
    """Returns 404 for nonexistent slug."""
    mock_get.return_value = None

    response = client.get("/api/public/locations/nonexistent")
    assert response.status_code == 404


# ============================================================================
# Sitemap endpoints
# ============================================================================


@patch("backend.services.public_service.get_sitemap_leagues", new_callable=AsyncMock)
def test_sitemap_leagues_returns_200(mock_sitemap, client):
    """GET /api/public/sitemap/leagues returns 200."""
    mock_sitemap.return_value = []

    response = client.get("/api/public/sitemap/leagues")
    assert response.status_code == 200


@patch("backend.services.public_service.get_sitemap_leagues", new_callable=AsyncMock)
def test_sitemap_leagues_error_returns_500(mock_sitemap, client):
    """Internal errors return 500 with generic message (no leak)."""
    mock_sitemap.side_effect = Exception("database crashed")

    response = client.get("/api/public/sitemap/leagues")
    assert response.status_code == 500
    assert "Internal server error" in response.json()["detail"]
    # Ensure the actual error message is NOT exposed
    assert "database crashed" not in response.json()["detail"]
