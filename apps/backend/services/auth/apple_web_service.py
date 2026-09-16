"""Short-lived, single-use browser authorization transactions. No token storage."""

import hashlib
import json
import os
import secrets
from urllib.parse import urlsplit

from fastapi import HTTPException, Request, Response

from backend.services import auth_service, redis_service

COOKIE_NAME = "__Host-beach-apple"
TTL = 300


def configuration() -> dict | None:
    client_id = os.getenv("APPLE_WEB_CLIENT_ID", "").strip()
    redirect_uri = os.getenv("APPLE_WEB_REDIRECT_URI", "").strip()
    try:
        uri = urlsplit(redirect_uri)
    except ValueError:
        return None
    hosts = {"beachleaguevb.com"}
    if os.getenv("ENV", "development").lower() != "production":
        hosts.add("dev.beachleaguevb.com")
    audiences = auth_service._configured_audiences(
        auth_service.APPLE_CLIENT_ID, auth_service.APPLE_CLIENT_IDS
    )
    if (
        not client_id
        or client_id == auth_service.APPLE_CLIENT_ID
        or client_id not in audiences
        or uri.scheme != "https"
        or uri.hostname not in hosts
        or uri.netloc != uri.hostname
        or uri.path != "/auth/apple/callback"
        or uri.query
        or uri.fragment
    ):
        return None
    return {"clientId": client_id, "redirectURI": redirect_uri}


def require_configuration(request: Request) -> dict:
    config = configuration()
    if config is None:
        raise HTTPException(503, "Apple sign-in on the web is not available yet.")
    uri = urlsplit(config["redirectURI"])
    if request.headers.get("origin") != f"{uri.scheme}://{uri.netloc}":
        raise HTTPException(403, "Please start Apple sign-in from Beach League.")
    return config


async def _redis():
    client = await redis_service.get_redis_client()
    if client is None:
        raise HTTPException(503, "Apple sign-in is temporarily unavailable. Please try again.")
    return client


def _key(state: str) -> str:
    return "apple-web:" + hashlib.sha256(state.encode()).hexdigest()


async def start(request: Request, response: Response, *, user_id: int | None = None) -> dict:
    config = require_configuration(request)
    state, nonce, binding = (secrets.token_urlsafe(32) for _ in range(3))
    transaction = {
        "binding": hashlib.sha256(binding.encode()).hexdigest(),
        "nonce": nonce,
        "user_id": user_id,
        **config,
    }
    try:
        client = await _redis()
        await client.set(_key(state), json.dumps(transaction), ex=TTL, nx=True)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            503, "Apple sign-in is temporarily unavailable. Please try again."
        ) from None
    response.set_cookie(
        COOKIE_NAME, binding, max_age=TTL, httponly=True, secure=True, samesite="lax", path="/"
    )
    response.headers["Cache-Control"] = "no-store"
    return {**config, "state": state, "nonce": nonce}


async def consume(
    request: Request, state: str, id_token: str, *, user_id: int | None = None
) -> dict:
    config = require_configuration(request)
    binding = request.cookies.get(COOKIE_NAME)
    if not binding:
        raise HTTPException(401, "Apple sign-in expired. Please start again.")
    try:
        client = await _redis()
        raw = await client.getdel(_key(state))
        transaction = json.loads(raw) if raw else None
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            503, "Apple sign-in is temporarily unavailable. Please try again."
        ) from None
    if (
        not transaction
        or not secrets.compare_digest(
            transaction["binding"], hashlib.sha256(binding.encode()).hexdigest()
        )
        or transaction["user_id"] != user_id
        or any(transaction[key] != value for key, value in config.items())
    ):
        raise HTTPException(401, "Apple sign-in expired. Please start again.")
    try:
        identity = auth_service.verify_apple_id_token(id_token)
    except ValueError:
        raise HTTPException(
            401, "Apple authorization could not be verified. Please start again."
        ) from None
    nonce = identity.get("nonce")
    if (
        identity.get("aud") != config["clientId"]
        or not isinstance(nonce, str)
        or not secrets.compare_digest(nonce, transaction["nonce"])
    ):
        raise HTTPException(401, "Apple authorization could not be verified. Please start again.")
    return transaction
