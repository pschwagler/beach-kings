"""
Unit tests for player route endpoints not covered in test_api_routes_comprehensive.py.

Covers:
- GET  /api/players              (search, public with optional auth)
- GET  /api/players/{id}/matches (public)
- GET  /api/players/{id}/season/{season_id}/stats (public)
- GET  /api/matches/export       (public, CSV)
- GET  /api/players/{id}/home-courts   (public)
- POST /api/players/{id}/home-courts   (require_verified_player, self-only)
- DELETE /api/players/{id}/home-courts/{court_id} (require_verified_player, self-only)
- PUT  /api/players/{id}/home-courts   (require_verified_player, self-only)
- PUT  /api/players/{id}/home-courts/reorder (require_verified_player, self-only)

Placeholder routes are tested in test_placeholder_crud.py and are excluded here.
"""

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.api.auth_dependencies import require_verified_player
from backend.services import data_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _async(value):
    """Wrap a plain value in an awaitable for async monkeypatching."""
    return value


PLAYER_ID = 10

FAKE_USER = {
    "id": 1,
    "phone_number": "+10000000000",
    "name": "Test User",
    "email": "test@example.com",
    "is_verified": True,
    "created_at": "2020-01-01T00:00:00Z",
    "player_id": PLAYER_ID,
}


@pytest.fixture(autouse=True)
def _override_auth():
    """Override require_verified_player for all tests in this module."""

    async def _fake():
        return FAKE_USER

    app.dependency_overrides[require_verified_player] = _fake
    yield
    app.dependency_overrides.pop(require_verified_player, None)


# ---------------------------------------------------------------------------
# GET /api/players
# ---------------------------------------------------------------------------


class TestListPlayers:
    """Tests for the player search/list endpoint."""

    def test_list_players_returns_items_and_total(self, monkeypatch):
        """Happy path: returns paginated player list."""
        fake_players = [
            {"id": 1, "full_name": "Alice"},
            {"id": 2, "full_name": "Bob"},
        ]

        async def fake_list(session, **kwargs):
            return fake_players, len(fake_players)

        monkeypatch.setattr(data_service, "list_players_search", fake_list, raising=True)

        client = TestClient(app)
        response = client.get("/api/players")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 2
        assert len(body["items"]) == 2
        assert body["items"][0]["full_name"] == "Alice"

    def test_list_players_with_query_param(self, monkeypatch):
        """Query string `q` is forwarded to the service."""
        captured = {}

        async def fake_list(session, **kwargs):
            captured.update(kwargs)
            return [], 0

        monkeypatch.setattr(data_service, "list_players_search", fake_list, raising=True)

        client = TestClient(app)
        response = client.get("/api/players?q=alice&limit=10&offset=5")

        assert response.status_code == 200
        assert captured["q"] == "alice"
        assert captured["limit"] == 10
        assert captured["offset"] == 5

    def test_list_players_service_error_returns_500(self, monkeypatch):
        """Service exception is surfaced as HTTP 500."""

        async def fake_list(session, **kwargs):
            raise RuntimeError("db down")

        monkeypatch.setattr(data_service, "list_players_search", fake_list, raising=True)

        client = TestClient(app)
        response = client.get("/api/players")
        assert response.status_code == 500


# ---------------------------------------------------------------------------
# GET /api/players/{player_id}/matches
# ---------------------------------------------------------------------------


class TestPlayerMatchHistory:
    """Tests for the public player match-history endpoint."""

    def test_returns_match_list(self, monkeypatch):
        """Happy path: returns list of matches for existing player."""
        fake_matches = [{"id": 1, "score": "21-15"}]

        async def fake_history(session, pid):
            return fake_matches

        monkeypatch.setattr(
            data_service, "get_player_match_history_by_id", fake_history, raising=True
        )

        client = TestClient(app)
        response = client.get(f"/api/players/{PLAYER_ID}/matches")

        assert response.status_code == 200
        assert response.json()[0]["id"] == 1

    def test_returns_404_when_player_not_found(self, monkeypatch):
        """Service returning None triggers 404."""

        async def fake_history(session, pid):
            return None

        monkeypatch.setattr(
            data_service, "get_player_match_history_by_id", fake_history, raising=True
        )

        client = TestClient(app)
        response = client.get("/api/players/9999/matches")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/players/{player_id}/season/{season_id}/stats
