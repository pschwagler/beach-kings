"""
Unit tests for league route endpoints not covered by test_api_routes_comprehensive.py.

Covered endpoints:
- GET  /api/leagues/{league_id}/members
- POST /api/leagues/{league_id}/members
- POST /api/leagues/{league_id}/members_batch
- PUT  /api/leagues/{league_id}/members/{member_id}
- DELETE /api/leagues/{league_id}/members/{member_id}
- POST /api/leagues/{league_id}/join
- POST /api/leagues/{league_id}/request-join
- DELETE /api/leagues/{league_id}/join-request
- GET  /api/leagues/{league_id}/join-requests
- POST /api/leagues/{league_id}/leave
- GET  /api/leagues/{league_id}/home-courts
- POST /api/leagues/{league_id}/home-courts
- DELETE /api/leagues/{league_id}/home-courts/{court_id}
- PUT  /api/leagues/{league_id}/home-courts  (set all)
- PUT  /api/leagues/{league_id}/home-courts/reorder
- GET  /api/leagues/{league_id}/messages
- POST /api/leagues/{league_id}/messages
- POST /api/leagues/query
- GET  /api/leagues/{league_id}/standings
"""

from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services import (
    auth_service,
    data_service,
    message_write_policy,
    notification_service,
    role_service,
    user_service,
)

