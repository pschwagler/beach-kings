"""Route-layer tests for KOB (King/Queen of the Beach) tournament endpoints.

Service logic is tested in test_kob_service.py / test_kob_algorithms.py.
These tests verify the HTTP layer: auth guards, status codes, response shapes.

Strategy:
- _require_director calls require_verified_player internally; we override
  require_verified_player AND monkeypatch kob_service.get_tournament so the
  auth dependency returns a user dict with a fake tournament attached.
- Public endpoints (GET /api/kob/{code}, POST /api/kob/{code}/score) are tested
  without auth, just mocking the service.
"""

import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.api.auth_dependencies import require_verified_player
from backend.services import kob_service, kob_scheduler


# ---------------------------------------------------------------------------
# Shared fake data
# ---------------------------------------------------------------------------

_PLAYER_ID = 10
_TOURNAMENT_ID = 1
_TOURNAMENT_CODE = "ABC123"

FAKE_USER = {
    "id": 1,
    "phone_number": "+10000000000",
    "name": "Director User",
    "email": "director@example.com",
    "is_verified": True,
    "created_at": "2020-01-01T00:00:00Z",
    "player_id": _PLAYER_ID,
}

FAKE_TOURNAMENT_DETAIL = {
    "id": _TOURNAMENT_ID,
    "name": "Test Tournament",
    "code": _TOURNAMENT_CODE,
    "status": "SETUP",
    "format": "FULL_ROUND_ROBIN",
    "gender": "coed",
    "num_courts": 2,
    "games_per_match": 1,
    "game_to": 21,
    "win_by": 2,
    "num_rr_cycles": 1,
    "director_player_id": _PLAYER_ID,
    "location_id": None,
    "num_pools": None,
    "playoff_size": None,
    "max_rounds": None,
    "playoff_format": None,
    "playoff_game_to": None,
    "playoff_games_per_match": None,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": None,
    "players": [],
    "matches": [],
    "standings": [],
    "current_round": None,
}

FAKE_TOURNAMENT_SUMMARY = {
    "id": _TOURNAMENT_ID,
    "name": "Test Tournament",
    "code": _TOURNAMENT_CODE,
    "status": "SETUP",
    "format": "FULL_ROUND_ROBIN",
    "num_courts": 2,
    "gender": "coed",
    "game_to": 21,
    "director_player_id": _PLAYER_ID,
    "location_id": None,
    "created_at": "2024-01-01T00:00:00Z",
    "player_count": 0,
}

FAKE_MATCH_RESPONSE = {
    "id": 1,
    "matchup_id": "r1-m1",
    "round_num": 1,
    "phase": "round_robin",
    "is_bye": False,
}

VALID_TOURNAMENT_CREATE = {
    "name": "My Tournament",
    "num_courts": 2,
    "format": "FULL_ROUND_ROBIN",
    "games_per_match": 1,
    "game_to": 21,
    "num_rr_cycles": 1,
}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_fake_tournament():
    """Build a MagicMock that looks like a KobTournament ORM object."""
    t = MagicMock()
    t.id = _TOURNAMENT_ID
    t.director_player_id = _PLAYER_ID
    t.code = _TOURNAMENT_CODE
    t.status = MagicMock()
    t.status.value = "SETUP"
    t.kob_players = []
    return t


@pytest.fixture(autouse=True)
def _override_auth():
    """Override require_verified_player for all tests in this module."""

    async def _fake():
        return FAKE_USER

    app.dependency_overrides[require_verified_player] = _fake
    yield
    app.dependency_overrides.pop(require_verified_player, None)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def headers():
    return {"Authorization": "Bearer dummy"}


def _patch_director_dep(monkeypatch):
    """
    Monkeypatch kob_service.get_tournament so that make_require_kob_director
    resolves without hitting a real database.
    """
    fake_tournament = _make_fake_tournament()

    async def fake_get_tournament(session, tournament_id):
        if tournament_id == _TOURNAMENT_ID:
            return fake_tournament
        return None

    monkeypatch.setattr(kob_service, "get_tournament", fake_get_tournament, raising=True)
    return fake_tournament


# ============================================================================
# POST /api/kob/tournaments  — create tournament
# ============================================================================


