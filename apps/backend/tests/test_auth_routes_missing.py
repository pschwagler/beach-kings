"""Route-layer tests for missing auth.py endpoints.

Covers: reset-password-verify, reset-password-confirm, sms-login, logout.
Other auth endpoints already tested in test_api_routes_comprehensive.py.
"""

from fastapi.testclient import TestClient
from backend.api.main import app
from backend.services import auth_service, user_service, rate_limiting_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_authed_client(monkeypatch, phone="+10000000000", user_id=1):
    """Return (client, headers) with basic auth mocked."""

    def fake_verify_token(token):
        return {"user_id": user_id, "phone_number": phone}

    async def fake_get_user_by_id(session, uid):
        return {
            "id": user_id,
            "phone_number": phone,
            "name": "Test User",
            "email": "test@example.com",
            "is_verified": True,
            "created_at": "2020-01-01T00:00:00Z",
        }

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)

    return TestClient(app), {"Authorization": "Bearer dummy"}


# ============================================================================
# POST /api/auth/reset-password-verify
# ============================================================================


class TestResetPasswordVerify:
    """Tests for reset-password-verify endpoint."""

    def test_verify_success(self, monkeypatch):
        """Valid code returns reset_token."""
        client = TestClient(app)

        def fake_normalize(phone):
            return "+15551234567"

        async def fake_rate_limit(request, phone):
            pass

        async def fake_get_user_by_phone(session, phone):
            return {
                "id": 1,
                "phone_number": "+15551234567",
                "is_verified": True,
                "failed_login_attempts": 0,
                "last_failed_login": None,
            }

        def fake_is_locked(user):
            return False

        async def fake_verify_code(session, phone, code):
            return {"phone_number": "+15551234567"}

        async def fake_reset_failed(session, user_id):
            pass

        def fake_generate_refresh():
            return "reset_token_abc"

        async def fake_create_reset_token(session, user_id, token, expires):
            return True

        monkeypatch.setattr(auth_service, "normalize_phone_number", fake_normalize, raising=True)
        monkeypatch.setattr(
            rate_limiting_service, "check_phone_rate_limit", fake_rate_limit, raising=True
        )
        monkeypatch.setattr(
            user_service, "get_user_by_phone", fake_get_user_by_phone, raising=True
        )
        monkeypatch.setattr(user_service, "is_account_locked", fake_is_locked, raising=True)
        monkeypatch.setattr(
            user_service, "verify_and_mark_code_used", fake_verify_code, raising=True
        )
        monkeypatch.setattr(user_service, "reset_failed_attempts", fake_reset_failed, raising=True)
        monkeypatch.setattr(
            auth_service, "generate_refresh_token", fake_generate_refresh, raising=True
        )
        monkeypatch.setattr(
            user_service, "create_password_reset_token", fake_create_reset_token, raising=True
        )

        response = client.post(
            "/api/auth/reset-password-verify",
            json={"phone_number": "+15551234567", "code": "123456"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["reset_token"] == "reset_token_abc"

    def test_verify_invalid_code(self, monkeypatch):
        """Invalid code returns 401."""
        client = TestClient(app)

        def fake_normalize(phone):
            return "+15551234567"

        async def fake_rate_limit(request, phone):
            pass

        async def fake_get_user_by_phone(session, phone):
            return {
                "id": 1,
                "phone_number": "+15551234567",
                "is_verified": True,
                "failed_login_attempts": 0,
                "last_failed_login": None,
            }

        def fake_is_locked(user):
            return False

        async def fake_verify_code(session, phone, code):
            return None

        async def fake_increment_failed(session, phone):
            pass

        monkeypatch.setattr(auth_service, "normalize_phone_number", fake_normalize, raising=True)
        monkeypatch.setattr(
            rate_limiting_service, "check_phone_rate_limit", fake_rate_limit, raising=True
        )
        monkeypatch.setattr(
            user_service, "get_user_by_phone", fake_get_user_by_phone, raising=True
        )
        monkeypatch.setattr(user_service, "is_account_locked", fake_is_locked, raising=True)
        monkeypatch.setattr(
            user_service, "verify_and_mark_code_used", fake_verify_code, raising=True
        )
        monkeypatch.setattr(
            user_service, "increment_failed_attempts", fake_increment_failed, raising=True
        )

        response = client.post(
            "/api/auth/reset-password-verify",
            json={"phone_number": "+15551234567", "code": "000000"},
        )
        assert response.status_code == 401

    def test_verify_account_locked(self, monkeypatch):
        """Locked account returns 423."""
        client = TestClient(app)

        def fake_normalize(phone):
            return "+15551234567"

        async def fake_rate_limit(request, phone):
            pass

        async def fake_get_user_by_phone(session, phone):
            return {
                "id": 1,
                "phone_number": "+15551234567",
                "is_verified": True,
                "failed_login_attempts": 10,
                "last_failed_login": "2024-01-01T00:00:00Z",
            }

        def fake_is_locked(user):
            return True

        monkeypatch.setattr(auth_service, "normalize_phone_number", fake_normalize, raising=True)
        monkeypatch.setattr(
            rate_limiting_service, "check_phone_rate_limit", fake_rate_limit, raising=True
        )
        monkeypatch.setattr(
            user_service, "get_user_by_phone", fake_get_user_by_phone, raising=True
        )
        monkeypatch.setattr(user_service, "is_account_locked", fake_is_locked, raising=True)

        response = client.post(
            "/api/auth/reset-password-verify",
            json={"phone_number": "+15551234567", "code": "123456"},
        )
        assert response.status_code == 423

    def test_verify_user_not_found(self, monkeypatch):
        """Non-existent user returns 401."""
        client = TestClient(app)

        def fake_normalize(phone):
            return "+15551234567"

        async def fake_rate_limit(request, phone):
            pass

        async def fake_get_user_by_phone(session, phone):
            return None

        monkeypatch.setattr(auth_service, "normalize_phone_number", fake_normalize, raising=True)
        monkeypatch.setattr(
            rate_limiting_service, "check_phone_rate_limit", fake_rate_limit, raising=True
        )
        monkeypatch.setattr(
            user_service, "get_user_by_phone", fake_get_user_by_phone, raising=True
        )

        response = client.post(
            "/api/auth/reset-password-verify",
            json={"phone_number": "+15551234567", "code": "123456"},
        )
        assert response.status_code == 401


# ============================================================================
# POST /api/auth/reset-password-confirm
# ============================================================================


class TestResetPasswordConfirm:
    """Tests for reset-password-confirm endpoint."""

    def test_confirm_success(self, monkeypatch):
        """Valid token + valid password resets and returns tokens."""
        client = TestClient(app)

        async def fake_verify_reset_token(session, token):
            return 1  # user_id

        async def fake_get_user_by_id(session, uid):
            return {
                "id": 1,
                "phone_number": "+15551234567",
                "is_verified": True,
                "created_at": "2020-01-01T00:00:00Z",
                "auth_provider": "phone",
            }

        def fake_hash_password(pw):
            return "hashed_new_pw"

        async def fake_update_password(session, user_id, pw_hash):
            return True

        def fake_create_access_token(data):
            return "new_access_token"

        def fake_generate_refresh():
            return "new_refresh_token"

        async def fake_create_refresh_token(session, user_id, token, expires):
            pass

        monkeypatch.setattr(
            user_service,
            "verify_and_use_password_reset_token",
            fake_verify_reset_token,
            raising=True,
        )
        monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
        monkeypatch.setattr(auth_service, "hash_password", fake_hash_password, raising=True)
        monkeypatch.setattr(
            user_service, "update_user_password", fake_update_password, raising=True
        )
        monkeypatch.setattr(
            auth_service, "create_access_token", fake_create_access_token, raising=True
        )
        monkeypatch.setattr(
            auth_service, "generate_refresh_token", fake_generate_refresh, raising=True
        )
        monkeypatch.setattr(
            user_service, "create_refresh_token", fake_create_refresh_token, raising=True
        )

        response = client.post(
            "/api/auth/reset-password-confirm",
            json={"reset_token": "valid_token", "new_password": "newpass123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["access_token"] == "new_access_token"
        assert data["refresh_token"] == "new_refresh_token"
        assert data["user_id"] == 1

    def test_confirm_short_password(self, monkeypatch):
        """Password < 8 chars returns 400."""
        client = TestClient(app)
        response = client.post(
            "/api/auth/reset-password-confirm",
            json={"reset_token": "token", "new_password": "short1"},
        )
        assert response.status_code == 400
        assert "8 characters" in response.json()["detail"]

    def test_confirm_password_no_number(self, monkeypatch):
        """Password without number returns 400."""
        client = TestClient(app)
        response = client.post(
            "/api/auth/reset-password-confirm",
            json={"reset_token": "token", "new_password": "longpasswordnone"},
        )
        assert response.status_code == 400
        assert "number" in response.json()["detail"]

    def test_confirm_invalid_token(self, monkeypatch):
        """Invalid reset token returns 401."""
        client = TestClient(app)

        async def fake_verify_reset_token(session, token):
            return None

        monkeypatch.setattr(
            user_service,
            "verify_and_use_password_reset_token",
            fake_verify_reset_token,
            raising=True,
        )

        response = client.post(
            "/api/auth/reset-password-confirm",
            json={"reset_token": "bad_token", "new_password": "newpass123"},
        )
        assert response.status_code == 401


# ============================================================================
# POST /api/auth/sms-login
# ============================================================================


class TestSMSLogin:
    """Tests for sms-login endpoint."""

    def test_sms_login_success(self, monkeypatch):
        """Valid code logs in and returns tokens."""
        client = TestClient(app)

        def fake_normalize(phone):
            return "+15551234567"

        async def fake_get_user_by_phone(session, phone):
            return {
                "id": 1,
                "phone_number": "+15551234567",
                "is_verified": True,
                "failed_login_attempts": 0,
                "last_failed_login": None,
                "auth_provider": "phone",
                "deletion_scheduled_at": None,
            }

        def fake_is_locked(user):
            return False

        async def fake_verify_code(session, phone, code):
            return {"phone_number": "+15551234567"}

        async def fake_reset_failed(session, user_id):
            pass

        async def fake_cancel_deletion(session, user_id):
            pass

        def fake_create_access_token(data):
            return "sms_access_token"

        def fake_generate_refresh():
            return "sms_refresh_token"

        async def fake_create_refresh_token(session, user_id, token, expires):
            pass

        monkeypatch.setattr(auth_service, "normalize_phone_number", fake_normalize, raising=True)
        monkeypatch.setattr(
            user_service, "get_user_by_phone", fake_get_user_by_phone, raising=True
        )
        monkeypatch.setattr(user_service, "is_account_locked", fake_is_locked, raising=True)
        monkeypatch.setattr(
            user_service, "verify_and_mark_code_used", fake_verify_code, raising=True
        )
        monkeypatch.setattr(user_service, "reset_failed_attempts", fake_reset_failed, raising=True)
        monkeypatch.setattr(
            user_service, "cancel_account_deletion", fake_cancel_deletion, raising=True
        )
        monkeypatch.setattr(
            auth_service, "create_access_token", fake_create_access_token, raising=True
        )
        monkeypatch.setattr(
            auth_service, "generate_refresh_token", fake_generate_refresh, raising=True
        )
        monkeypatch.setattr(
            user_service, "create_refresh_token", fake_create_refresh_token, raising=True
        )

        response = client.post(
            "/api/auth/sms-login",
            json={"phone_number": "+15551234567", "code": "123456"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["access_token"] == "sms_access_token"
        assert data["user_id"] == 1

    def test_sms_login_user_not_found(self, monkeypatch):
        """Non-existent user returns 401."""
        client = TestClient(app)

        def fake_normalize(phone):
            return "+15551234567"

        async def fake_get_user_by_phone(session, phone):
            return None

        monkeypatch.setattr(auth_service, "normalize_phone_number", fake_normalize, raising=True)
        monkeypatch.setattr(
            user_service, "get_user_by_phone", fake_get_user_by_phone, raising=True
        )

        response = client.post(
            "/api/auth/sms-login",
            json={"phone_number": "+15551234567", "code": "123456"},
        )
        assert response.status_code == 401

    def test_sms_login_locked(self, monkeypatch):
        """Locked account returns 423."""
        client = TestClient(app)

        def fake_normalize(phone):
            return "+15551234567"

        async def fake_get_user_by_phone(session, phone):
            return {
                "id": 1,
                "phone_number": "+15551234567",
                "is_verified": True,
                "failed_login_attempts": 10,
            }

        def fake_is_locked(user):
            return True

        monkeypatch.setattr(auth_service, "normalize_phone_number", fake_normalize, raising=True)
        monkeypatch.setattr(
            user_service, "get_user_by_phone", fake_get_user_by_phone, raising=True
        )
        monkeypatch.setattr(user_service, "is_account_locked", fake_is_locked, raising=True)

        response = client.post(
            "/api/auth/sms-login",
            json={"phone_number": "+15551234567", "code": "123456"},
        )
        assert response.status_code == 423

    def test_sms_login_invalid_code(self, monkeypatch):
        """Invalid code returns 401 and increments failures."""
        client = TestClient(app)
        incremented = {"called": False}

        def fake_normalize(phone):
            return "+15551234567"

        async def fake_get_user_by_phone(session, phone):
            return {
                "id": 1,
                "phone_number": "+15551234567",
                "is_verified": True,
                "failed_login_attempts": 0,
                "last_failed_login": None,
            }

        def fake_is_locked(user):
            return False

        async def fake_verify_code(session, phone, code):
            return None

        async def fake_increment_failed(session, phone):
            incremented["called"] = True

        monkeypatch.setattr(auth_service, "normalize_phone_number", fake_normalize, raising=True)
        monkeypatch.setattr(
            user_service, "get_user_by_phone", fake_get_user_by_phone, raising=True
        )
        monkeypatch.setattr(user_service, "is_account_locked", fake_is_locked, raising=True)
        monkeypatch.setattr(
            user_service, "verify_and_mark_code_used", fake_verify_code, raising=True
        )
        monkeypatch.setattr(
            user_service, "increment_failed_attempts", fake_increment_failed, raising=True
        )

        response = client.post(
            "/api/auth/sms-login",
            json={"phone_number": "+15551234567", "code": "000000"},
        )
        assert response.status_code == 401
        assert incremented["called"]


# ============================================================================
# POST /api/auth/logout
# ============================================================================


class TestLogout:
    """Tests for logout endpoint."""

    def test_logout_success(self, monkeypatch):
        """Authenticated user can logout."""
        deleted = {"called": False}

        async def fake_delete_tokens(session, user_id):
            deleted["called"] = True

        monkeypatch.setattr(
            user_service, "delete_user_refresh_tokens", fake_delete_tokens, raising=True
        )

        client, headers = _make_authed_client(monkeypatch)
        response = client.post("/api/auth/logout", headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "success"
        assert deleted["called"]

    def test_logout_requires_auth(self):
        """Unauthenticated request returns 401/403."""
        client = TestClient(app)
        response = client.post("/api/auth/logout")
        assert response.status_code in (401, 403)
