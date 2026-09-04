"""
Route-layer tests for connected-account provider-linking endpoints and
the GET /api/auth/me connected-flags.

Covers:
- GET /api/auth/me returns google_connected / apple_connected / privacy flags
- POST /api/auth/google/add — happy path, 409 clash, idempotent, 401 unauthed
- POST /api/auth/apple/add  — same matrix
- Both endpoints: bad token → 401 from verify helper
"""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Lock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from backend.api.main import app
from backend.api.auth_dependencies import get_current_user
from backend.services import auth_service, moderation_service, role_service, user_service
import backend.api.routes.auth as auth_module


# ---------------------------------------------------------------------------
# Shared fixtures / helpers
# ---------------------------------------------------------------------------

USER_ID = 99
GOOGLE_SUB = "google-sub-abc123"
APPLE_SUB = "apple-sub-xyz789"


def _base_user(**overrides) -> dict:
    """Return a minimal user dict as yielded by get_current_user."""
    base = {
        "id": USER_ID,
        "phone_number": "+15550001111",
        "email": "user@example.com",
        "is_verified": True,
        "auth_provider": "phone",
        "password_hash": "hashed",
        "google_id": None,
        "apple_id": None,
        "deletion_scheduled_at": None,
        "created_at": "2024-01-01T00:00:00Z",
        "profile_is_private": False,
        "show_game_history": True,
    }
    base.update(overrides)
    return base


def _install_auth(user: dict | None) -> None:
    """Override (or clear) the get_current_user dependency."""
    if user is None:
        app.dependency_overrides.pop(get_current_user, None)
        return

    async def _fake():
        return user

    app.dependency_overrides[get_current_user] = _fake


@pytest.fixture(autouse=True)
def _cleanup_overrides(monkeypatch):
    """Always clean up dependency overrides after each test."""

    async def active_status(session, user_id):
        return {"account_status": "active"}

    async def not_admin(session, user_id):
        return False

    monkeypatch.setattr(moderation_service, "account_status", active_status)
    monkeypatch.setattr(role_service, "is_system_admin", not_admin)
    yield
    app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------------------
# GET /api/auth/me — connected flags and privacy flags
# ---------------------------------------------------------------------------


class TestGetMeConnectedFlags:
    """Verify that /api/auth/me populates provider and privacy flags correctly."""

    def test_phone_user_both_flags_false(self):
        """A phone-only user has no provider IDs → both connected flags are False."""
        _install_auth(_base_user(google_id=None, apple_id=None))
        client = TestClient(app)
        resp = client.get("/api/auth/me")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["google_connected"] is False
        assert data["apple_connected"] is False

    def test_google_user_google_connected_true(self):
        """A user with google_id set → google_connected is True."""
        _install_auth(_base_user(google_id=GOOGLE_SUB, auth_provider="google"))
        client = TestClient(app)
        resp = client.get("/api/auth/me")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["google_connected"] is True
        assert data["apple_connected"] is False

    def test_apple_user_apple_connected_true(self):
        """A user with apple_id set → apple_connected is True."""
        _install_auth(_base_user(apple_id=APPLE_SUB, auth_provider="apple"))
        client = TestClient(app)
        resp = client.get("/api/auth/me")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["google_connected"] is False
        assert data["apple_connected"] is True

    def test_both_providers_linked(self):
        """A user with both IDs set → both flags are True."""
        _install_auth(_base_user(google_id=GOOGLE_SUB, apple_id=APPLE_SUB))
        client = TestClient(app)
        resp = client.get("/api/auth/me")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["google_connected"] is True
        assert data["apple_connected"] is True

    def test_privacy_flags_returned(self):
        """Privacy flags from user dict are forwarded in the response."""
        _install_auth(_base_user(profile_is_private=True, show_game_history=False))
        client = TestClient(app)
        resp = client.get("/api/auth/me")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["profile_is_private"] is True
        assert data["show_game_history"] is False

    def test_privacy_flags_defaults_when_false(self):
        """Privacy flags default to False when not set."""
        _install_auth(_base_user(profile_is_private=False, show_game_history=True))
        client = TestClient(app)
        resp = client.get("/api/auth/me")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["profile_is_private"] is False
        assert data["show_game_history"] is True

    def test_unauthenticated_returns_401(self):
        """Without auth, /api/auth/me must return 401."""
        _install_auth(None)
        client = TestClient(app)
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/auth/google/add
# ---------------------------------------------------------------------------