class TestCreateTournament:
    """Tests for POST /api/kob/tournaments."""

    def test_create_success(self, client, headers, monkeypatch):
        """Happy path: returns tournament detail on creation."""
        fake_tournament = _make_fake_tournament()

        async def fake_create(session, player_id, data):
            return fake_tournament

        async def fake_build_detail(session, tournament):
            return FAKE_TOURNAMENT_DETAIL

        async def fake_get_tournament(session, tournament_id):
            return _make_fake_tournament()

        monkeypatch.setattr(kob_service, "create_tournament", fake_create, raising=True)
        monkeypatch.setattr(kob_service, "build_detail_response", fake_build_detail, raising=True)
        monkeypatch.setattr(kob_service, "get_tournament", fake_get_tournament, raising=True)

        response = client.post("/api/kob/tournaments", json=VALID_TOURNAMENT_CREATE, headers=headers)

        assert response.status_code == 200
        assert response.json()["id"] == _TOURNAMENT_ID

    def test_create_value_error_returns_400(self, client, headers, monkeypatch):
        """Service ValueError surfaces as HTTP 400."""

        async def fake_create(session, player_id, data):
            raise ValueError("Minimum 4 players required")

        monkeypatch.setattr(kob_service, "create_tournament", fake_create, raising=True)

        response = client.post("/api/kob/tournaments", json=VALID_TOURNAMENT_CREATE, headers=headers)
        assert response.status_code == 400
        assert "Minimum 4 players" in response.json()["detail"]

    def test_create_server_error_returns_500(self, client, headers, monkeypatch):
        """Unexpected exception surfaces as HTTP 500."""

        async def fake_create(session, player_id, data):
            raise RuntimeError("DB unavailable")

        monkeypatch.setattr(kob_service, "create_tournament", fake_create, raising=True)

        response = client.post("/api/kob/tournaments", json=VALID_TOURNAMENT_CREATE, headers=headers)
        assert response.status_code == 500

    def test_create_requires_auth(self):
        """No auth returns 401/403."""
        app.dependency_overrides.pop(require_verified_player, None)
        c = TestClient(app)
        response = c.post("/api/kob/tournaments", json=VALID_TOURNAMENT_CREATE)
        assert response.status_code in (401, 403)

        # Restore
        async def _fake():
            return FAKE_USER

        app.dependency_overrides[require_verified_player] = _fake

    def test_create_missing_name_returns_422(self, client, headers):
        """Missing required name field returns validation error."""
        body = {k: v for k, v in VALID_TOURNAMENT_CREATE.items() if k != "name"}
        response = client.post("/api/kob/tournaments", json=body, headers=headers)
        assert response.status_code == 422


# ============================================================================
# GET /api/kob/tournaments/mine
# ============================================================================


