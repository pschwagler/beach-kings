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


@patch("backend.services.public.public_service.search_public_players", new_callable=AsyncMock)
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


@patch("backend.services.public.public_service.search_public_players", new_callable=AsyncMock)
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
    assert call_kwargs.kwargs.get("search") == "alice"


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


@patch("backend.services.public.public_service.get_public_player", new_callable=AsyncMock)
def test_get_player_not_found(mock_get, client):
    """Returns 404 for nonexistent player."""
    mock_get.return_value = None

    response = client.get("/api/public/players/99999")
    assert response.status_code == 404


# Fix A: HTTP-level privacy tests — verify the route does NOT 500 on private players
# and that privacy flag fields are included in the serialised response.

_PRIVATE_PLAYER_SERVICE_DICT = {
    "id": 7,
    "full_name": "Private Person",
    "avatar": "PP",
    "gender": "male",
    "level": "advanced",
    "city": "Hidden City",
    "state": "CA",
    "is_placeholder": False,
    "location": None,
    "stats": {
        # New privacy model: rating + games always visible; only W-L hidden
        "current_rating": 1200.0,
        "total_games": 10,
        "total_wins": None,
        "win_rate": None,
    },
    # League memberships always populated regardless of show_game_history
    "league_memberships": [{"league_id": 3, "league_name": "Hidden League"}],
    "game_history_visible": False,
    "profile_is_private": True,
    "created_at": "2024-01-01T00:00:00",
    "updated_at": "2024-01-01T00:00:00",
}

_PUBLIC_PLAYER_SERVICE_DICT = {
    "id": 8,
    "full_name": "Public Person",
    "avatar": "PU",
    "gender": "female",
    "level": "intermediate",
    "city": "Beach City",
    "state": "CA",
    "is_placeholder": False,
    "location": None,
    "stats": {
        "current_rating": 1450.0,
        "total_games": 20,
        "total_wins": 12,
        "win_rate": 0.6,
    },
    "league_memberships": [],
    "game_history_visible": True,
    "profile_is_private": False,
    "created_at": "2024-01-01T00:00:00",
    "updated_at": "2024-01-01T00:00:00",
}


@patch("backend.services.public.public_service.get_public_player", new_callable=AsyncMock)
def test_get_private_player_returns_200_not_500(mock_get, client):
    """
    GET /api/public/players/{id} for a private player must return 200, not 500.

    The service returns None for current_rating/total_wins/win_rate when the
    profile is private.  Before Fix A the response_model rejected those None
    values (non-Optional fields) causing a ResponseValidationError -> 500.
    """
    mock_get.return_value = _PRIVATE_PLAYER_SERVICE_DICT

    response = client.get("/api/public/players/7")
    assert response.status_code == 200, (
        f"Expected 200 but got {response.status_code}; body: {response.text}"
    )


@patch("backend.services.public.public_service.get_public_player", new_callable=AsyncMock)
def test_get_private_player_stats_are_null(mock_get, client):
    """
    New privacy model: only total_wins and win_rate are null for show_game_history=False.

    current_rating and total_games remain visible regardless of game-history flag.
    """
    mock_get.return_value = _PRIVATE_PLAYER_SERVICE_DICT

    data = client.get("/api/public/players/7").json()

    # Rating and game count are always visible
    assert data["stats"]["current_rating"] == 1200.0, (
        "current_rating must remain visible even when show_game_history=False"
    )
    assert data["stats"]["total_games"] == 10
    # W-L record is hidden when show_game_history=False
    assert data["stats"]["total_wins"] is None
    assert data["stats"]["win_rate"] is None


@patch("backend.services.public.public_service.get_public_player", new_callable=AsyncMock)
def test_get_private_player_privacy_flags_in_response(mock_get, client):
    """game_history_visible and profile_is_private are serialised in the response."""
    mock_get.return_value = _PRIVATE_PLAYER_SERVICE_DICT

    data = client.get("/api/public/players/7").json()

    assert data["game_history_visible"] is False
    assert data["profile_is_private"] is True


