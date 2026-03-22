"""Route-layer tests for signups.py endpoints.

Service logic is tested elsewhere. These tests verify the HTTP layer:
auth guards, status codes, and response shapes.

Auth strategy
-------------
Endpoints guarded by factory deps (make_require_league_admin_from_season,
make_require_league_member_from_season, make_require_league_admin_from_schedule,
make_require_league_admin_from_signup) perform DB queries before the system-admin
check. The helper ``_make_admin_client`` monkeypatches auth_service.verify_token,
user_service.get_user_by_id, and data_service.get_setting to make the user appear
as a system admin — but the season/schedule/signup lookup still happens.

To avoid needing a real DB, happy-path tests for factory-dep endpoints also
monkeypatch the underlying DB model queries via the session (using a fake
get_db_session). For auth-guard tests (no token), the request is rejected before
any DB query, so those always pass without a real DB.

Public endpoints (get_current_user_optional) work without auth and without DB
when the service layer is also monkeypatched.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.main import app
from backend.api.auth_dependencies import (
    get_current_user_optional,
)
from backend.database.db import get_db_session
from backend.services import auth_service, data_service, user_service

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SEASON_ID = 10
SCHEDULE_ID = 20
SIGNUP_ID = 30
PLAYER_ID = 5
USER_ID = 1
PHONE = "+10000000001"

FAKE_USER = {
    "id": USER_ID,
    "phone_number": PHONE,
    "name": "Test Admin",
    "email": "admin@example.com",
    "is_verified": True,
    "created_at": "2020-01-01T00:00:00Z",
}

# ---------------------------------------------------------------------------
# Shared fake DB session
# ---------------------------------------------------------------------------


def _make_fake_session():
    """Return an AsyncMock that simulates a SQLAlchemy async session."""
    session = MagicMock(spec=AsyncSession)
    session.execute = AsyncMock()
    return session


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_admin_client(monkeypatch, phone: str = PHONE, user_id: int = USER_ID):
    """Return (TestClient, auth_headers) with the user treated as a system admin.

    Monkeypatches auth_service, user_service, and data_service so the factory
    auth deps recognise the bearer token and short-circuit as system admin.
    The caller must still stub out any DB queries inside the dep (Season/Signup
    lookups) by overriding get_db_session.
    """

    def fake_verify_token(token: str) -> dict:
        return {"user_id": user_id, "phone_number": phone}

    async def fake_get_user_by_id(session, uid: int) -> dict:
        return FAKE_USER

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
        return FAKE_USER

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
    return TestClient(app), {"Authorization": "Bearer dummy"}


def _fake_season_row(season_id: int = SEASON_ID, league_id: int = 99):
    """Return a mock Season ORM object."""
    season = MagicMock()
    season.id = season_id
    season.league_id = league_id
    return season


def _fake_schedule_row(schedule_id: int = SCHEDULE_ID, season_id: int = SEASON_ID):
    """Return a mock WeeklySchedule ORM object."""
    schedule = MagicMock()
    schedule.id = schedule_id
    schedule.season_id = season_id
    return schedule


def _fake_signup_row(signup_id: int = SIGNUP_ID, season_id: int = SEASON_ID):
    """Return a mock Signup ORM object."""
    signup = MagicMock()
    signup.id = signup_id
    signup.season_id = season_id
    return signup


def _fake_player_row(player_id: int = PLAYER_ID, user_id: int = USER_ID):
    """Return a mock Player ORM object."""
    player = MagicMock()
    player.id = player_id
    player.user_id = user_id
    return player


def _scalar_result(obj):
    """Wrap an ORM object in a mock execute() result."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = obj
    return result


def _make_session_with_season(season=None):
    """Return a fake DB session whose execute() returns a Season result."""
    session = _make_fake_session()
    session.execute.return_value = _scalar_result(season or _fake_season_row())
    return session


# ---------------------------------------------------------------------------
# Helper: minimal WeeklySchedule + Signup response dicts
# ---------------------------------------------------------------------------

