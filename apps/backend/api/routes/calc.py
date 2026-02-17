"""Calculation, loadsheet, and health check route handlers."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.db import get_db_session
from backend.database.models import Season
from backend.services.stats_queue import get_stats_queue
from backend.api.auth_dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/api/loadsheets")
async def load_sheets(current_user: dict = Depends(get_current_user)):
    """
    DISABLED: This endpoint has been disabled.

    TODO: Re-implement to be season-specific and add proper validations.
    This endpoint should:
    - Accept a season_id parameter
    - Only load/import matches for the specified season
    - Add proper data validation
    - Handle errors gracefully
    """
    raise HTTPException(
        status_code=501,
        detail=(
            "This endpoint has been disabled. "
            "It needs to be re-implemented to be season-specific with proper validations. "
            "The function should only load matches for a specific season, not all data."
        ),
    )


@router.post("/api/calculate")
@router.post("/api/calculate-stats")
async def calculate_stats(
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Queue a stats calculation job.

    Request body (optional):
        {
            "league_id": 123  // If provided, calculates league-specific stats (includes all seasons). If omitted, calculates global stats.
            "season_id": 456  // Deprecated: if provided, will get league_id from season and calculate league stats
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
        season_id = body.get("season_id") if body else None  # Backward compatibility

        if season_id and not league_id:
            season_result = await session.execute(select(Season).where(Season.id == season_id))
            season = season_result.scalar_one_or_none()
            if season:
                league_id = season.league_id

        calc_type = "league" if league_id else "global"

        queue = get_stats_queue()
        job_id = await queue.enqueue_calculation(session, calc_type, league_id)

        return {
            "job_id": job_id,
            "status": "queued",
            "calc_type": calc_type,
            "league_id": league_id,
            "season_id": season_id,  # Deprecated, kept for backward compatibility
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error queueing stats calculation: {str(e)}")


@router.get("/api/calculate-stats/status")
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


@router.get("/api/calculate-stats/status/{job_id}")
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


@router.get("/api/health")
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
