"""Push token registration routes for mobile push notifications."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.auth_dependencies import require_user
from backend.database.db import get_db_session
from backend.models.schemas import RegisterPushTokenRequest, PushTokenResponse
from backend.services import push_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/api/push-tokens", response_model=PushTokenResponse)
async def register_push_token(
    body: RegisterPushTokenRequest,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Register a device push token for the authenticated user.

    If the token already exists (same device, different user after re-login),
    ownership is transferred to the current user.
    """
    try:
        user_id = user.get("id")
        device_token = await push_service.register_token(
            session, user_id, body.token, body.platform
        )
        return PushTokenResponse(
            id=device_token.id,
            token=device_token.token,
            platform=device_token.platform,
            created_at=device_token.created_at.isoformat()
            if device_token.created_at
            else "",
        )
    except Exception as e:
        logger.error("Error registering push token: %s", e)
        raise HTTPException(
            status_code=500, detail="Failed to register push token"
        )


@router.delete("/api/push-tokens")
async def unregister_push_token(
    body: RegisterPushTokenRequest,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Remove a device push token for the authenticated user.

    Called on logout so the device stops receiving push notifications.
    """
    try:
        user_id = user.get("id")
        deleted = await push_service.unregister_token(
            session, user_id, body.token
        )
        if not deleted:
            raise HTTPException(status_code=404, detail="Token not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error unregistering push token: %s", e)
        raise HTTPException(
            status_code=500, detail="Failed to unregister push token"
        )
