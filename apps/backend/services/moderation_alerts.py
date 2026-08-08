"""Durable, privacy-minimized moderation owner email alerts."""

import os
from datetime import datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert

from backend.database.models import (
    CourtPhoto,
    CourtReview,
    CourtReviewPhoto,
    DirectMessage,
    LeagueMessage,
    ModerationAlertJob,
    ModerationCase,
    ModerationEvent,
)
from backend.services import email_service
from backend.utils.datetime_utils import utcnow


ALERT_KINDS = {"urgent_initial", "urgent_repeat", "ordinary_due_soon", "daily_digest"}
TERMINAL_STATUSES = {"delivered", "failed", "cancelled"}
EASTERN = ZoneInfo("America/New_York")
TARGET_MODELS = {
    "direct_message": DirectMessage,
    "league_message": LeagueMessage,
    "court_review": CourtReview,
    "court_photo": CourtPhoto,
    "court_review_photo": CourtReviewPhoto,
}


class AlertDeliveryError(RuntimeError):
    def __init__(self, code: str, detail: str, *, transient: bool) -> None:
        super().__init__(detail)
        self.code = code[:100]
        self.detail = detail[:500]
        self.transient = transient


def alerts_enabled() -> bool:
    return os.getenv("MODERATION_ALERTS_ENABLED", "false").lower() in {"1", "true", "yes"}


def validate_alert_config() -> None:
    environment = os.getenv("ENV", "development").lower()
    if environment not in {"production", "prod"}:
        return
    missing = []
    if not alerts_enabled():
        missing.append("MODERATION_ALERTS_ENABLED=true")
    if not os.getenv("RESEND_API_KEY"):
        missing.append("RESEND_API_KEY")
    if not os.getenv("RESEND_FROM_EMAIL"):
        missing.append("RESEND_FROM_EMAIL")
    if not os.getenv("MODERATION_ALERT_EMAIL"):
        missing.append("MODERATION_ALERT_EMAIL")
    if missing:
        raise RuntimeError(f"Production moderation alerts require: {', '.join(missing)}")


def next_digest_at(now: datetime) -> datetime:
    """Return the next 09:00 America/New_York occurrence, including DST."""
    local = now.astimezone(EASTERN)
    local_day = local.date() if local.time() < time(9) else local.date() + timedelta(days=1)
    return datetime.combine(local_day, time(9), tzinfo=EASTERN).astimezone(timezone.utc)


def digest_key(available_at: datetime) -> str:
    return f"daily_digest:{available_at.astimezone(EASTERN).date().isoformat()}"


