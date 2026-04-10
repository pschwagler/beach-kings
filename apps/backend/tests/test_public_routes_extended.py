"""
Extended tests for public_routes — covers endpoints not tested in test_public_routes.py.

Already covered in test_public_routes.py:
  GET /api/public/players (with filters)
  GET /api/public/players/{player_id} — 404 only
  GET /api/public/leagues
  GET /api/public/leagues/{league_id} — 404 only
  GET /api/public/locations
  GET /api/public/locations/{slug} — 404 only
  GET /api/public/sitemap/leagues

Covered here (happy paths + remaining error cases):
  GET /api/public/leagues/{league_id} — happy path
  GET /api/public/players/{player_id} — happy path
  GET /api/public/locations/{slug} — happy path
  GET /api/public/sitemap/players
  GET /api/public/sitemap/locations
  GET /api/public/sitemap/courts
  GET /api/public/courts
  GET /api/public/courts/tags
  GET /api/public/courts/nearby
  GET /api/public/courts/{slug}
  GET /api/public/courts/{slug}/leaderboard
"""

import pytest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from backend.api.main import app


@pytest.fixture
def client():
    """Create a TestClient for the app."""
    return TestClient(app)


# ===========================================================================
# GET /api/public/leagues/{league_id} — happy path
# ===========================================================================


@patch("backend.services.public_service.get_public_league", new_callable=AsyncMock)
def test_get_league_returns_200(mock_get, client):
    """Returns 200 with league detail for a found league."""
    mock_get.return_value = {
        "id": 1,
        "name": "Sunset Beach League",
        "is_public": True,
        "gender": "mixed",
        "level": "intermediate",
        "member_count": 12,
        "creator_name": "Alice",
        "location": None,
        "description": "Best beach volleyball league",
        "members": [],
        "current_season": None,
        "standings": [],
        "recent_matches": [],
        "games_played": None,
    }

    response = client.get("/api/public/leagues/1")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == 1
    assert data["name"] == "Sunset Beach League"
    assert data["is_public"] is True


@patch("backend.services.public_service.get_public_league", new_callable=AsyncMock)
def test_get_private_league_returns_limited_data(mock_get, client):
    """Private leagues return limited info (no members/standings/recent_matches)."""
    mock_get.return_value = {
        "id": 2,
        "name": "Private League",
        "is_public": False,
        "gender": None,
        "level": None,
        "member_count": 5,
        "creator_name": "Bob",
        "location": None,
        "description": None,
        "members": None,
        "current_season": None,
        "standings": None,
        "recent_matches": None,
        "games_played": 40,
    }

    response = client.get("/api/public/leagues/2")
    assert response.status_code == 200
    data = response.json()
    assert data["is_public"] is False
    assert data["games_played"] == 40
    assert data["members"] is None


# ===========================================================================
# GET /api/public/players/{player_id} — happy path
# ===========================================================================


@patch("backend.services.public_service.get_public_player", new_callable=AsyncMock)
def test_get_player_returns_200(mock_get, client):
    """Returns 200 with player profile for a found player."""
    mock_get.return_value = {
        "id": 42,
        "full_name": "Jordan Smith",
        "avatar": None,
        "gender": "male",
        "level": "advanced",
        "is_placeholder": False,
        "location": None,
        "stats": {
            "current_rating": 1350.0,
            "total_games": 25,
            "total_wins": 18,
            "win_rate": 0.72,
        },
        "league_memberships": [{"league_id": 1, "league_name": "Sunset Beach League"}],
        "created_at": None,
        "updated_at": None,
    }

    response = client.get("/api/public/players/42")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == 42
    assert data["full_name"] == "Jordan Smith"
    assert data["stats"]["total_games"] == 25
    assert len(data["league_memberships"]) == 1


# ===========================================================================
# GET /api/public/locations/{slug} — happy path
# ===========================================================================


@patch("backend.services.public_service.get_public_location_by_slug", new_callable=AsyncMock)
def test_get_location_returns_200(mock_get, client):
    """Returns 200 with location detail for a found slug."""
    mock_get.return_value = {
        "id": "socal_sd",
        "name": "San Diego",
        "city": "San Diego",
        "state": "CA",
        "slug": "san-diego",
        "latitude": 32.72,
        "longitude": -117.15,
        "region": {"id": "socal", "name": "Southern California"},
        "leagues": [],
        "top_players": [],
        "courts": [],
        "stats": {
            "total_players": 100,
            "total_leagues": 5,
            "total_matches": 500,
            "total_courts": 8,
        },
    }

    response = client.get("/api/public/locations/san-diego")
    assert response.status_code == 200
    data = response.json()
    assert data["slug"] == "san-diego"
    assert data["stats"]["total_players"] == 100


