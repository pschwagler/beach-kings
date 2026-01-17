"""
Notification service for managing user notifications.

Handles creation, retrieval, and status updates for in-app notifications.
"""

from typing import List, Dict, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, and_
from backend.database.models import Notification, NotificationType
from backend.utils.datetime_utils import utcnow
import json
import logging

logger = logging.getLogger(__name__)


async def create_notification(
    session: AsyncSession,
    user_id: int,
    type: str,
    title: str,
    message: str,
    data: Optional[Dict] = None,
    link_url: Optional[str] = None
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
        is_read=False
    )
    
    session.add(notification)
    await session.flush()
    await session.refresh(notification)
    
    notification_dict = {
        "id": notification.id,
        "user_id": notification.user_id,
        "type": notification.type,
        "title": notification.title,
        "message": notification.message,
        "data": json.loads(notification.data) if notification.data else None,
        "is_read": notification.is_read,
        "read_at": notification.read_at.isoformat() if notification.read_at else None,
        "link_url": notification.link_url,
        "created_at": notification.created_at.isoformat() if notification.created_at else None,
    }
    
    # Broadcast via WebSocket (non-blocking - errors won't fail the notification creation)
    try:
        from backend.services.websocket_manager import get_websocket_manager
        manager = get_websocket_manager()
        await manager.send_to_user(user_id, {"type": "notification", "notification": notification_dict})
    except Exception as e:
        # Log error but don't fail notification creation
        logger.warning(f"Failed to broadcast notification via WebSocket for user {user_id}: {e}")
    
    return notification_dict


async def create_notifications_bulk(
    session: AsyncSession,
    notifications_list: List[Dict]
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
    
    # Validate and prepare notifications
    notification_objects = []
    for notif_data in notifications_list:
        if not notif_data.get("user_id"):
            raise ValueError("user_id is required for all notifications")
        if not notif_data.get("type"):
            raise ValueError("type is required for all notifications")
        if not notif_data.get("title"):
            raise ValueError("title is required for all notifications")
        if not notif_data.get("message"):
            raise ValueError("message is required for all notifications")
        
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
                is_read=False
            )
        )
    
    # Bulk insert
    session.add_all(notification_objects)
    await session.flush()
    
    # Batch refresh all notifications to get IDs and timestamps
    # Refresh in batches to avoid overwhelming the database
    batch_size = 100
    for i in range(0, len(notification_objects), batch_size):
        batch = notification_objects[i:i + batch_size]
        await session.flush()  # Ensure all objects are persisted
        for notif in batch:
            await session.refresh(notif)
    
    # Convert to dicts
    notification_dicts = [
        {
            "id": notif.id,
            "user_id": notif.user_id,
            "type": notif.type,
            "title": notif.title,
            "message": notif.message,
            "data": json.loads(notif.data) if notif.data else None,
            "is_read": notif.is_read,
            "read_at": notif.read_at.isoformat() if notif.read_at else None,
            "link_url": notif.link_url,
            "created_at": notif.created_at.isoformat() if notif.created_at else None,
        }
        for notif in notification_objects
    ]
    
    # Broadcast notifications via WebSocket (non-blocking - errors won't fail notification creation)
    try:
        from backend.services.websocket_manager import get_websocket_manager
        manager = get_websocket_manager()
        
        # Group notifications by user_id for efficient broadcasting
        notifications_by_user = {}
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
                        user_id,
                        {"type": "notification", "notification": notif_dict}
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
    unread_only: bool = False
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
            - notifications: List of notification dicts (ordered by created_at DESC)
            - total_count: Total number of notifications matching the criteria
            - has_more: Boolean indicating if there are more notifications
    """
    # Build query
    query = select(Notification).where(Notification.user_id == user_id)
    
    if unread_only:
        query = query.where(Notification.is_read == False)
    
    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await session.execute(count_query)
    total_count = total_result.scalar_one() or 0
    
    # Get paginated notifications
    query = query.order_by(Notification.created_at.desc()).limit(limit).offset(offset)
    result = await session.execute(query)
    notifications = result.scalars().all()
    
    # Convert to dicts
    notification_dicts = [
        {
            "id": notif.id,
            "user_id": notif.user_id,
            "type": notif.type,
            "title": notif.title,
            "message": notif.message,
            "data": json.loads(notif.data) if notif.data else None,
            "is_read": notif.is_read,
            "read_at": notif.read_at.isoformat() if notif.read_at else None,
            "link_url": notif.link_url,
            "created_at": notif.created_at.isoformat() if notif.created_at else None,
        }
        for notif in notifications
    ]
    
    has_more = (offset + len(notification_dicts)) < total_count
    
    return {
        "notifications": notification_dicts,
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
    result = await session.execute(
        select(func.count())
        .select_from(Notification)
        .where(
            and_(
                Notification.user_id == user_id,
                Notification.is_read == False
            )
        )
    )
    count = result.scalar_one() or 0
    return count


async def mark_as_read(
    session: AsyncSession,
    notification_id: int,
    user_id: int
) -> Dict:
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
            and_(
                Notification.id == notification_id,
                Notification.user_id == user_id
            )
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
    
    return {
        "id": notification.id,
        "user_id": notification.user_id,
        "type": notification.type,
        "title": notification.title,
        "message": notification.message,
        "data": json.loads(notification.data) if notification.data else None,
        "is_read": notification.is_read,
        "read_at": notification.read_at.isoformat() if notification.read_at else None,
        "link_url": notification.link_url,
        "created_at": notification.created_at.isoformat() if notification.created_at else None,
    }


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
        .where(
            and_(
                Notification.user_id == user_id,
                Notification.is_read == False
            )
        )
        .values(
            is_read=True,
            read_at=utcnow()
        )
        .returning(Notification.id)
    )
    
    marked_ids = result.scalars().all()
    count = len(marked_ids)
    
    await session.flush()
    
    return count

