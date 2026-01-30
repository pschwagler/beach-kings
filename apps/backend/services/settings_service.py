"""
Settings service for runtime configuration with database overrides.

Supports checking database settings first, then falling back to environment variables.
Uses Redis for distributed caching across instances.
"""

import os
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from backend.services import data_service
from backend.services import redis_service
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

# Settings-specific configuration
CACHE_TTL_SECONDS = 60  # Cache settings for 60 seconds
REDIS_KEY_PREFIX = "settings:"


def get_bool_env(key: str, default: bool = True) -> bool:
    """
    Parse a boolean environment variable from a string value.
    
    Args:
        key: Environment variable name
        default: Default value if the variable is not set
        
    Returns:
        bool: Parsed boolean value
    """
    value = os.getenv(key)
    if value is None:
        return default
    return value.lower() in ("true", "1", "yes")


def _make_redis_key(key: str) -> str:
    """Create the Redis key for a setting."""
    return f"{REDIS_KEY_PREFIX}{key}"


async def _get_cached_setting(key: str) -> Optional[str]:
    """Get cached setting value from Redis."""
    redis_key = _make_redis_key(key)
    return await redis_service.redis_get(redis_key)


async def _set_cached_setting(key: str, value: Optional[str]):
    """Cache a setting value in Redis with TTL."""
    redis_key = _make_redis_key(key)
    if value is not None:
        await redis_service.redis_set(redis_key, value, CACHE_TTL_SECONDS)
    else:
        await redis_service.redis_delete(redis_key)


async def _clear_cache():
    """Clear all cached settings from Redis."""
    try:
        redis_client = await redis_service.get_redis_client()
        if redis_client is None:
            return
        
        # Find all keys with the settings prefix
        pattern = f"{REDIS_KEY_PREFIX}*"
        keys = []
        async for key in redis_client.scan_iter(match=pattern):
            keys.append(key)
        
        if keys:
            await redis_client.delete(*keys)
            logger.info(f"Cleared {len(keys)} cached settings from Redis")
    except Exception as e:
        logger.warning(f"Error clearing cache from Redis: {e}")


async def get_setting_with_fallback(
    session: Optional[AsyncSession],
    key: str,
    env_var: Optional[str] = None,
    default: Optional[str] = None,
    fallback_to_cache: bool = True
) -> Optional[str]:
    """
    Get a setting value from database first, then env var, then default.
    
    Args:
        session: Database session (optional)
        key: Setting key in database
        env_var: Environment variable name to fall back to
        default: Default value if neither database nor env var is set
        fallback_to_cache: If True and no session, use cache
        
    Returns:
        Setting value as string, or None
    """
    # Try database first if session is available
    if session:
        try:
            value = await data_service.get_setting(session, key)
            if value is not None:
                # Cache the value in Redis
                await _set_cached_setting(key, value)
                return value
        except Exception as e:
            logger.warning(f"Error reading setting {key} from database: {e}")
    
    # Try cache if session not available or database failed
    if fallback_to_cache:
        cached = await _get_cached_setting(key)
        if cached is not None:
            return cached
    
    # Fall back to environment variable
    if env_var:
        value = os.getenv(env_var)
        if value is not None:
            return value
    
    # Return default
    return default


async def get_bool_setting(
    session: Optional[AsyncSession],
    key: str,
    env_var: Optional[str] = None,
    default: bool = True,
    fallback_to_cache: bool = True
) -> bool:
    """
    Get a boolean setting value.
    
    Args:
        session: Database session (optional)
        key: Setting key in database
        env_var: Environment variable name to fall back to
        default: Default value if neither database nor env var is set
        fallback_to_cache: If True and no session, use cache
        
    Returns:
        bool: Setting value as boolean
    """
    value = await get_setting_with_fallback(session, key, env_var, None, fallback_to_cache)
    
    if value is None:
        return default
    
    # Parse boolean string
    return value.lower() in ("true", "1", "yes")


async def get_float_setting(
    session: Optional[AsyncSession],
    key: str,
    env_var: Optional[str] = None,
    default: Optional[float] = None,
    fallback_to_cache: bool = True
) -> Optional[float]:
    """
    Get a float setting value.
    
    Args:
        session: Database session (optional)
        key: Setting key in database
        env_var: Environment variable name to fall back to
        default: Default value if neither database nor env var is set
        fallback_to_cache: If True and no session, use cache
        
    Returns:
        float: Setting value as float, or default
    """
    value = await get_setting_with_fallback(session, key, env_var, None, fallback_to_cache)
    
    if value is None:
        return default
    
    try:
        return float(value)
    except (ValueError, TypeError):
        logger.warning(f"Invalid float value for setting {key}: {value}")
        return default


async def invalidate_settings_cache():
    """Invalidate the settings cache (call after updating settings)."""
    await _clear_cache()


async def close_redis_connection():
    """
    Close Redis connection (call on application shutdown).
    
    Note: This delegates to the centralized redis_service.
    Kept for backwards compatibility with existing shutdown code.
    """
    await redis_service.close_redis_connection()
