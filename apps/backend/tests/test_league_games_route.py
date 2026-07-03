"""
Unit tests for GET /api/leagues/{league_id}/games.

Shape-contract tests: verifies that the route enforces league-member auth,
returns a well-formed LeagueGamesResponse, and surfaces service errors as 500.

Auth strategy: mirrors test_leagues_routes.py — patch auth_service.verify_token
and user_service.get_user_by_id, plus mark the user as a system admin so the
membership check is bypassed.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services import (
    auth_service,
    data_service,
    league_games_service,
    user_service,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

LEAGUE_ID = 17
USER_ID = 1
PHONE = "+10000000000"

SAMPLE_LEAGUE_GAME = {
    "id": 1001,
    "session_id": 55,
    "session_date": "2024-06-01",
    "session_status": "ACTIVE",
    "court_label": "QBK Sports",
    "team1_player_names": ["Alice", "Bob"],
    "team1_player_ids": [10, 11],
    "team2_player_names": ["Charlie", "Dave"],
    "team2_player_ids": [12, 13],
    "team1_score": 21,
    "team2_score": 18,
    "winner": 1,
}


# ---------------------------------------------------------------------------
# Helpers — mirror test_leagues_routes.py
# ---------------------------------------------------------------------------


def _make_admin_client(monkeypatch):
    """Authenticated client whose user is treated as a system admin."""

    def fake_verify_token(token: str) -> dict:
        return {"user_id": USER_ID, "phone_number": PHONE}

    async def fake_get_user_by_id(session, uid: int) -> dict:
        return {
            "id": USER_ID,
            "phone_number": PHONE,
            "name": "Admin",
            "email": "admin@example.com",
            "is_verified": True,
            "created_at": "2020-01-01T00:00:00Z",
        }

    async def fake_get_setting(session, key: str):
        if key == "system_admin_phone_numbers":
            return PHONE
        return None

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
    monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)
    return TestClient(app), {"Authorization": "Bearer dummy"}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestGetLeagueGamesRoute:
    """Tests for GET /api/leagues/{league_id}/games."""

    def test_unauthenticated_rejected(self):
        """Without a token the request is rejected before reaching the route."""
        client = TestClient(app)
        response = client.get(f"/api/leagues/{LEAGUE_ID}/games")
        assert response.status_code in (401, 403)

    def test_happy_path_shape_contract(self, monkeypatch):
        """Returns a well-formed games list with required keys per game."""
        client, headers = _make_admin_client(monkeypatch)
        with patch(
            "backend.services.league_games_service.get_league_games",
            new=AsyncMock(return_value=([SAMPLE_LEAGUE_GAME], 1)),
        ):
            response = client.get(f"/api/leagues/{LEAGUE_ID}/games", headers=headers)

        assert response.status_code == 200, response.text
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
            "session_date",
            "session_status",
            "court_label",
            "team1_player_names",
            "team1_player_ids",
            "team2_player_names",
            "team2_player_ids",
            "team1_score",
            "team2_score",
            "winner",
        )
        for key in required_keys:
            assert key in game, f"Missing key: {key}"
        assert game["session_status"] == "ACTIVE"

    def test_rejects_out_of_range_pagination(self, monkeypatch):
        """limit/offset outside the allowed bounds are rejected with 422."""
        client, headers = _make_admin_client(monkeypatch)
        for query in ("limit=0", "limit=5000", "offset=-1"):
            response = client.get(f"/api/leagues/{LEAGUE_ID}/games?{query}", headers=headers)
            assert response.status_code == 422, f"{query} -> {response.status_code}"

    def test_pagination_forwarded_to_service(self, monkeypatch):
        """Valid limit/offset are passed through to the service layer."""
        client, headers = _make_admin_client(monkeypatch)
        mock = AsyncMock(return_value=([], 0))
        with patch("backend.services.league_games_service.get_league_games", new=mock):
            response = client.get(
                f"/api/leagues/{LEAGUE_ID}/games?limit=25&offset=50", headers=headers
            )
        assert response.status_code == 200
        assert mock.await_args.kwargs["limit"] == 25
        assert mock.await_args.kwargs["offset"] == 50

    def test_values_round_trip(self, monkeypatch):
        """Service-returned values flow through unchanged."""
        client, headers = _make_admin_client(monkeypatch)
        with patch(
            "backend.services.league_games_service.get_league_games",
            new=AsyncMock(return_value=([SAMPLE_LEAGUE_GAME], 1)),
        ):
            response = client.get(f"/api/leagues/{LEAGUE_ID}/games", headers=headers)

        assert response.status_code == 200
        game = response.json()["games"][0]
        assert game["id"] == 1001
        assert game["team1_player_names"] == ["Alice", "Bob"]
        assert game["team2_player_names"] == ["Charlie", "Dave"]
        assert game["team1_score"] == 21
        assert game["team2_score"] == 18
        assert game["winner"] == 1
        assert game["session_status"] == "ACTIVE"

    def test_empty_games_list(self, monkeypatch):
        """Returns empty list and total 0 when the league has no games."""
        client, headers = _make_admin_client(monkeypatch)
        with patch(
            "backend.services.league_games_service.get_league_games",
            new=AsyncMock(return_value=([], 0)),
        ):
            response = client.get(f"/api/leagues/{LEAGUE_ID}/games", headers=headers)
        assert response.status_code == 200
        assert response.json() == {"games": [], "total": 0}

    def test_service_error_returns_500(self, monkeypatch):
        """Service exceptions surface as 500."""
        client, headers = _make_admin_client(monkeypatch)
        with patch(
            "backend.services.league_games_service.get_league_games",
            new=AsyncMock(side_effect=RuntimeError("boom")),
        ):
            response = client.get(f"/api/leagues/{LEAGUE_ID}/games", headers=headers)
        assert response.status_code == 500


# ---------------------------------------------------------------------------
# Pure-helper unit tests (no DB / no HTTP)
# ---------------------------------------------------------------------------


class TestNormalizeSessionDate:
    """Tests for league_games_service._normalize_session_date."""

    def test_none_returns_none(self):
        assert league_games_service._normalize_session_date(None) is None

    def test_empty_or_whitespace_returns_none(self):
        assert league_games_service._normalize_session_date("") is None
        assert league_games_service._normalize_session_date("   ") is None

    def test_iso_format_passes_through(self):
        assert league_games_service._normalize_session_date("2024-06-01") == "2024-06-01"

    def test_us_slash_format_normalized_to_iso(self):
        assert league_games_service._normalize_session_date("06/01/2024") == "2024-06-01"

    def test_unrecognized_format_returns_none(self):
        assert league_games_service._normalize_session_date("June 1, 2024") is None


class TestBuildEntry:
    """Tests for league_games_service._build_entry."""

    def _row(self, **overrides):
        base = {
            "match_id": 1001,
            "session_id": 55,
            "session_date": "2024-06-01",
            "session_status": "ACTIVE",
            "court_name": "QBK Sports",
            "team1_player1_id": 10,
            "team1_player2_id": 11,
            "team2_player1_id": 12,
            "team2_player2_id": 13,
            "team1_player1_name": "Alice",
            "team1_player2_name": "Bob",
            "team2_player1_name": "Charlie",
            "team2_player2_name": "Dave",
            "team1_score": 21,
            "team2_score": 18,
            "winner": 1,
        }
        base.update(overrides)
        return SimpleNamespace(**base)

    def test_full_row_maps_all_fields(self):
        entry = league_games_service._build_entry(self._row())
        assert entry["id"] == 1001
        assert entry["session_id"] == 55
        assert entry["session_date"] == "2024-06-01"
        assert entry["session_status"] == "ACTIVE"
        assert entry["court_label"] == "QBK Sports"
        assert entry["team1_player_names"] == ["Alice", "Bob"]
        assert entry["team1_player_ids"] == [10, 11]
        assert entry["team2_player_names"] == ["Charlie", "Dave"]
        assert entry["winner"] == 1

    def test_none_player_names_and_ids_are_filtered(self):
        entry = league_games_service._build_entry(
            self._row(team1_player2_id=None, team1_player2_name=None)
        )
        assert entry["team1_player_names"] == ["Alice"]
        assert entry["team1_player_ids"] == [10]

    def test_null_winner_defaults_to_no_result(self):
        entry = league_games_service._build_entry(self._row(winner=None))
        assert entry["winner"] == league_games_service.WINNER_NO_RESULT

    def test_tie_winner_preserved(self):
        entry = league_games_service._build_entry(self._row(winner=-1))
        assert entry["winner"] == -1

    def test_enum_status_normalized_to_value(self):
        status = SimpleNamespace(value="SUBMITTED")
        entry = league_games_service._build_entry(self._row(session_status=status))
        assert entry["session_status"] == "SUBMITTED"

    def test_null_scores_default_to_zero(self):
        entry = league_games_service._build_entry(self._row(team1_score=None, team2_score=None))
        assert entry["team1_score"] == 0
        assert entry["team2_score"] == 0
