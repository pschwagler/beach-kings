"""Admin, feedback, settings, and WhatsApp route handlers."""

import logging
import os
from typing import Dict, Any, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.db import get_db_session
from backend.database.models import Player, Feedback
from backend.services import data_service, email_service, settings_service
from backend.api.auth_dependencies import (
    get_current_user,
    get_current_user_optional,
    require_system_admin,
)
from backend.models.schemas import FeedbackCreate, FeedbackResponse

logger = logging.getLogger(__name__)
router = APIRouter()

# WhatsApp service URL
WHATSAPP_SERVICE_URL = os.getenv("WHATSAPP_SERVICE_URL", "http://localhost:3001")

# Default timeout for WhatsApp service requests (in seconds)
WHATSAPP_REQUEST_TIMEOUT = 30.0


async def proxy_whatsapp_request(
    method: str,
    path: str,
    body: Optional[Dict[Any, Any]] = None,
    timeout: float = WHATSAPP_REQUEST_TIMEOUT,
) -> Dict[Any, Any]:
    """
    Proxy helper function for WhatsApp service requests.
    Handles common error cases and timeouts.

    Args:
        method: HTTP method (GET, POST, etc.)
        path: API path (e.g., "/api/whatsapp/status")
        body: Optional request body for POST requests
        timeout: Request timeout in seconds

    Returns:
        dict: JSON response from WhatsApp service

    Raises:
        HTTPException: With appropriate status code and message
    """
    url = f"{WHATSAPP_SERVICE_URL}{path}"

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if method.upper() == "GET":
                response = await client.get(url)
            elif method.upper() == "POST":
                response = await client.post(url, json=body)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")

            # Raise for 4xx/5xx status codes
            response.raise_for_status()

            return response.json()

    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp service is not available. Make sure it's running on port 3001.",
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504, detail=f"WhatsApp service request timed out after {timeout} seconds."
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code, detail=f"WhatsApp service error: {e.response.text}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error communicating with WhatsApp service: {str(e)}"
        )


# ---------------------------------------------------------------------------
# Settings endpoints (scoped keys)
# ---------------------------------------------------------------------------