WEEKLY_SCHEDULE_RESPONSE = {
    "id": SCHEDULE_ID,
    "season_id": SEASON_ID,
    "day_of_week": 1,
    "start_time": "08:00",
    "duration_hours": 2.0,
    "court_id": None,
    "open_signups_mode": "auto_after_last_session",
    "open_signups_day_of_week": None,
    "open_signups_time": None,
    "start_date": "2025-01-06",
    "end_date": "2025-06-30",
    "created_at": "2025-01-01T00:00:00Z",
    "updated_at": "2025-01-01T00:00:00Z",
}

SIGNUP_RESPONSE = {
    "id": SIGNUP_ID,
    "season_id": SEASON_ID,
    "weekly_schedule_id": None,
    "scheduled_datetime": "2025-03-01T09:00:00Z",
    "duration_hours": 2.0,
    "court_id": None,
    "open_signups_at": None,
    "player_count": 0,
    "is_open": True,
    "is_past": False,
    "created_at": "2025-01-01T00:00:00Z",
    "updated_at": "2025-01-01T00:00:00Z",
    "players": [],
}

WEEKLY_SCHEDULE_PAYLOAD = {
    "day_of_week": 1,
    "start_time": "08:00",
    "duration_hours": 2.0,
    "open_signups_mode": "auto_after_last_session",
    "start_date": "2025-01-06",
    "end_date": "2025-06-30",
}

SIGNUP_CREATE_PAYLOAD = {
    "scheduled_datetime": "2025-03-01T09:00:00Z",
    "duration_hours": 2.0,
}


# ===========================================================================
# Weekly Schedule endpoints
# ===========================================================================


class TestCreateWeeklySchedule:
    """POST /api/seasons/{season_id}/weekly-schedules"""

    def test_no_token_returns_401_or_403(self):
        """Missing bearer token is rejected before DB access."""
        client = TestClient(app)
        response = client.post(
            f"/api/seasons/{SEASON_ID}/weekly-schedules",
            json=WEEKLY_SCHEDULE_PAYLOAD,
        )
        assert response.status_code in (401, 403)

    def test_admin_creates_schedule(self, monkeypatch):
        """System admin with valid token and mocked DB can create a schedule."""
        client, headers = _make_admin_client(monkeypatch)

        # Provide fake DB session: first call returns season, second returns player
        session = _make_fake_session()
        season_result = _scalar_result(_fake_season_row())
        player_result = _scalar_result(_fake_player_row())
        session.execute.side_effect = [season_result, player_result]

        app.dependency_overrides[get_db_session] = lambda: session

        async def fake_create_weekly_schedule(session, **kwargs):
            return WEEKLY_SCHEDULE_RESPONSE

        monkeypatch.setattr(
            data_service, "create_weekly_schedule", fake_create_weekly_schedule, raising=True
        )

        try:
            response = client.post(
                f"/api/seasons/{SEASON_ID}/weekly-schedules",
                json=WEEKLY_SCHEDULE_PAYLOAD,
                headers=headers,
            )
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == SCHEDULE_ID
            assert data["season_id"] == SEASON_ID
        finally:
            app.dependency_overrides.pop(get_db_session, None)

    def test_season_not_found_returns_404(self, monkeypatch):
        """When season lookup returns None, the dep raises 404."""
        client, headers = _make_admin_client(monkeypatch)

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(None)  # season not found
        app.dependency_overrides[get_db_session] = lambda: session

        try:
            response = client.post(
                f"/api/seasons/{SEASON_ID}/weekly-schedules",
                json=WEEKLY_SCHEDULE_PAYLOAD,
                headers=headers,
            )
            assert response.status_code == 404
        finally:
            app.dependency_overrides.pop(get_db_session, None)

    def test_service_value_error_returns_400(self, monkeypatch):
        """ValueError from service is surfaced as 400."""
        client, headers = _make_admin_client(monkeypatch)

        session = _make_fake_session()
        session.execute.side_effect = [
            _scalar_result(_fake_season_row()),
            _scalar_result(_fake_player_row()),
        ]
        app.dependency_overrides[get_db_session] = lambda: session

        async def fake_create_weekly_schedule(session, **kwargs):
            raise ValueError("bad date range")

        monkeypatch.setattr(
            data_service, "create_weekly_schedule", fake_create_weekly_schedule, raising=True
        )

        try:
            response = client.post(
                f"/api/seasons/{SEASON_ID}/weekly-schedules",
                json=WEEKLY_SCHEDULE_PAYLOAD,
                headers=headers,
            )
            assert response.status_code == 400
            assert "bad date range" in response.json()["detail"]
        finally:
            app.dependency_overrides.pop(get_db_session, None)