class TestGoogleAdd:
    """Tests for POST /api/auth/google/add."""

    def test_happy_path_links_google(self, monkeypatch):
        """Verified token with no clash → links google_id, returns updated UserResponse."""
        _install_auth(_base_user(google_id=None))

        monkeypatch.setattr(
            auth_service,
            "verify_google_id_token",
            lambda token: {"sub": GOOGLE_SUB, "email": "user@example.com"},
            raising=True,
        )

        async def fake_get_by_google_id(session, gid):
            return None  # no other user owns this google_id

        async def fake_set_google(session, user_id, google_id):
            assert user_id == USER_ID
            assert google_id == GOOGLE_SUB
            return True

        async def fake_get_by_id(session, uid):
            return _base_user(google_id=GOOGLE_SUB)

        monkeypatch.setattr(
            user_service, "get_user_by_google_id", fake_get_by_google_id, raising=True
        )
        monkeypatch.setattr(auth_module, "_set_google_id", fake_set_google, raising=True)
        monkeypatch.setattr(user_service, "get_user_by_id", fake_get_by_id, raising=True)

        client = TestClient(app)
        resp = client.post("/api/auth/google/add", json={"id_token": "valid-google-token"})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["google_connected"] is True
        assert data["id"] == USER_ID

    def test_google_id_belongs_to_another_user_returns_409(self, monkeypatch):
        """Token's sub belongs to a different user → 409."""
        _install_auth(_base_user(google_id=None))

        monkeypatch.setattr(
            auth_service,
            "verify_google_id_token",
            lambda token: {"sub": GOOGLE_SUB, "email": "other@example.com"},
            raising=True,
        )

        async def fake_get_by_google_id(session, gid):
            # Returns a *different* user (different id)
            return {"id": USER_ID + 1, "google_id": GOOGLE_SUB}

        monkeypatch.setattr(
            user_service, "get_user_by_google_id", fake_get_by_google_id, raising=True
        )

        client = TestClient(app)
        resp = client.post("/api/auth/google/add", json={"id_token": "valid-google-token"})
        assert resp.status_code == 409
        assert resp.json()["detail"]["code"] == "PROVIDER_LINK_CONFLICT"

    def test_different_google_id_cannot_replace_current_accounts_link(self, monkeypatch):
        _install_auth(_base_user(google_id="original-google-sub"))
        monkeypatch.setattr(
            auth_service,
            "verify_google_id_token",
            lambda token: {"sub": "replacement-google-sub", "email": "user@example.com"},
            raising=True,
        )

        client = TestClient(app)
        resp = client.post("/api/auth/google/add", json={"id_token": "valid-google-token"})

        assert resp.status_code == 409
        assert resp.json()["detail"]["code"] == "PROVIDER_ALREADY_CONNECTED"

    def test_concurrent_different_google_links_only_commit_one_identity(self, monkeypatch):
        _install_auth(_base_user(google_id=None))
        lookup_barrier = Barrier(2)
        state_lock = Lock()
        state = {"google_id": None}

        monkeypatch.setattr(
            auth_service,
            "verify_google_id_token",
            lambda token: {"sub": token, "email": "user@example.com"},
            raising=True,
        )

        async def fake_get_by_google_id(session, google_id):
            lookup_barrier.wait(timeout=5)
            return None

        async def conditional_set(session, user_id, google_id):
            with state_lock:
                if state["google_id"] not in (None, google_id):
                    return False
                state["google_id"] = google_id
                return True

        async def fake_get_by_id(session, user_id):
            return _base_user(google_id=state["google_id"])

        monkeypatch.setattr(
            user_service, "get_user_by_google_id", fake_get_by_google_id, raising=True
        )
        monkeypatch.setattr(auth_module, "_set_google_id", conditional_set, raising=True)
        monkeypatch.setattr(user_service, "get_user_by_id", fake_get_by_id, raising=True)

        def link(subject: str):
            return TestClient(app).post("/api/auth/google/add", json={"id_token": subject})

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(link, ["google-sub-one", "google-sub-two"]))

        assert sorted(response.status_code for response in responses) == [200, 409]
        conflict = next(response for response in responses if response.status_code == 409)
        assert conflict.json()["detail"]["code"] == "PROVIDER_ALREADY_CONNECTED"
        assert state["google_id"] in {"google-sub-one", "google-sub-two"}

    def test_google_unique_race_maps_to_cross_account_conflict(self, monkeypatch):
        _install_auth(_base_user(google_id=None))
        monkeypatch.setattr(
            auth_service,
            "verify_google_id_token",
            lambda token: {"sub": GOOGLE_SUB, "email": "user@example.com"},
            raising=True,
        )

        async def fake_get_by_google_id(session, google_id):
            return None

        async def unique_race(*_args, **_kwargs):
            raise IntegrityError("conditional update", {}, Exception("unique"))

        monkeypatch.setattr(
            user_service, "get_user_by_google_id", fake_get_by_google_id, raising=True
        )
        monkeypatch.setattr(auth_module, "_set_google_id", unique_race, raising=True)

        resp = TestClient(app).post(
            "/api/auth/google/add", json={"id_token": "valid-google-token"}
        )

        assert resp.status_code == 409
        assert resp.json()["detail"]["code"] == "PROVIDER_LINK_CONFLICT"

    def test_idempotent_when_already_linked_to_same_user(self, monkeypatch):
        """Token's sub is already linked to this user → 200, no error."""
        _install_auth(_base_user(google_id=GOOGLE_SUB))

        monkeypatch.setattr(
            auth_service,
            "verify_google_id_token",
            lambda token: {"sub": GOOGLE_SUB, "email": "user@example.com"},
            raising=True,
        )

        async def fake_get_by_google_id(session, gid):
            return {"id": USER_ID, "google_id": GOOGLE_SUB}  # same user

        async def fake_get_by_id(session, uid):
            return _base_user(google_id=GOOGLE_SUB)

        monkeypatch.setattr(
            user_service, "get_user_by_google_id", fake_get_by_google_id, raising=True
        )
        monkeypatch.setattr(user_service, "get_user_by_id", fake_get_by_id, raising=True)

        client = TestClient(app)
        resp = client.post("/api/auth/google/add", json={"id_token": "valid-google-token"})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["google_connected"] is True

    def test_invalid_token_returns_401(self, monkeypatch):
        """Invalid Google token → 401."""
        _install_auth(_base_user())

        def raise_value(token):
            raise ValueError("bad token")

        monkeypatch.setattr(auth_service, "verify_google_id_token", raise_value, raising=True)

        client = TestClient(app)
        resp = client.post("/api/auth/google/add", json={"id_token": "garbage"})
        assert resp.status_code == 401
        assert resp.json()["detail"] == {
            "code": "PROVIDER_LINK_TOKEN_INVALID",
            "message": "The provider token could not be verified.",
        }

    def test_audience_mismatch_returns_stable_sanitized_code(self, monkeypatch):
        _install_auth(_base_user())

        def raise_audience(_token):
            raise auth_service.ProviderAudienceError("unexpected-client-id")

        monkeypatch.setattr(auth_service, "verify_google_id_token", raise_audience, raising=True)

        client = TestClient(app)
        resp = client.post("/api/auth/google/add", json={"id_token": "sensitive-token"})

        assert resp.status_code == 401
        assert resp.json()["detail"] == {
            "code": "PROVIDER_LINK_AUDIENCE",
            "message": "The provider token was issued for an unsupported application.",
        }
        assert "unexpected-client-id" not in resp.text

    def test_missing_configuration_returns_stable_sanitized_code(self, monkeypatch):
        _install_auth(_base_user())

        def raise_config(_token):
            raise auth_service.ProviderConfigurationError("GOOGLE_CLIENT_IDS missing")

        monkeypatch.setattr(auth_service, "verify_google_id_token", raise_config, raising=True)

        client = TestClient(app)
        resp = client.post("/api/auth/google/add", json={"id_token": "sensitive-token"})

        assert resp.status_code == 503
        assert resp.json()["detail"]["code"] == "internal_error"
        assert resp.json()["detail"]["request_id"]
        assert "GOOGLE_CLIENT_IDS" not in resp.text

    def test_unauthenticated_returns_401(self):
        """No bearer token → 401 before any logic runs."""
        _install_auth(None)
        client = TestClient(app)
        resp = client.post("/api/auth/google/add", json={"id_token": "anything"})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/auth/apple/add
