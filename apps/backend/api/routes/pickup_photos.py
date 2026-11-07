"""Owner-scoped photo parsing for pickup games; a league is not required."""

from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from backend.api.auth_dependencies import require_user
from backend.api.routes import limiter
from backend.api.routes.feature_flags import require_feature
from backend.database.db import get_db_session
from backend.models.schemas import (
    ConfirmPhotoMatchesRequest,
    EditPhotoResultsRequest,
    PhotoJobResponse,
    PhotoJobStatusResponse,
)
from backend.services import photo_match_service
from backend.services.games import photo_draft_service
from backend.services.games.scoresheet_context import draft_context

router = APIRouter(dependencies=[Depends(require_feature("scoresheet_parsing"))])


async def owned_draft(draft_id, user):
    data = await photo_match_service.get_session_data(draft_id)
    if not data:
        raise HTTPException(404, "Scoresheet expired. Choose the photo again.")
    if data.get("user_id") != user["id"] or data.get("league_id") is not None:
        raise HTTPException(404, "Scoresheet not found")
    return data


@router.post("/api/matches/upload-photo", response_model=PhotoJobResponse)
@limiter.limit("10/minute")
async def upload_pickup_photo(
    request: Request,
    file: UploadFile = File(...),
    user_prompt: str | None = Form(None),
    session=Depends(get_db_session),
    user=Depends(require_user),
):
    return await photo_draft_service.start_upload(session, user, file, prompt=user_prompt)


@router.get("/api/matches/photo-jobs/{job_id}", response_model=PhotoJobStatusResponse)
@limiter.limit("60/minute")
async def pickup_photo_status(
    job_id: int, request: Request, session=Depends(get_db_session), user=Depends(require_user)
):
    job = await photo_match_service.get_photo_match_job(session, job_id)
    if not job or job.user_id != user["id"] or job.league_id is not None:
        raise HTTPException(404, "Scoresheet not found")
    return await photo_draft_service.job_status(job)


@router.post("/api/matches/photo-sessions/{draft_id}/edit", response_model=PhotoJobResponse)
@limiter.limit("20/minute")
async def edit_pickup_photo(
    draft_id: str,
    request: Request,
    body: EditPhotoResultsRequest,
    session=Depends(get_db_session),
    user=Depends(require_user),
):
    draft = await owned_draft(draft_id, user)
    if not body.edit_prompt.strip():
        raise HTTPException(400, "A correction is required")
    members = await draft_context(session, draft_id, draft, user, None)
    job_id = await photo_match_service.create_photo_match_job(
        session, None, draft_id, user_id=user["id"]
    )
    photo_draft_service.spawn(
        photo_match_service.process_clarification_job(
            job_id, None, draft_id, members, body.edit_prompt
        )
    )
    return {"job_id": job_id, "session_id": draft_id, "status": "PENDING"}


@router.post("/api/matches/photo-sessions/{draft_id}/confirm")
@limiter.limit("10/minute")
async def confirm_pickup_photo(
    draft_id: str,
    request: Request,
    body: ConfirmPhotoMatchesRequest,
    session=Depends(get_db_session),
    user=Depends(require_user),
):
    await owned_draft(draft_id, user)
    if body.season_id is not None:
        raise HTTPException(400, "Pickup games do not have a season")
    try:
        datetime.strptime(body.match_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(422, "Choose a valid game date")
    success, ids, message = await photo_match_service.create_matches_from_session(
        session, draft_id, None, body.match_date, player_overrides=body.player_overrides
    )
    if not success:
        raise HTTPException(400, message)
    data = await owned_draft(draft_id, user)
    return {
        "status": "success",
        "message": message,
        "match_ids": ids,
        "matches_created": len(ids),
        "session_id": data.get("created_session_id"),
    }