class TestGetMyTournaments:
    """Tests for GET /api/kob/tournaments/mine."""

    def test_get_mine_success(self, client, headers, monkeypatch):
        """Returns list of tournaments for the current player."""
        fake_tournament = _make_fake_tournament()

        async def fake_get_my(session, player_id):
            return [fake_tournament]

        def fake_build_summary(t, player_count):
            return FAKE_TOURNAMENT_SUMMARY

        monkeypatch.setattr(kob_service, "get_my_tournaments", fake_get_my, raising=True)
        monkeypatch.setattr(kob_service, "build_summary_response", fake_build_summary, raising=True)

        response = client.get("/api/kob/tournaments/mine", headers=headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        assert response.json()[0]["id"] == _TOURNAMENT_ID

    def test_get_mine_empty(self, client, headers, monkeypatch):
        """Returns empty list when player has no tournaments."""

        async def fake_get_my(session, player_id):
            return []

        monkeypatch.setattr(kob_service, "get_my_tournaments", fake_get_my, raising=True)

        response = client.get("/api/kob/tournaments/mine", headers=headers)
        assert response.status_code == 200
        assert response.json() == []

    def test_get_mine_server_error(self, client, headers, monkeypatch):
        """Service exception returns 500."""

        async def fake_get_my(session, player_id):
            raise RuntimeError("oops")

        monkeypatch.setattr(kob_service, "get_my_tournaments", fake_get_my, raising=True)

        response = client.get("/api/kob/tournaments/mine", headers=headers)
        assert response.status_code == 500

    def test_get_mine_requires_auth(self):
        """No auth returns 401/403."""
        app.dependency_overrides.pop(require_verified_player, None)
        c = TestClient(app)
        response = c.get("/api/kob/tournaments/mine")
        assert response.status_code in (401, 403)

        async def _fake():
            return FAKE_USER

        app.dependency_overrides[require_verified_player] = _fake


# ============================================================================
# GET /api/kob/tournaments/{tournament_id}  — director view
# ============================================================================


class TestGetTournamentById:
    """Tests for GET /api/kob/tournaments/{tournament_id}."""

    def test_get_by_id_success(self, client, headers, monkeypatch):
        """Director can fetch tournament detail."""
        _patch_director_dep(monkeypatch)

        async def fake_build_detail(session, tournament):
            return FAKE_TOURNAMENT_DETAIL

        monkeypatch.setattr(kob_service, "build_detail_response", fake_build_detail, raising=True)

        response = client.get(f"/api/kob/tournaments/{_TOURNAMENT_ID}", headers=headers)
        assert response.status_code == 200
        assert response.json()["id"] == _TOURNAMENT_ID

    def test_get_nonexistent_returns_404(self, client, headers, monkeypatch):
        """Non-existent tournament_id returns 404 from the director dependency."""

        async def fake_get_tournament(session, tournament_id):
            return None

        monkeypatch.setattr(kob_service, "get_tournament", fake_get_tournament, raising=True)

        response = client.get("/api/kob/tournaments/9999", headers=headers)
        assert response.status_code == 404

    def test_get_other_directors_tournament_returns_403(self, client, headers, monkeypatch):
        """Non-director gets 403."""
        t = _make_fake_tournament()
        t.director_player_id = 999  # different from FAKE_USER["player_id"] = 10

        async def fake_get_tournament(session, tournament_id):
            return t

        monkeypatch.setattr(kob_service, "get_tournament", fake_get_tournament, raising=True)

        response = client.get(f"/api/kob/tournaments/{_TOURNAMENT_ID}", headers=headers)
        assert response.status_code == 403


# ============================================================================
# PATCH /api/kob/tournaments/{tournament_id}  — update
# ============================================================================


class TestUpdateTournament:
    """Tests for PATCH /api/kob/tournaments/{tournament_id}."""

    def test_update_success(self, client, headers, monkeypatch):
        """Director can update tournament config."""
        fake_tournament = _patch_director_dep(monkeypatch)

        async def fake_update(session, tid, player_id, data):
            return fake_tournament

        async def fake_build_detail(session, tournament):
            return {**FAKE_TOURNAMENT_DETAIL, "name": "Updated Name"}

        monkeypatch.setattr(kob_service, "update_tournament", fake_update, raising=True)
        monkeypatch.setattr(kob_service, "build_detail_response", fake_build_detail, raising=True)

        response = client.patch(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}",
            json={"name": "Updated Name"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Updated Name"

    def test_update_value_error_returns_400(self, client, headers, monkeypatch):
        """ValueError from service surfaces as 400."""
        _patch_director_dep(monkeypatch)

        async def fake_update(session, tid, player_id, data):
            raise ValueError("Cannot update after tournament starts")

        monkeypatch.setattr(kob_service, "update_tournament", fake_update, raising=True)

        response = client.patch(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}",
            json={"name": "X"},
            headers=headers,
        )
        assert response.status_code == 400


# ============================================================================
# DELETE /api/kob/tournaments/{tournament_id}
# ============================================================================


class TestDeleteTournament:
    """Tests for DELETE /api/kob/tournaments/{tournament_id}."""

    def test_delete_success(self, client, headers, monkeypatch):
        """Returns 204 on success."""
        _patch_director_dep(monkeypatch)

        async def fake_delete(session, tid, player_id):
            pass

        monkeypatch.setattr(kob_service, "delete_tournament", fake_delete, raising=True)

        response = client.delete(f"/api/kob/tournaments/{_TOURNAMENT_ID}", headers=headers)
        assert response.status_code == 204

    def test_delete_active_tournament_returns_400(self, client, headers, monkeypatch):
        """ValueError (e.g., tournament already started) returns 400."""
        _patch_director_dep(monkeypatch)

        async def fake_delete(session, tid, player_id):
            raise ValueError("Cannot delete an active tournament")

        monkeypatch.setattr(kob_service, "delete_tournament", fake_delete, raising=True)

        response = client.delete(f"/api/kob/tournaments/{_TOURNAMENT_ID}", headers=headers)
        assert response.status_code == 400


# ============================================================================
# POST /api/kob/tournaments/{tournament_id}/players  — add player
# ============================================================================


class TestAddPlayerToTournament:
    """Tests for POST /api/kob/tournaments/{tournament_id}/players."""

    def test_add_player_success(self, client, headers, monkeypatch):
        """Adding a player returns updated detail response."""
        fake_tournament = _patch_director_dep(monkeypatch)

        async def fake_add_player(session, tid, player_id, seed):
            pass

        async def fake_get_tournament(session, tid):
            return fake_tournament

        async def fake_build_detail(session, tournament):
            return {**FAKE_TOURNAMENT_DETAIL, "players": [{"id": 1, "player_id": 20}]}

        monkeypatch.setattr(kob_service, "add_player", fake_add_player, raising=True)
        monkeypatch.setattr(kob_service, "build_detail_response", fake_build_detail, raising=True)

        response = client.post(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}/players",
            json={"player_id": 20},
            headers=headers,
        )
        assert response.status_code == 200
        assert len(response.json()["players"]) == 1

    def test_add_duplicate_player_returns_400(self, client, headers, monkeypatch):
        """Duplicate player raises ValueError -> 400."""
        _patch_director_dep(monkeypatch)

        async def fake_add_player(session, tid, player_id, seed):
            raise ValueError("Player already in tournament")

        monkeypatch.setattr(kob_service, "add_player", fake_add_player, raising=True)

        response = client.post(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}/players",
            json={"player_id": 20},
            headers=headers,
        )
        assert response.status_code == 400

    def test_add_player_missing_player_id_returns_422(self, client, headers, monkeypatch):
        """Missing player_id returns 422."""
        _patch_director_dep(monkeypatch)
        response = client.post(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}/players",
            json={},
            headers=headers,
        )
        assert response.status_code == 422


