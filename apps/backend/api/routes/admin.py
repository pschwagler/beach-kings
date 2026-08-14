"""Admin, feedback, settings, and WhatsApp route handlers."""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import exists, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.db import get_db_session
from backend.database.models import Feedback, PlatformRoleAssignment, Player, User
from backend.services import data_service, email_service, role_service, settings_service
from backend.services.platform.redis_service import redis_get, redis_set
from backend.api.auth_dependencies import (
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
    except Exception:
        logger.exception("Error communicating with WhatsApp service")
        raise HTTPException(status_code=500, detail="Error communicating with WhatsApp service.")


# ---------------------------------------------------------------------------
# Settings endpoints (scoped keys)
# ---------------------------------------------------------------------------


@router.get("/api/settings/{key}", response_model=dict)
async def get_setting_value(
    key: str,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Get a setting value (system_admin)."""
    try:
        value = await data_service.get_setting(session, key)
        return {"key": key, "value": value}
    except Exception:
        logger.exception(f"Error getting setting: {key}")
        raise HTTPException(status_code=500, detail="Error getting setting.")


@router.put("/api/settings/{key}", response_model=dict)
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
    except Exception:
        logger.exception(f"Error setting value: {key}")
        raise HTTPException(status_code=500, detail="Error setting value.")


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
            category=payload.category,
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
                category=payload.category,
            )
        except Exception as email_error:
            logger.error(f"Failed to send feedback email: {str(email_error)}")

        response_data = {
            "id": feedback.id,
            "user_id": feedback.user_id,
            "feedback_text": feedback.feedback_text,
            "category": feedback.category,
            "email": feedback.email,
            "is_resolved": feedback.is_resolved,
            "created_at": feedback.created_at.isoformat(),
            "user_name": user_name if current_user else None,
        }

        return response_data

    except HTTPException:
        raise
    except Exception:
        logger.exception("Error submitting feedback")
        raise HTTPException(status_code=500, detail="Error submitting feedback. Please try again.")


@router.get("/api/admin-view/feedback", response_model=List[FeedbackResponse])
async def get_all_feedback(
    user: dict = Depends(require_system_admin), session: AsyncSession = Depends(get_db_session)
):
    """
    Get all feedback submissions.
    Only accessible to system admins.
    """
    try:
        from sqlalchemy.orm import aliased

        player_alias = aliased(Player)
        result = await session.execute(
            select(Feedback, player_alias.full_name)
            .outerjoin(player_alias, player_alias.user_id == Feedback.user_id)
            .order_by(Feedback.created_at.desc())
        )
        rows = result.all()

        return [
            {
                "id": fb.id,
                "user_id": fb.user_id,
                "feedback_text": fb.feedback_text,
                "category": fb.category,
                "email": fb.email,
                "is_resolved": fb.is_resolved,
                "created_at": fb.created_at.isoformat(),
                "user_name": player_name,
            }
            for fb, player_name in rows
        ]

    except HTTPException:
        raise
    except Exception:
        logger.exception("Error getting feedback")
        raise HTTPException(status_code=500, detail="Error getting feedback.")


@router.patch("/api/admin-view/feedback/{feedback_id}/resolve", response_model=FeedbackResponse)
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
            "category": feedback.category,
            "email": feedback.email,
            "is_resolved": feedback.is_resolved,
            "created_at": feedback.created_at.isoformat(),
            "user_name": user_name,
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("Error updating feedback resolution")
        raise HTTPException(status_code=500, detail="Error updating feedback resolution.")


# ---------------------------------------------------------------------------
# Admin view endpoints
# ---------------------------------------------------------------------------


class RoleChangeRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


def _role_history_item(assignment: PlatformRoleAssignment) -> dict:
    return role_service.assignment_dict(assignment)


@router.get("/api/admin-view/users")
async def get_admin_users(
    search: str | None = Query(default=None, max_length=100),
    account_status: str | None = Query(
        default=None, pattern="^(active|unverified|deletion_scheduled|deleted)$"
    ),
    moderation_status: str | None = Query(default=None, pattern="^(active|suspended|banned)$"),
    role_status: str | None = Query(default=None, pattern="^(admin|not_admin)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    actor: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Search user accounts with current role state and complete role history."""
    active_role = exists(
        select(PlatformRoleAssignment.id).where(
            PlatformRoleAssignment.user_id == User.id,
            PlatformRoleAssignment.role == role_service.SYSTEM_ADMIN,
            PlatformRoleAssignment.revoked_at.is_(None),
        )
    )
    player_name = (
        select(Player.full_name)
        .where(Player.user_id == User.id, Player.is_placeholder.is_(False))
        .order_by(Player.id)
        .limit(1)
        .scalar_subquery()
    )
    filters = []
    if search and (term := search.strip()):
        pattern = f"%{term.lower()}%"
        filters.append(
            or_(
                func.lower(func.coalesce(User.email, "")).like(pattern),
                func.lower(func.coalesce(User.phone_number, "")).like(pattern),
                func.lower(func.coalesce(player_name, "")).like(pattern),
                func.cast(User.id, type_=User.phone_number.type).like(f"%{term}%"),
            )
        )
    if account_status == "active":
        filters.extend(
            [
                User.is_verified.is_(True),
                User.deleted_at.is_(None),
                User.deletion_scheduled_at.is_(None),
            ]
        )
    elif account_status == "unverified":
        filters.append(User.is_verified.is_(False))
    elif account_status == "deletion_scheduled":
        filters.append(User.deletion_scheduled_at.isnot(None))
    elif account_status == "deleted":
        filters.append(User.deleted_at.isnot(None))
    if moderation_status:
        filters.append(User.moderation_status == moderation_status)
    if role_status == "admin":
        filters.append(active_role)
    elif role_status == "not_admin":
        filters.append(~active_role)

    count_stmt = select(func.count()).select_from(User).where(*filters)
    total = int((await session.execute(count_stmt)).scalar_one())
    rows = (
        await session.execute(
            select(User, player_name.label("full_name"), active_role.label("is_system_admin"))
            .where(*filters)
            .order_by(User.created_at.desc(), User.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    user_ids = [row.User.id for row in rows]
    histories: dict[int, list[dict]] = {user_id: [] for user_id in user_ids}
    if user_ids:
        assignments = (
            await session.execute(
                select(PlatformRoleAssignment)
                .where(PlatformRoleAssignment.user_id.in_(user_ids))
                .order_by(
                    PlatformRoleAssignment.granted_at.desc(),
                    PlatformRoleAssignment.id.desc(),
                )
            )
        ).scalars()
        for assignment in assignments:
            histories[assignment.user_id].append(_role_history_item(assignment))

    return {
        "items": [
            {
                "id": row.User.id,
                "full_name": row.full_name,
                "email": row.User.email,
                "phone_number": row.User.phone_number,
                "auth_provider": row.User.auth_provider,
                "is_verified": row.User.is_verified,
                "created_at": row.User.created_at,
                "deletion_scheduled_at": row.User.deletion_scheduled_at,
                "deleted_at": row.User.deleted_at,
                "moderation_status": row.User.moderation_status,
                "moderation_expires_at": row.User.moderation_expires_at,
                "is_system_admin": row.is_system_admin,
                "role_history": histories[row.User.id],
            }
            for row in rows
        ],
        "page": page,
        "page_size": page_size,
        "total": total,
        "pages": (total + page_size - 1) // page_size,
    }


@router.post("/api/admin-view/users/{user_id}/roles/system_admin", status_code=201)
async def grant_admin_role(
    user_id: int,
    payload: RoleChangeRequest,
    actor: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    try:
        assignment = await role_service.grant_system_admin(
            session, user_id, actor["id"], payload.reason
        )
        return _role_history_item(assignment)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/api/admin-view/users/{user_id}/roles/system_admin/revoke")
async def revoke_admin_role(
    user_id: int,
    payload: RoleChangeRequest,
    actor: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    try:
        assignment = await role_service.revoke_system_admin(
            session, user_id, actor["id"], payload.reason
        )
        return _role_history_item(assignment)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/api/admin-view/config", response_model=dict)
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
    except Exception:
        logger.exception("Error getting admin config")
        raise HTTPException(status_code=500, detail="Error getting admin config.")


@router.put("/api/admin-view/config", response_model=dict)
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
    except Exception:
        logger.exception("Error updating admin config")
        raise HTTPException(status_code=500, detail="Error updating admin config.")


# ---------------------------------------------------------------------------
# Platform stats endpoint
# ---------------------------------------------------------------------------

PLATFORM_STATS_CACHE_KEY = "admin:platform_stats"
PLATFORM_STATS_TTL = 3600  # 1 hour


@router.get("/api/admin-view/stats", response_model=dict)
async def get_platform_stats(
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Get platform-wide summary stats for the admin dashboard.

    Returns total and last-30-day counts for key entities.
    Results are cached in Redis for 1 hour.
    """
    # Try cache first
    try:
        cached = await redis_get(PLATFORM_STATS_CACHE_KEY)
        if cached:
            return json.loads(cached)
    except Exception as e:
        logger.warning(f"Redis cache read failed for platform stats: {e}")

    # Query fresh stats
    try:
        # (label, table, recent_where_clause)
        thirty_days_ago = "NOW() - INTERVAL '30 days'"
        tables = [
            ("Players", "players", f"created_at >= {thirty_days_ago}"),
            ("Users", "users", f"created_at >= {thirty_days_ago}"),
            ("Leagues", "leagues", f"created_at >= {thirty_days_ago}"),
            ("Seasons", "seasons", f"created_at >= {thirty_days_ago}"),
            (
                "Games",
                "matches",
                f"session_id IN (SELECT id FROM sessions WHERE created_at >= {thirty_days_ago})",
            ),
            ("Sessions", "sessions", f"created_at >= {thirty_days_ago}"),
        ]

        stats = []
        for label, table, recent_where in tables:
            total_q = await session.execute(text(f"SELECT COUNT(*) FROM {table}"))
            total = total_q.scalar()

            recent_q = await session.execute(
                text(f"SELECT COUNT(*) FROM {table} WHERE {recent_where}")
            )
            recent = recent_q.scalar()

            stats.append({"label": label, "total": total, "last_30_days": recent})

        # Courts — approved only
        court_total_q = await session.execute(
            text("SELECT COUNT(*) FROM courts WHERE status = 'approved'")
        )
        court_total = court_total_q.scalar()

        court_recent_q = await session.execute(
            text(
                "SELECT COUNT(*) FROM courts "
                "WHERE status = 'approved' AND created_at >= NOW() - INTERVAL '30 days'"
            )
        )
        court_recent = court_recent_q.scalar()

        stats.append({"label": "Courts", "total": court_total, "last_30_days": court_recent})

        result = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "stats": stats,
        }

        # Cache result (best-effort)
        try:
            await redis_set(PLATFORM_STATS_CACHE_KEY, json.dumps(result), PLATFORM_STATS_TTL)
        except Exception as e:
            logger.warning(f"Redis cache write failed for platform stats: {e}")

        return result

    except Exception as e:
        logger.error(f"Error fetching platform stats: {e}")
        raise HTTPException(status_code=500, detail="Error fetching platform stats.")


# ---------------------------------------------------------------------------
# Recent players endpoint
# ---------------------------------------------------------------------------


@router.get("/api/admin-view/players/recent", response_model=list)
async def get_recent_players(
    limit: int = 50,
    include_unregistered: bool = False,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Get recently created players for the admin dashboard.

    Returns players ordered by created_at desc, with a flag indicating
    whether they have an associated user account.

    Args:
        limit: Max number of players to return (capped at 200).
        include_unregistered: If True, include placeholder/unregistered players.
    """
    try:
        capped_limit = min(limit, 200)

        stmt = (
            select(
                Player.id,
                Player.full_name,
                Player.is_placeholder,
                Player.user_id,
                Player.created_at,
                User.phone_number,
                User.auth_provider,
            )
            .outerjoin(User, User.id == Player.user_id)
            .order_by(Player.created_at.desc())
            .limit(capped_limit)
        )

        if not include_unregistered:
            stmt = stmt.where(Player.is_placeholder == False)  # noqa: E712

        result = await session.execute(stmt)
        rows = result.all()

        return [
            {
                "id": row.id,
                "full_name": row.full_name,
                "is_placeholder": row.is_placeholder,
                "has_user": row.user_id is not None,
                "auth_provider": row.auth_provider,
                "phone_number": row.phone_number,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ]

    except Exception:
        logger.exception("Error fetching recent players")
        raise HTTPException(status_code=500, detail="Error fetching recent players.")


# ---------------------------------------------------------------------------
# WhatsApp proxy endpoints
# ---------------------------------------------------------------------------


@router.get("/api/whatsapp/qr", response_model=dict)
async def whatsapp_qr(user: dict = Depends(require_system_admin)):
    """Proxy endpoint for WhatsApp QR code. System admin only."""
    return await proxy_whatsapp_request("GET", "/api/whatsapp/qr")


@router.get("/api/whatsapp/status", response_model=dict)
async def whatsapp_status(user: dict = Depends(require_system_admin)):
    """Proxy endpoint for WhatsApp authentication status. System admin only."""
    return await proxy_whatsapp_request("GET", "/api/whatsapp/status")


@router.post("/api/whatsapp/initialize", response_model=dict)
async def whatsapp_initialize(user: dict = Depends(require_system_admin)):
    """Proxy endpoint for initializing WhatsApp client. System admin only."""
    return await proxy_whatsapp_request("POST", "/api/whatsapp/initialize")


@router.post("/api/whatsapp/logout", response_model=dict)
async def whatsapp_logout(user: dict = Depends(require_system_admin)):
    """Proxy endpoint for logging out of WhatsApp. System admin only."""
    return await proxy_whatsapp_request("POST", "/api/whatsapp/logout")


@router.get("/api/whatsapp/groups", response_model=dict)
async def whatsapp_groups(user: dict = Depends(require_system_admin)):
    """Proxy endpoint for fetching WhatsApp group chats. System admin only."""
    return await proxy_whatsapp_request("GET", "/api/whatsapp/groups")


@router.post("/api/whatsapp/send", response_model=dict)
async def whatsapp_send(request: Request, user: dict = Depends(require_system_admin)):
    """Proxy endpoint for sending WhatsApp messages. System admin only."""
    body = await request.json()
    return await proxy_whatsapp_request("POST", "/api/whatsapp/send", body=body)


@router.get("/api/whatsapp/config", response_model=dict)
async def get_whatsapp_config(
    user: dict = Depends(require_system_admin), session: AsyncSession = Depends(get_db_session)
):
    """Get WhatsApp configuration (selected group for automated messages). System admin only."""
    try:
        group_id = await data_service.get_setting(session, "whatsapp_group_id")
        return {
            "success": True,
            "group_id": group_id,
        }
    except Exception:
        logger.exception("Error loading WhatsApp config")
        raise HTTPException(status_code=500, detail="Error loading WhatsApp config.")


@router.post("/api/whatsapp/config", response_model=dict)
async def set_whatsapp_config(
    request: Request,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Set WhatsApp configuration (selected group for automated messages). System admin only."""
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
    except Exception:
        logger.exception("Error saving WhatsApp config")
        raise HTTPException(status_code=500, detail="Error saving WhatsApp config.")
