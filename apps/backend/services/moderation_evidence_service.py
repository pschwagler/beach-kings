"""Private moderation evidence storage and retention operations."""

import json
import os
import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    DirectMessage,
    LeagueMessage,
    ModerationCase,
    ModerationEvidence,
    ModerationEvent,
    Player,
)
from backend.services.s3_service import _get_s3_client
from backend.services.s3_service import _get_config
from backend.services.s3_service import _extract_key_from_url
from backend.utils.datetime_utils import utcnow


CHAT_CONTEXT_CONTENT_TYPE = "application/vnd.beach-kings.moderation-chat-context+json"
CHAT_CONTEXT_RADIUS = 3


def _evidence_bucket() -> str:
    bucket = os.getenv("AWS_MODERATION_EVIDENCE_BUCKET")
    if not bucket:
        raise RuntimeError("AWS_MODERATION_EVIDENCE_BUCKET is not configured")
    return bucket


async def capture(
    session: AsyncSession, case_id: int, body: bytes, content_type: str
) -> ModerationEvidence:
    key = f"cases/{case_id}/{uuid.uuid4().hex}"
    _get_s3_client().put_object(
        Bucket=_evidence_bucket(),
        Key=key,
        Body=body,
        ContentType=content_type,
        ServerSideEncryption="AES256",
    )
    evidence = ModerationEvidence(case_id=case_id, object_key=key, content_type=content_type)
    session.add(evidence)
    session.add(
        ModerationEvent(
            case_id=case_id,
            event_type="evidence_captured",
            metadata_json={"object_key": key},
        )
    )
    await session.flush()
    return evidence


async def capture_text(
    session: AsyncSession, case_id: int, text: str
) -> ModerationEvidence | None:
    """Capture one immutable UTF-8 target-text snapshot per case."""
    if not text:
        return None
    existing = (
        (
            await session.execute(
                select(ModerationEvidence).where(
                    ModerationEvidence.case_id == case_id,
                    ModerationEvidence.content_type == "text/plain; charset=utf-8",
                    ModerationEvidence.purged_at.is_(None),
                )
            )
        )
        .scalars()
        .first()
    )
    if existing is not None:
        return existing
    return await capture(
        session,
        case_id,
        text.encode("utf-8"),
        "text/plain; charset=utf-8",
    )


async def capture_chat_context(session: AsyncSession, case_id: int) -> ModerationEvidence | None:
    """Capture a bounded, identity-safe chat snapshot for a message case.

    The snapshot contains the target plus at most three messages on either side,
    using stable created-at/id ordering. Speaker labels are deliberately limited
    to the case subject versus another participant; no reporter identity or raw
    participant identifier is persisted in the evidence object.
    """
    existing = (
        (
            await session.execute(
                select(ModerationEvidence).where(
                    ModerationEvidence.case_id == case_id,
                    ModerationEvidence.content_type == CHAT_CONTEXT_CONTENT_TYPE,
                    ModerationEvidence.purged_at.is_(None),
                )
            )
        )
        .scalars()
        .first()
    )
    if existing is not None:
        return existing

    case = await session.get(ModerationCase, case_id)
    if case is None or case.target_type not in {"direct_message", "league_message"}:
        return None

    model = DirectMessage if case.target_type == "direct_message" else LeagueMessage
    target = await session.get(model, case.target_id)
    if target is None:
        return None

    if case.target_type == "direct_message":
        participant_pair = (
            target.sender_player_id,
            target.receiver_player_id,
        )
        scope = or_(
            and_(
                DirectMessage.sender_player_id == participant_pair[0],
                DirectMessage.receiver_player_id == participant_pair[1],
            ),
            and_(
                DirectMessage.sender_player_id == participant_pair[1],
                DirectMessage.receiver_player_id == participant_pair[0],
            ),
        )
        subject_user_id = None
    else:
        scope = LeagueMessage.league_id == target.league_id
        subject_user_id = None
        if case.subject_player_id is not None:
            subject_user_id = (
                await session.execute(
                    select(Player.user_id).where(Player.id == case.subject_player_id)
                )
            ).scalar_one_or_none()

    target_created_at = target.created_at
    if target_created_at is None:
        before_position = model.id < target.id
        after_position = model.id > target.id
    else:
        before_position = or_(
            model.created_at < target_created_at,
            and_(model.created_at == target_created_at, model.id < target.id),
        )
        after_position = or_(
            model.created_at > target_created_at,
            and_(model.created_at == target_created_at, model.id > target.id),
        )

    before = (
        (
            await session.execute(
                select(model)
                .where(scope, before_position)
                .order_by(model.created_at.desc(), model.id.desc())
                .limit(CHAT_CONTEXT_RADIUS)
            )
        )
        .scalars()
        .all()
    )
    after = (
        (
            await session.execute(
                select(model)
                .where(scope, after_position)
                .order_by(model.created_at.asc(), model.id.asc())
                .limit(CHAT_CONTEXT_RADIUS)
            )
        )
        .scalars()
        .all()
    )
    messages = [*reversed(before), target, *after]

    def speaker(message: Any) -> str:
        if case.target_type == "direct_message":
            return "subject" if message.sender_player_id == case.subject_player_id else "other"
        return "subject" if message.user_id == subject_user_id else "other"

    payload = {
        "version": 1,
        "messages": [
            {
                "id": message.id,
                "created_at": (message.created_at.isoformat() if message.created_at else None),
                "speaker": speaker(message),
                "text": message.message_text,
                "is_target": message.id == target.id,
            }
            for message in messages
        ],
    }
    return await capture(
        session,
        case_id,
        json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        CHAT_CONTEXT_CONTENT_TYPE,
    )


