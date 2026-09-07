"""Apple entry exercises real credential capture, not a mocked capture helper."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.api.auth_dependencies import get_current_user
from backend.database.db import get_db_session
from backend.services import (
    auth_service,
    apple_token_service,
    data_service,
    user_service,
    youth_safety_service,
)
from backend.services.players.player_data import upsert_user_player
import backend.api.routes.auth as auth_routes


@pytest.fixture
def apple_entry(monkeypatch):
    session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: session
    monkeypatch.setenv("APPLE_TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())
    identity = {"sub": "test-apple-sub", "email": "test@example.com", "aud": "com.example.app"}
    user = {"id": 27, "is_verified": True, "auth_provider": "apple"}
    monkeypatch.setattr(auth_service, "verify_apple_id_token", lambda token, **kwargs: identity)
    lookup = AsyncMock(return_value=None)
    monkeypatch.setattr(user_service, "get_user_by_apple_id", lookup)
    monkeypatch.setattr(user_service, "get_user_by_email", AsyncMock(return_value=None))
    create = AsyncMock(return_value=user["id"])
    monkeypatch.setattr(user_service, "create_apple_user", create)
    player = AsyncMock(return_value={"id": 30})
    monkeypatch.setattr(data_service, "upsert_user_player", player)
    monkeypatch.setattr(user_service, "get_user_by_id", AsyncMock(return_value=user))
    store = AsyncMock()
    monkeypatch.setattr(user_service, "store_apple_refresh_token", store)
    monkeypatch.setattr(
        auth_routes, "_issue_tokens", AsyncMock(return_value=("access", "refresh"))
    )
    monkeypatch.setattr(auth_routes, "_check_profile_complete", AsyncMock(return_value=False))
    monkeypatch.setattr(
        apple_token_service, "create_client_secret", lambda client_id: "test-secret"
    )
    post = AsyncMock(
        return_value=httpx.Response(
            200, json={"id_token": "exchanged", "refresh_token": "test-refresh"}
        )
    )
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=SimpleNamespace(post=post))
    context.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(apple_token_service.httpx, "AsyncClient", lambda **kwargs: context)
    facts = youth_safety_service.evaluate_gate(
        country_code="US",
        region_code="NY",
        declared_band="adult",
        assurance_source="self_declared",
        declaration_source="self_declared",
        guardian_consent=False,
    )
    payload = {
        "id_token": "initial",
        "authorization_code": "fresh-code",
        "eligibility_token": youth_safety_service.create_eligibility_token(facts),
    }
    yield SimpleNamespace(
        client=TestClient(app),
        session=session,
        identity=identity,
        user=user,
        lookup=lookup,
        create=create,
        player=player,
        store=store,
        post=post,
        payload=payload,
    )
    app.dependency_overrides.pop(get_db_session, None)


@pytest.mark.parametrize("email", ["test@example.com", "test@privaterelay.appleid.com"])
def test_signup_captures_before_first_commit(apple_entry, email):
    entry = apple_entry
    entry.identity["email"] = email

    async def capture(session, user_id, ciphertext):
        session.commit.assert_not_awaited()
        assert apple_token_service.decrypt_refresh_credential(ciphertext) == (
            "test-refresh",
            "com.example.app",
        )

    entry.store.side_effect = capture
    response = entry.client.post("/api/auth/apple", json=entry.payload)
    assert response.status_code == 200
    assert response.json()["is_new_user"] is True
    assert entry.player.await_args.kwargs["commit"] is False
    assert entry.post.await_args.kwargs["data"]["code"] == "fresh-code"
    assert entry.post.await_args.kwargs["data"]["client_id"] == "com.example.app"
    entry.session.commit.assert_awaited_once()


@pytest.mark.parametrize(
    "category,status,code",
    [
        ("invalid_client", 503, "APPLE_AUTH_CONFIG"),
        ("invalid_grant", 401, "APPLE_AUTH_RETRY"),
        ("unrecognized-secret-error", 503, "APPLE_AUTH_PROVIDER"),
    ],
)
def test_failed_exchange_rolls_back_and_safe_retry(apple_entry, category, status, code, caplog):
    entry = apple_entry
    entry.post.return_value = httpx.Response(
        400, json={"error": category, "error_description": "PRIVATE_PROVIDER_DETAIL"}
    )
    response = entry.client.post("/api/auth/apple", json=entry.payload)
    assert response.status_code == status
    assert response.json()["detail"]["code"] == code
    assert response.json()["detail"]["request_id"]
    assert "PRIVATE_PROVIDER_DETAIL" not in response.text + caplog.text
    assert "unrecognized-secret-error" not in response.text + caplog.text
    entry.session.commit.assert_not_awaited()
    entry.session.rollback.assert_awaited_once()
    entry.store.assert_not_awaited()
    entry.post.return_value = httpx.Response(
        200, json={"id_token": "exchanged", "refresh_token": "retry-refresh"}
    )
    retry = entry.client.post(
        "/api/auth/apple", json={**entry.payload, "authorization_code": "fresh-retry-code"}
    )
    assert retry.status_code == 200
    entry.session.commit.assert_awaited_once()


@pytest.mark.parametrize(
    "failure", ["timeout", "json", "incomplete", "wrong_subject", "wrong_audience", "encryption"]
)
def test_capture_failures_never_commit_new_account(apple_entry, monkeypatch, failure):
    entry = apple_entry
    if failure == "timeout":
        entry.post.side_effect = httpx.ReadTimeout("PRIVATE_TRANSPORT_DETAIL")
    elif failure == "json":
        entry.post.return_value = httpx.Response(200, content=b"not json")
    elif failure == "incomplete":
        entry.post.return_value = httpx.Response(
            200, json={"id_token": 123, "refresh_token": "token"}
        )
    elif failure in {"wrong_subject", "wrong_audience"}:
        key = "sub" if failure == "wrong_subject" else "aud"
        monkeypatch.setattr(
            auth_service,
            "verify_apple_id_token",
            lambda token, **kwargs: (
                entry.identity if token == "initial" else {**entry.identity, key: "wrong"}
            ),
        )
    else:
        monkeypatch.setenv("APPLE_TOKEN_ENCRYPTION_KEY", "invalid")
    response = entry.client.post("/api/auth/apple", json=entry.payload)
    assert response.status_code in (401, 503)
    assert "PRIVATE_TRANSPORT_DETAIL" not in response.text
    entry.session.commit.assert_not_awaited()
    entry.session.rollback.assert_awaited_once()
    entry.store.assert_not_awaited()


def test_returning_user_keeps_identity_without_eligibility(apple_entry):
    entry = apple_entry
    entry.lookup.return_value = entry.user
    response = entry.client.post(
        "/api/auth/apple", json={"id_token": "initial", "authorization_code": "fresh-code"}
    )
    assert response.status_code == 200
    assert response.json()["user_id"] == entry.user["id"]
    assert response.json()["is_new_user"] is False
    entry.create.assert_not_awaited()
    entry.player.assert_not_awaited()


def test_first_login_needs_signup_eligibility(apple_entry):
    entry = apple_entry
    response = entry.client.post(
        "/api/auth/apple", json={"id_token": "initial", "authorization_code": "fresh-code"}
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "APPLE_AUTH_ELIGIBILITY"
    entry.create.assert_not_awaited()
    entry.post.assert_not_awaited()


@pytest.mark.parametrize("stage", ["initial", "exchanged"])
def test_jwks_outage_is_provider_unavailable_not_invalid_authorization(
    apple_entry, monkeypatch, stage
):
    entry = apple_entry

    def verify(token, **kwargs):
        if token == stage:
            raise auth_service.ProviderVerificationUnavailableError("PRIVATE_JWKS_ERROR")
        return entry.identity

    monkeypatch.setattr(auth_service, "verify_apple_id_token", verify)
    response = entry.client.post("/api/auth/apple", json=entry.payload)
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "APPLE_AUTH_PROVIDER"
    assert "PRIVATE_JWKS_ERROR" not in response.text
    entry.session.commit.assert_not_awaited()
    entry.session.rollback.assert_awaited_once()
    entry.store.assert_not_awaited()


@pytest.fixture
def apple_link(apple_entry, monkeypatch):
    entry = apple_entry
    entry.user.update(
        {
            "auth_provider": "google",
            "email": "original@example.com",
            "phone_number": None,
            "apple_id": None,
            "created_at": "2024-01-01T00:00:00Z",
        }
    )
    app.dependency_overrides[get_current_user] = lambda: entry.user

    async def set_identity(session, user_id, apple_id):
        session.commit.assert_not_awaited()
        entry.store.assert_awaited_once()
        entry.user["apple_id"] = apple_id
        return True

    entry.set_identity = AsyncMock(side_effect=set_identity)
    monkeypatch.setattr(auth_routes, "_set_apple_id", entry.set_identity)
    yield entry
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.parametrize("provider", ["google", "phone"])
def test_link_capture_keeps_original_identity_and_bound_credential(apple_link, provider):
    entry = apple_link
    entry.user["auth_provider"] = provider
    response = entry.client.post("/api/auth/apple/add", json=entry.payload)
    assert response.status_code == 200
    assert response.json()["id"] == entry.user["id"]
    assert response.json()["auth_provider"] == provider
    assert response.json()["email"] == "original@example.com"
    assert response.json()["apple_connected"] is True
    ciphertext = entry.store.await_args.args[2]
    assert apple_token_service.decrypt_refresh_credential(ciphertext) == (
        "test-refresh",
        "com.example.app",
    )
    entry.session.commit.assert_awaited_once()
    entry.create.assert_not_awaited()
    entry.player.assert_not_awaited()


@pytest.mark.parametrize(
    "failure,code",
    [
        ("invalid_client", "APPLE_AUTH_CONFIG"),
        ("invalid_grant", "APPLE_AUTH_RETRY"),
        ("timeout", "APPLE_AUTH_PROVIDER"),
        ("wrong_subject", "APPLE_AUTH_RETRY"),
        ("wrong_audience", "APPLE_AUTH_RETRY"),
        ("encryption", "APPLE_AUTH_CONFIG"),
    ],
)
def test_link_capture_failure_preserves_unlinked_state(apple_link, monkeypatch, failure, code):
    entry = apple_link
    if failure in {"invalid_client", "invalid_grant"}:
        entry.post.return_value = httpx.Response(
            400, json={"error": failure, "error_description": "PRIVATE"}
        )
    elif failure == "timeout":
        entry.post.side_effect = httpx.ReadTimeout("PRIVATE")
    elif failure in {"wrong_subject", "wrong_audience"}:
        key = "sub" if failure == "wrong_subject" else "aud"
        monkeypatch.setattr(
            auth_service,
            "verify_apple_id_token",
            lambda token, **kwargs: (
                entry.identity if token == "initial" else {**entry.identity, key: "wrong"}
            ),
        )
    else:
        monkeypatch.setenv("APPLE_TOKEN_ENCRYPTION_KEY", "invalid")
    response = entry.client.post(
        "/api/auth/apple/add", json=entry.payload, headers={"X-Request-ID": "test-link-request"}
    )
    assert response.status_code in (401, 503)
    assert response.json()["detail"]["code"] == code
    assert response.json()["detail"]["request_id"] == "test-link-request"
    assert "PRIVATE" not in response.text
    assert entry.user["apple_id"] is None
    entry.set_identity.assert_not_awaited()
    entry.store.assert_not_awaited()
    entry.session.commit.assert_not_awaited()
    entry.session.rollback.assert_awaited_once()


def test_repeat_link_does_not_consume_another_code(apple_link):
    entry = apple_link
    entry.user["apple_id"] = entry.identity["sub"]
    entry.lookup.return_value = entry.user
    response = entry.client.post("/api/auth/apple/add", json=entry.payload)
    assert response.status_code == 200
    assert response.json()["apple_connected"] is True
    entry.post.assert_not_awaited()
    entry.store.assert_not_awaited()
    entry.set_identity.assert_not_awaited()


def test_another_accounts_apple_identity_is_not_merged(apple_link):
    entry = apple_link
    entry.lookup.return_value = {"id": 999}
    response = entry.client.post("/api/auth/apple/add", json=entry.payload)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "PROVIDER_LINK_CONFLICT"
    entry.post.assert_not_awaited()
    entry.set_identity.assert_not_awaited()


@pytest.mark.asyncio
async def test_player_creation_can_join_outer_transaction():
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    session.execute.return_value = result
    session.add = MagicMock()
    await upsert_user_player(session, user_id=27, full_name="Test Player", commit=False)
    session.commit.assert_not_awaited()
    session.flush.assert_awaited_once()
    session.add.assert_called_once()