# ---------------------------------------------------------------------------


class TestPlayerSeasonStats:
    """Tests for the public player season-stats endpoint."""

    def test_returns_season_stats(self, monkeypatch):
        """Happy path: returns season stats dict."""
        fake_stats = {"elo": 1050, "wins": 5, "losses": 2}

        async def fake_season_stats(session, pid, sid):
            return fake_stats

        monkeypatch.setattr(
            data_service, "get_player_season_stats", fake_season_stats, raising=True
        )

        client = TestClient(app)
        response = client.get(f"/api/players/{PLAYER_ID}/season/3/stats")

        assert response.status_code == 200
        assert response.json()["elo"] == 1050

    def test_returns_404_when_not_found(self, monkeypatch):
        """Service returning None triggers 404."""

        async def fake_season_stats(session, pid, sid):
            return None

        monkeypatch.setattr(
            data_service, "get_player_season_stats", fake_season_stats, raising=True
        )

        client = TestClient(app)
        response = client.get(f"/api/players/{PLAYER_ID}/season/999/stats")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/matches/export
# ---------------------------------------------------------------------------


class TestMatchExport:
    """Tests for the public CSV export endpoint."""

    def test_returns_csv_content(self, monkeypatch):
        """Happy path: response is text/csv with expected Content-Disposition."""
        csv_data = (
            "DATE,T1P1,T1P2,T2P1,T2P2,T1SCORE,T2SCORE\n2024-01-01,Alice,Bob,Carol,Dave,21,15\n"
        )

        async def fake_export(session):
            return csv_data

        monkeypatch.setattr(data_service, "export_matches_to_csv", fake_export, raising=True)

        client = TestClient(app)
        response = client.get("/api/matches/export")

        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]
        assert "attachment" in response.headers["content-disposition"]
        assert "Alice" in response.text

    def test_service_error_returns_500(self, monkeypatch):
        """Service exception is surfaced as HTTP 500."""

        async def fake_export(session):
            raise RuntimeError("storage error")

        monkeypatch.setattr(data_service, "export_matches_to_csv", fake_export, raising=True)

        client = TestClient(app)
        response = client.get("/api/matches/export")
        assert response.status_code == 500


# ---------------------------------------------------------------------------
# GET /api/players/{player_id}/home-courts  (public)
# ---------------------------------------------------------------------------


class TestListPlayerHomeCourts:
    """Tests for the public home-courts listing endpoint."""

    def test_returns_home_courts(self, monkeypatch):
        """Happy path: returns list of home courts."""
        fake_courts = [{"id": 5, "name": "Mission Bay"}]

        async def fake_get(session, pid):
            return fake_courts

        monkeypatch.setattr(data_service, "get_player_home_courts", fake_get, raising=True)

        client = TestClient(app)
        response = client.get(f"/api/players/{PLAYER_ID}/home-courts")

        assert response.status_code == 200
        assert response.json()[0]["name"] == "Mission Bay"

    def test_service_error_returns_500(self, monkeypatch):
        """Service exception is surfaced as HTTP 500."""

        async def fake_get(session, pid):
            raise RuntimeError("oops")

        monkeypatch.setattr(data_service, "get_player_home_courts", fake_get, raising=True)

        client = TestClient(app)
        response = client.get(f"/api/players/{PLAYER_ID}/home-courts")
        assert response.status_code == 500


# ---------------------------------------------------------------------------
# POST /api/players/{player_id}/home-courts  (self-only)
# ---------------------------------------------------------------------------


