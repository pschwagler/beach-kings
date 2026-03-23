"""
Tests for settings_service — get_bool_env, get_setting_with_fallback, get_bool_setting,
get_float_setting, and cache invalidation.

Dependencies (redis_service and data_service) are fully mocked so no database or Redis
connection is required.
"""

import os
import pytest
from unittest.mock import AsyncMock, patch

from backend.services import settings_service


# ============================================================================
# get_bool_env helper
# ============================================================================


class TestGetBoolEnv:
    """Tests for settings_service.get_bool_env()."""

    def test_true_variants(self, monkeypatch):
        """'true', '1', 'yes' (any case) → True."""
        for val in ("true", "True", "TRUE", "1", "yes", "YES"):
            monkeypatch.setenv("SETTINGS_BOOL_KEY", val)
            assert settings_service.get_bool_env("SETTINGS_BOOL_KEY") is True

    def test_false_variants(self, monkeypatch):
        """'false', '0', 'no' and arbitrary strings → False."""
        for val in ("false", "False", "0", "no", "NO", "off", ""):
            monkeypatch.setenv("SETTINGS_BOOL_KEY", val)
            assert settings_service.get_bool_env("SETTINGS_BOOL_KEY") is False

    def test_missing_key_default_true(self, monkeypatch):
        """Unset variable returns the default=True."""
        monkeypatch.delenv("SETTINGS_BOOL_KEY", raising=False)
        assert settings_service.get_bool_env("SETTINGS_BOOL_KEY", default=True) is True

    def test_missing_key_default_false(self, monkeypatch):
        """Unset variable returns the provided default=False."""
        monkeypatch.delenv("SETTINGS_BOOL_KEY", raising=False)
        assert settings_service.get_bool_env("SETTINGS_BOOL_KEY", default=False) is False


# ============================================================================
# get_setting_with_fallback
# ============================================================================


@pytest.mark.asyncio
async def test_get_setting_cache_hit_skips_db():
    """Cache hit returns the cached value without touching data_service."""
    with patch.object(
        settings_service.redis_service,
        "redis_get",
        new_callable=AsyncMock,
        return_value="cached_val",
    ) as mock_redis_get, patch.object(
        settings_service.data_service,
        "get_setting",
        new_callable=AsyncMock,
    ) as mock_db:
        # No session — falls straight to cache path
        result = await settings_service.get_setting_with_fallback(
            session=None, key="my_key", fallback_to_cache=True
        )

    assert result == "cached_val"
    mock_redis_get.assert_awaited_once()
    mock_db.assert_not_awaited()


@pytest.mark.asyncio
async def test_get_setting_db_hit_caches_value():
    """DB hit → value returned and written to Redis cache."""
    mock_session = AsyncMock()

    with patch.object(
        settings_service.data_service,
        "get_setting",
        new_callable=AsyncMock,
        return_value="db_value",
    ), patch.object(
        settings_service.redis_service,
        "redis_set",
        new_callable=AsyncMock,
    ) as mock_redis_set:
        result = await settings_service.get_setting_with_fallback(
            session=mock_session, key="my_key"
        )

    assert result == "db_value"
    mock_redis_set.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_setting_cache_miss_then_db_miss_falls_back_to_env(monkeypatch):
    """Cache miss + DB miss → falls back to env var."""
    monkeypatch.setenv("MY_ENV_KEY", "from_env")

    with patch.object(
        settings_service.redis_service,
        "redis_get",
        new_callable=AsyncMock,
        return_value=None,
    ), patch.object(
        settings_service.data_service,
        "get_setting",
        new_callable=AsyncMock,
        return_value=None,
    ):
        result = await settings_service.get_setting_with_fallback(
            session=AsyncMock(),
            key="missing_key",
            env_var="MY_ENV_KEY",
            fallback_to_cache=True,
        )

    assert result == "from_env"


@pytest.mark.asyncio
async def test_get_setting_all_miss_returns_default():
    """Cache miss + DB miss + no env var → returns the provided default."""
    with patch.object(
        settings_service.redis_service,
        "redis_get",
        new_callable=AsyncMock,
        return_value=None,
    ), patch.object(
        settings_service.data_service,
        "get_setting",
        new_callable=AsyncMock,
        return_value=None,
    ):
        result = await settings_service.get_setting_with_fallback(
            session=AsyncMock(),
            key="ghost_key",
            default="my_default",
            fallback_to_cache=True,
        )

    assert result == "my_default"


@pytest.mark.asyncio
async def test_get_setting_no_session_uses_cache():
    """Without a session, cache is checked when fallback_to_cache=True."""
    with patch.object(
        settings_service.redis_service,
        "redis_get",
        new_callable=AsyncMock,
        return_value="cached_no_session",
    ):
        result = await settings_service.get_setting_with_fallback(
            session=None,
            key="some_key",
            fallback_to_cache=True,
        )

    assert result == "cached_no_session"