# ===========================================================================
# GET /api/public/sitemap/players
# ===========================================================================


@patch("backend.services.public_service.get_sitemap_players", new_callable=AsyncMock)
def test_sitemap_players_returns_200(mock_sitemap, client):
    """GET /api/public/sitemap/players returns 200 with list of player items."""
    mock_sitemap.return_value = [
        {"id": 1, "full_name": "Alice", "updated_at": "2024-01-01"},
        {"id": 2, "full_name": "Bob", "updated_at": "2024-01-02"},
    ]

    response = client.get("/api/public/sitemap/players")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 2
    assert data[0]["id"] == 1
    assert data[0]["full_name"] == "Alice"


@patch("backend.services.public_service.get_sitemap_players", new_callable=AsyncMock)
def test_sitemap_players_error_returns_500(mock_sitemap, client):
    """Internal errors in sitemap/players return 500 with generic message."""
    mock_sitemap.side_effect = Exception("connection refused")

    response = client.get("/api/public/sitemap/players")
    assert response.status_code == 500
    assert "Internal server error" in response.json()["detail"]
    assert "connection refused" not in response.json()["detail"]


# ===========================================================================
# GET /api/public/sitemap/locations
# ===========================================================================


@patch("backend.services.public_service.get_sitemap_locations", new_callable=AsyncMock)
def test_sitemap_locations_returns_200(mock_sitemap, client):
    """GET /api/public/sitemap/locations returns 200 with location slugs."""
    mock_sitemap.return_value = [
        {"slug": "san-diego", "updated_at": "2024-01-01"},
        {"slug": "los-angeles", "updated_at": "2024-01-02"},
    ]

    response = client.get("/api/public/sitemap/locations")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert data[0]["slug"] == "san-diego"


@patch("backend.services.public_service.get_sitemap_locations", new_callable=AsyncMock)
def test_sitemap_locations_error_returns_500(mock_sitemap, client):
    """Internal errors in sitemap/locations return 500 with generic message."""
    mock_sitemap.side_effect = Exception("timeout")

    response = client.get("/api/public/sitemap/locations")
    assert response.status_code == 500
    assert "Internal server error" in response.json()["detail"]


# ===========================================================================
# GET /api/public/sitemap/courts
# ===========================================================================


@patch("backend.services.court_service.get_sitemap_courts", new_callable=AsyncMock)
def test_sitemap_courts_returns_200(mock_sitemap, client):
    """GET /api/public/sitemap/courts returns 200 with court slugs."""
    mock_sitemap.return_value = [
        {"slug": "mission-beach-courts", "updated_at": "2024-03-01"},
    ]

    response = client.get("/api/public/sitemap/courts")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert data[0]["slug"] == "mission-beach-courts"


@patch("backend.services.court_service.get_sitemap_courts", new_callable=AsyncMock)
def test_sitemap_courts_error_returns_500(mock_sitemap, client):
    """Internal errors in sitemap/courts return 500 with generic message."""
    mock_sitemap.side_effect = Exception("db error")

    response = client.get("/api/public/sitemap/courts")
    assert response.status_code == 500
    assert "Internal server error" in response.json()["detail"]
    assert "db error" not in response.json()["detail"]


# ===========================================================================
# GET /api/public/courts — paginated court listing
# ===========================================================================


@patch("backend.services.court_service.list_courts_public", new_callable=AsyncMock)
def test_list_courts_returns_200(mock_list, client):
    """GET /api/public/courts returns 200 with paginated courts."""
    mock_list.return_value = {
        "items": [
            {
                "id": 1,
                "name": "Mission Beach Courts",
                "slug": "mission-beach-courts",
                "address": "123 Ocean Front Walk",
                "surface_type": "sand",
                "average_rating": 4.5,
                "review_count": 10,
                "is_free": True,
                "has_lights": False,
                "court_count": 4,
                "top_tags": [],
                "thumbnail_url": None,
                "location_id": "socal_sd",
                "location_name": "San Diego",
                "location_slug": "san-diego",
                "latitude": 32.77,
                "longitude": -117.25,
                "distance_miles": None,
            }
        ],
        "total_count": 1,
        "page": 1,
        "page_size": 20,
    }

    response = client.get("/api/public/courts")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total_count" in data
    assert data["total_count"] == 1
    assert data["items"][0]["name"] == "Mission Beach Courts"


