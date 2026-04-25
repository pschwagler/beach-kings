"""
Happy-path (and key error-case) tests for session route endpoints.

Coverage:
- GET  /api/leagues/{league_id}/sessions         (make_require_league_member)
- PATCH /api/leagues/{league_id}/sessions/{id}   (make_require_league_member) — submit/lock
- GET  /api/sessions/open                        (get_current_user)
- GET  /api/sessions/by-code/{code}              (get_current_user)
- GET  /api/sessions/{session_id}/matches        (get_current_user)
- GET  /api/sessions/{session_id}/participants   (get_current_user)
- DELETE /api/sessions/{session_id}/participants/{player_id} (get_current_user)
- POST /api/sessions/join                        (get_current_user)
- POST /api/sessions/{session_id}/invite         (get_current_user)
- POST /api/sessions/{session_id}/invite_batch   (get_current_user)
- POST /api/sessions                             (get_current_user) — create non-league session
- PATCH /api/sessions/{session_id}               (get_current_user) — update session
- DELETE /api/sessions/{session_id}              (get_current_user)

Auth strategy:
- League-scoped endpoints: monkeypatch verify_token + get_user_by_id + get_setting
  (system admin bypasses membership check in make_require_league_member/admin).
- Non-league endpoints: monkeypatch verify_token + get_user_by_id only.
"""

from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services import auth_service, user_service, data_service
from backend.services import notification_service


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_ADMIN_PHONE = "+10000000000"
_USER_ID = 1
_PLAYER_ID = 10
_LEAGUE_ID = 5
_SEASON_ID = 3
_SESSION_ID = 99
_AUTH_HEADER = {"Authorization": "Bearer dummy"}

_FAKE_USER = {
    "id": _USER_ID,
    "phone_number": _ADMIN_PHONE,
    "name": "Test User",
    "is_verified": True,
}

_FAKE_PLAYER = {"id": _PLAYER_ID, "full_name": "Test Player", "user_id": _USER_ID}

_ACTIVE_SESSION = {
    "id": _SESSION_ID,
    "name": "Test Session",
    "status": "ACTIVE",
    "season_id": _SEASON_ID,
    "court_id": None,
    "created_by": _PLAYER_ID,
    "code": "ABCD1234",
}


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------


def _patch_system_admin(monkeypatch):
    """Patch get_setting so the test user is recognised as a system admin."""

    async def fake_get_setting(session, key: str):
        if key in ("system_admin_phone_numbers", "system_admin_emails"):
            return _ADMIN_PHONE
        return None

    monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)


def _patch_base_auth(monkeypatch):
    """Patch token verification and user lookup (shared by all helpers)."""

    def fake_verify_token(token):
        return {"user_id": _USER_ID, "phone_number": _ADMIN_PHONE}

    async def fake_get_user_by_id(session, uid):
        return _FAKE_USER

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)


def _make_admin_client(monkeypatch):
    """Return (client, headers) with system-admin auth (bypasses league membership)."""
    _patch_base_auth(monkeypatch)
    _patch_system_admin(monkeypatch)
    return TestClient(app), _AUTH_HEADER


def _make_user_client(monkeypatch):
    """Return (client, headers) with basic auth (no system-admin)."""
    _patch_base_auth(monkeypatch)
    return TestClient(app), _AUTH_HEADER


def _patch_player(monkeypatch):
    """Patch get_player_by_user_id to return the fake player."""

    async def fake_get_player(session, user_id):
        return _FAKE_PLAYER

    monkeypatch.setattr(data_service, "get_player_by_user_id", fake_get_player, raising=True)


def _patch_notifications(monkeypatch):
    """Suppress real notification delivery."""

    async def fake_notify(*args, **kwargs):
        return None

    monkeypatch.setattr(
        notification_service,
        "notify_players_about_session_submitted",
        fake_notify,
        raising=True,
    )


# ---------------------------------------------------------------------------
# League-scoped session tests
# ---------------------------------------------------------------------------


