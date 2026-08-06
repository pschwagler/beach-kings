"""Authenticated reporting and owner-only moderation workflow routes."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.auth_dependencies import (
    require_system_admin,
    require_verified_player,
    require_verified_player_allow_restricted,
)
from backend.api.routes import limiter
from backend.database.db import get_db_session
from backend.models.schemas import (
    ModerationActionRequest,
    ModerationReportCreate,
    ModerationReportReceipt,
    ModerationRetryRequest,
    ModerationAppealCreate,
    ModerationAppealReceipt,
    AccountModerationStatusResponse,
)
from backend.services import moderation_service
from backend.services import moderation_evidence_service


router = APIRouter()


@router.get(
    "/api/moderation/account-status",
    response_model=AccountModerationStatusResponse,
)
async def moderation_account_status(
    user: dict = Depends(require_verified_player_allow_restricted),
    session: AsyncSession = Depends(get_db_session),
):
    return await moderation_service.account_status(session, user["id"])


@router.get(
    "/api/moderation/appeals/me",
    response_model=list[ModerationAppealReceipt],
)
async def my_moderation_appeals(
    user: dict = Depends(require_verified_player_allow_restricted),
    session: AsyncSession = Depends(get_db_session),
):
    return await moderation_service.list_appeals(session, user["player_id"])


@router.post(
    "/api/moderation/appeals",
    response_model=ModerationAppealReceipt,
    status_code=201,
)
@limiter.limit("5/day")
async def create_moderation_appeal(
    request: Request,
    payload: ModerationAppealCreate,
    user: dict = Depends(require_verified_player_allow_restricted),
    session: AsyncSession = Depends(get_db_session),
):
    try:
        return await moderation_service.create_appeal(
            session, user["player_id"], payload.case_id, payload.statement
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/moderation/reports", response_model=ModerationReportReceipt, status_code=201)
@limiter.limit("10/hour")
async def report_content(
    request: Request,
    payload: ModerationReportCreate,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    try:
        return await moderation_service.create_report(
            session, user["player_id"], payload.target_type, payload.target_id, payload.reason, payload.details
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/moderation/reports/me", response_model=list[ModerationReportReceipt])
async def my_reports(
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    return await moderation_service.list_my_reports(session, user["player_id"])


@router.get("/api/admin-view/moderation/cases")
async def moderation_cases(
    queue: str | None = Query(default=None, pattern="^(urgent|due|ordinary)$"),
    state: str | None = Query(
        default=None, pattern="^(active|open|acknowledged|closed|all)$"
    ),
    target_type: str | None = Query(
        default=None,
        pattern="^(player|direct_message|league_message|court_review|court_photo|court_review_photo)$",
    ),
    search: str | None = Query(default=None, max_length=80),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    return await moderation_service.search_cases(
        session,
        queue=queue,
        state=state,
        target_type=target_type,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.get("/api/admin-view/moderation/overview")
async def moderation_overview(
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    return await moderation_service.overview(session)


@router.get("/api/admin-view/moderation/cases/{case_id}")
async def moderation_case(
    case_id: int,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    result = await moderation_service.get_case(session, case_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return result


@router.get("/api/admin-view/moderation/cases/{case_id}/context")
async def moderation_case_context(
    case_id: int,
    response: Response,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    response.headers["Cache-Control"] = "no-store"
    try:
        return await moderation_evidence_service.read_chat_context(
            session, case_id, user["id"]
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
            headers={"Cache-Control": "no-store"},
        )


@router.post("/api/admin-view/moderation/cases/{case_id}/actions")
async def moderation_action(
    case_id: int,
    payload: ModerationActionRequest,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    try:
        return await moderation_service.apply_action(
            session,
            case_id,
            user["id"],
            payload.action,
            payload.reason.strip(),
            payload.lock_hours,
            payload.legal_hold,
            payload.appeal_id,
        )
    except ValueError as exc:
        status = 404 if str(exc) == "Case not found" else 400
        raise HTTPException(status_code=status, detail=str(exc))


@router.post("/api/admin-view/moderation/jobs/{job_id}/retry")
async def moderation_job_retry(
    job_id: int,
    payload: ModerationRetryRequest,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    try:
        return await moderation_service.retry_failed_job(
            session, job_id, user["id"], payload.reason.strip()
        )
    except ValueError as exc:
        status = 404 if str(exc) == "Job not found" else 400
        raise HTTPException(status_code=status, detail=str(exc))


@router.get("/api/admin-view/moderation/cases/{case_id}/evidence/{evidence_id}/url")
async def moderation_evidence_url(
    case_id: int,
    evidence_id: int,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    try:
        url = await moderation_evidence_service.signed_url(session, case_id, evidence_id, user["id"])
        return {"url": url, "expires_in": 300}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
