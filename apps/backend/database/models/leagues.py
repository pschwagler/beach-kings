"""Leagues models."""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    Date,
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
from .enums import ScoringSystem


class League(Base):
    """League groups."""

    __tablename__ = "leagues"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    location_id = Column(String, ForeignKey("locations.id"), nullable=True)
    is_open = Column(Boolean, default=True, nullable=False)
    is_public = Column(
        Boolean, default=True, nullable=False
    )  # Whether league is visible on public pages
    whatsapp_group_id = Column(String, nullable=True)
    gender = Column(String, nullable=True)  # 'mens', 'womens', 'coed'
    level = Column(String, nullable=True)  # 'beginner', 'intermediate', 'advanced', 'Open', etc.
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(
        Integer, ForeignKey("players.id"), nullable=True
    )  # Player who created the league
    updated_by = Column(
        Integer, ForeignKey("players.id"), nullable=True
    )  # Player who last updated the league

    # Relationships
    location = relationship("Location", back_populates="leagues")
    members = relationship("LeagueMember", back_populates="league", cascade="all, delete-orphan")
    seasons = relationship("Season", foreign_keys="Season.league_id", back_populates="league")
    config = relationship(
        "LeagueConfig", back_populates="league", uselist=False, cascade="all, delete-orphan"
    )
    creator = relationship("Player", foreign_keys=[created_by], backref="created_leagues")
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_leagues")
    messages = relationship("LeagueMessage", back_populates="league", cascade="all, delete-orphan")
    home_courts = relationship(
        "LeagueHomeCourt", back_populates="league", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("idx_leagues_location", "location_id"),)


class LeagueConfig(Base):
    """Configuration for each league (one-to-one)."""

    __tablename__ = "league_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=False, unique=True)
    point_system = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(
        Integer, ForeignKey("players.id"), nullable=True
    )  # Player who created the config
    updated_by = Column(
        Integer, ForeignKey("players.id"), nullable=True
    )  # Player who last updated the config

    # Relationships
    league = relationship("League", back_populates="config")
    creator = relationship("Player", foreign_keys=[created_by], backref="created_league_configs")
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_league_configs")

    __table_args__ = (Index("idx_league_configs_league", "league_id"),)


class LeagueMember(Base):
    """Join table (Player ↔ League)."""

    __tablename__ = "league_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    role = Column(String, default="member", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(
        Integer, ForeignKey("players.id"), nullable=True
    )  # Player who added this member

    # Relationships
    league = relationship("League", back_populates="members")
    player = relationship("Player", foreign_keys=[player_id], back_populates="league_memberships")
    creator = relationship("Player", foreign_keys=[created_by], backref="created_league_members")

    __table_args__ = (
        UniqueConstraint("league_id", "player_id"),
        Index("idx_league_members_league", "league_id"),
        Index("idx_league_members_player", "player_id"),
    )


class Season(Base):
    """Seasons within leagues."""

    __tablename__ = "seasons"

    id = Column(Integer, primary_key=True, autoincrement=True)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=False)
    name = Column(String, nullable=True)
    start_date = Column(Date, nullable=False)
    # Nullable: an open-ended ("rolling") season has no end_date and stays
    # active until an admin closes it by setting one. Auto-created seasons use
    # this so a league always has a current season to log games into.
    end_date = Column(Date, nullable=True)
    scoring_system = Column(
        String(50),
        default=ScoringSystem.POINTS_SYSTEM.value,  # Use enum value for Python default
        nullable=False,
        server_default=ScoringSystem.POINTS_SYSTEM.value,  # Use enum value for DB default
    )
    point_system = Column(Text, nullable=True)  # JSON field storing scoring configuration
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(
        Integer, ForeignKey("players.id"), nullable=True
    )  # Player who created the season
    updated_by = Column(
        Integer, ForeignKey("players.id"), nullable=True
    )  # Player who last updated the season
    awards_finalized_at = Column(
        DateTime(timezone=True), nullable=True
    )  # When season awards were computed

    # Relationships
    league = relationship("League", foreign_keys=[league_id], back_populates="seasons")
    sessions = relationship("Session", back_populates="season")
    player_stats = relationship("PlayerSeasonStats", back_populates="season")
    weekly_schedules = relationship("WeeklySchedule", back_populates="season")
    signups = relationship("Signup", back_populates="season")
    awards = relationship("SeasonAward", back_populates="season", cascade="all, delete-orphan")

    creator = relationship("Player", foreign_keys=[created_by], backref="created_seasons")
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_seasons")

    # Table constraints - build check constraint from enum values
    __table_args__ = (
        CheckConstraint(
            f"scoring_system IN ({', '.join(repr(e.value) for e in ScoringSystem)})",
            name="check_scoring_system_valid",
        ),
        Index("idx_seasons_league", "league_id"),
        # At most one open-ended (rolling) season per league. Guards against an
        # admin (or concurrent requests) creating two simultaneous open-ended
        # seasons, which would make "the active season" ambiguous.
        Index(
            "uq_seasons_open_per_league",
            "league_id",
            unique=True,
            postgresql_where=text("end_date IS NULL"),
        ),
    )


class LeagueRequest(Base):
    """Approval-backed join requests for public leagues."""

    __tablename__ = "league_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    status = Column(String, default="pending", nullable=False)  # 'pending', 'approved', 'rejected'
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    league = relationship("League", backref="join_requests")
    player = relationship("Player", foreign_keys=[player_id], backref="league_requests")

    __table_args__ = (
        UniqueConstraint("league_id", "player_id", name="uq_league_request_league_player"),
        Index("idx_league_requests_league_id", "league_id"),
        Index("idx_league_requests_player_id", "player_id"),
        Index("idx_league_requests_status", "status"),
    )


class LeagueInvite(Base):
    """Admin-initiated invitations for players to join a league."""

    __tablename__ = "league_invites"

    id = Column(Integer, primary_key=True, autoincrement=True)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    invited_by_player_id = Column(Integer, ForeignKey("players.id"), nullable=True)
    status = Column(String, default="pending", nullable=False)  # 'pending', 'accepted', 'declined'
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    league = relationship("League", backref="invites")
    player = relationship("Player", foreign_keys=[player_id], backref="league_invites")
    invited_by = relationship("Player", foreign_keys=[invited_by_player_id])

    __table_args__ = (
        UniqueConstraint("league_id", "player_id", name="uq_league_invite_league_player"),
        Index("idx_league_invites_league_id", "league_id"),
        Index("idx_league_invites_player_id", "player_id"),
        Index("idx_league_invites_invited_by", "invited_by_player_id"),
    )


class LeagueHomeCourt(Base):
    """Courts designated as home courts for a league."""

    __tablename__ = "league_home_courts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    league_id = Column(Integer, ForeignKey("leagues.id", ondelete="CASCADE"), nullable=False)
    court_id = Column(Integer, ForeignKey("courts.id", ondelete="CASCADE"), nullable=False)
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    league = relationship("League", back_populates="home_courts")
    court = relationship("Court", back_populates="league_home_courts")

    __table_args__ = (
        UniqueConstraint("league_id", "court_id", name="uq_league_home_courts_league_court"),
        Index("idx_league_home_courts_league", "league_id"),
    )
