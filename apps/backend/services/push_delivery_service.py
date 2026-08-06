"""Safe payload construction and transactional push-job enqueueing."""

from typing import Any, Mapping, Optional
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import DeviceToken, Notification, PushDeliveryJob


# Native payloads intentionally contain only identifiers needed by allowlisted
# client routes. Message text, user IDs, action URLs, and arbitrary metadata are
# never copied from the richer in-app notification record.
SAFE_DATA_KEYS = frozenset(
    {
        "league_id",
        "season_id",
        "session_id",
        "match_id",
        "message_id",
        "player_id",
        "sender_player_id",
        "request_id",
        "friend_request_id",
        "tournament_id",
        "award_id",
        "game_number",
    }
)
PRODUCTION_HOST = "beachleaguevb.com"


def safe_internal_link_url(value: object) -> Optional[str]:
    """Return a canonical internal route, never an arbitrary external URL."""
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw or len(raw) > 512:
        return None
    try:
        parsed = urlsplit(raw)
    except ValueError:
        return None

    if parsed.scheme or parsed.netloc:
        try:
            external = (
                parsed.scheme.lower() != "https"
                or parsed.hostname != PRODUCTION_HOST
                or parsed.username is not None
                or parsed.password is not None
                or parsed.port is not None
            )
        except ValueError:
            return None
        if external:
            return None
    if not parsed.path.startswith("/") or parsed.path.startswith("//"):
        return None

    canonical = parsed.path
    if parsed.query:
        canonical += f"?{parsed.query}"
    return canonical


def safe_domain_data(data: Optional[Mapping[str, Any]]) -> dict[str, str | int]:
    if not data:
        return {}
    safe: dict[str, str | int] = {}
    for key in SAFE_DATA_KEYS:
        value = data.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, int):
            safe[key] = value
        elif isinstance(value, str) and len(value) <= 128:
            safe[key] = value
    return safe


def build_safe_payload(
    notification: Notification,
    data: Optional[Mapping[str, Any]],
    *,
    push_title: Optional[str] = None,
    push_body: Optional[str] = None,
) -> dict[str, Any]:
    return {
        "title": push_title or notification.title,
        "body": push_body or notification.message,
        "data": {
            "notificationId": notification.id,
            "type": notification.type,
            "linkUrl": safe_internal_link_url(notification.link_url),
            "data": safe_domain_data(data),
        },
    }


async def enqueue_notification_jobs(
    session: AsyncSession,
    notification: Notification,
    data: Optional[Mapping[str, Any]],
    *,
    push_title: Optional[str] = None,
    push_body: Optional[str] = None,
    event_key: Optional[str] = None,
) -> int:
    """Create one idempotent job per currently registered installation."""
    tokens = list(
        (
            await session.execute(
                select(DeviceToken.id).where(DeviceToken.user_id == notification.user_id)
            )
        ).scalars()
    )
    if not tokens:
        return 0

    payload = build_safe_payload(
        notification,
        data,
        push_title=push_title,
        push_body=push_body,
    )
    logical_event = event_key or f"notification-{notification.id}"
    inserted = 0
    for device_token_id in tokens:
        result = await session.execute(
            insert(PushDeliveryJob)
            .values(
                user_id=notification.user_id,
                device_token_id=device_token_id,
                notification_id=notification.id,
                payload=payload,
                idempotency_key=(
                    f"notification:{notification.id}:event:{logical_event}:device:{device_token_id}"
                ),
            )
            .on_conflict_do_nothing(index_elements=[PushDeliveryJob.idempotency_key])
            .returning(PushDeliveryJob.id)
        )
        if result.scalar_one_or_none() is not None:
            inserted += 1
    return inserted
