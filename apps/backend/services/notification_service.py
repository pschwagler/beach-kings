"""
Notification service for managing user notifications.

Handles creation, retrieval, and status updates for in-app notifications.
"""

from typing import List, Dict, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, and_
from sqlalchemy.exc import IntegrityError
from backend.database.models import (
    League,
    Notification,
    NotificationType,
    Player,
)
from backend.services.data_service import (
    get_league_member_user_ids,
    get_league_admin_user_ids,
    get_session_match_player_user_ids,
)
from backend.utils.datetime_utils import utcnow
from backend.services.relationship_service import resolve_relationships
from backend.services import interaction_policy
import json
import logging

logger = logging.getLogger(__name__)


def notification_to_dict(notif: Notification) -> Dict:
    """Serialize a Notification ORM object to a response dict.

    Single source of truth for notification serialization. Used by
    create_notification, bulk helpers, get_notifications, and the
    DM service for WebSocket broadcast payloads.
    """
    return {
        "id": notif.id,
        "user_id": notif.user_id,
        "actor_player_id": notif.actor_player_id,
        "type": notif.type,
        "title": notif.title,
        "message": notif.message,
        "data": json.loads(notif.data) if notif.data else None,
        "is_read": notif.is_read,
        "read_at": notif.read_at.isoformat() if notif.read_at else None,
        "dismissed_at": notif.dismissed_at.isoformat() if notif.dismissed_at else None,
        "dedup_key": notif.dedup_key,
        "link_url": notif.link_url,
        "created_at": notif.created_at.isoformat() if notif.created_at else None,
    }


async def create_notification(
    session: AsyncSession,
    user_id: int,
    type: str,
    title: str,
    message: str,
    data: Optional[Dict] = None,
    link_url: Optional[str] = None,
    dedup_key: Optional[str] = None,
    actor_player_id: Optional[int] = None,
    push_title: Optional[str] = None,
    push_body: Optional[str] = None,
    push_event_key: Optional[str] = None,
) -> Dict:
    """
    Create a single notification for a user.

    Args:
        session: Database session
        user_id: ID of the user to notify
        type: Notification type (NotificationType enum value)
        title: Notification title
        message: Notification message text
        data: Optional JSON metadata (dict will be serialized to JSON string)
        link_url: Optional URL for navigation when notification is clicked
        dedup_key: Stable key used to prevent duplicate active notifications

    Returns:
        Dict containing the created notification data

    Raises:
        ValueError: If required fields are missing or invalid
    """
    if not user_id:
        raise ValueError("user_id is required")
    if not type:
        raise ValueError("type is required")
    if not title:
        raise ValueError("title is required")
    if not message:
        raise ValueError("message is required")

    if actor_player_id is not None:
        recipient_player_id = (
            await session.execute(select(Player.id).where(Player.user_id == user_id))
        ).scalar_one_or_none()
        if recipient_player_id is not None:
            await interaction_policy.enforce_action(
                session,
                recipient_player_id,
                actor_player_id,
                interaction_policy.InteractionAction.NOTIFICATION,
            )

    if dedup_key:
        existing_result = await session.execute(
            select(Notification).where(
                and_(
                    Notification.user_id == user_id,
                    Notification.dedup_key == dedup_key,
                    Notification.dismissed_at.is_(None),
                )
            )
        )
        existing = existing_result.scalar_one_or_none()
        if existing:
            return notification_to_dict(existing)

    # Serialize data dict to JSON string if provided
    data_json = None
    if data is not None:
        data_json = json.dumps(data)

    notification = Notification(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        data=data_json,
        link_url=link_url,
        dedup_key=dedup_key,
        actor_player_id=actor_player_id,
        is_read=False,
    )

    from backend.services.push_delivery_service import enqueue_notification_jobs

    try:
        async with session.begin_nested():
            session.add(notification)
            await session.flush()
            await session.refresh(notification)
            await enqueue_notification_jobs(
                session,
                notification,
                data,
                push_title=push_title,
                push_body=push_body,
                event_key=push_event_key,
            )
    except IntegrityError:
        # A concurrent retry may have inserted the same active dedup key after
        # the lookup above. Return that canonical row without rebroadcasting.
        if not dedup_key:
            raise
        existing_result = await session.execute(
            select(Notification).where(
                and_(
                    Notification.user_id == user_id,
                    Notification.dedup_key == dedup_key,
                    Notification.dismissed_at.is_(None),
                )
            )
        )
        existing = existing_result.scalar_one_or_none()
        if existing:
            return notification_to_dict(existing)
        raise
    notification_dict = notification_to_dict(notification)

    # Broadcast via WebSocket (non-blocking - errors won't fail the notification creation)
    try:
        from backend.services.websocket_manager import get_websocket_manager

        manager = get_websocket_manager()
        await manager.send_to_user(
            user_id, {"type": "notification", "notification": notification_dict}
        )
    except Exception as e:
        # Log error but don't fail notification creation
        logger.warning(f"Failed to broadcast notification via WebSocket for user {user_id}: {e}")

    return notification_dict