class TestListWeeklySchedules:
    """GET /api/seasons/{season_id}/weekly-schedules"""

    def test_no_token_returns_401_or_403(self):
        """Missing bearer token is rejected."""
        client = TestClient(app)
        response = client.get(f"/api/seasons/{SEASON_ID}/weekly-schedules")
        assert response.status_code in (401, 403)

    def test_member_lists_schedules(self, monkeypatch):
        """System admin with mocked DB gets a list of schedules."""
        client, headers = _make_admin_client(monkeypatch)

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(_fake_season_row())
        app.dependency_overrides[get_db_session] = lambda: session

        async def fake_get_weekly_schedules(session, season_id):
            return [WEEKLY_SCHEDULE_RESPONSE]

        monkeypatch.setattr(
            data_service, "get_weekly_schedules", fake_get_weekly_schedules, raising=True
        )

        try:
            response = client.get(f"/api/seasons/{SEASON_ID}/weekly-schedules", headers=headers)
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            assert data[0]["id"] == SCHEDULE_ID
        finally:
            app.dependency_overrides.pop(get_db_session, None)


class TestUpdateWeeklySchedule:
    """PUT /api/weekly-schedules/{schedule_id}"""

    def test_no_token_returns_401_or_403(self):
        """Missing bearer token is rejected."""
        client = TestClient(app)
        response = client.put(
            f"/api/weekly-schedules/{SCHEDULE_ID}",
            json={"day_of_week": 2},
        )
        assert response.status_code in (401, 403)

    def test_admin_updates_schedule(self, monkeypatch):
        """System admin can update a schedule."""
        client, headers = _make_admin_client(monkeypatch)

        # execute calls: 1) schedule lookup, 2) season lookup (in dep), 3) player lookup (in route)
        session = _make_fake_session()
        updated = {**WEEKLY_SCHEDULE_RESPONSE, "day_of_week": 2}
        session.execute.side_effect = [
            _scalar_result(_fake_schedule_row()),
            _scalar_result(_fake_season_row()),
            _scalar_result(_fake_player_row()),
        ]
        app.dependency_overrides[get_db_session] = lambda: session

        async def fake_update_weekly_schedule(session, schedule_id, **kwargs):
            return updated

        monkeypatch.setattr(
            data_service, "update_weekly_schedule", fake_update_weekly_schedule, raising=True
        )

        try:
            response = client.put(
                f"/api/weekly-schedules/{SCHEDULE_ID}",
                json={"day_of_week": 2},
                headers=headers,
            )
            assert response.status_code == 200
            assert response.json()["day_of_week"] == 2
        finally:
            app.dependency_overrides.pop(get_db_session, None)

    def test_schedule_not_found_in_dep_returns_404(self, monkeypatch):
        """When dep cannot find the schedule, raises 404."""
        client, headers = _make_admin_client(monkeypatch)

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(None)  # schedule not found
        app.dependency_overrides[get_db_session] = lambda: session

        try:
            response = client.put(
                f"/api/weekly-schedules/{SCHEDULE_ID}",
                json={"day_of_week": 2},
                headers=headers,
            )
            assert response.status_code == 404
        finally:
            app.dependency_overrides.pop(get_db_session, None)