@patch("backend.services.public.public_service.get_public_player", new_callable=AsyncMock)
def test_get_private_player_city_state_in_response(mock_get, client):
    """city and state top-level fields are serialised in the response."""
    mock_get.return_value = _PRIVATE_PLAYER_SERVICE_DICT

    data = client.get("/api/public/players/7").json()

    assert data["city"] == "Hidden City"
    assert data["state"] == "CA"


@patch("backend.services.public.public_service.get_public_player", new_callable=AsyncMock)
def test_get_private_player_league_memberships_always_present(mock_get, client):
    """
    league_memberships must be populated even when game_history_visible=False.

    Under the new privacy model only W-L is gated on show_game_history;
    league memberships remain visible so the player directory is useful.
    """
    mock_get.return_value = _PRIVATE_PLAYER_SERVICE_DICT

    data = client.get("/api/public/players/7").json()

    assert "league_memberships" in data
    assert len(data["league_memberships"]) == 1, (
        "league_memberships must not be suppressed when show_game_history=False"
    )
    assert data["league_memberships"][0]["league_name"] == "Hidden League"


@patch("backend.services.public.public_service.get_public_player", new_callable=AsyncMock)
def test_get_public_player_privacy_flags_in_response(mock_get, client):
    """Public player response includes game_history_visible=True, profile_is_private=False."""
    mock_get.return_value = _PUBLIC_PLAYER_SERVICE_DICT

    data = client.get("/api/public/players/8").json()

    assert data["game_history_visible"] is True
    assert data["profile_is_private"] is False
    assert data["stats"]["current_rating"] == 1450.0
    assert data["stats"]["total_wins"] == 12
    assert data["stats"]["win_rate"] == 0.6
    assert data["city"] == "Beach City"
    assert data["state"] == "CA"


# ============================================================================
# GET /api/public/leagues
# ============================================================================


@patch("backend.services.public.public_service.get_public_leagues", new_callable=AsyncMock)
def test_list_leagues_returns_200(mock_list, client):
    """GET /api/public/leagues returns 200."""
    mock_list.return_value = {"items": [], "total_count": 0, "page": 1, "page_size": 25}

    response = client.get("/api/public/leagues")
    assert response.status_code == 200


# ============================================================================
# GET /api/public/leagues/{league_id}
# ============================================================================


@patch("backend.services.public.public_service.get_public_league", new_callable=AsyncMock)
def test_get_league_not_found(mock_get, client):
    """Returns 404 for nonexistent league."""
    mock_get.return_value = None

    response = client.get("/api/public/leagues/99999")
    assert response.status_code == 404


# ============================================================================
# GET /api/public/locations
# ============================================================================


@patch("backend.services.public.public_service.get_public_locations", new_callable=AsyncMock)
def test_list_locations_returns_200(mock_list, client):
    """GET /api/public/locations returns 200."""
    mock_list.return_value = []

    response = client.get("/api/public/locations")
    assert response.status_code == 200


# ============================================================================
# GET /api/public/locations/{slug}
# ============================================================================


@patch(
    "backend.services.public.public_service.get_public_location_by_slug", new_callable=AsyncMock
)
def test_get_location_not_found(mock_get, client):
    """Returns 404 for nonexistent slug."""
    mock_get.return_value = None

    response = client.get("/api/public/locations/nonexistent")
    assert response.status_code == 404


# ============================================================================
# Sitemap endpoints
# ============================================================================


@patch("backend.services.public.public_service.get_sitemap_leagues", new_callable=AsyncMock)
def test_sitemap_leagues_returns_200(mock_sitemap, client):
    """GET /api/public/sitemap/leagues returns 200."""
    mock_sitemap.return_value = []

    response = client.get("/api/public/sitemap/leagues")
    assert response.status_code == 200


@patch("backend.services.public.public_service.get_sitemap_leagues", new_callable=AsyncMock)
def test_sitemap_leagues_error_returns_500(mock_sitemap, client):
    """Internal errors return 500 with generic message (no leak)."""
    mock_sitemap.side_effect = Exception("database crashed")

    response = client.get("/api/public/sitemap/leagues")
    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "internal_error"
    assert response.json()["detail"]["request_id"]
    # Ensure the actual error message is NOT exposed
    assert "database crashed" not in response.text
