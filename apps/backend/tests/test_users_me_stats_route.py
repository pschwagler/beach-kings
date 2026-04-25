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
from backend.services import auth_service, user_service

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

USER_ID = 42
PLAYER_ID = 7
PHONE = "+10000000001"

FAKE_USER_NO_PLAYER = {
    "id": USER_ID,
    "phone_number": PHONE,
    "name": "No Player",
    "email": "noplayer@example.com",
    "is_verified": True,
    "created_at": "2020-01-01T00:00:00Z",
    # no player_id key — simulates user without a linked player profile
}

FAKE_USER_WITH_PLAYER = {
    **FAKE_USER_NO_PLAYER,
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


class TestGetMyStatsRoute:
    """Tests for GET /api/users/me/stats."""

    # -- Auth guard ----------------------------------------------------------

    def test_unauthenticated_returns_401(self):
        """Request without a token must be rejected with 401."""
        client = TestClient(app)
        response = client.get("/api/users/me/stats")
        assert response.status_code == 401

    # -- No linked player ----------------------------------------------------

    def test_no_player_linked_returns_404(self, monkeypatch):
        """Authenticated user without a player profile receives a 404."""
        client, headers = _authed_client_no_player(monkeypatch)
        response = client.get("/api/users/me/stats", headers=headers)
        assert response.status_code == 404
        assert "player" in response.json()["detail"].lower()

    # -- Happy path (shape-contract) -----------------------------------------

    def test_happy_path_shape_contract(self, monkeypatch):
        """
        Authenticated user with a player profile receives a well-formed
        MyStatsPayload with all required top-level keys and correct sub-shapes.
        """
        client, headers = _authed_client_with_player(monkeypatch)

        with patch(
            "backend.services.my_stats_service.get_my_stats",
            new=AsyncMock(return_value=MINIMAL_STATS_PAYLOAD),
        ):
            response = client.get("/api/users/me/stats", headers=headers)

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
        for key in ("wins", "losses", "games_played", "rating", "peak_rating",
                    "win_rate", "current_streak", "avg_point_diff"):
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
            for key in ("player_id", "display_name", "initials",
                        "games_played", "wins", "losses", "win_rate"):
                assert key in partner, f"Missing partner key: {key}"
            assert "rating_diff" not in partner, "rating_diff must not be present"

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

    def test_service_exception_returns_500(self, monkeypatch):
        """Unhandled service exception must surface as a 500 response."""
        client, headers = _authed_client_with_player(monkeypatch)

        with patch(
            "backend.services.my_stats_service.get_my_stats",
            new=AsyncMock(side_effect=RuntimeError("DB exploded")),
        ):
            response = client.get("/api/users/me/stats", headers=headers)

        assert response.status_code == 500
