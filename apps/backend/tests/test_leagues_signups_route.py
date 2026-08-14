"""Route-layer tests for GET /api/leagues/{league_id}/signups.

Verifies:
- 401 when no auth token is provided
- 200 with empty lists when no active season exists for the league
- 200 with correctly shaped signups and schedule when data is present
- 404 when the authenticated user has no player record

Auth strategy: monkeypatch auth_service.verify_token + user_service.get_user_by_id
to simulate a logged-in user, identical to the pattern used in test_signups_routes.py.
DB queries inside the route are short-circuited by overriding get_db_session with a
MagicMock and monkeypatching the data_service helpers.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.main import app
from backend.database.db import get_db_session
from backend.services import auth_service, data_service, user_service

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

LEAGUE_ID = 7
SEASON_ID = 12
PLAYER_ID = 3
USER_ID = 1
PHONE = "+10000000099"

FAKE_USER = {
    "id": USER_ID,
    "phone_number": PHONE,
    "name": "Test Player",
    "email": "player@example.com",
    "is_verified": True,
    "created_at": "2024-01-01T00:00:00Z",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_fake_session() -> MagicMock:
    """Return an AsyncMock that simulates a SQLAlchemy async session."""
    session = MagicMock(spec=AsyncSession)
    session.execute = AsyncMock()
    return session


def _scalar_result(obj) -> MagicMock:
    """Wrap a single ORM object in a mock execute() result."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = obj
    return result


def _fake_player(player_id: int = PLAYER_ID, user_id: int = USER_ID) -> MagicMock:
    """Return a mock Player ORM object."""
    player = MagicMock()
    player.id = player_id
    player.user_id = user_id
    return player


def _fake_season(season_id: int = SEASON_ID, league_id: int = LEAGUE_ID) -> MagicMock:
    """Return a mock Season ORM object with date bounds that include today."""
    from datetime import date, timedelta

    season = MagicMock()
    season.id = season_id
    season.league_id = league_id
    season.start_date = date.today() - timedelta(days=30)
    season.end_date = date.today() + timedelta(days=30)
    return season


def _make_user_client(monkeypatch) -> tuple[TestClient, dict]:
    """Return (TestClient, auth_headers) for a plain authenticated user."""

    def fake_verify_token(token: str) -> dict:
        return {"user_id": USER_ID, "phone_number": PHONE}

    async def fake_get_user_by_id(session, uid: int) -> dict:
        return FAKE_USER

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
    return TestClient(app), {"Authorization": "Bearer dummy"}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestGetLeagueSignupsAuth:
    """Auth guard tests for GET /api/leagues/{league_id}/signups."""

    def test_no_token_returns_401_or_403(self):
        """Request without bearer token is rejected before reaching the route."""
        client = TestClient(app)
        response = client.get(f"/api/leagues/{LEAGUE_ID}/signups")
        assert response.status_code in (401, 403)


class TestGetLeagueSignupsNoActiveSeason:
    """When no active season exists, the endpoint returns empty lists."""

    def test_returns_empty_lists_when_no_active_season(self, monkeypatch):
        """No active season → 200 with signups=[] and schedule=[]."""
        client, headers = _make_user_client(monkeypatch)

        # execute calls: player lookup, then season lookup (returns None)
        session = _make_fake_session()
        session.execute.side_effect = [
            _scalar_result(_fake_player()),
            _scalar_result(None),  # no active season
        ]
        app.dependency_overrides[get_db_session] = lambda: session

        try:
            response = client.get(f"/api/leagues/{LEAGUE_ID}/signups", headers=headers)
            assert response.status_code == 200
            body = response.json()
            assert body == {"signups": [], "schedule": []}
        finally:
            app.dependency_overrides.pop(get_db_session, None)


