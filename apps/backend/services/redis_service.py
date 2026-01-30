"""
Redis service providing a centralized Redis client singleton.

This service manages the Redis connection lifecycle and provides a consistent
interface for all services that need Redis access. Unlike SQLAlchemy sessions
which are transactional and request-scoped, Redis connections are stateless
with built-in connection pooling, making a singleton appropriate.

Usage:
    from backend.services.redis_service import get_redis_client
    
    async def my_function():
        redis = await get_redis_client()
        if redis:
            await redis.set("key", "value")
"""

import logging
import os
from typing import Optional

# Optional Redis import - will be None if not installed
try:
    from redis.asyncio import Redis
except ImportError:
    Redis = None  # type: ignore

logger = logging.getLogger(__name__)

# Redis configuration from environment
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)

# Connection settings
SOCKET_CONNECT_TIMEOUT = 2
SOCKET_TIMEOUT = 5
RETRY_ON_TIMEOUT = True

# Global Redis client (singleton)
_redis_client: Optional[Redis] = None
_connection_tested: bool = False


async def get_redis_client() -> Optional[Redis]:
    """
    Get or create the Redis client singleton.
    
    Returns a shared Redis client instance. The client is created on first call
    and reused for subsequent calls. Connection is tested on first use.
    
    Returns:
        Redis client or None if connection fails or Redis is not available
        
    Example:
        redis = await get_redis_client()
        if redis:
            await redis.set("key", "value", ex=300)  # 5 min TTL
            value = await redis.get("key")
    """
    global _redis_client, _connection_tested
    
    # Return existing client if connection was already tested
    if _redis_client is not None and _connection_tested:
        try:
            await _redis_client.ping()
            return _redis_client
        except Exception as e:
            logger.warning(f"Redis connection lost, recreating client: {e}")
            await _close_client()
    
    # Check if Redis library is available
    if Redis is None:
        logger.debug("Redis library not available. Redis features disabled.")
        return None
    
    # Create new client
    try:
        client_kwargs = {
            "host": REDIS_HOST,
            "port": REDIS_PORT,
            "db": REDIS_DB,
            "decode_responses": True,
            "socket_connect_timeout": SOCKET_CONNECT_TIMEOUT,
            "socket_timeout": SOCKET_TIMEOUT,
            "retry_on_timeout": RETRY_ON_TIMEOUT,
        }
        
        if REDIS_PASSWORD:
            client_kwargs["password"] = REDIS_PASSWORD
        
        _redis_client = Redis(**client_kwargs)
        
        # Test connection
        await _redis_client.ping()
        _connection_tested = True
        logger.info(f"Connected to Redis at {REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}")
        return _redis_client
        
    except Exception as e:
        logger.warning(f"Failed to connect to Redis at {REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}: {e}")
        _redis_client = None
        _connection_tested = False
        return None


async def _close_client() -> None:
    """Internal helper to close and reset the client."""
    global _redis_client, _connection_tested
    
    if _redis_client is not None:
        try:
            await _redis_client.close()
        except Exception:
            pass
        _redis_client = None
    _connection_tested = False


async def close_redis_connection() -> None:
    """
    Close the Redis connection.
    
    Should be called during application shutdown to cleanly close the connection.
    
    Example (in FastAPI lifespan):
        @asynccontextmanager
        async def lifespan(app: FastAPI):
            yield
            await close_redis_connection()
    """
    global _redis_client, _connection_tested
    
    if _redis_client is not None:
        try:
            await _redis_client.close()
            logger.info("Closed Redis connection")
        except Exception as e:
            logger.warning(f"Error closing Redis connection: {e}")
        finally:
            _redis_client = None
            _connection_tested = False


async def is_redis_available() -> bool:
    """
    Check if Redis is available and connected.
    
    Returns:
        True if Redis client is available and responding to ping
    """
    try:
        client = await get_redis_client()
        return client is not None
    except Exception:
        return False


# ============================================================================
# Convenience functions for common operations
# ============================================================================

async def redis_get(key: str) -> Optional[str]:
    """
    Get a value from Redis.
    
    Args:
        key: The key to retrieve
        
    Returns:
        The value or None if not found or Redis unavailable
    """
    try:
        client = await get_redis_client()
        if client:
            return await client.get(key)
    except Exception as e:
        logger.warning(f"Redis GET error for key {key}: {e}")
    return None


async def redis_set(
    key: str, 
    value: str, 
    expiry_seconds: Optional[int] = None
) -> bool:
    """
    Set a value in Redis with optional expiry.
    
    Args:
        key: The key to set
        value: The value to store
        expiry_seconds: Optional TTL in seconds
        
    Returns:
        True if successful, False otherwise
    """
    try:
        client = await get_redis_client()
        if client:
            if expiry_seconds:
                await client.setex(key, expiry_seconds, value)
            else:
                await client.set(key, value)
            return True
    except Exception as e:
        logger.warning(f"Redis SET error for key {key}: {e}")
    return False


async def redis_delete(key: str) -> bool:
    """
    Delete a key from Redis.
    
    Args:
        key: The key to delete
        
    Returns:
        True if successful, False otherwise
    """
    try:
        client = await get_redis_client()
        if client:
            await client.delete(key)
            return True
    except Exception as e:
        logger.warning(f"Redis DELETE error for key {key}: {e}")
    return False


async def redis_exists(key: str) -> bool:
    """
    Check if a key exists in Redis.
    
    Args:
        key: The key to check
        
    Returns:
        True if key exists, False otherwise
    """
    try:
        client = await get_redis_client()
        if client:
            return await client.exists(key) > 0
    except Exception as e:
        logger.warning(f"Redis EXISTS error for key {key}: {e}")
    return False
