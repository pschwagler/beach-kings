"""Reporting, owner review, and durable moderation queue operations."""

from datetime import timedelta
from typing import Any

from sqlalchemy import String, cast, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    CourtPhoto,
    Court,
    CourtReview,
    CourtReviewPhoto,
    DirectMessage,
    InteractionRestriction,
    LeagueMember,
    LeagueMessage,
    ModerationCase,
    ModerationAppeal,
    ModerationEvent,
    ModerationEvidence,
    ModerationJob,
    ModerationReport,
    Player,
    User,
)
from backend.services import notification_service, user_service
from backend.utils.datetime_utils import utcnow


TARGET_MODELS = {
    "direct_message": DirectMessage,
    "league_message": LeagueMessage,
    "court_review": CourtReview,
    "court_photo": CourtPhoto,
    "court_review_photo": CourtReviewPhoto,
}


async def _resolve_target(session: AsyncSession, reporter_id: int, target_type: str, target_id: int):
    """Return target and subject after proving the reporter could see it."""
    if target_type == "player":
        target = await session.get(Player, target_id)
        if target is None:
            raise ValueError("Report target not found")
        subject_id = target.id
    elif target_type == "direct_message":
        target = await session.get(DirectMessage, target_id)
        if target is None or reporter_id not in (target.sender_player_id, target.receiver_player_id):
            raise ValueError("Report target not found")
        if target.moderation_visibility != "visible" and not (
            target.moderation_visibility == "pending" and target.sender_player_id == reporter_id
        ):
            raise ValueError("Report target not found")
        subject_id = target.sender_player_id
    elif target_type == "league_message":
        target = await session.get(LeagueMessage, target_id)
        if target is None:
            raise ValueError("Report target not found")
        membership = await session.execute(
            select(LeagueMember.id).where(LeagueMember.league_id == target.league_id, LeagueMember.player_id == reporter_id)
        )
        if membership.scalar_one_or_none() is None:
            raise ValueError("Report target not found")
        if target.moderation_visibility != "visible" and not (
            target.moderation_visibility == "pending" and target.user_id == (
                await session.execute(select(Player.user_id).where(Player.id == reporter_id))
            ).scalar_one_or_none()
        ):
            raise ValueError("Report target not found")
        subject_id = (await session.execute(select(Player.id).where(Player.user_id == target.user_id))).scalar_one_or_none()
    elif target_type == "court_review":
        target = await session.get(CourtReview, target_id)
        if target is None or target.moderation_visibility != "visible":
            raise ValueError("Report target not found")
        subject_id = target.player_id
    elif target_type == "court_photo":
        target = await session.get(CourtPhoto, target_id)
        if target is None or target.moderation_visibility != "visible":
            raise ValueError("Report target not found")
        subject_id = target.uploaded_by
    elif target_type == "court_review_photo":
        result = await session.execute(
            select(CourtReviewPhoto, CourtReview.player_id)
            .join(CourtReview, CourtReview.id == CourtReviewPhoto.review_id)
            .where(CourtReviewPhoto.id == target_id)
        )
        row = result.one_or_none()
        if row is None or row[0].moderation_visibility != "visible":
            raise ValueError("Report target not found")
        target, subject_id = row
    else:
        raise ValueError("Unsupported report target")
    if subject_id == reporter_id:
        raise ValueError("You cannot report your own content")
    return target, subject_id


