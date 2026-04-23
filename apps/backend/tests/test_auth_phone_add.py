"""Route-layer tests for the one-time add-phone OTP endpoints.

Covers:
- POST /api/auth/phone/add/request
- POST /api/auth/phone/add/verify

These endpoints let a signed-in user who has no phone on their account attach
one (e.g., email/Apple signup flows). Phone *changes* are intentionally out of
scope — those route to support via mailto on the client. Reuses the existing
verification_codes infra (create_verification_code / verify_and_mark_code_used).
"""

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.api.auth_dependencies import get_current_user
from backend.services import auth_service, user_service


PHONE = "+15551234567"
USER_ID = 42


def _user_without_phone(**overrides) -> dict:
    base = {
        "id": USER_ID,
        "phone_number": None,
        "email": "alice@example.com",
        "is_verified": True,
        "auth_provider": "email",
        "deletion_scheduled_at": None,
        "created_at": "2020-01-01T00:00:00Z",
    }
    base.update(overrides)
    return base


def _install_auth(user: dict | None):
    """Install / clear the get_current_user override."""
    if user is None:
        app.dependency_overrides.pop(get_current_user, None)
        return
    async def _fake():
        return user
    app.dependency_overrides[get_current_user] = _fake


@pytest.fixture(autouse=True)
def _cleanup_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


# ============================================================================
# POST /api/auth/phone/add/request
# ============================================================================


class TestAddPhoneRequest:
    def test_happy_path_sends_sms_and_returns_success(self, monkeypatch):
        _install_auth(_user_without_phone())
        calls: dict = {}

        async def fake_check_phone(session, phone):
            return False

        async def fake_create_vc(**kwargs):
            calls["vc"] = kwargs
            return True

        async def fake_send_sms(session, phone, code):
            calls["sms"] = (phone, code)
            return True

        monkeypatch.setattr(auth_service, "normalize_phone_number", lambda p: p, raising=True)
        monkeypatch.setattr(auth_service, "generate_verification_code", lambda: "123456", raising=True)
        monkeypatch.setattr(user_service, "check_phone_exists", fake_check_phone, raising=True)
        monkeypatch.setattr(user_service, "create_verification_code", fake_create_vc, raising=True)
        monkeypatch.setattr(auth_service, "send_sms_verification", fake_send_sms, raising=True)

        client = TestClient(app)
        resp = client.post("/api/auth/phone/add/request", json={"phone_number": PHONE})

        assert resp.status_code == 200, resp.text
        assert resp.json() == {"status": "success"}
        assert calls["vc"]["phone_number"] == PHONE
        assert calls["vc"]["code"] == "123456"
        assert calls["sms"] == (PHONE, "123456")

    def test_unauthenticated_returns_401(self):
        _install_auth(None)
        client = TestClient(app)
        resp = client.post("/api/auth/phone/add/request", json={"phone_number": PHONE})
        assert resp.status_code == 401

    def test_already_has_phone_returns_400(self):
        _install_auth(_user_without_phone(phone_number="+15550000000"))
        client = TestClient(app)
        resp = client.post("/api/auth/phone/add/request", json={"phone_number": PHONE})
        assert resp.status_code == 400
        assert "support" in resp.json()["detail"].lower()

    def test_phone_already_in_use_returns_409(self, monkeypatch):
        _install_auth(_user_without_phone())

        async def fake_check_phone(session, phone):
            return True

        monkeypatch.setattr(auth_service, "normalize_phone_number", lambda p: p, raising=True)
        monkeypatch.setattr(user_service, "check_phone_exists", fake_check_phone, raising=True)

        client = TestClient(app)
        resp = client.post("/api/auth/phone/add/request", json={"phone_number": PHONE})
        assert resp.status_code == 409

    def test_invalid_phone_format_returns_422(self, monkeypatch):
        _install_auth(_user_without_phone())

        def raise_value(p):
            raise ValueError("Invalid phone number")

        monkeypatch.setattr(auth_service, "normalize_phone_number", raise_value, raising=True)

        client = TestClient(app)
        resp = client.post("/api/auth/phone/add/request", json={"phone_number": "not-a-phone"})
        assert resp.status_code == 422

    def test_sms_send_failure_returns_502(self, monkeypatch):
        _install_auth(_user_without_phone())

        async def fake_check_phone(session, phone):
            return False

        async def fake_create_vc(**kwargs):
            return True

        async def fake_send_sms(session, phone, code):
            return False

        monkeypatch.setattr(auth_service, "normalize_phone_number", lambda p: p, raising=True)
        monkeypatch.setattr(auth_service, "generate_verification_code", lambda: "123456", raising=True)
        monkeypatch.setattr(user_service, "check_phone_exists", fake_check_phone, raising=True)
        monkeypatch.setattr(user_service, "create_verification_code", fake_create_vc, raising=True)
        monkeypatch.setattr(auth_service, "send_sms_verification", fake_send_sms, raising=True)

        client = TestClient(app)
        resp = client.post("/api/auth/phone/add/request", json={"phone_number": PHONE})
        assert resp.status_code == 502


