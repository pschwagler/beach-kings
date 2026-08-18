"""Apple authorization-code exchange and durable token revocation boundaries."""

import json
import os
from datetime import timedelta

import httpx
from cryptography.fernet import Fernet, InvalidToken
from jose import jwt

from backend.utils.datetime_utils import utcnow


APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token"
APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke"


class AppleConfigurationError(RuntimeError):
    pass


class AppleProviderError(RuntimeError):
    pass


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise AppleConfigurationError(f"{name} is required for Apple credential management")
    return value


def _private_key() -> str:
    return _required_env("APPLE_PRIVATE_KEY").replace("\\n", "\n")


def _client_id(client_id: str | None = None) -> str:
    return (
        client_id.strip() if client_id and client_id.strip() else _required_env("APPLE_CLIENT_ID")
    )


def create_client_secret(client_id: str | None = None) -> str:
    resolved_client_id = _client_id(client_id)
    now = utcnow()
    return jwt.encode(
        {
            "iss": _required_env("APPLE_TEAM_ID"),
            "iat": now,
            "exp": now + timedelta(minutes=10),
            "aud": "https://appleid.apple.com",
            "sub": resolved_client_id,
        },
        _private_key(),
        algorithm="ES256",
        headers={"kid": _required_env("APPLE_KEY_ID")},
    )


def _fernet() -> Fernet:
    try:
        return Fernet(_required_env("APPLE_TOKEN_ENCRYPTION_KEY").encode())
    except (ValueError, TypeError) as exc:
        raise AppleConfigurationError(
            "APPLE_TOKEN_ENCRYPTION_KEY must be a URL-safe base64 Fernet key"
        ) from exc


def encrypt_refresh_token(refresh_token: str) -> str:
    """Encrypt a legacy token-only credential payload."""
    return _fernet().encrypt(refresh_token.encode()).decode()


def decrypt_refresh_token(ciphertext: str) -> str:
    """Decrypt a legacy token-only credential payload."""
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise AppleConfigurationError("Unable to decrypt stored Apple credential") from exc


def encrypt_refresh_credential(refresh_token: str, client_id: str) -> str:
    """Encrypt the refresh token together with its exact Apple OAuth client."""
    payload = json.dumps(
        {"refresh_token": refresh_token, "client_id": _client_id(client_id)},
        separators=(",", ":"),
    )
    return _fernet().encrypt(payload.encode()).decode()


def decrypt_refresh_credential(ciphertext: str) -> tuple[str, str | None]:
    """Decode current credentials while retaining legacy token-only support."""
    plaintext = decrypt_refresh_token(ciphertext)
    try:
        payload = json.loads(plaintext)
    except json.JSONDecodeError:
        return plaintext, None
    if not isinstance(payload, dict):
        raise AppleConfigurationError("Stored Apple credential has an invalid format")
    refresh_token = payload.get("refresh_token")
    client_id = payload.get("client_id")
    if not isinstance(refresh_token, str) or not refresh_token:
        raise AppleConfigurationError("Stored Apple credential has an invalid format")
    if not isinstance(client_id, str) or not client_id:
        raise AppleConfigurationError("Stored Apple credential has an invalid format")
    return refresh_token, client_id


async def exchange_authorization_code(code: str, client_id: str | None = None) -> dict:
    resolved_client_id = _client_id(client_id)
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.post(
                APPLE_TOKEN_URL,
                data={
                    "client_id": resolved_client_id,
                    "client_secret": create_client_secret(resolved_client_id),
                    "code": code,
                    "grant_type": "authorization_code",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        except httpx.RequestError as exc:
            raise AppleProviderError("Apple token exchange request failed") from exc
    if response.status_code != 200:
        raise AppleProviderError(f"Apple token exchange returned HTTP {response.status_code}")
    payload = response.json()
    if not payload.get("refresh_token") or not payload.get("id_token"):
        raise AppleProviderError("Apple token exchange response was incomplete")
    return payload


async def revoke_refresh_token(refresh_token: str, client_id: str | None = None) -> None:
    resolved_client_id = _client_id(client_id)
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.post(
                APPLE_REVOKE_URL,
                data={
                    "client_id": resolved_client_id,
                    "client_secret": create_client_secret(resolved_client_id),
                    "token": refresh_token,
                    "token_type_hint": "refresh_token",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        except httpx.RequestError as exc:
            raise AppleProviderError("Apple token revocation request failed") from exc
    if response.status_code != 200:
        raise AppleProviderError(f"Apple token revocation returned HTTP {response.status_code}")