class TestGetLeagueSessions:
    """GET /api/leagues/{league_id}/sessions"""

    def test_returns_session_list(self, monkeypatch):
        """Happy path: returns list of session dicts for the league."""
        from sqlalchemy.ext.asyncio import AsyncSession

        client, headers = _make_admin_client(monkeypatch)

        # Patch the DB execute at the route level by replacing the whole query
        # execution with a fake that returns no rows (empty list).
        original_execute = AsyncSession.execute

        async def fake_execute(self_session, query, *args, **kwargs):
            class FakeResult:
                def all(self_r):
                    return []

            return FakeResult()

        monkeypatch.setattr(AsyncSession, "execute", fake_execute, raising=True)

        response = client.get(f"/api/leagues/{_LEAGUE_ID}/sessions", headers=headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_active_filter_accepted(self, monkeypatch):
        """Query param ?active=true is accepted without error."""
        from sqlalchemy.ext.asyncio import AsyncSession

        client, headers = _make_admin_client(monkeypatch)

        async def fake_execute(self_session, query, *args, **kwargs):
            class FakeResult:
                def all(self_r):
                    return []

            return FakeResult()

        monkeypatch.setattr(AsyncSession, "execute", fake_execute, raising=True)

        response = client.get(f"/api/leagues/{_LEAGUE_ID}/sessions?active=true", headers=headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_requires_auth(self):
        """Returns 401 when no token is provided."""
        client = TestClient(app)
        response = client.get(f"/api/leagues/{_LEAGUE_ID}/sessions")
        assert response.status_code == 401


class TestEndLeagueSession:
    """PATCH /api/leagues/{league_id}/sessions/{session_id} — submit/lock"""

    def test_submit_true_locks_session(self, monkeypatch):
        """Happy path: { submit: true } locks the session and returns job ids."""
        from sqlalchemy.ext.asyncio import AsyncSession

        client, headers = _make_admin_client(monkeypatch)
        _patch_player(monkeypatch)
        _patch_notifications(monkeypatch)

        # Stub DB execute for _resolve_session_context
        async def fake_execute(self_session, query, *args, **kwargs):
            class FakeScalar:
                def first(self_r):
                    return ("Test Session", _SEASON_ID)

                def scalar_one_or_none(self_r):
                    return None

            return FakeScalar()

        monkeypatch.setattr(AsyncSession, "execute", fake_execute, raising=True)

        async def fake_lock_in_session(session, session_id, updated_by=None):
            return {
                "global_job_id": 42,
                "league_job_id": 7,
                "season_id": _SEASON_ID,
            }

        monkeypatch.setattr(data_service, "lock_in_session", fake_lock_in_session, raising=True)

        response = client.patch(
            f"/api/leagues/{_LEAGUE_ID}/sessions/{_SESSION_ID}",
            json={"submit": True},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["global_job_id"] == 42
        assert data["league_job_id"] == 7

    def test_submit_false_returns_400(self, monkeypatch):
        """submit=false is rejected with 400."""
        from sqlalchemy.ext.asyncio import AsyncSession

        client, headers = _make_admin_client(monkeypatch)
        _patch_player(monkeypatch)

        async def fake_execute(self_session, query, *args, **kwargs):
            class FakeScalar:
                def scalar_one_or_none(self_r):
                    return None

            return FakeScalar()

        monkeypatch.setattr(AsyncSession, "execute", fake_execute, raising=True)

        response = client.patch(
            f"/api/leagues/{_LEAGUE_ID}/sessions/{_SESSION_ID}",
            json={"submit": False},
            headers=headers,
        )
        assert response.status_code == 400

    def test_requires_auth(self):
        """Returns 401 when no token is provided."""
        client = TestClient(app)
        response = client.patch(
            f"/api/leagues/{_LEAGUE_ID}/sessions/{_SESSION_ID}",
            json={"submit": True},
        )
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# Non-league session tests
# ---------------------------------------------------------------------------


class TestGetOpenSessions:
    """GET /api/sessions/open"""

    def test_returns_session_list(self, monkeypatch):
        """Happy path: returns list of active sessions for the current user."""
        client, headers = _make_user_client(monkeypatch)
        _patch_player(monkeypatch)

        async def fake_get_open_sessions(session, player_id, *, active_only=True):
            return [{"id": _SESSION_ID, "name": "Open Session", "status": "ACTIVE"}]

        monkeypatch.setattr(
            data_service, "get_open_sessions_for_user", fake_get_open_sessions, raising=True
        )

        response = client.get("/api/sessions/open", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["id"] == _SESSION_ID

    def test_no_player_returns_empty_list(self, monkeypatch):
        """When the user has no player profile, returns an empty list."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_no_player(session, user_id):
            return None

        monkeypatch.setattr(data_service, "get_player_by_user_id", fake_no_player, raising=True)

        response = client.get("/api/sessions/open", headers=headers)
        assert response.status_code == 200
        assert response.json() == []

    def test_requires_auth(self):
        """Returns 401 when no token is provided."""
        client = TestClient(app)
        response = client.get("/api/sessions/open")
        assert response.status_code == 401


class TestGetSessionByCode:
    """GET /api/sessions/by-code/{code}"""

    def test_returns_session(self, monkeypatch):
        """Happy path: returns session dict for valid code."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_session_by_code(session, code):
            return {"id": _SESSION_ID, "code": code, "status": "ACTIVE"}

        monkeypatch.setattr(
            data_service, "get_session_by_code", fake_get_session_by_code, raising=True
        )

        response = client.get("/api/sessions/by-code/ABCD1234", headers=headers)
        assert response.status_code == 200
        assert response.json()["id"] == _SESSION_ID

    def test_unknown_code_returns_404(self, monkeypatch):
        """Returns 404 when code is not found."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_session_by_code(session, code):
            return None

        monkeypatch.setattr(
            data_service, "get_session_by_code", fake_get_session_by_code, raising=True
        )

        response = client.get("/api/sessions/by-code/NOPE9999", headers=headers)
        assert response.status_code == 404

    def test_requires_auth(self):
        """Returns 401 when no token is provided."""
        client = TestClient(app)
        response = client.get("/api/sessions/by-code/ABCD1234")
        assert response.status_code == 401


class TestGetSessionMatches:
    """GET /api/sessions/{session_id}/matches"""

    def test_returns_matches(self, monkeypatch):
        """Happy path: returns list of matches for the session."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return _ACTIVE_SESSION

        async def fake_get_session_matches(session, session_id):
            return [
                {"id": 1, "team1_score": 21, "team2_score": 15},
                {"id": 2, "team1_score": 19, "team2_score": 21},
            ]

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(
            data_service, "get_session_matches", fake_get_session_matches, raising=True
        )

        response = client.get(f"/api/sessions/{_SESSION_ID}/matches", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 2

    def test_session_not_found_returns_404(self, monkeypatch):
        """Returns 404 when session does not exist."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return None

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)

        response = client.get(f"/api/sessions/{_SESSION_ID}/matches", headers=headers)
        assert response.status_code == 404

    def test_requires_auth(self):
        """Returns 401 when no token is provided."""
        client = TestClient(app)
        response = client.get(f"/api/sessions/{_SESSION_ID}/matches")
        assert response.status_code == 401


class TestGetSessionParticipants:
    """GET /api/sessions/{session_id}/participants"""

    def test_returns_participants(self, monkeypatch):
        """Happy path: returns participant list for an authorised user."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return _ACTIVE_SESSION

        async def fake_can_add(session, session_id, sess, user_id):
            return True

        async def fake_get_participants(session, session_id):
            return [{"player_id": _PLAYER_ID, "full_name": "Test Player"}]

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(
            data_service, "can_user_add_match_to_session", fake_can_add, raising=True
        )
        monkeypatch.setattr(
            data_service, "get_session_participants", fake_get_participants, raising=True
        )

        response = client.get(f"/api/sessions/{_SESSION_ID}/participants", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert data[0]["player_id"] == _PLAYER_ID

    def test_non_participant_returns_403(self, monkeypatch):
        """Returns 403 when caller is not a session participant."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return _ACTIVE_SESSION

        async def fake_can_add(session, session_id, sess, user_id):
            return False

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(
            data_service, "can_user_add_match_to_session", fake_can_add, raising=True
        )

        response = client.get(f"/api/sessions/{_SESSION_ID}/participants", headers=headers)
        assert response.status_code == 403


class TestRemoveSessionParticipant:
    """DELETE /api/sessions/{session_id}/participants/{player_id}"""

    _OTHER_PLAYER_ID = 20

    def test_removes_participant(self, monkeypatch):
        """Happy path: removes a non-creator participant from an active session."""
        client, headers = _make_user_client(monkeypatch)

        # Session where created_by is _PLAYER_ID; we remove _OTHER_PLAYER_ID
        active_session = {**_ACTIVE_SESSION, "created_by": _PLAYER_ID}

        async def fake_get_session(session, session_id):
            return active_session

        async def fake_can_add(session, session_id, sess, user_id):
            return True

        async def fake_remove(session, session_id, player_id):
            return True

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(
            data_service, "can_user_add_match_to_session", fake_can_add, raising=True
        )
        monkeypatch.setattr(data_service, "remove_session_participant", fake_remove, raising=True)

        response = client.delete(
            f"/api/sessions/{_SESSION_ID}/participants/{self._OTHER_PLAYER_ID}",
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["status"] == "success"

    def test_cannot_remove_creator(self, monkeypatch):
        """Returns 403 when trying to remove the session creator."""
        client, headers = _make_user_client(monkeypatch)

        # Session creator IS the player being removed
        active_session = {**_ACTIVE_SESSION, "created_by": _PLAYER_ID}

        async def fake_get_session(session, session_id):
            return active_session

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)

        response = client.delete(
            f"/api/sessions/{_SESSION_ID}/participants/{_PLAYER_ID}",
            headers=headers,
        )
        assert response.status_code == 403

    def test_inactive_session_returns_400(self, monkeypatch):
        """Returns 400 when session is not ACTIVE."""
        client, headers = _make_user_client(monkeypatch)

        submitted_session = {**_ACTIVE_SESSION, "status": "SUBMITTED"}

        async def fake_get_session(session, session_id):
            return submitted_session

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)

        response = client.delete(
            f"/api/sessions/{_SESSION_ID}/participants/{self._OTHER_PLAYER_ID}",
            headers=headers,
        )
        assert response.status_code == 400


class TestJoinSession:
    """POST /api/sessions/join"""

    def test_joins_session_by_code(self, monkeypatch):
        """Happy path: joins a session using a valid code."""
        client, headers = _make_user_client(monkeypatch)
        _patch_player(monkeypatch)

        async def fake_join(session, code, player_id):
            return _ACTIVE_SESSION

        monkeypatch.setattr(data_service, "join_session_by_code", fake_join, raising=True)

        response = client.post("/api/sessions/join", json={"code": "ABCD1234"}, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["session"]["id"] == _SESSION_ID

    def test_invalid_code_returns_404(self, monkeypatch):
        """Returns 404 when the code does not match an active session."""
        client, headers = _make_user_client(monkeypatch)
        _patch_player(monkeypatch)

        async def fake_join(session, code, player_id):
            return None

        monkeypatch.setattr(data_service, "join_session_by_code", fake_join, raising=True)

        response = client.post("/api/sessions/join", json={"code": "NOPE9999"}, headers=headers)
        assert response.status_code == 404

    def test_requires_auth(self):
        """Returns 401 when no token is provided."""
        client = TestClient(app)
        response = client.post("/api/sessions/join", json={"code": "ABCD1234"})
        assert response.status_code == 401


class TestInviteToSession:
    """POST /api/sessions/{session_id}/invite"""

    _INVITED_PLAYER_ID = 25

    def test_invites_player(self, monkeypatch):
        """Happy path: invites a player to an active session."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return _ACTIVE_SESSION

        async def fake_get_player(session, user_id):
            return _FAKE_PLAYER

        async def fake_can_add(session, session_id, sess, user_id):
            return True

        async def fake_add_participant(session, session_id, player_id, invited_by=None):
            return None

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "get_player_by_user_id", fake_get_player, raising=True)
        monkeypatch.setattr(
            data_service, "can_user_add_match_to_session", fake_can_add, raising=True
        )
        monkeypatch.setattr(
            data_service, "add_session_participant", fake_add_participant, raising=True
        )

        response = client.post(
            f"/api/sessions/{_SESSION_ID}/invite",
            json={"player_id": self._INVITED_PLAYER_ID},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["status"] == "success"

    def test_non_participant_cannot_invite(self, monkeypatch):
        """Returns 403 when the caller is not a session participant."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return _ACTIVE_SESSION

        async def fake_get_player(session, user_id):
            return _FAKE_PLAYER

        async def fake_can_add(session, session_id, sess, user_id):
            return False

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "get_player_by_user_id", fake_get_player, raising=True)
        monkeypatch.setattr(
            data_service, "can_user_add_match_to_session", fake_can_add, raising=True
        )

        response = client.post(
            f"/api/sessions/{_SESSION_ID}/invite",
            json={"player_id": self._INVITED_PLAYER_ID},
            headers=headers,
        )
        assert response.status_code == 403


class TestInviteBatchToSession:
    """POST /api/sessions/{session_id}/invite_batch"""

    def test_invites_multiple_players(self, monkeypatch):
        """Happy path: adds multiple players, returns added/failed lists."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return _ACTIVE_SESSION

        async def fake_get_player(session, user_id):
            return _FAKE_PLAYER

        async def fake_can_add(session, session_id, sess, user_id):
            return True

        add_calls = []

        async def fake_add_participant(session, session_id, player_id, invited_by=None):
            add_calls.append(player_id)

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "get_player_by_user_id", fake_get_player, raising=True)
        monkeypatch.setattr(
            data_service, "can_user_add_match_to_session", fake_can_add, raising=True
        )
        monkeypatch.setattr(
            data_service, "add_session_participant", fake_add_participant, raising=True
        )

        response = client.post(
            f"/api/sessions/{_SESSION_ID}/invite_batch",
            json={"player_ids": [20, 21, 22]},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert set(data["added"]) == {20, 21, 22}
        assert data["failed"] == []

    def test_partial_failure_recorded(self, monkeypatch):
        """Players that fail to add appear in the 'failed' list."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return _ACTIVE_SESSION

        async def fake_get_player(session, user_id):
            return _FAKE_PLAYER

        async def fake_can_add(session, session_id, sess, user_id):
            return True

        async def fake_add_participant(session, session_id, player_id, invited_by=None):
            if player_id == 21:
                raise ValueError("Player not found")

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "get_player_by_user_id", fake_get_player, raising=True)
        monkeypatch.setattr(
            data_service, "can_user_add_match_to_session", fake_can_add, raising=True
        )
        monkeypatch.setattr(
            data_service, "add_session_participant", fake_add_participant, raising=True
        )

        response = client.post(
            f"/api/sessions/{_SESSION_ID}/invite_batch",
            json={"player_ids": [20, 21]},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert 20 in data["added"]
        assert any(f["player_id"] == 21 for f in data["failed"])


class TestCreateSession:
    """POST /api/sessions — create non-league session"""

    def test_creates_session(self, monkeypatch):
        """Happy path: creates a session and returns it."""
        client, headers = _make_user_client(monkeypatch)
        _patch_player(monkeypatch)

        created_session = {
            "id": _SESSION_ID,
            "name": "My Session",
            "code": "NEWC0DE1",
            "status": "ACTIVE",
        }

        async def fake_create_session(
            session,
            date,
            name=None,
            court_id=None,
            created_by=None,
            latitude=None,
            longitude=None,
            start_time=None,
            session_type=None,
            max_players=None,
            notes=None,
        ):
            return created_session

        monkeypatch.setattr(data_service, "create_session", fake_create_session, raising=True)

        response = client.post(
            "/api/sessions",
            json={"name": "My Session", "date": "3/20/2026"},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["session"]["id"] == _SESSION_ID
        assert "code" in data["session"]

    def test_creates_session_with_new_fields(self, monkeypatch):
        """Happy path: new fields (start_time, session_type, max_players, notes) are forwarded."""
        client, headers = _make_user_client(monkeypatch)
        _patch_player(monkeypatch)

        captured: dict = {}
        created_session = {
            "id": _SESSION_ID,
            "name": "Pickup",
            "code": "PICK0001",
            "status": "ACTIVE",
            "start_time": "3:00 PM",
            "session_type": "pickup",
            "max_players": 12,
            "notes": "Bring sunscreen",
        }

        async def fake_create_session(
            session,
            date,
            name=None,
            court_id=None,
            created_by=None,
            latitude=None,
            longitude=None,
            start_time=None,
            session_type=None,
            max_players=None,
            notes=None,
        ):
            captured["start_time"] = start_time
            captured["session_type"] = session_type
            captured["max_players"] = max_players
            captured["notes"] = notes
            return created_session

        monkeypatch.setattr(data_service, "create_session", fake_create_session, raising=True)

        response = client.post(
            "/api/sessions",
            json={
                "date": "4/25/2026",
                "start_time": "3:00 PM",
                "session_type": "pickup",
                "max_players": 12,
                "notes": "Bring sunscreen",
            },
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["session"]["start_time"] == "3:00 PM"
        assert data["session"]["session_type"] == "pickup"
        assert data["session"]["max_players"] == 12
        assert data["session"]["notes"] == "Bring sunscreen"
        # Verify route correctly forwarded the fields to the service
        assert captured["start_time"] == "3:00 PM"
        assert captured["session_type"] == "pickup"
        assert captured["max_players"] == 12
        assert captured["notes"] == "Bring sunscreen"

    def test_max_players_validation_too_low(self, monkeypatch):
        """max_players below 2 returns 422 (Pydantic validation)."""
        client, headers = _make_user_client(monkeypatch)
        _patch_player(monkeypatch)

        response = client.post(
            "/api/sessions",
            json={"max_players": 1},
            headers=headers,
        )
        assert response.status_code == 422

    def test_max_players_validation_too_high(self, monkeypatch):
        """max_players above 64 returns 422 (Pydantic validation)."""
        client, headers = _make_user_client(monkeypatch)
        _patch_player(monkeypatch)

        response = client.post(
            "/api/sessions",
            json={"max_players": 65},
            headers=headers,
        )
        assert response.status_code == 422

    def test_creates_session_with_defaults(self, monkeypatch):
        """Creates a session with no body (date defaults to today)."""
        client, headers = _make_user_client(monkeypatch)
        _patch_player(monkeypatch)

        async def fake_create_session(
            session,
            date,
            name=None,
            court_id=None,
            created_by=None,
            latitude=None,
            longitude=None,
            start_time=None,
            session_type=None,
            max_players=None,
            notes=None,
        ):
            return {"id": _SESSION_ID, "name": None, "code": "DEFA0001", "status": "ACTIVE"}

        monkeypatch.setattr(data_service, "create_session", fake_create_session, raising=True)

        response = client.post("/api/sessions", json={}, headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "success"

    def test_requires_auth(self):
        """Returns 401 when no token is provided."""
        client = TestClient(app)
        response = client.post("/api/sessions", json={"name": "Test"})
        assert response.status_code == 401


class TestUpdateSession:
    """PATCH /api/sessions/{session_id}"""

    def test_update_name(self, monkeypatch):
        """Happy path: updates the session name."""
        client, headers = _make_user_client(monkeypatch)

        updated_session = {**_ACTIVE_SESSION, "name": "Renamed Session"}

        async def fake_update_session(
            session,
            session_id,
            name=None,
            date=None,
            season_id=None,
            update_season_id=False,
            court_id=None,
            update_court_id=False,
        ):
            return updated_session

        monkeypatch.setattr(data_service, "update_session", fake_update_session, raising=True)

        response = client.patch(
            f"/api/sessions/{_SESSION_ID}",
            json={"name": "Renamed Session"},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["session"]["name"] == "Renamed Session"

    def test_submit_true_locks_session(self, monkeypatch):
        """{ submit: true } locks the session and returns job ids."""
        from sqlalchemy.ext.asyncio import AsyncSession

        client, headers = _make_user_client(monkeypatch)
        _patch_player(monkeypatch)
        _patch_notifications(monkeypatch)

        async def fake_execute(self_session, query, *args, **kwargs):
            class FakeScalar:
                def first(self_r):
                    return ("Test Session", _SEASON_ID)

                def scalar_one_or_none(self_r):
                    return None

            return FakeScalar()

        monkeypatch.setattr(AsyncSession, "execute", fake_execute, raising=True)

        async def fake_lock_in_session(session, session_id, updated_by=None):
            return {
                "global_job_id": 88,
                "league_job_id": None,
                "season_id": _SEASON_ID,
            }

        monkeypatch.setattr(data_service, "lock_in_session", fake_lock_in_session, raising=True)

        response = client.patch(
            f"/api/sessions/{_SESSION_ID}",
            json={"submit": True},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["global_job_id"] == 88

    def test_empty_body_returns_400(self, monkeypatch):
        """Returns 400 when no updatable fields are provided."""
        client, headers = _make_user_client(monkeypatch)

        response = client.patch(
            f"/api/sessions/{_SESSION_ID}",
            json={},
            headers=headers,
        )
        assert response.status_code == 400

    def test_requires_auth(self):
        """Returns 401 when no token is provided."""
        client = TestClient(app)
        response = client.patch(f"/api/sessions/{_SESSION_ID}", json={"name": "x"})
        assert response.status_code == 401


class TestDeleteSession:
    """DELETE /api/sessions/{session_id}"""

    def test_creator_can_delete(self, monkeypatch):
        """Happy path: session creator can delete the session."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return _ACTIVE_SESSION  # created_by == _PLAYER_ID

        async def fake_get_player(session, user_id):
            return _FAKE_PLAYER  # player["id"] == _PLAYER_ID matches created_by

        async def fake_delete_session(session, session_id):
            return True

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "get_player_by_user_id", fake_get_player, raising=True)
        monkeypatch.setattr(data_service, "delete_session", fake_delete_session, raising=True)

        response = client.delete(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["session_id"] == _SESSION_ID

    def test_non_creator_non_admin_returns_403(self, monkeypatch):
        """Returns 403 when user is neither the creator nor a league admin."""
        from sqlalchemy.ext.asyncio import AsyncSession

        client, headers = _make_user_client(monkeypatch)

        # Session created by a different player
        foreign_session = {**_ACTIVE_SESSION, "created_by": 999}

        async def fake_get_session(session, session_id):
            return foreign_session

        async def fake_get_player(session, user_id):
            return _FAKE_PLAYER  # id=10, does not match created_by=999

        # DB execute returns no admin rows (not a league admin either)
        async def fake_execute(self_session, query, *args, **kwargs):
            class FakeResult:
                def scalar_one_or_none(self_r):
                    return None

                def first(self_r):
                    return None

            return FakeResult()

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "get_player_by_user_id", fake_get_player, raising=True)
        monkeypatch.setattr(AsyncSession, "execute", fake_execute, raising=True)

        response = client.delete(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 403

    def test_session_not_found_returns_404(self, monkeypatch):
        """Returns 404 when session does not exist."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return None

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)

        response = client.delete(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 404

    def test_requires_auth(self):
        """Returns 401 when no token is provided."""
        client = TestClient(app)
        response = client.delete(f"/api/sessions/{_SESSION_ID}")
        assert response.status_code == 401