# ============================================================================
# DELETE /api/kob/tournaments/{tournament_id}/players/{player_id}
# ============================================================================


class TestRemovePlayerFromTournament:
    """Tests for DELETE /api/kob/tournaments/{tournament_id}/players/{player_id}."""

    def test_remove_player_success(self, client, headers, monkeypatch):
        """Successful removal returns updated detail."""
        fake_tournament = _patch_director_dep(monkeypatch)

        async def fake_remove_player(session, tid, player_id):
            pass

        async def fake_get_tournament(session, tid):
            return fake_tournament

        async def fake_build_detail(session, tournament):
            return FAKE_TOURNAMENT_DETAIL

        monkeypatch.setattr(kob_service, "remove_player", fake_remove_player, raising=True)
        monkeypatch.setattr(kob_service, "build_detail_response", fake_build_detail, raising=True)

        response = client.delete(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}/players/20",
            headers=headers,
        )
        assert response.status_code == 200

    def test_remove_nonexistent_player_returns_400(self, client, headers, monkeypatch):
        """Removing a player not in the tournament returns 400."""
        _patch_director_dep(monkeypatch)

        async def fake_remove_player(session, tid, player_id):
            raise ValueError("Player not in tournament")

        monkeypatch.setattr(kob_service, "remove_player", fake_remove_player, raising=True)

        response = client.delete(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}/players/999",
            headers=headers,
        )
        assert response.status_code == 400


# ============================================================================
# POST /api/kob/tournaments/{tournament_id}/start
# ============================================================================