class TestDeleteWeeklySchedule:
    """DELETE /api/weekly-schedules/{schedule_id}"""

    def test_no_token_returns_401_or_403(self):
        """Missing bearer token is rejected."""
        client = TestClient(app)
        response = client.delete(f"/api/weekly-schedules/{SCHEDULE_ID}")
        assert response.status_code in (401, 403)

    def test_admin_deletes_schedule(self, monkeypatch):
        """System admin can delete a schedule."""
        client, headers = _make_admin_client(monkeypatch)

        session = _make_fake_session()
        session.execute.side_effect = [
            _scalar_result(_fake_schedule_row()),
            _scalar_result(_fake_season_row()),
        ]
        app.dependency_overrides[get_db_session] = lambda: session

        async def fake_delete_weekly_schedule(session, schedule_id):
            return True

        monkeypatch.setattr(
            data_service, "delete_weekly_schedule", fake_delete_weekly_schedule, raising=True
        )

        try:
            response = client.delete(f"/api/weekly-schedules/{SCHEDULE_ID}", headers=headers)
            assert response.status_code == 200
            assert response.json()["status"] == "success"
        finally:
            app.dependency_overrides.pop(get_db_session, None)

    def test_schedule_not_found_returns_404(self, monkeypatch):
        """Service returning False surfaces as 404."""
        client, headers = _make_admin_client(monkeypatch)

        session = _make_fake_session()
        session.execute.side_effect = [
            _scalar_result(_fake_schedule_row()),
            _scalar_result(_fake_season_row()),
        ]
        app.dependency_overrides[get_db_session] = lambda: session

        async def fake_delete_weekly_schedule(session, schedule_id):
            return False

        monkeypatch.setattr(
            data_service, "delete_weekly_schedule", fake_delete_weekly_schedule, raising=True
        )

        try:
            response = client.delete(f"/api/weekly-schedules/{SCHEDULE_ID}", headers=headers)
            assert response.status_code == 404
        finally:
            app.dependency_overrides.pop(get_db_session, None)


# ===========================================================================
# Signup endpoints
# ===========================================================================


class TestCreateSignup:
    """POST /api/seasons/{season_id}/signups"""

    def test_no_token_returns_401_or_403(self):
        """Missing bearer token is rejected."""
        client = TestClient(app)
        response = client.post(
            f"/api/seasons/{SEASON_ID}/signups",
            json=SIGNUP_CREATE_PAYLOAD,
        )
        assert response.status_code in (401, 403)

    def test_member_creates_signup(self, monkeypatch):
        """Authenticated league member can create a signup."""
        client, headers = _make_admin_client(monkeypatch)

        session = _make_fake_session()
        session.execute.side_effect = [
            _scalar_result(_fake_season_row()),
            _scalar_result(_fake_player_row()),
        ]
        app.dependency_overrides[get_db_session] = lambda: session

        async def fake_create_signup(session, season_id, **kwargs):
            return SIGNUP_RESPONSE

        monkeypatch.setattr(data_service, "create_signup", fake_create_signup, raising=True)

        try:
            response = client.post(
                f"/api/seasons/{SEASON_ID}/signups",
                json=SIGNUP_CREATE_PAYLOAD,
                headers=headers,
            )
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == SIGNUP_ID
            assert data["season_id"] == SEASON_ID
        finally:
            app.dependency_overrides.pop(get_db_session, None)

    def test_service_value_error_returns_400(self, monkeypatch):
        """ValueError from service is surfaced as 400."""
        client, headers = _make_admin_client(monkeypatch)

        session = _make_fake_session()
        session.execute.side_effect = [
            _scalar_result(_fake_season_row()),
            _scalar_result(_fake_player_row()),
        ]
        app.dependency_overrides[get_db_session] = lambda: session

        async def fake_create_signup(session, season_id, **kwargs):
            raise ValueError("invalid datetime")

        monkeypatch.setattr(data_service, "create_signup", fake_create_signup, raising=True)

        try:
            response = client.post(
                f"/api/seasons/{SEASON_ID}/signups",
                json=SIGNUP_CREATE_PAYLOAD,
                headers=headers,
            )
            assert response.status_code == 400
        finally:
            app.dependency_overrides.pop(get_db_session, None)


