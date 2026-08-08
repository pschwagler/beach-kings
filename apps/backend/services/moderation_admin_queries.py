"""Read models and aggregate queries for the moderation admin workspace."""

from datetime import timedelta
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    Court,
    CourtPhoto,
    CourtReview,
    CourtReviewPhoto,
    DirectMessage,
    LeagueMessage,
    ModerationAlertJob,
    ModerationAppeal,
    ModerationCase,
    ModerationEvent,
    ModerationEvidence,
    ModerationJob,
    ModerationReport,
    Player,
    User,
)
from backend.services import user_service
from backend.utils.datetime_utils import utcnow


TARGET_MODELS = {
    "direct_message": DirectMessage,
    "league_message": LeagueMessage,
    "court_review": CourtReview,
    "court_photo": CourtPhoto,
    "court_review_photo": CourtReviewPhoto,
}


async def list_cases(session: AsyncSession, queue: str | None = None) -> list[dict[str, Any]]:
    return (await search_cases(session, queue=queue))["items"]


async def search_cases(
    session: AsyncSession,
    *,
    queue: str | None = None,
    state: str | None = None,
    target_type: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 30,
) -> dict[str, Any]:
    query = (
        select(ModerationCase, func.count(ModerationReport.id).label("report_count"))
        .outerjoin(ModerationReport, ModerationReport.case_id == ModerationCase.id)
        .group_by(ModerationCase.id)
    )
    now = utcnow()
    active = ModerationCase.state.in_(["open", "acknowledged"])
    if queue == "urgent":
        query = query.where(ModerationCase.severity == "urgent")
    elif queue == "due":
        query = query.where(
            ModerationCase.dispositioned_at.is_(None),
            ModerationCase.due_at > now,
            ModerationCase.due_at <= now + timedelta(hours=4),
        )
    elif queue == "overdue":
        query = query.where(
            ModerationCase.dispositioned_at.is_(None),
            ModerationCase.due_at < now,
        )
    elif queue == "ordinary":
        query = query.where(ModerationCase.severity == "ordinary")

    # A queue-only request is the legacy active-queue contract. Explicit states
    # are independent from attention filters, and ``all`` intentionally removes
    # the state constraint while retaining any selected attention filter.
    effective_state = "active" if state is None and queue is not None else state
    if effective_state == "active":
        query = query.where(active)
    elif effective_state == "open":
        query = query.where(ModerationCase.state == "open")
    elif effective_state == "acknowledged":
        query = query.where(ModerationCase.state == "acknowledged")
    elif effective_state == "closed":
        query = query.where(ModerationCase.state.in_(["closed", "dismissed"]))
    if target_type:
        query = query.where(ModerationCase.target_type == target_type)
    if search:
        normalized = search.strip().removeprefix("#")
        if normalized.isdigit():
            identifier = int(normalized)
            query = query.where(
                or_(
                    ModerationCase.id == identifier,
                    ModerationCase.target_id == identifier,
                )
            )
        else:
            # The public contract is ID search. Avoid unindexed casts and broad
            # wildcard scans when the input cannot identify a case or target.
            query = query.where(ModerationCase.id == -1)
    count_query = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_query)).scalar_one()
    rows = (
        await session.execute(
            query.order_by(
                ModerationCase.due_at.asc().nullslast(),
                ModerationCase.created_at.asc(),
                ModerationCase.id.asc(),
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    cases = [case for case, _count in rows]
    report_counts = {case.id: count for case, count in rows}
    summaries = await _case_list_summaries(session, cases, report_counts)
    return {
        "items": [
            {
                **_case_dict(case),
                "report_count": report_counts[case.id],
                **summaries[case.id],
            }
            for case in cases
        ],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "totals": await _queue_totals(session, now),
    }


async def _queue_totals(session: AsyncSession, now) -> dict[str, int]:
    active = ModerationCase.state.in_(["open", "acknowledged"])
    due = (
        active,
        ModerationCase.dispositioned_at.is_(None),
        ModerationCase.due_at > now,
        ModerationCase.due_at <= now + timedelta(hours=4),
    )
    overdue = (
        active,
        ModerationCase.dispositioned_at.is_(None),
        ModerationCase.due_at < now,
    )
    result = await session.execute(
        select(
            func.count(ModerationCase.id).label("all"),
            func.count(ModerationCase.id).filter(active).label("active"),
            func.count(ModerationCase.id)
            .filter(active, ModerationCase.severity == "urgent")
            .label("urgent"),
            func.count(ModerationCase.id).filter(*due).label("due"),
            func.count(ModerationCase.id).filter(*overdue).label("overdue"),
            func.count(ModerationCase.id)
            .filter(active, ModerationCase.severity == "ordinary")
            .label("ordinary"),
            func.count(ModerationCase.id).filter(ModerationCase.state == "open").label("open"),
            func.count(ModerationCase.id)
            .filter(ModerationCase.state == "acknowledged")
            .label("acknowledged"),
            func.count(ModerationCase.id)
            .filter(ModerationCase.state.in_(["closed", "dismissed"]))
            .label("closed"),
        )
    )
    row = result.one()
    return {
        key: int(getattr(row, key))
        for key in (
            "all",
            "active",
            "urgent",
            "due",
            "overdue",
            "ordinary",
            "open",
            "acknowledged",
            "closed",
        )
    }


async def _case_list_summaries(
    session: AsyncSession,
    cases: list[ModerationCase],
    report_counts: dict[int, int],
) -> dict[int, dict[str, Any]]:
    """Build triage-safe list metadata in bounded batch queries."""
    if not cases:
        return {}

    case_ids = [case.id for case in cases]
    subject_ids = {case.subject_player_id for case in cases if case.subject_player_id is not None}
    subject_names: dict[int, str] = {}
    if subject_ids:
        subject_rows = await session.execute(
            select(Player.id, Player.full_name).where(Player.id.in_(subject_ids))
        )
        subject_names = {player_id: full_name for player_id, full_name in subject_rows}

    reason_rows = await session.execute(
        select(ModerationReport.case_id, ModerationReport.reason)
        .where(ModerationReport.case_id.in_(case_ids))
        .order_by(
            ModerationReport.case_id.asc(),
            ModerationReport.created_at.asc(),
            ModerationReport.id.asc(),
        )
    )
    primary_reasons: dict[int, str] = {}
    for case_id, reason in reason_rows:
        primary_reasons.setdefault(case_id, reason)

    target_rows: dict[tuple[str, int], Any] = {}
    for target_type in {case.target_type for case in cases}:
        model = Player if target_type == "player" else TARGET_MODELS.get(target_type)
        if model is None:
            continue
        target_ids = [case.target_id for case in cases if case.target_type == target_type]
        rows = await session.execute(select(model).where(model.id.in_(target_ids)))
        for target in rows.scalars().all():
            target_rows[(target_type, target.id)] = target

    def compact_text(value: str | None) -> str | None:
        normalized = " ".join((value or "").split())
        if not normalized:
            return None
        return normalized if len(normalized) <= 160 else f"{normalized[:157]}..."

    summaries: dict[int, dict[str, Any]] = {}
    for case in cases:
        target = target_rows.get((case.target_type, case.target_id))
        target_title = case.target_type.replace("_", " ").title()
        snippet = None
        media_type = None
        if target is None:
            target_title = "Target unavailable"
        elif case.target_type == "player":
            target_title = target.full_name
            snippet = compact_text(target.nickname)
        elif case.target_type in {"direct_message", "league_message"}:
            snippet = compact_text(target.message_text)
        elif case.target_type == "court_review":
            snippet = compact_text(target.review_text)
        elif case.target_type == "court_photo":
            snippet = compact_text(target.caption)
            media_type = "image"
        elif case.target_type == "court_review_photo":
            media_type = "image"

        summaries[case.id] = {
            "subject_name": subject_names.get(case.subject_player_id),
            "target_title": target_title,
            "target_snippet": snippet,
            "target_media_type": media_type,
            "source": ("member_report" if report_counts.get(case.id, 0) else "automated"),
            "primary_reason": primary_reasons.get(case.id),
        }
    return summaries


async def get_case(session: AsyncSession, case_id: int) -> dict[str, Any] | None:
    case = await session.get(ModerationCase, case_id)
    if case is None:
        return None
    events = (
        (
            await session.execute(
                select(ModerationEvent)
                .where(ModerationEvent.case_id == case_id)
                .order_by(ModerationEvent.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    reports = (
        (
            await session.execute(
                select(ModerationReport)
                .where(ModerationReport.case_id == case_id)
                .order_by(ModerationReport.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    evidence = (
        (
            await session.execute(
                select(ModerationEvidence)
                .where(ModerationEvidence.case_id == case_id)
                .order_by(ModerationEvidence.captured_at.asc())
            )
        )
        .scalars()
        .all()
    )
    jobs = (
        (
            await session.execute(
                select(ModerationJob)
                .where(ModerationJob.case_id == case_id)
                .order_by(ModerationJob.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    appeals = (
        (
            await session.execute(
                select(ModerationAppeal)
                .where(ModerationAppeal.case_id == case_id)
                .order_by(ModerationAppeal.created_at.asc(), ModerationAppeal.id.asc())
            )
        )
        .scalars()
        .all()
    )
    actor_ids = {event.actor_user_id for event in events if event.actor_user_id is not None}
    actor_names: dict[int, str] = {}
    if actor_ids:
        rows = await session.execute(
            select(Player.user_id, Player.full_name)
            .where(Player.user_id.in_(actor_ids))
            .order_by(Player.id.asc())
        )
        for user_id, full_name in rows:
            actor_names.setdefault(user_id, full_name)
    provider_reviews = [
        {
            "flagged": bool(e.metadata_json.get("flagged")),
            "categories": e.metadata_json.get("categories") or {},
            "model": e.metadata_json.get("model"),
            "policy_version": e.metadata_json.get("policy_version"),
            "recommendation": e.metadata_json.get("triage"),
            "error": e.metadata_json.get("triage_error"),
            "created_at": e.created_at,
        }
        for e in events
        if e.event_type == "provider_classification"
    ]
    return {
        **_case_dict(case),
        "subject": await _subject_context(session, case.subject_player_id),
        "target": await _target_context(session, case),
        "reports": [
            {"id": r.id, "reason": r.reason, "details": r.details, "created_at": r.created_at}
            for r in reports
        ],
        "provider_reviews": provider_reviews,
        "events": [
            {
                "id": e.id,
                "event_type": e.event_type,
                "operator_user_id": e.actor_user_id,
                "operator_name": actor_names.get(e.actor_user_id),
                "reason": e.reason,
                "metadata": e.metadata_json,
                "created_at": e.created_at,
            }
            for e in events
        ],
        "evidence": [
            {
                "id": item.id,
                "state": "purged" if item.purged_at else "available",
                "content_type": item.content_type,
                "captured_at": item.captured_at,
                "purge_after": item.purge_after,
                "purged_at": item.purged_at,
                "access_expires_in": 300,
            }
            for item in evidence
        ],
        "jobs": [
            {
                "id": job.id,
                "status": job.status,
                "attempts": job.attempts,
                "available_at": job.available_at,
                "claimed_at": job.claimed_at,
                "last_error": job.last_error,
                "created_at": job.created_at,
                "updated_at": job.updated_at,
                "can_retry": job.status == "failed",
            }
            for job in jobs
        ],
        "appeals": [_appeal_dict(appeal) for appeal in appeals],
        "allowed_actions": await _allowed_actions(session, case),
    }


async def overview(session: AsyncSession) -> dict[str, Any]:
    now = utcnow()
    stale_before = now - timedelta(minutes=10)
    from backend.services.moderation_worker import moderation_mode

    job_stats = (
        await session.execute(
            select(
                func.count(ModerationJob.id)
                .filter(ModerationJob.status == "pending")
                .label("pending"),
                func.count(ModerationJob.id)
                .filter(ModerationJob.status == "processing")
                .label("processing"),
                func.count(ModerationJob.id)
                .filter(ModerationJob.status == "failed")
                .label("failed"),
                func.count(ModerationJob.id)
                .filter(
                    ModerationJob.status == "processing",
                    ModerationJob.claimed_at < stale_before,
                )
                .label("stale"),
                func.min(ModerationJob.created_at)
                .filter(ModerationJob.status == "pending")
                .label("oldest_pending_at"),
                func.max(ModerationJob.updated_at)
                .filter(ModerationJob.status == "completed")
                .label("latest_completion_at"),
            )
        )
    ).one()
    alert_stats = (
        await session.execute(
            select(
                func.count(ModerationAlertJob.id)
                .filter(ModerationAlertJob.status.in_(["pending", "processing"]))
                .label("pending"),
                func.count(ModerationAlertJob.id)
                .filter(ModerationAlertJob.status == "failed")
                .label("failed"),
                func.max(ModerationAlertJob.delivered_at)
                .filter(ModerationAlertJob.status == "delivered")
                .label("latest_delivery_at"),
            )
        )
    ).one()
    queues = await _queue_totals(session, now)
    sla_stats = (
        await session.execute(
            select(
                func.count(ModerationCase.id)
                .filter(
                    ModerationCase.state.in_(["open", "acknowledged"]),
                    ModerationCase.severity == "urgent",
                    ModerationCase.acknowledged_at.is_(None),
                    ModerationCase.dispositioned_at.is_(None),
                )
                .label("unacknowledged_urgent"),
                func.count(ModerationCase.id)
                .filter(
                    ModerationCase.state.in_(["open", "acknowledged"]),
                    ModerationCase.severity == "ordinary",
                    ModerationCase.dispositioned_at.is_(None),
                    ModerationCase.due_at > now,
                    ModerationCase.due_at <= now + timedelta(hours=4),
                )
                .label("ordinary_due_soon"),
            )
        )
    ).one()

    return {
        "mode": moderation_mode(),
        "queues": queues,
        "jobs": {
            "pending": int(job_stats.pending),
            "processing": int(job_stats.processing),
            "failed": int(job_stats.failed),
            "stale": int(job_stats.stale),
            "oldest_pending_at": job_stats.oldest_pending_at,
            "latest_completion_at": job_stats.latest_completion_at,
        },
        "alerts": {
            "pending": int(alert_stats.pending),
            "failed": int(alert_stats.failed),
            "latest_delivery_at": alert_stats.latest_delivery_at,
        },
        "sla": {
            "unacknowledged_urgent": int(sla_stats.unacknowledged_urgent),
            "ordinary_due_soon": int(sla_stats.ordinary_due_soon),
            "overdue": queues["overdue"],
        },
        "generated_at": now,
    }


async def _subject_context(session: AsyncSession, player_id: int | None) -> dict[str, Any] | None:
    if player_id is None:
        return None
    player = await session.get(Player, player_id)
    if player is None:
        return {"id": player_id, "display_name": "Unavailable"}
    return {"id": player.id, "display_name": player.full_name}


async def _target_context(session: AsyncSession, case: ModerationCase) -> dict[str, Any]:
    if case.target_type == "player":
        player = await session.get(Player, case.target_id)
        return {
            "kind": "profile",
            "available": player is not None,
            "title": player.full_name if player else "Profile unavailable",
            "text": player.nickname if player else None,
            "metadata": {},
            "visibility": None,
        }
    model = TARGET_MODELS.get(case.target_type)
    target = await session.get(model, case.target_id) if model else None
    if target is None:
        return {
            "kind": case.target_type,
            "available": False,
            "title": "Target unavailable",
            "text": None,
            "metadata": {},
            "visibility": None,
        }
    metadata: dict[str, Any] = {"created_at": getattr(target, "created_at", None)}
    text: str | None = None
    title = case.target_type.replace("_", " ").title()
    if case.target_type == "direct_message":
        text = target.message_text
        metadata["delivery"] = "direct message"
    elif case.target_type == "league_message":
        text = target.message_text
        metadata["league_id"] = target.league_id
    elif case.target_type == "court_review":
        text = target.review_text
        court = await session.get(Court, target.court_id)
        title = f"Review of {court.name}" if court else "Court review"
        metadata.update({"court_id": target.court_id, "rating": target.rating})
    elif case.target_type == "court_photo":
        text = target.caption
        court = await session.get(Court, target.court_id)
        title = f"Photo at {court.name}" if court else "Court photo"
        metadata.update({"court_id": target.court_id, "media_type": "image"})
    elif case.target_type == "court_review_photo":
        review = await session.get(CourtReview, target.review_id)
        court = await session.get(Court, review.court_id) if review else None
        title = f"Review photo at {court.name}" if court else "Court review photo"
        metadata.update(
            {
                "review_id": target.review_id,
                "court_id": review.court_id if review else None,
                "media_type": "image",
            }
        )
    return {
        "kind": case.target_type,
        "available": True,
        "title": title,
        "text": text,
        "metadata": metadata,
        "visibility": target.moderation_visibility,
    }


async def _target_visibility(session: AsyncSession, case: ModerationCase) -> str | None:
    if case.target_type == "player":
        return None
    model = TARGET_MODELS.get(case.target_type)
    target = await session.get(model, case.target_id) if model else None
    return target.moderation_visibility if target is not None else None


async def _allowed_actions(session: AsyncSession, case: ModerationCase) -> list[str]:
    actions = ["legal_hold"]
    if case.state not in {"open", "acknowledged"}:
        open_appeal = (
            await session.execute(
                select(ModerationAppeal.id)
                .where(
                    ModerationAppeal.case_id == case.id,
                    ModerationAppeal.status == "open",
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if open_appeal is not None:
            actions.extend(["grant_appeal", "uphold_appeal"])
        subject_user = await _subject_user(session, case.subject_player_id)
        if (
            subject_user is not None
            and subject_user.moderation_case_id == case.id
            and _effective_user_status(subject_user) in {"suspended", "banned"}
        ):
            actions.append("account_restore")
        return actions
    if case.state == "open":
        actions.append("acknowledge")
    actions.extend(["dismiss", "warn"])
    if case.subject_player_id:
        actions.append("interaction_lock")
        subject_user = await _subject_user(session, case.subject_player_id)
        account_state = _effective_user_status(subject_user) if subject_user is not None else None
        if account_state == "active":
            actions.extend(["account_suspend", "account_ban"])
        elif account_state == "suspended":
            actions.extend(["account_restore", "account_ban"])
        elif account_state == "banned":
            actions.append("account_restore")
        open_appeal = (
            await session.execute(
                select(ModerationAppeal.id)
                .where(
                    ModerationAppeal.case_id == case.id,
                    ModerationAppeal.status == "open",
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if open_appeal is not None:
            actions.extend(["grant_appeal", "uphold_appeal"])
    visibility = await _target_visibility(session, case)
    if visibility in {"visible", "pending"}:
        actions.extend(["quarantine", "remove"])
    elif visibility == "quarantined":
        actions.extend(["restore", "remove"])
    return actions


async def _subject_user(
    session: AsyncSession, player_id: int | None, *, for_update: bool = False
) -> User | None:
    if player_id is None:
        return None
    query = select(User).join(Player, Player.user_id == User.id).where(Player.id == player_id)
    if for_update:
        query = query.with_for_update()
    return (await session.execute(query)).scalar_one_or_none()


def _effective_user_status(user: User) -> str:
    return user_service.effective_moderation_status(
        {
            "moderation_status": user.moderation_status,
            "moderation_expires_at": user.moderation_expires_at,
        }
    )


def _case_dict(case: ModerationCase) -> dict[str, Any]:
    return {
        "id": case.id,
        "target_type": case.target_type,
        "target_id": case.target_id,
        "subject_player_id": case.subject_player_id,
        "state": case.state,
        "severity": case.severity,
        "incident_type": getattr(case, "incident_type", None),
        "junior_involved": case.junior_involved,
        "due_at": case.due_at,
        "urgent_since_at": getattr(case, "urgent_since_at", None),
        "legal_hold": case.legal_hold,
        "current_action": case.current_action,
        "acknowledged_at": case.acknowledged_at,
        "dispositioned_at": getattr(case, "dispositioned_at", None),
        "closed_at": case.closed_at,
        "created_at": case.created_at,
        "updated_at": case.updated_at,
    }


def _appeal_dict(appeal: ModerationAppeal) -> dict[str, Any]:
    return {
        "id": appeal.id,
        "case_id": appeal.case_id,
        "status": appeal.status,
        "statement": appeal.statement,
        "resolution_reason": appeal.resolution_reason,
        "created_at": appeal.created_at,
        "resolved_at": appeal.resolved_at,
    }
