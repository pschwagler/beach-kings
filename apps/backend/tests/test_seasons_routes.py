"""
Unit tests for season route endpoints not already covered by other test files.

Already tested elsewhere:
- POST /api/rankings  (test_api_routes_comprehensive.py)
- POST /api/calculate (test_calc_routes.py)

Covered here:
- POST /api/leagues/{league_id}/seasons       (make_require_league_admin)
- GET  /api/leagues/{league_id}/seasons       (require_user)
- GET  /api/seasons/{season_id}               (public)
- PUT  /api/seasons/{season_id}               (get_current_user)
- POST /api/matches/elo                       (public)
- GET  /api/seasons/{season_id}/matches       (public)
- POST /api/player-stats                      (public)
- GET  /api/seasons/{season_id}/player-stats  (public)
- POST /api/partnership-opponent-stats        (public)
- GET  /api/seasons/{season_id}/partnership-opponent-stats  (public)
- GET  /api/players/{player_id}/season/{season_id}/partnership-opponent-stats (public)
- GET  /api/leagues/{league_id}/player-stats  (public)
- GET  /api/leagues/{league_id}/partnership-opponent-stats  (public)
- GET  /api/players/{player_id}/league/{league_id}/stats    (public)
- GET  /api/players/{player_id}/league/{league_id}/partnership-opponent-stats (public)
- GET  /api/seasons/{season_id}/awards        (public)
- GET  /api/leagues/{league_id}/awards        (public)
- GET  /api/players/{player_id}/awards        (public)
- POST /api/seasons/{season_id}/finalize-awards (make_require_league_admin_from_season)
"""

from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services import auth_service, data_service, season_awards_service, user_service

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

LEAGUE_ID = 10
SEASON_ID = 20
PLAYER_ID = 5
USER_ID = 1
PHONE = "+10000000000"

_SEASON = {
    "id": SEASON_ID,
    "league_id": LEAGUE_ID,
    "name": "Spring 2024",
    "start_date": "2024-01-01",
    "end_date": "2024-06-30",
}

_PARTNERSHIP_STATS_RESPONSE = {
    "partnerships": [],
    "opponents": [],
}


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------


def _make_admin_client(monkeypatch, phone: str = PHONE, user_id: int = USER_ID):
    """
    Return (TestClient, auth_headers) with the caller treated as a system admin.

    System-admin status short-circuits all league-role DB queries, so one
    helper covers both league-admin and league-member gated endpoints.
    """

    def fake_verify_token(token: str) -> dict:
        return {"user_id": user_id, "phone_number": phone}

    async def fake_get_user_by_id(session, uid: int) -> dict:
        return {
            "id": user_id,
            "phone_number": phone,
            "name": "Admin",
            "email": "admin@example.com",
            "is_verified": True,
            "created_at": "2020-01-01T00:00:00Z",
        }

    async def fake_get_setting(session, key: str):
        if key == "system_admin_phone_numbers":
            return phone
        if key == "system_admin_emails":
            return None
        return None

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
    monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)
    return TestClient(app), {"Authorization": "Bearer dummy"}


def _make_user_client(monkeypatch, phone: str = PHONE, user_id: int = USER_ID):
    """Return (TestClient, auth_headers) for a plain authenticated user."""

    def fake_verify_token(token: str) -> dict:
        return {"user_id": user_id, "phone_number": phone}

    async def fake_get_user_by_id(session, uid: int) -> dict:
        return {
            "id": user_id,
            "phone_number": phone,
            "name": "User",
            "email": "user@example.com",
            "is_verified": True,
            "created_at": "2020-01-01T00:00:00Z",
        }

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
    return TestClient(app), {"Authorization": "Bearer dummy"}


# ---------------------------------------------------------------------------
# POST /api/leagues/{league_id}/seasons
# ---------------------------------------------------------------------------


