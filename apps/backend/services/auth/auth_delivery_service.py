"""Queue helpers and readiness state for durable auth-code delivery."""

from __future__ import annotations

import os
import secrets

from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import AuthDeliveryJob
from backend.services.platform import redis_service, release_metadata


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
        await client.set(
            HEARTBEAT_KEY,
            release_metadata.readiness_generation(),
            ex=HEARTBEAT_TTL_SECONDS,
        )
        return True
    except Exception:
        return False


async def heartbeat_is_fresh(expected_generation: str | None = None) -> bool:
    try:
        client = await redis_service.get_redis_client()
        if client is None:
            return False
        expected = expected_generation or release_metadata.readiness_generation()
        return bool(await client.get(HEARTBEAT_KEY) == expected)
    except Exception:
        return False