async def create_notifications_bulk(
    session: AsyncSession, notifications_list: List[Dict]
) -> List[Dict]:
    """
    Create multiple notifications efficiently using bulk insert.

    Args:
        session: Database session
        notifications_list: List of notification dicts, each containing:
            - user_id (int, required)
            - type (str, required)
            - title (str, required)
            - message (str, required)
            - data (dict, optional) - will be serialized to JSON
            - link_url (str, optional)

    Returns:
        List of created notification dicts

    Raises:
        ValueError: If any notification data is invalid
    """
    if not notifications_list:
        return []

    for notif_data in notifications_list:
        if not notif_data.get("user_id"):
            raise ValueError("user_id is required for all notifications")
        if not notif_data.get("type"):
            raise ValueError("type is required for all notifications")
        if not notif_data.get("title"):
            raise ValueError("title is required for all notifications")
        if not notif_data.get("message"):
            raise ValueError("message is required for all notifications")

    # Actor-bearing rows are filtered before persistence and real-time/push
    # delivery. System rows without an actor remain eligible.
    actor_rows = [row for row in notifications_list if row.get("actor_player_id") is not None]
    if actor_rows:
        recipient_user_ids = {int(row["user_id"]) for row in actor_rows if row.get("user_id")}
        player_rows = await session.execute(
            select(Player.user_id, Player.id).where(Player.user_id.in_(recipient_user_ids))
        )
        recipient_players = {row.user_id: row.id for row in player_rows.all()}
        allowed_pairs: set[tuple[int, int]] = set()
        actors_by_recipient: dict[int, set[int]] = {}
        for row in actor_rows:
            recipient_player_id = recipient_players.get(int(row["user_id"]))
            if recipient_player_id is not None:
                actors_by_recipient.setdefault(recipient_player_id, set()).add(
                    int(row["actor_player_id"])
                )
        for recipient_player_id, actor_ids in actors_by_recipient.items():
            actor_list = list(actor_ids)
            for start in range(0, len(actor_list), 100):
                capabilities = await interaction_policy.interaction_capabilities(
                    session, recipient_player_id, actor_list[start : start + 100]
                )
                allowed_pairs.update(
                    (recipient_player_id, actor_id)
                    for actor_id, capability in capabilities.items()
                    if capability["actions"][
                        interaction_policy.InteractionAction.NOTIFICATION.value
                    ]
                )
        notifications_list = [
            row
            for row in notifications_list
            if row.get("actor_player_id") is None
            or (
                recipient_players.get(int(row["user_id"])),
                int(row["actor_player_id"]),
            )
            in allowed_pairs
        ]
        if not notifications_list:
            return []

    # Validate and prepare notifications
    notification_objects = []
    for notif_data in notifications_list:
        # Serialize data dict to JSON string if provided
        data_json = None
        if notif_data.get("data") is not None:
            data_json = json.dumps(notif_data["data"])

        notification_objects.append(
            Notification(
                user_id=notif_data["user_id"],
                type=notif_data["type"],
                title=notif_data["title"],
                message=notif_data["message"],
                data=data_json,
                link_url=notif_data.get("link_url"),
                dedup_key=notif_data.get("dedup_key"),
                actor_player_id=notif_data.get("actor_player_id"),
                is_read=False,
            )
        )

    from backend.services.push_delivery_service import enqueue_notification_jobs

    async with session.begin_nested():
        session.add_all(notification_objects)
        await session.flush()

        # Refresh in bounded batches so payload snapshots include stable IDs.
        batch_size = 100
        for i in range(0, len(notification_objects), batch_size):
            batch = notification_objects[i : i + batch_size]
            for notif in batch:
                await session.refresh(notif)

        for notification, source in zip(notification_objects, notifications_list):
            await enqueue_notification_jobs(
                session,
                notification,
                source.get("data"),
                push_title=source.get("push_title"),
                push_body=source.get("push_body"),
                event_key=source.get("push_event_key"),
            )

    # Convert only after notification rows and jobs have left the same savepoint.
    notification_dicts = [notification_to_dict(notif) for notif in notification_objects]

    # Broadcast notifications via WebSocket (non-blocking - errors won't fail notification creation)
    notifications_by_user: dict[int, list[Dict]] = {}
    try:
        from backend.services.websocket_manager import get_websocket_manager

        manager = get_websocket_manager()

        # Group notifications by user_id for efficient broadcasting
        for notif_dict in notification_dicts:
            user_id = notif_dict["user_id"]
            if user_id not in notifications_by_user:
                notifications_by_user[user_id] = []
            notifications_by_user[user_id].append(notif_dict)

        # Broadcast to each user
        for user_id, user_notifications in notifications_by_user.items():
            for notif_dict in user_notifications:
                try:
                    await manager.send_to_user(
                        user_id, {"type": "notification", "notification": notif_dict}
                    )
                except Exception as e:
                    logger.warning(
                        f"Failed to broadcast notification {notif_dict['id']} to user {user_id}: {e}"
                    )
    except Exception as e:
        logger.warning(f"Failed to broadcast bulk notifications via WebSocket: {e}")

    return notification_dicts