class TestGetLeagueSignupsWithData:
    """When an active season exists, the endpoint returns shaped data."""

    def test_returns_signups_and_schedule_shape(self, monkeypatch):
        """Active season with one signup and one schedule row → correct response shape."""
        client, headers = _make_user_client(monkeypatch)

        MOCK_SIGNUP = {
            "id": 55,
            "season_id": SEASON_ID,
            "scheduled_datetime": "2030-07-10T18:00:00",
            "duration_hours": 2.0,
            "court_id": None,
            "court_name": "Beach Court 1",
            "player_count": 4,
            "is_open": True,
            "is_past": False,
            "open_signups_at": None,
            "weekly_schedule_id": None,
            "created_at": "2030-01-01T00:00:00",
            "updated_at": "2030-01-01T00:00:00",
            "players": [
                {
                    "player_id": PLAYER_ID,
                    "player_name": "Test Player",
                    "signed_up_at": "2030-07-01T10:00:00",
                }
            ],
        }

        MOCK_SCHEDULE = [
            {
                "id": 1,
                "season_id": SEASON_ID,
                "day_of_week": 3,  # Thursday
                "start_time": "18:00",
                "duration_hours": 2.0,
                "court_id": None,
                "open_signups_mode": "auto_after_last_session",
                "open_signups_day_of_week": None,
                "open_signups_time": None,
                "start_date": "2030-01-01",
                "end_date": "2030-12-31",
                "created_at": "2030-01-01T00:00:00",
                "updated_at": "2030-01-01T00:00:00",
            }
        ]

        # Stub service calls
        async def fake_get_signups(session, season_id, upcoming_only=False, include_players=False):
            return [MOCK_SIGNUP]

        async def fake_get_weekly_schedules(session, season_id):
            return MOCK_SCHEDULE

        monkeypatch.setattr(data_service, "get_signups", fake_get_signups, raising=True)
        monkeypatch.setattr(
            data_service, "get_weekly_schedules", fake_get_weekly_schedules, raising=True
        )

        # DB session: player lookup then season lookup
        session = _make_fake_session()
        session.execute.side_effect = [
            _scalar_result(_fake_player()),
            _scalar_result(_fake_season()),
        ]
        app.dependency_overrides[get_db_session] = lambda: session

        try:
            response = client.get(f"/api/leagues/{LEAGUE_ID}/signups", headers=headers)
            assert response.status_code == 200
            body = response.json()

            # Validate top-level keys
            assert "signups" in body
            assert "schedule" in body

            # Validate signup item
            assert len(body["signups"]) == 1
            signup_item = body["signups"][0]
            assert signup_item["id"] == 55
            assert signup_item["user_status"] == "signed_up"  # PLAYER_ID is in players list
            assert signup_item["player_count"] == 4
            assert signup_item["court_name"] == "Beach Court 1"
            assert signup_item["is_open"] is True

            # Validate schedule item
            assert len(body["schedule"]) == 1
            sched_item = body["schedule"][0]
            assert sched_item["day_of_week"] == "Thursday"
            assert sched_item["time_label"] == "6:00 PM"
            assert sched_item["court_name"] is None
        finally:
            app.dependency_overrides.pop(get_db_session, None)

    def test_user_status_none_when_not_signed_up(self, monkeypatch):
        """When the current player is NOT in the signup's players list, user_status is 'none'."""
        client, headers = _make_user_client(monkeypatch)

        MOCK_SIGNUP_NO_PLAYER = {
            "id": 60,
            "season_id": SEASON_ID,
            "scheduled_datetime": "2030-08-01T10:00:00",
            "duration_hours": 2.0,
            "court_id": None,
            "court_name": None,
            "player_count": 2,
            "is_open": True,
            "is_past": False,
            "open_signups_at": None,
            "weekly_schedule_id": None,
            "created_at": "2030-01-01T00:00:00",
            "updated_at": "2030-01-01T00:00:00",
            "players": [
                {
                    "player_id": 999,  # different player
                    "player_name": "Other Player",
                    "signed_up_at": "2030-07-15T10:00:00",
                }
            ],
        }

        async def fake_get_signups(session, season_id, upcoming_only=False, include_players=False):
            return [MOCK_SIGNUP_NO_PLAYER]

        async def fake_get_weekly_schedules(session, season_id):
            return []

        monkeypatch.setattr(data_service, "get_signups", fake_get_signups, raising=True)
        monkeypatch.setattr(
            data_service, "get_weekly_schedules", fake_get_weekly_schedules, raising=True
        )

        session = _make_fake_session()
        session.execute.side_effect = [
            _scalar_result(_fake_player()),
            _scalar_result(_fake_season()),
        ]
        app.dependency_overrides[get_db_session] = lambda: session

        try:
            response = client.get(f"/api/leagues/{LEAGUE_ID}/signups", headers=headers)
            assert response.status_code == 200
            body = response.json()
            assert body["signups"][0]["user_status"] == "none"
        finally:
            app.dependency_overrides.pop(get_db_session, None)


class TestGetLeagueSignupsPlayerNotFound:
    """When the auth user has no player record, returns 404."""

    def test_returns_404_when_player_not_found(self, monkeypatch):
        """Player lookup returns None → 404 response."""
        client, headers = _make_user_client(monkeypatch)

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(None)  # no player record
        app.dependency_overrides[get_db_session] = lambda: session

        try:
            response = client.get(f"/api/leagues/{LEAGUE_ID}/signups", headers=headers)
            assert response.status_code == 404
        finally:
            app.dependency_overrides.pop(get_db_session, None)
