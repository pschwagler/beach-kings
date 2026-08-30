"""Direct messaging route handlers."""

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.db import get_db_session
from backend.services import direct_message_service, interaction_policy, message_write_policy
from backend.api.auth_dependencies import require_verified_player
from backend.api.routes import limiter
from backend.models.schemas import (
    SendMessageRequest,
    DirectMessageResponse,
    ConversationListResponse,
    ThreadResponse,
    UnreadCountResponse,
    ConversationVisibilityRequest,
    ConversationVisibilityResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class MarkReadResponse(BaseModel):
    """Response from marking a thread as read."""

    status: str
    marked_count: int


def _page_offset(page: int, page_size: int) -> int:
    """Calculate pagination offset from page number and page size."""
    return (page - 1) * page_size


@router.get("/api/messages/conversations", response_model=ConversationListResponse)
@limiter.limit("60/minute")
async def get_conversations(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    folder: Literal["inbox", "hidden"] = Query("inbox"),
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Get conversation list for the current user, sorted by most recent message."""
    try:
        result = await direct_message_service.get_conversations(
            session,
            user["player_id"],
            limit=page_size,
            offset=_page_offset(page, page_size),
            folder=folder,
        )
        return result
    except Exception as e:
        logger.error(f"Error fetching conversations: {e}")
        raise HTTPException(status_code=500, detail="Error fetching conversations")


@router.get("/api/messages/conversations/{player_id}", response_model=ThreadResponse)
@limiter.limit("60/minute")
async def get_thread(
    request: Request,
    player_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Get messages in a thread with a specific player (newest first)."""
    try:
        result = await direct_message_service.get_thread(
            session,
            user["player_id"],
            player_id,
            limit=page_size,
            offset=_page_offset(page, page_size),
        )
        return result
    except interaction_policy.InteractionUnavailable:
        raise HTTPException(status_code=409, detail="Interaction unavailable")
    except Exception as e:
        logger.error(f"Error fetching thread: {e}")
        raise HTTPException(status_code=500, detail="Error fetching thread")


@router.post("/api/messages/send", response_model=DirectMessageResponse)
@limiter.limit("30/minute")
async def send_message(
    request: Request,
    payload: SendMessageRequest,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Send a direct message to another active player."""
    try:
        result = await direct_message_service.send_message(
            session,
            user["player_id"],
            payload.receiver_player_id,
            payload.message_text,
        )
        return result
    except interaction_policy.InteractionUnavailable:
        raise HTTPException(status_code=409, detail="Interaction unavailable")
    except message_write_policy.MessageWritesUnavailable:
        raise HTTPException(status_code=503, detail="Messaging is temporarily unavailable")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error sending message: {e}")
        raise HTTPException(status_code=500, detail="Error sending message")


@router.put("/api/messages/conversations/{player_id}/read", response_model=MarkReadResponse)
@limiter.limit("60/minute")
async def mark_thread_read(
    request: Request,
    player_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Mark all messages from a specific player as read."""
    try:
        count = await direct_message_service.mark_thread_read(
            session, user["player_id"], player_id
        )
        return MarkReadResponse(status="ok", marked_count=count)
    except interaction_policy.InteractionUnavailable:
        raise HTTPException(status_code=409, detail="Interaction unavailable")
    except Exception as e:
        logger.error(f"Error marking thread as read: {e}")
        raise HTTPException(status_code=500, detail="Error marking thread as read")


@router.put(
    "/api/messages/conversations/{player_id}/visibility",
    response_model=ConversationVisibilityResponse,
)
@limiter.limit("30/minute")
async def set_conversation_visibility(
    request: Request,
    player_id: int,
    payload: ConversationVisibilityRequest,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Hide or restore one conversation for the current player."""
    try:
        hidden = await direct_message_service.set_conversation_hidden(
            session,
            user["player_id"],
            player_id,
            hidden=payload.hidden,
        )
        return {"hidden": hidden}
    except interaction_policy.InteractionUnavailable:
        raise HTTPException(status_code=409, detail="Interaction unavailable")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Error updating conversation visibility: %s", exc)
        raise HTTPException(status_code=500, detail="Error updating conversation visibility")


@router.get("/api/messages/unread-count", response_model=UnreadCountResponse)
@limiter.limit("60/minute")
async def get_unread_count(
    request: Request,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Get total unread message count across all conversations."""
    try:
        count = await direct_message_service.get_unread_count(session, user["player_id"])
        return {"count": count}
    except Exception as e:
        logger.error(f"Error fetching unread count: {e}")
        raise HTTPException(status_code=500, detail="Error fetching unread count")
