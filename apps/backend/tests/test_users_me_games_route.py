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
from backend.services import auth_service, user_service

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

USER_ID = 42
PLAYER_ID = 7
PHONE = "+10000000002"

FAKE_USER_NO_PLAYER = {
    "id": USER_ID,
    "phone_number": PHONE,
    "name": "No Player",
    "email": "nogames@example.com",
    "is_verified": True,
    "created_at": "2020-01-01T00:00:00Z",
}

FAKE_USER_WITH_PLAYER = {
    **FAKE_USER_NO_PLAYER,
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
# Auth helpers
# ---------------------------------------------------------------------------


def _authed_client_no_player(monkeypatch) -> tuple:
    """Return (TestClient, headers) for a user without a linked player."""

    def fake_verify_token(token: str):
        return {"user_id": USER_ID, "phone_number": PHONE}

    async def fake_get_user(session, uid: int):
        return FAKE_USER_NO_PLAYER

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user, raising=True)

    return TestClient(app), {"Authorization": "Bearer dummy"}


def _authed_client_with_player(monkeypatch) -> tuple:
    """Return (TestClient, headers) for a user with a linked player profile."""

    def fake_verify_token(token: str):
        return {"user_id": USER_ID, "phone_number": PHONE}

    async def fake_get_user(session, uid: int):
        return FAKE_USER_WITH_PLAYER

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user, raising=True)

    return TestClient(app), {"Authorization": "Bearer dummy"}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestGetMyGamesRoute:
    """Tests for GET /api/users/me/games."""

    # -- Auth guard ----------------------------------------------------------

    def test_unauthenticated_returns_401(self):
        """Request without a token must be rejected with 401."""
        client = TestClient(app)
        response = client.get("/api/users/me/games")
        assert response.status_code == 401

    # -- No linked player ----------------------------------------------------

    def test_no_player_linked_returns_404(self, monkeypatch):
        """Authenticated user without a player profile receives a 404."""
        client, headers = _authed_client_no_player(monkeypatch)
        response = client.get("/api/users/me/games", headers=headers)
        assert response.status_code == 404
        assert "player" in response.json()["detail"].lower()

    # -- Happy path (shape-contract) -----------------------------------------

    def test_happy_path_shape_contract(self, monkeypatch):
        """
        Authenticated user with a player profile receives a well-formed
        response with games list and total count.
        """
        client, headers = _authed_client_with_player(monkeypatch)

        with patch(
            "backend.services.my_games_service.get_my_games",
            new=AsyncMock(return_value=([MINIMAL_GAMES_RESPONSE["games"][0]], 1)),
        ):
            response = client.get("/api/users/me/games", headers=headers)

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

    def test_happy_path_values_round_trip(self, monkeypatch):
        """Values from the service are returned unchanged."""
        client, headers = _authed_client_with_player(monkeypatch)

        game_entry = MINIMAL_GAMES_RESPONSE["games"][0]
        with patch(
            "backend.services.my_games_service.get_my_games",
            new=AsyncMock(return_value=([game_entry], 1)),
        ):
            response = client.get("/api/users/me/games", headers=headers)

        assert response.status_code == 200
        game = response.json()["games"][0]
        assert game["id"] == 101
        assert game["result"] == "W"
        assert game["my_score"] == 21
        assert game["opponent_score"] == 18
        assert game["rating_change"] == 4
        assert game["session_submitted"] is True
        assert game["partner_names"] == ["K. Fawwar"]

    def test_empty_games_list(self, monkeypatch):
        """Returns an empty games list with total 0 when no matches found."""
        client, headers = _authed_client_with_player(monkeypatch)

        with patch(
            "backend.services.my_games_service.get_my_games",
            new=AsyncMock(return_value=([], 0)),
        ):
            response = client.get("/api/users/me/games", headers=headers)

        assert response.status_code == 200
        data = response.json()
        assert data["games"] == []
        assert data["total"] == 0

    # -- Query params forwarded to service -----------------------------------

    def test_league_filter_passed_to_service(self, monkeypatch):
        """league_id query param is forwarded to the service."""
        client, headers = _authed_client_with_player(monkeypatch)

        mock_fn = AsyncMock(return_value=([], 0))
        with patch("backend.services.my_games_service.get_my_games", new=mock_fn):
            response = client.get("/api/users/me/games?league_id=5", headers=headers)

        assert response.status_code == 200
        mock_fn.assert_called_once()
        call_kwargs = mock_fn.call_args.kwargs
        assert call_kwargs["league_id"] == 5

    def test_result_filter_passed_to_service(self, monkeypatch):
        """result query param is forwarded to the service."""
        client, headers = _authed_client_with_player(monkeypatch)

        mock_fn = AsyncMock(return_value=([], 0))
        with patch("backend.services.my_games_service.get_my_games", new=mock_fn):
            response = client.get("/api/users/me/games?result=W", headers=headers)

        assert response.status_code == 200
        mock_fn.assert_called_once()
        call_kwargs = mock_fn.call_args.kwargs
        assert call_kwargs["result_filter"] == "W"

    def test_invalid_result_filter_returns_422(self, monkeypatch):
        """An invalid result value (not W/L/D) must return 422."""
        client, headers = _authed_client_with_player(monkeypatch)
        response = client.get("/api/users/me/games?result=X", headers=headers)
        assert response.status_code == 422

    def test_pagination_params_passed_to_service(self, monkeypatch):
        """limit and offset are forwarded to the service."""
        client, headers = _authed_client_with_player(monkeypatch)

        mock_fn = AsyncMock(return_value=([], 0))
        with patch("backend.services.my_games_service.get_my_games", new=mock_fn):
            response = client.get("/api/users/me/games?limit=10&offset=20", headers=headers)

        assert response.status_code == 200
        call_kwargs = mock_fn.call_args.kwargs
        assert call_kwargs["limit"] == 10
        assert call_kwargs["offset"] == 20

    # -- Player not found (service returns None) -----------------------------

    def test_service_returns_none_gives_404(self, monkeypatch):
        """When the service returns None (player not found), the route returns 404."""
        client, headers = _authed_client_with_player(monkeypatch)

        with patch(
            "backend.services.my_games_service.get_my_games",
            new=AsyncMock(return_value=None),
        ):
            response = client.get("/api/users/me/games", headers=headers)

        assert response.status_code == 404

    # -- Service error -------------------------------------------------------

    def test_service_exception_returns_500(self, monkeypatch):
        """Unhandled service exception surfaces as a 500 response."""
        client, headers = _authed_client_with_player(monkeypatch)

        with patch(
            "backend.services.my_games_service.get_my_games",
            new=AsyncMock(side_effect=RuntimeError("DB exploded")),
        ):
            response = client.get("/api/users/me/games", headers=headers)

        assert response.status_code == 500
