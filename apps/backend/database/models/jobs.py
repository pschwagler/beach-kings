"""Jobs models."""

import enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    Enum,
    ForeignKey,
    CheckConstraint,
    Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.database.db import Base


class StatsCalculationJobStatus(str, enum.Enum):
    """Stats calculation job status enum."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class StatsCalculationJob(Base):
    """Queue for stats calculation jobs."""

    __tablename__ = "stats_calculation_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    calc_type = Column(String, nullable=False)  # 'global' or 'league'
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=True)
    status = Column(
        Enum(StatsCalculationJobStatus), default=StatsCalculationJobStatus.PENDING, nullable=False
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    available_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    lease_expires_at = Column(DateTime(timezone=True), nullable=True)
    claim_token = Column(String(36), nullable=True)
    attempts = Column(Integer, nullable=False, server_default="0")
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)

    # Relationships
    league = relationship("League", foreign_keys=[league_id])

    __table_args__ = (
        Index("idx_stats_calculation_jobs_status", "status"),
        Index("idx_stats_calculation_jobs_claim", "status", "available_at", "lease_expires_at"),
        Index("idx_stats_calculation_jobs_type_league", "calc_type", "league_id"),
        Index("idx_stats_calculation_jobs_created_at", "created_at"),
    )


class PhotoMatchJobStatus(str, enum.Enum):
    """Photo match job status enum."""

    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class PhotoMatchJob(Base):
    """Queue for photo match processing jobs."""

    __tablename__ = "photo_match_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=False)
    session_id = Column(String, nullable=False)  # Redis session key
    status = Column(
        Enum(PhotoMatchJobStatus, values_callable=lambda x: [e.value for e in x]),
        default=PhotoMatchJobStatus.PENDING,
        nullable=False,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)
    result_data = Column(Text, nullable=True)  # JSON string of parsed matches

    # Relationships
    league = relationship("League", foreign_keys=[league_id])

    __table_args__ = (
        Index("idx_photo_match_jobs_status", "status"),
        Index("idx_photo_match_jobs_session", "session_id"),
        Index("idx_photo_match_jobs_created_at", "created_at"),
    )


class MediaDeletionJob(Base):
    """Durable S3 cleanup requested by deletion and moderation workflows."""

    __tablename__ = "media_deletion_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    object_key = Column(String(500), nullable=False, unique=True)
    status = Column(String(20), nullable=False, server_default="pending")
    attempts = Column(Integer, nullable=False, server_default="0")
    available_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    claimed_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'processing', 'completed')",
            name="ck_media_deletion_jobs_status",
        ),
        Index("idx_media_deletion_jobs_claim", "status", "available_at"),
    )