class TestStartTournament:
    """Tests for POST /api/kob/tournaments/{tournament_id}/start."""

    def test_start_success(self, client, headers, monkeypatch):
        """Director can start tournament."""
        fake_tournament = _patch_director_dep(monkeypatch)

        async def fake_start(session, tid, player_id):
            return fake_tournament

        async def fake_build_detail(session, tournament):
            return {**FAKE_TOURNAMENT_DETAIL, "status": "ACTIVE"}

        monkeypatch.setattr(kob_service, "start_tournament", fake_start, raising=True)
        monkeypatch.setattr(kob_service, "build_detail_response", fake_build_detail, raising=True)

        response = client.post(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}/start",
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ACTIVE"

    def test_start_too_few_players_returns_400(self, client, headers, monkeypatch):
        """Not enough players raises ValueError -> 400."""
        _patch_director_dep(monkeypatch)

        async def fake_start(session, tid, player_id):
            raise ValueError("Need at least 4 players")

        monkeypatch.setattr(kob_service, "start_tournament", fake_start, raising=True)

        response = client.post(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}/start",
            headers=headers,
        )
        assert response.status_code == 400


# ============================================================================
# POST /api/kob/tournaments/{tournament_id}/advance
# ============================================================================


class TestAdvanceRound:
    """Tests for POST /api/kob/tournaments/{tournament_id}/advance."""

    def test_advance_success(self, client, headers, monkeypatch):
        """Manual advance returns updated detail."""
        fake_tournament = _patch_director_dep(monkeypatch)

        async def fake_advance(session, tid):
            return fake_tournament

        async def fake_build_detail(session, tournament):
            return {**FAKE_TOURNAMENT_DETAIL, "current_round": 2}

        monkeypatch.setattr(kob_service, "advance_round", fake_advance, raising=True)
        monkeypatch.setattr(kob_service, "build_detail_response", fake_build_detail, raising=True)

        response = client.post(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}/advance",
            headers=headers,
        )
        assert response.status_code == 200

    def test_advance_not_ready_returns_400(self, client, headers, monkeypatch):
        """Advancing when round not complete raises ValueError -> 400."""
        _patch_director_dep(monkeypatch)

        async def fake_advance(session, tid):
            raise ValueError("Current round is not complete")

        monkeypatch.setattr(kob_service, "advance_round", fake_advance, raising=True)

        response = client.post(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}/advance",
            headers=headers,
        )
        assert response.status_code == 400


# ============================================================================
# PATCH /api/kob/tournaments/{tournament_id}/matches/{matchup_id}  — edit score
# ============================================================================


class TestEditScore:
    """Tests for PATCH .../matches/{matchup_id} (director score edit)."""

    def test_edit_score_success(self, client, headers, monkeypatch):
        """Director can override a match score."""
        _patch_director_dep(monkeypatch)
        fake_match = MagicMock()
        fake_match.id = 1

        async def fake_update_score(session, tid, matchup_id, team1_score, team2_score, game_index):
            return fake_match

        async def fake_build_match(session, match):
            return FAKE_MATCH_RESPONSE

        monkeypatch.setattr(kob_service, "update_score", fake_update_score, raising=True)
        monkeypatch.setattr(kob_service, "build_match_response", fake_build_match, raising=True)

        response = client.patch(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}/matches/r1-m1",
            json={"team1_score": 21, "team2_score": 15},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["matchup_id"] == "r1-m1"

    def test_edit_score_invalid_match_returns_400(self, client, headers, monkeypatch):
        """Unknown matchup_id raises ValueError -> 400."""
        _patch_director_dep(monkeypatch)

        async def fake_update_score(session, tid, matchup_id, team1_score, team2_score, game_index):
            raise ValueError("Match not found")

        monkeypatch.setattr(kob_service, "update_score", fake_update_score, raising=True)

        response = client.patch(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}/matches/bad-id",
            json={"team1_score": 21, "team2_score": 15},
            headers=headers,
        )
        assert response.status_code == 400

    def test_edit_score_missing_scores_returns_422(self, client, headers, monkeypatch):
        """Missing score fields returns 422 from Pydantic validation."""
        _patch_director_dep(monkeypatch)

        response = client.patch(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}/matches/r1-m1",
            json={"game_index": 0},  # missing team1_score and team2_score
            headers=headers,
        )
        assert response.status_code == 422


# ============================================================================
# GET /api/kob/recommend  — format recommendation (no auth)
# ============================================================================