async def get_user_notifications(
    session: AsyncSession,
    user_id: int,
    limit: int = 50,
    offset: int = 0,
    unread_only: bool = False,
) -> Dict:
    """
    Fetch user notifications with pagination.

    Args:
        session: Database session
        user_id: ID of the user
        limit: Maximum number of notifications to return (default: 50)
        offset: Number of notifications to skip (default: 0)
        unread_only: If True, only return unread notifications (default: False)

    Returns:
        Dict containing:
            - items: List of notification dicts (ordered by created_at DESC)
            - total_count: Total number of notifications matching the criteria
            - has_more: Boolean indicating if there are more notifications
    """
    await reconcile_friend_request_notifications(session, user_id)

    # Build query
    query = select(Notification).where(
        Notification.user_id == user_id,
        Notification.dismissed_at.is_(None),
    )
    viewer_player_id = (
        await session.execute(select(Player.id).where(Player.user_id == user_id))
    ).scalar_one_or_none()
    if viewer_player_id is not None:
        query = interaction_policy.exclude_blocked_notification_actors(query, viewer_player_id)

    if unread_only:
        query = query.where(Notification.is_read.is_(False))

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await session.execute(count_query)
    total_count = total_result.scalar_one() or 0

    # Get paginated notifications
    query = query.order_by(Notification.created_at.desc()).limit(limit).offset(offset)
    result = await session.execute(query)
    notifications = result.scalars().all()

    # Convert to dicts
    notification_dicts = [notification_to_dict(notif) for notif in notifications]

    has_more = (offset + len(notification_dicts)) < total_count

    return {
        "items": notification_dicts,
        "total_count": total_count,
        "has_more": has_more,
    }


async def get_unread_count(session: AsyncSession, user_id: int) -> int:
    """
    Get count of unread notifications for a user.

    Args:
        session: Database session
        user_id: ID of the user

    Returns:
        Integer count of unread notifications
    """
    await reconcile_friend_request_notifications(session, user_id)

    query = (
        select(func.count())
        .select_from(Notification)
        .where(
            and_(
                Notification.user_id == user_id,
                Notification.is_read.is_(False),
                Notification.dismissed_at.is_(None),
            )
        )
    )
    viewer_player_id = (
        await session.execute(select(Player.id).where(Player.user_id == user_id))
    ).scalar_one_or_none()
    if viewer_player_id is not None:
        query = interaction_policy.exclude_blocked_notification_actors(query, viewer_player_id)
    result = await session.execute(query)
    count = result.scalar_one() or 0
    return count


