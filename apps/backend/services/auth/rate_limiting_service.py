"""Distributed abuse controls for authentication and verification flows."""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import logging
import math
import os
from dataclasses import dataclass

from fastapi import HTTPException, Request

from backend.services import auth_service, redis_service

logger = logging.getLogger(__name__)

IS_TEST_ENV = os.getenv("ENV", "").lower() == "test"
_KEY_SECRET = (os.getenv("AUTH_RATE_LIMIT_SECRET") or auth_service.JWT_SECRET_KEY).encode()


def _trusted_proxy_networks() -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
    configured = os.getenv(
        "AUTH_TRUSTED_PROXY_IPS",
        "127.0.0.1/32,::1/128,172.16.0.0/12",
    )
    networks = []
    for value in configured.split(","):
        if not value.strip():
            continue
        try:
            networks.append(ipaddress.ip_network(value.strip(), strict=False))
        except ValueError:
            logger.warning("Ignoring invalid trusted auth proxy network")
    return tuple(networks)


_TRUSTED_PROXY_NETWORKS = _trusted_proxy_networks()

_RESERVE_SCRIPT = """
local incremented = {}
local retry_after = 0
for i, key in ipairs(KEYS) do
  local limit = tonumber(ARGV[(i - 1) * 2 + 1])
  local period = tonumber(ARGV[(i - 1) * 2 + 2])
  local count = redis.call('INCR', key)
  table.insert(incremented, key)
  if count == 1 then redis.call('EXPIRE', key, period) end
  if count > limit then
    local ttl = redis.call('TTL', key)
    if ttl > retry_after then retry_after = ttl end
    for _, rollback_key in ipairs(incremented) do
      local remaining = redis.call('DECR', rollback_key)
      if remaining <= 0 then redis.call('DEL', rollback_key) end
    end
    return {0, retry_after, i}
  end
end
return {1, 0, 0}
"""

_RELEASE_SCRIPT = """
for _, key in ipairs(KEYS) do
  local current = redis.call('GET', key)
  if current then
    local remaining = redis.call('DECR', key)
    if remaining <= 0 then redis.call('DEL', key) end
  end
end
return 1
"""

_LOGIN_FAILURE_SCRIPT = """
local failures = redis.call('INCR', KEYS[1])
if failures == 1 then redis.call('EXPIRE', KEYS[1], 900) end
if failures < 5 then return {failures, 0} end

local offenses = redis.call('INCR', KEYS[2])
if offenses == 1 then redis.call('EXPIRE', KEYS[2], 86400) end
local cooldown = 900 * (2 ^ (offenses - 1))
if cooldown > 3600 then cooldown = 3600 end
redis.call('SET', KEYS[3], '1', 'EX', cooldown)
redis.call('DEL', KEYS[1])
return {failures, cooldown}
"""

_VERIFICATION_FAILURE_SCRIPT = """
local attempts = redis.call('INCR', KEYS[1])
if attempts == 1 then redis.call('EXPIRE', KEYS[1], 600) end
return attempts
"""


@dataclass(frozen=True)
class DeliveryReservation:
    keys: tuple[str, ...] = ()


def reset_phone_rate_limit_storage() -> None:
    """Compatibility no-op retained for older test helpers."""


def _digest(namespace: str, value: str) -> str:
    return hmac.new(_KEY_SECRET, f"{namespace}:{value}".encode(), hashlib.sha256).hexdigest()


def get_phone_rate_limit_key(phone_number: str) -> str:
    """Return a non-reversible key for a normalized identifier."""
    try:
        normalized = auth_service.normalize_phone_number(phone_number)
    except Exception:
        normalized = phone_number.strip().lower()
    return f"authrl:legacy:{_digest('identifier', normalized)}"