class TestListSignups:
    """GET /api/seasons/{season_id}/signups — public (get_current_user_optional)"""

    def test_no_auth_returns_list(self, monkeypatch):
        """Public endpoint returns signups without authentication."""

        async def fake_get_signups(session, season_id, **kwargs):
            return [SIGNUP_RESPONSE]

        monkeypatch.setattr(data_service, "get_signups", fake_get_signups, raising=True)

        app.dependency_overrides[get_current_user_optional] = lambda: None
        app.dependency_overrides[get_db_session] = lambda: _make_fake_session()

        try:
            client = TestClient(app)
            response = client.get(f"/api/seasons/{SEASON_ID}/signups")
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            assert data[0]["id"] == SIGNUP_ID
        finally:
            app.dependency_overrides.pop(get_current_user_optional, None)
            app.dependency_overrides.pop(get_db_session, None)

    def test_upcoming_only_filter_passed_through(self, monkeypatch):
        """upcoming_only query param is forwarded to the service."""
        captured: dict = {}

        async def fake_get_signups(session, season_id, upcoming_only=False, **kwargs):
            captured["upcoming_only"] = upcoming_only
            return []

        monkeypatch.setattr(data_service, "get_signups", fake_get_signups, raising=True)

        app.dependency_overrides[get_current_user_optional] = lambda: None
        app.dependency_overrides[get_db_session] = lambda: _make_fake_session()

        try:
            client = TestClient(app)
            response = client.get(f"/api/seasons/{SEASON_ID}/signups?upcoming_only=true")
            assert response.status_code == 200
            assert captured.get("upcoming_only") is True
        finally:
            app.dependency_overrides.pop(get_current_user_optional, None)
            app.dependency_overrides.pop(get_db_session, None)

    def test_past_only_filter_passed_through(self, monkeypatch):
        """past_only query param is forwarded to the service."""
        captured: dict = {}

        async def fake_get_signups(session, season_id, past_only=False, **kwargs):
            captured["past_only"] = past_only
            return []

        monkeypatch.setattr(data_service, "get_signups", fake_get_signups, raising=True)

        app.dependency_overrides[get_current_user_optional] = lambda: None
        app.dependency_overrides[get_db_session] = lambda: _make_fake_session()

        try:
            client = TestClient(app)
            response = client.get(f"/api/seasons/{SEASON_ID}/signups?past_only=true")
            assert response.status_code == 200
            assert captured.get("past_only") is True
        finally:
            app.dependency_overrides.pop(get_current_user_optional, None)
            app.dependency_overrides.pop(get_db_session, None)


class TestGetSignup:
    """GET /api/signups/{signup_id} — public (get_current_user_optional)"""

    def test_no_auth_returns_signup(self, monkeypatch):
        """Public endpoint returns signup detail without authentication."""
        signup_with_players = {**SIGNUP_RESPONSE, "players": []}

        async def fake_get_signup(session, signup_id, include_players=False):
            return signup_with_players

        monkeypatch.setattr(data_service, "get_signup", fake_get_signup, raising=True)

        app.dependency_overrides[get_current_user_optional] = lambda: None
        app.dependency_overrides[get_db_session] = lambda: _make_fake_session()

        try:
            client = TestClient(app)
            response = client.get(f"/api/signups/{SIGNUP_ID}")
            assert response.status_code == 200
            assert response.json()["id"] == SIGNUP_ID
        finally:
            app.dependency_overrides.pop(get_current_user_optional, None)
            app.dependency_overrides.pop(get_db_session, None)

    def test_signup_not_found_returns_404(self, monkeypatch):
        """Service returning None surfaces as 404."""

        async def fake_get_signup(session, signup_id, include_players=False):
            return None

        monkeypatch.setattr(data_service, "get_signup", fake_get_signup, raising=True)

        app.dependency_overrides[get_current_user_optional] = lambda: None
        app.dependency_overrides[get_db_session] = lambda: _make_fake_session()

        try:
            client = TestClient(app)
            response = client.get(f"/api/signups/{SIGNUP_ID}")
            assert response.status_code == 404
        finally:
            app.dependency_overrides.pop(get_current_user_optional, None)
            app.dependency_overrides.pop(get_db_session, None)


