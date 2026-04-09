"""
Push notification service for sending Expo push notifications.

Handles device token CRUD and delivery via the Expo Push API.
"""

import logging
from typing import List, Optional, Dict

import httpx
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import DeviceToken

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def register_token(
    session: AsyncSession,
    user_id: int,
    token: str,
    platform: str,
) -> DeviceToken:
    """Register or update a device push token for a user.

    Uses an upsert so the same physical token is never duplicated.
    If the token already exists for a *different* user (e.g. after logout/login
    on the same device), ownership is transferred to the current user.

    Args:
        session: Database session.
        user_id: Owner of the token.
        token: Expo push token string.
        platform: ``"ios"`` or ``"android"``.

    Returns:
        The persisted ``DeviceToken`` row.
    """
    stmt = (
        pg_insert(DeviceToken)
        .values(user_id=user_id, token=token, platform=platform)
        .on_conflict_do_update(
            constraint="uq_device_tokens_token",
            set_={"user_id": user_id, "platform": platform},
        )
        .returning(DeviceToken)
    )
    result = await session.execute(stmt)
    await session.commit()
    row = result.scalar_one()
    return row


async def unregister_token(
    session: AsyncSession,
    user_id: int,
    token: str,
) -> bool:
    """Remove a device token for a user.

    Only deletes if the token belongs to the requesting user.

    Args:
        session: Database session.
        user_id: The user requesting removal.
        token: The Expo push token to remove.

    Returns:
        ``True`` if a row was deleted, ``False`` otherwise.
    """
    stmt = (
        delete(DeviceToken)
        .where(DeviceToken.user_id == user_id, DeviceToken.token == token)
    )
    result = await session.execute(stmt)
    await session.commit()
    return result.rowcount > 0


async def unregister_all_tokens(
    session: AsyncSession,
    user_id: int,
) -> int:
    """Remove all device tokens for a user (e.g. on account deletion).

    Args:
        session: Database session.
        user_id: The user whose tokens should be removed.

    Returns:
        Number of rows deleted.
    """
    stmt = delete(DeviceToken).where(DeviceToken.user_id == user_id)
    result = await session.execute(stmt)
    await session.commit()
    return result.rowcount


async def get_tokens_for_user(
    session: AsyncSession,
    user_id: int,
) -> List[DeviceToken]:
    """Fetch all registered device tokens for a user.

    Args:
        session: Database session.
        user_id: The user to look up.

    Returns:
        List of ``DeviceToken`` rows.
    """
    stmt = select(DeviceToken).where(DeviceToken.user_id == user_id)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def send_push_notifications(
    tokens: List[str],
    title: str,
    body: str,
    data: Optional[Dict] = None,
) -> None:
    """Send push notifications via the Expo Push API.

    Batches messages and fires them in a single HTTP request.
    Failures are logged but never raised — push delivery is best-effort
    and must not block the caller.

    Args:
        tokens: List of Expo push token strings.
        title: Notification title.
        body: Notification body text.
        data: Optional JSON payload delivered to the client.
    """
    if not tokens:
        return

    messages = [
        {
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
            **({"data": data} if data else {}),
        }
        for token in tokens
    ]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
            )
            if response.status_code != 200:
                logger.error(
                    "Expo Push API returned %d: %s",
                    response.status_code,
                    response.text,
                )
            else:
                resp_data = response.json()
                errors = [
                    ticket
                    for ticket in resp_data.get("data", [])
                    if ticket.get("status") == "error"
                ]
                if errors:
                    logger.warning("Expo push errors: %s", errors)
    except Exception:
        logger.exception("Failed to send push notifications")


async def send_push_to_user(
    session: AsyncSession,
    user_id: int,
    title: str,
    body: str,
    data: Optional[Dict] = None,
) -> None:
    """Convenience: look up a user's tokens and send a push notification.

    Args:
        session: Database session.
        user_id: Target user.
        title: Notification title.
        body: Notification body text.
        data: Optional JSON payload.
    """
    device_tokens = await get_tokens_for_user(session, user_id)
    if not device_tokens:
        return
    token_strings = [dt.token for dt in device_tokens]
    await send_push_notifications(token_strings, title, body, data)
