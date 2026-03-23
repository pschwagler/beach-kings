"""
Tests for redis_service — singleton client, convenience operations, and failure paths.

All tests mock the underlying redis.asyncio.Redis to avoid requiring a live Redis server.
The module-level singleton (_redis_client, _connection_tested) is reset before each test
to provide clean state.
"""

import pytest
from unittest.mock import AsyncMock, patch

import backend.services.redis_service as redis_service


# ============================================================================
# Helpers
# ============================================================================


def _reset_singleton():
    """Reset the module-level Redis singleton to a clean state."""
    redis_service._redis_client = None
    redis_service._connection_tested = False


# ============================================================================
# get_redis_client — singleton behaviour
# ============================================================================


@pytest.mark.asyncio
async def test_get_redis_client_returns_client_on_success():
    """get_redis_client() creates a client and returns it when ping succeeds."""
    _reset_singleton()

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(return_value=True)

    with patch("backend.services.redis_service.Redis", return_value=mock_client):
        client = await redis_service.get_redis_client()

    assert client is mock_client
    assert redis_service._connection_tested is True


@pytest.mark.asyncio
async def test_get_redis_client_returns_same_instance_on_second_call():
    """get_redis_client() returns the singleton on repeated calls (no re-create)."""
    _reset_singleton()

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(return_value=True)

    with patch("backend.services.redis_service.Redis", return_value=mock_client) as mock_redis_cls:
        first = await redis_service.get_redis_client()
        second = await redis_service.get_redis_client()

    assert first is second
    # Redis() constructor should only be called once
    assert mock_redis_cls.call_count == 1


@pytest.mark.asyncio
async def test_get_redis_client_returns_none_on_connection_failure():
    """get_redis_client() returns None and resets state when ping raises."""
    _reset_singleton()

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(side_effect=ConnectionRefusedError("refused"))

    with patch("backend.services.redis_service.Redis", return_value=mock_client):
        client = await redis_service.get_redis_client()

    assert client is None
    assert redis_service._redis_client is None
    assert redis_service._connection_tested is False


@pytest.mark.asyncio
async def test_get_redis_client_returns_none_when_redis_unavailable():
    """get_redis_client() returns None when Redis library is not installed."""
    _reset_singleton()

    with patch("backend.services.redis_service.Redis", None):
        client = await redis_service.get_redis_client()

    assert client is None


@pytest.mark.asyncio
async def test_get_redis_client_recreates_after_lost_connection():
    """When the cached client's ping fails, a new client is created."""
    _reset_singleton()

    # First client: ping fails on recheck
    stale_client = AsyncMock()
    stale_client.ping = AsyncMock(side_effect=ConnectionError("lost"))
    stale_client.close = AsyncMock()

    redis_service._redis_client = stale_client
    redis_service._connection_tested = True

    # New client that succeeds
    fresh_client = AsyncMock()
    fresh_client.ping = AsyncMock(return_value=True)

    with patch("backend.services.redis_service.Redis", return_value=fresh_client):
        client = await redis_service.get_redis_client()

    assert client is fresh_client


# ============================================================================
# redis_get
# ============================================================================


@pytest.mark.asyncio
async def test_redis_get_returns_value():
    """redis_get() returns the value from the Redis client."""
    _reset_singleton()

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(return_value=True)
    mock_client.get = AsyncMock(return_value="cached_value")

    with patch("backend.services.redis_service.Redis", return_value=mock_client):
        result = await redis_service.redis_get("some:key")

    assert result == "cached_value"
    mock_client.get.assert_awaited_once_with("some:key")


@pytest.mark.asyncio
async def test_redis_get_returns_none_when_key_missing():
    """redis_get() returns None when the key does not exist."""
    _reset_singleton()

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(return_value=True)
    mock_client.get = AsyncMock(return_value=None)

    with patch("backend.services.redis_service.Redis", return_value=mock_client):
        result = await redis_service.redis_get("nonexistent:key")

    assert result is None


@pytest.mark.asyncio
async def test_redis_get_returns_none_when_client_is_none():
    """redis_get() returns None gracefully when no Redis client is available."""
    _reset_singleton()

    with patch("backend.services.redis_service.Redis", None):
        result = await redis_service.redis_get("any:key")

    assert result is None


@pytest.mark.asyncio
async def test_redis_get_returns_none_on_exception():
    """redis_get() returns None and does not raise when client.get raises."""
    _reset_singleton()

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(return_value=True)
    mock_client.get = AsyncMock(side_effect=Exception("timeout"))

    with patch("backend.services.redis_service.Redis", return_value=mock_client):
        result = await redis_service.redis_get("bad:key")

    assert result is None


# ============================================================================
# redis_set
# ============================================================================


@pytest.mark.asyncio
async def test_redis_set_without_expiry():
    """redis_set() calls client.set when no expiry is provided."""
    _reset_singleton()

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(return_value=True)
    mock_client.set = AsyncMock()

    with patch("backend.services.redis_service.Redis", return_value=mock_client):
        result = await redis_service.redis_set("my:key", "my_value")

    assert result is True
    mock_client.set.assert_awaited_once_with("my:key", "my_value")


