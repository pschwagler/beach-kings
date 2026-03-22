"""
Unit tests for user route endpoints not covered by test_api_routes_comprehensive.py.

Covered here:
- PUT  /api/users/me              — update user profile (email)
- POST /api/users/me/avatar       — upload avatar (multipart)
- DELETE /api/users/me/avatar     — delete avatar
- GET  /api/users/me/leagues      — list user's leagues
- POST /api/users/me/delete       — schedule account deletion
- POST /api/users/me/cancel-deletion — cancel account deletion

Already tested in test_api_routes_comprehensive.py:
- GET /api/users/me/player
- PUT /api/users/me/player
"""

from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services import auth_service, user_service, data_service, avatar_service, s3_service


# ============================================================================
# Auth helper
# ============================================================================

USER_ID = 1
PHONE = "+10000000000"

FAKE_USER = {
    "id": USER_ID,
    "phone_number": PHONE,
    "name": "Test User",
    "email": "test@example.com",
    "is_verified": True,
    "created_at": "2020-01-01T00:00:00Z",
}


def _make_authed_client(monkeypatch, phone: str = PHONE, user_id: int = USER_ID):
    """
    Return a (TestClient, auth_headers) pair with auth dependencies stubbed out.

    Patches:
    - auth_service.verify_token — synchronous, returns fake token payload
    - user_service.get_user_by_id — async, returns fake user dict
    """

    def fake_verify_token(token: str):
        return {"user_id": user_id, "phone_number": phone}

    async def fake_get_user_by_id(session, uid: int):
        return {**FAKE_USER, "id": uid, "phone_number": phone}

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)

    return TestClient(app), {"Authorization": "Bearer dummy"}


# ============================================================================
# PUT /api/users/me
# ============================================================================


