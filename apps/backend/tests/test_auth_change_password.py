"""Route-layer tests for POST /api/auth/change-password.

Covers:
- Happy path: correct current password → 200 with password_changed_at
- Wrong current password → 401 "Current password is incorrect"
- Unauthenticated request → 401/403
- New password too short (< 8 chars) → 400
- OAuth-only user (no password_hash) → 400 social sign-in error
- Refresh tokens revoked on success (side-effect)
"""

from fastapi.testclient import TestClient
from backend.api.main import app
from backend.services import auth_service, user_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_authed_client(monkeypatch, user_id=1, phone="+10000000000", password_hash="hashed_pw"):
    """Return (client, headers) with auth mocked for a password-bearing user."""

    def fake_verify_token(token):
        return {"user_id": user_id, "phone_number": phone}

    async def fake_get_user_by_id(session, uid):
        return {
            "id": user_id,
            "phone_number": phone,
            "email": "test@example.com",
            "is_verified": True,
            "created_at": "2020-01-01T00:00:00Z",
            "auth_provider": "phone",
            "password_hash": password_hash,
        }

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)

    return TestClient(app), {"Authorization": "Bearer dummy"}


def _make_authed_client_oauth(monkeypatch, user_id=99, phone=None):
    """Return (client, headers) for a Google OAuth user with no password_hash."""

    def fake_verify_token(token):
        return {"user_id": user_id, "phone_number": ""}

    async def fake_get_user_by_id(session, uid):
        return {
            "id": user_id,
            "phone_number": phone,
            "email": "oauth@example.com",
            "is_verified": True,
            "created_at": "2020-01-01T00:00:00Z",
            "auth_provider": "google",
            "password_hash": None,
        }

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)

    return TestClient(app), {"Authorization": "Bearer dummy"}


# ============================================================================
# POST /api/auth/change-password
# ============================================================================