@pytest.mark.asyncio
async def test_redis_set_with_expiry():
    """redis_set() calls client.setex when expiry_seconds is provided."""
    _reset_singleton()

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(return_value=True)
    mock_client.setex = AsyncMock()

    with patch("backend.services.redis_service.Redis", return_value=mock_client):
        result = await redis_service.redis_set("ttl:key", "value", expiry_seconds=300)

    assert result is True
    mock_client.setex.assert_awaited_once_with("ttl:key", 300, "value")


@pytest.mark.asyncio
async def test_redis_set_returns_false_on_exception():
    """redis_set() returns False when client raises."""
    _reset_singleton()

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(return_value=True)
    mock_client.set = AsyncMock(side_effect=Exception("write error"))

    with patch("backend.services.redis_service.Redis", return_value=mock_client):
        result = await redis_service.redis_set("fail:key", "value")

    assert result is False


@pytest.mark.asyncio
async def test_redis_set_returns_false_when_no_client():
    """redis_set() returns False when Redis is unavailable."""
    _reset_singleton()

    with patch("backend.services.redis_service.Redis", None):
        result = await redis_service.redis_set("key", "value")

    assert result is False


# ============================================================================
# redis_delete
# ============================================================================


@pytest.mark.asyncio
async def test_redis_delete_success():
    """redis_delete() calls client.delete and returns True."""
    _reset_singleton()

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(return_value=True)
    mock_client.delete = AsyncMock(return_value=1)

    with patch("backend.services.redis_service.Redis", return_value=mock_client):
        result = await redis_service.redis_delete("del:key")

    assert result is True
    mock_client.delete.assert_awaited_once_with("del:key")


@pytest.mark.asyncio
async def test_redis_delete_returns_false_on_exception():
    """redis_delete() returns False when client raises."""
    _reset_singleton()

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(return_value=True)
    mock_client.delete = AsyncMock(side_effect=Exception("delete error"))

    with patch("backend.services.redis_service.Redis", return_value=mock_client):
        result = await redis_service.redis_delete("err:key")

    assert result is False


@pytest.mark.asyncio
async def test_redis_delete_returns_false_when_no_client():
    """redis_delete() returns False when Redis is unavailable."""
    _reset_singleton()

    with patch("backend.services.redis_service.Redis", None):
        result = await redis_service.redis_delete("key")

    assert result is False


# ============================================================================
# redis_exists
# ============================================================================


@pytest.mark.asyncio
async def test_redis_exists_returns_true_when_key_present():
    """redis_exists() returns True when client.exists returns a positive count."""
    _reset_singleton()

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(return_value=True)
    mock_client.exists = AsyncMock(return_value=1)

    with patch("backend.services.redis_service.Redis", return_value=mock_client):
        result = await redis_service.redis_exists("present:key")

    assert result is True


@pytest.mark.asyncio
async def test_redis_exists_returns_false_when_key_absent():
    """redis_exists() returns False when client.exists returns 0."""
    _reset_singleton()

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(return_value=True)
    mock_client.exists = AsyncMock(return_value=0)

    with patch("backend.services.redis_service.Redis", return_value=mock_client):
        result = await redis_service.redis_exists("absent:key")

    assert result is False


@pytest.mark.asyncio
async def test_redis_exists_returns_false_on_exception():
    """redis_exists() returns False when client raises."""
    _reset_singleton()

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(return_value=True)
    mock_client.exists = AsyncMock(side_effect=Exception("exists error"))

    with patch("backend.services.redis_service.Redis", return_value=mock_client):
        result = await redis_service.redis_exists("err:key")

    assert result is False


# ============================================================================
# is_redis_available
# ============================================================================


@pytest.mark.asyncio
async def test_is_redis_available_true():
    """is_redis_available() returns True when client is reachable."""
    _reset_singleton()

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(return_value=True)

    with patch("backend.services.redis_service.Redis", return_value=mock_client):
        result = await redis_service.is_redis_available()

    assert result is True


@pytest.mark.asyncio
async def test_is_redis_available_false_when_unavailable():
    """is_redis_available() returns False when Redis library is absent."""
    _reset_singleton()

    with patch("backend.services.redis_service.Redis", None):
        result = await redis_service.is_redis_available()

    assert result is False


# ============================================================================
# close_redis_connection
# ============================================================================


@pytest.mark.asyncio
async def test_close_redis_connection_resets_singleton():
    """close_redis_connection() closes the client and resets the singleton."""
    _reset_singleton()

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(return_value=True)
    mock_client.close = AsyncMock()

    with patch("backend.services.redis_service.Redis", return_value=mock_client):
        await redis_service.get_redis_client()

    assert redis_service._redis_client is not None

    await redis_service.close_redis_connection()

    assert redis_service._redis_client is None
    assert redis_service._connection_tested is False
    mock_client.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_close_redis_connection_noop_when_already_none():
    """close_redis_connection() is a no-op when no client exists."""
    _reset_singleton()

    # Should not raise
    await redis_service.close_redis_connection()

    assert redis_service._redis_client is None