class TestUpdateSignup:
    """PUT /api/signups/{signup_id}"""

    def test_no_token_returns_401_or_403(self):
        """Missing bearer token is rejected."""
        client = TestClient(app)
        response = client.put(f"/api/signups/{SIGNUP_ID}", json={"duration_hours": 3.0})
        assert response.status_code in (401, 403)

    def test_admin_updates_signup(self, monkeypatch):
        """System admin can update a signup."""
        client, headers = _make_admin_client(monkeypatch)

        # execute calls: 1) signup lookup, 2) season lookup (in dep), 3) player lookup (in route)
        updated = {**SIGNUP_RESPONSE, "duration_hours": 3.0}
        session = _make_fake_session()
        session.execute.side_effect = [
            _scalar_result(_fake_signup_row()),
            _scalar_result(_fake_season_row()),
            _scalar_result(_fake_player_row()),
        ]
        app.dependency_overrides[get_db_session] = lambda: session

        async def fake_update_signup(session, signup_id, **kwargs):
            return updated

        monkeypatch.setattr(data_service, "update_signup", fake_update_signup, raising=True)

        try:
            response = client.put(
                f"/api/signups/{SIGNUP_ID}",
                json={"duration_hours": 3.0},
                headers=headers,
            )
            assert response.status_code == 200
            assert response.json()["duration_hours"] == 3.0
        finally:
            app.dependency_overrides.pop(get_db_session, None)

    def test_signup_not_found_in_dep_returns_404(self, monkeypatch):
        """When dep cannot find the signup, raises 404."""
        client, headers = _make_admin_client(monkeypatch)

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(None)  # signup not found
        app.dependency_overrides[get_db_session] = lambda: session

        try:
            response = client.put(
                f"/api/signups/{SIGNUP_ID}",
                json={"duration_hours": 3.0},
                headers=headers,
            )
            assert response.status_code == 404
        finally:
            app.dependency_overrides.pop(get_db_session, None)

    def test_service_not_found_returns_404(self, monkeypatch):
        """Service returning None for update surfaces as 404."""
        client, headers = _make_admin_client(monkeypatch)

        session = _make_fake_session()
        session.execute.side_effect = [
            _scalar_result(_fake_signup_row()),
            _scalar_result(_fake_season_row()),
            _scalar_result(_fake_player_row()),
        ]
        app.dependency_overrides[get_db_session] = lambda: session

        async def fake_update_signup(session, signup_id, **kwargs):
            return None

        monkeypatch.setattr(data_service, "update_signup", fake_update_signup, raising=True)

        try:
            response = client.put(
                f"/api/signups/{SIGNUP_ID}",
                json={"duration_hours": 3.0},
                headers=headers,
            )
            assert response.status_code == 404
        finally:
            app.dependency_overrides.pop(get_db_session, None)


class TestDeleteSignup:
    """DELETE /api/signups/{signup_id}"""

    def test_no_token_returns_401_or_403(self):
        """Missing bearer token is rejected."""
        client = TestClient(app)
        response = client.delete(f"/api/signups/{SIGNUP_ID}")
        assert response.status_code in (401, 403)

    def test_admin_deletes_signup(self, monkeypatch):
        """System admin can delete a signup."""
        client, headers = _make_admin_client(monkeypatch)

        session = _make_fake_session()
        session.execute.side_effect = [
            _scalar_result(_fake_signup_row()),
            _scalar_result(_fake_season_row()),
        ]
        app.dependency_overrides[get_db_session] = lambda: session

        async def fake_delete_signup(session, signup_id):
            return True

        monkeypatch.setattr(data_service, "delete_signup", fake_delete_signup, raising=True)

        try:
            response = client.delete(f"/api/signups/{SIGNUP_ID}", headers=headers)
            assert response.status_code == 200
            assert response.json()["status"] == "success"
        finally:
            app.dependency_overrides.pop(get_db_session, None)

    def test_signup_not_found_returns_404(self, monkeypatch):
        """Service returning False surfaces as 404."""
        client, headers = _make_admin_client(monkeypatch)

        session = _make_fake_session()
        session.execute.side_effect = [
            _scalar_result(_fake_signup_row()),
            _scalar_result(_fake_season_row()),
        ]
        app.dependency_overrides[get_db_session] = lambda: session

        async def fake_delete_signup(session, signup_id):
            return False

        monkeypatch.setattr(data_service, "delete_signup", fake_delete_signup, raising=True)

        try:
            response = client.delete(f"/api/signups/{SIGNUP_ID}", headers=headers)
            assert response.status_code == 404
        finally:
            app.dependency_overrides.pop(get_db_session, None)


