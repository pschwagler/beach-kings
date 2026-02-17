"""Notification and WebSocket route handlers."""

import asyncio
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.db import get_db_session
from backend.services import auth_service, notification_service
from backend.services.websocket_manager import get_websocket_manager
from backend.api.auth_dependencies import require_user
from backend.models.schemas import (
    NotificationResponse,
    NotificationListResponse,
    UnreadCountResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/notifications", response_model=NotificationListResponse)
async def get_notifications(
    limit: int = 50,
    offset: int = 0,
    unread_only: bool = False,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Get user notifications with pagination."""
    try:
        user_id = user.get("id")
        result = await notification_service.get_user_notifications(
            session, user_id, limit=limit, offset=offset, unread_only=unread_only
        )
        return result
    except Exception as e:
        logger.error(f"Error fetching notifications: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching notifications: {str(e)}")


@router.get("/api/notifications/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    user: dict = Depends(require_user), session: AsyncSession = Depends(get_db_session)
):
    """Get unread notification count for user."""
    try:
        user_id = user.get("id")
        count = await notification_service.get_unread_count(session, user_id)
        return {"count": count}
    except Exception as e:
        logger.error(f"Error fetching unread count: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching unread count: {str(e)}")


@router.put("/api/notifications/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_as_read(
    notification_id: int,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Mark a single notification as read."""
    try:
        user_id = user.get("id")
        notification = await notification_service.mark_as_read(session, notification_id, user_id)
        return notification
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error marking notification as read: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error marking notification as read: {str(e)}"
        )


@router.put("/api/notifications/mark-all-read")
async def mark_all_notifications_as_read(
    user: dict = Depends(require_user), session: AsyncSession = Depends(get_db_session)
):
    """Mark all user notifications as read."""
    try:
        user_id = user.get("id")
        count = await notification_service.mark_all_as_read(session, user_id)
        return {"success": True, "count": count}
    except Exception as e:
        logger.error(f"Error marking all notifications as read: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error marking all notifications as read: {str(e)}"
        )


@router.websocket("/api/ws/notifications")
async def websocket_notifications(websocket: WebSocket):
    """
    WebSocket endpoint for real-time notification delivery.

    Requires JWT token in query parameter: ?token=<jwt_token>
    """
    await websocket.accept()

    # Get token from query parameters
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008, reason="Missing authentication token")
        return

    # Verify token
    payload = auth_service.verify_token(token)
    if payload is None:
        await websocket.close(code=1008, reason="Invalid authentication token")
        return

    # Get user_id from token
    user_id = payload.get("user_id")
    if user_id is None:
        await websocket.close(code=1008, reason="Invalid token payload")
        return

    # Register connection
    manager = get_websocket_manager()
    await manager.connect(user_id, websocket)

    try:
        # Keep connection alive and handle ping/pong with timeout
        timeout_seconds = 30  # 30 seconds timeout
        last_activity = datetime.utcnow()

        while True:
            try:
                # Wait for client message with timeout
                data = await asyncio.wait_for(websocket.receive_text(), timeout=timeout_seconds)

                # Update activity timestamp
                last_activity = datetime.utcnow()
                await manager.update_activity(websocket)

                # Handle ping messages (client sends "ping", server responds "pong")
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                # Check if connection has been inactive too long
                if datetime.utcnow() - last_activity > timedelta(seconds=timeout_seconds):
                    logger.info(f"WebSocket timeout for user {user_id}, closing connection")
                    await websocket.close(code=1000, reason="Connection timeout")
                    break
                # Send ping to check if connection is still alive
                try:
                    await websocket.send_text("ping")
                except Exception:
                    # Connection is dead, break loop
                    break
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for user {user_id}")
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
    finally:
        # Clean up connection
        await manager.disconnect(user_id, websocket)
