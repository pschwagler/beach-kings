"""Identity models."""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    Float,
    Date,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    CheckConstraint,
    Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.database.db import Base
from .enums import InviteStatus


class User(Base):
    """User accounts with phone or Google SSO authentication."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    phone_number = Column(String, nullable=True, unique=True)
    password_hash = Column(String, nullable=True)
    email = Column(String, nullable=True)
    auth_provider = Column(
        String, nullable=False, server_default="phone"
    )  # 'phone', 'google', or 'apple'
    google_id = Column(String, nullable=True, unique=True)  # Google's `sub` claim
    apple_id = Column(String, nullable=True, unique=True)  # Apple's `sub` claim
    is_verified = Column(Boolean, default=True, nullable=False)
    failed_verification_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(String, nullable=True)  # ISO timestamp
    deletion_scheduled_at = Column(DateTime(timezone=True), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    moderation_status = Column(String(20), nullable=False, server_default="active")
    moderation_expires_at = Column(DateTime(timezone=True), nullable=True)
    moderation_case_id = Column(
        Integer, ForeignKey("moderation_cases.id", ondelete="SET NULL"), nullable=True
    )
    moderation_updated_at = Column(DateTime(timezone=True), nullable=True)
    password_changed_at = Column(DateTime(timezone=True), nullable=True)
    profile_is_private = Column(
        Boolean, nullable=False, server_default="false"
    )  # Hide profile from non-friends
    show_game_history = Column(
        Boolean, nullable=False, server_default="false"
    )  # Show full match history on public profile
    age_group = Column(String(20), nullable=True)  # null for legacy accounts; junior or adult
    eligibility_country = Column(String(2), nullable=True)
    eligibility_region = Column(String(2), nullable=True)
    age_assurance_source = Column(String(40), nullable=True)
    age_declaration_source = Column(String(40), nullable=True)
    guardian_consent = Column(Boolean, nullable=True)
    age_assured_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    players = relationship("Player", back_populates="user")
    platform_roles = relationship(
        "PlatformRoleAssignment",
        foreign_keys="PlatformRoleAssignment.user_id",
        back_populates="user",
    )
    refresh_tokens = relationship(
        "RefreshToken", back_populates="user", cascade="all, delete-orphan"
    )
    password_reset_tokens = relationship(
        "PasswordResetToken", back_populates="user", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_users_phone", "phone_number"),
        Index("idx_users_phone_verified", "phone_number", "is_verified"),
        Index("idx_users_email", "email", unique=True),
        Index("idx_users_google_id", "google_id", unique=True),
        Index("idx_users_apple_id", "apple_id", unique=True),
        Index("idx_users_moderation_status", "moderation_status", "moderation_expires_at"),
        CheckConstraint(
            "moderation_status IN ('active', 'suspended', 'banned')",
            name="ck_users_moderation_status",
        ),
        CheckConstraint(
            "age_group IS NULL OR age_group IN ('junior', 'adult')",
            name="ck_users_age_group",
        ),
        Index("idx_users_age_group", "age_group"),
    )


class PlatformRoleAssignment(Base):
    """Auditable platform-wide role grant, including revoked grants."""

    __tablename__ = "platform_role_assignments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(40), nullable=False)
    granted_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    granted_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    grant_source = Column(String(40), nullable=False)
    grant_reason = Column(String(500), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    revoked_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    revoke_source = Column(String(40), nullable=True)
    revoke_reason = Column(String(500), nullable=True)

    user = relationship("User", foreign_keys=[user_id], back_populates="platform_roles")
    granted_by = relationship("User", foreign_keys=[granted_by_user_id])
    revoked_by = relationship("User", foreign_keys=[revoked_by_user_id])

    __table_args__ = (
        CheckConstraint("role IN ('system_admin')", name="ck_platform_role_role"),
        CheckConstraint(
            "(revoked_at IS NULL AND revoked_by_user_id IS NULL AND revoke_source IS NULL "
            "AND revoke_reason IS NULL) OR "
            "(revoked_at IS NOT NULL AND revoke_source IS NOT NULL AND revoke_reason IS NOT NULL)",
            name="ck_platform_role_revocation_metadata",
        ),
        Index("idx_platform_role_user_history", "user_id", "role", "granted_at"),
        Index("idx_platform_role_active", "role", "user_id", "revoked_at"),
        Index(
            "uq_platform_role_active_user_role",
            "user_id",
            "role",
            unique=True,
            postgresql_where=revoked_at.is_(None),
        ),
    )


class Player(Base):
    """Player profiles."""

    __tablename__ = "players"

    id = Column(Integer, primary_key=True, autoincrement=True)
    full_name = Column(String, nullable=False)
    first_name = Column(String, nullable=False, server_default="")
    last_name = Column(String, nullable=False, server_default="")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    nickname = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    level = Column(String, nullable=True)
    date_of_birth = Column(Date, nullable=True)
    height = Column(String, nullable=True)
    preferred_side = Column(String, nullable=True)
    location_id = Column(String, ForeignKey("locations.id"), nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    city_latitude = Column(Float, nullable=True)  # City latitude coordinate
    city_longitude = Column(Float, nullable=True)  # City longitude coordinate
    distance_to_location = Column(Float, nullable=True)  # Distance in miles
    profile_picture_url = Column(String, nullable=True)
    avatar = Column(String, nullable=True)  # Can store initials (e.g., "JD") or image URL
    avp_playerProfileId = Column(Integer, nullable=True)
    status = Column(String, nullable=True)
    is_placeholder = Column(Boolean, default=False, nullable=False, server_default="false")
    created_by_player_id = Column(
        Integer, ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="players")
    location = relationship("Location", foreign_keys=[location_id], back_populates="players")
    league_memberships = relationship(
        "LeagueMember", foreign_keys="LeagueMember.player_id", back_populates="player"
    )
    season_stats = relationship("PlayerSeasonStats", back_populates="player")
    elo_history = relationship("EloHistory", back_populates="player")
    season_rating_history = relationship("SeasonRatingHistory", back_populates="player")
    global_stats = relationship("PlayerGlobalStats", back_populates="player", uselist=False)
    signup_registrations = relationship("SignupPlayer", back_populates="player")
    session_participations = relationship(
        "SessionParticipant", foreign_keys="SessionParticipant.player_id", back_populates="player"
    )
    created_by = relationship(
        "Player", remote_side="Player.id", foreign_keys=[created_by_player_id]
    )
    created_placeholders = relationship(
        "Player", foreign_keys=[created_by_player_id], back_populates="created_by"
    )
    invite = relationship(
        "PlayerInvite",
        foreign_keys="PlayerInvite.player_id",
        back_populates="player",
        uselist=False,
    )
    home_courts = relationship(
        "PlayerHomeCourt", back_populates="player", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_players_name", "full_name"),
        Index("idx_players_user", "user_id"),
        Index("idx_players_location", "location_id"),
        Index("idx_players_avp_id", "avp_playerProfileId"),
        Index("idx_players_created_by", "created_by_player_id"),
        Index("idx_players_deleted_at", "deleted_at"),
    )


class PlayerInvite(Base):
    """Invite links for placeholder players.

    One invite per placeholder player (1:1 relationship).
    Invite links never expire. Status transitions: pending → claimed.
    """

    __tablename__ = "player_invites"

    id = Column(Integer, primary_key=True, autoincrement=True)
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    invite_token = Column(String(64), nullable=False, unique=True)
    created_by_player_id = Column(
        Integer, ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    phone_number = Column(String, nullable=True)
    status = Column(String, nullable=False, server_default=InviteStatus.PENDING.value)
    claimed_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    claimed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    player = relationship("Player", foreign_keys=[player_id], back_populates="invite")
    creator = relationship("Player", foreign_keys=[created_by_player_id])
    claimed_by_user = relationship("User", foreign_keys=[claimed_by_user_id])

    __table_args__ = (
        UniqueConstraint("player_id", name="uq_player_invites_player"),
        CheckConstraint("status IN ('pending', 'claimed')", name="ck_player_invites_status"),
        Index("idx_player_invites_token", "invite_token", unique=True),
        Index("idx_player_invites_player", "player_id", unique=True),
        Index("idx_player_invites_created_by", "created_by_player_id"),
    )