LEAGUE_ID = 42
MEMBER_ID = 7
PLAYER_ID = 3
COURT_ID = 9
USER_ID = 1
PHONE = "+10000000000"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_admin_client(monkeypatch, phone: str = PHONE, user_id: int = USER_ID):
    """
    Return (TestClient, auth_headers) with the user treated as a system admin.

    System-admin status bypasses all league-role DB queries, so a single helper
    works for both league-admin and league-member gated endpoints.
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

    async def fake_is_system_admin(session, uid: int) -> bool:
        return True

    monkeypatch.setattr(role_service, "is_system_admin", fake_is_system_admin, raising=True)
    return TestClient(app), {"Authorization": "Bearer dummy"}


def _make_user_client(monkeypatch, phone: str = PHONE, user_id: int = USER_ID):
    """Return (TestClient, auth_headers) for a plain authenticated user (no admin)."""

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

    async def fake_is_system_admin(session, uid: int) -> bool:
        return False

    monkeypatch.setattr(role_service, "is_system_admin", fake_is_system_admin, raising=True)
    return TestClient(app), {"Authorization": "Bearer dummy"}


async def _noop(*args, **kwargs):
    """Generic no-op coroutine for notification mocks."""
    return None


# ---------------------------------------------------------------------------
# GET /api/leagues/{league_id}/members
# ---------------------------------------------------------------------------


class TestListLeagueMembers:
    """Tests for GET /api/leagues/{league_id}/members."""

    def test_list_members_success(self, monkeypatch):
        """Returns member list for any authenticated user."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_list_league_members(session, league_id: int):
            return [{"id": MEMBER_ID, "player_id": PLAYER_ID, "role": "member"}]

        monkeypatch.setattr(
            data_service, "list_league_members", fake_list_league_members, raising=True
        )

        response = client.get(f"/api/leagues/{LEAGUE_ID}/members", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert data[0]["player_id"] == PLAYER_ID

    def test_list_members_unauthenticated(self, monkeypatch):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.get(f"/api/leagues/{LEAGUE_ID}/members")
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# POST /api/leagues/{league_id}/members
# ---------------------------------------------------------------------------


class TestAddLeagueMember:
    """Tests for POST /api/leagues/{league_id}/members."""

    def test_add_member_success(self, monkeypatch):
        """League admin can add a player."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_add_league_member(session, league_id, player_id, role):
            return {"id": MEMBER_ID, "player_id": player_id, "role": role}

        monkeypatch.setattr(
            data_service, "add_league_member", fake_add_league_member, raising=True
        )
        monkeypatch.setattr(
            notification_service,
            "notify_members_about_new_member_background",
            _noop,
            raising=True,
        )

        response = client.post(
            f"/api/leagues/{LEAGUE_ID}/members",
            json={"player_id": PLAYER_ID, "role": "member"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["player_id"] == PLAYER_ID

    def test_add_member_missing_player_id(self, monkeypatch):
        """Missing player_id returns 400."""
        client, headers = _make_admin_client(monkeypatch)

        response = client.post(
            f"/api/leagues/{LEAGUE_ID}/members",
            json={"role": "member"},
            headers=headers,
        )
        assert response.status_code == 400

    def test_add_member_unauthenticated(self, monkeypatch):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.post(
            f"/api/leagues/{LEAGUE_ID}/members",
            json={"player_id": PLAYER_ID},
        )
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# POST /api/leagues/{league_id}/members_batch
# ---------------------------------------------------------------------------


class TestAddLeagueMembersBatch:
    """Tests for POST /api/leagues/{league_id}/members_batch."""

    def test_batch_add_success(self, monkeypatch):
        """League admin can batch-add players."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_add_league_members_batch(session, league_id, members):
            added = [
                {"id": i + 1, "player_id": m["player_id"], "role": m.get("role", "member")}
                for i, m in enumerate(members)
            ]
            return {"added": added, "failed": []}

        monkeypatch.setattr(
            data_service, "add_league_members_batch", fake_add_league_members_batch, raising=True
        )
        monkeypatch.setattr(
            notification_service,
            "notify_members_about_new_member_background",
            _noop,
            raising=True,
        )

        response = client.post(
            f"/api/leagues/{LEAGUE_ID}/members_batch",
            json={"members": [{"player_id": 10}, {"player_id": 11}]},
            headers=headers,
        )
        assert response.status_code == 200
        body = response.json()
        assert len(body["added"]) == 2
        assert body["failed"] == []

    def test_batch_add_invalid_body(self, monkeypatch):
        """Non-array members field returns 400."""
        client, headers = _make_admin_client(monkeypatch)

        response = client.post(
            f"/api/leagues/{LEAGUE_ID}/members_batch",
            json={"members": "not-a-list"},
            headers=headers,
        )
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# PUT /api/leagues/{league_id}/members/{member_id}
# ---------------------------------------------------------------------------


class TestUpdateLeagueMember:
    """Tests for PUT /api/leagues/{league_id}/members/{member_id}."""

    def test_update_member_role_success(self, monkeypatch):
        """League admin can update a member's role."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_update_league_member(session, league_id, member_id, role):
            return {"id": member_id, "player_id": PLAYER_ID, "role": role}

        monkeypatch.setattr(
            data_service, "update_league_member", fake_update_league_member, raising=True
        )

        response = client.put(
            f"/api/leagues/{LEAGUE_ID}/members/{MEMBER_ID}",
            json={"role": "admin"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["role"] == "admin"

    def test_update_member_invalid_role(self, monkeypatch):
        """Invalid role value returns 400."""
        client, headers = _make_admin_client(monkeypatch)

        response = client.put(
            f"/api/leagues/{LEAGUE_ID}/members/{MEMBER_ID}",
            json={"role": "superuser"},
            headers=headers,
        )
        assert response.status_code == 400

    def test_update_member_not_found(self, monkeypatch):
        """Non-existent member returns 404."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_update_league_member(session, league_id, member_id, role):
            return None

        monkeypatch.setattr(
            data_service, "update_league_member", fake_update_league_member, raising=True
        )

        response = client.put(
            f"/api/leagues/{LEAGUE_ID}/members/{MEMBER_ID}",
            json={"role": "member"},
            headers=headers,
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/leagues/{league_id}/members/{member_id}
# ---------------------------------------------------------------------------


class TestRemoveLeagueMember:
    """Tests for DELETE /api/leagues/{league_id}/members/{member_id}."""

    def test_remove_member_unauthenticated(self, monkeypatch):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.delete(f"/api/leagues/{LEAGUE_ID}/members/{MEMBER_ID}")
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# POST /api/leagues/{league_id}/join
# ---------------------------------------------------------------------------


class TestJoinLeague:
    """Tests for POST /api/leagues/{league_id}/join."""

    def test_join_open_league_success(self, monkeypatch):
        """Authenticated user can join an open league."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_league(session, league_id):
            return {"id": league_id, "name": "Test League", "is_open": True}

        async def fake_get_player_by_user_id(session, user_id):
            return {"id": PLAYER_ID, "user_id": user_id}

        async def fake_is_league_member(session, league_id, player_id):
            return False

        async def fake_add_league_member(session, league_id, player_id, role):
            return {"id": MEMBER_ID, "player_id": player_id, "role": role}

        async def fake_notify_members(*args, **kwargs):
            return None

        monkeypatch.setattr(data_service, "get_league", fake_get_league, raising=True)
        monkeypatch.setattr(
            data_service, "get_player_by_user_id", fake_get_player_by_user_id, raising=True
        )
        monkeypatch.setattr(data_service, "is_league_member", fake_is_league_member, raising=True)
        monkeypatch.setattr(
            data_service, "add_league_member", fake_add_league_member, raising=True
        )
        monkeypatch.setattr(
            notification_service,
            "notify_members_about_new_member",
            fake_notify_members,
            raising=True,
        )

        response = client.post(f"/api/leagues/{LEAGUE_ID}/join", headers=headers)
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_join_closed_league_returns_400(self, monkeypatch):
        """Joining an invite-only league directly returns 400."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_league(session, league_id):
            return {"id": league_id, "name": "Private League", "is_open": False}

        monkeypatch.setattr(data_service, "get_league", fake_get_league, raising=True)

        response = client.post(f"/api/leagues/{LEAGUE_ID}/join", headers=headers)
        assert response.status_code == 400
        assert "invite-only" in response.json()["detail"].lower()

    def test_join_already_member_returns_400(self, monkeypatch):
        """Joining a league the user already belongs to returns 400."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_league(session, league_id):
            return {"id": league_id, "is_open": True}

        async def fake_get_player_by_user_id(session, user_id):
            return {"id": PLAYER_ID, "user_id": user_id}

        async def fake_is_league_member(session, league_id, player_id):
            return True

        monkeypatch.setattr(data_service, "get_league", fake_get_league, raising=True)
        monkeypatch.setattr(
            data_service, "get_player_by_user_id", fake_get_player_by_user_id, raising=True
        )
        monkeypatch.setattr(data_service, "is_league_member", fake_is_league_member, raising=True)

        response = client.post(f"/api/leagues/{LEAGUE_ID}/join", headers=headers)
        assert response.status_code == 400
        assert "already a member" in response.json()["detail"].lower()

    def test_join_league_unauthenticated(self, monkeypatch):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.post(f"/api/leagues/{LEAGUE_ID}/join")
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# POST /api/leagues/{league_id}/request-join
# ---------------------------------------------------------------------------


class TestRequestJoinLeague:
    """Tests for POST /api/leagues/{league_id}/request-join."""

    def test_request_join_invite_only_success(self, monkeypatch):
        """User can submit a join request for an invite-only league."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_league(session, league_id):
            return {"id": league_id, "is_open": False}

        async def fake_get_player_by_user_id(session, user_id):
            return {"id": PLAYER_ID, "user_id": user_id}

        async def fake_is_league_member(session, league_id, player_id):
            return False

        async def fake_create_league_request(session, league_id, player_id):
            return {"id": 55, "league_id": league_id, "player_id": player_id, "status": "pending"}

        monkeypatch.setattr(data_service, "get_league", fake_get_league, raising=True)
        monkeypatch.setattr(
            data_service, "get_player_by_user_id", fake_get_player_by_user_id, raising=True
        )
        monkeypatch.setattr(data_service, "is_league_member", fake_is_league_member, raising=True)
        monkeypatch.setattr(
            data_service, "create_league_request", fake_create_league_request, raising=True
        )
        monkeypatch.setattr(
            notification_service,
            "notify_admins_about_join_request",
            _noop,
            raising=True,
        )

        response = client.post(f"/api/leagues/{LEAGUE_ID}/request-join", headers=headers)
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["request_id"] == 55

    def test_request_join_open_league_returns_400(self, monkeypatch):
        """Attempting a join request on an open league returns 400."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_league(session, league_id):
            return {"id": league_id, "is_open": True}

        monkeypatch.setattr(data_service, "get_league", fake_get_league, raising=True)

        response = client.post(f"/api/leagues/{LEAGUE_ID}/request-join", headers=headers)
        assert response.status_code == 400
        assert "open" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# DELETE /api/leagues/{league_id}/join-request
# ---------------------------------------------------------------------------


class TestCancelJoinRequest:
    """Tests for DELETE /api/leagues/{league_id}/join-request."""

    def test_cancel_join_request_success(self, monkeypatch):
        """User can cancel their own pending join request."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_player_by_user_id(session, user_id):
            return {"id": PLAYER_ID, "user_id": user_id}

        async def fake_cancel_league_request(session, league_id, player_id):
            return True

        monkeypatch.setattr(
            data_service, "get_player_by_user_id", fake_get_player_by_user_id, raising=True
        )
        monkeypatch.setattr(
            data_service, "cancel_league_request", fake_cancel_league_request, raising=True
        )

        response = client.delete(f"/api/leagues/{LEAGUE_ID}/join-request", headers=headers)
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_cancel_join_request_unauthenticated(self, monkeypatch):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.delete(f"/api/leagues/{LEAGUE_ID}/join-request")
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# GET /api/leagues/{league_id}/join-requests
# ---------------------------------------------------------------------------


class TestGetJoinRequests:
    """Tests for GET /api/leagues/{league_id}/join-requests."""

    def test_get_join_requests_success(self, monkeypatch):
        """League admin gets pending and rejected join requests."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_list_league_join_requests(session, league_id):
            return [{"id": 1, "player_id": PLAYER_ID, "status": "pending"}]

        async def fake_list_league_join_requests_rejected(session, league_id):
            return []

        monkeypatch.setattr(
            data_service, "list_league_join_requests", fake_list_league_join_requests, raising=True
        )
        monkeypatch.setattr(
            data_service,
            "list_league_join_requests_rejected",
            fake_list_league_join_requests_rejected,
            raising=True,
        )

        response = client.get(f"/api/leagues/{LEAGUE_ID}/join-requests", headers=headers)
        assert response.status_code == 200
        body = response.json()
        assert "pending" in body
        assert "rejected" in body
        assert len(body["pending"]) == 1

    def test_get_join_requests_unauthenticated(self, monkeypatch):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.get(f"/api/leagues/{LEAGUE_ID}/join-requests")
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# POST /api/leagues/{league_id}/join-requests/{request_id}/approve
# ---------------------------------------------------------------------------


REQUEST_ID = 5


class TestApproveJoinRequest:
    """Tests for POST /api/leagues/{league_id}/join-requests/{request_id}/approve."""

    def test_approve_join_request_success(self, monkeypatch):
        """Admin can approve a pending join request; player is added to the league."""
        from unittest.mock import AsyncMock, MagicMock

        client, headers = _make_admin_client(monkeypatch)

        async def fake_add_league_member(session, league_id, player_id, role):
            return {
                "id": 99,
                "league_id": league_id,
                "player_id": player_id,
                "role": role,
                "created_at": "2026-01-01T00:00:00Z",
            }

        monkeypatch.setattr(
            data_service, "add_league_member", fake_add_league_member, raising=True
        )
        monkeypatch.setattr(
            notification_service,
            "notify_player_about_join_approval",
            _noop,
            raising=True,
        )
        monkeypatch.setattr(
            notification_service,
            "notify_members_about_new_member",
            _noop,
            raising=True,
        )

        # Patch session.execute to return a fake join request row.
        fake_join_request = MagicMock()
        fake_join_request.player_id = PLAYER_ID

        fake_scalar = MagicMock()
        fake_scalar.scalar_one_or_none.return_value = fake_join_request

        # Second execute (player user_id lookup) returns None safely.
        fake_player_scalar = MagicMock()
        fake_player_scalar.scalar_one_or_none.return_value = None

        execute_mock = AsyncMock(side_effect=[fake_scalar, MagicMock(), fake_player_scalar])
        monkeypatch.setattr("sqlalchemy.ext.asyncio.AsyncSession.execute", execute_mock)
        monkeypatch.setattr(
            "sqlalchemy.ext.asyncio.AsyncSession.commit", AsyncMock(), raising=False
        )

        response = client.post(
            f"/api/leagues/{LEAGUE_ID}/join-requests/{REQUEST_ID}/approve",
            headers=headers,
        )
        assert response.status_code == 200
        body = response.json()
        assert body.get("success") is True

    def test_approve_join_request_not_found(self, monkeypatch):
        """Returns 404 when the join request does not exist."""
        from unittest.mock import AsyncMock, MagicMock

        client, headers = _make_admin_client(monkeypatch)

        fake_scalar = MagicMock()
        fake_scalar.scalar_one_or_none.return_value = None
        execute_mock = AsyncMock(return_value=fake_scalar)
        monkeypatch.setattr("sqlalchemy.ext.asyncio.AsyncSession.execute", execute_mock)

        response = client.post(
            f"/api/leagues/{LEAGUE_ID}/join-requests/{REQUEST_ID}/approve",
            headers=headers,
        )
        assert response.status_code == 404

    def test_approve_join_request_unauthenticated(self, monkeypatch):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.post(f"/api/leagues/{LEAGUE_ID}/join-requests/{REQUEST_ID}/approve")
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# POST /api/leagues/{league_id}/join-requests/{request_id}/reject
# ---------------------------------------------------------------------------


class TestRejectJoinRequest:
    """Tests for POST /api/leagues/{league_id}/join-requests/{request_id}/reject."""

    def test_reject_join_request_success(self, monkeypatch):
        """Admin can reject a pending join request."""
        from unittest.mock import AsyncMock, MagicMock

        client, headers = _make_admin_client(monkeypatch)

        monkeypatch.setattr(
            notification_service,
            "notify_player_about_join_rejection",
            _noop,
            raising=True,
        )

        fake_join_request = MagicMock()
        fake_join_request.player_id = PLAYER_ID

        fake_scalar = MagicMock()
        fake_scalar.scalar_one_or_none.return_value = fake_join_request

        # Second execute: player user_id lookup returns None.
        fake_player_scalar = MagicMock()
        fake_player_scalar.scalar_one_or_none.return_value = None

        execute_mock = AsyncMock(side_effect=[fake_scalar, fake_player_scalar, MagicMock()])
        monkeypatch.setattr("sqlalchemy.ext.asyncio.AsyncSession.execute", execute_mock)
        monkeypatch.setattr(
            "sqlalchemy.ext.asyncio.AsyncSession.commit", AsyncMock(), raising=False
        )

        response = client.post(
            f"/api/leagues/{LEAGUE_ID}/join-requests/{REQUEST_ID}/reject",
            headers=headers,
        )
        assert response.status_code == 200
        body = response.json()
        assert body.get("success") is True

    def test_reject_join_request_not_found(self, monkeypatch):
        """Returns 404 when the join request does not exist."""
        from unittest.mock import AsyncMock, MagicMock

        client, headers = _make_admin_client(monkeypatch)

        fake_scalar = MagicMock()
        fake_scalar.scalar_one_or_none.return_value = None
        execute_mock = AsyncMock(return_value=fake_scalar)
        monkeypatch.setattr("sqlalchemy.ext.asyncio.AsyncSession.execute", execute_mock)

        response = client.post(
            f"/api/leagues/{LEAGUE_ID}/join-requests/{REQUEST_ID}/reject",
            headers=headers,
        )
        assert response.status_code == 404

    def test_reject_join_request_unauthenticated(self, monkeypatch):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.post(f"/api/leagues/{LEAGUE_ID}/join-requests/{REQUEST_ID}/reject")
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# POST /api/leagues/{league_id}/leave
# ---------------------------------------------------------------------------


class TestLeaveLeague:
    """Tests for POST /api/leagues/{league_id}/leave."""

    def test_leave_league_success(self, monkeypatch):
        """Member can leave a league."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_player_by_user_id(session, user_id):
            return {"id": PLAYER_ID, "user_id": user_id}

        async def fake_is_league_member(session, league_id, player_id):
            return True

        async def fake_get_league_member_by_player(session, league_id, player_id):
            return {"id": MEMBER_ID, "player_id": player_id}

        async def fake_remove_league_member(session, league_id, member_id):
            return True

        monkeypatch.setattr(
            data_service, "get_player_by_user_id", fake_get_player_by_user_id, raising=True
        )
        monkeypatch.setattr(data_service, "is_league_member", fake_is_league_member, raising=True)
        monkeypatch.setattr(
            data_service,
            "get_league_member_by_player",
            fake_get_league_member_by_player,
            raising=True,
        )
        monkeypatch.setattr(
            data_service, "remove_league_member", fake_remove_league_member, raising=True
        )

        response = client.post(f"/api/leagues/{LEAGUE_ID}/leave", headers=headers)
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_leave_league_not_member_returns_400(self, monkeypatch):
        """Leaving a league the user doesn't belong to returns 400."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_player_by_user_id(session, user_id):
            return {"id": PLAYER_ID, "user_id": user_id}

        async def fake_is_league_member(session, league_id, player_id):
            return False

        monkeypatch.setattr(
            data_service, "get_player_by_user_id", fake_get_player_by_user_id, raising=True
        )
        monkeypatch.setattr(data_service, "is_league_member", fake_is_league_member, raising=True)

        response = client.post(f"/api/leagues/{LEAGUE_ID}/leave", headers=headers)
        assert response.status_code == 400
        assert "not a member" in response.json()["detail"].lower()

    def test_leave_league_unauthenticated(self, monkeypatch):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.post(f"/api/leagues/{LEAGUE_ID}/leave")
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Home courts
# ---------------------------------------------------------------------------


class TestLeagueHomeCourts:
    """Tests for /api/leagues/{league_id}/home-courts endpoints."""

    def test_list_home_courts_success(self, monkeypatch):
        """League member can list home courts."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_league_home_courts(session, league_id):
            return [
                {"id": COURT_ID, "name": "Test Court", "address": "123 Main St", "position": 0}
            ]

        monkeypatch.setattr(
            data_service, "get_league_home_courts", fake_get_league_home_courts, raising=True
        )

        response = client.get(f"/api/leagues/{LEAGUE_ID}/home-courts", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert data[0]["id"] == COURT_ID

    def test_add_home_court_success(self, monkeypatch):
        """League admin can add a home court."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_add_league_home_court(session, league_id, court_id):
            return {"id": court_id, "name": "Test Court", "address": "123 Main St", "position": 0}

        monkeypatch.setattr(
            data_service, "add_league_home_court", fake_add_league_home_court, raising=True
        )

        response = client.post(
            f"/api/leagues/{LEAGUE_ID}/home-courts",
            json={"court_id": COURT_ID},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["id"] == COURT_ID

    def test_add_home_court_missing_court_id(self, monkeypatch):
        """Missing court_id returns 400."""
        client, headers = _make_admin_client(monkeypatch)

        response = client.post(
            f"/api/leagues/{LEAGUE_ID}/home-courts",
            json={},
            headers=headers,
        )
        assert response.status_code == 400

    def test_remove_home_court_success(self, monkeypatch):
        """League admin can remove a home court."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_remove_league_home_court(session, league_id, court_id):
            return True

        monkeypatch.setattr(
            data_service, "remove_league_home_court", fake_remove_league_home_court, raising=True
        )

        response = client.delete(
            f"/api/leagues/{LEAGUE_ID}/home-courts/{COURT_ID}", headers=headers
        )
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_set_home_courts_success(self, monkeypatch):
        """League admin can set all home courts via PUT."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_set_league_home_courts(session, league_id, court_ids):
            return [
                {"id": cid, "name": f"Court {cid}", "address": None, "position": i}
                for i, cid in enumerate(court_ids)
            ]

        monkeypatch.setattr(
            data_service, "set_league_home_courts", fake_set_league_home_courts, raising=True
        )

        response = client.put(
            f"/api/leagues/{LEAGUE_ID}/home-courts",
            json={"court_ids": [1, 2, 3]},
            headers=headers,
        )
        assert response.status_code == 200
        assert len(response.json()) == 3

    def test_set_home_courts_missing_court_ids(self, monkeypatch):
        """Missing court_ids returns 400."""
        client, headers = _make_admin_client(monkeypatch)

        response = client.put(
            f"/api/leagues/{LEAGUE_ID}/home-courts",
            json={},
            headers=headers,
        )
        assert response.status_code == 400

    def test_reorder_home_courts_success(self, monkeypatch):
        """League admin can reorder home courts."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_reorder_league_home_courts(session, league_id, court_positions):
            return [
                {"court_id": cp["court_id"], "position": cp["position"]} for cp in court_positions
            ]

        monkeypatch.setattr(
            data_service,
            "reorder_league_home_courts",
            fake_reorder_league_home_courts,
            raising=True,
        )

        response = client.put(
            f"/api/leagues/{LEAGUE_ID}/home-courts/reorder",
            json={
                "court_positions": [{"court_id": 1, "position": 0}, {"court_id": 2, "position": 1}]
            },
            headers=headers,
        )
        assert response.status_code == 200
        assert len(response.json()) == 2

    def test_reorder_home_courts_missing_body(self, monkeypatch):
        """Missing court_positions returns 400."""
        client, headers = _make_admin_client(monkeypatch)

        response = client.put(
            f"/api/leagues/{LEAGUE_ID}/home-courts/reorder",
            json={},
            headers=headers,
        )
        assert response.status_code == 400

    def test_list_home_courts_unauthenticated(self, monkeypatch):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.get(f"/api/leagues/{LEAGUE_ID}/home-courts")
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# League messages
# ---------------------------------------------------------------------------


class TestLeagueMessages:
    """Tests for /api/leagues/{league_id}/messages endpoints."""

    def test_get_messages_success(self, monkeypatch):
        """League member can retrieve messages."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_league_messages(session, league_id, current_user_id=None):
            return [
                {
                    "id": 1,
                    "message": "Hello",
                    "user_id": USER_ID,
                    "is_mine": current_user_id == USER_ID,
                }
            ]

        monkeypatch.setattr(
            data_service, "get_league_messages", fake_get_league_messages, raising=True
        )

        response = client.get(f"/api/leagues/{LEAGUE_ID}/messages", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert data[0]["message"] == "Hello"

    def test_post_message_success(self, monkeypatch):
        """League member can post a message."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_create_league_message(session, league_id, user_id, message_text):
            return {"id": 2, "message": message_text, "user_id": user_id}

        monkeypatch.setattr(
            data_service, "create_league_message", fake_create_league_message, raising=True
        )
        monkeypatch.setattr(
            notification_service,
            "notify_league_members_about_message",
            _noop,
            raising=True,
        )

        response = client.post(
            f"/api/leagues/{LEAGUE_ID}/messages",
            json={"message": "Hello world"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["message"] == "Hello world"

    def test_post_empty_message_returns_400(self, monkeypatch):
        """Empty message body returns 400."""
        client, headers = _make_admin_client(monkeypatch)

        response = client.post(
            f"/api/leagues/{LEAGUE_ID}/messages",
            json={"message": "   "},
            headers=headers,
        )
        assert response.status_code == 400
        assert "empty" in response.json()["detail"].lower()

    def test_disabled_league_chat_writes_return_service_unavailable(self, monkeypatch):
        async def is_admin(*_args, **_kwargs):
            return True

        monkeypatch.setattr(role_service, "is_system_admin", is_admin, raising=True)
        client, headers = _make_admin_client(monkeypatch)

        async def fake_create(*_args, **_kwargs):
            raise message_write_policy.MessageWritesUnavailable()

        monkeypatch.setattr(data_service, "create_league_message", fake_create, raising=True)

        response = client.post(
            f"/api/leagues/{LEAGUE_ID}/messages",
            json={"message": "Hello"},
            headers=headers,
        )

        assert response.status_code == 503
        assert response.json()["detail"] == "Messaging is temporarily unavailable"

    def test_get_messages_unauthenticated(self, monkeypatch):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.get(f"/api/leagues/{LEAGUE_ID}/messages")
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# POST /api/leagues/query
# ---------------------------------------------------------------------------


class TestQueryLeagues:
    """Tests for POST /api/leagues/query."""

    def test_query_no_auth_success(self, monkeypatch):
        """Query endpoint works without authentication (get_current_user_optional)."""
        client = TestClient(app)

        async def fake_query_leagues(session, **kwargs):
            return {"items": [], "page": 1, "page_size": 25, "total_count": 0}

        monkeypatch.setattr(data_service, "query_leagues", fake_query_leagues, raising=True)

        response = client.post("/api/leagues/query", json={})
        assert response.status_code == 200
        body = response.json()
        assert "items" in body
        assert body["total_count"] == 0

    def test_query_with_filters(self, monkeypatch):
        """Filters are forwarded to the service."""
        client = TestClient(app)
        captured: dict = {}

        async def fake_query_leagues(session, **kwargs):
            captured.update(kwargs)
            return {"items": [], "page": 1, "page_size": 10, "total_count": 0}

        monkeypatch.setattr(data_service, "query_leagues", fake_query_leagues, raising=True)

        response = client.post(
            "/api/leagues/query",
            json={"gender": "mixed", "level": "intermediate", "page": 2, "page_size": 10},
        )
        assert response.status_code == 200
        assert captured.get("gender") == "mixed"
        assert captured.get("level") == "intermediate"
        assert captured.get("page") == 2
        assert captured.get("page_size") == 10

    def test_query_returns_friend_count_and_preview(self, monkeypatch):
        """friend_count and friends_preview fields are passed through from the service."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_setting(session, key: str):
            return None

        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)

        async def fake_query_leagues(session, **kwargs):
            return {
                "items": [
                    {
                        "id": 1,
                        "name": "Beach League",
                        "is_open": True,
                        "member_count": 8,
                        "friend_count": 2,
                        "friends_preview": [
                            {
                                "player_id": 10,
                                "first_name": "Mike",
                                "last_name": "Chen",
                                "avatar": None,
                            },
                            {
                                "player_id": 11,
                                "first_name": "Jordan",
                                "last_name": "Smith",
                                "avatar": "abc.jpg",
                            },
                        ],
                    },
                    {
                        "id": 2,
                        "name": "Invite League",
                        "is_open": False,
                        "member_count": 4,
                        "friend_count": 0,
                        "friends_preview": [],
                    },
                ],
                "page": 1,
                "page_size": 25,
                "total_count": 2,
            }

        monkeypatch.setattr(data_service, "query_leagues", fake_query_leagues, raising=True)

        response = client.post("/api/leagues/query", json={}, headers=headers)
        assert response.status_code == 200
        items = response.json()["items"]
        assert len(items) == 2

        # League with friends
        assert items[0]["friend_count"] == 2
        assert len(items[0]["friends_preview"]) == 2
        assert items[0]["friends_preview"][0]["first_name"] == "Mike"
        assert items[0]["friends_preview"][0]["last_name"] == "Chen"
        assert items[0]["friends_preview"][1]["avatar"] == "abc.jpg"

        # League without friends
        assert items[1]["friend_count"] == 0
        assert items[1]["friends_preview"] == []

    def test_query_no_auth_omits_friends(self, monkeypatch):
        """Unauthenticated query still works; service returns 0 friend_count."""
        client = TestClient(app)

        async def fake_query_leagues(session, **kwargs):
            # When user_id is None, service should return 0/empty for friends
            assert kwargs.get("user_id") is None
            return {
                "items": [
                    {
                        "id": 1,
                        "name": "Open League",
                        "is_open": True,
                        "friend_count": 0,
                        "friends_preview": [],
                    }
                ],
                "page": 1,
                "page_size": 25,
                "total_count": 1,
            }

        monkeypatch.setattr(data_service, "query_leagues", fake_query_leagues, raising=True)

        response = client.post("/api/leagues/query", json={})
        assert response.status_code == 200
        assert response.json()["items"][0]["friend_count"] == 0
        assert response.json()["items"][0]["friends_preview"] == []

    def test_query_with_text_search(self, monkeypatch):
        """q param is forwarded to the service."""
        client = TestClient(app)
        captured: dict = {}

        async def fake_query_leagues(session, **kwargs):
            captured.update(kwargs)
            return {"items": [], "page": 1, "page_size": 25, "total_count": 0}

        monkeypatch.setattr(data_service, "query_leagues", fake_query_leagues, raising=True)

        response = client.post("/api/leagues/query", json={"q": "beach"})
        assert response.status_code == 200
        assert captured.get("q") == "beach"

    def test_query_with_is_open_true(self, monkeypatch):
        """is_open=True is forwarded to the service."""
        client = TestClient(app)
        captured: dict = {}

        async def fake_query_leagues(session, **kwargs):
            captured.update(kwargs)
            return {"items": [], "page": 1, "page_size": 25, "total_count": 0}

        monkeypatch.setattr(data_service, "query_leagues", fake_query_leagues, raising=True)

        response = client.post("/api/leagues/query", json={"is_open": True})
        assert response.status_code == 200
        assert captured.get("is_open") is True

    def test_query_with_is_open_false(self, monkeypatch):
        """is_open=False (invite-only) is forwarded to the service."""
        client = TestClient(app)
        captured: dict = {}

        async def fake_query_leagues(session, **kwargs):
            captured.update(kwargs)
            return {"items": [], "page": 1, "page_size": 25, "total_count": 0}

        monkeypatch.setattr(data_service, "query_leagues", fake_query_leagues, raising=True)

        response = client.post("/api/leagues/query", json={"is_open": False})
        assert response.status_code == 200
        assert captured.get("is_open") is False

    def test_query_combined_filters(self, monkeypatch):
        """q, is_open, gender, and level can all be combined."""
        client = TestClient(app)
        captured: dict = {}

        async def fake_query_leagues(session, **kwargs):
            captured.update(kwargs)
            return {"items": [], "page": 1, "page_size": 25, "total_count": 0}

        monkeypatch.setattr(data_service, "query_leagues", fake_query_leagues, raising=True)

        response = client.post(
            "/api/leagues/query",
            json={"q": "kings", "is_open": True, "gender": "mens", "level": "A"},
        )
        assert response.status_code == 200
        assert captured.get("q") == "kings"
        assert captured.get("is_open") is True
        assert captured.get("gender") == "mens"
        assert captured.get("level") == "A"


# ---------------------------------------------------------------------------
# GET /api/leagues/{league_id}/standings
# ---------------------------------------------------------------------------

SEASON_ID = 4

_MOCK_STANDING = {
    "rank": 1,
    "player_id": 10,
    "display_name": "C. Gulla",
    "initials": "CG",
    "wins": 18,
    "losses": 2,
    "win_rate": 90.0,
    "rating": 1520.0,
    "rating_delta": None,
    "games_played": 20,
}

_MOCK_SEASON_INFO = {
    "id": SEASON_ID,
    "name": "Season 4",
    "started_at": "2026-03-01",
    "session_count": 3,
    "game_count": 36,
}


class TestGetLeagueStandings:
    """Tests for GET /api/leagues/{league_id}/standings."""

    def test_standings_by_season(self, monkeypatch):
        """Returns standings + season_info for a specific season_id."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_league_standings(session, league_id, season_id=None):
            return {"standings": [_MOCK_STANDING], "season_info": _MOCK_SEASON_INFO}

        monkeypatch.setattr(
            data_service, "get_league_standings", fake_get_league_standings, raising=True
        )

        response = client.get(
            f"/api/leagues/{LEAGUE_ID}/standings?season_id={SEASON_ID}", headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["standings"]) == 1
        assert data["standings"][0]["rank"] == 1
        assert data["standings"][0]["player_id"] == 10
        assert data["season_info"]["name"] == "Season 4"
        assert data["season_info"]["session_count"] == 3

    def test_standings_all_seasons(self, monkeypatch):
        """Returns aggregate standings with season_info=null when no season_id."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_league_standings(session, league_id, season_id=None):
            assert season_id is None
            return {"standings": [_MOCK_STANDING], "season_info": None}

        monkeypatch.setattr(
            data_service, "get_league_standings", fake_get_league_standings, raising=True
        )

        response = client.get(f"/api/leagues/{LEAGUE_ID}/standings", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data["standings"]) == 1
        assert data["season_info"] is None

    def test_standings_season_id_forwarded(self, monkeypatch):
        """season_id query param is forwarded to the service."""
        client, headers = _make_admin_client(monkeypatch)
        captured: dict = {}

        async def fake_get_league_standings(session, league_id, season_id=None):
            captured["league_id"] = league_id
            captured["season_id"] = season_id
            return {"standings": [], "season_info": None}

        monkeypatch.setattr(
            data_service, "get_league_standings", fake_get_league_standings, raising=True
        )

        client.get(f"/api/leagues/{LEAGUE_ID}/standings?season_id={SEASON_ID}", headers=headers)
        assert captured["league_id"] == LEAGUE_ID
        assert captured["season_id"] == SEASON_ID

    def test_standings_empty_league(self, monkeypatch):
        """League with no stats returns empty standings list."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_league_standings(session, league_id, season_id=None):
            return {"standings": [], "season_info": None}

        monkeypatch.setattr(
            data_service, "get_league_standings", fake_get_league_standings, raising=True
        )

        response = client.get(f"/api/leagues/{LEAGUE_ID}/standings", headers=headers)
        assert response.status_code == 200
        assert response.json()["standings"] == []

    def test_standings_non_member_rejected(self, monkeypatch):
        """Non-member gets 403 for a non-public (or unknown) league.

        Public-league standings are readable by non-members — see
        test_league_standings_access.test_non_member_allowed_for_public_league.
        Here LEAGUE_ID has no public league row, so the deny-by-default path applies.
        """
        client, headers = _make_user_client(monkeypatch)
        response = client.get(f"/api/leagues/{LEAGUE_ID}/standings", headers=headers)
        assert response.status_code == 403

    def test_standings_unauthenticated(self, monkeypatch):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.get(f"/api/leagues/{LEAGUE_ID}/standings")
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# GET /api/leagues/{league_id} — location_name field
# ---------------------------------------------------------------------------


class TestGetLeague:
    """Tests for GET /api/leagues/{league_id}."""

    def test_get_league_includes_location_name(self, monkeypatch):
        """Response includes location_name resolved from the joined Location row."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_league_detail(session, league_id, user_id):
            return {
                "id": league_id,
                "name": "Test League",
                "description": None,
                "location_id": "socal_sd",
                "location_name": "San Diego, CA",
                "is_open": True,
                "is_public": True,
                "whatsapp_group_id": None,
                "gender": None,
                "level": "Intermediate",
                "created_at": None,
                "updated_at": None,
                "home_courts": [],
                "member_count": 0,
                "season_count": 0,
                "current_season_id": None,
                "current_season_name": None,
                "is_active": False,
                "user_role": None,
                "user_rank": None,
                "user_wins": None,
                "user_losses": None,
                "user_rating": None,
            }

        monkeypatch.setattr(
            data_service, "get_league_detail", fake_get_league_detail, raising=True
        )

        response = client.get(f"/api/leagues/{LEAGUE_ID}", headers=headers)
        assert response.status_code == 200
        body = response.json()
        assert body["location_name"] == "San Diego, CA"


# ---------------------------------------------------------------------------
# GET /api/leagues/{league_id} — enriched detail (LeagueDetailResponse)
# ---------------------------------------------------------------------------

_LEAGUE_DETAIL_BASE = {
    "id": LEAGUE_ID,
    "name": "Test League",
    "description": "A test league",
    "location_id": "socal_sd",
    "location_name": "San Diego, CA",
    "is_open": True,
    "is_public": True,
    "whatsapp_group_id": None,
    "gender": None,
    "level": "Intermediate",
    "created_at": None,
    "updated_at": None,
    "home_courts": [],
    "member_count": 5,
    "season_count": 3,
    "current_season_id": 10,
    "current_season_name": "Summer 2025",
    "is_active": True,
    "user_role": "admin",
    "user_rank": 2,
    "user_wins": 8,
    "user_losses": 2,
    "user_rating": 120.5,
}


class TestGetLeagueDetail:
    """Tests for the enriched GET /api/leagues/{league_id} (LeagueDetailResponse)."""

    def test_happy_path_admin_member(self, monkeypatch):
        """Returns full detail including membership context for an admin member."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_league_detail(session, league_id, user_id):
            return {**_LEAGUE_DETAIL_BASE}

        monkeypatch.setattr(
            data_service, "get_league_detail", fake_get_league_detail, raising=True
        )

        response = client.get(f"/api/leagues/{LEAGUE_ID}", headers=headers)
        assert response.status_code == 200
        body = response.json()
        assert body["member_count"] == 5
        assert body["season_count"] == 3
        assert body["current_season_id"] == 10
        assert body["current_season_name"] == "Summer 2025"
        assert body["is_active"] is True
        assert body["user_role"] == "admin"
        assert body["user_rank"] == 2
        assert body["user_wins"] == 8
        assert body["user_losses"] == 2
        assert body["user_rating"] == 120.5

    def test_visitor_null_user_fields(self, monkeypatch):
        """Non-member visitor gets null for all user_* fields and user_role."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_league_detail(session, league_id, user_id):
            return {
                **_LEAGUE_DETAIL_BASE,
                "user_role": None,
                "user_rank": None,
                "user_wins": None,
                "user_losses": None,
                "user_rating": None,
            }

        monkeypatch.setattr(
            data_service, "get_league_detail", fake_get_league_detail, raising=True
        )

        response = client.get(f"/api/leagues/{LEAGUE_ID}", headers=headers)
        assert response.status_code == 200
        body = response.json()
        assert body["user_role"] is None
        assert body["user_rank"] is None
        assert body["user_wins"] is None
        assert body["user_losses"] is None
        assert body["user_rating"] is None

    def test_zero_seasons(self, monkeypatch):
        """League with no seasons returns season_count=0 and null current_season fields."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_league_detail(session, league_id, user_id):
            return {
                **_LEAGUE_DETAIL_BASE,
                "season_count": 0,
                "current_season_id": None,
                "current_season_name": None,
                "is_active": False,
                "user_rank": None,
                "user_wins": None,
                "user_losses": None,
                "user_rating": None,
            }

        monkeypatch.setattr(
            data_service, "get_league_detail", fake_get_league_detail, raising=True
        )

        response = client.get(f"/api/leagues/{LEAGUE_ID}", headers=headers)
        assert response.status_code == 200
        body = response.json()
        assert body["season_count"] == 0
        assert body["current_season_id"] is None
        assert body["is_active"] is False

    def test_no_active_season(self, monkeypatch):
        """League has seasons but none are currently active."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_league_detail(session, league_id, user_id):
            return {
                **_LEAGUE_DETAIL_BASE,
                "is_active": False,
            }

        monkeypatch.setattr(
            data_service, "get_league_detail", fake_get_league_detail, raising=True
        )

        response = client.get(f"/api/leagues/{LEAGUE_ID}", headers=headers)
        assert response.status_code == 200
        body = response.json()
        assert body["is_active"] is False

    def test_league_not_found_returns_404(self, monkeypatch):
        """Returns 404 when the service returns None."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_league_detail(session, league_id, user_id):
            return None

        monkeypatch.setattr(
            data_service, "get_league_detail", fake_get_league_detail, raising=True
        )

        response = client.get(f"/api/leagues/{LEAGUE_ID}", headers=headers)
        assert response.status_code == 404

    def test_requires_authentication(self, monkeypatch):
        """Returns 401 or 403 when no auth token is provided."""
        client = TestClient(app)
        response = client.get(f"/api/leagues/{LEAGUE_ID}")
        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# GET /api/leagues/{league_id}/seasons — is_active / session_count / game_count
# ---------------------------------------------------------------------------


SEASON_ID_2 = 10


class TestListSeasons:
    """Tests for GET /api/leagues/{league_id}/seasons."""

    def test_list_seasons_includes_is_active_and_counts(self, monkeypatch):
        """Season rows include is_active, session_count, and game_count."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_list_seasons(session, league_id):
            return [
                {
                    "id": SEASON_ID_2,
                    "league_id": league_id,
                    "name": "Summer 2025",
                    "start_date": "2025-06-01",
                    "end_date": None,
                    "is_active": True,
                    "session_count": 8,
                    "game_count": 40,
                    "scoring_system": None,
                    "point_system": None,
                    "awards_finalized_at": None,
                    "created_at": None,
                    "updated_at": None,
                }
            ]

        monkeypatch.setattr(data_service, "list_seasons", fake_list_seasons, raising=True)

        response = client.get(f"/api/leagues/{LEAGUE_ID}/seasons", headers=headers)
        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        season = body[0]
        assert season["is_active"] is True
        assert season["session_count"] == 8
        assert season["game_count"] == 40


# ---------------------------------------------------------------------------
# GET /api/leagues/{league_id}/join-requests — display_name / requested_at
# ---------------------------------------------------------------------------


class TestGetJoinRequestsFields:
    """Checks display_name and requested_at aliases in the join-requests response."""

    def test_get_join_requests_includes_display_name_and_requested_at(self, monkeypatch):
        """Pending join request rows include display_name and requested_at."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_list_league_join_requests(session, league_id):
            return [
                {
                    "id": 5,
                    "league_id": league_id,
                    "player_id": 20,
                    "player_name": "Alex Tran",
                    "display_name": "Alex Tran",
                    "status": "pending",
                    "created_at": "2025-07-01T00:00:00",
                    "requested_at": "2025-07-01T00:00:00",
                }
            ]

        async def fake_list_league_join_requests_rejected(session, league_id):
            return []

        monkeypatch.setattr(
            data_service,
            "list_league_join_requests",
            fake_list_league_join_requests,
            raising=True,
        )
        monkeypatch.setattr(
            data_service,
            "list_league_join_requests_rejected",
            fake_list_league_join_requests_rejected,
            raising=True,
        )

        response = client.get(f"/api/leagues/{LEAGUE_ID}/join-requests", headers=headers)
        assert response.status_code == 200
        body = response.json()
        assert len(body["pending"]) == 1
        req = body["pending"][0]
        assert req["display_name"] == "Alex Tran"
        assert req["requested_at"] == "2025-07-01T00:00:00"
