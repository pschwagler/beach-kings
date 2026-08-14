"""Apple authorization-code exchange and durable token revocation boundaries."""

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


def create_client_secret() -> str:
    now = utcnow()
    return jwt.encode(
        {
            "iss": _required_env("APPLE_TEAM_ID"),
            "iat": now,
            "exp": now + timedelta(minutes=10),
            "aud": "https://appleid.apple.com",
            "sub": _required_env("APPLE_CLIENT_ID"),
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
    return _fernet().encrypt(refresh_token.encode()).decode()


def decrypt_refresh_token(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise AppleConfigurationError("Unable to decrypt stored Apple credential") from exc


async def exchange_authorization_code(code: str) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.post(
                APPLE_TOKEN_URL,
                data={
                    "client_id": _required_env("APPLE_CLIENT_ID"),
                    "client_secret": create_client_secret(),
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


async def revoke_refresh_token(refresh_token: str) -> None:
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.post(
                APPLE_REVOKE_URL,
                data={
                    "client_id": _required_env("APPLE_CLIENT_ID"),
                    "client_secret": create_client_secret(),
                    "token": refresh_token,
                    "token_type_hint": "refresh_token",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        except httpx.RequestError as exc:
            raise AppleProviderError("Apple token revocation request failed") from exc
    if response.status_code != 200:
        raise AppleProviderError(f"Apple token revocation returned HTTP {response.status_code}")