async def reconcile_friend_request_notifications(session: AsyncSession, user_id: int) -> int:
    """Dismiss obsolete or duplicate friend-request notifications.

    The pending friend-request table is authoritative. Historical notification
    rows remain stored for audit purposes but are hidden when their request no
    longer exists/is pending, or when more than one row represents the same
    active request.
    """
    player_result = await session.execute(select(Player.id).where(Player.user_id == user_id))
    receiver_player_id = player_result.scalar_one_or_none()
    if receiver_player_id is None:
        return 0

    notification_result = await session.execute(
        select(Notification)
        .where(
            and_(
                Notification.user_id == user_id,
                Notification.type == NotificationType.FRIEND_REQUEST.value,
                Notification.dismissed_at.is_(None),
            )
        )
        .order_by(Notification.created_at.desc(), Notification.id.desc())
    )

    notifications = notification_result.scalars().all()
    parsed = {}
    sender_ids = set()
    for notification in notifications:
        try:
            data = json.loads(notification.data) if notification.data else {}
        except json.JSONDecodeError:
            data = {}
        raw_request_id = data.get("friend_request_id", data.get("request_id"))
        raw_sender_id = data.get("sender_player_id")
        try:
            request_id = int(raw_request_id)
        except (TypeError, ValueError):
            request_id = None
        try:
            sender_id = int(raw_sender_id)
        except (TypeError, ValueError):
            sender_id = None
        parsed[notification.id] = (data, request_id, sender_id)
        if sender_id is not None:
            sender_ids.add(sender_id)

    relationships = await resolve_relationships(session, receiver_player_id, sender_ids)

    # Prefer a notification with the canonical request id. A legacy row that
    # only identifies the sender is retained only when no exact row exists.
    winner_ids = set()
    for sender_id in sender_ids:
        relationship = relationships.get(str(sender_id), {})
        if relationship.get("status") != "pending_incoming":
            continue
        canonical_request_id = relationship.get("request_id")
        exact = [
            notification
            for notification in notifications
            if parsed[notification.id][1] == canonical_request_id
            and parsed[notification.id][2] == sender_id
        ]
        legacy = [
            notification
            for notification in notifications
            if parsed[notification.id][1] is None and parsed[notification.id][2] == sender_id
        ]
        candidates = exact or legacy
        if candidates:
            winner_ids.add(candidates[0].id)

    now = utcnow()
    dismissed = 0
    changed = False
    for notification in notifications:
        data, _, sender_id = parsed[notification.id]
        if notification.id in winner_ids:
            request_id = relationships[str(sender_id)]["request_id"]
            expected_key = f"friend_request:{request_id}"
            if data.get("friend_request_id") != request_id:
                data["friend_request_id"] = request_id
                notification.data = json.dumps(data)
                changed = True
            if notification.dedup_key != expected_key:
                notification.dedup_key = expected_key
                changed = True
            continue

        notification.is_read = True
        notification.read_at = notification.read_at or now
        notification.dismissed_at = now
        dismissed += 1
        changed = True

    if changed:
        await session.flush()
    return dismissed


async def mark_as_read(session: AsyncSession, notification_id: int, user_id: int) -> Dict:
    """
    Mark a single notification as read.

    Args:
        session: Database session
        notification_id: ID of the notification
        user_id: ID of the user (for security - ensures user owns the notification)

    Returns:
        Updated notification dict

    Raises:
        ValueError: If notification not found or doesn't belong to user
    """
    # Verify notification exists and belongs to user
    result = await session.execute(
        select(Notification).where(
            and_(Notification.id == notification_id, Notification.user_id == user_id)
        )
    )
    notification = result.scalar_one_or_none()

    if not notification:
        raise ValueError("Notification not found or access denied")

    # Update if not already read
    if not notification.is_read:
        notification.is_read = True
        notification.read_at = utcnow()
        await session.flush()
        await session.refresh(notification)

    return notification_to_dict(notification)


async def mark_friend_request_notifications_handled(
    session: AsyncSession,
    *,
    receiver_user_id: int,
    request_id: int,
    sender_player_id: int | None = None,
) -> List[Dict]:
    """Dismiss friend-request notifications after the relationship resolves."""
    result = await session.execute(
        select(Notification).where(
            and_(
                Notification.user_id == receiver_user_id,
                Notification.type == NotificationType.FRIEND_REQUEST.value,
                Notification.dismissed_at.is_(None),
            )
        )
    )
    now = utcnow()
    updated: List[Dict] = []
    for notification in result.scalars().all():
        try:
            data = json.loads(notification.data) if notification.data else {}
        except json.JSONDecodeError:
            data = {}
        notification_request_id = data.get("friend_request_id", data.get("request_id"))
        notification_sender_id = data.get("sender_player_id")
        matches_request = str(notification_request_id) == str(request_id)
        matches_sender = sender_player_id is not None and str(notification_sender_id) == str(
            sender_player_id
        )
        if not matches_request and not matches_sender:
            continue
        notification.is_read = True
        notification.read_at = now
        notification.dismissed_at = now
        await session.flush()
        await session.refresh(notification)
        notification_dict = notification_to_dict(notification)
        updated.append(notification_dict)
        try:
            from backend.services.websocket_manager import get_websocket_manager

            manager = get_websocket_manager()
            await manager.send_to_user(
                receiver_user_id,
                {"type": "notification_updated", "payload": notification_dict},
            )
        except Exception as e:
            logger.warning(
                "Failed to broadcast friend request notification update for user %s: %s",
                receiver_user_id,
                e,
            )
    return updated


