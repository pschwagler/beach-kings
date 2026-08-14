"""Queue helpers and readiness state for durable auth-code delivery."""

from __future__ import annotations

import os
import secrets

from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import AuthDeliveryJob
from backend.services.platform import redis_service


HEARTBEAT_KEY = "workers:auth-delivery:heartbeat"
HEARTBEAT_TTL_SECONDS = 30


def delivery_enabled() -> bool:
    return os.getenv("AUTH_DELIVERY_ENABLED", "true").lower() == "true"


async def enqueue_noop(
    session: AsyncSession,
    *,
    channel: str,
    purpose: str,
) -> None:
    """Persist a PII-free job so discovery-suppressed requests do equivalent work."""
    session.add(
        AuthDeliveryJob(
            verification_code_id=None,
            channel=channel,
            purpose=purpose,
            idempotency_key=f"auth-noop-{secrets.token_urlsafe(24)}",
        )
    )
    await session.commit()


async def publish_heartbeat() -> bool:
    try:
        client = await redis_service.get_redis_client()
        if client is None:
            return False
        await client.set(HEARTBEAT_KEY, "ready", ex=HEARTBEAT_TTL_SECONDS)
        return True
    except Exception:
        return False


async def heartbeat_is_fresh() -> bool:
    try:
        client = await redis_service.get_redis_client()
        return bool(client and await client.get(HEARTBEAT_KEY))
    except Exception:
        return False