class TestGetFormatRecommendation:
    """Tests for GET /api/kob/recommend."""

    def test_recommend_no_auth_required(self, client, monkeypatch):
        """Endpoint is public — no auth header needed."""

        def fake_suggest_defaults(num_players, num_courts, duration_minutes):
            return {
                "format": "FULL_ROUND_ROBIN",
                "num_pools": None,
                "playoff_size": None,
                "max_rounds": None,
            }

        def fake_generate_preview(**kwargs):
            return {
                "format": "FULL_ROUND_ROBIN",
                "total_time_minutes": 210,
                "pool_play_time_minutes": 210,
                "playoff_time_minutes": 0,
                "estimated_rounds": 7,
                "pool_play_rounds": 7,
                "playoff_rounds": 0,
                "total_matches": 28,
                "min_games_per_player": 7,
                "max_games_per_player": 7,
                "games_per_court": 14,
                "preview_rounds": [],
                "explanation": "Full round robin recommended.",
            }

        monkeypatch.setattr(kob_scheduler, "suggest_defaults", fake_suggest_defaults, raising=True)
        monkeypatch.setattr(kob_scheduler, "generate_preview", fake_generate_preview, raising=True)

        response = client.get("/api/kob/recommend?num_players=8&num_courts=2")
        assert response.status_code == 200

    def test_recommend_missing_required_params_returns_422(self, client):
        """Missing num_players / num_courts returns 422."""
        response = client.get("/api/kob/recommend?num_players=8")
        assert response.status_code == 422

    def test_recommend_out_of_range_players_returns_422(self, client):
        """num_players below minimum (4) fails validation."""
        response = client.get("/api/kob/recommend?num_players=2&num_courts=2")
        assert response.status_code == 422

    def test_recommend_with_explicit_format(self, client, monkeypatch):
        """With explicit format, suggest_defaults is not called."""
        call_log = []

        def fake_suggest_defaults(num_players, num_courts, duration_minutes):
            call_log.append("suggest_defaults")
            return {}

        def fake_generate_preview(**kwargs):
            return {
                "format": "FULL_ROUND_ROBIN",
                "total_time_minutes": 210,
                "pool_play_time_minutes": 210,
                "playoff_time_minutes": 0,
                "estimated_rounds": 7,
                "pool_play_rounds": 7,
                "playoff_rounds": 0,
                "total_matches": 28,
                "min_games_per_player": 7,
                "max_games_per_player": 7,
                "games_per_court": 14,
                "preview_rounds": [],
                "explanation": "Full round robin.",
            }

        monkeypatch.setattr(kob_scheduler, "suggest_defaults", fake_suggest_defaults, raising=True)
        monkeypatch.setattr(kob_scheduler, "generate_preview", fake_generate_preview, raising=True)

        response = client.get("/api/kob/recommend?num_players=8&num_courts=2&format=FULL_ROUND_ROBIN")
        assert response.status_code == 200
        assert "suggest_defaults" not in call_log


# ============================================================================
# GET /api/kob/recommend/pills
# ============================================================================


class TestGetFormatPills:
    """Tests for GET /api/kob/recommend/pills."""

    def test_pills_success(self, client, monkeypatch):
        """Returns list of pill recommendations."""

        def fake_suggest_alternatives(num_players, num_courts, duration_minutes):
            return [
                {
                    "label": "Round Robin",
                    "category": "round_robin",
                    "format": "FULL_ROUND_ROBIN",
                    "total_time_minutes": 210,
                    "max_games_per_player": 7,
                }
            ]

        monkeypatch.setattr(
            kob_scheduler, "suggest_alternatives", fake_suggest_alternatives, raising=True
        )

        response = client.get("/api/kob/recommend/pills?num_players=8&num_courts=2")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_pills_missing_params_returns_422(self, client):
        """Missing required params returns 422."""
        response = client.get("/api/kob/recommend/pills")
        assert response.status_code == 422


# ============================================================================
# GET /api/kob/{code}  — public tournament view
# ============================================================================


