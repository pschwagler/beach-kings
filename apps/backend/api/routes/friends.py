"""Friend system route handlers."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.db import get_db_session
from backend.services import friend_service
from backend.api.auth_dependencies import require_verified_player
from backend.models.schemas import (
    FriendRequestCreate,
    FriendRequestResponse,
    FriendListResponse,
    FriendBatchStatusRequest,
    FriendBatchStatusResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/api/friends/request", response_model=FriendRequestResponse)
async def send_friend_request(
    payload: FriendRequestCreate,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Send a friend request to another player."""
    try:
        result = await friend_service.send_friend_request(
            session, user["player_id"], payload.receiver_player_id
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error sending friend request: {e}")
        raise HTTPException(status_code=500, detail="Error sending friend request")


@router.post("/api/friends/requests/{request_id}/accept", response_model=FriendRequestResponse)
async def accept_friend_request(
    request_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Accept a pending friend request."""
    try:
        result = await friend_service.accept_friend_request(session, request_id, user["player_id"])
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error accepting friend request: {e}")
        raise HTTPException(status_code=500, detail="Error accepting friend request")


@router.post("/api/friends/requests/{request_id}/decline", status_code=204)
async def decline_friend_request(
    request_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Decline a pending friend request (deletes the row so sender can re-request)."""
    try:
        await friend_service.decline_friend_request(session, request_id, user["player_id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error declining friend request: {e}")
        raise HTTPException(status_code=500, detail="Error declining friend request")


@router.delete("/api/friends/requests/{request_id}")
async def cancel_friend_request(
    request_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Cancel an outgoing friend request."""
    try:
        await friend_service.cancel_friend_request(session, request_id, user["player_id"])
        return {"status": "ok", "message": "Friend request cancelled"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error cancelling friend request: {e}")
        raise HTTPException(status_code=500, detail="Error cancelling friend request")


@router.delete("/api/friends/{player_id}")
async def remove_friend(
    player_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Remove a friend (unfriend)."""
    try:
        await friend_service.remove_friend(session, user["player_id"], player_id)
        return {"status": "ok", "message": "Friend removed"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error removing friend: {e}")
        raise HTTPException(status_code=500, detail="Error removing friend")


@router.get("/api/friends", response_model=FriendListResponse)
async def get_friends(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Get current user's friends list (paginated)."""
    try:
        offset = (page - 1) * page_size
        result = await friend_service.get_friends(session, user["player_id"], limit=page_size, offset=offset)
        return result
    except Exception as e:
        logger.error(f"Error fetching friends: {e}")
        raise HTTPException(status_code=500, detail="Error fetching friends")


@router.get("/api/friends/requests")
async def get_friend_requests(
    direction: str = Query("both", pattern="^(incoming|outgoing|both)$"),
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Get pending friend requests."""
    try:
        requests = await friend_service.get_friend_requests(session, user["player_id"], direction=direction)
        return requests
    except Exception as e:
        logger.error(f"Error fetching friend requests: {e}")
        raise HTTPException(status_code=500, detail="Error fetching friend requests")


@router.get("/api/friends/suggestions")
async def get_friend_suggestions(
    limit: int = Query(10, ge=1, le=50),
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Get friend suggestions based on shared leagues."""
    try:
        suggestions = await friend_service.get_friend_suggestions(session, user["player_id"], limit=limit)
        return suggestions
    except Exception as e:
        logger.error(f"Error fetching friend suggestions: {e}")
        raise HTTPException(status_code=500, detail="Error fetching friend suggestions")


@router.post("/api/friends/batch-status", response_model=FriendBatchStatusResponse)
async def batch_friend_status(
    payload: FriendBatchStatusRequest,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Get friend status for multiple player IDs (for search results)."""
    try:
        result = await friend_service.batch_friend_status(
            session, user["player_id"], payload.player_ids
        )
        return result
    except Exception as e:
        logger.error(f"Error fetching batch friend status: {e}")
        raise HTTPException(status_code=500, detail="Error fetching friend statuses")


@router.get("/api/friends/mutual/{other_player_id}")
async def get_mutual_friends(
    other_player_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Get mutual friends between the current user and another player."""
    try:
        mutual = await friend_service.get_mutual_friends(session, user["player_id"], other_player_id)
        return mutual
    except Exception as e:
        logger.error(f"Error fetching mutual friends: {e}")
        raise HTTPException(status_code=500, detail="Error fetching mutual friends")
