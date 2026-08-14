"""Unit tests for distributed authentication abuse controls."""

from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from backend.services.auth import rate_limiting_service


def _request(peer: str = "127.0.0.1", forwarded: str = "203.0.113.9") -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/auth/signup",
            "headers": [(b"x-forwarded-for", forwarded.encode())],
            "client": (peer, 1234),
        }
    )


@pytest.fixture(autouse=True)
def enable_controls(monkeypatch):
    monkeypatch.setattr(rate_limiting_service, "IS_TEST_ENV", False)


@pytest.mark.asyncio
async def test_delivery_limits_are_hashed_and_match_approved_sms_policy(monkeypatch):
    redis = AsyncMock()
    redis.eval.return_value = [1, 0, 0]
    monkeypatch.setattr(
        rate_limiting_service.redis_service,
        "get_redis_client",
        AsyncMock(return_value=redis),
    )

    reservation = await rate_limiting_service.reserve_code_delivery(
        _request(), "+15551234567", channel="sms"
    )

    call = redis.eval.await_args.args
    assert call[1] == 5
    assert list(call[7:]) == [1, 60, 5, 3600, 10, 86400, 60, 600, 300, 3600]
    assert all("+15551234567" not in key and "203.0.113.9" not in key for key in reservation.keys)


@pytest.mark.asyncio
async def test_password_work_limits_are_tournament_safe_and_ip_hashed(monkeypatch):
    redis = AsyncMock()
    redis.eval.return_value = [1, 0, 0]
    monkeypatch.setattr(
        rate_limiting_service.redis_service,
        "get_redis_client",
        AsyncMock(return_value=redis),
    )

    await rate_limiting_service.reserve_password_work(_request())

    call = redis.eval.await_args.args
    assert call[1] == 2
    assert list(call[4:]) == [300, 600, 2000, 3600]
    assert all("203.0.113.9" not in key for key in call[2:4])


@pytest.mark.asyncio
async def test_password_work_limit_has_readable_message(monkeypatch):
    redis = AsyncMock()
    redis.eval.return_value = [0, 75, 1]
    monkeypatch.setattr(
        rate_limiting_service.redis_service,
        "get_redis_client",
        AsyncMock(return_value=redis),
    )

    with pytest.raises(HTTPException) as error:
        await rate_limiting_service.reserve_password_work(_request())

    assert error.value.status_code == 429
    assert error.value.headers == {"Retry-After": "75"}
    assert "network" in error.value.detail


def test_untrusted_peer_cannot_spoof_forwarded_ip():
    assert (
        rate_limiting_service._client_ip(_request(peer="198.51.100.7", forwarded="203.0.113.9"))
        == "198.51.100.7"
    )


@pytest.mark.asyncio
async def test_network_delivery_limit_has_readable_retry(monkeypatch):
    redis = AsyncMock()
    redis.eval.return_value = [0, 125, 4]
    monkeypatch.setattr(
        rate_limiting_service.redis_service,
        "get_redis_client",
        AsyncMock(return_value=redis),
    )

    with pytest.raises(HTTPException) as error:
        await rate_limiting_service.reserve_code_delivery(
            _request(), "user@example.com", channel="email"
        )

    assert error.value.status_code == 429
    assert "from this network" in error.value.detail
    assert "3 minutes" in error.value.detail
    assert error.value.headers == {"Retry-After": "125"}


@pytest.mark.asyncio
async def test_no_recipient_releases_only_shared_network_capacity(monkeypatch):
    redis = AsyncMock()
    redis.eval.return_value = 1
    monkeypatch.setattr(
        rate_limiting_service.redis_service,
        "get_redis_client",
        AsyncMock(return_value=redis),
    )
    reservation = rate_limiting_service.DeliveryReservation(
        ("id-minute", "id-hour", "id-day", "ip-ten-minute", "ip-hour")
    )

    await rate_limiting_service.release_network_delivery(reservation)

    assert redis.eval.await_args.args[1:] == (2, "ip-ten-minute", "ip-hour")


@pytest.mark.asyncio
async def test_auth_controls_fail_closed_without_redis(monkeypatch):
    monkeypatch.setattr(
        rate_limiting_service.redis_service,
        "get_redis_client",
        AsyncMock(return_value=None),
    )

    with pytest.raises(HTTPException) as error:
        await rate_limiting_service.ensure_login_available(_request(), "user@example.com")

    assert error.value.status_code == 503
    assert "temporarily unavailable" in error.value.detail


@pytest.mark.asyncio
async def test_fifth_bad_code_exhausts_verification_attempts(monkeypatch):
    redis = AsyncMock()
    redis.eval.return_value = 5
    monkeypatch.setattr(
        rate_limiting_service.redis_service,
        "get_redis_client",
        AsyncMock(return_value=redis),
    )

    exhausted = await rate_limiting_service.record_verification_failure("user@example.com")

    assert exhausted is True
    key = redis.eval.await_args.args[2]
    assert "user@example.com" not in key


@pytest.mark.asyncio
async def test_existing_verification_block_requests_a_new_code(monkeypatch):
    redis = AsyncMock()
    redis.get.return_value = "5"
    redis.ttl.return_value = 480
    monkeypatch.setattr(
        rate_limiting_service.redis_service,
        "get_redis_client",
        AsyncMock(return_value=redis),
    )

    with pytest.raises(HTTPException) as error:
        await rate_limiting_service.ensure_verification_available(_request(), "+15551234567")

    assert error.value.status_code == 429
    assert error.value.detail == "Too many verification attempts. Request a new code."
    assert error.value.headers == {"Retry-After": "480"}


@pytest.mark.asyncio
async def test_fifth_password_failure_starts_escalating_cooldown(monkeypatch):
    redis = AsyncMock()
    redis.eval.return_value = [5, 900]
    monkeypatch.setattr(
        rate_limiting_service.redis_service,
        "get_redis_client",
        AsyncMock(return_value=redis),
    )

    with pytest.raises(HTTPException) as error:
        await rate_limiting_service.record_login_failure(_request(), "user@example.com")

    assert error.value.status_code == 429
    assert error.value.headers == {"Retry-After": "900"}
    assert all("user@example.com" not in key for key in redis.eval.await_args.args[2:])