class TestGetTournamentByCode:
    """Tests for GET /api/kob/{code} (public)."""

    def test_get_by_code_success(self, client, monkeypatch):
        """Public endpoint returns tournament detail for a valid code."""
        fake_tournament = _make_fake_tournament()

        async def fake_get_by_code(session, code):
            if code == _TOURNAMENT_CODE:
                return fake_tournament
            return None

        async def fake_build_detail(session, tournament):
            return FAKE_TOURNAMENT_DETAIL

        monkeypatch.setattr(kob_service, "get_tournament_by_code", fake_get_by_code, raising=True)
        monkeypatch.setattr(kob_service, "build_detail_response", fake_build_detail, raising=True)

        # No auth header — endpoint is public
        response = client.get(f"/api/kob/{_TOURNAMENT_CODE}")
        assert response.status_code == 200
        assert response.json()["id"] == _TOURNAMENT_ID

    def test_get_by_code_not_found_returns_404(self, client, monkeypatch):
        """Invalid code returns 404."""

        async def fake_get_by_code(session, code):
            return None

        monkeypatch.setattr(kob_service, "get_tournament_by_code", fake_get_by_code, raising=True)

        response = client.get("/api/kob/INVALID_CODE")
        assert response.status_code == 404


# ============================================================================
# POST /api/kob/{code}/score  — public score submission
# ============================================================================


class TestSubmitScorePublic:
    """Tests for POST /api/kob/{code}/score (public)."""

    def test_submit_score_success(self, client, monkeypatch):
        """Anyone with the link can submit a score."""
        fake_tournament = _make_fake_tournament()
        fake_match = MagicMock()
        fake_match.id = 1

        async def fake_get_by_code(session, code):
            return fake_tournament

        async def fake_submit_score(session, tid, matchup_id, t1, t2, game_index):
            return fake_match

        async def fake_build_match(session, match):
            return FAKE_MATCH_RESPONSE

        monkeypatch.setattr(kob_service, "get_tournament_by_code", fake_get_by_code, raising=True)
        monkeypatch.setattr(kob_service, "submit_score", fake_submit_score, raising=True)
        monkeypatch.setattr(kob_service, "build_match_response", fake_build_match, raising=True)

        response = client.post(
            f"/api/kob/{_TOURNAMENT_CODE}/score?matchup_id=r1-m1",
            json={"team1_score": 21, "team2_score": 15},
        )
        assert response.status_code == 200
        assert response.json()["matchup_id"] == "r1-m1"

    def test_submit_score_invalid_code_returns_404(self, client, monkeypatch):
        """Unknown tournament code returns 404."""

        async def fake_get_by_code(session, code):
            return None

        monkeypatch.setattr(kob_service, "get_tournament_by_code", fake_get_by_code, raising=True)

        response = client.post(
            "/api/kob/BADCODE/score?matchup_id=r1-m1",
            json={"team1_score": 21, "team2_score": 15},
        )
        assert response.status_code == 404

    def test_submit_score_value_error_returns_400(self, client, monkeypatch):
        """ValueError (e.g., match already complete) returns 400."""
        fake_tournament = _make_fake_tournament()

        async def fake_get_by_code(session, code):
            return fake_tournament

        async def fake_submit_score(session, tid, matchup_id, t1, t2, game_index):
            raise ValueError("Match is already complete")

        monkeypatch.setattr(kob_service, "get_tournament_by_code", fake_get_by_code, raising=True)
        monkeypatch.setattr(kob_service, "submit_score", fake_submit_score, raising=True)

        response = client.post(
            f"/api/kob/{_TOURNAMENT_CODE}/score?matchup_id=r1-m1",
            json={"team1_score": 21, "team2_score": 15},
        )
        assert response.status_code == 400

    def test_submit_score_missing_matchup_id_returns_422(self, client, monkeypatch):
        """Missing matchup_id query param returns 422."""
        response = client.post(
            f"/api/kob/{_TOURNAMENT_CODE}/score",
            json={"team1_score": 21, "team2_score": 15},
        )
        assert response.status_code == 422

    def test_submit_score_missing_body_returns_422(self, client, monkeypatch):
        """Missing score body returns 422."""
        response = client.post(
            f"/api/kob/{_TOURNAMENT_CODE}/score?matchup_id=r1-m1",
            json={},
        )
        assert response.status_code == 422


