"""Browser transactions fail closed before reaching account mutations."""

import asyncio
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, Request, Response

from backend.services import auth_service, redis_service, apple_token_service, user_service
from backend.services.auth import apple_web_service as web
from backend.api.routes.auth import _capture_apple_refresh_token, _require_apple_web_transaction
from backend.api.routes.auth import add_google_provider
from backend.models.schemas import LinkProviderRequest


def request(binding=None, origin="https://beachleaguevb.com"):
    headers = [(b"origin", origin.encode())]
    if binding:
        headers.append((b"cookie", f"{web.COOKIE_NAME}={binding}".encode()))
    return Request({"type": "http", "headers": headers})


@pytest.fixture
def browser(monkeypatch):
    monkeypatch.setenv("APPLE_WEB_CLIENT_ID", "com.example.web")
    monkeypatch.setenv("APPLE_WEB_REDIRECT_URI", "https://beachleaguevb.com/auth/apple/callback")
    monkeypatch.setattr(auth_service, "APPLE_CLIENT_ID", "com.example.app")
    monkeypatch.setattr(auth_service, "APPLE_CLIENT_IDS", "com.example.web")
    values = {}

    async def put(key, value, **kwargs):
        assert kwargs == {"ex": 300, "nx": True}
        values[key] = value
        return True

    async def take(key):
        return values.pop(key, None)

    redis = AsyncMock()
    redis.set.side_effect = put
    redis.getdel.side_effect = take
    monkeypatch.setattr(redis_service, "get_redis_client", AsyncMock(return_value=redis))
    return redis


async def begin(user_id=None):
    response = Response()
    config = await web.start(request(), response, user_id=user_id)
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "Secure" in cookie and "SameSite=lax" in cookie
    assert response.headers["cache-control"] == "no-store"
    binding = cookie.split(";", 1)[0].split("=", 1)[1]
    return config, request(binding)


async def test_single_use_and_concurrent_consumption(browser, monkeypatch):
    config, req = await begin()
    monkeypatch.setattr(
        auth_service,
        "verify_apple_id_token",
        lambda _: {"aud": config["clientId"], "nonce": config["nonce"]},
    )
    outcomes = await asyncio.gather(
        *[web.consume(req, config["state"], "token") for _ in range(2)], return_exceptions=True
    )
    assert sum(isinstance(outcome, dict) for outcome in outcomes) == 1
    assert (
        sum(
            isinstance(outcome, HTTPException) and outcome.status_code == 401
            for outcome in outcomes
        )
        == 1
    )


@pytest.mark.parametrize(
    "failure", ["cookie", "account", "nonce", "audience", "expired", "origin"]
)
async def test_rejects_invalid_browser_transaction(browser, monkeypatch, failure):
    config, req = await begin(user_id=5)
    identity = {"aud": config["clientId"], "nonce": config["nonce"]}
    monkeypatch.setattr(auth_service, "verify_apple_id_token", lambda _: identity)
    if failure == "cookie":
        req = request("different-browser")
    if failure == "origin":
        req = request("different-browser", "https://untrusted.example")
    if failure == "nonce":
        identity["nonce"] = "different"
    if failure == "audience":
        identity["aud"] = "com.example.app"
    if failure == "expired":
        browser.getdel.side_effect = AsyncMock(return_value=None)
    with pytest.raises(HTTPException) as error:
        await web.consume(req, config["state"], "token", user_id=6 if failure == "account" else 5)
    assert error.value.status_code in (401, 403)


async def test_redis_unavailable_fails_closed(browser, monkeypatch):
    monkeypatch.setattr(redis_service, "get_redis_client", AsyncMock(return_value=None))
    with pytest.raises(HTTPException) as error:
        await begin()
    assert error.value.status_code == 503


@pytest.mark.parametrize(
    "uri",
    [
        "https://untrusted.example/auth/apple/callback",
        "http://beachleaguevb.com/auth/apple/callback",
        "https://beachleaguevb.com/auth/apple/callback?token=x",
        "https://beachleaguevb.com/other",
    ],
)
def test_configuration_rejects_unowned_return_urls(browser, monkeypatch, uri):
    monkeypatch.setenv("APPLE_WEB_REDIRECT_URI", uri)
    assert web.configuration() is None


def test_native_entry_cannot_bypass_web_state(browser):
    with pytest.raises(HTTPException):
        _require_apple_web_transaction({"aud": "com.example.web"}, None)
    _require_apple_web_transaction({"aud": "com.example.app"}, None)


async def test_google_link_rejects_session_switch_before_provider_work(monkeypatch):
    verify = AsyncMock()
    monkeypatch.setattr(auth_service, "verify_google_id_token", verify)
    with pytest.raises(HTTPException) as error:
        await add_google_provider(
            LinkProviderRequest(id_token="test-token", expected_user_id=5), {"id": 6}, AsyncMock()
        )
    assert error.value.status_code == 409
    assert error.value.detail["code"] == "PROVIDER_LINK_SESSION_CHANGED"
    verify.assert_not_called()


@pytest.mark.parametrize("claim", ["sub", "aud", "nonce"])
async def test_code_exchange_identity_mismatch_never_persists(browser, monkeypatch, claim):
    exchange = AsyncMock(return_value={"id_token": "exchanged", "refresh_token": "refresh"})
    monkeypatch.setattr(apple_token_service, "exchange_authorization_code", exchange)
    identity = {"sub": "apple-user", "aud": "com.example.web", "nonce": "expected"}
    identity[claim] = "mismatch"
    monkeypatch.setattr(auth_service, "verify_apple_id_token", lambda *args, **kwargs: identity)
    store = AsyncMock()
    monkeypatch.setattr(user_service, "store_apple_refresh_token", store)
    with pytest.raises(HTTPException):
        await _capture_apple_refresh_token(
            AsyncMock(),
            user_id=5,
            apple_id="apple-user",
            authorization_code="code",
            client_id="com.example.web",
            redirect_uri="https://beachleaguevb.com/auth/apple/callback",
            expected_nonce="expected",
        )
    store.assert_not_awaited()
    exchange.assert_awaited_once_with(
        "code", "com.example.web", redirect_uri="https://beachleaguevb.com/auth/apple/callback"
    )


def test_completion_route_uses_only_consumed_server_configuration(monkeypatch):
    from fastapi.testclient import TestClient
    from backend.api.main import app
    from backend.database.db import get_db_session
    from backend.api.routes import apple_web as routes

    session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: session
    consume = AsyncMock(
        return_value={
            "redirectURI": "https://beachleaguevb.com/auth/apple/callback",
            "nonce": "server-nonce",
        }
    )
    authenticate = AsyncMock(
        return_value={
            "access_token": "test-access",
            "refresh_token": "test-refresh",
            "token_type": "bearer",
            "user_id": 5,
            "is_verified": True,
        }
    )
    monkeypatch.setattr(web, "consume", consume)
    monkeypatch.setattr(routes, "_authenticate_apple", authenticate)
    try:
        response = TestClient(app).post(
            "/api/auth/apple/web/complete",
            json={
                "id_token": "test-id",
                "authorization_code": "test-code",
                "state": "s" * 32,
                "redirect_uri": "https://untrusted.example",
                "nonce": "client-nonce",
            },
        )
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        assert authenticate.await_args.kwargs == {
            "redirect_uri": "https://beachleaguevb.com/auth/apple/callback",
            "expected_nonce": "server-nonce",
        }
    finally:
        app.dependency_overrides.pop(get_db_session, None)