async def read_chat_context(
    session: AsyncSession, case_id: int, actor_user_id: int
) -> dict[str, Any]:
    """Return an audited structured context snapshot for a moderation case."""
    case = await session.get(ModerationCase, case_id)
    if case is None:
        raise ValueError("Case not found")
    if case.target_type not in {"direct_message", "league_message"}:
        return await _context_unavailable(session, case_id, actor_user_id, "not_applicable")

    evidence = (
        (
            await session.execute(
                select(ModerationEvidence)
                .where(
                    ModerationEvidence.case_id == case_id,
                    ModerationEvidence.content_type == CHAT_CONTEXT_CONTENT_TYPE,
                )
                .order_by(ModerationEvidence.captured_at.desc(), ModerationEvidence.id.desc())
            )
        )
        .scalars()
        .first()
    )
    if evidence is None:
        return await _context_unavailable(session, case_id, actor_user_id, "not_captured")
    if evidence.purged_at is not None:
        return await _context_unavailable(
            session,
            case_id,
            actor_user_id,
            "purged",
            evidence_id=evidence.id,
        )

    try:
        response = _get_s3_client().get_object(Bucket=_evidence_bucket(), Key=evidence.object_key)
        raw_body = response["Body"].read()
        payload = json.loads(raw_body.decode("utf-8"))
        messages = _validated_context_messages(payload["messages"])
    except Exception:
        return await _context_unavailable(
            session,
            case_id,
            actor_user_id,
            "unavailable",
            evidence_id=evidence.id,
        )

    session.add(
        ModerationEvent(
            case_id=case_id,
            event_type="evidence_accessed",
            actor_user_id=actor_user_id,
            metadata_json={
                "evidence_id": evidence.id,
                "content_type": CHAT_CONTEXT_CONTENT_TYPE,
                "outcome": "available",
            },
        )
    )
    return {
        "available": True,
        "captured_at": evidence.captured_at,
        "messages": messages,
    }


def _validated_context_messages(value: Any) -> list[dict[str, Any]]:
    """Return only the public context fields from a valid stored payload."""
    if not isinstance(value, list):
        raise ValueError("Invalid chat context payload")
    messages: list[dict[str, Any]] = []
    for item in value:
        if (
            not isinstance(item, dict)
            or not isinstance(item.get("id"), int)
            or isinstance(item.get("id"), bool)
            or not isinstance(item.get("created_at"), str)
            or item.get("speaker") not in {"subject", "other"}
            or not isinstance(item.get("text"), str)
            or not isinstance(item.get("is_target"), bool)
        ):
            raise ValueError("Invalid chat context payload")
        messages.append(
            {
                "id": item["id"],
                "created_at": item["created_at"],
                "speaker": item["speaker"],
                "text": item["text"],
                "is_target": item["is_target"],
            }
        )
    return messages