def _client_ip(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    candidate = peer
    try:
        peer_address = ipaddress.ip_address(peer)
    except ValueError:
        peer_address = None
    if peer_address and any(peer_address in network for network in _TRUSTED_PROXY_NETWORKS):
        candidate = request.headers.get("x-real-ip") or (
            request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
        )
        candidate = candidate or peer
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return peer


async def _client():
    client = await redis_service.get_redis_client()
    if client is None:
        raise HTTPException(
            status_code=503,
            detail="Sign-in services are temporarily unavailable. Please try again shortly.",
            headers={"Retry-After": "60"},
        )
    return client


def _rate_limited(detail: str, retry_after: int) -> HTTPException:
    retry_after = max(1, retry_after)
    return HTTPException(
        status_code=429,
        detail=detail,
        headers={"Retry-After": str(retry_after)},
    )


def _wait_message(retry_after: int) -> str:
    minutes = max(1, math.ceil(retry_after / 60))
    unit = "minute" if minutes == 1 else "minutes"
    return f"Try again in {minutes} {unit}."


async def _reserve(limits: tuple[tuple[str, int, int], ...]) -> DeliveryReservation:
    if IS_TEST_ENV:
        return DeliveryReservation()
    client = await _client()
    keys = tuple(key for key, _, _ in limits)
    args = [value for _, limit, period in limits for value in (limit, period)]
    try:
        allowed, retry_after, failed_index = await client.eval(
            _RESERVE_SCRIPT, len(keys), *keys, *args
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Authentication rate-limit reservation failed", exc_info=exc)
        raise HTTPException(
            status_code=503,
            detail="Sign-in services are temporarily unavailable. Please try again shortly.",
            headers={"Retry-After": "60"},
        ) from exc
    if not allowed:
        scope = (
            "A code was requested too recently."
            if int(failed_index) <= 3
            else "Too many codes were requested from this network."
        )
        raise _rate_limited(
            f"{scope} {_wait_message(int(retry_after))}",
            int(retry_after),
        )
    return DeliveryReservation(keys)


async def reserve_code_delivery(
    request: Request,
    identifier: str,
    *,
    channel: str,
) -> DeliveryReservation:
    """Reserve identifier and tournament-safe network delivery capacity."""
    identifier_hash = _digest("identifier", identifier.strip().lower())
    ip_hash = _digest("ip", _client_ip(request))
    network_limits = ((60, 600), (300, 3600)) if channel == "sms" else ((120, 600), (1000, 3600))
    limits = (
        (f"authrl:delivery:id:{identifier_hash}:60", 1, 60),
        (f"authrl:delivery:id:{identifier_hash}:3600", 5, 3600),
        (f"authrl:delivery:id:{identifier_hash}:86400", 10, 86400),
        *(
            (f"authrl:delivery:ip:{channel}:{ip_hash}:{period}", limit, period)
            for limit, period in network_limits
        ),
    )
    return await _reserve(limits)


async def reserve_password_work(request: Request) -> None:
    """Reserve shared-network capacity before performing password bcrypt work."""
    ip_hash = _digest("ip", _client_ip(request))
    try:
        await _reserve(
            (
                (f"authrl:password-work:ip:{ip_hash}:600", 300, 600),
                (f"authrl:password-work:ip:{ip_hash}:3600", 2000, 3600),
            )
        )
    except HTTPException as exc:
        if exc.status_code != 429:
            raise
        raise HTTPException(
            status_code=429,
            detail="Too many sign-in or sign-up attempts from this network. Please wait and try again.",
            headers=exc.headers,
        ) from exc


async def release_code_delivery(reservation: DeliveryReservation) -> None:
    """Release capacity when no provider delivery was successfully attempted."""
    if IS_TEST_ENV or not reservation.keys:
        return
    client = await _client()
    try:
        await client.eval(_RELEASE_SCRIPT, len(reservation.keys), *reservation.keys)
    except Exception as exc:
        logger.warning("Authentication rate-limit release failed", exc_info=exc)


async def release_network_delivery(reservation: DeliveryReservation) -> None:
    """Release only shared-network capacity when no provider delivery occurred.

    Identifier request capacity remains consumed so the rate-limit response is
    identical whether or not an account or pending signup exists.
    """
    await release_code_delivery(DeliveryReservation(reservation.keys[3:]))


async def ensure_verification_available(request: Request, identifier: str) -> None:
    """Fail closed and enforce an existing five-attempt verification block."""
    if IS_TEST_ENV:
        return
    client = await _client()
    key = f"authrl:verify:{_digest('identifier', identifier.strip().lower())}"
    try:
        attempts = int(await client.get(key) or 0)
        ttl = int(await client.ttl(key)) if attempts >= 5 else 0
    except Exception as exc:
        logger.warning("Verification abuse check failed", exc_info=exc)
        raise HTTPException(
            status_code=503,
            detail="Sign-in services are temporarily unavailable. Please try again shortly.",
            headers={"Retry-After": "60"},
        ) from exc
    if attempts >= 5:
        raise _rate_limited(
            "Too many verification attempts. Request a new code.",
            ttl if ttl > 0 else 60,
        )


async def record_verification_failure(identifier: str) -> bool:
    """Record a bad code and return True when the fifth attempt is reached."""
    if IS_TEST_ENV:
        return False
    client = await _client()
    key = f"authrl:verify:{_digest('identifier', identifier.strip().lower())}"
    try:
        attempts = int(await client.eval(_VERIFICATION_FAILURE_SCRIPT, 1, key))
        return attempts >= 5
    except Exception as exc:
        logger.warning("Verification failure recording failed", exc_info=exc)
        raise HTTPException(
            status_code=503,
            detail="Sign-in services are temporarily unavailable. Please try again shortly.",
            headers={"Retry-After": "60"},
        ) from exc


async def clear_verification_failures(identifier: str) -> None:
    if IS_TEST_ENV:
        return
    client = await _client()
    key = f"authrl:verify:{_digest('identifier', identifier.strip().lower())}"
    try:
        await client.delete(key)
    except Exception as exc:
        logger.warning("Verification failure reset failed", exc_info=exc)
        raise HTTPException(
            status_code=503, detail="Sign-in services are temporarily unavailable."
        ) from exc


def _login_keys(request: Request, identifier: str) -> tuple[str, str, str]:
    composite = _digest("login", f"{identifier.strip().lower()}|{_client_ip(request)}")
    return (
        f"authrl:login:fail:{composite}",
        f"authrl:login:offense:{composite}",
        f"authrl:login:cooldown:{composite}",
    )


async def ensure_login_available(request: Request, identifier: str) -> None:
    if IS_TEST_ENV:
        return
    client = await _client()
    _, _, cooldown_key = _login_keys(request, identifier)
    try:
        ttl = int(await client.ttl(cooldown_key))
    except Exception as exc:
        logger.warning("Login abuse check failed", exc_info=exc)
        raise HTTPException(
            status_code=503, detail="Sign-in services are temporarily unavailable."
        ) from exc
    if ttl > 0:
        raise _rate_limited(
            f"Too many sign-in attempts. {_wait_message(ttl)}",
            ttl,
        )


async def record_login_failure(request: Request, identifier: str) -> None:
    if IS_TEST_ENV:
        return
    client = await _client()
    keys = _login_keys(request, identifier)
    try:
        _, cooldown = await client.eval(_LOGIN_FAILURE_SCRIPT, len(keys), *keys)
    except Exception as exc:
        logger.warning("Login failure recording failed", exc_info=exc)
        raise HTTPException(
            status_code=503, detail="Sign-in services are temporarily unavailable."
        ) from exc
    if int(cooldown) > 0:
        raise _rate_limited(
            f"Too many sign-in attempts. {_wait_message(int(cooldown))}",
            int(cooldown),
        )


async def clear_login_failures(request: Request, identifier: str) -> None:
    if IS_TEST_ENV:
        return
    client = await _client()
    keys = _login_keys(request, identifier)
    try:
        await client.delete(*keys)
    except Exception as exc:
        logger.warning("Login failure reset failed", exc_info=exc)
        raise HTTPException(
            status_code=503, detail="Sign-in services are temporarily unavailable."
        ) from exc


async def check_phone_rate_limit(
    request: Request,
    phone_number: str,
    limit_str: str = "10/minute",
) -> None:
    """Compatibility wrapper for callers not yet migrated to purpose limits."""
    del limit_str
    await ensure_verification_available(request, phone_number)
