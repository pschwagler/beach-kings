"""
Push notification service for sending Expo push notifications.

Handles device token CRUD and delivery via the Expo Push API.
"""

import hashlib
import hmac
import logging
import secrets
from typing import List, Optional, Dict

import httpx
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import DeviceToken
from backend.utils.datetime_utils import utcnow

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
    return result.scalar_one()


def _hash_unregister_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


async def register_installation(
    session: AsyncSession,
    user_id: int,
    token: str,
    platform: str,
    installation_id: Optional[str],
) -> tuple[DeviceToken, Optional[str]]:
    """Register an installation and rotate its one-time unregister credential.

    ``installation_id`` is optional only for compatibility with older clients.
    New clients receive a high-entropy secret; only its SHA-256 digest is stored.
    """
    if installation_id is None:
        return await register_token(session, user_id, token, platform), None

    installation_row = (
        await session.execute(
            select(DeviceToken)
            .where(DeviceToken.installation_id == installation_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    token_row = (
        await session.execute(
            select(DeviceToken).where(DeviceToken.token == token).with_for_update()
        )
    ).scalar_one_or_none()

    # Token rotation can briefly leave the new token attached to a legacy row.
    # Consolidate onto the stable installation row without exposing either token.
    if (
        installation_row is not None
        and token_row is not None
        and token_row.id != installation_row.id
    ):
        await session.delete(token_row)
        await session.flush()

    row = installation_row or token_row
    unregister_secret = secrets.token_urlsafe(32)
    if row is None:
        row = DeviceToken(
            user_id=user_id,
            token=token,
            platform=platform,
            installation_id=installation_id,
        )
        session.add(row)
    else:
        row.user_id = user_id
        row.token = token
        row.platform = platform
        row.installation_id = installation_id

    row.unregister_secret_hash = _hash_unregister_secret(unregister_secret)
    row.last_registered_at = utcnow()
    await session.flush()
    await session.refresh(row)
    return row, unregister_secret


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
    stmt = delete(DeviceToken).where(DeviceToken.user_id == user_id, DeviceToken.token == token)
    result = await session.execute(stmt)
    return result.rowcount > 0


async def unregister_installation(
    session: AsyncSession,
    installation_id: str,
    unregister_secret: str,
) -> bool:
    """Retire one installation using a credential that is independent of auth."""
    row = (
        await session.execute(
            select(DeviceToken)
            .where(DeviceToken.installation_id == installation_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None or row.unregister_secret_hash is None:
        return False
    candidate = _hash_unregister_secret(unregister_secret)
    if not hmac.compare_digest(candidate, row.unregister_secret_hash):
        return False
    await session.delete(row)
    await session.flush()
    return True


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
                    "expo_push_request_failed status_code=%d",
                    response.status_code,
                )
            else:
                resp_data = response.json()
                errors = [
                    ticket
                    for ticket in resp_data.get("data", [])
                    if ticket.get("status") == "error"
                ]
                if errors:
                    codes = sorted(
                        {
                            str(ticket.get("details", {}).get("error", "unknown"))[:100]
                            for ticket in errors
                            if isinstance(ticket, dict)
                        }
                    )
                    logger.warning(
                        "expo_push_ticket_errors count=%d error_codes=%s",
                        len(errors),
                        ",".join(codes),
                    )
    except Exception as exc:
        logger.error("expo_push_request_failed error_code=%s", type(exc).__name__)


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