async def mark_all_as_read(session: AsyncSession, user_id: int) -> int:
    """
    Mark all user notifications as read.

    Args:
        session: Database session
        user_id: ID of the user

    Returns:
        Count of notifications marked as read
    """
    result = await session.execute(
        update(Notification)
        .where(and_(Notification.user_id == user_id, Notification.is_read.is_(False)))
        .values(is_read=True, read_at=utcnow())
        .returning(Notification.id)
    )

    marked_ids = result.scalars().all()
    count = len(marked_ids)

    await session.flush()

    return count


#
# Business logic helper functions for specific notification types
# These functions encapsulate the logic for creating notifications in response to business events
#


async def notify_league_members_about_message(
    session: AsyncSession,
    league_id: int,
    message_id: int,
    sender_user_id: int,
    message_text: str,
    league_name: Optional[str] = None,
    member_user_ids: Optional[List[int]] = None,
) -> None:
    """
    Notify all league members (except sender) about a new league message.

    Args:
        session: Database session
        league_id: ID of the league
        message_id: ID of the message
        sender_user_id: User ID of the message sender
        message_text: Text content of the message
        league_name: Optional league name (will be fetched if not provided)
        member_user_ids: Optional list of member user IDs (will be fetched if not provided)
    """
    try:
        # Early return if no members to notify (optimization #11)
        if member_user_ids is not None and not member_user_ids:
            return

        # Fetch league name if not provided
        if league_name is None:
            result = await session.execute(select(League.name).where(League.id == league_id))
            league_name = result.scalar_one_or_none() or "the league"

        # Fetch member user IDs if not provided
        if member_user_ids is None:
            member_user_ids = await get_league_member_user_ids(
                session, league_id, exclude_user_id=sender_user_id
            )
        else:
            # Filter out sender if they're in the list
            member_user_ids = [uid for uid in member_user_ids if uid != sender_user_id]

        # Early return if no members after filtering (optimization #11)
        if not member_user_ids:
            return

        # Get sender name
        player_result = await session.execute(
            select(Player.id, Player.full_name).where(Player.user_id == sender_user_id)
        )
        player_row = player_result.one_or_none()
        sender_player_id = player_row.id if player_row else None
        player_name = player_row.full_name if player_row else "Unknown"

        # Create notifications
        notifications_list = [
            {
                "user_id": member_id,
                "type": NotificationType.LEAGUE_MESSAGE.value,
                "title": f"New message in {league_name}",
                "message": f"{player_name}: {message_text[:100]}{'...' if len(message_text) > 100 else ''}",
                "push_title": f"New message in {league_name}",
                "push_body": f"{player_name} sent a new league message.",
                "push_event_key": f"league-message-{message_id}",
                "actor_player_id": sender_player_id,
                "data": {
                    "league_id": league_id,
                    "message_id": message_id,
                    "sender_id": sender_user_id,
                },
                "link_url": f"/league/{league_id}?tab=messages",
            }
            for member_id in member_user_ids
        ]

        await create_notifications_bulk(session, notifications_list)
    except Exception as e:
        logger.warning(f"Failed to create notifications for league message: {e}")