class TestCreateSeason:
    """Tests for POST /api/leagues/{league_id}/seasons."""

    def test_create_season_success(self, monkeypatch):
        """League admin can create a season with valid required fields."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_create_season(session, league_id, name, start_date, end_date, **kwargs):
            return {**_SEASON, "name": name or "Spring 2024"}

        async def fake_notify(*args, **kwargs):
            return None

        monkeypatch.setattr(data_service, "create_season", fake_create_season, raising=True)
        monkeypatch.setattr(
            season_awards_service,
            "notify_members_about_season_activated",
            fake_notify,
            raising=False,
        )

        response = client.post(
            f"/api/leagues/{LEAGUE_ID}/seasons",
            json={"name": "Spring 2024", "start_date": "2024-01-01", "end_date": "2024-06-30"},
            headers=headers,
        )
        assert response.status_code == 200
        body = response.json()
        assert body["league_id"] == LEAGUE_ID
        assert body["id"] == SEASON_ID

    def test_create_season_missing_start_date_returns_400(self, monkeypatch):
        """Missing start_date returns 400."""
        client, headers = _make_admin_client(monkeypatch)

        response = client.post(
            f"/api/leagues/{LEAGUE_ID}/seasons",
            json={"end_date": "2024-06-30"},
            headers=headers,
        )
        assert response.status_code == 400
        assert "start_date" in response.json()["detail"]

    def test_create_season_unauthenticated(self):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.post(
            f"/api/leagues/{LEAGUE_ID}/seasons",
            json={"start_date": "2024-01-01", "end_date": "2024-06-30"},
        )
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# GET /api/leagues/{league_id}/seasons
# ---------------------------------------------------------------------------


class TestListSeasons:
    """Tests for GET /api/leagues/{league_id}/seasons."""

    def test_list_seasons_success(self, monkeypatch):
        """Authenticated user can list seasons for a league."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_list_seasons(session, league_id):
            return [_SEASON]

        monkeypatch.setattr(data_service, "list_seasons", fake_list_seasons, raising=True)

        response = client.get(f"/api/leagues/{LEAGUE_ID}/seasons", headers=headers)
        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert body[0]["id"] == SEASON_ID

    def test_list_seasons_empty(self, monkeypatch):
        """Returns an empty list when no seasons exist."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_list_seasons(session, league_id):
            return []

        monkeypatch.setattr(data_service, "list_seasons", fake_list_seasons, raising=True)

        response = client.get(f"/api/leagues/{LEAGUE_ID}/seasons", headers=headers)
        assert response.status_code == 200
        assert response.json() == []

    def test_list_seasons_unauthenticated(self):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.get(f"/api/leagues/{LEAGUE_ID}/seasons")
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# GET /api/seasons/{season_id}
# ---------------------------------------------------------------------------


class TestGetSeason:
    """Tests for GET /api/seasons/{season_id}."""

    def test_get_season_success(self, monkeypatch):
        """Public endpoint returns season data."""
        client = TestClient(app)

        async def fake_get_season(session, season_id):
            return _SEASON

        monkeypatch.setattr(data_service, "get_season", fake_get_season, raising=True)

        response = client.get(f"/api/seasons/{SEASON_ID}")
        assert response.status_code == 200
        assert response.json()["id"] == SEASON_ID

    def test_get_season_not_found(self, monkeypatch):
        """Returns 404 when season does not exist."""
        client = TestClient(app)

        async def fake_get_season(session, season_id):
            return None

        monkeypatch.setattr(data_service, "get_season", fake_get_season, raising=True)

        response = client.get(f"/api/seasons/{SEASON_ID}")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# PUT /api/seasons/{season_id}
# ---------------------------------------------------------------------------


class TestUpdateSeason:
    """Tests for PUT /api/seasons/{season_id}."""

    def test_update_season_success(self, monkeypatch):
        """Authenticated user can update a season."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_update_season(session, season_id, **kwargs):
            return {**_SEASON, **kwargs}

        monkeypatch.setattr(data_service, "update_season", fake_update_season, raising=True)

        response = client.put(
            f"/api/seasons/{SEASON_ID}",
            json={"name": "Updated Season"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Updated Season"

    def test_update_season_not_found(self, monkeypatch):
        """Returns 404 when season does not exist."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_update_season(session, season_id, **kwargs):
            return None

        monkeypatch.setattr(data_service, "update_season", fake_update_season, raising=True)

        response = client.put(
            f"/api/seasons/{SEASON_ID}",
            json={"name": "Ghost"},
            headers=headers,
        )
        assert response.status_code == 404

    def test_update_season_unauthenticated(self):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.put(f"/api/seasons/{SEASON_ID}", json={"name": "Ghost"})
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# POST /api/matches/elo
# ---------------------------------------------------------------------------


class TestGetMatchesElo:
    """Tests for POST /api/matches/elo."""

    def test_elo_by_season_id(self, monkeypatch):
        """Returns matches for a season when season_id is provided."""
        client = TestClient(app)

        async def fake_get_season_matches(session, season_id):
            return [{"id": 1, "season_id": season_id}]

        monkeypatch.setattr(
            data_service, "get_season_matches_with_elo", fake_get_season_matches, raising=True
        )

        response = client.post("/api/matches/elo", json={"season_id": SEASON_ID})
        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert body[0]["season_id"] == SEASON_ID

    def test_elo_by_league_id(self, monkeypatch):
        """Returns matches for a league when league_id is provided."""
        client = TestClient(app)

        async def fake_get_league_matches(session, league_id):
            return [{"id": 2, "league_id": league_id}]

        monkeypatch.setattr(
            data_service, "get_league_matches_with_elo", fake_get_league_matches, raising=True
        )

        response = client.post("/api/matches/elo", json={"league_id": LEAGUE_ID})
        assert response.status_code == 200
        body = response.json()
        assert body[0]["league_id"] == LEAGUE_ID

    def test_elo_missing_id_returns_400(self, monkeypatch):
        """Returns 400 when neither season_id nor league_id is provided."""
        client = TestClient(app)
        response = client.post("/api/matches/elo", json={})
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# GET /api/seasons/{season_id}/matches
# ---------------------------------------------------------------------------


class TestGetSeasonMatches:
    """Tests for GET /api/seasons/{season_id}/matches."""

    def test_get_season_matches_success(self, monkeypatch):
        """Public endpoint returns match list for a season."""
        client = TestClient(app)

        async def fake_get_season_matches(session, season_id):
            return [{"id": 1, "season_id": season_id}]

        monkeypatch.setattr(
            data_service, "get_season_matches_with_elo", fake_get_season_matches, raising=True
        )

        response = client.get(f"/api/seasons/{SEASON_ID}/matches")
        assert response.status_code == 200
        assert isinstance(response.json(), list)


# ---------------------------------------------------------------------------
# POST /api/player-stats
# ---------------------------------------------------------------------------


class TestGetAllPlayerStats:
    """Tests for POST /api/player-stats."""

    def test_player_stats_by_season_id(self, monkeypatch):
        """Returns player stats for a season."""
        client = TestClient(app)

        async def fake_get_season_stats(session, season_id):
            return [{"player_id": PLAYER_ID, "wins": 5}]

        monkeypatch.setattr(
            data_service, "get_all_player_season_stats", fake_get_season_stats, raising=True
        )

        response = client.post("/api/player-stats", json={"season_id": SEASON_ID})
        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert body[0]["player_id"] == PLAYER_ID

    def test_player_stats_by_league_id(self, monkeypatch):
        """Returns player stats for a league."""
        client = TestClient(app)

        async def fake_get_league_stats(session, league_id):
            return [{"player_id": PLAYER_ID, "wins": 10}]

        monkeypatch.setattr(
            data_service, "get_all_player_league_stats", fake_get_league_stats, raising=True
        )

        response = client.post("/api/player-stats", json={"league_id": LEAGUE_ID})
        assert response.status_code == 200
        assert response.json()[0]["wins"] == 10

    def test_player_stats_missing_id_returns_400(self, monkeypatch):
        """Returns 400 when neither season_id nor league_id is provided."""
        client = TestClient(app)
        response = client.post("/api/player-stats", json={})
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# GET /api/seasons/{season_id}/player-stats
# ---------------------------------------------------------------------------


class TestGetSeasonPlayerStats:
    """Tests for GET /api/seasons/{season_id}/player-stats."""

    def test_get_season_player_stats_success(self, monkeypatch):
        """Public endpoint returns player stats for a season."""
        client = TestClient(app)

        async def fake_get_stats(session, season_id):
            return [{"player_id": PLAYER_ID}]

        monkeypatch.setattr(
            data_service, "get_all_player_season_stats", fake_get_stats, raising=True
        )

        response = client.get(f"/api/seasons/{SEASON_ID}/player-stats")
        assert response.status_code == 200
        assert isinstance(response.json(), list)


# ---------------------------------------------------------------------------
# POST /api/partnership-opponent-stats
# ---------------------------------------------------------------------------


class TestGetPartnershipOpponentStats:
    """Tests for POST /api/partnership-opponent-stats."""

    def test_partnership_stats_by_season_id(self, monkeypatch):
        """Returns partnership/opponent stats for a season."""
        client = TestClient(app)

        async def fake_get_season_stats(session, season_id):
            return [{"player_id": PLAYER_ID}]

        monkeypatch.setattr(
            data_service,
            "get_all_player_season_partnership_opponent_stats",
            fake_get_season_stats,
            raising=True,
        )

        response = client.post("/api/partnership-opponent-stats", json={"season_id": SEASON_ID})
        assert response.status_code == 200

    def test_partnership_stats_by_league_id(self, monkeypatch):
        """Returns partnership/opponent stats for a league."""
        client = TestClient(app)

        async def fake_get_league_stats(session, league_id):
            return [{"player_id": PLAYER_ID}]

        monkeypatch.setattr(
            data_service,
            "get_all_player_league_partnership_opponent_stats",
            fake_get_league_stats,
            raising=True,
        )

        response = client.post("/api/partnership-opponent-stats", json={"league_id": LEAGUE_ID})
        assert response.status_code == 200

    def test_partnership_stats_missing_id_returns_400(self, monkeypatch):
        """Returns 400 when neither season_id nor league_id is provided."""
        client = TestClient(app)
        response = client.post("/api/partnership-opponent-stats", json={})
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# Public stats GET endpoints (representative subset)
# ---------------------------------------------------------------------------


class TestPublicStatsEndpoints:
    """
    Smoke tests for public GET stats endpoints.

    These endpoints share the same shape: no auth required, delegate to
    data_service, return a list or structured object.
    """

    def test_season_partnership_opponent_stats(self, monkeypatch):
        """GET /api/seasons/{season_id}/partnership-opponent-stats returns data."""
        client = TestClient(app)

        async def fake_get_stats(session, season_id):
            return [{"player_id": PLAYER_ID}]

        monkeypatch.setattr(
            data_service,
            "get_all_player_season_partnership_opponent_stats",
            fake_get_stats,
            raising=True,
        )

        response = client.get(f"/api/seasons/{SEASON_ID}/partnership-opponent-stats")
        assert response.status_code == 200

    def test_player_season_partnership_opponent_stats(self, monkeypatch):
        """GET /api/players/{player_id}/season/{season_id}/partnership-opponent-stats."""
        client = TestClient(app)

        async def fake_get_stats(session, player_id, season_id):
            return _PARTNERSHIP_STATS_RESPONSE

        monkeypatch.setattr(
            data_service,
            "get_player_season_partnership_opponent_stats",
            fake_get_stats,
            raising=True,
        )

        response = client.get(
            f"/api/players/{PLAYER_ID}/season/{SEASON_ID}/partnership-opponent-stats"
        )
        assert response.status_code == 200
        body = response.json()
        assert "partnerships" in body
        assert "opponents" in body

    def test_league_player_stats(self, monkeypatch):
        """GET /api/leagues/{league_id}/player-stats returns list."""
        client = TestClient(app)

        async def fake_get_stats(session, league_id):
            return [{"player_id": PLAYER_ID, "wins": 3}]

        monkeypatch.setattr(
            data_service, "get_all_player_league_stats", fake_get_stats, raising=True
        )

        response = client.get(f"/api/leagues/{LEAGUE_ID}/player-stats")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_league_partnership_opponent_stats(self, monkeypatch):
        """GET /api/leagues/{league_id}/partnership-opponent-stats returns list."""
        client = TestClient(app)

        async def fake_get_stats(session, league_id):
            return [{"player_id": PLAYER_ID}]

        monkeypatch.setattr(
            data_service,
            "get_all_player_league_partnership_opponent_stats",
            fake_get_stats,
            raising=True,
        )

        response = client.get(f"/api/leagues/{LEAGUE_ID}/partnership-opponent-stats")
        assert response.status_code == 200

    def test_player_league_stats_success(self, monkeypatch):
        """GET /api/players/{player_id}/league/{league_id}/stats returns stats."""
        client = TestClient(app)

        async def fake_get_stats(session, player_id, league_id):
            return {"player_id": player_id, "league_id": league_id, "wins": 7}

        monkeypatch.setattr(data_service, "get_player_league_stats", fake_get_stats, raising=True)

        response = client.get(f"/api/players/{PLAYER_ID}/league/{LEAGUE_ID}/stats")
        assert response.status_code == 200
        assert response.json()["wins"] == 7

    def test_player_league_stats_not_found(self, monkeypatch):
        """GET /api/players/{player_id}/league/{league_id}/stats returns 404 when missing."""
        client = TestClient(app)

        async def fake_get_stats(session, player_id, league_id):
            return None

        monkeypatch.setattr(data_service, "get_player_league_stats", fake_get_stats, raising=True)

        response = client.get(f"/api/players/{PLAYER_ID}/league/{LEAGUE_ID}/stats")
        assert response.status_code == 404

    def test_player_league_partnership_opponent_stats(self, monkeypatch):
        """GET /api/players/{player_id}/league/{league_id}/partnership-opponent-stats."""
        client = TestClient(app)

        async def fake_get_stats(session, player_id, league_id):
            return _PARTNERSHIP_STATS_RESPONSE

        monkeypatch.setattr(
            data_service,
            "get_player_league_partnership_opponent_stats",
            fake_get_stats,
            raising=True,
        )

        response = client.get(
            f"/api/players/{PLAYER_ID}/league/{LEAGUE_ID}/partnership-opponent-stats"
        )
        assert response.status_code == 200
        body = response.json()
        assert "partnerships" in body
        assert "opponents" in body


# ---------------------------------------------------------------------------
# Awards endpoints
# ---------------------------------------------------------------------------


class TestAwardsEndpoints:
    """Tests for public awards GET endpoints."""

    def test_get_season_awards_success(self, monkeypatch):
        """GET /api/seasons/{season_id}/awards returns award list."""
        client = TestClient(app)

        async def fake_get_awards(session, season_id):
            return [{"type": "mvp", "player_id": PLAYER_ID}]

        monkeypatch.setattr(
            season_awards_service, "get_season_awards", fake_get_awards, raising=True
        )

        response = client.get(f"/api/seasons/{SEASON_ID}/awards")
        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert body[0]["type"] == "mvp"

    def test_get_league_awards_success(self, monkeypatch):
        """GET /api/leagues/{league_id}/awards returns awards across seasons."""
        client = TestClient(app)

        async def fake_get_awards(session, league_id):
            return [{"type": "best_record", "player_id": PLAYER_ID}]

        monkeypatch.setattr(
            season_awards_service, "get_league_awards", fake_get_awards, raising=True
        )

        response = client.get(f"/api/leagues/{LEAGUE_ID}/awards")
        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert body[0]["type"] == "best_record"

    def test_get_player_awards_success(self, monkeypatch):
        """GET /api/players/{player_id}/awards returns player awards."""
        client = TestClient(app)

        async def fake_get_awards(session, player_id):
            return [{"type": "mvp", "season_id": SEASON_ID}]

        monkeypatch.setattr(
            season_awards_service, "get_player_awards", fake_get_awards, raising=True
        )

        response = client.get(f"/api/players/{PLAYER_ID}/awards")
        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert body[0]["season_id"] == SEASON_ID

    def test_get_season_awards_service_error_returns_500(self, monkeypatch):
        """Unexpected service error propagates as 500."""
        client = TestClient(app)

        async def fake_get_awards(session, season_id):
            raise RuntimeError("db failure")

        monkeypatch.setattr(
            season_awards_service, "get_season_awards", fake_get_awards, raising=True
        )

        response = client.get(f"/api/seasons/{SEASON_ID}/awards")
        assert response.status_code == 500


# ---------------------------------------------------------------------------
# POST /api/seasons/{season_id}/finalize-awards
# ---------------------------------------------------------------------------


class TestFinalizeSeasonAwards:
    """Tests for POST /api/seasons/{season_id}/finalize-awards."""

    def _make_db_override(self, season_obj):
        """
        Return a FastAPI dependency override for get_db_session that yields a
        mock AsyncSession whose execute() returns a result containing season_obj.
        """
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = season_obj

        async def fake_get_db():
            mock_session = AsyncMock()
            mock_session.execute = AsyncMock(return_value=mock_result)
            yield mock_session

        return fake_get_db

    def test_finalize_awards_success(self, monkeypatch):
        """League admin can finalize awards for an ended season."""
        from backend.database.db import get_db_session

        client, headers = _make_admin_client(monkeypatch)

        season_obj = MagicMock()
        season_obj.id = SEASON_ID
        season_obj.end_date = __import__("datetime").date(2020, 1, 1)

        app.dependency_overrides[get_db_session] = self._make_db_override(season_obj)
        try:
            monkeypatch.setattr(
                season_awards_service, "season_has_ended", lambda s: True, raising=True
            )

            async def fake_compute_awards(session, season_id):
                return [{"type": "mvp", "player_id": PLAYER_ID}]

            monkeypatch.setattr(
                season_awards_service, "compute_season_awards", fake_compute_awards, raising=True
            )

            response = client.post(f"/api/seasons/{SEASON_ID}/finalize-awards", headers=headers)
            assert response.status_code == 200
            body = response.json()
            assert isinstance(body, list)
            assert body[0]["type"] == "mvp"
        finally:
            app.dependency_overrides.pop(get_db_session, None)

    def test_finalize_awards_season_not_ended_returns_400(self, monkeypatch):
        """Returns 400 when the season has not yet ended."""
        from backend.database.db import get_db_session

        client, headers = _make_admin_client(monkeypatch)

        season_obj = MagicMock()
        season_obj.id = SEASON_ID
        season_obj.end_date = __import__("datetime").date(2099, 12, 31)

        app.dependency_overrides[get_db_session] = self._make_db_override(season_obj)
        try:
            monkeypatch.setattr(
                season_awards_service, "season_has_ended", lambda s: False, raising=True
            )

            response = client.post(f"/api/seasons/{SEASON_ID}/finalize-awards", headers=headers)
            assert response.status_code == 400
            assert "not ended" in response.json()["detail"].lower()
        finally:
            app.dependency_overrides.pop(get_db_session, None)

    def test_finalize_awards_season_not_found_returns_404(self, monkeypatch):
        """Returns 404 when the season does not exist."""
        from backend.database.db import get_db_session

        client, headers = _make_admin_client(monkeypatch)

        app.dependency_overrides[get_db_session] = self._make_db_override(None)
        try:
            response = client.post(f"/api/seasons/{SEASON_ID}/finalize-awards", headers=headers)
            assert response.status_code == 404
        finally:
            app.dependency_overrides.pop(get_db_session, None)

    def test_finalize_awards_unauthenticated(self):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.post(f"/api/seasons/{SEASON_ID}/finalize-awards")
        assert response.status_code in (401, 403)