@router.get("/api/settings/{key}")
async def get_setting_value(
    key: str,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Get a setting value (system_admin)."""
    try:
        value = await data_service.get_setting(session, key)
        return {"key": key, "value": value}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting setting: {str(e)}")


@router.put("/api/settings/{key}")
async def set_setting_value(
    key: str,
    request: Request,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Set a setting value (system_admin)."""
    try:
        body = await request.json()
        if "value" not in body:
            raise HTTPException(status_code=400, detail="value is required")
        await data_service.set_setting(session, key, str(body["value"]))
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error setting value: {str(e)}")


# ---------------------------------------------------------------------------
# Feedback endpoints
# ---------------------------------------------------------------------------


@router.post("/api/feedback", response_model=FeedbackResponse)
async def submit_feedback(
    payload: FeedbackCreate,
    session: AsyncSession = Depends(get_db_session),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """
    Submit user feedback. Can be submitted by authenticated or anonymous users.
    If authenticated, the user_id will be associated with the feedback.
    """
    try:
        feedback = Feedback(
            user_id=current_user["id"] if current_user else None,
            feedback_text=payload.feedback_text,
            email=payload.email,
            is_resolved=False,
        )

        session.add(feedback)
        await session.commit()
        await session.refresh(feedback)

        # Send email notification (non-blocking - don't fail if email fails)
        try:
            user_name = None
            user_phone = None

            if current_user:
                player_result = await session.execute(
                    select(Player).where(Player.user_id == current_user["id"])
                )
                player = player_result.scalar_one_or_none()
                if player:
                    user_name = player.full_name
                user_phone = current_user.get("phone_number")

            await email_service.send_feedback_email(
                feedback_text=payload.feedback_text,
                contact_email=payload.email,
                user_name=user_name,
                user_phone=user_phone,
                timestamp=feedback.created_at,
                session=session,
            )
        except Exception as email_error:
            logger.error(f"Failed to send feedback email: {str(email_error)}")

        response_data = {
            "id": feedback.id,
            "user_id": feedback.user_id,
            "feedback_text": feedback.feedback_text,
            "email": feedback.email,
            "is_resolved": feedback.is_resolved,
            "created_at": feedback.created_at.isoformat(),
            "user_name": user_name if current_user else None,
        }

        return response_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting feedback: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error submitting feedback: {str(e)}")


@router.get("/api/admin-view/feedback", response_model=List[FeedbackResponse])
async def get_all_feedback(
    user: dict = Depends(require_system_admin), session: AsyncSession = Depends(get_db_session)
):
    """
    Get all feedback submissions.
    Only accessible to system admins.
    """
    try:
        result = await session.execute(select(Feedback).order_by(Feedback.created_at.desc()))
        feedback_list = result.scalars().all()

        response_data = []
        for feedback in feedback_list:
            user_name = None
            if feedback.user_id:
                player_result = await session.execute(
                    select(Player).where(Player.user_id == feedback.user_id)
                )
                player = player_result.scalar_one_or_none()
                if player:
                    user_name = player.full_name

            response_data.append(
                {
                    "id": feedback.id,
                    "user_id": feedback.user_id,
                    "feedback_text": feedback.feedback_text,
                    "email": feedback.email,
                    "is_resolved": feedback.is_resolved,
                    "created_at": feedback.created_at.isoformat(),
                    "user_name": user_name,
                }
            )

        return response_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting feedback: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting feedback: {str(e)}")


@router.patch("/api/admin-view/feedback/{feedback_id}/resolve")
async def update_feedback_resolution(
    feedback_id: int,
    request: Request,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Update feedback resolution status. Only accessible to system admins."""
    try:
        body = await request.json()
        is_resolved = body.get("is_resolved", False)

        result = await session.execute(select(Feedback).where(Feedback.id == feedback_id))
        feedback = result.scalar_one_or_none()

        if not feedback:
            raise HTTPException(status_code=404, detail="Feedback not found")

        feedback.is_resolved = is_resolved
        await session.commit()
        await session.refresh(feedback)

        user_name = None
        if feedback.user_id:
            player_result = await session.execute(
                select(Player).where(Player.user_id == feedback.user_id)
            )
            player = player_result.scalar_one_or_none()
            if player:
                user_name = player.full_name

        return {
            "id": feedback.id,
            "user_id": feedback.user_id,
            "feedback_text": feedback.feedback_text,
            "email": feedback.email,
            "is_resolved": feedback.is_resolved,
            "created_at": feedback.created_at.isoformat(),
            "user_name": user_name,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating feedback resolution: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating feedback resolution: {str(e)}"
        )


# ---------------------------------------------------------------------------
# Admin view endpoints
# ---------------------------------------------------------------------------


@router.get("/api/admin-view/config")
async def get_admin_config(
    user: dict = Depends(require_system_admin), session: AsyncSession = Depends(get_db_session)
):
    """Get admin configuration settings. Only accessible to system admins."""
    try:
        enable_sms = await settings_service.get_bool_setting(
            session, "enable_sms", env_var="ENABLE_SMS", default=True
        )
        enable_email = await settings_service.get_bool_setting(
            session, "enable_email", env_var="ENABLE_EMAIL", default=True
        )

        log_level_setting = await data_service.get_setting(session, "log_level")
        if log_level_setting:
            log_level_name = log_level_setting.upper()
        else:
            root_logger = logging.getLogger()
            log_level_name = logging.getLevelName(root_logger.level)

        return {
            "enable_sms": enable_sms,
            "enable_email": enable_email,
            "log_level": log_level_name,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting admin config: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting admin config: {str(e)}")


@router.put("/api/admin-view/config")
async def update_admin_config(
    request: Request,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Update admin configuration settings. Only accessible to system admins."""
    try:
        body = await request.json()

        if "enable_sms" in body:
            enable_sms = bool(body["enable_sms"])
            await data_service.set_setting(
                session, "enable_sms", "true" if enable_sms else "false"
            )
            await settings_service.invalidate_settings_cache()

        if "enable_email" in body:
            enable_email = bool(body["enable_email"])
            await data_service.set_setting(
                session, "enable_email", "true" if enable_email else "false"
            )
            await settings_service.invalidate_settings_cache()

        if "log_level" in body:
            log_level = str(body["log_level"]).upper()
            valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR"]
            if log_level not in valid_levels:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid log_level. Must be one of: {', '.join(valid_levels)}",
                )

            try:
                numeric_level = getattr(logging, log_level, logging.INFO)
                root_logger = logging.getLogger()
                root_logger.setLevel(numeric_level)
                for logger_name in logging.Logger.manager.loggerDict:
                    existing_logger = logging.getLogger(logger_name)
                    existing_logger.setLevel(numeric_level)
                logger.info(f"Log level changed to {log_level} at runtime")
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to apply log level change at runtime: {str(e)}",
                )

            await data_service.set_setting(session, "log_level", log_level)
            await settings_service.invalidate_settings_cache()

        enable_sms = await settings_service.get_bool_setting(
            session, "enable_sms", env_var="ENABLE_SMS", default=True
        )
        enable_email = await settings_service.get_bool_setting(
            session, "enable_email", env_var="ENABLE_EMAIL", default=True
        )

        log_level_setting = await data_service.get_setting(session, "log_level")
        if log_level_setting:
            log_level_name = log_level_setting
        else:
            root_logger = logging.getLogger()
            log_level_name = logging.getLevelName(root_logger.level)

        return {
            "enable_sms": enable_sms,
            "enable_email": enable_email,
            "log_level": log_level_name,
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid input: {str(e)}")
    except Exception as e:
        logger.error(f"Error updating admin config: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating admin config: {str(e)}")


# ---------------------------------------------------------------------------
# WhatsApp proxy endpoints
# ---------------------------------------------------------------------------


@router.get("/api/whatsapp/qr")
async def whatsapp_qr(current_user: dict = Depends(get_current_user)):
    """Proxy endpoint for WhatsApp QR code."""
    return await proxy_whatsapp_request("GET", "/api/whatsapp/qr")


@router.get("/api/whatsapp/status")
async def whatsapp_status(current_user: dict = Depends(get_current_user)):
    """Proxy endpoint for WhatsApp authentication status."""
    return await proxy_whatsapp_request("GET", "/api/whatsapp/status")


@router.post("/api/whatsapp/initialize")
async def whatsapp_initialize(current_user: dict = Depends(get_current_user)):
    """Proxy endpoint for initializing WhatsApp client."""
    return await proxy_whatsapp_request("POST", "/api/whatsapp/initialize")


@router.post("/api/whatsapp/logout")
async def whatsapp_logout(current_user: dict = Depends(get_current_user)):
    """Proxy endpoint for logging out of WhatsApp."""
    return await proxy_whatsapp_request("POST", "/api/whatsapp/logout")


@router.get("/api/whatsapp/groups")
async def whatsapp_groups(current_user: dict = Depends(get_current_user)):
    """Proxy endpoint for fetching WhatsApp group chats."""
    return await proxy_whatsapp_request("GET", "/api/whatsapp/groups")


@router.post("/api/whatsapp/send")
async def whatsapp_send(request: Request, current_user: dict = Depends(get_current_user)):
    """Proxy endpoint for sending WhatsApp messages."""
    body = await request.json()
    return await proxy_whatsapp_request("POST", "/api/whatsapp/send", body=body)


@router.get("/api/whatsapp/config")
async def get_whatsapp_config(
    current_user: dict = Depends(get_current_user), session: AsyncSession = Depends(get_db_session)
):
    """Get WhatsApp configuration (selected group for automated messages)."""
    try:
        group_id = await data_service.get_setting(session, "whatsapp_group_id")
        return {
            "success": True,
            "group_id": group_id,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading WhatsApp config: {str(e)}")


@router.post("/api/whatsapp/config")
async def set_whatsapp_config(
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Set WhatsApp configuration (selected group for automated messages)."""
    try:
        body = await request.json()
        group_id = body.get("group_id")

        if not group_id:
            raise HTTPException(status_code=400, detail="group_id is required")

        await data_service.set_setting(session, "whatsapp_group_id", group_id)

        return {
            "success": True,
            "message": "WhatsApp group configuration saved",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving WhatsApp config: {str(e)}")
