"""Tests for Bug #4: PATCH /api/sessions/{session_id} authorization gap (SECURITY).

The ``update_session`` route is gated only by ``Depends(get_current_user)``.
Any authenticated user can currently:
  - Promote a pickup session to a league session by supplying a new season_id
  - Edit name/date on an existing league session without being a league admin

Authorization decision for the four cases:
  Case 1 — PROMOTION (field update sets season_id, session is pickup or the
            season belongs to a different league):
            Must be admin of the TARGET league (derived from the new season's
            league_id).

  Case 2 — EXISTING LEAGUE SESSION EDIT (session already has a league_id and
            no promotion is happening):
            Must be admin of the session's CURRENT league.

  Case 3 — PICKUP EDIT with no promotion (session.league_id is NULL and no
            season_id is being set):
            Creator, invited participant, or player in a recorded match may
            edit the pickup session.

  Case 4 — SUBMIT (body.submit is True):
            A pickup collaborator or league member submits without needing
            league-admin role.

Three-state model:
  Pickup:      league_id=NULL, season_id=NULL
  Gap game:    league_id=SET,  season_id=NULL
  Season game: league_id=SET,  season_id=SET
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services import auth_service, data_service, role_service, user_service


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

_USER_ID = 77
_PLAYER_ID = 88
_LEAGUE_ID = 5
_TARGET_LEAGUE_ID = 9
_SEASON_ID = 3
_SESSION_ID = 42
_PHONE = "+19991112222"


def _patch_base_auth(monkeypatch):
    def fake_verify_token(token: str) -> dict:
        return {"user_id": _USER_ID, "phone_number": _PHONE}

    async def fake_get_user_by_id(session, uid: int) -> dict:
        return {
            "id": _USER_ID,
            "phone_number": _PHONE,
            "name": "Test User",
            "is_verified": True,
        }

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)


def _patch_not_admin(monkeypatch):
    """Simulate user is NOT a league admin and NOT a system admin."""

    async def fake_get_setting(session, key: str):
        return None  # not a system admin

    monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)

    async def fake_is_system_admin(session, user_id):
        return False

    monkeypatch.setattr(role_service, "is_system_admin", fake_is_system_admin, raising=True)


def _patch_is_admin(monkeypatch):
    """Simulate user IS a system admin (bypasses all league-admin checks)."""

    async def fake_get_setting(session, key: str):
        if key in ("system_admin_phone_numbers", "system_admin_emails"):
            return _PHONE
        return None

    monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)

    async def fake_is_system_admin(session, user_id):
        return True

    monkeypatch.setattr(role_service, "is_system_admin", fake_is_system_admin, raising=True)


def _make_non_admin_client(monkeypatch):
    _patch_base_auth(monkeypatch)
    _patch_not_admin(monkeypatch)
    return TestClient(app), {"Authorization": "Bearer dummy"}


def _make_admin_client(monkeypatch):
    _patch_base_auth(monkeypatch)
    _patch_is_admin(monkeypatch)
    return TestClient(app), {"Authorization": "Bearer dummy"}


# ---------------------------------------------------------------------------
# Shared session dicts
# ---------------------------------------------------------------------------

_PICKUP_SESSION = {
    "id": _SESSION_ID,
    "name": "Pickup Game",
    "status": "ACTIVE",
    "season_id": None,
    "league_id": None,
    "court_id": None,
    "created_by": _PLAYER_ID,
    "code": "PICK0001",
}

_LEAGUE_SESSION = {
    "id": _SESSION_ID,
    "name": "League Game",
    "status": "ACTIVE",
    "season_id": _SEASON_ID,
    "league_id": _LEAGUE_ID,
    "court_id": None,
    "created_by": _PLAYER_ID,
    "code": "LEAG0001",
}

# Gap game: a league session with NO season (league_id set, season_id NULL).
# It must follow the same Case 2 league-admin rule as a season game — the
# discriminant is league_id, never season_id.
_GAP_SESSION = {
    "id": _SESSION_ID,
    "name": "Gap Game",
    "status": "ACTIVE",
    "season_id": None,
    "league_id": _LEAGUE_ID,
    "court_id": None,
    "created_by": _PLAYER_ID,
    "code": "GAP00001",
}


# ---------------------------------------------------------------------------
# Case 2: Non-admin cannot edit a league session's name/date
# ---------------------------------------------------------------------------


class TestLeagueSessionEditRequiresAdmin:
    """REGRESSION (Bug #4, Case 2): editing a league session's name/date must
    require league-admin authorization.
    """

    def test_non_admin_cannot_rename_league_session(self, monkeypatch):
        """REGRESSION (Bug #4, Case 2): a non-admin editing an existing league
        session's name must receive a non-disclosing 404.

        Before the fix the route has no authorization check in the field-update
        path, so any authenticated user receives 200.  After the fix, only
        league admins may edit league sessions.
        """
        client, headers = _make_non_admin_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return _LEAGUE_SESSION

        async def fake_update_session(session, session_id, **kwargs):
            return {**_LEAGUE_SESSION, "name": "Hacked Name"}

        # is_user_admin_of_session_league → the route must check this
        async def fake_is_admin_of_session_league(session, user_id, session_id):
            return False  # not an admin

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "update_session", fake_update_session, raising=True)

        import backend.api.routes.sessions as sessions_module

        monkeypatch.setattr(
            sessions_module,
            "is_user_admin_of_session_league",
            fake_is_admin_of_session_league,
            raising=True,
        )

        response = client.patch(
            f"/api/sessions/{_SESSION_ID}",
            json={"name": "Hacked Name"},
            headers=headers,
        )
        assert response.status_code == 404, (
            f"Non-admin editing a league session name must be hidden with 404.  "
            f"Got {response.status_code}: {response.text}.  "
            "Bug #4 (Case 2) not fixed: missing league-admin authorization check."
        )

    def test_admin_can_rename_league_session(self, monkeypatch):
        """League admin CAN rename a league session (Case 2, happy path)."""
        client, headers = _make_non_admin_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return _LEAGUE_SESSION

        updated = {**_LEAGUE_SESSION, "name": "Admin Renamed"}

        async def fake_update_session(session, session_id, **kwargs):
            return updated

        async def fake_is_admin_of_session_league(session, user_id, session_id):
            return True  # IS an admin

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "update_session", fake_update_session, raising=True)

        import backend.api.routes.sessions as sessions_module

        monkeypatch.setattr(
            sessions_module,
            "is_user_admin_of_session_league",
            fake_is_admin_of_session_league,
            raising=True,
        )

        response = client.patch(
            f"/api/sessions/{_SESSION_ID}",
            json={"name": "Admin Renamed"},
            headers=headers,
        )
        assert response.status_code == 200, (
            f"League admin renaming a league session must succeed (200).  "
            f"Got {response.status_code}: {response.text}."
        )


# ---------------------------------------------------------------------------
# Case 1: Promotion requires admin of TARGET league
# ---------------------------------------------------------------------------


class TestPromotionRequiresTargetLeagueAdmin:
    """REGRESSION (Bug #4, Case 1): promoting a pickup session to a league
    session (by supplying season_id) must require admin of the target league.
    """

    def test_non_admin_cannot_promote_pickup_to_league(self, monkeypatch):
        """REGRESSION (Bug #4, Case 1): a non-admin must receive 404 when
        attempting to promote a pickup session to a league session.

        Before the fix the route performs no authorization check, so the
        promotion succeeds for any authenticated user.
        """
        from unittest.mock import MagicMock
        from sqlalchemy.ext.asyncio import AsyncSession

        client, headers = _make_non_admin_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return _PICKUP_SESSION  # league_id=NULL → pickup

        async def fake_update_session(session, session_id, **kwargs):
            return {**_PICKUP_SESSION, "season_id": _SEASON_ID, "league_id": _TARGET_LEAGUE_ID}

        async def fake_has_league_role(session, user_id, league_id, required_role):
            return False  # not an admin of the target league

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "update_session", fake_update_session, raising=True)

        # Patch _has_league_role on the sessions module directly (the route imports it
        # by name, so patching auth_dependencies has no effect on the bound reference).
        import backend.api.routes.sessions as sessions_module

        monkeypatch.setattr(
            sessions_module, "_has_league_role", fake_has_league_role, raising=True
        )

        # The route does a raw Season.league_id query to resolve the target league.
        # Return _TARGET_LEAGUE_ID so we don't touch the real DB.
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = _TARGET_LEAGUE_ID

        async def fake_execute(self_session, query, *args, **kwargs):
            return mock_result

        monkeypatch.setattr(AsyncSession, "execute", fake_execute, raising=True)

        response = client.patch(
            f"/api/sessions/{_SESSION_ID}",
            json={"season_id": _SEASON_ID},
            headers=headers,
        )
        assert response.status_code == 404, (
            f"Non-admin promoting a pickup session to a league session must be hidden (404).  "
            f"Got {response.status_code}: {response.text}.  "
            "Bug #4 (Case 1) not fixed: missing promotion authorization check."
        )

    def test_admin_can_promote_pickup_to_league(self, monkeypatch):
        """Target-league admin CAN promote a pickup session (Case 1, happy path)."""
        from unittest.mock import MagicMock
        from sqlalchemy.ext.asyncio import AsyncSession

        client, headers = _make_non_admin_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return _PICKUP_SESSION

        updated = {**_PICKUP_SESSION, "season_id": _SEASON_ID, "league_id": _TARGET_LEAGUE_ID}

        async def fake_update_session(session, session_id, **kwargs):
            return updated

        async def fake_has_league_role(session, user_id, league_id, required_role):
            return True  # IS an admin

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "update_session", fake_update_session, raising=True)

        # Patch _has_league_role on the sessions module (bound reference, not the origin).
        import backend.api.routes.sessions as sessions_module

        monkeypatch.setattr(
            sessions_module, "_has_league_role", fake_has_league_role, raising=True
        )

        # The route executes a raw Season query to get the target league_id.
        # Patch AsyncSession.execute to return the target league id so we never
        # touch the real DB.
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = _TARGET_LEAGUE_ID

        async def fake_execute(self_session, query, *args, **kwargs):
            return mock_result

        monkeypatch.setattr(AsyncSession, "execute", fake_execute, raising=True)

        response = client.patch(
            f"/api/sessions/{_SESSION_ID}",
            json={"season_id": _SEASON_ID},
            headers=headers,
        )
        assert response.status_code == 200, (
            f"League admin promoting a pickup session to league must succeed (200).  "
            f"Got {response.status_code}: {response.text}."
        )


# ---------------------------------------------------------------------------
# Case 3: Pickup session edit (no promotion) — collaborators only
# ---------------------------------------------------------------------------


class TestPickupSessionCollaborativeEdit:
    """Pickup collaborators may edit metadata; unrelated users may not."""

    def test_participant_can_rename_pickup_session(self, monkeypatch):
        """An existing pickup participant can rename the session."""
        client, headers = _make_non_admin_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return _PICKUP_SESSION

        updated = {**_PICKUP_SESSION, "name": "Renamed Pickup"}

        async def fake_update_session(session, session_id, **kwargs):
            return updated

        async def fake_can_collaborate(session, session_id, session_obj, user_id):
            return True

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "update_session", fake_update_session, raising=True)
        monkeypatch.setattr(
            data_service,
            "can_user_add_match_to_session",
            fake_can_collaborate,
            raising=True,
        )

        response = client.patch(
            f"/api/sessions/{_SESSION_ID}",
            json={"name": "Renamed Pickup"},
            headers=headers,
        )
        assert response.status_code == 200, (
            f"A pickup participant must be able to rename the session.  "
            f"Got {response.status_code}: {response.text}.  "
            "The collaborative pickup policy was not applied."
        )

    def test_unrelated_user_cannot_rename_pickup_session(self, monkeypatch):
        """Knowing a pickup session ID does not grant edit access."""
        client, headers = _make_non_admin_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return _PICKUP_SESSION

        async def fake_can_collaborate(session, session_id, session_obj, user_id):
            return False

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(
            data_service,
            "can_user_add_match_to_session",
            fake_can_collaborate,
            raising=True,
        )

        response = client.patch(
            f"/api/sessions/{_SESSION_ID}",
            json={"name": "Unauthorized Rename"},
            headers=headers,
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Case 4: Submit path — collaborators only
# ---------------------------------------------------------------------------


class TestCollaborativeSubmitPath:
    """A pickup collaborator may submit without league-admin authorization."""

    def test_participant_can_submit_session(self, monkeypatch):
        """A pickup participant can submit the session."""
        from sqlalchemy.ext.asyncio import AsyncSession

        client, headers = _make_non_admin_client(monkeypatch)

        async def fake_get_player(session, user_id):
            return {"id": _PLAYER_ID, "full_name": "Test Player", "user_id": _USER_ID}

        async def fake_get_session(session, session_id):
            return _PICKUP_SESSION

        async def fake_can_collaborate(session, session_id, session_obj, user_id):
            return True

        async def fake_lock_in_session(session, session_id, updated_by=None):
            return {
                "global_job_id": 55,
                "league_job_id": None,
                "season_id": _SEASON_ID,
            }

        async def fake_notify(*args, **kwargs):
            return None

        # Row: (name, season_id, league_id)
        async def fake_execute(self_session, query, *args, **kwargs):
            class FakeScalar:
                def first(self):
                    return ("Test Session", _SEASON_ID, None)

                def scalar_one_or_none(self):
                    return None

            return FakeScalar()

        monkeypatch.setattr(AsyncSession, "execute", fake_execute, raising=True)
        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "get_player_by_user_id", fake_get_player, raising=True)
        monkeypatch.setattr(data_service, "lock_in_session", fake_lock_in_session, raising=True)
        monkeypatch.setattr(
            data_service,
            "can_user_add_match_to_session",
            fake_can_collaborate,
            raising=True,
        )

        import backend.services.notifications.notification_service as notif_module

        monkeypatch.setattr(
            notif_module,
            "notify_players_about_session_submitted",
            fake_notify,
            raising=True,
        )

        response = client.patch(
            f"/api/sessions/{_SESSION_ID}",
            json={"submit": True},
            headers=headers,
        )
        assert response.status_code == 200, (
            f"A pickup participant must be able to submit the session.  "
            f"Got {response.status_code}: {response.text}.  "
            "The collaborative pickup policy was not applied."
        )
        data = response.json()
        assert data["global_job_id"] == 55


# ---------------------------------------------------------------------------
# Case 2 (gap game): editing a gap game (league_id set, season_id NULL) also
# requires league-admin.  Guards against a future regression that re-checks
# season_id and lets gap games fall through to the no-auth pickup path.
# ---------------------------------------------------------------------------


class TestGapGameEditRequiresAdmin:
    """REGRESSION (Bug #4, Case 2 — gap game): a gap game is a league session
    with no season; editing it must require league-admin authorization.
    """

    def test_non_admin_cannot_rename_gap_game(self, monkeypatch):
        """Non-admin editing a gap game's name must receive 404."""
        client, headers = _make_non_admin_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return _GAP_SESSION  # league_id set, season_id NULL

        async def fake_update_session(session, session_id, **kwargs):
            return {**_GAP_SESSION, "name": "Hacked Name"}

        async def fake_is_admin_of_session_league(session, user_id, session_id):
            return False

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "update_session", fake_update_session, raising=True)

        import backend.api.routes.sessions as sessions_module

        monkeypatch.setattr(
            sessions_module,
            "is_user_admin_of_session_league",
            fake_is_admin_of_session_league,
            raising=True,
        )

        response = client.patch(
            f"/api/sessions/{_SESSION_ID}",
            json={"name": "Hacked Name"},
            headers=headers,
        )
        assert response.status_code == 404, (
            f"Non-admin editing a gap game must be hidden with 404.  "
            f"Got {response.status_code}: {response.text}.  "
            "Bug #4 regression: gap games must follow the league-admin rule "
            "(discriminant is league_id, not season_id)."
        )

    def test_admin_can_rename_gap_game(self, monkeypatch):
        """League admin CAN rename a gap game (Case 2 happy path)."""
        client, headers = _make_non_admin_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return _GAP_SESSION

        async def fake_update_session(session, session_id, **kwargs):
            return {**_GAP_SESSION, "name": "Admin Renamed"}

        async def fake_is_admin_of_session_league(session, user_id, session_id):
            return True

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "update_session", fake_update_session, raising=True)

        import backend.api.routes.sessions as sessions_module

        monkeypatch.setattr(
            sessions_module,
            "is_user_admin_of_session_league",
            fake_is_admin_of_session_league,
            raising=True,
        )

        response = client.patch(
            f"/api/sessions/{_SESSION_ID}",
            json={"name": "Admin Renamed"},
            headers=headers,
        )
        assert response.status_code == 200, (
            f"League admin renaming a gap game must succeed (200).  "
            f"Got {response.status_code}: {response.text}."
        )


# ---------------------------------------------------------------------------
# Case 2 (demotion): removing the season from a league session (season_id→null)
# leaves it a gap game.  league_id stays set, so the edit still routes through
# the Case 2 league-admin check rather than the no-auth pickup path.
# ---------------------------------------------------------------------------


class TestDemotionToGapGameRequiresAdmin:
    """REGRESSION (Bug #4, Case 2 — demotion): clearing season_id on a league
    session must still require league-admin authorization.
    """

    def test_non_admin_cannot_demote_league_session_to_gap_game(self, monkeypatch):
        """Non-admin sending {season_id: null} on a league session gets 404."""
        client, headers = _make_non_admin_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return _LEAGUE_SESSION  # league_id set, season_id set

        async def fake_update_session(session, session_id, **kwargs):
            return {**_LEAGUE_SESSION, "season_id": None}

        async def fake_is_admin_of_session_league(session, user_id, session_id):
            return False

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "update_session", fake_update_session, raising=True)

        import backend.api.routes.sessions as sessions_module

        monkeypatch.setattr(
            sessions_module,
            "is_user_admin_of_session_league",
            fake_is_admin_of_session_league,
            raising=True,
        )

        response = client.patch(
            f"/api/sessions/{_SESSION_ID}",
            json={"season_id": None},
            headers=headers,
        )
        assert response.status_code == 404, (
            f"Non-admin demoting a league session to a gap game must be hidden (404).  "
            f"Got {response.status_code}: {response.text}.  "
            "Demotion (season_id→null) keeps league_id set, so it must route "
            "through the Case 2 league-admin check."
        )


# ---------------------------------------------------------------------------
# System-admin bypass: a platform admin may promote / edit league sessions
# without an explicit league_members row, matching make_require_league_admin.
# ---------------------------------------------------------------------------


class TestSystemAdminBypass:
    """REGRESSION (Bug #4 review HIGH-1): system admins bypass the per-league
    admin checks for both promotion (Case 1) and league-session edits (Case 2).
    """

    def test_system_admin_can_promote_pickup_to_league(self, monkeypatch):
        """A system admin promotes a pickup session even when not a member of
        the target league (``_has_league_role`` returns False)."""
        from unittest.mock import MagicMock
        from sqlalchemy.ext.asyncio import AsyncSession

        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return _PICKUP_SESSION

        async def fake_update_session(session, session_id, **kwargs):
            return {**_PICKUP_SESSION, "season_id": _SEASON_ID, "league_id": _TARGET_LEAGUE_ID}

        async def fake_has_league_role(session, user_id, league_id, required_role):
            return False  # NOT a league member — bypass must come from system admin

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "update_session", fake_update_session, raising=True)

        import backend.api.routes.sessions as sessions_module

        monkeypatch.setattr(
            sessions_module, "_has_league_role", fake_has_league_role, raising=True
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = _TARGET_LEAGUE_ID

        async def fake_execute(self_session, query, *args, **kwargs):
            return mock_result

        monkeypatch.setattr(AsyncSession, "execute", fake_execute, raising=True)

        response = client.patch(
            f"/api/sessions/{_SESSION_ID}",
            json={"season_id": _SEASON_ID},
            headers=headers,
        )
        assert response.status_code == 200, (
            f"System admin promoting a pickup session must succeed (200).  "
            f"Got {response.status_code}: {response.text}.  "
            "Review HIGH-1 not fixed: system-admin bypass missing on promotion."
        )

    def test_system_admin_can_edit_league_session(self, monkeypatch):
        """A system admin edits a league session even when not a league admin
        (``is_user_admin_of_session_league`` returns False)."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return _LEAGUE_SESSION

        async def fake_update_session(session, session_id, **kwargs):
            return {**_LEAGUE_SESSION, "name": "Sysadmin Renamed"}

        async def fake_is_admin_of_session_league(session, user_id, session_id):
            return False  # NOT a league admin — bypass must come from system admin

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "update_session", fake_update_session, raising=True)

        import backend.api.routes.sessions as sessions_module

        monkeypatch.setattr(
            sessions_module,
            "is_user_admin_of_session_league",
            fake_is_admin_of_session_league,
            raising=True,
        )

        response = client.patch(
            f"/api/sessions/{_SESSION_ID}",
            json={"name": "Sysadmin Renamed"},
            headers=headers,
        )
        assert response.status_code == 200, (
            f"System admin editing a league session must succeed (200).  "
            f"Got {response.status_code}: {response.text}.  "
            "Review HIGH-1 not fixed: system-admin bypass missing on Case 2 edit."
        )
