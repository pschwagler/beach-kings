"""
Unit tests for user route endpoints not covered by test_api_routes_comprehensive.py.

Covered here:
- PUT  /api/users/me              — update user profile (email)
- POST /api/users/me/avatar       — upload avatar (multipart)
- DELETE /api/users/me/avatar     — delete avatar
- GET  /api/users/me/leagues      — list user's leagues
- POST /api/users/me/delete       — schedule account deletion
- DELETE /api/users/me            — delete account immediately
- POST /api/users/me/cancel-deletion — cancel account deletion

Already tested in test_api_routes_comprehensive.py:
- GET /api/users/me/player
- PUT /api/users/me/player
"""

import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.api.auth_dependencies import require_verified_player
from backend.services import (
    auth_service,
    user_service,
    data_service,
    avatar_service,
    interaction_policy,
    moderation_worker,
    s3_service,
    court_service,
)


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
    "profile_is_private": False,
    "show_game_history": False,
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

    async def fake_enforce_ugc_creation(session, player_id):
        return None

    monkeypatch.setattr(
        interaction_policy,
        "enforce_ugc_creation",
        fake_enforce_ugc_creation,
        raising=True,
    )

    return TestClient(app), {"Authorization": "Bearer dummy"}


# ============================================================================
# PUT /api/users/me
# ============================================================================