class TestUpdateCurrentUser:
    """Tests for PUT /api/users/me."""

    def test_update_email_success(self, monkeypatch):
        """Returns updated user when email update succeeds."""
        client, headers = _make_authed_client(monkeypatch)

        async def fake_update_user(session, user_id, email=None):
            return True

        monkeypatch.setattr(user_service, "update_user", fake_update_user, raising=True)

        response = client.put(
            "/api/users/me",
            json={"email": "newemail@example.com"},
            headers=headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == USER_ID
        assert data["phone_number"] == PHONE

    def test_update_user_no_fields_returns_400(self, monkeypatch):
        """Returns 400 when update_user reports nothing to update."""
        client, headers = _make_authed_client(monkeypatch)

        async def fake_update_user(session, user_id, email=None):
            return False

        monkeypatch.setattr(user_service, "update_user", fake_update_user, raising=True)

        response = client.put("/api/users/me", json={}, headers=headers)

        assert response.status_code == 400
        assert "No fields provided" in response.json()["detail"]

    def test_update_user_requires_auth(self, monkeypatch):
        """Returns 401 when no auth token is provided."""
        client = TestClient(app)

        response = client.put("/api/users/me", json={"email": "x@x.com"})

        assert response.status_code == 401


# ============================================================================
# POST /api/users/me/avatar
# ============================================================================


class TestUploadAvatar:
    """Tests for POST /api/users/me/avatar."""

    def _stub_avatar_services(self, monkeypatch, player_id: int = 42):
        """Patch the avatar/S3 service calls that upload_avatar uses."""
        fake_player = {
            "id": player_id,
            "full_name": "Test User",
            "profile_picture_url": None,
        }

        async def fake_get_player(session, user_id):
            return fake_player

        monkeypatch.setattr(
            data_service, "get_player_by_user_id_with_stats", fake_get_player, raising=True
        )
        monkeypatch.setattr(
            avatar_service, "validate_avatar", lambda b, ct: (True, ""), raising=True
        )
        monkeypatch.setattr(avatar_service, "process_avatar", lambda b: b, raising=True)
        monkeypatch.setattr(
            s3_service,
            "upload_avatar",
            lambda pid, b: "https://cdn.example.com/avatar.jpg",
            raising=True,
        )
        monkeypatch.setattr(s3_service, "delete_avatar", lambda url: True, raising=True)

    def test_upload_avatar_success(self, monkeypatch):
        """Returns profile_picture_url on successful upload."""
        client, headers = _make_authed_client(monkeypatch)
        self._stub_avatar_services(monkeypatch)

        # Patch the DB select so no real DB is needed.
        # AsyncSession.execute is an instance method; the mock must accept `self`.
        mock_player_obj = MagicMock()
        mock_player_obj.profile_picture_url = None
        mock_player_obj.avatar = None
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_player_obj

        async def fake_execute(self_arg, stmt):
            return mock_result

        # Also stub session.commit so it does not hit the DB
        async def fake_commit(self_arg):
            pass

        with (
            patch("sqlalchemy.ext.asyncio.AsyncSession.execute", new=fake_execute),
            patch("sqlalchemy.ext.asyncio.AsyncSession.commit", new=fake_commit),
        ):
            response = client.post(
                "/api/users/me/avatar",
                files={"file": ("test.jpg", b"fake_image_bytes", "image/jpeg")},
                headers=headers,
            )

        assert response.status_code == 200
        assert "profile_picture_url" in response.json()

    def test_upload_avatar_no_player_returns_404(self, monkeypatch):
        """Returns 404 when the user has no player profile."""
        client, headers = _make_authed_client(monkeypatch)

        async def fake_get_player(session, user_id):
            return None

        monkeypatch.setattr(
            data_service, "get_player_by_user_id_with_stats", fake_get_player, raising=True
        )

        response = client.post(
            "/api/users/me/avatar",
            files={"file": ("test.jpg", b"fake_image_bytes", "image/jpeg")},
            headers=headers,
        )

        assert response.status_code == 404
        assert "Player profile not found" in response.json()["detail"]

    def test_upload_avatar_invalid_file_returns_400(self, monkeypatch):
        """Returns 400 when avatar validation fails."""
        client, headers = _make_authed_client(monkeypatch)

        fake_player = {"id": 42, "full_name": "Test User", "profile_picture_url": None}

        async def fake_get_player(session, user_id):
            return fake_player

        monkeypatch.setattr(
            data_service, "get_player_by_user_id_with_stats", fake_get_player, raising=True
        )
        monkeypatch.setattr(
            avatar_service,
            "validate_avatar",
            lambda b, ct: (False, "File too large"),
            raising=True,
        )

        response = client.post(
            "/api/users/me/avatar",
            files={"file": ("big.jpg", b"x" * 100, "image/jpeg")},
            headers=headers,
        )

        assert response.status_code == 400
        assert "File too large" in response.json()["detail"]

    def test_upload_avatar_requires_auth(self):
        """Returns 401 when no auth token is provided."""
        client = TestClient(app)

        response = client.post(
            "/api/users/me/avatar",
            files={"file": ("test.jpg", b"bytes", "image/jpeg")},
        )

        assert response.status_code == 401


# ============================================================================
# DELETE /api/users/me/avatar
# ============================================================================


class TestDeleteAvatar:
    """Tests for DELETE /api/users/me/avatar."""

    def test_delete_avatar_success(self, monkeypatch):
        """Returns success message when avatar is deleted."""
        client, headers = _make_authed_client(monkeypatch)

        fake_player = {
            "id": 42,
            "full_name": "Test User",
            "profile_picture_url": "https://cdn.example.com/old.jpg",
        }

        async def fake_get_player(session, user_id):
            return fake_player

        monkeypatch.setattr(
            data_service, "get_player_by_user_id_with_stats", fake_get_player, raising=True
        )
        monkeypatch.setattr(s3_service, "delete_avatar", lambda url: True, raising=True)
        monkeypatch.setattr(
            data_service, "generate_player_initials", lambda name: "TU", raising=True
        )

        mock_player_obj = MagicMock()
        mock_player_obj.full_name = "Test User"
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_player_obj

        async def fake_execute(self_arg, stmt):
            return mock_result

        async def fake_commit(self_arg):
            pass

        with (
            patch("sqlalchemy.ext.asyncio.AsyncSession.execute", new=fake_execute),
            patch("sqlalchemy.ext.asyncio.AsyncSession.commit", new=fake_commit),
        ):
            response = client.delete("/api/users/me/avatar", headers=headers)

        assert response.status_code == 200
        assert response.json()["message"] == "Avatar removed"

    def test_delete_avatar_no_player_returns_404(self, monkeypatch):
        """Returns 404 when the user has no player profile."""
        client, headers = _make_authed_client(monkeypatch)

        async def fake_get_player(session, user_id):
            return None

        monkeypatch.setattr(
            data_service, "get_player_by_user_id_with_stats", fake_get_player, raising=True
        )

        response = client.delete("/api/users/me/avatar", headers=headers)

        assert response.status_code == 404
        assert "Player profile not found" in response.json()["detail"]

    def test_delete_avatar_requires_auth(self):
        """Returns 401 when no auth token is provided."""
        client = TestClient(app)
        response = client.delete("/api/users/me/avatar")
        assert response.status_code == 401


# ============================================================================
# GET /api/users/me/leagues
# ============================================================================


class TestGetUserLeagues:
    """Tests for GET /api/users/me/leagues."""

    def test_returns_leagues_list(self, monkeypatch):
        """Returns the list of leagues the user belongs to."""
        client, headers = _make_authed_client(monkeypatch)

        fake_leagues = [
            {"id": 10, "name": "Beach Kings LA", "role": "admin"},
            {"id": 11, "name": "Beach Kings SD", "role": "member"},
        ]

        async def fake_get_user_leagues(session, user_id):
            return fake_leagues

        monkeypatch.setattr(data_service, "get_user_leagues", fake_get_user_leagues, raising=True)

        response = client.get("/api/users/me/leagues", headers=headers)

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["name"] == "Beach Kings LA"

    def test_returns_empty_list_when_no_leagues(self, monkeypatch):
        """Returns an empty list when the user is not in any league."""
        client, headers = _make_authed_client(monkeypatch)

        async def fake_get_user_leagues(session, user_id):
            return []

        monkeypatch.setattr(data_service, "get_user_leagues", fake_get_user_leagues, raising=True)

        response = client.get("/api/users/me/leagues", headers=headers)

        assert response.status_code == 200
        assert response.json() == []

    def test_get_leagues_requires_auth(self):
        """Returns 401 when no auth token is provided."""
        client = TestClient(app)
        response = client.get("/api/users/me/leagues")
        assert response.status_code == 401


# ============================================================================
# POST /api/users/me/delete
# ============================================================================


class TestScheduleAccountDeletion:
    """Tests for POST /api/users/me/delete."""

    def test_schedule_deletion_success(self, monkeypatch):
        """Returns success message when deletion is scheduled."""
        client, headers = _make_authed_client(monkeypatch)

        async def fake_schedule_deletion(session, user_id):
            return True

        monkeypatch.setattr(
            user_service, "schedule_account_deletion", fake_schedule_deletion, raising=True
        )

        response = client.post("/api/users/me/delete", headers=headers)

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "30 days" in data["message"]

    def test_schedule_deletion_user_not_found_returns_404(self, monkeypatch):
        """Returns 404 when the service cannot find the user."""
        client, headers = _make_authed_client(monkeypatch)

        async def fake_schedule_deletion(session, user_id):
            return False

        monkeypatch.setattr(
            user_service, "schedule_account_deletion", fake_schedule_deletion, raising=True
        )

        response = client.post("/api/users/me/delete", headers=headers)

        assert response.status_code == 404
        assert "User not found" in response.json()["detail"]

    def test_schedule_deletion_requires_auth(self):
        """Returns 401 when no auth token is provided."""
        client = TestClient(app)
        response = client.post("/api/users/me/delete")
        assert response.status_code == 401


# ============================================================================
# POST /api/users/me/cancel-deletion
# ============================================================================


class TestCancelAccountDeletion:
    """Tests for POST /api/users/me/cancel-deletion."""

    def test_cancel_deletion_success(self, monkeypatch):
        """Returns success message when pending deletion is cancelled."""
        client, headers = _make_authed_client(monkeypatch)

        async def fake_cancel_deletion(session, user_id):
            return True

        monkeypatch.setattr(
            user_service, "cancel_account_deletion", fake_cancel_deletion, raising=True
        )

        response = client.post("/api/users/me/cancel-deletion", headers=headers)

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "cancelled" in data["message"].lower()

    def test_cancel_deletion_no_pending_returns_400(self, monkeypatch):
        """Returns 400 when there is no pending deletion to cancel."""
        client, headers = _make_authed_client(monkeypatch)

        async def fake_cancel_deletion(session, user_id):
            return False

        monkeypatch.setattr(
            user_service, "cancel_account_deletion", fake_cancel_deletion, raising=True
        )

        response = client.post("/api/users/me/cancel-deletion", headers=headers)

        assert response.status_code == 400
        assert "No pending deletion" in response.json()["detail"]

    def test_cancel_deletion_requires_auth(self):
        """Returns 401 when no auth token is provided."""
        client = TestClient(app)
        response = client.post("/api/users/me/cancel-deletion")
        assert response.status_code == 401
