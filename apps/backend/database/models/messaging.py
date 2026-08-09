"""Messaging models."""

from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Index, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.database.db import Base


class LeagueMessage(Base):
    """League messages/chat."""

    __tablename__ = "league_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message_text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    moderation_visibility = Column(String(20), nullable=False, server_default="visible")

    # Relationships
    league = relationship("League", back_populates="messages")
    user = relationship("User")

    __table_args__ = (
        Index("idx_league_messages_league_id", "league_id"),
        Index("idx_league_messages_created_at", "created_at"),
    )


class Feedback(Base):
    """User feedback submissions."""

    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer, ForeignKey("users.id"), nullable=True
    )  # Nullable for anonymous feedback
    feedback_text = Column(Text, nullable=False)
    category = Column(
        String(50), nullable=False, server_default="feedback"
    )  # "feedback" or "support"
    email = Column(String, nullable=True)  # Optional contact email
    is_resolved = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User")

    __table_args__ = (
        Index("idx_feedback_created_at", "created_at"),
        Index("idx_feedback_user_id", "user_id"),
    )


class Notification(Base):
    """User notifications for in-app messaging."""

    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    actor_player_id = Column(Integer, ForeignKey("players.id", ondelete="SET NULL"), nullable=True)
    type = Column(String, nullable=False)  # NotificationType enum value
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    data = Column(
        Text, nullable=True
    )  # JSON string for flexible metadata (league_id, message_id, etc.)
    is_read = Column(Boolean, default=False, nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    dismissed_at = Column(DateTime(timezone=True), nullable=True)
    dedup_key = Column(String(255), nullable=True)
    link_url = Column(String(500), nullable=True)  # Navigation target
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", backref="notifications")

    __table_args__ = (
        Index("idx_notifications_user_unread", "user_id", "is_read", "created_at"),
        Index("idx_notifications_user_created", "user_id", "created_at"),
        Index("idx_notifications_dedup_key", "dedup_key"),
        Index(
            "uq_notifications_user_active_dedup",
            "user_id",
            "dedup_key",
            unique=True,
            postgresql_where=text("dedup_key IS NOT NULL AND dismissed_at IS NULL"),
        ),
    )
