"""Durable provider-backed moderation worker (separate process, never FastAPI tasks)."""

import asyncio
import hashlib
import os
from datetime import timedelta
from typing import Any

import httpx
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    CourtPhoto,
    Court,
    CourtReview,
    CourtReviewPhoto,
    DirectMessage,
    LeagueMessage,
    ModerationCase,
    ModerationEvent,
    ModerationJob,
    ModerationReport,
    Player,
)
from backend.utils.datetime_utils import utcnow


VALID_MODES = {"off", "shadow", "enforce"}
FAIL_CLOSED_ENVS = {"production", "prod", "staging"}
TARGET_MODELS = {
    "player": Player,
    "direct_message": DirectMessage,
    "league_message": LeagueMessage,
    "court_review": CourtReview,
    "court_photo": CourtPhoto,
    "court_review_photo": CourtReviewPhoto,
}


def moderation_mode() -> str:
    mode = os.getenv("MODERATION_MODE", "off").lower()
    if os.getenv("ENV", "development").lower() in FAIL_CLOSED_ENVS:
        return "enforce"
    return mode if mode in VALID_MODES else "off"


def initial_visibility() -> str:
    return "pending" if moderation_mode() == "enforce" else "visible"


def content_revision(value: str | None) -> str:
    """Return a non-reversible revision token used to supersede stale text jobs."""
    return hashlib.sha256((value or "").encode("utf-8")).hexdigest()[:16]


def validate_worker_config() -> None:
    if moderation_mode() != "off" and not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is required when moderation is enabled")


async def enqueue_target(
    session: AsyncSession,
    target_type: str,
    target_id: int,
    *,
    revision: str = "v1",
) -> None:
    if moderation_mode() == "off":
        return
    from sqlalchemy.dialects.postgresql import insert

    await session.execute(
        insert(ModerationJob)
        .values(
            idempotency_key=f"content:{target_type}:{target_id}:{revision}",
            target_type=target_type,
            target_id=target_id,
        )
        .on_conflict_do_nothing(index_elements=[ModerationJob.idempotency_key])
    )


async def recover_stale_jobs(session: AsyncSession, stale_minutes: int = 10) -> int:
    result = await session.execute(
        update(ModerationJob)
        .where(
            ModerationJob.status == "processing",
            ModerationJob.claimed_at < utcnow() - timedelta(minutes=stale_minutes),
        )
        .values(status="pending", claimed_at=None, last_error="stale claim recovered")
        .returning(ModerationJob.id)
    )
    return len(result.scalars().all())


async def claim_job(session: AsyncSession) -> ModerationJob | None:
    result = await session.execute(
        select(ModerationJob)
        .where(ModerationJob.status == "pending", ModerationJob.available_at <= utcnow())
        .order_by(ModerationJob.created_at.asc())
        .with_for_update(skip_locked=True)
        .limit(1)
    )
    job = result.scalar_one_or_none()
    if job:
        job.status = "processing"
        job.claimed_at = utcnow()
        job.attempts += 1
        await session.flush()
    return job


async def process_job(session: AsyncSession, job: ModerationJob) -> None:
    model = TARGET_MODELS.get(job.target_type)
    if model is None:
        await _complete(session, job, flagged=False, categories={}, provider_payload={"skipped": "player target"})
        return
    target = await session.get(model, job.target_id)
    if target is None:
        job.status = "completed"
        job.last_error = "target no longer exists"
        return
    if _job_is_superseded(job, target):
        job.status = "completed"
        job.last_error = "superseded by a newer content revision"
        return
    content = _provider_content(job.target_type, target)
    try:
        result = await classify(content, safety_identifier=f"target_{job.target_type}_{job.target_id}")
        flagged = bool(result.get("flagged"))
        categories = result.get("categories") or {}
        if flagged or job.case_id is not None:
            subject_player_id = await _subject_player_id(
                session, job.target_type, target
            )
            repeat_context = await _repeat_behavior_context(
                session, subject_player_id, exclude_case_id=job.case_id
            )
            result["subject_player_id"] = subject_player_id
            result["repeat_context"] = repeat_context
            report_reasons = await _report_reasons(session, job.case_id)
            result["report_reasons"] = report_reasons
            try:
                result["triage"] = await triage_recommendation(
                    target_type=job.target_type,
                    categories=categories,
                    safety_identifier=f"target_{job.target_type}_{job.target_id}",
                    repeat_context=repeat_context,
                    report_reasons=report_reasons,
                )
            except Exception as exc:
                result["triage_error"] = str(exc)[:500]
        await _complete(session, job, flagged, categories, result)
    except Exception as exc:
        await _retry_or_fail(session, job, str(exc))
        if moderation_mode() == "enforce":
            target.moderation_visibility = "pending"


