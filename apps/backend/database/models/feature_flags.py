"""Runtime release controls and their immutable change history."""

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.sql import func

from backend.database.db import Base


class FeatureFlag(Base):
    __tablename__ = "feature_flags"
    __table_args__ = (
        CheckConstraint("rollout_percent BETWEEN 0 AND 100", name="ck_flag_percent"),
    )
    key = Column(String(80), primary_key=True)
    description = Column(String(500), nullable=False)
    enabled = Column(Boolean, nullable=False, default=False)
    rollout_percent = Column(Integer, nullable=False, default=0)
    user_ids = Column(JSON, nullable=False, default=list)
    platforms = Column(JSON, nullable=False, default=lambda: ["web", "ios", "android"])
    revision = Column(Integer, nullable=False, default=1)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class FeatureFlagChange(Base):
    __tablename__ = "feature_flag_changes"
    id = Column(Integer, primary_key=True)
    flag_key = Column(String(80), ForeignKey("feature_flags.key"), nullable=False, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    reason = Column(String(500), nullable=False)
    before = Column(JSON, nullable=True)
    after = Column(JSON, nullable=False)
    occurred_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