# ---------------------------------------------------------------------------


class TestAppleAdd:
    """Tests for POST /api/auth/apple/add."""

    def test_happy_path_links_apple(self, monkeypatch):
        """Verified token with no clash → links apple_id, returns updated UserResponse."""
        _install_auth(_base_user(apple_id=None))

        monkeypatch.setattr(
            auth_service,
            "verify_apple_id_token",
            lambda token: {"sub": APPLE_SUB, "email": "user@example.com"},
            raising=True,
        )

        async def fake_get_by_apple_id(session, aid):
            return None  # no other user owns this apple_id

        async def fake_set_apple(session, user_id, apple_id):
            assert user_id == USER_ID
            assert apple_id == APPLE_SUB
            return True

        async def fake_capture(session, *, user_id, apple_id, authorization_code, client_id=None):
            assert user_id == USER_ID
            assert apple_id == APPLE_SUB
            assert authorization_code == "apple-code"

        async def fake_get_by_id(session, uid):
            return _base_user(apple_id=APPLE_SUB)

        monkeypatch.setattr(
            user_service, "get_user_by_apple_id", fake_get_by_apple_id, raising=True
        )
        monkeypatch.setattr(auth_module, "_set_apple_id", fake_set_apple, raising=True)
        monkeypatch.setattr(
            auth_module, "_capture_apple_refresh_token", fake_capture, raising=True
        )
        monkeypatch.setattr(user_service, "get_user_by_id", fake_get_by_id, raising=True)

        client = TestClient(app)
        resp = client.post(
            "/api/auth/apple/add",
            json={"id_token": "valid-apple-token", "authorization_code": "apple-code"},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["apple_connected"] is True
        assert data["id"] == USER_ID

    def test_apple_id_belongs_to_another_user_returns_409(self, monkeypatch):
        """Token's sub belongs to a different user → 409."""
        _install_auth(_base_user(apple_id=None))

        monkeypatch.setattr(
            auth_service,
            "verify_apple_id_token",
            lambda token: {"sub": APPLE_SUB, "email": "other@example.com"},
            raising=True,
        )

        async def fake_get_by_apple_id(session, aid):
            return {"id": USER_ID + 1, "apple_id": APPLE_SUB}

        monkeypatch.setattr(
            user_service, "get_user_by_apple_id", fake_get_by_apple_id, raising=True
        )

        client = TestClient(app)
        resp = client.post("/api/auth/apple/add", json={"id_token": "valid-apple-token"})
        assert resp.status_code == 409
        assert resp.json()["detail"]["code"] == "PROVIDER_LINK_CONFLICT"

    def test_different_apple_id_cannot_replace_current_accounts_link(self, monkeypatch):
        _install_auth(_base_user(apple_id="original-apple-sub"))
        monkeypatch.setattr(
            auth_service,
            "verify_apple_id_token",
            lambda token: {
                "sub": "replacement-apple-sub",
                "email": "user@example.com",
                "aud": "com.beachleague.app",
            },
            raising=True,
        )

        async def should_not_capture(*_args, **_kwargs):
            pytest.fail("replacement attempt must not exchange an Apple code")

        monkeypatch.setattr(
            auth_module, "_capture_apple_refresh_token", should_not_capture, raising=True
        )

        client = TestClient(app)
        resp = client.post(
            "/api/auth/apple/add",
            json={"id_token": "valid-apple-token", "authorization_code": "apple-code"},
        )

        assert resp.status_code == 409
        assert resp.json()["detail"]["code"] == "PROVIDER_ALREADY_CONNECTED"

    def test_concurrent_different_apple_links_only_commit_one_identity(self, monkeypatch):
        _install_auth(_base_user(apple_id=None))
        lookup_barrier = Barrier(2)
        state_lock = Lock()
        state = {"apple_id": None}

        monkeypatch.setattr(
            auth_service,
            "verify_apple_id_token",
            lambda token: {
                "sub": token,
                "email": "user@example.com",
                "aud": "com.beachleague.app",
            },
            raising=True,
        )

        async def fake_get_by_apple_id(session, apple_id):
            lookup_barrier.wait(timeout=5)
            return None

        async def fake_capture(*_args, **_kwargs):
            return None

        async def conditional_set(session, user_id, apple_id):
            with state_lock:
                if state["apple_id"] not in (None, apple_id):
                    return False
                state["apple_id"] = apple_id
                return True

        async def fake_get_by_id(session, user_id):
            return _base_user(apple_id=state["apple_id"])

        monkeypatch.setattr(
            user_service, "get_user_by_apple_id", fake_get_by_apple_id, raising=True
        )
        monkeypatch.setattr(
            auth_module, "_capture_apple_refresh_token", fake_capture, raising=True
        )
        monkeypatch.setattr(auth_module, "_set_apple_id", conditional_set, raising=True)
        monkeypatch.setattr(user_service, "get_user_by_id", fake_get_by_id, raising=True)

        def link(subject: str):
            return TestClient(app).post(
                "/api/auth/apple/add",
                json={"id_token": subject, "authorization_code": f"code-{subject}"},
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(link, ["apple-sub-one", "apple-sub-two"]))

        assert sorted(response.status_code for response in responses) == [200, 409]
        conflict = next(response for response in responses if response.status_code == 409)
        assert conflict.json()["detail"]["code"] == "PROVIDER_ALREADY_CONNECTED"
        assert state["apple_id"] in {"apple-sub-one", "apple-sub-two"}

    def test_apple_unique_race_maps_to_cross_account_conflict(self, monkeypatch):
        _install_auth(_base_user(apple_id=None))
        monkeypatch.setattr(
            auth_service,
            "verify_apple_id_token",
            lambda token: {
                "sub": APPLE_SUB,
                "email": "user@example.com",
                "aud": "com.beachleague.app",
            },
            raising=True,
        )

        async def fake_get_by_apple_id(session, apple_id):
            return None

        async def fake_capture(*_args, **_kwargs):
            return None

        async def unique_race(*_args, **_kwargs):
            raise IntegrityError("conditional update", {}, Exception("unique"))

        monkeypatch.setattr(
            user_service, "get_user_by_apple_id", fake_get_by_apple_id, raising=True
        )
        monkeypatch.setattr(
            auth_module, "_capture_apple_refresh_token", fake_capture, raising=True
        )
        monkeypatch.setattr(auth_module, "_set_apple_id", unique_race, raising=True)

        resp = TestClient(app).post(
            "/api/auth/apple/add",
            json={"id_token": "valid-apple-token", "authorization_code": "apple-code"},
        )

        assert resp.status_code == 409
        assert resp.json()["detail"]["code"] == "PROVIDER_LINK_CONFLICT"

    def test_idempotent_when_already_linked_to_same_user(self, monkeypatch):
        """Token's sub is already linked to this user → 200, no error."""
        _install_auth(_base_user(apple_id=APPLE_SUB))

        monkeypatch.setattr(
            auth_service,
            "verify_apple_id_token",
            lambda token: {"sub": APPLE_SUB, "email": "user@example.com"},
            raising=True,
        )

        async def fake_get_by_apple_id(session, aid):
            return {"id": USER_ID, "apple_id": APPLE_SUB}  # same user

        async def fake_get_by_id(session, uid):
            return _base_user(apple_id=APPLE_SUB)

        monkeypatch.setattr(
            user_service, "get_user_by_apple_id", fake_get_by_apple_id, raising=True
        )
        monkeypatch.setattr(user_service, "get_user_by_id", fake_get_by_id, raising=True)

        async def should_not_capture(*_args, **_kwargs):
            pytest.fail("idempotent repeat must not consume another Apple code")

        monkeypatch.setattr(
            auth_module, "_capture_apple_refresh_token", should_not_capture, raising=True
        )

        client = TestClient(app)
        resp = client.post(
            "/api/auth/apple/add",
            json={"id_token": "valid-apple-token", "authorization_code": "new-code"},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["apple_connected"] is True

    def test_invalid_token_returns_401(self, monkeypatch):
        """Invalid Apple token → 401."""
        _install_auth(_base_user())

        def raise_value(token):
            raise ValueError("bad token")

        monkeypatch.setattr(auth_service, "verify_apple_id_token", raise_value, raising=True)

        client = TestClient(app)
        resp = client.post("/api/auth/apple/add", json={"id_token": "garbage"})
        assert resp.status_code == 401
        assert resp.json()["detail"]["code"] == "PROVIDER_LINK_TOKEN_INVALID"

    def test_code_exchange_failure_rolls_back_before_provider_id_write(self, monkeypatch):
        _install_auth(_base_user(apple_id=None))
        monkeypatch.setattr(
            auth_service,
            "verify_apple_id_token",
            lambda token: {
                "sub": APPLE_SUB,
                "email": "user@example.com",
                "aud": "com.beachleague.app",
            },
            raising=True,
        )

        async def fake_get_by_apple_id(session, aid):
            return None

        async def fail_capture(*_args, **_kwargs):
            raise auth_module.HTTPException(status_code=503, detail="provider response details")

        async def should_not_set(*_args, **_kwargs):
            pytest.fail("apple_id write must not run after code exchange failure")

        monkeypatch.setattr(
            user_service, "get_user_by_apple_id", fake_get_by_apple_id, raising=True
        )
        monkeypatch.setattr(
            auth_module, "_capture_apple_refresh_token", fail_capture, raising=True
        )
        monkeypatch.setattr(auth_module, "_set_apple_id", should_not_set, raising=True)

        client = TestClient(app)
        resp = client.post(
            "/api/auth/apple/add",
            json={"id_token": "valid-apple-token", "authorization_code": "one-time-code"},
        )

        assert resp.status_code == 503
        assert resp.json()["detail"]["code"] == "internal_error"
        assert resp.json()["detail"]["request_id"]
        assert "provider response details" not in resp.text

    def test_unauthenticated_returns_401(self):
        """No bearer token → 401 before any logic runs."""
        _install_auth(None)
        client = TestClient(app)
        resp = client.post("/api/auth/apple/add", json={"id_token": "anything"})
        assert resp.status_code == 401