async def create_report(
    session: AsyncSession,
    reporter_id: int,
    target_type: str,
    target_id: int,
    reason: str,
    details: str | None,
) -> dict[str, Any]:
    target, subject_id = await _resolve_target(session, reporter_id, target_type, target_id)
    existing = await session.execute(
        select(ModerationReport).where(
            ModerationReport.reporter_player_id == reporter_id,
            ModerationReport.target_type == target_type,
            ModerationReport.target_id == target_id,
            ModerationReport.status == "open",
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise ValueError("You already reported this content")

    case_result = await session.execute(
        select(ModerationCase)
        .where(ModerationCase.target_type == target_type, ModerationCase.target_id == target_id, ModerationCase.state.in_(["open", "acknowledged"]))
        .with_for_update()
    )
    case = case_result.scalar_one_or_none()
    if case is None:
        severity = "urgent" if reason in {"threats_violence", "minor_safety", "self_harm"} else "ordinary"
        case = ModerationCase(
            target_type=target_type,
            target_id=target_id,
            subject_player_id=subject_id,
            severity=severity,
            due_at=utcnow() + timedelta(hours=4 if severity == "urgent" else 24),
        )
        session.add(case)
        await session.flush()

    report = ModerationReport(
        case_id=case.id,
        reporter_player_id=reporter_id,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        details=details.strip() if details else None,
    )
    session.add(report)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise ValueError("You already reported this content") from exc
    session.add(ModerationEvent(case_id=case.id, event_type="report_received", metadata_json={"reason": reason}))
    from backend.services.moderation_evidence_service import (
        capture_chat_context,
        capture_s3_object,
        capture_s3_url,
        capture_text,
    )

    evidence_operations = []
    if target_type == "player":
        profile_text = "\n".join(
            value.strip()
            for value in (target.full_name, target.nickname)
            if value and value.strip()
        )
        if profile_text:
            evidence_operations.append(capture_text(session, case.id, profile_text))
        if target.profile_picture_url:
            evidence_operations.append(
                capture_s3_url(
                    session,
                    case.id,
                    target.profile_picture_url,
                    "image",
                )
            )
    if target_type in {"court_photo", "court_review_photo"}:
        evidence_operations.append(
            capture_s3_object(session, case.id, target.s3_key, "image")
        )
    if target_type in {"direct_message", "league_message"}:
        evidence_operations.append(capture_text(session, case.id, target.message_text))
        evidence_operations.append(capture_chat_context(session, case.id))
    elif target_type == "court_review" and target.review_text:
        evidence_operations.append(capture_text(session, case.id, target.review_text))
    elif target_type == "court_photo" and target.caption:
        evidence_operations.append(capture_text(session, case.id, target.caption))

    for evidence_operation in evidence_operations:
        try:
            await evidence_operation
        except Exception as exc:  # Reporting must remain available during storage outages.
            session.add(
                ModerationEvent(
                    case_id=case.id,
                    event_type="evidence_capture_failed",
                    metadata_json={"error_type": type(exc).__name__},
                )
            )
    session.add(
        ModerationJob(
            idempotency_key=f"report:{report.id}:v1",
            case_id=case.id,
            target_type=target_type,
            target_id=target_id,
        )
    )
    await session.flush()
    return _report_receipt(report)


async def list_my_reports(session: AsyncSession, reporter_id: int) -> list[dict[str, Any]]:
    result = await session.execute(
        select(ModerationReport)
        .where(ModerationReport.reporter_player_id == reporter_id)
        .order_by(ModerationReport.created_at.desc())
    )
    return [_report_receipt(report) for report in result.scalars().all()]


def _report_receipt(report: ModerationReport) -> dict[str, Any]:
    return {
        "id": report.id,
        "target_type": report.target_type,
        "target_id": report.target_id,
        "reason": report.reason,
        "status": report.status,
        "created_at": report.created_at,
    }


async def account_status(session: AsyncSession, user_id: int) -> dict[str, Any]:
    """Return effective account and interaction restrictions for the signed-in user."""
    user = await session.get(User, user_id)
    if user is None:
        raise ValueError("User not found")
    player_id = (
        await session.execute(
            select(Player.id).where(
                Player.user_id == user_id,
                Player.is_placeholder == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    restriction = None
    if player_id is not None:
        from backend.services import interaction_policy

        restriction = await interaction_policy.current_restriction(session, player_id)
    appeals = await list_appeals(session, player_id) if player_id is not None else []
    effective_status = _effective_user_status(user)
    return {
        "account_status": effective_status,
        "account_expires_at": (
            user.moderation_expires_at if effective_status != "active" else None
        ),
        "account_case_id": user.moderation_case_id if effective_status != "active" else None,
        "interaction_restricted_until": restriction.expires_at if restriction else None,
        "interaction_restriction_case_id": restriction.case_id if restriction else None,
        "appeals": appeals,
    }


async def create_appeal(
    session: AsyncSession, player_id: int, case_id: int, statement: str
) -> dict[str, Any]:
    """Create one open appeal for an enforcement case owned by the affected player."""
    case = await session.get(ModerationCase, case_id)
    if case is None or case.subject_player_id != player_id:
        raise ValueError("Case is not eligible for appeal")
    has_enforcement = case.current_action in {
        "interaction_lock",
        "account_suspend",
        "account_ban",
    }
    if not has_enforcement:
        linked_account = (
            await session.execute(
                select(User.id)
                .join(Player, Player.user_id == User.id)
                .where(
                    Player.id == player_id,
                    User.moderation_case_id == case_id,
                    User.moderation_status.in_(["suspended", "banned"]),
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        linked_restriction = (
            await session.execute(
                select(InteractionRestriction.id)
                .where(
                    InteractionRestriction.case_id == case_id,
                    InteractionRestriction.player_id == player_id,
                    InteractionRestriction.revoked_at.is_(None),
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        has_enforcement = linked_account is not None or linked_restriction is not None
    if not has_enforcement:
        raise ValueError("Case is not eligible for appeal")
    existing = (
        await session.execute(
            select(ModerationAppeal).where(
                ModerationAppeal.case_id == case_id,
                ModerationAppeal.player_id == player_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise ValueError("An appeal already exists for this case")
    normalized_statement = statement.strip()
    if len(normalized_statement) < 10:
        raise ValueError("Appeal statement is too short")
    appeal = ModerationAppeal(
        case_id=case_id,
        player_id=player_id,
        statement=normalized_statement,
    )
    session.add(appeal)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise ValueError("An appeal is already open for this case") from exc
    session.add(
        ModerationEvent(
            case_id=case_id,
            event_type="appeal_received",
            metadata_json={"appeal_id": appeal.id},
        )
    )
    await session.flush()
    return _appeal_dict(appeal)


async def list_appeals(session: AsyncSession, player_id: int) -> list[dict[str, Any]]:
    result = await session.execute(
        select(ModerationAppeal)
        .where(ModerationAppeal.player_id == player_id)
        .order_by(ModerationAppeal.created_at.desc(), ModerationAppeal.id.desc())
    )
    return [_appeal_dict(item) for item in result.scalars().all()]


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
    query = select(ModerationCase, func.count(ModerationReport.id).label("report_count")).outerjoin(
        ModerationReport, ModerationReport.case_id == ModerationCase.id
    ).group_by(ModerationCase.id)
    now = utcnow()
    active = ModerationCase.state.in_(["open", "acknowledged"])
    if queue == "urgent":
        query = query.where(ModerationCase.severity == "urgent")
    elif queue == "due":
        query = query.where(ModerationCase.due_at <= now + timedelta(hours=24))
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
        term = f"%{search.strip()}%"
        query = query.where(
            or_(cast(ModerationCase.id, String).ilike(term), cast(ModerationCase.target_id, String).ilike(term))
        )
    count_query = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_query)).scalar_one()
    rows = (
        await session.execute(
            query.order_by(
                ModerationCase.due_at.asc().nullslast(),
                ModerationCase.created_at.asc(),
                ModerationCase.id.asc(),
            ).offset((page - 1) * page_size).limit(page_size)
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

    async def count_where(*conditions) -> int:
        value = await session.execute(select(func.count(ModerationCase.id)).where(*conditions))
        return value.scalar_one()

    return {
        "all": await count_where(),
        "active": await count_where(active),
        "urgent": await count_where(active, ModerationCase.severity == "urgent"),
        "due": await count_where(active, ModerationCase.due_at <= now + timedelta(hours=24)),
        "ordinary": await count_where(active, ModerationCase.severity == "ordinary"),
        "open": await count_where(ModerationCase.state == "open"),
        "acknowledged": await count_where(ModerationCase.state == "acknowledged"),
        "closed": await count_where(ModerationCase.state.in_(["closed", "dismissed"])),
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
    subject_ids = {
        case.subject_player_id for case in cases if case.subject_player_id is not None
    }
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
        target_ids = [
            case.target_id for case in cases if case.target_type == target_type
        ]
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
            "source": (
                "member_report" if report_counts.get(case.id, 0) else "automated"
            ),
            "primary_reason": primary_reasons.get(case.id),
        }
    return summaries


async def get_case(session: AsyncSession, case_id: int) -> dict[str, Any] | None:
    case = await session.get(ModerationCase, case_id)
    if case is None:
        return None
    events = (
        await session.execute(select(ModerationEvent).where(ModerationEvent.case_id == case_id).order_by(ModerationEvent.created_at.asc()))
    ).scalars().all()
    reports = (
        await session.execute(select(ModerationReport).where(ModerationReport.case_id == case_id).order_by(ModerationReport.created_at.asc()))
    ).scalars().all()
    evidence = (
        await session.execute(select(ModerationEvidence).where(ModerationEvidence.case_id == case_id).order_by(ModerationEvidence.captured_at.asc()))
    ).scalars().all()
    jobs = (
        await session.execute(select(ModerationJob).where(ModerationJob.case_id == case_id).order_by(ModerationJob.created_at.desc()))
    ).scalars().all()
    appeals = (
        await session.execute(
            select(ModerationAppeal)
            .where(ModerationAppeal.case_id == case_id)
            .order_by(ModerationAppeal.created_at.asc(), ModerationAppeal.id.asc())
        )
    ).scalars().all()
    actor_ids = {event.actor_user_id for event in events if event.actor_user_id is not None}
    actor_names: dict[int, str] = {}
    if actor_ids:
        rows = await session.execute(
            select(Player.user_id, Player.full_name).where(Player.user_id.in_(actor_ids)).order_by(Player.id.asc())
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
        "reports": [{"id": r.id, "reason": r.reason, "details": r.details, "created_at": r.created_at} for r in reports],
        "provider_reviews": provider_reviews,
        "events": [{"id": e.id, "event_type": e.event_type, "operator_user_id": e.actor_user_id, "operator_name": actor_names.get(e.actor_user_id), "reason": e.reason, "metadata": e.metadata_json, "created_at": e.created_at} for e in events],
        "evidence": [{"id": item.id, "state": "purged" if item.purged_at else "available", "content_type": item.content_type, "captured_at": item.captured_at, "purge_after": item.purge_after, "purged_at": item.purged_at, "access_expires_in": 300} for item in evidence],
        "jobs": [{"id": job.id, "status": job.status, "attempts": job.attempts, "available_at": job.available_at, "claimed_at": job.claimed_at, "last_error": job.last_error, "created_at": job.created_at, "updated_at": job.updated_at, "can_retry": job.status == "failed"} for job in jobs],
        "appeals": [_appeal_dict(appeal) for appeal in appeals],
        "allowed_actions": await _allowed_actions(session, case),
    }


async def apply_action(
    session: AsyncSession,
    case_id: int,
    actor_user_id: int,
    action: str,
    reason: str,
    lock_hours: int | None,
    legal_hold: bool | None = None,
    appeal_id: int | None = None,
) -> dict[str, Any]:
    result = await session.execute(select(ModerationCase).where(ModerationCase.id == case_id).with_for_update())
    case = result.scalar_one_or_none()
    if case is None:
        raise ValueError("Case not found")
    if not reason.strip():
        raise ValueError("A reason is required")
    now = utcnow()
    active = case.state in {"open", "acknowledged"}
    if action not in {"legal_hold", "grant_appeal", "uphold_appeal", "account_restore"} and not active:
        raise ValueError("This case is closed; only appeal, restore, or legal-hold changes are allowed")
    if action == "acknowledge":
        if case.state != "open":
            raise ValueError("Only open cases can be acknowledged")
        case.state = "acknowledged"
        case.acknowledged_at = now
    elif action == "dismiss":
        case.state, case.closed_at = "dismissed", now
    elif action in {"quarantine", "restore", "remove"}:
        current_visibility = await _target_visibility(session, case)
        if action == "restore" and current_visibility != "quarantined":
            raise ValueError("Only quarantined content can be restored")
        if action == "quarantine" and current_visibility in {None, "quarantined", "removed"}:
            raise ValueError("Only visible or pending content can be quarantined")
        if action == "remove" and current_visibility in {None, "removed"}:
            raise ValueError("This target cannot be removed or is already removed")
        await _set_visibility(session, case, {"quarantine": "quarantined", "restore": "visible", "remove": "removed"}[action])
        case.current_action = action
        if action in {"restore", "remove"}:
            case.state, case.closed_at = "closed", now
    elif action == "warn":
        case.current_action = "warn"
    elif action == "interaction_lock":
        if not case.subject_player_id or not lock_hours:
            raise ValueError("A lock duration and subject are required")
        session.add(
            InteractionRestriction(
                player_id=case.subject_player_id,
                reason=reason,
                expires_at=now + timedelta(hours=lock_hours),
                created_by_user_id=actor_user_id,
                case_id=case.id,
            )
        )
        case.current_action = "interaction_lock"
    elif action in {"account_suspend", "account_ban", "account_restore"}:
        if not case.subject_player_id:
            raise ValueError("This case has no account subject")
        subject_user = await _subject_user(session, case.subject_player_id, for_update=True)
        if subject_user is None:
            raise ValueError("Subject account is unavailable")
        subject_status = _effective_user_status(subject_user)
        if action == "account_suspend":
            if not lock_hours:
                raise ValueError("A suspension duration is required")
            if subject_status != "active":
                raise ValueError("Only an active account can be suspended")
            subject_user.moderation_status = "suspended"
            subject_user.moderation_expires_at = now + timedelta(hours=lock_hours)
            subject_user.moderation_case_id = case.id
        elif action == "account_ban":
            if subject_status == "banned":
                raise ValueError("This account is already banned")
            subject_user.moderation_status = "banned"
            subject_user.moderation_expires_at = None
            subject_user.moderation_case_id = case.id
        else:
            if subject_status not in {"suspended", "banned"}:
                raise ValueError("This account has no active full-account enforcement")
            if subject_user.moderation_case_id != case.id:
                raise ValueError("This case is not the active account enforcement")
            subject_user.moderation_status = "active"
            subject_user.moderation_expires_at = None
            subject_user.moderation_case_id = None
        subject_user.moderation_updated_at = now
        case.current_action = action
        if action == "account_restore":
            case.state, case.closed_at = "closed", now
    elif action in {"grant_appeal", "uphold_appeal"}:
        if appeal_id is None:
            raise ValueError("An appeal is required")
        appeal_result = await session.execute(
            select(ModerationAppeal)
            .where(
                ModerationAppeal.id == appeal_id,
                ModerationAppeal.case_id == case.id,
            )
            .with_for_update()
        )
        appeal = appeal_result.scalar_one_or_none()
        if appeal is None or appeal.status != "open":
            raise ValueError("Open appeal not found")
        appeal.status = "granted" if action == "grant_appeal" else "upheld"
        appeal.resolution_reason = reason
        appeal.resolved_by_user_id = actor_user_id
        appeal.resolved_at = now
        if action == "grant_appeal":
            subject_user = await _subject_user(session, case.subject_player_id, for_update=True)
            if subject_user is not None and subject_user.moderation_case_id == case.id:
                subject_user.moderation_status = "active"
                subject_user.moderation_expires_at = None
                subject_user.moderation_case_id = None
                subject_user.moderation_updated_at = now
            await session.execute(
                update(InteractionRestriction)
                .where(
                    InteractionRestriction.case_id == case.id,
                    InteractionRestriction.revoked_at.is_(None),
                )
                .values(revoked_at=now)
            )
        case.current_action = action
        case.state, case.closed_at = "closed", now
    elif action == "legal_hold":
        if legal_hold is None:
            raise ValueError("Legal-hold state is required")
        if case.legal_hold == legal_hold:
            raise ValueError("Legal hold is already in the requested state")
        case.legal_hold = legal_hold
    else:
        raise ValueError("Unsupported moderation action")
    metadata = {"lock_hours": lock_hours} if lock_hours else {}
    if action == "legal_hold":
        metadata["enabled"] = legal_hold
    if appeal_id is not None:
        metadata["appeal_id"] = appeal_id
    session.add(ModerationEvent(case_id=case.id, event_type=f"human_{action}", actor_user_id=actor_user_id, reason=reason, metadata_json=metadata))
    if action in {
        "warn",
        "quarantine",
        "remove",
        "interaction_lock",
        "account_suspend",
        "account_ban",
        "account_restore",
        "grant_appeal",
        "uphold_appeal",
    } and case.subject_player_id:
        user_id = (await session.execute(select(Player.user_id).where(Player.id == case.subject_player_id))).scalar_one_or_none()
        if user_id:
            await notification_service.create_notification(
                session,
                user_id,
                "moderation_update",
                "Safety update",
                "A safety action was applied to your account or content. Review your account status for details and appeal options.",
                data={"case_id": case.id, "action": action},
                link_url="/account-status",
            )
            if action in {"account_suspend", "account_ban"}:
                from backend.services.websocket_manager import get_websocket_manager

                await get_websocket_manager().close_user(
                    user_id, reason="Account moderation status changed"
                )
    if case.closed_at is not None:
        await session.execute(
            ModerationReport.__table__.update()
            .where(ModerationReport.case_id == case.id, ModerationReport.status == "open")
            .values(status="closed")
        )
        from backend.services.moderation_evidence_service import schedule_case_purge

        await schedule_case_purge(session, case.id)
    await session.flush()
    # Server-managed timestamps are expired by the flush. Refresh explicitly
    # before the synchronous response serializer reads them in async sessions.
    await session.refresh(case)
    return _case_dict(case)


async def retry_failed_job(
    session: AsyncSession, job_id: int, actor_user_id: int, reason: str
) -> dict[str, Any]:
    result = await session.execute(select(ModerationJob).where(ModerationJob.id == job_id).with_for_update())
    job = result.scalar_one_or_none()
    if job is None:
        raise ValueError("Job not found")
    if job.status != "failed":
        raise ValueError("Only failed jobs can be retried")
    if not reason.strip():
        raise ValueError("A reason is required")
    job.status = "pending"
    job.attempts = 0
    job.available_at = utcnow()
    job.claimed_at = None
    job.last_error = None
    if job.case_id is not None:
        session.add(
            ModerationEvent(
                case_id=job.case_id,
                event_type="job_retry_requested",
                actor_user_id=actor_user_id,
                reason=reason.strip(),
                metadata_json={"job_id": job.id, "attempt_cycle_reset": True},
            )
        )
    await session.flush()
    return {"id": job.id, "status": job.status, "attempts": job.attempts, "available_at": job.available_at}


async def overview(session: AsyncSession) -> dict[str, Any]:
    now = utcnow()
    stale_before = now - timedelta(minutes=10)

    async def job_count(*conditions) -> int:
        return (
            await session.execute(select(func.count(ModerationJob.id)).where(*conditions))
        ).scalar_one()

    oldest_pending = (
        await session.execute(
            select(ModerationJob.created_at)
            .where(ModerationJob.status == "pending")
            .order_by(ModerationJob.created_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    latest_completion = (
        await session.execute(
            select(ModerationJob.updated_at)
            .where(ModerationJob.status == "completed")
            .order_by(ModerationJob.updated_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    from backend.services.moderation_worker import moderation_mode

    return {
        "mode": moderation_mode(),
        "queues": await _queue_totals(session, now),
        "jobs": {
            "pending": await job_count(ModerationJob.status == "pending"),
            "processing": await job_count(ModerationJob.status == "processing"),
            "failed": await job_count(ModerationJob.status == "failed"),
            "stale": await job_count(ModerationJob.status == "processing", ModerationJob.claimed_at < stale_before),
            "oldest_pending_at": oldest_pending,
            "latest_completion_at": latest_completion,
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
        return {"kind": case.target_type, "available": False, "title": "Target unavailable", "text": None, "metadata": {}, "visibility": None}
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
        metadata.update({"review_id": target.review_id, "court_id": review.court_id if review else None, "media_type": "image"})
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
                select(ModerationAppeal.id).where(
                    ModerationAppeal.case_id == case.id,
                    ModerationAppeal.status == "open",
                ).limit(1)
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
                select(ModerationAppeal.id).where(
                    ModerationAppeal.case_id == case.id,
                    ModerationAppeal.status == "open",
                ).limit(1)
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


async def _set_visibility(session: AsyncSession, case: ModerationCase, visibility: str) -> None:
    if case.target_type == "player":
        return
    model = TARGET_MODELS.get(case.target_type)
    if model is None:
        raise ValueError("Target does not support visibility actions")
    target = await session.get(model, case.target_id)
    if target is None:
        raise ValueError("Target no longer exists")
    target.moderation_visibility = visibility
    if visibility == "removed" and case.target_type in {"court_photo", "court_review_photo"}:
        from backend.services import s3_service

        s3_service.delete_file(target.s3_key)


def _case_dict(case: ModerationCase) -> dict[str, Any]:
    return {
        "id": case.id,
        "target_type": case.target_type,
        "target_id": case.target_id,
        "subject_player_id": case.subject_player_id,
        "state": case.state,
        "severity": case.severity,
        "junior_involved": case.junior_involved,
        "due_at": case.due_at,
        "legal_hold": case.legal_hold,
        "current_action": case.current_action,
        "acknowledged_at": case.acknowledged_at,
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