class TestAddPlayerHomeCourt:
    """Tests for adding a home court."""

    def test_add_home_court_success(self, monkeypatch):
        """Happy path: authenticated player adds their own home court."""
        fake_court = {"id": 5, "name": "Mission Bay"}

        async def fake_add(session, pid, court_id):
            return fake_court

        monkeypatch.setattr(data_service, "add_player_home_court", fake_add, raising=True)

        client = TestClient(app)
        response = client.post(
            f"/api/players/{PLAYER_ID}/home-courts",
            json={"court_id": 5},
        )

        assert response.status_code == 200
        assert response.json()["name"] == "Mission Bay"

    def test_add_home_court_forbidden_for_other_player(self):
        """Player cannot add courts to a different player's profile."""
        client = TestClient(app)
        # FAKE_USER has player_id=10; use 99 to trigger the self-check
        response = client.post(
            "/api/players/99/home-courts",
            json={"court_id": 5},
        )
        assert response.status_code == 403

    def test_add_home_court_not_found_raises_404(self, monkeypatch):
        """Service ValueError (court not found) surfaces as 404."""

        async def fake_add(session, pid, court_id):
            raise ValueError("Court not found")

        monkeypatch.setattr(data_service, "add_player_home_court", fake_add, raising=True)

        client = TestClient(app)
        response = client.post(
            f"/api/players/{PLAYER_ID}/home-courts",
            json={"court_id": 999},
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/players/{player_id}/home-courts/{court_id}  (self-only)
# ---------------------------------------------------------------------------


class TestRemovePlayerHomeCourt:
    """Tests for removing a home court."""

    def test_remove_home_court_success(self, monkeypatch):
        """Happy path: returns {success: true}."""

        async def fake_remove(session, pid, cid):
            return True

        monkeypatch.setattr(data_service, "remove_player_home_court", fake_remove, raising=True)

        client = TestClient(app)
        response = client.delete(f"/api/players/{PLAYER_ID}/home-courts/5")

        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_remove_home_court_forbidden_for_other_player(self):
        """Player cannot remove courts from another player's profile."""
        client = TestClient(app)
        response = client.delete("/api/players/99/home-courts/5")
        assert response.status_code == 403

    def test_remove_home_court_not_found(self, monkeypatch):
        """Service returning False surfaces as 404."""

        async def fake_remove(session, pid, cid):
            return False

        monkeypatch.setattr(data_service, "remove_player_home_court", fake_remove, raising=True)

        client = TestClient(app)
        response = client.delete(f"/api/players/{PLAYER_ID}/home-courts/999")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# PUT /api/players/{player_id}/home-courts  (self-only)
# ---------------------------------------------------------------------------


class TestSetPlayerHomeCourts:
    """Tests for bulk-setting home courts."""

    def test_set_home_courts_success(self, monkeypatch):
        """Happy path: replaces all home courts and returns new list."""
        fake_courts = [{"id": 1}, {"id": 2}]

        async def fake_set(session, pid, court_ids):
            return fake_courts

        monkeypatch.setattr(data_service, "set_player_home_courts", fake_set, raising=True)

        client = TestClient(app)
        response = client.put(
            f"/api/players/{PLAYER_ID}/home-courts",
            json={"court_ids": [1, 2]},
        )

        assert response.status_code == 200
        assert len(response.json()) == 2

    def test_set_home_courts_forbidden_for_other_player(self):
        """Player cannot set courts on another player's profile."""
        client = TestClient(app)
        response = client.put(
            "/api/players/99/home-courts",
            json={"court_ids": [1]},
        )
        assert response.status_code == 403


# ---------------------------------------------------------------------------
# PUT /api/players/{player_id}/home-courts/reorder  (self-only)
# ---------------------------------------------------------------------------


class TestReorderPlayerHomeCourts:
    """Tests for reordering home courts."""

    def test_reorder_home_courts_success(self, monkeypatch):
        """Happy path: accepts court_positions and returns reordered list."""
        fake_courts = [{"id": 2, "position": 0}, {"id": 1, "position": 1}]

        async def fake_reorder(session, pid, court_positions):
            return fake_courts

        monkeypatch.setattr(data_service, "reorder_player_home_courts", fake_reorder, raising=True)

        client = TestClient(app)
        response = client.put(
            f"/api/players/{PLAYER_ID}/home-courts/reorder",
            json={
                "court_positions": [{"court_id": 2, "position": 0}, {"court_id": 1, "position": 1}]
            },
        )

        assert response.status_code == 200
        assert response.json()[0]["id"] == 2

    def test_reorder_home_courts_forbidden_for_other_player(self):
        """Player cannot reorder courts on another player's profile."""
        client = TestClient(app)
        response = client.put(
            "/api/players/99/home-courts/reorder",
            json={"court_positions": [{"court_id": 1, "position": 0}]},
        )
        assert response.status_code == 403