async def _enqueue(
    session: AsyncSession,
    *,
    key: str,
    kind: str,
    available_at: datetime,
    case_id: int | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    if kind not in ALERT_KINDS:
        raise ValueError("Unsupported moderation alert kind")
    await session.execute(
        insert(ModerationAlertJob)
        .values(
            idempotency_key=key,
            alert_kind=kind,
            case_id=case_id,
            payload_json=payload or ({} if case_id is None else {"case_id": case_id}),
            available_at=available_at,
        )
        .on_conflict_do_nothing(index_elements=[ModerationAlertJob.idempotency_key])
    )


async def schedule_case_alerts(session: AsyncSession, case: ModerationCase) -> None:
    """Schedule the complete initial alert set in the caller's transaction."""
    if not alerts_enabled() or case.dispositioned_at is not None:
        return
    if case.severity == "urgent":
        anchor = case.urgent_since_at or case.created_at or utcnow()
        case.urgent_since_at = anchor
        anchor_key = anchor.isoformat()
        await _enqueue(
            session,
            key=f"urgent_initial:{case.id}:{anchor_key}",
            kind="urgent_initial",
            case_id=case.id,
            available_at=anchor,
        )
        await _enqueue(
            session,
            key=f"urgent_repeat:{case.id}:{anchor_key}:1",
            kind="urgent_repeat",
            case_id=case.id,
            available_at=anchor + timedelta(hours=8),
            payload={"case_id": case.id, "sequence": 1},
        )
    elif case.due_at is not None:
        await _enqueue(
            session,
            key=f"ordinary_due_soon:{case.id}:{case.due_at.isoformat()}",
            kind="ordinary_due_soon",
            case_id=case.id,
            available_at=max(utcnow(), case.due_at - timedelta(hours=4)),
        )


async def schedule_daily_digest(session: AsyncSession, now: datetime | None = None) -> None:
    if not alerts_enabled():
        return
    scheduled = next_digest_at(now or utcnow())
    await _enqueue(
        session,
        key=digest_key(scheduled),
        kind="daily_digest",
        available_at=scheduled,
        payload={"local_date": scheduled.astimezone(EASTERN).date().isoformat()},
    )


async def ensure_alert_schedule(session: AsyncSession) -> None:
    """Backfill idempotent alert jobs for active cases and the next digest."""
    if not alerts_enabled():
        return
    cases = (
        (
            await session.execute(
                select(ModerationCase).where(
                    ModerationCase.state.in_(["open", "acknowledged"]),
                    ModerationCase.dispositioned_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    for case in cases:
        await schedule_case_alerts(session, case)
    await schedule_daily_digest(session)


async def cancel_urgent_repeats(session: AsyncSession, case_id: int) -> None:
    await session.execute(
        update(ModerationAlertJob)
        .where(
            ModerationAlertJob.case_id == case_id,
            ModerationAlertJob.alert_kind == "urgent_repeat",
            ModerationAlertJob.status == "pending",
        )
        .values(status="cancelled", last_error_code=None, last_error_detail=None)
    )


async def recover_stale_claims(session: AsyncSession, stale_minutes: int = 10) -> int:
    result = await session.execute(
        update(ModerationAlertJob)
        .where(
            ModerationAlertJob.status == "processing",
            ModerationAlertJob.claimed_at < utcnow() - timedelta(minutes=stale_minutes),
        )
        .values(
            status="pending",
            claimed_at=None,
            last_error_code="stale_claim",
            last_error_detail="Stale alert claim recovered",
        )
        .returning(ModerationAlertJob.id)
    )
    return len(result.scalars().all())


async def claim_alert(session: AsyncSession) -> ModerationAlertJob | None:
    job = (
        await session.execute(
            select(ModerationAlertJob)
            .where(
                ModerationAlertJob.status == "pending",
                ModerationAlertJob.available_at <= utcnow(),
            )
            .order_by(ModerationAlertJob.available_at.asc(), ModerationAlertJob.id.asc())
            .with_for_update(skip_locked=True)
            .limit(1)
        )
    ).scalar_one_or_none()
    if job is not None:
        job.status = "processing"
        job.claimed_at = utcnow()
        job.attempts += 1
        await session.flush()
    return job


async def process_alert(session: AsyncSession, job: ModerationAlertJob) -> None:
    cases = await _eligible_cases(session, job)
    if not cases:
        job.status = "cancelled"
        job.claimed_at = None
        job.last_error_code = None
        job.last_error_detail = None
        return

    if job.alert_kind == "urgent_repeat":
        await _schedule_next_repeat(session, job, cases[0])

    subject, body = await _render_email(session, job, cases)
    try:
        await send_alert_email(subject, body, idempotency_key=job.idempotency_key)
    except AlertDeliveryError as exc:
        await _record_attempt(session, job, cases, "failed", exc.code)
        await _retry_or_fail(job, exc)
        return

    now = utcnow()
    job.status = "delivered"
    job.claimed_at = None
    job.delivered_at = now
    job.last_error_code = None
    job.last_error_detail = None
    await _record_attempt(session, job, cases, "delivered", None)


async def _eligible_cases(session: AsyncSession, job: ModerationAlertJob) -> list[ModerationCase]:
    active = ModerationCase.state.in_(["open", "acknowledged"])
    if job.alert_kind == "daily_digest":
        return (
            (
                await session.execute(
                    select(ModerationCase)
                    .where(
                        active,
                        ModerationCase.severity == "ordinary",
                        ModerationCase.dispositioned_at.is_(None),
                    )
                    .order_by(ModerationCase.due_at.asc().nullslast(), ModerationCase.id.asc())
                )
            )
            .scalars()
            .all()
        )
    if job.case_id is None:
        return []
    case = await session.get(ModerationCase, job.case_id)
    if (
        case is None
        or case.dispositioned_at is not None
        or case.state not in {"open", "acknowledged"}
    ):
        return []
    if job.alert_kind in {"urgent_initial", "urgent_repeat"}:
        if case.severity != "urgent" or case.acknowledged_at is not None:
            return []
    elif job.alert_kind == "ordinary_due_soon":
        if case.severity != "ordinary" or case.due_at is None:
            return []
    return [case]


async def _schedule_next_repeat(
    session: AsyncSession, job: ModerationAlertJob, case: ModerationCase
) -> None:
    anchor = case.urgent_since_at or case.created_at
    if anchor is None:
        return
    sequence = int((job.payload_json or {}).get("sequence", 1))
    next_sequence = sequence + 1
    await _enqueue(
        session,
        key=f"urgent_repeat:{case.id}:{anchor.isoformat()}:{next_sequence}",
        kind="urgent_repeat",
        case_id=case.id,
        available_at=anchor + timedelta(hours=8 * next_sequence),
        payload={"case_id": case.id, "sequence": next_sequence},
    )


async def _render_email(
    session: AsyncSession, job: ModerationAlertJob, cases: list[ModerationCase]
) -> tuple[str, str]:
    label = {
        "urgent_initial": "Urgent moderation case",
        "urgent_repeat": "Unacknowledged urgent moderation case",
        "ordinary_due_soon": "Moderation case due soon",
        "daily_digest": "Daily moderation digest",
    }[job.alert_kind]
    lines = [label, "", f"Cases: {len(cases)}", ""]
    for case in cases:
        lines.extend(await _safe_case_lines(session, case))
    lines.extend(
        [
            "",
            "This operational email intentionally excludes evidence, report text, identities, and contact details.",
        ]
    )
    return f"Beach League — {label}", "\n".join(lines)


async def _safe_case_lines(session: AsyncSession, case: ModerationCase) -> list[str]:
    now = utcnow()
    created = case.created_at or now
    age_hours = max(0, int((now - created).total_seconds() // 3600))
    deadline = case.due_at.isoformat() if case.due_at else "not set"
    visibility = "not applicable"
    model = TARGET_MODELS.get(case.target_type)
    target = await session.get(model, case.target_id) if model is not None else None
    if target is not None:
        visibility = getattr(target, "moderation_visibility", "not applicable")
    link = f"https://beachleaguevb.com/admin-view?tab=moderation&case={case.id}"
    return [
        f"Case {case.id} | Incident: {case.incident_type or 'not classified'} | Age: {age_hours}h | Deadline: {deadline} | Quarantine: {visibility}",
        link,
        "",
    ]


async def send_alert_email(subject: str, body: str, *, idempotency_key: str) -> None:
    api_key = os.getenv("RESEND_API_KEY")
    recipient = os.getenv("MODERATION_ALERT_EMAIL")
    if not api_key or not recipient:
        raise AlertDeliveryError(
            "configuration",
            "Moderation alert delivery is not configured",
            transient=False,
        )
    try:
        response = await email_service.send_email_request(
            recipient,
            subject,
            body,
            idempotency_key=idempotency_key,
        )
    except Exception as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        transient = status is None or status in {408, 429} or status >= 500
        code = f"resend_{status}" if status else type(exc).__name__
        raise AlertDeliveryError(code, "Resend request failed", transient=transient) from exc
    status = int(getattr(response, "status_code", 500))
    if not 200 <= status < 300:
        raise AlertDeliveryError(
            f"resend_{status}",
            "Resend rejected the moderation alert",
            transient=status in {408, 429} or status >= 500,
        )


async def _retry_or_fail(job: ModerationAlertJob, error: AlertDeliveryError) -> None:
    max_attempts = int(os.getenv("MODERATION_ALERT_MAX_ATTEMPTS", "5"))
    job.claimed_at = None
    job.last_error_code = error.code
    job.last_error_detail = error.detail
    if not error.transient or job.attempts >= max_attempts:
        job.status = "failed"
        return
    job.status = "pending"
    job.available_at = utcnow() + timedelta(
        seconds=min(8 * 3600, 60 * (2 ** max(0, job.attempts - 1)))
    )


async def _record_attempt(
    session: AsyncSession,
    job: ModerationAlertJob,
    cases: list[ModerationCase],
    outcome: str,
    error_code: str | None,
) -> None:
    for case in cases:
        session.add(
            ModerationEvent(
                case_id=case.id,
                event_type="alert_delivery_attempt",
                metadata_json={
                    "alert_job_id": job.id,
                    "alert_kind": job.alert_kind,
                    "attempt": job.attempts,
                    "outcome": outcome,
                    "error_code": error_code,
                },
            )
        )


async def purge_terminal_jobs(session: AsyncSession, now: datetime | None = None) -> int:
    result = await session.execute(
        delete(ModerationAlertJob)
        .where(
            ModerationAlertJob.status.in_(TERMINAL_STATUSES),
            ModerationAlertJob.updated_at < (now or utcnow()) - timedelta(days=30),
        )
        .returning(ModerationAlertJob.id)
    )
    return len(result.scalars().all())
