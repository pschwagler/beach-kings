"""Route-layer tests for email-based auth endpoints.

Covers:
- /api/auth/signup branching on phone vs email
- /api/auth/verify-email
- /api/auth/reset-password-email
- /api/auth/reset-password-email-verify

Follows the monkeypatch pattern established in test_auth_routes_missing.py.
"""

from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services import (
    auth_service,
    user_service,
    email_service,
    rate_limiting_service,
)


EMAIL = "user@example.com"
PHONE = "+15551234567"


# ============================================================================
# POST /api/auth/signup — email branch
# ============================================================================


class TestSignupEmailBranch:
    def test_signup_email_only_sends_email_code(self, monkeypatch):
        client = TestClient(app)
        sent = {}

        async def fake_check_email(session, email):
            return False

        async def fake_create_vc(**kwargs):
            sent["code"] = kwargs.get("code")
            sent["email"] = kwargs.get("email")
            sent["phone_number"] = kwargs.get("phone_number")
            return True

        async def fake_send_email(email, code, session=None):
            sent["sent_to"] = email
            return True

        monkeypatch.setattr(auth_service, "normalize_email", lambda e: e.lower(), raising=True)
        monkeypatch.setattr(auth_service, "hash_password", lambda p: "hash", raising=True)
        monkeypatch.setattr(auth_service, "generate_verification_code", lambda: "123456", raising=True)
        monkeypatch.setattr(user_service, "check_email_exists", fake_check_email, raising=True)
        monkeypatch.setattr(user_service, "create_verification_code", fake_create_vc, raising=True)
        monkeypatch.setattr(
            email_service, "send_verification_code_email", fake_send_email, raising=True
        )

        response = client.post(
            "/api/auth/signup",
            json={
                "email": EMAIL,
                "password": "password1",
                "first_name": "Alice",
                "last_name": "Smith",
            },
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["status"] == "success"
        assert data["email"] == EMAIL
        assert sent["phone_number"] is None
        assert sent["sent_to"] == EMAIL

    def test_signup_email_already_registered_returns_400(self, monkeypatch):
        client = TestClient(app)

        async def fake_check_email(session, email):
            return True

        monkeypatch.setattr(auth_service, "normalize_email", lambda e: e.lower(), raising=True)
        monkeypatch.setattr(user_service, "check_email_exists", fake_check_email, raising=True)

        response = client.post(
            "/api/auth/signup",
            json={
                "email": EMAIL,
                "password": "password1",
                "first_name": "A",
                "last_name": "B",
            },
        )
        assert response.status_code == 400

    def test_signup_no_phone_no_email_returns_422(self):
        client = TestClient(app)
        response = client.post(
            "/api/auth/signup",
            json={
                "password": "password1",
                "first_name": "A",
                "last_name": "B",
            },
        )
        # Pydantic model_validator raises 422 for missing identifier
        assert response.status_code == 422


# ============================================================================
# POST /api/auth/verify-email
# ============================================================================


class TestVerifyEmail:
    def test_verify_email_success_creates_user(self, monkeypatch):
        client = TestClient(app)

        async def fake_verify_code(session, email, code):
            return {
                "email": email,
                "password_hash": "hash",
                "name": "Alice Smith",
            }

        async def fake_create_user(**kwargs):
            return 42

        async def fake_get_user(session, user_id):
            return {
                "id": 42,
                "email": EMAIL,
                "phone_number": None,
                "is_verified": True,
                "auth_provider": "email",
                "created_at": "2020-01-01T00:00:00Z",
            }

        async def fake_upsert_player(session, user_id, full_name):
            return {"id": 1}

        async def fake_issue_refresh(session, user_id, token, expires):
            return True

        async def fake_check_profile(session, uid):
            return False

        async def fake_reset_failed(session, uid):
            pass

        async def fake_cancel_deletion(session, user):
            pass

        monkeypatch.setattr(auth_service, "normalize_email", lambda e: e.lower(), raising=True)
        monkeypatch.setattr(
            user_service, "verify_and_mark_email_code_used", fake_verify_code, raising=True
        )
        monkeypatch.setattr(user_service, "create_user", fake_create_user, raising=True)
        monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user, raising=True)
        monkeypatch.setattr(user_service, "reset_failed_attempts", fake_reset_failed, raising=True)
        monkeypatch.setattr(user_service, "cancel_account_deletion", fake_cancel_deletion, raising=True)
        monkeypatch.setattr(auth_service, "create_access_token", lambda data: "access", raising=True)
        monkeypatch.setattr(auth_service, "generate_refresh_token", lambda: "refresh", raising=True)
        monkeypatch.setattr(
            user_service, "create_refresh_token", fake_issue_refresh, raising=True
        )
        from backend.services import data_service
        monkeypatch.setattr(data_service, "upsert_user_player", fake_upsert_player, raising=True)
        monkeypatch.setattr(data_service, "get_player_by_user_id", fake_check_profile, raising=True)

        response = client.post(
            "/api/auth/verify-email",
            json={"email": EMAIL, "code": "123456"},
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["access_token"] == "access"
        assert data["refresh_token"] == "refresh"
        assert data["user_id"] == 42

    def test_verify_email_invalid_code(self, monkeypatch):
        client = TestClient(app)

        async def fake_verify_code(session, email, code):
            return None

        async def fake_get_user_by_email(session, email):
            return None

        monkeypatch.setattr(auth_service, "normalize_email", lambda e: e.lower(), raising=True)
        monkeypatch.setattr(
            user_service, "verify_and_mark_email_code_used", fake_verify_code, raising=True
        )
        monkeypatch.setattr(
            user_service, "get_user_by_email", fake_get_user_by_email, raising=True
        )

        response = client.post(
            "/api/auth/verify-email",
            json={"email": EMAIL, "code": "000000"},
        )
        assert response.status_code == 401


# ============================================================================
# POST /api/auth/reset-password-email
# ============================================================================


class TestResetPasswordEmail:
    def test_reset_email_success_sends_code(self, monkeypatch):
        client = TestClient(app)
        sent = {}

        async def fake_rate_limit(request, key):
            pass

        async def fake_get_user_by_email(session, email):
            return {"id": 1, "email": email}

        async def fake_create_vc(**kwargs):
            sent["code"] = kwargs.get("code")
            sent["email"] = kwargs.get("email")
            return True

        async def fake_send_email(email, code, session=None):
            sent["sent_to"] = email
            return True

        monkeypatch.setattr(auth_service, "normalize_email", lambda e: e.lower(), raising=True)
        monkeypatch.setattr(
            rate_limiting_service, "check_phone_rate_limit", fake_rate_limit, raising=True
        )
        monkeypatch.setattr(
            user_service, "get_user_by_email", fake_get_user_by_email, raising=True
        )
        monkeypatch.setattr(auth_service, "generate_verification_code", lambda: "654321", raising=True)
        monkeypatch.setattr(user_service, "create_verification_code", fake_create_vc, raising=True)
        monkeypatch.setattr(
            email_service, "send_password_reset_code_email", fake_send_email, raising=True
        )

        response = client.post(
            "/api/auth/reset-password-email",
            json={"email": EMAIL},
        )
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "success"
        assert sent["sent_to"] == EMAIL

    def test_reset_email_unknown_user_still_200(self, monkeypatch):
        client = TestClient(app)

        async def fake_rate_limit(request, key):
            pass

        async def fake_get_user_by_email(session, email):
            return None

        monkeypatch.setattr(auth_service, "normalize_email", lambda e: e.lower(), raising=True)
        monkeypatch.setattr(
            rate_limiting_service, "check_phone_rate_limit", fake_rate_limit, raising=True
        )
        monkeypatch.setattr(
            user_service, "get_user_by_email", fake_get_user_by_email, raising=True
        )

        response = client.post(
            "/api/auth/reset-password-email",
            json={"email": EMAIL},
        )
        assert response.status_code == 200


# ============================================================================
# POST /api/auth/reset-password-email-verify
# ============================================================================


class TestResetPasswordEmailVerify:
    def test_verify_email_reset_returns_reset_token(self, monkeypatch):
        client = TestClient(app)

        async def fake_rate_limit(request, key):
            pass

        async def fake_get_user_by_email(session, email):
            return {
                "id": 1,
                "email": email,
                "phone_number": PHONE,
                "is_verified": True,
                "failed_login_attempts": 0,
            }

        def fake_is_locked(user):
            return False

        async def fake_verify_code(session, email, code):
            return {"email": email}

        async def fake_reset_failed(session, uid):
            pass

        async def fake_create_reset(session, uid, token, expires):
            return True

        monkeypatch.setattr(auth_service, "normalize_email", lambda e: e.lower(), raising=True)
        monkeypatch.setattr(
            rate_limiting_service, "check_phone_rate_limit", fake_rate_limit, raising=True
        )
        monkeypatch.setattr(
            user_service, "get_user_by_email", fake_get_user_by_email, raising=True
        )
        monkeypatch.setattr(user_service, "is_account_locked", fake_is_locked, raising=True)
        monkeypatch.setattr(
            user_service, "verify_and_mark_email_code_used", fake_verify_code, raising=True
        )
        monkeypatch.setattr(
            user_service, "reset_failed_attempts", fake_reset_failed, raising=True
        )
        monkeypatch.setattr(
            auth_service, "generate_refresh_token", lambda: "reset_tok", raising=True
        )
        monkeypatch.setattr(
            user_service, "create_password_reset_token", fake_create_reset, raising=True
        )

        response = client.post(
            "/api/auth/reset-password-email-verify",
            json={"email": EMAIL, "code": "123456"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["reset_token"] == "reset_tok"

    def test_verify_email_reset_invalid_code(self, monkeypatch):
        client = TestClient(app)

        async def fake_rate_limit(request, key):
            pass

        async def fake_get_user_by_email(session, email):
            return {
                "id": 1,
                "email": email,
                "is_verified": True,
            }

        def fake_is_locked(user):
            return False

        async def fake_verify_code(session, email, code):
            return None

        async def fake_incr(session, uid):
            pass

        monkeypatch.setattr(auth_service, "normalize_email", lambda e: e.lower(), raising=True)
        monkeypatch.setattr(
            rate_limiting_service, "check_phone_rate_limit", fake_rate_limit, raising=True
        )
        monkeypatch.setattr(
            user_service, "get_user_by_email", fake_get_user_by_email, raising=True
        )
        monkeypatch.setattr(user_service, "is_account_locked", fake_is_locked, raising=True)
        monkeypatch.setattr(
            user_service, "verify_and_mark_email_code_used", fake_verify_code, raising=True
        )
        monkeypatch.setattr(
            user_service, "increment_failed_attempts_by_user_id", fake_incr, raising=False
        )

        response = client.post(
            "/api/auth/reset-password-email-verify",
            json={"email": EMAIL, "code": "000000"},
        )
        assert response.status_code == 401