class TestUpdateCurrentUser:
    """Tests for PUT /api/users/me."""

    def test_update_email_success(self, monkeypatch):
        """Returns updated user when email update succeeds."""
        client, headers = _make_authed_client(monkeypatch)

        async def fake_update_user(
            session, user_id, email=None, profile_is_private=None, show_game_history=None
        ):
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

    def test_put_me_returns_auth_fields_for_google_user(self, monkeypatch):
        """
        Fix B: PUT /api/users/me must include auth_provider, has_password,
        google_connected, and apple_connected in the response.

        Before Fix B the route hand-built UserResponse, omitting these fields.
        The fix replaces the manual construction with _build_user_response().
        """

        def fake_verify_token(token: str):
            return {"user_id": USER_ID, "phone_number": None}

        async def fake_get_user_by_id_google(session, uid: int):
            return {
                "id": uid,
                "phone_number": None,
                "email": "google_user@example.com",
                "is_verified": True,
                "created_at": "2020-01-01T00:00:00Z",
                "profile_is_private": False,
                "show_game_history": False,
                # Google-linked user specifics
                "auth_provider": "google",
                "google_id": "gid-abc-123",
                "apple_id": None,
                "password_hash": None,
                "deletion_scheduled_at": None,
            }

        async def fake_update_user(
            session, user_id, email=None, profile_is_private=None, show_game_history=None
        ):
            return True

        monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
        monkeypatch.setattr(
            user_service, "get_user_by_id", fake_get_user_by_id_google, raising=True
        )
        monkeypatch.setattr(user_service, "update_user", fake_update_user, raising=True)

        client = TestClient(app)
        response = client.put(
            "/api/users/me",
            json={"email": "google_user@example.com"},
            headers={"Authorization": "Bearer dummy"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["auth_provider"] == "google", (
            "auth_provider must be 'google' for a Google-linked user"
        )
        assert data["has_password"] is False, (
            "has_password must be False when password_hash is None"
        )
        assert data["google_connected"] is True, (
            "google_connected must be True when google_id is set"
        )
        assert data["apple_connected"] is False, (
            "apple_connected must be False when apple_id is None"
        )

    def test_put_me_returns_auth_fields_for_phone_user(self, monkeypatch):
        """
        Fix B: PUT /api/users/me returns correct auth fields for a phone/password user.

        Phone users have auth_provider='phone', has_password=True, and no social connections.
        """

        def fake_verify_token(token: str):
            return {"user_id": USER_ID, "phone_number": PHONE}

        async def fake_get_user_by_id_phone(session, uid: int):
            return {
                "id": uid,
                "phone_number": PHONE,
                "email": None,
                "is_verified": True,
                "created_at": "2020-01-01T00:00:00Z",
                "profile_is_private": False,
                "show_game_history": False,
                "auth_provider": "phone",
                "google_id": None,
                "apple_id": None,
                "password_hash": "$2b$12$hashedpassword",
                "deletion_scheduled_at": None,
            }

        async def fake_update_user(
            session, user_id, email=None, profile_is_private=None, show_game_history=None
        ):
            return True

        monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
        monkeypatch.setattr(
            user_service, "get_user_by_id", fake_get_user_by_id_phone, raising=True
        )
        monkeypatch.setattr(user_service, "update_user", fake_update_user, raising=True)

        client = TestClient(app)
        response = client.put(
            "/api/users/me",
            json={"email": "phone_user@example.com"},
            headers={"Authorization": "Bearer dummy"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["auth_provider"] == "phone"
        assert data["has_password"] is True
        assert data["google_connected"] is False
        assert data["apple_connected"] is False

    def test_update_user_no_fields_returns_400(self, monkeypatch):
        """Returns 400 when update_user reports nothing to update."""
        client, headers = _make_authed_client(monkeypatch)

        async def fake_update_user(
            session, user_id, email=None, profile_is_private=None, show_game_history=None
        ):
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

        async def fake_screen_image_url(url, safety_identifier):
            return None

        monkeypatch.setattr(
            moderation_worker,
            "screen_image_url",
            fake_screen_image_url,
            raising=True,
        )

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
        assert response.json() == {"profile_picture_url": "https://cdn.example.com/avatar.jpg"}
        assert mock_player_obj.profile_picture_url == "https://cdn.example.com/avatar.jpg"
        assert mock_player_obj.avatar == "https://cdn.example.com/avatar.jpg"

    def test_rejected_replacement_preserves_old_avatar(self, monkeypatch):
        """A failed upload deletes only the rejected object and retains persisted old data."""
        client, headers = _make_authed_client(monkeypatch)
        old_url = "https://cdn.example.com/old.jpg"
        new_url = "https://cdn.example.com/new.jpg"
        fake_player = {
            "id": 42,
            "full_name": "Test User",
            "profile_picture_url": old_url,
        }

        async def fake_get_player(session, user_id):
            return fake_player

        async def reject_image(url, safety_identifier):
            raise moderation_worker.ContentRejected("rejected")

        deleted_urls: list[str] = []
        monkeypatch.setattr(
            data_service, "get_player_by_user_id_with_stats", fake_get_player, raising=True
        )
        monkeypatch.setattr(
            avatar_service, "validate_avatar", lambda b, ct: (True, ""), raising=True
        )
        monkeypatch.setattr(avatar_service, "process_avatar", lambda b: b, raising=True)
        monkeypatch.setattr(s3_service, "upload_avatar", lambda pid, b: new_url, raising=True)
        monkeypatch.setattr(
            s3_service, "delete_avatar", lambda url: deleted_urls.append(url) or True, raising=True
        )
        monkeypatch.setattr(moderation_worker, "screen_image_url", reject_image, raising=True)

        response = client.post(
            "/api/users/me/avatar",
            files={"file": ("test.jpg", b"fake_image_bytes", "image/jpeg")},
            headers=headers,
        )

        assert response.status_code == 422
        assert fake_player["profile_picture_url"] == old_url
        assert deleted_urls == [new_url]

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
            {"id": 10, "name": "Beach League LA", "role": "admin"},
            {"id": 11, "name": "Beach League SD", "role": "member"},
        ]

        async def fake_get_user_leagues(session, user_id):
            return fake_leagues

        monkeypatch.setattr(data_service, "get_user_leagues", fake_get_user_leagues, raising=True)

        response = client.get("/api/users/me/leagues", headers=headers)

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["name"] == "Beach League LA"

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
# DELETE /api/users/me
# ============================================================================


class TestImmediateAccountDeletion:
    """Tests for DELETE /api/users/me."""

    def test_immediate_deletion_success(self, monkeypatch):
        client, headers = _make_authed_client(monkeypatch)

        async def fake_execute_deletion(session, user_id):
            assert user_id == USER_ID
            return True

        monkeypatch.setattr(
            user_service, "execute_account_deletion", fake_execute_deletion, raising=True
        )

        response = client.delete("/api/users/me", headers=headers)

        assert response.status_code == 200
        assert response.json() == {
            "status": "success",
            "message": "Account permanently deleted.",
        }

    def test_immediate_deletion_user_not_found_returns_404(self, monkeypatch):
        client, headers = _make_authed_client(monkeypatch)

        async def fake_execute_deletion(session, user_id):
            return False

        monkeypatch.setattr(
            user_service, "execute_account_deletion", fake_execute_deletion, raising=True
        )

        response = client.delete("/api/users/me", headers=headers)

        assert response.status_code == 404
        assert response.json()["detail"] == "User not found"

    def test_immediate_deletion_requires_auth(self):
        response = TestClient(app).delete("/api/users/me")
        assert response.status_code == 401

    def test_permanently_deleted_user_cannot_reuse_access_token(self, monkeypatch):
        def fake_verify_token(token: str):
            return {"user_id": USER_ID, "phone_number": PHONE}

        async def fake_get_deleted_user(session, user_id: int):
            return {**FAKE_USER, "deleted_at": "2026-08-04T12:00:00+00:00"}

        monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
        monkeypatch.setattr(user_service, "get_user_by_id", fake_get_deleted_user, raising=True)

        response = TestClient(app).get(
            "/api/users/me/player", headers={"Authorization": "Bearer old-access-token"}
        )

        assert response.status_code == 401
        assert response.json()["detail"] == "Account has been deleted"


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


# ============================================================================
# My Courts — /api/users/me/courts  (saved courts / favorites)
# ============================================================================

MC_PLAYER_ID = 7


@pytest.fixture
def _authed_player():
    """Override require_verified_player with a verified player for My Courts tests."""

    async def _fake():
        return {**FAKE_USER, "player_id": MC_PLAYER_ID}

    app.dependency_overrides[require_verified_player] = _fake
    yield
    app.dependency_overrides.pop(require_verified_player, None)


class TestListMyCourts:
    """Tests for GET /api/users/me/courts."""

    def test_returns_saved_court_cards(self, monkeypatch, _authed_player):
        """Happy path: returns the player's saved court cards."""
        # Include all CourtListItem required fields (id, name, slug, location_id).
        cards = [
            {
                "id": 3,
                "name": "Saved Court",
                "slug": "saved-court",
                "location_id": "test_loc",
                "is_saved": True,
            }
        ]

        async def fake_cards(session, player_id):
            assert player_id == MC_PLAYER_ID
            return cards

        monkeypatch.setattr(court_service, "get_saved_court_cards", fake_cards, raising=True)

        client = TestClient(app)
        response = client.get("/api/users/me/courts")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        # The response model fills in optional fields with defaults; verify
        # the core fields that our fake service returned are preserved.
        assert data[0]["id"] == cards[0]["id"]
        assert data[0]["name"] == cards[0]["name"]
        assert data[0]["slug"] == cards[0]["slug"]
        assert data[0]["location_id"] == cards[0]["location_id"]
        assert data[0]["is_saved"] is True

    def test_requires_auth(self):
        """Returns 401/403 when unauthenticated (no override active)."""
        app.dependency_overrides.pop(require_verified_player, None)
        client = TestClient(app)
        response = client.get("/api/users/me/courts")
        assert response.status_code in (401, 403)


class TestSaveMyCourt:
    """Tests for POST /api/users/me/courts."""

    def test_save_success(self, monkeypatch, _authed_player):
        """Happy path: saves a court for the authenticated player."""

        async def fake_save(session, player_id, court_id):
            assert player_id == MC_PLAYER_ID
            return {"court_id": court_id, "saved": True}

        monkeypatch.setattr(court_service, "save_court", fake_save, raising=True)

        client = TestClient(app)
        response = client.post("/api/users/me/courts", json={"court_id": 5})
        assert response.status_code == 200
        assert response.json() == {"court_id": 5, "saved": True}

    def test_save_missing_court_returns_404(self, monkeypatch, _authed_player):
        """A nonexistent court id surfaces as 404."""

        async def fake_save(session, player_id, court_id):
            raise ValueError(f"Court {court_id} not found")

        monkeypatch.setattr(court_service, "save_court", fake_save, raising=True)

        client = TestClient(app)
        response = client.post("/api/users/me/courts", json={"court_id": 999})
        assert response.status_code == 404

    def test_save_missing_body_returns_422(self, _authed_player):
        """Missing court_id is a validation error."""
        client = TestClient(app)
        response = client.post("/api/users/me/courts", json={})
        assert response.status_code == 422


class TestUnsaveMyCourt:
    """Tests for DELETE /api/users/me/courts/{court_id}."""

    def test_unsave_success(self, monkeypatch, _authed_player):
        """Happy path: removes a saved court for the authenticated player."""

        async def fake_unsave(session, player_id, court_id):
            assert player_id == MC_PLAYER_ID
            return {"court_id": court_id, "saved": False}

        monkeypatch.setattr(court_service, "unsave_court", fake_unsave, raising=True)

        client = TestClient(app)
        response = client.delete("/api/users/me/courts/5")
        assert response.status_code == 200
        assert response.json() == {"court_id": 5, "saved": False}

    def test_unsave_requires_auth(self):
        """Returns 401/403 when unauthenticated."""
        app.dependency_overrides.pop(require_verified_player, None)
        client = TestClient(app)
        response = client.delete("/api/users/me/courts/5")
        assert response.status_code in (401, 403)
