"""Push models."""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.database.db import Base


class DeviceToken(Base):
    """Push notification device tokens (Expo push tokens)."""

    __tablename__ = "device_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(255), nullable=False)
    platform = Column(String(10), nullable=False)  # "ios", "android"
    installation_id = Column(String(128), nullable=True)
    unregister_secret_hash = Column(String(64), nullable=True)
    last_registered_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", backref="device_tokens")

    __table_args__ = (
        UniqueConstraint("token", name="uq_device_tokens_token"),
        UniqueConstraint("installation_id", name="uq_device_tokens_installation_id"),
        Index("idx_device_tokens_user", "user_id"),
    )


class PushDeliveryJob(Base):
    """Durable Expo push delivery and receipt-tracking job."""

    __tablename__ = "push_delivery_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    device_token_id = Column(
        Integer, ForeignKey("device_tokens.id", ondelete="SET NULL"), nullable=True
    )
    notification_id = Column(
        Integer, ForeignKey("notifications.id", ondelete="SET NULL"), nullable=True
    )
    payload = Column(JSONB, nullable=False)
    idempotency_key = Column(String(255), nullable=False, unique=True)
    status = Column(String(24), nullable=False, server_default="pending")
    attempts = Column(Integer, nullable=False, server_default="0")
    available_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    claimed_at = Column(DateTime(timezone=True), nullable=True)
    expo_ticket_id = Column(String(255), nullable=True)
    last_error_code = Column(String(100), nullable=True)
    last_error_detail = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_push_delivery_jobs_claim", "status", "available_at"),
        Index("idx_push_delivery_jobs_ticket", "expo_ticket_id"),
        Index("idx_push_delivery_jobs_terminal", "status", "updated_at"),
    )


class PushNotificationPreference(Base):
    """Per-user push notification preference row.

    One row per user (enforced by unique constraint on user_id).
    When no row exists for a user, defaults apply:
      push_enabled=True, direct_messages=True, league_messages=True,
      friend_requests=True, match_invites=True, tournament_updates=False,
      ranking_changes=False.
    """

    __tablename__ = "push_notification_preferences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # unique=True is intentionally omitted here; uniqueness is declared once below
    # via UniqueConstraint + Index in __table_args__ (matching migration 053).
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # Master kill-switch — when False, ALL push is suppressed for this user.
    push_enabled = Column(Boolean, nullable=False, server_default="true", default=True)
    # Per-type toggles
    direct_messages = Column(Boolean, nullable=False, server_default="true", default=True)
    league_messages = Column(Boolean, nullable=False, server_default="true", default=True)
    friend_requests = Column(Boolean, nullable=False, server_default="true", default=True)
    match_invites = Column(Boolean, nullable=False, server_default="true", default=True)
    tournament_updates = Column(Boolean, nullable=False, server_default="false", default=False)
    ranking_changes = Column(Boolean, nullable=False, server_default="false", default=False)
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", backref="push_notification_preference")

    __table_args__ = (
        UniqueConstraint("user_id", name="uq_push_prefs_user_id"),
        Index("idx_push_notification_preferences_user_id", "user_id", unique=True),
    )
