"""
Unit tests for GET /api/users/me/games.

Shape-contract tests: verifies that the route enforces authentication,
checks for a linked player profile, surfaces service errors as 500,
and returns a well-formed MyGamesResponse on the happy path.

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
PHONE = "+10000000002"

FAKE_USER_WITH_PLAYER = {
    "id": USER_ID,
    "phone_number": PHONE,
    "name": "No Player",
    "email": "nogames@example.com",
    "is_verified": True,
    "created_at": "2020-01-01T00:00:00Z",
    "player_id": PLAYER_ID,
}

MINIMAL_GAMES_RESPONSE = {
    "games": [
        {
            "id": 101,
            "session_id": 1,
            "court_label": "QBK Sports",
            "league_name": "Open Men",
            "league_id": 1,
            "result": "W",
            "my_score": 21,
            "opponent_score": 18,
            "partner_names": ["K. Fawwar"],
            "opponent_names": ["A. Marthey", "J. Zwyczca"],
            "rating_change": 4,
            "session_submitted": True,
        }
    ],
    "total": 1,
}

EMPTY_GAMES_RESPONSE = {"games": [], "total": 0}

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


class TestGetMyGamesRoute:
    """Tests for GET /api/users/me/games."""

    # -- Auth guard ----------------------------------------------------------

    def test_unauthenticated_returns_401(self):
        """Request without a token must be rejected with 401."""
        app.dependency_overrides.pop(require_verified_player, None)
        client = TestClient(app)
        response = client.get("/api/users/me/games")
        assert response.status_code == 401

    # -- Happy path (shape-contract) -----------------------------------------

    def test_happy_path_shape_contract(self):
        """
        Authenticated user with a player profile receives a well-formed
        response with games list and total count.
        """
        client = TestClient(app)

        with patch(
            "backend.services.my_games_service.get_my_games",
            new=AsyncMock(return_value=([MINIMAL_GAMES_RESPONSE["games"][0]], 1)),
        ):
            response = client.get("/api/users/me/games", headers={"Authorization": "Bearer dummy"})

        assert response.status_code == 200
        data = response.json()

        assert "games" in data
        assert "total" in data
        assert data["total"] == 1
        assert isinstance(data["games"], list)
        assert len(data["games"]) == 1

        game = data["games"][0]
        required_keys = (
            "id",
            "session_id",
            "court_label",
            "league_name",
            "league_id",
            "result",
            "my_score",
            "opponent_score",
            "partner_names",
            "opponent_names",
            "rating_change",
            "session_submitted",
        )
        for key in required_keys:
            assert key in game, f"Missing game key: {key}"

        assert game["result"] in ("W", "L", "D")
        assert isinstance(game["partner_names"], list)
        assert isinstance(game["opponent_names"], list)

    def test_happy_path_values_round_trip(self):
        """Values from the service are returned unchanged."""
        client = TestClient(app)

        game_entry = MINIMAL_GAMES_RESPONSE["games"][0]
        with patch(
            "backend.services.my_games_service.get_my_games",
            new=AsyncMock(return_value=([game_entry], 1)),
        ):
            response = client.get("/api/users/me/games", headers={"Authorization": "Bearer dummy"})

        assert response.status_code == 200
        game = response.json()["games"][0]
        assert game["id"] == 101
        assert game["result"] == "W"
        assert game["my_score"] == 21
        assert game["opponent_score"] == 18
        assert game["rating_change"] == 4
        assert game["session_submitted"] is True
        assert game["partner_names"] == ["K. Fawwar"]

    def test_empty_games_list(self):
        """Returns an empty games list with total 0 when no matches found."""
        client = TestClient(app)

        with patch(
            "backend.services.my_games_service.get_my_games",
            new=AsyncMock(return_value=([], 0)),
        ):
            response = client.get("/api/users/me/games", headers={"Authorization": "Bearer dummy"})

        assert response.status_code == 200
        data = response.json()
        assert data["games"] == []
        assert data["total"] == 0

    # -- Query params forwarded to service -----------------------------------

    def test_league_filter_passed_to_service(self):
        """league_id query param is forwarded to the service."""
        client = TestClient(app)

        mock_fn = AsyncMock(return_value=([], 0))
        with patch("backend.services.my_games_service.get_my_games", new=mock_fn):
            response = client.get(
                "/api/users/me/games?league_id=5",
                headers={"Authorization": "Bearer dummy"},
            )

        assert response.status_code == 200
        mock_fn.assert_called_once()
        call_kwargs = mock_fn.call_args.kwargs
        assert call_kwargs["league_id"] == 5

    def test_result_filter_passed_to_service(self):
        """result query param is forwarded to the service."""
        client = TestClient(app)

        mock_fn = AsyncMock(return_value=([], 0))
        with patch("backend.services.my_games_service.get_my_games", new=mock_fn):
            response = client.get(
                "/api/users/me/games?result=W",
                headers={"Authorization": "Bearer dummy"},
            )

        assert response.status_code == 200
        mock_fn.assert_called_once()
        call_kwargs = mock_fn.call_args.kwargs
        assert call_kwargs["result_filter"] == "W"

    def test_invalid_result_filter_returns_422(self):
        """An invalid result value (not W/L/D) must return 422."""
        client = TestClient(app)
        response = client.get(
            "/api/users/me/games?result=X",
            headers={"Authorization": "Bearer dummy"},
        )
        assert response.status_code == 422

    def test_pagination_params_passed_to_service(self):
        """limit and offset are forwarded to the service."""
        client = TestClient(app)

        mock_fn = AsyncMock(return_value=([], 0))
        with patch("backend.services.my_games_service.get_my_games", new=mock_fn):
            response = client.get(
                "/api/users/me/games?limit=10&offset=20",
                headers={"Authorization": "Bearer dummy"},
            )

        assert response.status_code == 200
        call_kwargs = mock_fn.call_args.kwargs
        assert call_kwargs["limit"] == 10
        assert call_kwargs["offset"] == 20

    # -- Player not found (service returns None) -----------------------------

    def test_service_returns_none_gives_404(self):
        """When the service returns None (player not found), the route returns 404."""
        client = TestClient(app)

        with patch(
            "backend.services.my_games_service.get_my_games",
            new=AsyncMock(return_value=None),
        ):
            response = client.get(
                "/api/users/me/games",
                headers={"Authorization": "Bearer dummy"},
            )

        assert response.status_code == 404

    # -- Service error -------------------------------------------------------

    def test_service_exception_returns_500(self):
        """Unhandled service exception surfaces as a 500 response."""
        client = TestClient(app)

        with patch(
            "backend.services.my_games_service.get_my_games",
            new=AsyncMock(side_effect=RuntimeError("DB exploded")),
        ):
            response = client.get(
                "/api/users/me/games",
                headers={"Authorization": "Bearer dummy"},
            )

        assert response.status_code == 500