async def _context_unavailable(
    session: AsyncSession,
    case_id: int,
    actor_user_id: int,
    reason: str,
    *,
    evidence_id: int | None = None,
) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "content_type": CHAT_CONTEXT_CONTENT_TYPE,
        "outcome": reason,
    }
    if evidence_id is not None:
        metadata["evidence_id"] = evidence_id
    session.add(
        ModerationEvent(
            case_id=case_id,
            event_type="evidence_accessed",
            actor_user_id=actor_user_id,
            metadata_json=metadata,
        )
    )
    return {"available": False, "reason": reason, "messages": []}


async def capture_s3_object(
    session: AsyncSession, case_id: int, source_key: str, content_type: str | None = None
) -> ModerationEvidence:
    existing = (
        (
            await session.execute(
                select(ModerationEvidence).where(
                    ModerationEvidence.case_id == case_id,
                    ModerationEvidence.object_key.like(f"cases/{case_id}/%"),
                    ModerationEvidence.content_type == content_type,
                    ModerationEvidence.purged_at.is_(None),
                )
            )
        )
        .scalars()
        .first()
    )
    if existing is not None:
        return existing
    source_bucket = _get_config().get("bucket")
    if not source_bucket:
        raise RuntimeError("AWS_S3_BUCKET is not configured")
    key = f"cases/{case_id}/{uuid.uuid4().hex}"
    _get_s3_client().copy_object(
        Bucket=_evidence_bucket(),
        Key=key,
        CopySource={"Bucket": source_bucket, "Key": source_key},
        ServerSideEncryption="AES256",
        MetadataDirective="COPY",
    )
    evidence = ModerationEvidence(case_id=case_id, object_key=key, content_type=content_type)
    session.add(evidence)
    session.add(
        ModerationEvent(
            case_id=case_id,
            event_type="evidence_captured",
            metadata_json={"source": "ugc_media"},
        )
    )
    await session.flush()
    return evidence


async def capture_s3_url(
    session: AsyncSession,
    case_id: int,
    source_url: str,
    content_type: str | None = None,
) -> ModerationEvidence:
    """Snapshot an app-owned public S3 URL into the restricted evidence bucket."""
    source_bucket = _get_config().get("bucket")
    source_key = _extract_key_from_url(source_url, source_bucket)
    if not source_key:
        raise ValueError("Profile media URL is not an app-owned S3 object")
    return await capture_s3_object(session, case_id, source_key, content_type)


async def signed_url(
    session: AsyncSession, case_id: int, evidence_id: int, actor_user_id: int
) -> str:
    result = await session.execute(
        select(ModerationEvidence).where(
            ModerationEvidence.id == evidence_id,
            ModerationEvidence.case_id == case_id,
            ModerationEvidence.purged_at.is_(None),
        )
    )
    evidence = result.scalar_one_or_none()
    if evidence is None:
        raise ValueError("Evidence not found")
    url = _get_s3_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": _evidence_bucket(), "Key": evidence.object_key},
        ExpiresIn=300,
    )
    session.add(
        ModerationEvent(
            case_id=case_id,
            event_type="evidence_accessed",
            actor_user_id=actor_user_id,
            metadata_json={"evidence_id": evidence_id},
        )
    )
    return url


async def schedule_case_purge(session: AsyncSession, case_id: int) -> None:
    case = await session.get(ModerationCase, case_id)
    if case is None or case.closed_at is None or case.legal_hold:
        return
    result = await session.execute(
        select(ModerationEvidence).where(
            ModerationEvidence.case_id == case_id, ModerationEvidence.purge_after.is_(None)
        )
    )
    for evidence in result.scalars().all():
        evidence.purge_after = case.closed_at + timedelta(days=180)


async def purge_due(session: AsyncSession) -> int:
    result = await session.execute(
        select(ModerationEvidence, ModerationCase)
        .join(ModerationCase, ModerationCase.id == ModerationEvidence.case_id)
        .where(
            ModerationEvidence.purged_at.is_(None),
            ModerationEvidence.purge_after <= utcnow(),
            ModerationCase.legal_hold.is_(False),
        )
        .with_for_update(skip_locked=True)
    )
    purged = 0
    for evidence, case in result.all():
        _get_s3_client().delete_object(Bucket=_evidence_bucket(), Key=evidence.object_key)
        evidence.purged_at = utcnow()
        session.add(
            ModerationEvent(
                case_id=case.id,
                event_type="evidence_purged",
                metadata_json={"evidence_id": evidence.id},
            )
        )
        purged += 1
    return purged
