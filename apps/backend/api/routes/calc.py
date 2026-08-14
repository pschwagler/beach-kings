"""Calculation and health check route handlers."""

import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.db import get_db_session
from backend.services.platform import email_service
from backend.services import auth_service, auth_delivery_service
from backend.services.social import message_write_policy
from backend.services.stats.stats_queue import get_stats_queue
from backend.api.auth_dependencies import get_current_user, require_system_admin
from backend.api.routes import limiter

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/api/calculate", response_model=dict)
@router.post("/api/calculate-stats", response_model=dict)
@limiter.limit("5/minute")
async def calculate_stats(
    request: Request,
    current_user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Queue a stats calculation job.

    Request body (optional):
        {
            "league_id": 123  // If provided, calculates league-specific stats
                              // (all seasons in the league). If omitted,
                              // calculates global stats.
        }

    Returns:
        dict: Job ID and status
    """
    try:
        try:
            body = await request.json()
        except Exception:
            body = {}

        league_id = body.get("league_id") if body else None
        calc_type = "league" if league_id else "global"

        queue = get_stats_queue()
        job_id = await queue.enqueue_calculation(session, calc_type, league_id)

        return {
            "job_id": job_id,
            "status": "queued",
            "calc_type": calc_type,
            "league_id": league_id,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error queueing stats calculation: {str(e)}")


@router.get("/api/calculate-stats/status", response_model=dict)
async def get_calculation_status(
    current_user: dict = Depends(get_current_user), session: AsyncSession = Depends(get_db_session)
):
    """
    Get current queue status and recent jobs.

    Returns:
        dict: Queue status with running, pending, and recent jobs
    """
    try:
        queue = get_stats_queue()
        status = await queue.get_queue_status(session)

        return status
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting queue status: {str(e)}")


@router.get("/api/calculate-stats/status/{job_id}", response_model=dict)
async def get_job_status(
    job_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Get status of a specific calculation job.

    Args:
        job_id: Job ID

    Returns:
        dict: Job status
    """
    try:
        queue = get_stats_queue()
        job_status = await queue.get_job_status(session, job_id)

        if not job_status:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

        return job_status
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting job status: {str(e)}")


@router.get("/api/health", response_model=dict)
async def health_check(session: AsyncSession = Depends(get_db_session)):
    """
    Health check endpoint.

    Returns:
        dict: Service status
    """
    try:
        return {"status": "healthy", "message": "API is running"}
    except Exception as e:
        return {"status": "unhealthy", "data_available": False, "message": f"Error: {str(e)}"}


@router.get("/api/ready", response_model=dict)
async def readiness_check(session: AsyncSession = Depends(get_db_session)):
    """Report whether production-facing dependencies are configured."""
    checks = {"database": "ready", "email": "disabled"}
    missing: list[str] = []
    if await email_service.is_enabled(session):
        email_missing = email_service.configuration_issues()
        if email_missing:
            checks["email"] = "misconfigured"
            missing.extend(email_missing)
        else:
            checks["email"] = "ready"

    if os.getenv("ENV", "development").lower() == "production":
        if not auth_delivery_service.delivery_enabled():
            checks["auth_delivery"] = "disabled"
            missing.append("AUTH_DELIVERY_ENABLED=true")
        elif not await auth_delivery_service.heartbeat_is_fresh():
            checks["auth_delivery"] = "unavailable"
            missing.append("auth delivery worker heartbeat")
        else:
            checks["auth_delivery"] = "ready"

        if await auth_service.is_sms_enabled(session):
            sms_vars = ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER")
            sms_missing = [name for name in sms_vars if not os.getenv(name)]
            checks["sms"] = "misconfigured" if sms_missing else "ready"
            missing.extend(sms_missing)
        else:
            checks["sms"] = "disabled"

    message_statuses = await message_write_policy.readiness_statuses(session)
    checks.update(message_statuses)
    for surface, status in message_statuses.items():
        if status == "misconfigured":
            config = message_write_policy.SURFACE_CONFIG[
                message_write_policy.MessageSurface(surface)
            ]
            missing.append(f"{config.setting_key} or {config.env_var}")

    if missing:
        raise HTTPException(
            status_code=503,
            detail={"status": "not_ready", "checks": checks, "missing": missing},
        )

    return {"status": "ready", "checks": checks}
