"""
Direct message service for 1:1 messaging between friends.

Handles sending messages, fetching conversations and threads,
marking messages as read, and unread count queries.
"""

import json
import logging
from typing import Any, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, and_, or_, case
from sqlalchemy.orm import aliased

from backend.database.models import DirectMessage, Notification, NotificationType, Player
from backend.services import friend_service, notification_service
from backend.services.notification_service import notification_to_dict
from backend.services.websocket_manager import get_websocket_manager
from backend.utils.datetime_utils import utcnow

logger = logging.getLogger(__name__)


async def send_message(
    session: AsyncSession,
    sender_player_id: int,
    receiver_player_id: int,
    message_text: str,
) -> Dict[str, Any]:
    """
    Send a direct message to another player.

    Validates friendship, persists the message, sends a WebSocket
    notification, and creates a bell notification for the receiver.

    Args:
        session: Database session
        sender_player_id: Player ID of the sender
        receiver_player_id: Player ID of the receiver
        message_text: Message content (1-500 chars)

    Returns:
        Dict representing the created DirectMessageResponse

    Raises:
        ValueError: If validation fails (not friends, self-message, empty text)
    """
    if sender_player_id == receiver_player_id:
        raise ValueError("Cannot send a message to yourself")

    # Validate friendship
    friends = await friend_service.are_friends(session, sender_player_id, receiver_player_id)
    if not friends:
        raise ValueError("You must be friends to send messages")

    # Trim and validate
    message_text = message_text.strip()
    if not message_text:
        raise ValueError("Message cannot be empty")
    if len(message_text) > 500:
        raise ValueError("Message cannot exceed 500 characters")

    # Persist
    dm = DirectMessage(
        sender_player_id=sender_player_id,
        receiver_player_id=receiver_player_id,
        message_text=message_text,
    )
    session.add(dm)
    await session.flush()
    await session.refresh(dm)

    message_dict = _dm_to_dict(dm)

    # Resolve receiver's user_id once for WebSocket + notification
    receiver_user_id = None
    try:
        receiver_user_id = await _get_user_id_for_player(session, receiver_player_id)
    except Exception as e:
        logger.warning(
            "Could not resolve receiver user_id for player %s: %s",
            receiver_player_id,
            e,
            exc_info=True,
        )

    # WebSocket: deliver to receiver in real-time
    if receiver_user_id:
        try:
            manager = get_websocket_manager()
            await manager.send_to_user(
                receiver_user_id,
                {"type": "direct_message", "message": message_dict},
            )
        except Exception as e:
            logger.warning(
                "Failed to send DM via WebSocket to player %s: %s",
                receiver_player_id,
                e,
                exc_info=True,
            )

    # Summary bell notification (upsert: one notification per user for all unread DMs)
    if receiver_user_id:
        try:
            sender_name = await _get_player_name(session, sender_player_id)
            await _upsert_dm_summary_notification(
                session, receiver_user_id, receiver_player_id, sender_name, message_text
            )
        except Exception as e:
            logger.warning("Failed to create DM notification: %s", e, exc_info=True)

    return message_dict