@patch("backend.services.court_service.list_courts_public", new_callable=AsyncMock)
def test_list_courts_with_filters(mock_list, client):
    """Query params are forwarded to court_service.list_courts_public."""
    mock_list.return_value = {"items": [], "total_count": 0, "page": 1, "page_size": 20}

    response = client.get(
        "/api/public/courts?region_id=socal&surface_type=sand&is_free=true&has_lights=true"
        "&min_rating=3.0&page=2&page_size=10"
    )
    assert response.status_code == 200
    mock_list.assert_called_once()
    call_kwargs = mock_list.call_args.kwargs
    assert call_kwargs.get("region_id") == "socal"
    assert call_kwargs.get("surface_type") == "sand"
    assert call_kwargs.get("is_free") is True
    assert call_kwargs.get("has_lights") is True
    assert call_kwargs.get("page") == 2
    assert call_kwargs.get("page_size") == 10


def test_list_courts_invalid_min_rating(client):
    """min_rating below 1 returns 422."""
    response = client.get("/api/public/courts?min_rating=0.5")
    assert response.status_code == 422


# ===========================================================================
# GET /api/public/courts/tags
# ===========================================================================


@patch("backend.services.court_service.get_all_tags", new_callable=AsyncMock)
def test_list_court_tags_returns_200(mock_tags, client):
    """GET /api/public/courts/tags returns 200 with tag list."""
    mock_tags.return_value = [
        {
            "id": 1,
            "name": "Well Maintained",
            "slug": "well-maintained",
            "category": "quality",
            "sort_order": 1,
        },
        {"id": 2, "name": "Good Vibes", "slug": "good-vibes", "category": "vibe", "sort_order": 2},
    ]

    response = client.get("/api/public/courts/tags")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 2
    assert data[0]["slug"] == "well-maintained"
    assert data[1]["category"] == "vibe"


@patch("backend.services.court_service.get_all_tags", new_callable=AsyncMock)
def test_list_court_tags_empty(mock_tags, client):
    """Returns empty list when no tags exist."""
    mock_tags.return_value = []

    response = client.get("/api/public/courts/tags")
    assert response.status_code == 200
    assert response.json() == []


# ===========================================================================
# GET /api/public/courts/nearby
# ===========================================================================


@patch("backend.services.court_service.get_nearby_courts", new_callable=AsyncMock)
def test_get_nearby_courts_returns_200(mock_nearby, client):
    """GET /api/public/courts/nearby returns 200 with nearby courts."""
    mock_nearby.return_value = [
        {
            "id": 3,
            "name": "Bondi Nets",
            "slug": "bondi-nets",
            "address": "1 Bondi Beach",
            "surface_type": "sand",
            "average_rating": 4.2,
            "review_count": 5,
            "distance_miles": 1.3,
            "latitude": 32.78,
            "longitude": -117.24,
        }
    ]

    response = client.get("/api/public/courts/nearby?lat=32.77&lng=-117.25")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert data[0]["name"] == "Bondi Nets"
    assert data[0]["distance_miles"] == 1.3


def test_get_nearby_courts_missing_lat_lng(client):
    """Omitting required lat/lng params returns 422."""
    response = client.get("/api/public/courts/nearby")
    assert response.status_code == 422


@patch("backend.services.court_service.get_nearby_courts", new_callable=AsyncMock)
def test_get_nearby_courts_radius_out_of_range(mock_nearby, client):
    """radius > 100 returns 422."""
    response = client.get("/api/public/courts/nearby?lat=32.77&lng=-117.25&radius=200")
    assert response.status_code == 422


@patch("backend.services.court_service.get_nearby_courts", new_callable=AsyncMock)
def test_get_nearby_courts_with_exclude(mock_nearby, client):
    """exclude param is forwarded to the service."""
    mock_nearby.return_value = []

    response = client.get("/api/public/courts/nearby?lat=32.77&lng=-117.25&exclude=5")
    assert response.status_code == 200
    mock_nearby.assert_called_once()
    call_kwargs = mock_nearby.call_args.kwargs
    assert call_kwargs.get("exclude_court_id") == 5