# ============================================================================
# POST /api/auth/phone/add/verify
# ============================================================================


class TestAddPhoneVerify:
    def test_happy_path_attaches_phone_and_returns_user(self, monkeypatch):
        _install_auth(_user_without_phone())

        async def fake_verify(session, phone, code):
            return {"password_hash": None, "name": None, "email": None}

        async def fake_check_phone(session, phone):
            return False

        async def fake_add(session, user_id, phone):
            assert user_id == USER_ID
            assert phone == PHONE
            return True

        async def fake_get_user_by_id(session, user_id):
            return _user_without_phone(phone_number=PHONE)

        monkeypatch.setattr(auth_service, "normalize_phone_number", lambda p: p, raising=True)
        monkeypatch.setattr(user_service, "verify_and_mark_code_used", fake_verify, raising=True)
        monkeypatch.setattr(user_service, "check_phone_exists", fake_check_phone, raising=True)
        monkeypatch.setattr(user_service, "add_phone_number", fake_add, raising=True)
        monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)

        client = TestClient(app)
        resp = client.post(
            "/api/auth/phone/add/verify",
            json={"phone_number": PHONE, "code": "123456"},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["id"] == USER_ID
        assert data["phone_number"] == PHONE

    def test_invalid_code_returns_400(self, monkeypatch):
        _install_auth(_user_without_phone())

        async def fake_verify(session, phone, code):
            return None

        monkeypatch.setattr(auth_service, "normalize_phone_number", lambda p: p, raising=True)
        monkeypatch.setattr(user_service, "verify_and_mark_code_used", fake_verify, raising=True)

        client = TestClient(app)
        resp = client.post(
            "/api/auth/phone/add/verify",
            json={"phone_number": PHONE, "code": "000000"},
        )
        assert resp.status_code == 400
        assert "invalid" in resp.json()["detail"].lower()

    def test_already_has_phone_returns_400(self):
        _install_auth(_user_without_phone(phone_number="+15550000000"))
        client = TestClient(app)
        resp = client.post(
            "/api/auth/phone/add/verify",
            json={"phone_number": PHONE, "code": "123456"},
        )
        assert resp.status_code == 400

    def test_unauthenticated_returns_401(self):
        _install_auth(None)
        client = TestClient(app)
        resp = client.post(
            "/api/auth/phone/add/verify",
            json={"phone_number": PHONE, "code": "123456"},
        )
        assert resp.status_code == 401

    def test_race_duplicate_between_verify_and_attach_returns_409(self, monkeypatch):
        _install_auth(_user_without_phone())

        async def fake_verify(session, phone, code):
            return {"password_hash": None, "name": None, "email": None}

        async def fake_check_phone(session, phone):
            return True  # another user grabbed it between request and verify

        monkeypatch.setattr(auth_service, "normalize_phone_number", lambda p: p, raising=True)
        monkeypatch.setattr(user_service, "verify_and_mark_code_used", fake_verify, raising=True)
        monkeypatch.setattr(user_service, "check_phone_exists", fake_check_phone, raising=True)

        client = TestClient(app)
        resp = client.post(
            "/api/auth/phone/add/verify",
            json={"phone_number": PHONE, "code": "123456"},
        )
        assert resp.status_code == 409