class TestSignupPlayer:
    """POST /api/signups/{signup_id}/signup"""

    def test_no_token_returns_401_or_403(self):
        """Missing bearer token is rejected."""
        client = TestClient(app)
        response = client.post(f"/api/signups/{SIGNUP_ID}/signup")
        assert response.status_code in (401, 403)

    def test_authenticated_user_signs_up(self, monkeypatch):
        """Any authenticated user can sign themselves up."""
        client, headers = _make_user_client(monkeypatch)

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(_fake_player_row())
        app.dependency_overrides[get_db_session] = lambda: session

        async def fake_signup_player(session, signup_id, player_id, creator_player_id):
            return True

        monkeypatch.setattr(data_service, "signup_player", fake_signup_player, raising=True)

        try:
            response = client.post(f"/api/signups/{SIGNUP_ID}/signup", headers=headers)
            assert response.status_code == 200
            assert response.json()["status"] == "success"
        finally:
            app.dependency_overrides.pop(get_db_session, None)

    def test_already_signed_up_returns_already_status(self, monkeypatch):
        """When service returns False, the route returns already_signed_up status."""
        client, headers = _make_user_client(monkeypatch)

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(_fake_player_row())
        app.dependency_overrides[get_db_session] = lambda: session

        async def fake_signup_player(session, signup_id, player_id, creator_player_id):
            return False

        monkeypatch.setattr(data_service, "signup_player", fake_signup_player, raising=True)

        try:
            response = client.post(f"/api/signups/{SIGNUP_ID}/signup", headers=headers)
            assert response.status_code == 200
            assert response.json()["status"] == "already_signed_up"
        finally:
            app.dependency_overrides.pop(get_db_session, None)

    def test_value_error_returns_400(self, monkeypatch):
        """ValueError (e.g. signups not open yet) surfaces as 400."""
        client, headers = _make_user_client(monkeypatch)

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(_fake_player_row())
        app.dependency_overrides[get_db_session] = lambda: session

        async def fake_signup_player(session, signup_id, player_id, creator_player_id):
            raise ValueError("signups not open yet")

        monkeypatch.setattr(data_service, "signup_player", fake_signup_player, raising=True)

        try:
            response = client.post(f"/api/signups/{SIGNUP_ID}/signup", headers=headers)
            assert response.status_code == 400
        finally:
            app.dependency_overrides.pop(get_db_session, None)

    def test_player_not_found_returns_404(self, monkeypatch):
        """If the user has no player profile, route returns 404."""
        client, headers = _make_user_client(monkeypatch)

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(None)  # no player
        app.dependency_overrides[get_db_session] = lambda: session

        try:
            response = client.post(f"/api/signups/{SIGNUP_ID}/signup", headers=headers)
            assert response.status_code == 404
        finally:
            app.dependency_overrides.pop(get_db_session, None)


class TestDropoutPlayer:
    """POST /api/signups/{signup_id}/dropout"""

    def test_no_token_returns_401_or_403(self):
        """Missing bearer token is rejected."""
        client = TestClient(app)
        response = client.post(f"/api/signups/{SIGNUP_ID}/dropout")
        assert response.status_code in (401, 403)

    def test_authenticated_user_drops_out(self, monkeypatch):
        """Any authenticated user can drop out of a signup."""
        client, headers = _make_user_client(monkeypatch)

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(_fake_player_row())
        app.dependency_overrides[get_db_session] = lambda: session

        async def fake_dropout_player(session, signup_id, player_id, creator_player_id):
            return True

        monkeypatch.setattr(data_service, "dropout_player", fake_dropout_player, raising=True)

        try:
            response = client.post(f"/api/signups/{SIGNUP_ID}/dropout", headers=headers)
            assert response.status_code == 200
            assert response.json()["status"] == "success"
        finally:
            app.dependency_overrides.pop(get_db_session, None)

    def test_not_signed_up_returns_not_signed_up_status(self, monkeypatch):
        """When service returns False, the route returns not_signed_up status."""
        client, headers = _make_user_client(monkeypatch)

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(_fake_player_row())
        app.dependency_overrides[get_db_session] = lambda: session

        async def fake_dropout_player(session, signup_id, player_id, creator_player_id):
            return False

        monkeypatch.setattr(data_service, "dropout_player", fake_dropout_player, raising=True)

        try:
            response = client.post(f"/api/signups/{SIGNUP_ID}/dropout", headers=headers)
            assert response.status_code == 200
            assert response.json()["status"] == "not_signed_up"
        finally:
            app.dependency_overrides.pop(get_db_session, None)

    def test_value_error_returns_400(self, monkeypatch):
        """ValueError from service surfaces as 400."""
        client, headers = _make_user_client(monkeypatch)

        session = _make_fake_session()
        session.execute.return_value = _scalar_result(_fake_player_row())
        app.dependency_overrides[get_db_session] = lambda: session

        async def fake_dropout_player(session, signup_id, player_id, creator_player_id):
            raise ValueError("dropout window closed")

        monkeypatch.setattr(data_service, "dropout_player", fake_dropout_player, raising=True)

        try:
            response = client.post(f"/api/signups/{SIGNUP_ID}/dropout", headers=headers)
            assert response.status_code == 400
        finally:
            app.dependency_overrides.pop(get_db_session, None)


