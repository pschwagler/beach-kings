"""Push token registration routes for mobile push notifications."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.auth_dependencies import require_user
from backend.database.db import get_db_session
from backend.api.routes import limiter
from backend.models.schemas import (
    RegisterPushTokenRequest,
    PushTokenResponse,
    UnregisterPushInstallationRequest,
)
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
        device_token, unregister_secret = await push_service.register_installation(
            session, user_id, body.token, body.platform, body.installation_id
        )
        return PushTokenResponse(
            id=device_token.id,
            token=device_token.token,
            platform=device_token.platform,
            installation_id=(
                device_token.installation_id
                if isinstance(getattr(device_token, "installation_id", None), str)
                else None
            ),
            unregister_secret=unregister_secret,
            created_at=device_token.created_at.isoformat() if device_token.created_at else "",
        )
    except Exception as exc:
        logger.error("push_token_registration_failed error_code=%s", type(exc).__name__)
        raise HTTPException(status_code=500, detail="Failed to register push token")


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
        deleted = await push_service.unregister_token(session, user_id, body.token)
        if not deleted:
            raise HTTPException(status_code=404, detail="Token not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("push_token_unregister_failed error_code=%s", type(exc).__name__)
        raise HTTPException(status_code=500, detail="Failed to unregister push token")


@router.post("/api/push-installations/unregister")
@limiter.limit("20/minute")
async def unregister_push_installation(
    request: Request,
    body: UnregisterPushInstallationRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Retire an installation without reviving an expired auth session."""
    try:
        deleted = await push_service.unregister_installation(
            session, body.installation_id, body.unregister_secret
        )
        if not deleted:
            raise HTTPException(status_code=404, detail="Installation not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("push_installation_unregister_failed error_code=%s", type(exc).__name__)
        raise HTTPException(status_code=500, detail="Failed to unregister push installation")