async def classify(content: dict[str, Any], safety_identifier: str) -> dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    model = os.getenv("MODERATION_MODEL", "omni-moderation-latest")
    async with httpx.AsyncClient(timeout=float(os.getenv("MODERATION_PROVIDER_TIMEOUT", "20"))) as client:
        response = await client.post(
            "https://api.openai.com/v1/moderations",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": model, "input": content["input"]},
        )
        response.raise_for_status()
        raw = response.json()
    result = raw["results"][0]
    return {
        "provider": "openai",
        "model": model,
        "safety_identifier": safety_identifier,
        "flagged": bool(result.get("flagged")),
        "categories": result.get("categories", {}),
    }


class ModerationUnavailable(RuntimeError):
    """Raised when fail-closed synchronous screening cannot reach the provider."""


class ContentRejected(ValueError):
    """Raised when synchronous screening rejects content before publication."""


async def screen_image_url(url: str, safety_identifier: str) -> None:
    """Screen an image that cannot use the durable pending-publication workflow."""
    await _screen_content(_image_content(url), safety_identifier)


async def screen_text(text: str, safety_identifier: str) -> None:
    """Screen profile text that cannot use the durable pending-publication workflow."""
    if not text.strip():
        return
    await _screen_content({"input": text}, safety_identifier)


async def _screen_content(content: dict[str, Any], safety_identifier: str) -> None:
    mode = moderation_mode()
    if mode == "off":
        return
    try:
        result = await classify(content, safety_identifier)
    except Exception as exc:
        if mode == "enforce":
            raise ModerationUnavailable("Content moderation is temporarily unavailable") from exc
        return
    if mode == "enforce" and result.get("flagged"):
        raise ContentRejected("Content was rejected by the safety filter")