class TestGetSignupPlayers:
    """GET /api/signups/{signup_id}/players — public (get_current_user_optional)"""

    def test_no_auth_returns_players(self, monkeypatch):
        """Public endpoint returns players list without authentication."""
        players = [
            {
                "player_id": PLAYER_ID,
                "player_name": "Alice",
                "signed_up_at": "2025-01-01T00:00:00Z",
            }
        ]

        async def fake_get_signup_players(session, signup_id):
            return players

        monkeypatch.setattr(
            data_service, "get_signup_players", fake_get_signup_players, raising=True
        )

        app.dependency_overrides[get_current_user_optional] = lambda: None
        app.dependency_overrides[get_db_session] = lambda: _make_fake_session()

        try:
            client = TestClient(app)
            response = client.get(f"/api/signups/{SIGNUP_ID}/players")
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            assert data[0]["player_id"] == PLAYER_ID
        finally:
            app.dependency_overrides.pop(get_current_user_optional, None)
            app.dependency_overrides.pop(get_db_session, None)

    def test_empty_signup_returns_empty_list(self, monkeypatch):
        """Signup with no players returns an empty list."""

        async def fake_get_signup_players(session, signup_id):
            return []

        monkeypatch.setattr(
            data_service, "get_signup_players", fake_get_signup_players, raising=True
        )

        app.dependency_overrides[get_current_user_optional] = lambda: None
        app.dependency_overrides[get_db_session] = lambda: _make_fake_session()

        try:
            client = TestClient(app)
            response = client.get(f"/api/signups/{SIGNUP_ID}/players")
            assert response.status_code == 200
            assert response.json() == []
        finally:
            app.dependency_overrides.pop(get_current_user_optional, None)
            app.dependency_overrides.pop(get_db_session, None)


class TestGetSignupEvents:
    """GET /api/signups/{signup_id}/events — public (get_current_user_optional)"""

    def test_no_auth_returns_events(self, monkeypatch):
        """Public endpoint returns event log without authentication."""
        events = [
            {
                "id": 1,
                "player_id": PLAYER_ID,
                "player_name": "Alice",
                "event_type": "signup",
                "created_at": "2025-01-01T00:00:00Z",
                "created_by": None,
            }
        ]

        async def fake_get_signup_events(session, signup_id):
            return events

        monkeypatch.setattr(
            data_service, "get_signup_events", fake_get_signup_events, raising=True
        )

        app.dependency_overrides[get_current_user_optional] = lambda: None
        app.dependency_overrides[get_db_session] = lambda: _make_fake_session()

        try:
            client = TestClient(app)
            response = client.get(f"/api/signups/{SIGNUP_ID}/events")
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            assert data[0]["event_type"] == "signup"
        finally:
            app.dependency_overrides.pop(get_current_user_optional, None)
            app.dependency_overrides.pop(get_db_session, None)

    def test_empty_events_returns_empty_list(self, monkeypatch):
        """Signup with no events returns an empty list."""

        async def fake_get_signup_events(session, signup_id):
            return []

        monkeypatch.setattr(
            data_service, "get_signup_events", fake_get_signup_events, raising=True
        )

        app.dependency_overrides[get_current_user_optional] = lambda: None
        app.dependency_overrides[get_db_session] = lambda: _make_fake_session()

        try:
            client = TestClient(app)
            response = client.get(f"/api/signups/{SIGNUP_ID}/events")
            assert response.status_code == 200
            assert response.json() == []
        finally:
            app.dependency_overrides.pop(get_current_user_optional, None)
            app.dependency_overrides.pop(get_db_session, None)