async def get_conversations(
    session: AsyncSession,
    player_id: int,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    Get the conversation list for a player, sorted by most recent message.

    Each conversation shows the other player's info, last message preview,
    and unread count.

    Args:
        session: Database session
        player_id: Current player's ID
        limit: Max conversations to return
        offset: Pagination offset

    Returns:
        Dict with conversations list and total_count
    """
    # Subquery: for each message, determine the "other" player_id
    other_player = case(
        (DirectMessage.sender_player_id == player_id, DirectMessage.receiver_player_id),
        else_=DirectMessage.sender_player_id,
    ).label("other_player_id")

    # Get all distinct conversation partners with latest message info
    # Using a window function approach for efficiency
    all_msgs = (
        select(
            other_player,
            DirectMessage.id.label("msg_id"),
            DirectMessage.message_text,
            DirectMessage.sender_player_id,
            DirectMessage.created_at,
            func.row_number()
            .over(
                partition_by=other_player,
                order_by=DirectMessage.created_at.desc(),
            )
            .label("rn"),
        )
        .where(
            or_(
                DirectMessage.sender_player_id == player_id,
                DirectMessage.receiver_player_id == player_id,
            )
        )
        .subquery()
    )

    # Only keep the latest message per conversation
    latest = select(all_msgs).where(all_msgs.c.rn == 1).subquery()

    # Count total conversations
    count_q = select(func.count()).select_from(latest)
    total_result = await session.execute(count_q)
    total_count = total_result.scalar_one() or 0

    # Fetch paginated conversations joined with player info
    OtherPlayer = aliased(Player)
    conversations_q = (
        select(
            latest.c.other_player_id,
            latest.c.message_text,
            latest.c.sender_player_id,
            latest.c.created_at,
            OtherPlayer.full_name,
            OtherPlayer.profile_picture_url,
        )
        .join(OtherPlayer, OtherPlayer.id == latest.c.other_player_id)
        .order_by(latest.c.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    result = await session.execute(conversations_q)
    rows = result.all()

    # Get unread counts per conversation partner (messages TO me that are unread)
    unread_q = (
        select(
            DirectMessage.sender_player_id,
            func.count().label("cnt"),
        )
        .where(
            and_(
                DirectMessage.receiver_player_id == player_id,
                DirectMessage.is_read.is_(False),
            )
        )
        .group_by(DirectMessage.sender_player_id)
    )
    unread_result = await session.execute(unread_q)
    unread_map = {row.sender_player_id: row.cnt for row in unread_result.all()}

    # Check friendship status for each partner
    friend_ids = await friend_service.get_friend_ids(session, player_id)

    conversations = []
    for row in rows:
        conversations.append(
            {
                "player_id": row.other_player_id,
                "full_name": row.full_name,
                "avatar": row.profile_picture_url,
                "last_message_text": row.message_text,
                "last_message_at": row.created_at.isoformat() if row.created_at else None,
                "last_message_sender_id": row.sender_player_id,
                "unread_count": unread_map.get(row.other_player_id, 0),
                "is_friend": row.other_player_id in friend_ids,
            }
        )

    return {"items": conversations, "total_count": total_count}


async def get_thread(
    session: AsyncSession,
    player_id: int,
    other_player_id: int,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    Get messages in a thread between two players, newest first.

    Args:
        session: Database session
        player_id: Current player's ID
        other_player_id: The other player's ID
        limit: Max messages to return
        offset: Pagination offset

    Returns:
        Dict with messages list, total_count, and has_more
    """
    base_filter = or_(
        and_(
            DirectMessage.sender_player_id == player_id,
            DirectMessage.receiver_player_id == other_player_id,
        ),
        and_(
            DirectMessage.sender_player_id == other_player_id,
            DirectMessage.receiver_player_id == player_id,
        ),
    )

    # Total count
    count_q = select(func.count()).select_from(DirectMessage).where(base_filter)
    total_result = await session.execute(count_q)
    total_count = total_result.scalar_one() or 0

    # Fetch messages (newest first for pagination, frontend reverses for display)
    messages_q = (
        select(DirectMessage)
        .where(base_filter)
        .order_by(DirectMessage.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(messages_q)
    messages = [_dm_to_dict(dm) for dm in result.scalars().all()]

    has_more = (offset + len(messages)) < total_count

    return {"items": messages, "total_count": total_count, "has_more": has_more}


async def mark_thread_read(
    session: AsyncSession,
    player_id: int,
    other_player_id: int,
) -> int:
    """
    Mark all unread messages from other_player as read.

    Args:
        session: Database session
        player_id: Current player (the receiver)
        other_player_id: The sender whose messages to mark read

    Returns:
        Number of messages marked as read
    """
    now = utcnow()
    result = await session.execute(
        update(DirectMessage)
        .where(
            and_(
                DirectMessage.sender_player_id == other_player_id,
                DirectMessage.receiver_player_id == player_id,
                DirectMessage.is_read.is_(False),
            )
        )
        .values(is_read=True, read_at=now)
        .returning(DirectMessage.id)
    )
    marked_ids = result.scalars().all()
    await session.flush()

    # Update or dismiss the summary notification to reflect new unread count
    if marked_ids:
        try:
            user_id = await _get_user_id_for_player(session, player_id)
            if user_id:
                await _update_or_dismiss_dm_notification(session, user_id, player_id)
        except Exception as e:
            logger.warning(
                "Failed to update DM summary notification after mark_thread_read: %s",
                e,
                exc_info=True,
            )

    return len(marked_ids)


async def get_unread_count(session: AsyncSession, player_id: int) -> int:
    """
    Get total unread message count across all conversations.

    Args:
        session: Database session
        player_id: Current player ID

    Returns:
        Total unread message count
    """
    result = await session.execute(
        select(func.count())
        .select_from(DirectMessage)
        .where(
            and_(
                DirectMessage.receiver_player_id == player_id,
                DirectMessage.is_read.is_(False),
            )
        )
    )
    return result.scalar_one() or 0


# ---------------------------------------------------------------------------
# Summary notification helpers
# ---------------------------------------------------------------------------


async def _upsert_dm_summary_notification(
    session: AsyncSession,
    user_id: int,
    player_id: int,
    sender_name: str,
    message_text: str,
) -> None:
    """
    Create or update a single summary notification for all unread DMs.

    If an unread DIRECT_MESSAGE notification already exists for this user,
    update it in place with the new count and latest message preview.
    Otherwise, create a new one.

    Args:
        session: Database session
        user_id: Receiver's user ID
        player_id: Receiver's player ID
        sender_name: Display name of the latest sender
        message_text: Latest message text (for preview)
    """
    unread_total = await get_unread_count(session, player_id)
    preview = message_text[:100] + ("..." if len(message_text) > 100 else "")
    title = f"You have {unread_total} unread message{'s' if unread_total != 1 else ''}"
    message = f"{sender_name}: {preview}"

    # Look for existing unread DM summary notification (lock row to prevent duplicates)
    existing = await session.execute(
        select(Notification)
        .where(
            and_(
                Notification.user_id == user_id,
                Notification.type == NotificationType.DIRECT_MESSAGE.value,
                Notification.is_read.is_(False),
            )
        )
        .with_for_update()
    )
    notif = existing.scalar_one_or_none()

    if notif:
        # Update existing notification
        notif.title = title
        notif.message = message
        notif.data = json.dumps({"unread_count": unread_total})
        notif.link_url = "/home?tab=messages"
        notif.created_at = utcnow()
        await session.flush()
        await session.refresh(notif)

        notif_dict = notification_to_dict(notif)

        # Broadcast updated notification via WebSocket
        try:
            manager = get_websocket_manager()
            await manager.send_to_user(
                user_id, {"type": "notification_updated", "notification": notif_dict}
            )
        except Exception as e:
            logger.warning("Failed to broadcast updated DM notification: %s", e, exc_info=True)
    else:
        # Create new summary notification (uses notification_service which also broadcasts)
        await notification_service.create_notification(
            session=session,
            user_id=user_id,
            type=NotificationType.DIRECT_MESSAGE.value,
            title=title,
            message=message,
            data={"unread_count": unread_total},
            link_url="/home?tab=messages",
        )


async def _update_or_dismiss_dm_notification(
    session: AsyncSession,
    user_id: int,
    player_id: int,
) -> None:
    """
    After marking a thread as read, update or dismiss the DM summary notification.

    If remaining unread count is 0, mark the notification as read.
    If count > 0, update the notification with the new lower count.
    Broadcasts changes via WebSocket in both cases.

    Args:
        session: Database session
        user_id: Receiver's user ID
        player_id: Receiver's player ID
    """
    existing = await session.execute(
        select(Notification).where(
            and_(
                Notification.user_id == user_id,
                Notification.type == NotificationType.DIRECT_MESSAGE.value,
                Notification.is_read.is_(False),
            )
        )
    )
    notif = existing.scalar_one_or_none()
    if not notif:
        return

    remaining = await get_unread_count(session, player_id)

    if remaining == 0:
        notif.is_read = True
        notif.read_at = utcnow()
    else:
        notif.title = f"You have {remaining} unread message{'s' if remaining != 1 else ''}"
        notif.data = json.dumps({"unread_count": remaining})
        notif.created_at = utcnow()

    await session.flush()
    await session.refresh(notif)

    notif_dict = notification_to_dict(notif)

    try:
        manager = get_websocket_manager()
        await manager.send_to_user(
            user_id, {"type": "notification_updated", "notification": notif_dict}
        )
    except Exception as e:
        logger.warning("Failed to broadcast DM notification update: %s", e, exc_info=True)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _dm_to_dict(dm: DirectMessage) -> Dict[str, Any]:
    """Convert a DirectMessage ORM object to a response dict.

    Returns raw datetime objects for read_at/created_at — Pydantic
    serializes them automatically via DirectMessageResponse.
    """
    return {
        "id": dm.id,
        "sender_player_id": dm.sender_player_id,
        "receiver_player_id": dm.receiver_player_id,
        "message_text": dm.message_text,
        "is_read": dm.is_read,
        "read_at": dm.read_at,
        "created_at": dm.created_at,
    }


async def _get_user_id_for_player(session: AsyncSession, player_id: int) -> Optional[int]:
    """Look up the user_id for a given player_id."""
    result = await session.execute(select(Player.user_id).where(Player.id == player_id))
    return result.scalar_one_or_none()


async def _get_player_name(session: AsyncSession, player_id: int) -> str:
    """Look up the full_name for a given player_id."""
    result = await session.execute(select(Player.full_name).where(Player.id == player_id))
    return result.scalar_one_or_none() or "Someone"
