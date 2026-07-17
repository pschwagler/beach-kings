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
    "league_id": _LEAGUE_ID,
    "court_id": None,
    "created_by": _PLAYER_ID,
    "code": "ABCD1234",
}

# Pre-migration session dict: no league_id key, so route uses Season→League fallback.
_LEGACY_SESSION = {
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
        assert response.status_code in (401, 403)


class TestEndLeagueSession:
    """PATCH /api/leagues/{league_id}/sessions/{session_id} — submit/lock"""

    def test_submit_true_locks_session(self, monkeypatch):
        """Happy path: { submit: true } locks the session and returns job ids.

        execute() is called in order:
          1. IDOR check — SELECT league_id FROM sessions WHERE id = ?
             scalar_one_or_none() → _LEAGUE_ID (session belongs to this league)
          2. _resolve_session_context — SELECT name, season_id, league_id FROM sessions WHERE id = ?
             first() → ("Test Session", _SEASON_ID, _LEAGUE_ID)
          3. League name lookup — SELECT name FROM leagues WHERE id = ?
             scalar_one_or_none() → None (no name needed for test assertion)
        """
        from sqlalchemy.ext.asyncio import AsyncSession

        client, headers = _make_admin_client(monkeypatch)
        _patch_player(monkeypatch)
        _patch_notifications(monkeypatch)

        _call_count = [0]

        async def fake_execute(self_session, query, *args, **kwargs):
            _call_count[0] += 1
            call = _call_count[0]

            class FakeResult:
                def first(self_r):
                    # Call 2: _resolve_session_context row
                    return ("Test Session", _SEASON_ID, _LEAGUE_ID)

                def scalar_one_or_none(self_r):
                    if call == 1:
                        # IDOR check: return the league_id so the session is accepted
                        return _LEAGUE_ID
                    # Call 3+: league name lookup → None is fine
                    return None

            return FakeResult()

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
        assert response.status_code in (401, 403)


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
        assert response.status_code in (401, 403)


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
        assert response.status_code in (401, 403)


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
        assert response.status_code in (401, 403)


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
        """Happy path: a league member removes a non-creator participant from an active league session.

        Security fix (SECURITY 4): league sessions now require league membership
        for roster removal.  _has_league_role is patched to return True here to
        simulate the caller being a member of the session's league.
        """
        import backend.api.routes.sessions as sessions_module

        client, headers = _make_user_client(monkeypatch)

        # Session where created_by is _PLAYER_ID; we remove _OTHER_PLAYER_ID
        active_session = {**_ACTIVE_SESSION, "created_by": _PLAYER_ID}

        async def fake_get_session(session, session_id):
            return active_session

        async def fake_remove(session, session_id, player_id):
            return True

        async def fake_has_league_role(session, user_id, league_id, required_role):
            return True  # simulate caller is a league member

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "remove_session_participant", fake_remove, raising=True)
        # Patch the name as bound in the sessions module (imported via `from ... import`)
        monkeypatch.setattr(
            sessions_module, "_has_league_role", fake_has_league_role, raising=True
        )

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
        assert response.status_code in (401, 403)


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
            is_ranked=None,
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
        """Supported create fields are forwarded without caller-controlled session type."""
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
            "court_id": 8,
            "is_ranked": False,
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
            is_ranked=None,
        ):
            captured["start_time"] = start_time
            captured["court_id"] = court_id
            captured["is_ranked"] = is_ranked
            return created_session

        monkeypatch.setattr(data_service, "create_session", fake_create_session, raising=True)

        response = client.post(
            "/api/sessions",
            json={
                "date": "4/25/2026",
                "start_time": "3:00 PM",
                "court_id": 8,
                "is_ranked": False,
            },
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["session"]["start_time"] == "3:00 PM"
        assert data["session"]["session_type"] == "pickup"
        assert captured["start_time"] == "3:00 PM"
        assert captured["court_id"] == 8
        assert captured["is_ranked"] is False

    def test_rejects_unsupported_create_fields(self, monkeypatch):
        """Removed and unknown create fields must not be silently ignored."""
        client, headers = _make_user_client(monkeypatch)
        _patch_player(monkeypatch)

        for body in (
            {"max_players": 12},
            {"notes": "Bring sunscreen"},
            {"session_type": "pickup"},
            {"unexpected": True},
        ):
            response = client.post("/api/sessions", json=body, headers=headers)
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
            is_ranked=None,
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
        assert response.status_code in (401, 403)

    def test_creates_league_session_via_get_or_create(self, monkeypatch):
        """With league_id, routes through get_or_create_active_league_session
        (idempotent — supports the score-screen "Manage Session" flow).

        Security fix (SECURITY 2): the route now checks league membership before
        delegating to get_or_create.  _has_league_role is patched to True to
        simulate a valid league member making this request.
        """
        import backend.api.routes.sessions as sessions_module

        client, headers = _make_user_client(monkeypatch)
        _patch_player(monkeypatch)

        async def fake_has_league_role(session, user_id, league_id, required_role):
            return True  # simulate caller is a league member

        # Patch the name as bound in the sessions module (imported via `from ... import`)
        monkeypatch.setattr(
            sessions_module, "_has_league_role", fake_has_league_role, raising=True
        )

        captured: dict = {}
        created_session = {
            "id": _SESSION_ID,
            "name": "League Saturday",
            "code": "LGE00001",
            "status": "ACTIVE",
            "season_id": 9,
        }

        async def fake_get_or_create(
            session,
            league_id,
            session_date,
            name=None,
            created_by=None,
            season_id=None,
            latitude=None,
            longitude=None,
            court_id=None,
            start_time=None,
            is_ranked=None,
        ):
            captured["league_id"] = league_id
            captured["season_id"] = season_id
            captured["session_date"] = session_date
            captured["name"] = name
            captured["court_id"] = court_id
            captured["start_time"] = start_time
            captured["is_ranked"] = is_ranked
            return created_session

        async def fake_create_session(*args, **kwargs):  # should NOT be called
            captured["non_league_called"] = True
            return {"id": -1}

        monkeypatch.setattr(
            data_service,
            "get_or_create_active_league_session",
            fake_get_or_create,
            raising=True,
        )
        monkeypatch.setattr(data_service, "create_session", fake_create_session, raising=True)

        response = client.post(
            "/api/sessions",
            json={
                "league_id": 4,
                "season_id": 9,
                "date": "5/10/2026",
                "name": "League Saturday",
            },
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["session"]["id"] == _SESSION_ID
        assert data["session"]["season_id"] == 9
        assert captured["league_id"] == 4
        assert captured["season_id"] == 9
        assert captured["session_date"] == "5/10/2026"
        assert captured["name"] == "League Saturday"
        assert "non_league_called" not in captured


class TestUpdateSession:
    """PATCH /api/sessions/{session_id}"""

    def test_update_name(self, monkeypatch):
        """Happy path: updates the session name as a league admin."""
        client, headers = _make_user_client(monkeypatch)

        updated_session = {**_ACTIVE_SESSION, "name": "Renamed Session"}

        async def fake_get_session(session, session_id):
            # _ACTIVE_SESSION has league_id set — the route checks admin role.
            return _ACTIVE_SESSION

        async def fake_update_session(
            session,
            session_id,
            name=None,
            date=None,
            start_time=None,
            update_start_time=False,
            season_id=None,
            update_season_id=False,
            court_id=None,
            update_court_id=False,
            is_ranked=None,
            update_is_ranked=False,
        ):
            return updated_session

        import backend.api.routes.sessions as sessions_module

        async def fake_is_admin_of_session_league(session, user_id, session_id):
            return True  # the test user acts as league admin

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "update_session", fake_update_session, raising=True)
        monkeypatch.setattr(
            sessions_module,
            "is_user_admin_of_session_league",
            fake_is_admin_of_session_league,
            raising=True,
        )

        response = client.patch(
            f"/api/sessions/{_SESSION_ID}",
            json={"name": "Renamed Session"},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["session"]["name"] == "Renamed Session"

    def test_update_forwards_nullable_fields_and_rank_intent(self, monkeypatch):
        """Explicit nulls clear nullable fields while false remains a meaningful rank update."""
        client, headers = _make_user_client(monkeypatch)
        captured: dict = {}

        async def fake_get_session(session, session_id):
            return {**_ACTIVE_SESSION, "league_id": None}

        async def fake_update_session(session, session_id, **kwargs):
            captured.update(kwargs)
            return {**_ACTIVE_SESSION, "league_id": None, "start_time": None, "is_ranked": False}

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "update_session", fake_update_session, raising=True)

        response = client.patch(
            f"/api/sessions/{_SESSION_ID}",
            json={"date": "4/26/2026", "start_time": None, "court_id": None, "is_ranked": False},
            headers=headers,
        )

        assert response.status_code == 200
        assert captured["date"] == "4/26/2026"
        assert captured["start_time"] is None
        assert captured["update_start_time"] is True
        assert captured["court_id"] is None
        assert captured["update_court_id"] is True
        assert captured["is_ranked"] is False
        assert captured["update_is_ranked"] is True

    def test_rejects_unsupported_update_fields(self, monkeypatch):
        """Removed and caller-controlled update fields are rejected at the boundary."""
        client, headers = _make_user_client(monkeypatch)

        for body in (
            {"max_players": 12},
            {"notes": "Bring sunscreen"},
            {"session_type": "league"},
            {"name": None},
            {"date": None},
            {"is_ranked": None},
        ):
            response = client.patch(f"/api/sessions/{_SESSION_ID}", json=body, headers=headers)
            assert response.status_code == 422

    def test_submit_true_locks_session(self, monkeypatch):
        """{ submit: true } locks the session and returns job ids."""
        from sqlalchemy.ext.asyncio import AsyncSession

        client, headers = _make_user_client(monkeypatch)
        _patch_player(monkeypatch)
        _patch_notifications(monkeypatch)

        # Row now has 3 columns: (name, season_id, league_id)
        async def fake_execute(self_session, query, *args, **kwargs):
            class FakeScalar:
                def first(self_r):
                    return ("Test Session", _SEASON_ID, None)

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
        assert response.status_code in (401, 403)


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
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# GET /api/sessions/{session_id}  (session roster detail)
# ---------------------------------------------------------------------------


class TestGetSessionDetail:
    """GET /api/sessions/{session_id} — full session detail with roster and games."""

    _ROSTER_PLAYER = {
        "entry_id": _PLAYER_ID,
        "player_id": _PLAYER_ID,
        "display_name": "Test Player",
        "initials": "TP",
        "game_count": 3,
        "is_placeholder": False,
    }

    _GAME_ROW = {
        "id": 201,
        "team1_player1_id": 101,
        "team1_player2_id": 102,
        "team2_player1_id": 103,
        "team2_player2_id": 104,
        "team1_player1_name": "Test Player",
        "team1_player2_name": "Partner P.",
        "team2_player1_name": "Opp A.",
        "team2_player2_name": "Opp B.",
        "team1_score": 21,
        "team2_score": 14,
        "winner": 1,
        "is_ranked": True,
    }

    def _patch_shared(self, monkeypatch, session_name="Test Session", games=None):
        """Patch data_service methods shared by happy-path tests."""
        if games is None:
            games = [self._GAME_ROW]

        async def fake_get_session(session, session_id):
            return {**_ACTIVE_SESSION, "name": session_name}

        async def fake_can_add(session, session_id, sess, user_id):
            return True

        async def fake_get_roster(session, session_id):
            return [self._ROSTER_PLAYER]

        async def fake_get_games(session, session_id):
            return games

        async def fake_get_player(session, user_id):
            return _FAKE_PLAYER

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(
            data_service, "can_user_add_match_to_session", fake_can_add, raising=True
        )
        monkeypatch.setattr(
            data_service,
            "get_session_roster_with_game_counts",
            fake_get_roster,
            raising=True,
        )
        monkeypatch.setattr(data_service, "get_session_matches", fake_get_games, raising=True)
        monkeypatch.setattr(data_service, "get_player_by_user_id", fake_get_player, raising=True)

    def _patch_execute_league(self, monkeypatch, league_name=None, elo_rows=None):
        """Patch AsyncSession.execute for the DIRECT path (league_id on session dict).

        Call sequence when sess["league_id"] is set (post-migration sessions):
          1 - court/session-type query  → one_or_none()
          2 - League.name lookup        → scalar_one_or_none() returns league_name
          3 - EloHistory rating lookup  → all() returns elo_rows

        No Season.league_id call is made in this path. ``elo_rows`` is a list of
        objects exposing ``match_id`` and ``elo_change`` (default: none).
        """
        from sqlalchemy.ext.asyncio import AsyncSession

        rows = elo_rows or []
        call_count = [0]
        season_lookup_called = [False]

        async def fake_execute(self_session, query, *args, **kwargs):
            call_count[0] += 1

            class RowOne:
                session_type = "pickup"
                court_id = None
                court_name = None
                date = "3/19/2026"
                start_time = None
                is_ranked = True

            class ResultFirst:
                def one_or_none(self_r):
                    return RowOne()

            class ResultLeagueOrElo:
                """Serves both the League.name lookup and the EloHistory query.

                The route calls scalar_one_or_none() for the league name and
                all() for EloHistory, so the same object can back both calls.
                """

                def scalar_one_or_none(self_r):
                    return league_name

                def all(self_r):
                    return rows

            if call_count[0] == 1:
                return ResultFirst()
            # Subsequent calls: League.name lookup, then EloHistory (direct path).
            return ResultLeagueOrElo()

        monkeypatch.setattr(AsyncSession, "execute", fake_execute, raising=True)
        return season_lookup_called

    def _patch_execute_league_legacy(
        self, monkeypatch, league_id=None, league_name=None, elo_rows=None
    ):
        """Patch AsyncSession.execute for the LEGACY Season-fallback path.

        Call sequence when sess has no "league_id" key (pre-migration sessions):
          1 - court/session-type query       → one_or_none()
          2 - Season.league_id fallback      → scalar_one_or_none() returns league_id
          3 - League.name lookup             → scalar_one_or_none() returns league_name
          4 - EloHistory rating lookup       → all() returns elo_rows
        """
        from sqlalchemy.ext.asyncio import AsyncSession

        rows = elo_rows or []
        call_count = [0]
        scalar_call_count = [0]

        async def fake_execute(self_session, query, *args, **kwargs):
            call_count[0] += 1

            class RowOne:
                session_type = "pickup"
                court_id = None
                court_name = None
                date = "3/19/2026"
                start_time = None
                is_ranked = True

            class ResultFirst:
                def one_or_none(self_r):
                    return RowOne()

            class ResultLeagueOrElo:
                def scalar_one_or_none(self_r):
                    scalar_call_count[0] += 1
                    # First scalar call: Season.league_id legacy fallback
                    if scalar_call_count[0] == 1:
                        return league_id
                    # Second scalar call: League.name lookup
                    return league_name

                def all(self_r):
                    return rows

            if call_count[0] == 1:
                return ResultFirst()
            return ResultLeagueOrElo()

        monkeypatch.setattr(AsyncSession, "execute", fake_execute, raising=True)

    def test_returns_session_detail(self, monkeypatch):
        """Happy path: participant gets full session detail with roster and games."""
        self._patch_shared(monkeypatch)
        self._patch_execute_league(monkeypatch)
        client, headers = _make_user_client(monkeypatch)

        response = client.get(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == _SESSION_ID
        assert data["session_type"] == "pickup"
        assert data["court_name"] is None
        assert isinstance(data["players"], list)
        assert len(data["players"]) == 1
        assert data["players"][0]["player_id"] == _PLAYER_ID
        assert data["players"][0]["game_count"] == 3

    def test_response_includes_games_list(self, monkeypatch):
        """Response includes a 'games' list with game detail."""
        self._patch_shared(monkeypatch)
        self._patch_execute_league(monkeypatch)
        client, headers = _make_user_client(monkeypatch)

        response = client.get(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "games" in data
        assert isinstance(data["games"], list)
        assert len(data["games"]) == 1
        game = data["games"][0]
        assert game["id"] == 201
        assert game["game_number"] == 1
        assert game["team1_player1_name"] == "Test Player"
        assert game["team1_score"] == 21
        assert game["team2_score"] == 14
        assert game["winner"] == 1

    def test_response_includes_game_player_ids_and_ranked(self, monkeypatch):
        """Response 'games[]' entries include player IDs and is_ranked for edit mode."""
        self._patch_shared(monkeypatch)
        self._patch_execute_league(monkeypatch)
        client, headers = _make_user_client(monkeypatch)

        response = client.get(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 200
        game = response.json()["games"][0]
        assert game["team1_player1_id"] == 101
        assert game["team1_player2_id"] == 102
        assert game["team2_player1_id"] == 103
        assert game["team2_player2_id"] == 104
        assert game["is_ranked"] is True

    def test_games_list_empty_when_no_matches(self, monkeypatch):
        """Response includes an empty 'games' list when session has no matches."""
        self._patch_shared(monkeypatch, games=[])
        self._patch_execute_league(monkeypatch)
        client, headers = _make_user_client(monkeypatch)

        response = client.get(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 200
        assert response.json()["games"] == []

    def test_response_includes_session_metadata(self, monkeypatch):
        """Response includes supported date, start_time, and ranking metadata."""
        self._patch_shared(monkeypatch)
        self._patch_execute_league(monkeypatch)
        client, headers = _make_user_client(monkeypatch)

        response = client.get(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "date" in data
        assert "start_time" in data
        assert "is_ranked" in data
        assert "max_players" not in data
        assert "notes" not in data

    def test_response_includes_is_ranked(self, monkeypatch):
        """Response includes is_ranked field reflecting the session-level ranked flag."""
        self._patch_shared(monkeypatch)
        self._patch_execute_league(monkeypatch)
        client, headers = _make_user_client(monkeypatch)

        response = client.get(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "is_ranked" in data
        # RowOne mock sets is_ranked = True; verify the value is forwarded correctly.
        assert data["is_ranked"] is True

    def test_response_includes_league_name(self, monkeypatch):
        """Direct path: league_id from session dict; league_name from single League.name
        scalar call (no Season lookup).  _ACTIVE_SESSION carries league_id=_LEAGUE_ID.
        """
        self._patch_shared(monkeypatch)
        # Direct path: only one scalar call (League.name); no Season.league_id call.
        self._patch_execute_league(monkeypatch, league_name="QBK Open Men")
        client, headers = _make_user_client(monkeypatch)

        response = client.get(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        # league_id comes straight from the session dict (_LEAGUE_ID == 5)
        assert data["league_id"] == _LEAGUE_ID
        assert data["league_name"] == "QBK Open Men"

    def test_league_name_null_for_pickup_session(self, monkeypatch):
        """Response has null league_name when session has no league (league_id absent)."""
        # Use a session dict with no league_id to exercise the no-league branch.
        no_league_session = {
            "id": _SESSION_ID,
            "name": "Test Session",
            "status": "ACTIVE",
            "season_id": None,
            "court_id": None,
            "created_by": _PLAYER_ID,
            "code": "ABCD1234",
            # No "league_id" key — pickup session
        }

        async def fake_get_session_no_league(session, session_id):
            return no_league_session

        monkeypatch.setattr(data_service, "get_session", fake_get_session_no_league, raising=True)

        async def fake_can_add(session, session_id, sess, user_id):
            return True

        async def fake_get_roster(session, session_id):
            return []

        async def fake_get_games(session, session_id):
            return []

        async def fake_get_player(session, user_id):
            return _FAKE_PLAYER

        monkeypatch.setattr(
            data_service, "can_user_add_match_to_session", fake_can_add, raising=True
        )
        monkeypatch.setattr(
            data_service, "get_session_roster_with_game_counts", fake_get_roster, raising=True
        )
        monkeypatch.setattr(data_service, "get_session_matches", fake_get_games, raising=True)
        monkeypatch.setattr(data_service, "get_player_by_user_id", fake_get_player, raising=True)

        # No scalar calls expected (no league_id, no season_id → no DB lookups for league)
        from sqlalchemy.ext.asyncio import AsyncSession as _AsyncSession

        call_count = [0]

        async def fake_execute_no_league(self_session, query, *args, **kwargs):
            call_count[0] += 1

            class RowOne:
                session_type = "pickup"
                court_id = None
                court_name = None
                date = "3/19/2026"
                start_time = None
                is_ranked = True

            class ResultFirst:
                def one_or_none(self_r):
                    return RowOne()

            return ResultFirst()

        monkeypatch.setattr(_AsyncSession, "execute", fake_execute_no_league, raising=True)

        client, headers = _make_user_client(monkeypatch)
        response = client.get(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["league_name"] is None
        assert data["league_id"] is None
        # Only the court/session-type query should have fired (no league DB calls)
        assert call_count[0] == 1, (
            f"Expected exactly 1 DB execute call for pickup session (court query only), "
            f"got {call_count[0]}"
        )

    def test_response_includes_league_name_legacy_path(self, monkeypatch):
        """Legacy path: session has no league_id key (pre-migration).
        Route falls back to Season → league_id → League.name (two scalar calls).
        """

        async def fake_get_session_legacy(session, session_id):
            return _LEGACY_SESSION

        monkeypatch.setattr(data_service, "get_session", fake_get_session_legacy, raising=True)

        async def fake_can_add(session, session_id, sess, user_id):
            return True

        async def fake_get_roster(session, session_id):
            return []

        async def fake_get_games(session, session_id):
            return []

        async def fake_get_player(session, user_id):
            return _FAKE_PLAYER

        monkeypatch.setattr(
            data_service, "can_user_add_match_to_session", fake_can_add, raising=True
        )
        monkeypatch.setattr(
            data_service, "get_session_roster_with_game_counts", fake_get_roster, raising=True
        )
        monkeypatch.setattr(data_service, "get_session_matches", fake_get_games, raising=True)
        monkeypatch.setattr(data_service, "get_player_by_user_id", fake_get_player, raising=True)

        self._patch_execute_league_legacy(
            monkeypatch, league_id=_LEAGUE_ID, league_name="Legacy League"
        )
        client, headers = _make_user_client(monkeypatch)

        response = client.get(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["league_id"] == _LEAGUE_ID
        assert data["league_name"] == "Legacy League"

    def test_session_number_parsed_from_name(self, monkeypatch):
        """session_number is 1 for first session of the day (plain date name)."""
        self._patch_shared(monkeypatch, session_name="3/19/2026")
        self._patch_execute_league(monkeypatch)
        client, headers = _make_user_client(monkeypatch)

        response = client.get(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 200
        assert response.json()["session_number"] == 1

    def test_session_number_parsed_from_name_second(self, monkeypatch):
        """session_number is 2 for second session of the day."""
        self._patch_shared(monkeypatch, session_name="3/19/2026 Session #2")
        self._patch_execute_league(monkeypatch)
        client, headers = _make_user_client(monkeypatch)

        response = client.get(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 200
        assert response.json()["session_number"] == 2

    def test_user_stats_computed_from_games(self, monkeypatch):
        """user_wins, user_losses, user_rating_change computed from matches."""
        from types import SimpleNamespace

        # User player_id = _PLAYER_ID (10). Team 1 wins this game.
        # Player 10 is on team1 → win.
        games = [
            {
                **self._GAME_ROW,
                "id": 201,
                "team1_player1_id": _PLAYER_ID,
                "team1_player2_id": 11,
                "team2_player1_id": 12,
                "team2_player2_id": 13,
                "winner": 1,  # team1 wins → user wins
            },
            {
                **self._GAME_ROW,
                "id": 202,
                "team1_player1_id": _PLAYER_ID,
                "team1_player2_id": 11,
                "team2_player1_id": 12,
                "team2_player2_id": 13,
                "winner": 2,  # team2 wins → user loses
            },
        ]
        elo_rows = [
            SimpleNamespace(match_id=201, elo_change=12.5),
            SimpleNamespace(match_id=202, elo_change=-4.0),
        ]
        self._patch_shared(monkeypatch, games=games)
        self._patch_execute_league(monkeypatch, elo_rows=elo_rows)
        client, headers = _make_user_client(monkeypatch)

        response = client.get(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["user_wins"] == 1
        assert data["user_losses"] == 1
        # Session total is the sum of the player's per-game ELO deltas.
        assert data["user_rating_change"] == 8.5
        # Per-game rating_change is surfaced on each game (oldest first).
        by_id = {g["id"]: g["rating_change"] for g in data["games"]}
        assert by_id[201] == 12.5
        assert by_id[202] == -4.0

    def test_user_rating_change_null_without_elo_history(self, monkeypatch):
        """user_rating_change is null when no EloHistory exists (uncalculated)."""
        games = [
            {
                **self._GAME_ROW,
                "id": 201,
                "team1_player1_id": _PLAYER_ID,
                "team1_player2_id": 11,
                "team2_player1_id": 12,
                "team2_player2_id": 13,
                "winner": 1,
            }
        ]
        self._patch_shared(monkeypatch, games=games)
        self._patch_execute_league(monkeypatch)  # no elo_rows
        client, headers = _make_user_client(monkeypatch)

        response = client.get(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["user_rating_change"] is None
        assert data["games"][0]["rating_change"] is None

    def test_user_stats_loss_counted(self, monkeypatch):
        """user_losses incremented when user is on losing team."""
        games = [
            {
                **self._GAME_ROW,
                "id": 201,
                "team1_player1_id": _PLAYER_ID,
                "team1_player2_id": 11,
                "team2_player1_id": 12,
                "team2_player2_id": 13,
                "winner": 2,  # team2 wins → user on team1 loses
            }
        ]
        self._patch_shared(monkeypatch, games=games)
        self._patch_execute_league(monkeypatch)
        client, headers = _make_user_client(monkeypatch)

        response = client.get(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["user_wins"] == 0
        assert data["user_losses"] == 1

    def test_user_stats_zero_when_no_games(self, monkeypatch):
        """user_wins and user_losses are 0 when session has no games."""
        self._patch_shared(monkeypatch, games=[])
        self._patch_execute_league(monkeypatch)
        client, headers = _make_user_client(monkeypatch)

        response = client.get(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["user_wins"] == 0
        assert data["user_losses"] == 0

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

        response = client.get(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 403

    def test_session_not_found_returns_404(self, monkeypatch):
        """Returns 404 when session does not exist."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return None

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)

        response = client.get(f"/api/sessions/{_SESSION_ID}", headers=headers)
        assert response.status_code == 404

    def test_requires_auth(self):
        """Returns 401 when no token is provided."""
        client = TestClient(app)
        response = client.get(f"/api/sessions/{_SESSION_ID}")
        assert response.status_code in (401, 403)
