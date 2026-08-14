"""Moderation models."""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
    CheckConstraint,
    Index,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from backend.database.db import Base


class ModerationCase(Base):
    """Owner-reviewed moderation case without reporter identity in subject-facing data."""

    __tablename__ = "moderation_cases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    target_type = Column(String(40), nullable=False)
    target_id = Column(Integer, nullable=False)
    subject_player_id = Column(
        Integer, ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    state = Column(String(30), nullable=False, server_default="open")
    severity = Column(String(20), nullable=False, server_default="ordinary")
    incident_type = Column(String(40), nullable=True)
    junior_involved = Column(Boolean, nullable=True)
    due_at = Column(DateTime(timezone=True), nullable=True)
    urgent_since_at = Column(DateTime(timezone=True), nullable=True)
    legal_hold = Column(Boolean, nullable=False, server_default="false")
    current_action = Column(String(30), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    dispositioned_at = Column(DateTime(timezone=True), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_moderation_cases_queue", "state", "severity", "due_at"),
        Index(
            "idx_moderation_cases_due_order",
            "state",
            "dispositioned_at",
            "due_at",
            "created_at",
            "id",
        ),
        Index("idx_moderation_cases_target", "target_type", "target_id"),
    )


class ModerationReport(Base):
    """A reporter's submission. Reporter fields are restricted to moderation services."""

    __tablename__ = "moderation_reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(
        Integer, ForeignKey("moderation_cases.id", ondelete="CASCADE"), nullable=False
    )
    reporter_player_id = Column(
        Integer, ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    target_type = Column(String(40), nullable=False)
    target_id = Column(Integer, nullable=False)
    reason = Column(String(40), nullable=False)
    details = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, server_default="open")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_moderation_reports_reporter", "reporter_player_id", "created_at"),
        Index(
            "uq_moderation_reports_open_target",
            "reporter_player_id",
            "target_type",
            "target_id",
            unique=True,
            postgresql_where=text("status = 'open'"),
        ),
    )


class ModerationAppeal(Base):
    """User appeal of a case-level interaction or account restriction."""

    __tablename__ = "moderation_appeals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(
        Integer, ForeignKey("moderation_cases.id", ondelete="CASCADE"), nullable=False
    )
    player_id = Column(Integer, ForeignKey("players.id", ondelete="SET NULL"), nullable=True)
    statement = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, server_default="open")
    resolution_reason = Column(Text, nullable=True)
    resolved_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('open', 'granted', 'upheld')",
            name="ck_moderation_appeals_status",
        ),
        Index("idx_moderation_appeals_case", "case_id", "created_at"),
        Index(
            "uq_moderation_appeals_open_case_player",
            "case_id",
            "player_id",
            unique=True,
            postgresql_where=text("status = 'open'"),
        ),
    )


class ModerationEvent(Base):
    """Append-only case audit and provider history."""

    __tablename__ = "moderation_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(
        Integer, ForeignKey("moderation_cases.id", ondelete="CASCADE"), nullable=False
    )
    event_type = Column(String(40), nullable=False)
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reason = Column(Text, nullable=True)
    metadata_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (Index("idx_moderation_events_case", "case_id", "created_at"),)


class ModerationJob(Base):
    """Durable database-backed provider job."""

    __tablename__ = "moderation_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    idempotency_key = Column(String(255), nullable=False, unique=True)
    case_id = Column(Integer, ForeignKey("moderation_cases.id", ondelete="CASCADE"), nullable=True)
    target_type = Column(String(40), nullable=False)
    target_id = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, server_default="pending")
    attempts = Column(Integer, nullable=False, server_default="0")
    available_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    claimed_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (Index("idx_moderation_jobs_claim", "status", "available_at"),)


class ModerationAlertJob(Base):
    """Durable, privacy-minimized owner alert delivery job."""

    __tablename__ = "moderation_alert_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    idempotency_key = Column(String(255), nullable=False, unique=True)
    alert_kind = Column(String(40), nullable=False)
    case_id = Column(
        Integer, ForeignKey("moderation_cases.id", ondelete="SET NULL"), nullable=True
    )
    payload_json = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    status = Column(String(20), nullable=False, server_default="pending")
    attempts = Column(Integer, nullable=False, server_default="0")
    available_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    claimed_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    last_error_code = Column(String(100), nullable=True)
    last_error_detail = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'processing', 'delivered', 'failed', 'cancelled')",
            name="ck_moderation_alert_jobs_status",
        ),
        Index("idx_moderation_alert_jobs_claim", "status", "available_at"),
        Index("idx_moderation_alert_jobs_terminal", "status", "updated_at"),
    )


class ModerationEvidence(Base):
    """Restricted evidence object metadata; media remains in a private bucket."""

    __tablename__ = "moderation_evidence"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(
        Integer, ForeignKey("moderation_cases.id", ondelete="CASCADE"), nullable=False
    )
    object_key = Column(String(500), nullable=False, unique=True)
    content_type = Column(String(100), nullable=True)
    captured_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    purge_after = Column(DateTime(timezone=True), nullable=True)
    purged_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("idx_moderation_evidence_purge", "purge_after", "purged_at"),)
