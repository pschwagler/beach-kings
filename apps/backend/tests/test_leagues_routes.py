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
"""

from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services import auth_service, data_service, notification_service, user_service

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

        async def fake_get_league_messages(session, league_id):
            return [{"id": 1, "message": "Hello", "user_id": USER_ID}]

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
                            {"player_id": 10, "first_name": "Mike", "avatar": None},
                            {"player_id": 11, "first_name": "Jordan", "avatar": "abc.jpg"},
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