# ===========================================================================
# GET /api/public/courts/{slug} — court detail
# ===========================================================================


@patch("backend.services.court_service.get_court_by_slug", new_callable=AsyncMock)
def test_get_court_returns_200(mock_get, client):
    """GET /api/public/courts/{slug} returns 200 for a found court."""
    mock_get.return_value = {
        "id": 7,
        "name": "Pacific Beach Park Courts",
        "slug": "pacific-beach-park",
        "address": "1600 Ocean Blvd",
        "description": "Great nets, right on the beach.",
        "location_id": "socal_sd",
        "location_name": "San Diego",
        "location_slug": "san-diego",
        "court_count": 6,
        "surface_type": "sand",
        "is_free": True,
        "cost_info": None,
        "has_lights": True,
        "has_restrooms": True,
        "has_parking": False,
        "parking_info": None,
        "nets_provided": True,
        "hours": "Sunrise to sunset",
        "phone": None,
        "website": None,
        "latitude": 32.79,
        "longitude": -117.26,
        "average_rating": 4.8,
        "review_count": 22,
        "status": "approved",
        "is_active": True,
        "created_by": None,
        "reviews": [],
        "all_photos": [],
        "court_photos": [],
        "created_at": None,
        "updated_at": None,
    }

    response = client.get("/api/public/courts/pacific-beach-park")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == 7
    assert data["slug"] == "pacific-beach-park"
    assert data["average_rating"] == 4.8


@patch("backend.services.court_service.get_court_by_slug", new_callable=AsyncMock)
def test_get_court_not_found(mock_get, client):
    """Returns 404 for an unknown court slug."""
    mock_get.return_value = None

    response = client.get("/api/public/courts/does-not-exist")
    assert response.status_code == 404
    assert response.json()["detail"] == "Court not found"


# ===========================================================================
# GET /api/public/courts/{slug}/leaderboard
# ===========================================================================


@patch("backend.services.court_service.get_court_leaderboard", new_callable=AsyncMock)
@patch("backend.services.court_service.get_court_id_by_slug", new_callable=AsyncMock)
def test_get_court_leaderboard_returns_200(mock_id, mock_lb, client):
    """GET /api/public/courts/{slug}/leaderboard returns 200 with ranked players."""
    mock_id.return_value = 7  # court row / id
    mock_lb.return_value = [
        {
            "rank": 1,
            "player_id": 10,
            "player_name": "Alice",
            "avatar": None,
            "match_count": 30,
            "win_count": 22,
            "win_rate": 0.73,
        },
        {
            "rank": 2,
            "player_id": 11,
            "player_name": "Bob",
            "avatar": None,
            "match_count": 25,
            "win_count": 15,
            "win_rate": 0.60,
        },
    ]

    response = client.get("/api/public/courts/pacific-beach-park/leaderboard")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 2
    assert data[0]["rank"] == 1
    assert data[0]["player_name"] == "Alice"
    assert data[1]["win_rate"] == 0.60


@patch("backend.services.court_service.get_court_id_by_slug", new_callable=AsyncMock)
def test_get_court_leaderboard_not_found(mock_id, client):
    """Returns 404 when the court slug does not exist."""
    mock_id.return_value = None

    response = client.get("/api/public/courts/ghost-court/leaderboard")
    assert response.status_code == 404
    assert response.json()["detail"] == "Court not found"


@patch("backend.services.court_service.get_court_leaderboard", new_callable=AsyncMock)
@patch("backend.services.court_service.get_court_id_by_slug", new_callable=AsyncMock)
def test_get_court_leaderboard_empty(mock_id, mock_lb, client):
    """Returns 200 with empty list when court has no matches."""
    mock_id.return_value = 99
    mock_lb.return_value = []

    response = client.get("/api/public/courts/new-court/leaderboard")
    assert response.status_code == 200
    assert response.json() == []


# ===========================================================================
# Cache headers — spot check on a representative endpoint
# ===========================================================================


@patch("backend.services.public_service.get_sitemap_players", new_callable=AsyncMock)
def test_public_endpoints_set_cache_headers(mock_sitemap, client):
    """Public routes include Cache-Control headers for CDN caching."""
    mock_sitemap.return_value = []

    response = client.get("/api/public/sitemap/players")
    assert "Cache-Control" in response.headers
    cache_header = response.headers["Cache-Control"]
    assert "public" in cache_header
    assert "max-age=300" in cache_header
