"""Social models."""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    CheckConstraint,
    Index,
    text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.database.db import Base


class Friend(Base):
    """Join table (Player ↔ Player)."""

    __tablename__ = "friends"

    id = Column(Integer, primary_key=True, autoincrement=True)
    player1_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    player2_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(
        Integer, ForeignKey("players.id"), nullable=True
    )  # Player who initiated the friendship

    # Relationships
    creator = relationship("Player", foreign_keys=[created_by], backref="created_friendships")

    __table_args__ = (
        UniqueConstraint("player1_id", "player2_id"),
        CheckConstraint("player1_id < player2_id"),
        Index("idx_friends_player1", "player1_id"),
        Index("idx_friends_player2", "player2_id"),
    )


class FriendRequest(Base):
    """Friend request between two players."""

    __tablename__ = "friend_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sender_player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    receiver_player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    status = Column(String(20), default="pending", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    responded_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    sender = relationship(
        "Player", foreign_keys=[sender_player_id], backref="sent_friend_requests"
    )
    receiver = relationship(
        "Player", foreign_keys=[receiver_player_id], backref="received_friend_requests"
    )

    __table_args__ = (
        Index(
            "uq_friend_requests_pending_pair",
            func.least(sender_player_id, receiver_player_id),
            func.greatest(sender_player_id, receiver_player_id),
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
        Index("idx_friend_requests_receiver_status", "receiver_player_id", "status"),
        Index("idx_friend_requests_sender", "sender_player_id"),
    )


class DirectMessage(Base):
    """1:1 direct message between two players."""

    __tablename__ = "direct_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sender_player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    receiver_player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    message_text = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    moderation_visibility = Column(String(20), nullable=False, server_default="visible")

    # Relationships
    sender = relationship("Player", foreign_keys=[sender_player_id])
    receiver = relationship("Player", foreign_keys=[receiver_player_id])

    __table_args__ = (
        Index("idx_dm_thread", "sender_player_id", "receiver_player_id", "created_at"),
        Index("idx_dm_receiver_unread", "receiver_player_id", "is_read", "created_at"),
        Index("idx_dm_sender_created", "sender_player_id", "created_at"),
    )


class UserBlock(Base):
    """Directed, idempotent player block."""

    __tablename__ = "user_blocks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    blocker_player_id = Column(
        Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False
    )
    blocked_player_id = Column(
        Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("blocker_player_id", "blocked_player_id", name="uq_user_blocks_pair"),
        CheckConstraint("blocker_player_id <> blocked_player_id", name="ck_user_blocks_not_self"),
        Index("idx_user_blocks_blocked", "blocked_player_id", "blocker_player_id"),
    )


class InteractionRestriction(Base):
    """Time-bounded account interaction restriction applied by moderation."""

    __tablename__ = "interaction_restrictions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    reason = Column(Text, nullable=False)
    starts_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    case_id = Column(
        Integer, ForeignKey("moderation_cases.id", ondelete="SET NULL"), nullable=True
    )
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("expires_at > starts_at", name="ck_interaction_restrictions_window"),
        Index("idx_interaction_restrictions_active", "player_id", "expires_at"),
    )