async def triage_recommendation(
    target_type: str,
    categories: dict[str, Any],
    safety_identifier: str,
    repeat_context: dict[str, int] | None = None,
    report_reasons: list[str] | None = None,
) -> dict[str, Any]:
    """Request recommendation-only structured triage without sending raw content or PII."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    model = os.getenv("MODERATION_TRIAGE_MODEL", "gpt-5.6-luna")
    schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "severity": {"type": "string", "enum": ["ordinary", "urgent"]},
            "recommendation": {
                "type": "string",
                "enum": ["allow", "warn", "quarantine", "interaction_lock", "owner_review"],
            },
            "rationale": {"type": "string", "maxLength": 500},
            "junior_involved": {"type": "null"},
        },
        "required": ["severity", "recommendation", "rationale", "junior_involved"],
    }
    payload = {
        "model": model,
        "store": False,
        "safety_identifier": safety_identifier,
        "input": [
            {
                "role": "system",
                "content": "Recommend owner review routing only. Do not make an enforcement decision.",
            },
            {
                "role": "user",
                "content": (
                    f"Target type: {target_type}. Provider flagged categories: "
                    f"{sorted(k for k, v in categories.items() if v)}. "
                    f"Prior case counts: {repeat_context or {'prior_case_count': 0, 'prior_urgent_case_count': 0, 'window_days': 365}}. "
                    f"Reporter-selected policy reasons: {report_reasons or []}. "
                    "Junior status is unknown."
                ),
            },
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "moderation_triage",
                "strict": True,
                "schema": schema,
            }
        },
    }
    async with httpx.AsyncClient(timeout=float(os.getenv("MODERATION_PROVIDER_TIMEOUT", "20"))) as client:
        response = await client.post(
            "https://api.openai.com/v1/responses",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        )
        response.raise_for_status()
        raw = response.json()
    import json

    output_text = raw.get("output_text")
    if not output_text:
        for item in raw.get("output", []):
            for content in item.get("content", []):
                if content.get("type") == "output_text":
                    output_text = content.get("text")
                    break
    parsed = json.loads(output_text or "{}")
    if set(parsed) != {"severity", "recommendation", "rationale", "junior_involved"}:
        raise ValueError("Invalid triage structured output")
    return parsed


async def _complete(
    session: AsyncSession,
    job: ModerationJob,
    flagged: bool,
    categories: dict[str, Any],
    provider_payload: dict[str, Any],
) -> None:
    case = (
        await _ensure_flagged_case(
            session, job, provider_payload.get("subject_player_id")
        )
        if flagged
        else (
            await session.get(ModerationCase, job.case_id) if job.case_id else None
        )
    )
    triage = provider_payload.get("triage") or {}
    if case is not None and triage.get("severity") == "urgent":
        case.severity = "urgent"
        case.due_at = utcnow()
    if case:
        session.add(
            ModerationEvent(
                case_id=case.id,
                event_type="provider_classification",
                metadata_json={
                    "flagged": flagged,
                    "categories": categories,
                    "model": provider_payload.get("model"),
                    "policy_version": "ugc-v1",
                    "triage": provider_payload.get("triage"),
                    "triage_error": provider_payload.get("triage_error"),
                    "repeat_context": provider_payload.get("repeat_context"),
                    "report_reasons": provider_payload.get("report_reasons"),
                },
            )
        )
    model = TARGET_MODELS.get(job.target_type)
    target = await session.get(model, job.target_id) if model else None
    is_submission_job = job.idempotency_key.startswith("content:")
    if (
        target is not None
        and hasattr(target, "moderation_visibility")
        and moderation_mode() == "enforce"
    ):
        target.moderation_visibility = "quarantined" if flagged else "visible"
        await session.flush()
        if job.target_type == "court_review":
            await _recalculate_court_rating(session, target.court_id)
        if not flagged and is_submission_job and job.target_type == "direct_message":
            from backend.services.direct_message_service import publish_approved_message

            await publish_approved_message(session, target)
        if not flagged and is_submission_job and job.target_type == "league_message":
            from backend.services.message_data import publish_approved_league_message

            await publish_approved_league_message(session, target)
    if target is not None and flagged and case is not None:
        await _capture_flagged_evidence(session, case.id, job.target_type, target)
    job.status = "completed"
    job.last_error = None
    await session.flush()


async def _ensure_flagged_case(
    session: AsyncSession,
    job: ModerationJob,
    subject_player_id: int | None = None,
) -> ModerationCase:
    case = await session.get(ModerationCase, job.case_id) if job.case_id else None
    if case is None:
        case = ModerationCase(
            target_type=job.target_type,
            target_id=job.target_id,
            subject_player_id=subject_player_id,
            severity="ordinary",
            due_at=utcnow() + timedelta(hours=24),
        )
        session.add(case)
        await session.flush()
        job.case_id = case.id
    elif case.subject_player_id is None and subject_player_id is not None:
        case.subject_player_id = subject_player_id
    return case


async def _retry_or_fail(session: AsyncSession, job: ModerationJob, error: str) -> None:
    max_attempts = int(os.getenv("MODERATION_MAX_ATTEMPTS", "5"))
    job.last_error = error[:2000]
    job.claimed_at = None
    if job.attempts >= max_attempts:
        job.status = "failed"
    else:
        job.status = "pending"
        job.available_at = utcnow() + timedelta(seconds=min(3600, 30 * (2 ** (job.attempts - 1))))


def _provider_content(target_type: str, target: Any) -> dict[str, Any]:
    if target_type == "player":
        text = "\n".join(
            value.strip()
            for value in (target.full_name, target.nickname)
            if value and value.strip()
        )
        if target.profile_picture_url:
            return {
                "input": [
                    {"type": "text", "text": text},
                    {
                        "type": "image_url",
                        "image_url": {"url": target.profile_picture_url},
                    },
                ]
            }
        return {"input": text}
    if target_type in {"direct_message", "league_message"}:
        return {"input": target.message_text}
    if target_type == "court_review":
        return {"input": target.review_text or ""}
    # Image moderation excludes uploader and location metadata. Standalone photo
    # captions are content, so screen them in the same provider request.
    if target_type == "court_photo" and target.caption:
        return {
            "input": [
                {"type": "text", "text": target.caption},
                {"type": "image_url", "image_url": {"url": target.url}},
            ]
        }
    return _image_content(target.url)


def _image_content(url: str) -> dict[str, Any]:
    return {"input": [{"type": "image_url", "image_url": {"url": url}}]}


def _job_is_superseded(job: ModerationJob, target: Any) -> bool:
    if (
        job.target_type != "court_review"
        or not job.idempotency_key.startswith("content:")
    ):
        return False
    expected_revision = job.idempotency_key.rsplit(":", 1)[-1]
    return expected_revision != content_revision(target.review_text)


async def _subject_player_id(
    session: AsyncSession, target_type: str, target: Any
) -> int | None:
    if target_type == "player":
        return target.id
    if target_type == "direct_message":
        return target.sender_player_id
    if target_type == "league_message":
        return (
            await session.execute(
                select(Player.id).where(Player.user_id == target.user_id)
            )
        ).scalar_one_or_none()
    if target_type == "court_review":
        return target.player_id
    if target_type == "court_photo":
        return target.uploaded_by
    if target_type == "court_review_photo":
        return (
            await session.execute(
                select(CourtReview.player_id).where(
                    CourtReview.id == target.review_id
                )
            )
        ).scalar_one_or_none()
    return None


async def _report_reasons(
    session: AsyncSession, case_id: int | None
) -> list[str]:
    if case_id is None:
        return []
    result = await session.execute(
        select(ModerationReport.reason).where(ModerationReport.case_id == case_id)
    )
    return sorted(set(result.scalars().all()))


async def _repeat_behavior_context(
    session: AsyncSession,
    subject_player_id: int | None,
    *,
    exclude_case_id: int | None,
) -> dict[str, int]:
    context = {
        "prior_case_count": 0,
        "prior_urgent_case_count": 0,
        "window_days": 365,
    }
    if subject_player_id is None:
        return context
    conditions = [
        ModerationCase.subject_player_id == subject_player_id,
        ModerationCase.created_at >= utcnow() - timedelta(days=context["window_days"]),
    ]
    if exclude_case_id is not None:
        conditions.append(ModerationCase.id != exclude_case_id)
    row = (
        await session.execute(
            select(
                func.count(ModerationCase.id),
                func.count(ModerationCase.id).filter(
                    ModerationCase.severity == "urgent"
                ),
            ).where(*conditions)
        )
    ).first()
    if row:
        context["prior_case_count"] = int(row[0] or 0)
        context["prior_urgent_case_count"] = int(row[1] or 0)
    return context


async def _capture_flagged_evidence(
    session: AsyncSession,
    case_id: int,
    target_type: str,
    target: Any,
) -> None:
    from backend.services.moderation_evidence_service import (
        capture_chat_context,
        capture_s3_object,
        capture_text,
    )

    async def capture_or_audit(operation) -> None:
        try:
            await operation
        except Exception as exc:
            session.add(
                ModerationEvent(
                    case_id=case_id,
                    event_type="evidence_capture_failed",
                    metadata_json={"error_type": type(exc).__name__},
                )
            )

    if target_type in {"court_photo", "court_review_photo"}:
        await capture_or_audit(
            capture_s3_object(session, case_id, target.s3_key, "image")
        )
    text = None
    if target_type in {"direct_message", "league_message"}:
        text = target.message_text
    elif target_type == "court_review":
        text = target.review_text
    elif target_type == "court_photo":
        text = target.caption
    if text:
        await capture_or_audit(capture_text(session, case_id, text))
    if target_type in {"direct_message", "league_message"}:
        await capture_or_audit(capture_chat_context(session, case_id))


async def _recalculate_court_rating(session: AsyncSession, court_id: int) -> None:
    row = (
        await session.execute(
            select(func.avg(CourtReview.rating), func.count(CourtReview.id)).where(
                CourtReview.court_id == court_id,
                CourtReview.moderation_visibility == "visible",
            )
        )
    ).first()
    average = round(float(row[0]), 2) if row and row[0] is not None else None
    count = int(row[1] or 0) if row else 0
    await session.execute(
        update(Court)
        .where(Court.id == court_id)
        .values(average_rating=average, review_count=count)
    )


async def run_forever(session_factory) -> None:
    """Poll jobs until terminated. Mode off intentionally performs no database work."""
    validate_worker_config()
    while True:
        if moderation_mode() == "off":
            await asyncio.sleep(10)
            continue
        async with session_factory() as session:
            from backend.services.moderation_evidence_service import purge_due

            await recover_stale_jobs(session)
            await purge_due(session)
            job = await claim_job(session)
            if job:
                await process_job(session, job)
            await session.commit()
        await asyncio.sleep(0.25 if job else 2)
