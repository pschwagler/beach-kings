"""Match CRUD and photo match route handlers."""

import asyncio
import json
import logging
from datetime import date, datetime
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.routes import limiter
from backend.api.routes.sessions import is_user_admin_of_session_league
from backend.database.db import get_db_session
from backend.database.models import Season, Session, SessionStatus, PhotoMatchJobStatus
from backend.services import data_service, photo_match_service
from backend.api.auth_dependencies import (
    get_current_user,
    require_user,
    make_require_league_member,
)
from backend.models.schemas import CreateMatchRequest, UpdateMatchRequest
from backend.utils.datetime_utils import utcnow

logger = logging.getLogger(__name__)
router = APIRouter()


def _format_sse(event: str, data: dict) -> str:
    """Format event and data as a single SSE message (event + data lines + blank line)."""
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@router.post("/api/matches")
async def create_match(
    match_request: CreateMatchRequest,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Create a new match in a session.

    Request body:
        {
            "league_id": 1,   // Optional (required if session_id not provided)
            "session_id": 1,   // Optional - if provided, use this specific session
            "season_id": 1,    // Optional - if provided, use this specific season (must belong to league_id)
            "date": "11/7/2025",  // Optional - defaults to today's date (only used if session_id not provided)
            "team1_player1_id": 1,
            "team1_player2_id": 2,
            "team2_player1_id": 3,
            "team2_player2_id": 4,
            "team1_score": 21,
            "team2_score": 19,
            "is_public": true,  // Optional, defaults to true
            "is_ranked": true   // Optional, defaults to true
        }

    Returns:
        dict: Created match info
    """
    try:
        # Validate all players are distinct
        player_ids = [
            match_request.team1_player1_id,
            match_request.team1_player2_id,
            match_request.team2_player1_id,
            match_request.team2_player2_id,
        ]
        if len(player_ids) != len(set(player_ids)):
            raise HTTPException(status_code=400, detail="All four players must be distinct")

        session_id = match_request.session_id
        session_obj = None

        # If session_id is provided, use that specific session (for editing mode)
        if session_id:
            session_obj = await data_service.get_session(session, session_id)
            if not session_obj:
                raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

            session_status = session_obj.get("status")
            if session_status != "ACTIVE":
                if session_status not in ("SUBMITTED", "EDITED"):
                    raise HTTPException(
                        status_code=400, detail="Cannot add matches to a session with this status"
                    )
                if session_obj.get("season_id") is None:
                    if not await data_service.can_user_add_match_to_session(
                        session, session_id, session_obj, current_user["id"]
                    ):
                        raise HTTPException(
                            status_code=403,
                            detail="Only session participants can add matches to this session",
                        )
                else:
                    if not await is_user_admin_of_session_league(
                        session, current_user["id"], session_id
                    ):
                        raise HTTPException(
                            status_code=403,
                            detail="Only league admins can add matches to submitted sessions",
                        )
            else:
                if session_obj.get("season_id") is None:
                    if not await data_service.can_user_add_match_to_session(
                        session, session_id, session_obj, current_user["id"]
                    ):
                        raise HTTPException(
                            status_code=403,
                            detail="Only session participants can add matches to this session",
                        )
        else:
            league_id = match_request.league_id
            match_date = match_request.date
            if not match_date:
                today = datetime.now()
                match_date = f"{today.month}/{today.day}/{today.year}"

            player_id = None
            player = await data_service.get_player_by_user_id(session, current_user["id"])
            if player:
                player_id = player["id"]

            if league_id is None:
                new_session = await data_service.create_session(
                    session=session,
                    date=match_date,
                    created_by=player_id,
                )
                session_obj = new_session
                session_id = new_session["id"]
            else:
                season_id = match_request.season_id
                selected_season = None

                if season_id:
                    season_result = await session.execute(
                        select(Season).where(
                            and_(Season.id == season_id, Season.league_id == league_id)
                        )
                    )
                    selected_season = season_result.scalar_one_or_none()
                    if not selected_season:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Season {season_id} not found or does not belong to league {league_id}",
                        )
                else:
                    current_date = date.today()
                    season_result = await session.execute(
                        select(Season)
                        .where(
                            and_(
                                Season.league_id == league_id,
                                Season.start_date <= current_date,
                                Season.end_date >= current_date,
                            )
                        )
                        .order_by(Season.created_at.desc())
                        .limit(1)
                    )
                    selected_season = season_result.scalar_one_or_none()
                    if not selected_season:
                        raise HTTPException(
                            status_code=400,
                            detail=f"League {league_id} does not have an active season. Please provide a season_id or create a season with dates that include today's date.",
                        )

                result = await session.execute(
                    select(Session)
                    .where(
                        and_(
                            Session.date == match_date,
                            Session.season_id == selected_season.id,
                            Session.status == SessionStatus.ACTIVE,
                        )
                    )
                    .with_for_update()
                )
                session_orm = result.scalar_one_or_none()
                if session_orm:
                    session_obj = {
                        "id": session_orm.id,
                        "date": session_orm.date,
                        "name": session_orm.name,
                        "status": session_orm.status.value if session_orm.status else None,
                        "season_id": session_orm.season_id,
                    }
                else:
                    session_obj = None
                if not session_obj:
                    session_obj = await data_service.get_or_create_active_league_session(
                        session=session,
                        league_id=league_id,
                        session_date=match_date,
                        created_by=player_id,
                        season_id=selected_season.id,
                    )
                session_id = session_obj["id"]

        # Create the match using the session's date
        match_id = await data_service.create_match_async(
            session=session,
            match_request=match_request,
            session_id=session_id,
            date=session_obj["date"],
        )

        return {
            "status": "success",
            "message": "Match created successfully",
            "match_id": match_id,
            "session_id": session_id,
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating match: {str(e)}")


@router.put("/api/matches/{match_id}")
async def update_match(
    match_id: int,
    match_request: UpdateMatchRequest,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Update an existing match.

    Args:
        match_id: ID of match to update

    Returns:
        dict: Update status
    """
    try:
        player_ids = [
            match_request.team1_player1_id,
            match_request.team1_player2_id,
            match_request.team2_player1_id,
            match_request.team2_player2_id,
        ]
        if len(player_ids) != len(set(player_ids)):
            raise HTTPException(status_code=400, detail="All four players must be distinct")

        match = await data_service.get_match_async(session, match_id)
        if not match:
            raise HTTPException(status_code=404, detail=f"Match {match_id} not found")

        session_status = match.get("session_status")
        if session_status != "ACTIVE":
            if session_status not in ("SUBMITTED", "EDITED"):
                raise HTTPException(
                    status_code=400, detail="Cannot edit matches in a session with this status"
                )
            session_id = match.get("session_id")
            if not session_id:
                raise HTTPException(status_code=400, detail="Match does not belong to a session")
            session_obj = await data_service.get_session(session, session_id)
            if not session_obj:
                raise HTTPException(status_code=404, detail="Session not found")
            if session_obj.get("season_id") is None:
                player = await data_service.get_player_by_user_id(session, current_user["id"])
                if not player or session_obj.get("created_by") != player["id"]:
                    raise HTTPException(
                        status_code=403,
                        detail="Only the session creator can edit matches in this session",
                    )
            else:
                if not await is_user_admin_of_session_league(
                    session, current_user["id"], session_id
                ):
                    raise HTTPException(
                        status_code=403,
                        detail="Only league admins can edit matches in submitted sessions",
                    )

        player_id = None
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        if player:
            player_id = player["id"]

        success = await data_service.update_match_async(
            session=session, match_id=match_id, match_request=match_request, updated_by=player_id
        )

        if not success:
            raise HTTPException(status_code=404, detail=f"Match {match_id} not found")

        return {"status": "success", "message": "Match updated successfully", "match_id": match_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating match: {str(e)}")


@router.delete("/api/matches/{match_id}")
async def delete_match(
    match_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Delete a match.

    Args:
        match_id: ID of match to delete

    Returns:
        dict: Delete status
    """
    try:
        match = await data_service.get_match_async(session, match_id)
        if not match:
            raise HTTPException(status_code=404, detail=f"Match {match_id} not found")

        session_status = match.get("session_status")
        if session_status != "ACTIVE":
            if session_status not in ("SUBMITTED", "EDITED"):
                raise HTTPException(
                    status_code=400, detail="Cannot delete matches in a session with this status"
                )
            session_id = match.get("session_id")
            if not session_id:
                raise HTTPException(status_code=400, detail="Match does not belong to a session")
            session_obj = await data_service.get_session(session, session_id)
            if not session_obj:
                raise HTTPException(status_code=404, detail="Session not found")
            if session_obj.get("season_id") is None:
                player = await data_service.get_player_by_user_id(session, current_user["id"])
                if not player or session_obj.get("created_by") != player["id"]:
                    raise HTTPException(
                        status_code=403,
                        detail="Only the session creator can delete matches in this session",
                    )
            else:
                if not await is_user_admin_of_session_league(
                    session, current_user["id"], session_id
                ):
                    raise HTTPException(
                        status_code=403,
                        detail="Only league admins can delete matches in submitted sessions",
                    )

        success = await data_service.delete_match_async(session, match_id)

        if not success:
            raise HTTPException(status_code=404, detail=f"Match {match_id} not found")

        return {"status": "success", "message": "Match deleted successfully", "match_id": match_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting match: {str(e)}")


# ============================================================================
# Photo Match Upload Endpoints
# ============================================================================


@router.post("/api/leagues/{league_id}/matches/upload-photo")
@limiter.limit("10/minute")
async def upload_match_photo(
    league_id: int,
    request: Request,
    file: UploadFile = File(...),
    user_prompt: Optional[str] = Form(None),
    season_id: Optional[int] = Form(None),
    session: AsyncSession = Depends(get_db_session),
    current_user: dict = Depends(require_user),
    _league_member=Depends(make_require_league_member),
):
    """
    Upload a photo of game scores for AI processing.

    Validates the file, preprocesses the image (convert to JPEG, downscale to 400px height),
    creates a processing job, and returns job_id for polling.
    """
    try:
        file_content = await file.read()

        is_valid, error_msg = photo_match_service.validate_image_file(
            file_content, file.content_type or "", file.filename or ""
        )
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)

        _, image_base64 = photo_match_service.preprocess_image(file_content)

        session_id = photo_match_service.generate_session_id()

        members = await data_service.list_league_members(session, league_id)

        player = await data_service.get_player_by_user_id(session, current_user["id"])
        player_id = player["id"] if player else None

        session_data = {
            "league_id": league_id,
            "season_id": season_id,
            "user_id": current_user["id"],
            "player_id": player_id,
            "user_prompt": user_prompt,
            "parsed_matches": [],
            "partial_matches": [],
            "raw_response": None,
            "status": "PENDING",
            "matches_created": False,
            "created_match_ids": None,
            "created_at": utcnow().isoformat(),
            "last_updated": utcnow().isoformat(),
        }

        stored = await photo_match_service.store_session_data(session_id, session_data)
        if not stored:
            raise HTTPException(status_code=500, detail="Failed to initialize photo session")

        job_id = await photo_match_service.create_photo_match_job(session, league_id, session_id)

        asyncio.create_task(
            photo_match_service.process_photo_job(
                job_id=job_id,
                league_id=league_id,
                session_id=session_id,
                image_base64=image_base64,
                league_members=members,
            )
        )

        return {"job_id": job_id, "session_id": session_id, "status": "PENDING"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading match photo: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing photo upload: {str(e)}")


@router.post("/api/leagues/{league_id}/matches/photo-sessions/{session_id}/edit")
@limiter.limit("20/minute")
async def edit_photo_results(
    league_id: int,
    session_id: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    current_user: dict = Depends(require_user),
    _league_member=Depends(make_require_league_member),
):
    """Send edit prompt for conversation refinement."""
    try:
        body = await request.json()
        edit_prompt = body.get("edit_prompt")

        if not edit_prompt:
            raise HTTPException(status_code=400, detail="edit_prompt is required")

        session_data = await photo_match_service.get_session_data(session_id)
        if not session_data:
            raise HTTPException(status_code=404, detail="Session not found or expired")

        if session_data.get("league_id") != league_id:
            raise HTTPException(status_code=403, detail="Session does not belong to this league")

        members = await data_service.list_league_members(session, league_id)

        job_id = await photo_match_service.create_photo_match_job(session, league_id, session_id)

        asyncio.create_task(
            photo_match_service.process_clarification_job(
                job_id=job_id,
                league_id=league_id,
                session_id=session_id,
                league_members=members,
                user_prompt=edit_prompt,
            )
        )

        return {"job_id": job_id, "session_id": session_id, "status": "PENDING"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error editing photo results: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing edit: {str(e)}")


@router.get("/api/leagues/{league_id}/matches/photo-jobs/{job_id}/stream")
@limiter.limit("60/minute")
async def stream_photo_job(
    league_id: int,
    job_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    current_user: dict = Depends(require_user),
    _league_member=Depends(make_require_league_member),
):
    """
    Stream photo job progress via Server-Sent Events.

    Intended for one client per job. Emits: partial (partial_matches),
    done (status + result), or error (message). Clients should close the
    stream after receiving done or error.
    """
    try:
        job = await photo_match_service.get_photo_match_job(session, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.league_id != league_id:
            raise HTTPException(status_code=403, detail="Job does not belong to this league")

        async def event_generator():
            try:
                async for event_name, data in photo_match_service.stream_photo_job_events(
                    job_id=job_id,
                    league_id=league_id,
                    session_id=job.session_id,
                ):
                    yield _format_sse(event_name, data)
            except Exception as e:
                logger.exception("Error streaming photo job %s: %s", job_id, e)
                yield _format_sse("error", {"message": "Stream error"})

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error starting photo job stream: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error starting stream")


@router.get("/api/leagues/{league_id}/matches/photo-jobs/{job_id}")
@limiter.limit("60/minute")
async def get_photo_job_status(
    league_id: int,
    job_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    current_user: dict = Depends(require_user),
    _league_member=Depends(make_require_league_member),
):
    """Get status of a photo processing job."""
    try:
        job = await photo_match_service.get_photo_match_job(session, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        if job.league_id != league_id:
            raise HTTPException(status_code=403, detail="Job does not belong to this league")

        response = {
            "job_id": job.id,
            "status": job.status.value,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
            "result": None,
        }

        if job.status == PhotoMatchJobStatus.COMPLETED and job.result_data:
            response["result"] = json.loads(job.result_data)
        elif job.status == PhotoMatchJobStatus.FAILED:
            response["result"] = {"status": "FAILED", "error_message": job.error_message}
        if job.status == PhotoMatchJobStatus.RUNNING:
            session_data = await photo_match_service.get_session_data(job.session_id)
            if session_data and session_data.get("partial_matches"):
                response["partial_matches"] = session_data["partial_matches"]

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting job status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error getting job status: {str(e)}")


@router.post("/api/leagues/{league_id}/matches/photo-sessions/{session_id}/confirm")
@limiter.limit("10/minute")
async def confirm_photo_matches(
    league_id: int,
    session_id: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    current_user: dict = Depends(require_user),
    _league_member=Depends(make_require_league_member),
):
    """Confirm parsed matches and create them in the database."""
    try:
        body = await request.json()
        season_id = body.get("season_id")
        match_date = body.get("match_date")

        if not season_id:
            raise HTTPException(status_code=400, detail="season_id is required")
        if not match_date:
            raise HTTPException(status_code=400, detail="match_date is required")

        session_data = await photo_match_service.get_session_data(session_id)
        if not session_data:
            raise HTTPException(status_code=404, detail="Session not found or expired")

        if session_data.get("league_id") != league_id:
            raise HTTPException(status_code=403, detail="Session does not belong to this league")

        season_result = await session.execute(
            select(Season).where(and_(Season.id == season_id, Season.league_id == league_id))
        )
        if not season_result.scalar_one_or_none():
            raise HTTPException(
                status_code=400, detail="Season not found or does not belong to this league"
            )

        success, match_ids, message = await photo_match_service.create_matches_from_session(
            session, session_id, season_id, match_date
        )

        if not success:
            raise HTTPException(status_code=400, detail=message)

        return {
            "status": "success",
            "message": message,
            "matches_created": len(match_ids),
            "match_ids": match_ids,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error confirming matches: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error creating matches: {str(e)}")


@router.delete("/api/leagues/{league_id}/matches/photo-sessions/{session_id}")
async def cancel_photo_session(
    league_id: int,
    session_id: str,
    session: AsyncSession = Depends(get_db_session),
    current_user: dict = Depends(require_user),
    _league_member=Depends(make_require_league_member),
):
    """Cancel session and cleanup Redis data."""
    try:
        session_data = await photo_match_service.get_session_data(session_id)
        if session_data and session_data.get("league_id") != league_id:
            raise HTTPException(status_code=403, detail="Session does not belong to this league")

        await photo_match_service.cleanup_session(session_id)

        return {"status": "cancelled"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error cancelling session: {str(e)}")