@pytest.mark.asyncio
async def test_get_setting_db_error_falls_to_cache():
    """DB exception → falls through to cache (if available)."""
    with patch.object(
        settings_service.data_service,
        "get_setting",
        new_callable=AsyncMock,
        side_effect=RuntimeError("db error"),
    ), patch.object(
        settings_service.redis_service,
        "redis_get",
        new_callable=AsyncMock,
        return_value="fallback_cache",
    ):
        result = await settings_service.get_setting_with_fallback(
            session=AsyncMock(),
            key="error_key",
            fallback_to_cache=True,
        )

    assert result == "fallback_cache"


# ============================================================================
# get_bool_setting
# ============================================================================


@pytest.mark.asyncio
async def test_get_bool_setting_true_string():
    """DB returns 'true' → get_bool_setting returns True."""
    with patch.object(
        settings_service.data_service,
        "get_setting",
        new_callable=AsyncMock,
        return_value="true",
    ), patch.object(
        settings_service.redis_service,
        "redis_set",
        new_callable=AsyncMock,
    ):
        result = await settings_service.get_bool_setting(
            session=AsyncMock(), key="feature_flag"
        )

    assert result is True


@pytest.mark.asyncio
async def test_get_bool_setting_false_string():
    """DB returns 'false' → get_bool_setting returns False."""
    with patch.object(
        settings_service.data_service,
        "get_setting",
        new_callable=AsyncMock,
        return_value="false",
    ), patch.object(
        settings_service.redis_service,
        "redis_set",
        new_callable=AsyncMock,
    ):
        result = await settings_service.get_bool_setting(
            session=AsyncMock(), key="feature_flag"
        )

    assert result is False


@pytest.mark.asyncio
async def test_get_bool_setting_none_returns_default():
    """No value found → returns the provided default."""
    with patch.object(
        settings_service.redis_service,
        "redis_get",
        new_callable=AsyncMock,
        return_value=None,
    ), patch.object(
        settings_service.data_service,
        "get_setting",
        new_callable=AsyncMock,
        return_value=None,
    ):
        result = await settings_service.get_bool_setting(
            session=AsyncMock(), key="absent_flag", default=True
        )

    assert result is True


@pytest.mark.asyncio
async def test_get_bool_setting_yes_string():
    """'yes' string → True."""
    with patch.object(
        settings_service.data_service,
        "get_setting",
        new_callable=AsyncMock,
        return_value="yes",
    ), patch.object(
        settings_service.redis_service,
        "redis_set",
        new_callable=AsyncMock,
    ):
        result = await settings_service.get_bool_setting(
            session=AsyncMock(), key="some_flag"
        )

    assert result is True


# ============================================================================
# get_float_setting
# ============================================================================


@pytest.mark.asyncio
async def test_get_float_setting_valid_value():
    """DB returns '3.14' → get_float_setting returns 3.14."""
    with patch.object(
        settings_service.data_service,
        "get_setting",
        new_callable=AsyncMock,
        return_value="3.14",
    ), patch.object(
        settings_service.redis_service,
        "redis_set",
        new_callable=AsyncMock,
    ):
        result = await settings_service.get_float_setting(
            session=AsyncMock(), key="elo_k_factor"
        )

    assert result == pytest.approx(3.14)


@pytest.mark.asyncio
async def test_get_float_setting_invalid_value_returns_default():
    """Non-numeric DB value → returns the provided default."""
    with patch.object(
        settings_service.data_service,
        "get_setting",
        new_callable=AsyncMock,
        return_value="not_a_number",
    ), patch.object(
        settings_service.redis_service,
        "redis_set",
        new_callable=AsyncMock,
    ):
        result = await settings_service.get_float_setting(
            session=AsyncMock(), key="bad_float", default=1.5
        )

    assert result == pytest.approx(1.5)


@pytest.mark.asyncio
async def test_get_float_setting_none_returns_default():
    """No value found → returns the default."""
    with patch.object(
        settings_service.redis_service,
        "redis_get",
        new_callable=AsyncMock,
        return_value=None,
    ), patch.object(
        settings_service.data_service,
        "get_setting",
        new_callable=AsyncMock,
        return_value=None,
    ):
        result = await settings_service.get_float_setting(
            session=AsyncMock(), key="missing_float", default=2.0
        )

    assert result == pytest.approx(2.0)


# ============================================================================
# invalidate_settings_cache
# ============================================================================


@pytest.mark.asyncio
async def test_invalidate_settings_cache_calls_clear():
    """invalidate_settings_cache() delegates to _clear_cache which scans Redis."""
    mock_client = AsyncMock()

    # Simulate scan_iter yielding one key then stopping
    async def _fake_scan(match):
        yield "settings:enable_email"

    mock_client.scan_iter = _fake_scan
    mock_client.delete = AsyncMock()

    with patch.object(
        settings_service.redis_service,
        "get_redis_client",
        new_callable=AsyncMock,
        return_value=mock_client,
    ):
        await settings_service.invalidate_settings_cache()

    mock_client.delete.assert_awaited_once_with("settings:enable_email")


@pytest.mark.asyncio
async def test_invalidate_settings_cache_noop_when_no_redis():
    """invalidate_settings_cache() silently does nothing when Redis is unavailable."""
    with patch.object(
        settings_service.redis_service,
        "get_redis_client",
        new_callable=AsyncMock,
        return_value=None,
    ):
        # Should not raise
        await settings_service.invalidate_settings_cache()
