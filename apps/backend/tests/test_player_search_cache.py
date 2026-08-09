"""
Unit tests for :mod:`backend.services.players.player_search_cache`.

Pure codec + Redis-wrapper behaviour. Redis itself is monkeypatched so these
run without a server and pin the graceful-degradation contract: a miss,
garbage, or a down Redis must all look like "no cache" to the caller.
"""

import pytest

from backend.services import player_search_cache as cache
from backend.services.players.player_search_cache import CallerNetworkSignals


def test_cache_key_is_per_caller_and_versioned():
    assert cache.cache_key(42) == f"picker:{cache.CACHE_VERSION}:caller=42"


def test_serialize_round_trip():
    net = {
        7: CallerNetworkSignals(is_friend=True, recent_opp_count=3),
        9: CallerNetworkSignals(is_fof=True, is_shared_league=True),
    }
    restored = cache.deserialize_network(cache.serialize_network(net))
    assert restored == net


@pytest.mark.parametrize(
    "bad",
    ["not json", "{}", "[[1,2]]", '[["x",0,0,0,0,0,0]]', "null", ""],
)
def test_deserialize_garbage_returns_none(bad):
    """A corrupt/old-shape payload is a cache miss, never an exception."""
    assert cache.deserialize_network(bad) is None


@pytest.mark.asyncio
async def test_load_returns_none_when_redis_down(monkeypatch):
    async def _down(_key):
        return None

    monkeypatch.setattr(cache.redis_service, "redis_get", _down)
    assert await cache.load_network(1) is None


@pytest.mark.asyncio
async def test_store_then_load_round_trips(monkeypatch):
    store: dict[str, str] = {}

    async def _set(key, value, expiry_seconds=None):
        store[key] = value
        return True

    async def _get(key):
        return store.get(key)

    monkeypatch.setattr(cache.redis_service, "redis_set", _set)
    monkeypatch.setattr(cache.redis_service, "redis_get", _get)

    net = {5: CallerNetworkSignals(is_friend=True, recent_session_count=2)}
    await cache.store_network(99, net)
    assert await cache.load_network(99) == net


@pytest.mark.asyncio
async def test_load_garbage_in_redis_returns_none(monkeypatch):
    async def _get(_key):
        return "corrupt-not-json"

    monkeypatch.setattr(cache.redis_service, "redis_get", _get)
    assert await cache.load_network(1) is None


@pytest.mark.asyncio
async def test_invalidate_deletes_each_distinct_caller(monkeypatch):
    deleted: list[str] = []

    async def _del(key):
        deleted.append(key)
        return True

    monkeypatch.setattr(cache.redis_service, "redis_delete", _del)
    await cache.invalidate([1, 2, 2, None, 3])
    assert sorted(deleted) == sorted(cache.cache_key(p) for p in (1, 2, 3))