async def notify_admins_about_join_request(
    session: AsyncSession,
    league_id: int,
    request_id: int,
    player_id: int,
    league_name: Optional[str] = None,
    player_name: Optional[str] = None,
    admin_user_ids: Optional[List[int]] = None,
) -> None:
    """
    Notify league admins about a new join request.

    Args:
        session: Database session
        league_id: ID of the league
        request_id: ID of the join request
        player_id: ID of the player requesting to join
        league_name: Optional league name (will be fetched if not provided)
        player_name: Optional player name (will be fetched if not provided)
        admin_user_ids: Optional list of admin user IDs (will be fetched if not provided)
    """
    try:
        # Early return if no admins to notify (optimization #11)
        if admin_user_ids is not None and not admin_user_ids:
            return

        # Fetch league name if not provided
        if league_name is None:
            result = await session.execute(select(League.name).where(League.id == league_id))
            league_name = result.scalar_one_or_none() or "the league"

        # Fetch player name if not provided
        if player_name is None:
            result = await session.execute(select(Player.full_name).where(Player.id == player_id))
            player_name = result.scalar_one_or_none() or "A player"

        # Fetch admin user IDs if not provided
        if admin_user_ids is None:
            admin_user_ids = await get_league_admin_user_ids(session, league_id)

        # Early return if no admins after fetching (optimization #11)
        if not admin_user_ids:
            return

        # Create notifications with action buttons
        notifications_list = [
            {
                "user_id": admin_id,
                "type": NotificationType.LEAGUE_JOIN_REQUEST.value,
                "title": "New Join Request",
                "message": f"{player_name} wants to join {league_name}",
                "data": {
                    "league_id": league_id,
                    "request_id": request_id,
                    "player_id": player_id,
                    "actions": [
                        {
                            "label": "Approve",
                            "action": "approve",
                            "endpoint": f"/api/leagues/{league_id}/join-requests/{request_id}/approve",
                            "method": "POST",
                            "style": "primary",
                        },
                        {
                            "label": "Reject",
                            "action": "reject",
                            "endpoint": f"/api/leagues/{league_id}/join-requests/{request_id}/reject",
                            "method": "POST",
                            "style": "secondary",
                        },
                    ],
                },
                "link_url": f"/league/{league_id}?tab=details",
            }
            for admin_id in admin_user_ids
        ]

        await create_notifications_bulk(session, notifications_list)
    except Exception as e:
        logger.warning(f"Failed to create notifications for league join request: {e}")


async def notify_player_about_join_approval(
    session: AsyncSession, league_id: int, player_user_id: int, league_name: Optional[str] = None
) -> None:
    """
    Notify a player that their join request has been approved.

    Args:
        session: Database session
        league_id: ID of the league
        player_user_id: User ID of the player
        league_name: Optional league name (will be fetched if not provided)
    """
    try:
        # Fetch league name if not provided
        if league_name is None:
            result = await session.execute(select(League.name).where(League.id == league_id))
            league_name = result.scalar_one_or_none() or "the league"

        # Create notification
        await create_notification(
            session=session,
            user_id=player_user_id,
            type=NotificationType.LEAGUE_INVITE.value,
            title="Join request approved",
            message=f"You've been added to {league_name}!",
            data={"league_id": league_id},
            link_url=f"/league/{league_id}",
        )
    except Exception as e:
        logger.warning(f"Failed to create notification for join approval: {e}")


async def notify_player_about_league_invite(
    session: AsyncSession,
    league_id: int,
    player_user_id: int,
    league_name: Optional[str] = None,
    actor_player_id: Optional[int] = None,
) -> None:
    """
    Notify a player that they have been invited to a league.

    Args:
        session: Database session
        league_id: ID of the league
        player_user_id: User ID of the invited player
        league_name: Optional league name (will be fetched if not provided)
    """
    try:
        if league_name is None:
            result = await session.execute(select(League.name).where(League.id == league_id))
            league_name = result.scalar_one_or_none() or "a league"

        await create_notification(
            session=session,
            user_id=player_user_id,
            type=NotificationType.LEAGUE_INVITE.value,
            title="League invitation",
            message=f"You've been invited to join {league_name}!",
            data={"league_id": league_id},
            link_url=f"/league/{league_id}",
            actor_player_id=actor_player_id,
        )
    except Exception as e:
        logger.warning(f"Failed to create league invite notification: {e}")


async def notify_player_about_join_rejection(
    session: AsyncSession, league_id: int, player_user_id: int, league_name: Optional[str] = None
) -> None:
    """
    Notify a player that their join request was rejected.

    Args:
        session: Database session
        league_id: ID of the league
        player_user_id: User ID of the player
        league_name: Optional league name (will be fetched if not provided)
    """
    try:
        # Fetch league name if not provided
        if league_name is None:
            result = await session.execute(select(League.name).where(League.id == league_id))
            league_name = result.scalar_one_or_none() or "the league"

        await create_notification(
            session=session,
            user_id=player_user_id,
            type=NotificationType.LEAGUE_JOIN_REJECTED.value,
            title="Join request declined",
            message=f"Your request to join {league_name} was declined.",
            data={"league_id": league_id},
            link_url=f"/league/{league_id}",
        )
    except Exception as e:
        logger.warning(f"Failed to create notification for join rejection: {e}")