# ============================================================================
# POST /api/kob/tournaments/{tournament_id}/complete
# ============================================================================


class TestCompleteTournament:
    """Tests for POST /api/kob/tournaments/{tournament_id}/complete."""

    def test_complete_success(self, client, headers, monkeypatch):
        """Director can complete tournament."""
        fake_tournament = _patch_director_dep(monkeypatch)

        async def fake_complete(session, tid, player_id):
            return fake_tournament

        async def fake_build_detail(session, tournament):
            return {**FAKE_TOURNAMENT_DETAIL, "status": "COMPLETE"}

        monkeypatch.setattr(kob_service, "complete_tournament", fake_complete, raising=True)
        monkeypatch.setattr(kob_service, "build_detail_response", fake_build_detail, raising=True)

        response = client.post(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}/complete",
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["status"] == "COMPLETE"

    def test_complete_value_error_returns_400(self, client, headers, monkeypatch):
        """ValueError (e.g., not all matches complete) returns 400."""
        _patch_director_dep(monkeypatch)

        async def fake_complete(session, tid, player_id):
            raise ValueError("Not all matches are complete")

        monkeypatch.setattr(kob_service, "complete_tournament", fake_complete, raising=True)

        response = client.post(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}/complete",
            headers=headers,
        )
        assert response.status_code == 400


# ============================================================================
# POST /api/kob/tournaments/{tournament_id}/drop-player
# ============================================================================


class TestDropPlayer:
    """Tests for POST /api/kob/tournaments/{tournament_id}/drop-player."""

    def test_drop_player_success(self, client, headers, monkeypatch):
        """Director can drop a player mid-tournament."""
        fake_tournament = _patch_director_dep(monkeypatch)

        async def fake_drop(session, tid, player_id):
            pass

        async def fake_get_tournament(session, tid):
            return fake_tournament

        async def fake_build_detail(session, tournament):
            return FAKE_TOURNAMENT_DETAIL

        monkeypatch.setattr(kob_service, "drop_player", fake_drop, raising=True)
        monkeypatch.setattr(kob_service, "build_detail_response", fake_build_detail, raising=True)

        response = client.post(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}/drop-player",
            json={"player_id": 20},
            headers=headers,
        )
        assert response.status_code == 200

    def test_drop_player_not_found_returns_400(self, client, headers, monkeypatch):
        """Dropping non-participant raises ValueError -> 400."""
        _patch_director_dep(monkeypatch)

        async def fake_drop(session, tid, player_id):
            raise ValueError("Player not in tournament")

        monkeypatch.setattr(kob_service, "drop_player", fake_drop, raising=True)

        response = client.post(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}/drop-player",
            json={"player_id": 9999},
            headers=headers,
        )
        assert response.status_code == 400


# ============================================================================
# PUT /api/kob/tournaments/{tournament_id}/seeds  — reorder seeds
# ============================================================================


class TestReorderSeeds:
    """Tests for PUT /api/kob/tournaments/{tournament_id}/seeds."""

    def test_reorder_success(self, client, headers, monkeypatch):
        """Director can reorder seeds."""
        fake_tournament = _patch_director_dep(monkeypatch)

        async def fake_reorder(session, tid, player_ids):
            pass

        async def fake_get_tournament(session, tid):
            return fake_tournament

        async def fake_build_detail(session, tournament):
            return FAKE_TOURNAMENT_DETAIL

        monkeypatch.setattr(kob_service, "reorder_seeds", fake_reorder, raising=True)
        monkeypatch.setattr(kob_service, "build_detail_response", fake_build_detail, raising=True)

        response = client.put(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}/seeds",
            json={"player_ids": [1, 2, 3, 4]},
            headers=headers,
        )
        assert response.status_code == 200

    def test_reorder_missing_player_ids_returns_422(self, client, headers, monkeypatch):
        """Missing player_ids returns 422."""
        _patch_director_dep(monkeypatch)
        response = client.put(
            f"/api/kob/tournaments/{_TOURNAMENT_ID}/seeds",
            json={},
            headers=headers,
        )
        assert response.status_code == 422
