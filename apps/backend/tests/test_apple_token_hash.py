"""Signed-token regression for Apple's exchanged ID-token access-token binding."""

from datetime import timedelta
from unittest.mock import AsyncMock

import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from jose import jwt, jwk

from backend.api.routes.auth import _capture_apple_refresh_token
from backend.services import auth_service, apple_token_service, user_service
from backend.utils.datetime_utils import utcnow


@pytest.fixture
def signed_exchange(monkeypatch):
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    key = private.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    public = private.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    public_jwk = {**jwk.construct(public, "RS256").to_dict(), "kid": "test-key"}
    monkeypatch.setattr(auth_service, "APPLE_CLIENT_ID", "com.example.app")
    monkeypatch.setattr(auth_service, "APPLE_CLIENT_IDS", None)
    monkeypatch.setattr(auth_service, "_fetch_apple_public_keys", lambda: {"keys": [public_jwk]})
    claims = {
        "iss": "https://appleid.apple.com",
        "aud": "com.example.app",
        "sub": "test-sub",
        "email": "test@example.com",
        "exp": utcnow() + timedelta(minutes=5),
    }
    token = jwt.encode(
        claims,
        key,
        algorithm="RS256",
        headers={"kid": "test-key"},
        access_token="bound-access-token",
    )
    return token


def test_exchanged_hash_requires_matching_access_token(signed_exchange):
    # Reproduces the previous failure using real signature and at_hash validation.
    with pytest.raises(auth_service.ProviderTokenError):
        auth_service.verify_apple_id_token(signed_exchange)
    with pytest.raises(auth_service.ProviderTokenError):
        auth_service.verify_apple_id_token(signed_exchange, access_token="wrong-token")
    assert (
        auth_service.verify_apple_id_token(signed_exchange, access_token="bound-access-token")[
            "sub"
        ]
        == "test-sub"
    )


@pytest.mark.asyncio
async def test_capture_passes_exchange_access_token_to_real_verifier(signed_exchange, monkeypatch):
    monkeypatch.setattr(
        apple_token_service,
        "exchange_authorization_code",
        AsyncMock(
            return_value={
                "id_token": signed_exchange,
                "access_token": "bound-access-token",
                "refresh_token": "refresh-token",
            }
        ),
    )
    monkeypatch.setattr(
        apple_token_service, "encrypt_refresh_credential", lambda token, client: "ciphertext"
    )
    store = AsyncMock()
    monkeypatch.setattr(user_service, "store_apple_refresh_token", store)
    session = AsyncMock()
    await _capture_apple_refresh_token(
        session,
        user_id=27,
        apple_id="test-sub",
        authorization_code="one-time-code",
        client_id="com.example.app",
    )
    store.assert_awaited_once_with(session, 27, "ciphertext")