async def notify_members_about_season_activated(
    session: AsyncSession,
    league_id: int,
    season_id: int,
    season_name: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    league_name: Optional[str] = None,
    member_user_ids: Optional[List[int]] = None,
) -> None:
    """
    Notify league members when a season becomes active.

    Only sends notifications if the season is currently active (today's date falls
    within the start and end dates).

    Args:
        session: Database session
        league_id: ID of the league
        season_id: ID of the season
        season_name: Name of the season
        start_date: Optional start date (string or date object)
        end_date: Optional end date (string or date object)
        league_name: Optional league name (will be fetched if not provided)
        member_user_ids: Optional list of member user IDs (will be fetched if not provided)
    """
    try:
        # Check if season is active based on dates
        if start_date and end_date:
            from datetime import date

            def _parse_date(date_value):
                """Parse date from string or date object."""
                if isinstance(date_value, str):
                    # Handle timezone-aware strings by splitting on 'T'
                    date_part = date_value.split("T")[0]
                    return datetime.fromisoformat(date_part).date()
                return date_value

            current_date = date.today()
            parsed_start = _parse_date(start_date)
            parsed_end = _parse_date(end_date)
            is_active = current_date >= parsed_start and current_date <= parsed_end

            # Only notify if season is active
            if not is_active:
                return
        else:
            # No dates provided, cannot determine if active
            return

        # Early return if no members to notify (optimization #11)
        if member_user_ids is not None and not member_user_ids:
            return

        # Fetch league name if not provided
        if league_name is None:
            result = await session.execute(select(League.name).where(League.id == league_id))
            league_name = result.scalar_one_or_none() or "the league"

        # Fetch member user IDs if not provided
        if member_user_ids is None:
            member_user_ids = await get_league_member_user_ids(session, league_id)

        # Early return if no members after fetching (optimization #11)
        if not member_user_ids:
            return

        # Create notifications
        notifications_list = [
            {
                "user_id": member_id,
                "type": NotificationType.SEASON_ACTIVATED.value,
                "title": f"New season activated in {league_name}",
                "message": f'The season "{season_name}" has been activated!',
                "data": {"league_id": league_id, "season_id": season_id},
                "link_url": f"/league/{league_id}?tab=rankings",
            }
            for member_id in member_user_ids
        ]

        await create_notifications_bulk(session, notifications_list)
    except Exception as e:
        logger.warning(f"Failed to create notifications for season activation: {e}")


async def notify_members_about_new_member(
    session: AsyncSession,
    league_id: int,
    new_member_user_id: int,
    league_name: Optional[str] = None,
    member_user_ids: Optional[List[int]] = None,
) -> None:
    """
    Notify all league members (except the new member) when a new player joins.

    Requires a valid database session from the caller.

    Args:
        session: Active database session
        league_id: ID of the league
        new_member_user_id: User ID of the newly joined player
        league_name: Optional league name (will be fetched if not provided)
        member_user_ids: Optional list of member user IDs (will be fetched if not provided)
    """
    # Early return if no members to notify (optimization #11)
    if member_user_ids is not None and not member_user_ids:
        return

    # Fetch league name if not provided
    if league_name is None:
        result = await session.execute(select(League.name).where(League.id == league_id))
        league_name = result.scalar_one_or_none() or "the league"

    # Fetch member user IDs if not provided (excluding the new member)
    if member_user_ids is None:
        member_user_ids = await get_league_member_user_ids(
            session, league_id, exclude_user_id=new_member_user_id
        )
    else:
        # Filter out the new member if they're in the list
        member_user_ids = [uid for uid in member_user_ids if uid != new_member_user_id]

    # Early return if no members after filtering (optimization #11)
    if not member_user_ids:
        return

    # Get new member name
    player_result = await session.execute(
        select(Player.full_name).where(Player.user_id == new_member_user_id)
    )
    player_name = player_result.scalar_one_or_none() or "A new player"

    # Create notifications
    notifications_list = [
        {
            "user_id": member_id,
            "type": NotificationType.MEMBER_JOINED.value,
            "title": f"New member joined {league_name}",
            "message": f"{player_name} joined the league",
            "data": {"league_id": league_id, "new_member_user_id": new_member_user_id},
            "link_url": f"/league/{league_id}",
        }
        for member_id in member_user_ids
    ]

    await create_notifications_bulk(session, notifications_list)