class TestChangePassword:
    """Tests for POST /api/auth/change-password."""

    def test_success(self, monkeypatch):
        """Correct current password → 200 with status=success and password_changed_at."""

        def fake_verify_password(pw, pw_hash):
            return True

        def fake_hash_password(pw):
            return "new_hashed_pw"

        async def fake_update_password(session, user_id, pw_hash):
            return True

        async def fake_delete_refresh_tokens(session, user_id):
            return 1

        async def fake_get_user_after_update(session, uid):
            return {
                "id": 1,
                "phone_number": "+10000000000",
                "email": "test@example.com",
                "is_verified": True,
                "created_at": "2020-01-01T00:00:00Z",
                "auth_provider": "phone",
                "password_hash": "new_hashed_pw",
                "password_changed_at": "2026-04-25T12:00:00+00:00",
            }

        client, headers = _make_authed_client(monkeypatch)

        monkeypatch.setattr(auth_service, "verify_password", fake_verify_password, raising=True)
        monkeypatch.setattr(auth_service, "hash_password", fake_hash_password, raising=True)
        monkeypatch.setattr(
            user_service, "update_user_password", fake_update_password, raising=True
        )
        monkeypatch.setattr(
            user_service, "delete_user_refresh_tokens", fake_delete_refresh_tokens, raising=True
        )

        # Override get_user_by_id called a second time (post-update) to return updated user.
        # We need to replace it after the first call; simplest is a counter-based mock.
        call_count = {"n": 0}

        def fake_verify_token(token):
            return {"user_id": 1, "phone_number": "+10000000000"}

        async def fake_get_user_by_id_seq(session, uid):
            call_count["n"] += 1
            if call_count["n"] == 1:
                # First call: auth dependency resolves current user
                return {
                    "id": 1,
                    "phone_number": "+10000000000",
                    "email": "test@example.com",
                    "is_verified": True,
                    "created_at": "2020-01-01T00:00:00Z",
                    "auth_provider": "phone",
                    "password_hash": "hashed_pw",
                }
            # Second call: re-fetch after update to get password_changed_at
            return {
                "id": 1,
                "phone_number": "+10000000000",
                "email": "test@example.com",
                "is_verified": True,
                "created_at": "2020-01-01T00:00:00Z",
                "auth_provider": "phone",
                "password_hash": "new_hashed_pw",
                "password_changed_at": "2026-04-25T12:00:00+00:00",
            }

        monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
        monkeypatch.setattr(
            user_service, "get_user_by_id", fake_get_user_by_id_seq, raising=True
        )

        response = client.post(
            "/api/auth/change-password",
            headers=headers,
            json={"current_password": "oldpassword", "new_password": "newpassword"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "password_changed_at" in data
        assert data["password_changed_at"] == "2026-04-25T12:00:00+00:00"

    def test_wrong_current_password(self, monkeypatch):
        """Wrong current password → 401 with detail message."""

        def fake_verify_password(pw, pw_hash):
            return False

        client, headers = _make_authed_client(monkeypatch)
        monkeypatch.setattr(auth_service, "verify_password", fake_verify_password, raising=True)

        response = client.post(
            "/api/auth/change-password",
            headers=headers,
            json={"current_password": "wrongpassword", "new_password": "newpassword"},
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "Current password is incorrect"

    def test_unauthenticated(self):
        """Request without auth token → 401 or 403."""
        client = TestClient(app)
        response = client.post(
            "/api/auth/change-password",
            json={"current_password": "oldpass", "new_password": "newpassword"},
        )
        assert response.status_code in (401, 403)

    def test_new_password_too_short(self, monkeypatch):
        """New password shorter than 8 chars → 400."""

        def fake_verify_password(pw, pw_hash):
            return True

        client, headers = _make_authed_client(monkeypatch)
        monkeypatch.setattr(auth_service, "verify_password", fake_verify_password, raising=True)

        response = client.post(
            "/api/auth/change-password",
            headers=headers,
            json={"current_password": "oldpassword", "new_password": "short"},
        )
        assert response.status_code == 400
        assert "8 characters" in response.json()["detail"]

    def test_oauth_user_has_no_password(self, monkeypatch):
        """OAuth-only user (no password_hash) → 400 with social sign-in message."""
        client, headers = _make_authed_client_oauth(monkeypatch)

        response = client.post(
            "/api/auth/change-password",
            headers=headers,
            json={"current_password": "anything", "new_password": "newpassword"},
        )
        assert response.status_code == 400
        detail = response.json()["detail"]
        assert "social sign-in" in detail

    def test_refresh_tokens_revoked_on_success(self, monkeypatch):
        """Refresh tokens are deleted for the user on a successful password change."""
        revoked = {"user_id": None}

        def fake_verify_password(pw, pw_hash):
            return True

        def fake_hash_password(pw):
            return "new_hashed"

        async def fake_update_password(session, user_id, pw_hash):
            return True

        async def fake_delete_refresh_tokens(session, user_id):
            revoked["user_id"] = user_id
            return 2

        call_count = {"n": 0}

        def fake_verify_token(token):
            return {"user_id": 7, "phone_number": "+17771234567"}

        async def fake_get_user_by_id(session, uid):
            call_count["n"] += 1
            base = {
                "id": 7,
                "phone_number": "+17771234567",
                "email": "x@x.com",
                "is_verified": True,
                "created_at": "2020-01-01T00:00:00Z",
                "auth_provider": "phone",
                "password_hash": "hashed",
            }
            if call_count["n"] >= 2:
                base["password_changed_at"] = "2026-04-25T12:00:00+00:00"
            return base

        monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
        monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
        monkeypatch.setattr(auth_service, "verify_password", fake_verify_password, raising=True)
        monkeypatch.setattr(auth_service, "hash_password", fake_hash_password, raising=True)
        monkeypatch.setattr(
            user_service, "update_user_password", fake_update_password, raising=True
        )
        monkeypatch.setattr(
            user_service, "delete_user_refresh_tokens", fake_delete_refresh_tokens, raising=True
        )

        client = TestClient(app)
        response = client.post(
            "/api/auth/change-password",
            headers={"Authorization": "Bearer dummy"},
            json={"current_password": "oldpassword", "new_password": "newpassword"},
        )
        assert response.status_code == 200
        assert revoked["user_id"] == 7
