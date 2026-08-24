"""
Unit tests for GET /api/users/me/stats.

Shape-contract tests: verify that the route enforces authentication,
checks for a linked player profile, surfaces service errors as 500,
and returns a well-formed MyStatsPayload on the happy path.

Database access is fully mocked — no real DB connection required.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.api.auth_dependencies import require_verified_player

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

USER_ID = 42
PLAYER_ID = 7
PHONE = "+10000000001"

FAKE_USER_WITH_PLAYER = {
    "id": USER_ID,
    "phone_number": PHONE,
    "name": "No Player",
    "email": "noplayer@example.com",
    "is_verified": True,
    "created_at": "2020-01-01T00:00:00Z",
    "player_id": PLAYER_ID,
}

MINIMAL_STATS_PAYLOAD = {
    "player_name": "Alice Smith",
    "player_city": "San Diego",
    "player_level": "A",
    "overall": {
        "wins": 10,
        "losses": 5,
        "games_played": 15,
        "rating": 1050,
        "peak_rating": 1100,
        "win_rate": 66.7,
        "current_streak": 3,
        "avg_point_diff": 2.4,
    },
    "trophies": [
        {
            "league_id": 1,
            "league_name": "SoCal League",
            "season_name": "Summer 2024",
            "place": 1,
        }
    ],
    "partners": [
        {
            "player_id": 99,
            "display_name": "B. Jones",
            "full_name": "Beatrice Jones",
            "initials": "BJ",
            "games_played": 8,
            "wins": 6,
            "losses": 2,
            "win_rate": 75.0,
        }
    ],
    "opponents": [],
    "elo_timeline": [
        {"date": "2024-06-01", "rating": 1000},
        {"date": "2024-07-15", "rating": 1050},
    ],
}


# ---------------------------------------------------------------------------
# Auth fixture
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _override_auth():
    """Override require_verified_player for all tests in this module."""

    async def _fake():
        return FAKE_USER_WITH_PLAYER

    app.dependency_overrides[require_verified_player] = _fake
    yield
    app.dependency_overrides.pop(require_verified_player, None)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestGetMyStatsRoute:
    """Tests for GET /api/users/me/stats."""

    # -- Auth guard ----------------------------------------------------------

    def test_unauthenticated_returns_401(self):
        """Request without a token must be rejected with 401."""
        app.dependency_overrides.pop(require_verified_player, None)
        client = TestClient(app)
        response = client.get("/api/users/me/stats")
        assert response.status_code in (401, 403)

    # -- Happy path (shape-contract) -----------------------------------------

    def test_happy_path_shape_contract(self):
        """
        Authenticated user with a player profile receives a well-formed
        MyStatsPayload with all required top-level keys and correct sub-shapes.
        """
        client = TestClient(app)

        with patch(
            "backend.services.stats.my_stats_service.get_my_stats",
            new=AsyncMock(return_value=MINIMAL_STATS_PAYLOAD),
        ):
            response = client.get("/api/users/me/stats", headers={"Authorization": "Bearer dummy"})

        assert response.status_code == 200
        data = response.json()

        # Top-level keys
        assert "player_name" in data
        assert "overall" in data
        assert "trophies" in data
        assert "partners" in data
        assert "opponents" in data
        assert "elo_timeline" in data

        # overall sub-shape
        overall = data["overall"]
        for key in (
            "wins",
            "losses",
            "games_played",
            "rating",
            "peak_rating",
            "win_rate",
            "current_streak",
            "avg_point_diff",
        ):
            assert key in overall, f"Missing overall key: {key}"

        # trophies sub-shape
        assert isinstance(data["trophies"], list)
        if data["trophies"]:
            trophy = data["trophies"][0]
            for key in ("league_id", "league_name", "season_name", "place"):
                assert key in trophy, f"Missing trophy key: {key}"

        # partner/opponent sub-shape (no rating_diff)
        assert isinstance(data["partners"], list)
        if data["partners"]:
            partner = data["partners"][0]
            for key in (
                "player_id",
                "display_name",
                "full_name",
                "initials",
                "games_played",
                "wins",
                "losses",
                "win_rate",
            ):
                assert key in partner, f"Missing partner key: {key}"
            assert "rating_diff" not in partner, "rating_diff must not be present"
            assert partner["display_name"] == "B. Jones"
            assert partner["full_name"] == "Beatrice Jones"

        # elo_timeline sub-shape
        assert isinstance(data["elo_timeline"], list)
        if data["elo_timeline"]:
            point = data["elo_timeline"][0]
            assert "date" in point
            assert "rating" in point

        # Spot-check values round-trip correctly
        assert data["player_name"] == "Alice Smith"
        assert data["overall"]["wins"] == 10
        assert data["trophies"][0]["place"] == 1

    # -- Service error -------------------------------------------------------

    def test_service_exception_returns_500(self):
        """Unhandled service exception must surface as a 500 response."""
        client = TestClient(app)

        with patch(
            "backend.services.stats.my_stats_service.get_my_stats",
            new=AsyncMock(side_effect=RuntimeError("DB exploded")),
        ):
            response = client.get("/api/users/me/stats", headers={"Authorization": "Bearer dummy"})

        assert response.status_code == 500

    # -- Query params (P3.5) -------------------------------------------------

    def test_query_params_passed_to_service(self):
        """Route must forward league_id and days kwargs to the service."""
        client = TestClient(app)
        mock = AsyncMock(return_value=MINIMAL_STATS_PAYLOAD)

        with patch("backend.services.stats.my_stats_service.get_my_stats", new=mock):
            response = client.get(
                "/api/users/me/stats?league_id=42&days=30",
                headers={"Authorization": "Bearer dummy"},
            )

        assert response.status_code == 200
        kwargs = mock.await_args.kwargs
        assert kwargs.get("league_id") == 42
        assert kwargs.get("days") == 30
        assert kwargs.get("player_id") == PLAYER_ID

    def test_no_query_params_passes_none(self):
        """When neither query param is set, service receives league_id=None and days=None."""
        client = TestClient(app)
        mock = AsyncMock(return_value=MINIMAL_STATS_PAYLOAD)

        with patch("backend.services.stats.my_stats_service.get_my_stats", new=mock):
            response = client.get("/api/users/me/stats", headers={"Authorization": "Bearer dummy"})

        assert response.status_code == 200
        kwargs = mock.await_args.kwargs
        assert kwargs.get("league_id") is None
        assert kwargs.get("days") is None

    @pytest.mark.parametrize("days", [0, -5, 10000])
    def test_invalid_days_returns_422(self, days):
        """days outside [1, 3650] must be rejected by Query validators."""
        client = TestClient(app)
        with patch(
            "backend.services.stats.my_stats_service.get_my_stats",
            new=AsyncMock(return_value=MINIMAL_STATS_PAYLOAD),
        ):
            response = client.get(
                f"/api/users/me/stats?days={days}", headers={"Authorization": "Bearer dummy"}
            )
        assert response.status_code == 422

    def test_non_int_league_id_returns_422(self):
        """Non-integer league_id must be rejected."""
        client = TestClient(app)
        with patch(
            "backend.services.stats.my_stats_service.get_my_stats",
            new=AsyncMock(return_value=MINIMAL_STATS_PAYLOAD),
        ):
            response = client.get(
                "/api/users/me/stats?league_id=not-a-number",
                headers={"Authorization": "Bearer dummy"},
            )
        assert response.status_code == 422