async def notify_members_about_new_member_background(
    league_id: int,
    new_member_user_id: int,
    league_name: Optional[str] = None,
    member_user_ids: Optional[List[int]] = None,
) -> None:
    """
    Fire-and-forget variant that creates its own database session.

    Use with ``asyncio.create_task()`` when the caller's session may close
    before this coroutine completes.

    Args:
        league_id: ID of the league
        new_member_user_id: User ID of the newly joined player
        league_name: Optional league name (will be fetched if not provided)
        member_user_ids: Optional list of member user IDs (will be fetched if not provided)
    """
    try:
        from backend.database.db import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            await notify_members_about_new_member(
                session, league_id, new_member_user_id, league_name, member_user_ids
            )
            await session.commit()
    except Exception:
        logger.exception("Failed to create notifications for new league member")


async def notify_player_about_removal_from_league(
    session: AsyncSession, league_id: int, removed_user_id: int, league_name: Optional[str] = None
) -> None:
    """
    Notify a player that they have been removed from a league.

    Requires a valid database session from the caller.

    Args:
        session: Active database session
        league_id: ID of the league
        removed_user_id: User ID of the removed player
        league_name: Optional league name (will be fetched if not provided)
    """
    # Fetch league name if not provided
    if league_name is None:
        result = await session.execute(select(League.name).where(League.id == league_id))
        league_name = result.scalar_one_or_none() or "a league"

    # Create notification
    await create_notification(
        session=session,
        user_id=removed_user_id,
        type=NotificationType.MEMBER_REMOVED.value,
        title="Removed from league",
        message=f"You have been removed from {league_name}",
        data={"league_id": league_id},
        link_url="/home",
    )


async def notify_player_about_removal_from_league_background(
    league_id: int,
    removed_user_id: int,
    league_name: Optional[str] = None,
) -> None:
    """
    Fire-and-forget variant that creates its own database session.

    Use with ``asyncio.create_task()`` when the caller's session may close
    before this coroutine completes.

    Args:
        league_id: ID of the league
        removed_user_id: User ID of the removed player
        league_name: Optional league name (will be fetched if not provided)
    """
    try:
        from backend.database.db import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            await notify_player_about_removal_from_league(
                session, league_id, removed_user_id, league_name
            )
            await session.commit()
    except Exception:
        logger.exception("Failed to create notification for league removal")


async def notify_players_about_session_submitted(
    session: AsyncSession,
    session_id: int,
    submitter_user_id: int,
    session_name: str,
    league_id: Optional[int] = None,
    league_name: Optional[str] = None,
) -> None:
    """
    Notify all players in a session's matches that games have been submitted.

    Excludes the submitter from notifications. Handles both league and non-league sessions.

    Args:
        session: Database session
        session_id: ID of the submitted session
        submitter_user_id: User ID of the player who submitted (excluded from notifications)
        session_name: Display name of the session
        league_id: Optional league ID (if league session)
        league_name: Optional league name (will be fetched if league_id provided but name not)
    """
    try:
        # Get user IDs of all match players except the submitter
        user_ids = await get_session_match_player_user_ids(
            session, session_id, exclude_user_id=submitter_user_id
        )

        if not user_ids:
            return

        # Get submitter name
        player_result = await session.execute(
            select(Player.full_name).where(Player.user_id == submitter_user_id)
        )
        submitter_name = player_result.scalar_one_or_none() or "Someone"

        # Build title and link based on league vs non-league
        if league_id:
            if league_name is None:
                result = await session.execute(select(League.name).where(League.id == league_id))
                league_name = result.scalar_one_or_none() or "the league"
            title = f"Games submitted in {league_name}"
            link_url = f"/league/{league_id}?tab=rankings"
        else:
            title = "Games submitted"
            link_url = "/home"

        notifications_list = [
            {
                "user_id": uid,
                "type": NotificationType.SESSION_SUBMITTED.value,
                "title": title,
                "message": f"{submitter_name} submitted games from {session_name}",
                "data": {"session_id": session_id, "league_id": league_id},
                "link_url": link_url,
            }
            for uid in user_ids
        ]

        await create_notifications_bulk(session, notifications_list)
    except Exception as e:
        logger.warning(f"Failed to create notifications for session submission: {e}")
