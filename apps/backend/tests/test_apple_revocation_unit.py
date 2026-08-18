"""Provider-boundary and retry tests for Sign in with Apple revocation."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from cryptography.fernet import Fernet

from backend.services import apple_revocation_worker, apple_token_service, user_service


class _AsyncClientContext:
    def __init__(self, client):
        self.client = client

    async def __aenter__(self):
        return self.client

    async def __aexit__(self, *_args):
        return False


def test_refresh_token_encryption_round_trip(monkeypatch):
    monkeypatch.setenv("APPLE_TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())

    ciphertext = apple_token_service.encrypt_refresh_token("apple-refresh-token")

    assert ciphertext != "apple-refresh-token"
    assert apple_token_service.decrypt_refresh_token(ciphertext) == "apple-refresh-token"


def test_refresh_credential_preserves_issuing_client(monkeypatch):
    monkeypatch.setenv("APPLE_TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())

    ciphertext = apple_token_service.encrypt_refresh_credential(
        "apple-refresh-token", "com.beachleague.ios"
    )

    assert apple_token_service.decrypt_refresh_credential(ciphertext) == (
        "apple-refresh-token",
        "com.beachleague.ios",
    )


def test_client_secret_uses_short_lived_apple_claims(monkeypatch):
    monkeypatch.setenv("APPLE_TEAM_ID", "TEAM123")
    monkeypatch.setenv("APPLE_CLIENT_ID", "com.beachleague.app")
    monkeypatch.setenv("APPLE_KEY_ID", "KEY123")
    monkeypatch.setenv("APPLE_PRIVATE_KEY", "private-key")

    with patch.object(apple_token_service.jwt, "encode", return_value="client-secret") as encode:
        assert apple_token_service.create_client_secret() == "client-secret"

    claims, key = encode.call_args.args[:2]
    assert claims["iss"] == "TEAM123"
    assert claims["sub"] == "com.beachleague.app"
    assert claims["aud"] == "https://appleid.apple.com"
    assert (claims["exp"] - claims["iat"]).total_seconds() == 600
    assert key == "private-key"
    assert encode.call_args.kwargs == {"algorithm": "ES256", "headers": {"kid": "KEY123"}}


@pytest.mark.asyncio
async def test_revocation_posts_refresh_token_to_apple(monkeypatch):
    monkeypatch.setenv("APPLE_CLIENT_ID", "com.beachleague.app")
    response = SimpleNamespace(status_code=200)
    client = SimpleNamespace(post=AsyncMock(return_value=response))

    with (
        patch.object(apple_token_service, "create_client_secret", return_value="client-secret"),
        patch.object(
            apple_token_service.httpx,
            "AsyncClient",
            return_value=_AsyncClientContext(client),
        ),
    ):
        await apple_token_service.revoke_refresh_token("apple-refresh-token")

    call = client.post.await_args
    assert call.args == (apple_token_service.APPLE_REVOKE_URL,)
    assert call.kwargs["data"] == {
        "client_id": "com.beachleague.app",
        "client_secret": "client-secret",
        "token": "apple-refresh-token",
        "token_type_hint": "refresh_token",
    }


@pytest.mark.asyncio
async def test_revocation_uses_credential_bound_client_id(monkeypatch):
    response = SimpleNamespace(status_code=200)
    client = SimpleNamespace(post=AsyncMock(return_value=response))

    with (
        patch.object(apple_token_service, "create_client_secret", return_value="client-secret"),
        patch.object(
            apple_token_service.httpx,
            "AsyncClient",
            return_value=_AsyncClientContext(client),
        ),
    ):
        await apple_token_service.revoke_refresh_token(
            "apple-refresh-token", "com.beachleague.ios"
        )

    assert client.post.await_args.kwargs["data"]["client_id"] == "com.beachleague.ios"


@pytest.mark.asyncio
async def test_successful_revocation_clears_ciphertext(monkeypatch):
    monkeypatch.setenv("APPLE_TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())
    ciphertext = apple_token_service.encrypt_refresh_token("apple-refresh-token")
    job = SimpleNamespace(
        refresh_token_ciphertext=ciphertext,
        status="processing",
        claimed_at=object(),
        completed_at=None,
        last_error="old error",
    )
    session = SimpleNamespace(flush=AsyncMock())

    with patch.object(
        apple_token_service,
        "revoke_refresh_token",
        new=AsyncMock(),
    ) as revoke:
        completed = await apple_revocation_worker.process_job(session, job)

    assert completed is True
    revoke.assert_awaited_once_with("apple-refresh-token", None)
    assert job.status == "completed"
    assert job.refresh_token_ciphertext == "revoked"
    assert job.completed_at is not None


@pytest.mark.asyncio
async def test_provider_failure_remains_pending_indefinitely(monkeypatch):
    monkeypatch.setenv("APPLE_TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())
    ciphertext = apple_token_service.encrypt_refresh_token("apple-refresh-token")
    job = SimpleNamespace(
        refresh_token_ciphertext=ciphertext,
        attempts=100,
        status="processing",
        claimed_at=object(),
        available_at=None,
        last_error=None,
    )
    session = SimpleNamespace(flush=AsyncMock())

    with patch.object(
        apple_token_service,
        "revoke_refresh_token",
        new=AsyncMock(side_effect=apple_token_service.AppleProviderError("HTTP 503")),
    ):
        completed = await apple_revocation_worker.process_job(session, job)

    assert completed is False
    assert job.status == "pending"
    assert job.available_at is not None
    assert job.refresh_token_ciphertext == ciphertext


@pytest.mark.asyncio
async def test_permanent_deletion_moves_credential_to_revocation_outbox():
    credential = SimpleNamespace(refresh_token_ciphertext="encrypted-token")
    result = MagicMock()
    result.scalar_one_or_none.return_value = credential
    session = SimpleNamespace(
        execute=AsyncMock(return_value=result),
        add=MagicMock(),
        delete=AsyncMock(),
    )

    await user_service._enqueue_apple_revocation(session, user_id=7)

    job = session.add.call_args.args[0]
    assert job.refresh_token_ciphertext == "encrypted-token"
    await_args = session.delete.await_args.args
    assert await_args == (credential,)
