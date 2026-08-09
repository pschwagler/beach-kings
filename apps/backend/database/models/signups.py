"""Signups models."""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.database.db import Base
from .enums import OpenSignupsMode
from .enums import SignupEventType


class WeeklySchedule(Base):
    """Templates for recurring weekly signups."""

    __tablename__ = "weekly_schedules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False)
    day_of_week = Column(Integer, nullable=False)  # 0-6, Monday=0
    start_time = Column(String, nullable=False)  # Time as string (HH:MM format)
    duration_hours = Column(Float, default=2.0, nullable=False)
    court_id = Column(Integer, ForeignKey("courts.id"), nullable=True)
    open_signups_mode = Column(
        Enum(OpenSignupsMode), default=OpenSignupsMode.AUTO_AFTER_LAST_SESSION, nullable=False
    )
    open_signups_day_of_week = Column(Integer, nullable=True)  # For specific_day_time mode
    open_signups_time = Column(
        String, nullable=True
    )  # Time as string (HH:MM format) for specific_day_time mode
    start_date = Column(Date, nullable=False)  # When to start generating signups
    end_date = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("players.id"), nullable=True)
    updated_by = Column(Integer, ForeignKey("players.id"), nullable=True)

    # Relationships
    season = relationship("Season", back_populates="weekly_schedules")
    court = relationship("Court", back_populates="weekly_schedules")
    signups = relationship("Signup", back_populates="weekly_schedule")
    creator = relationship("Player", foreign_keys=[created_by], backref="created_weekly_schedules")
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_weekly_schedules")

    __table_args__ = (
        Index("idx_weekly_schedules_season", "season_id"),
        Index("idx_weekly_schedules_day", "day_of_week"),
    )


class Signup(Base):
    """Individual signup opportunities."""

    __tablename__ = "signups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False)
    scheduled_datetime = Column(DateTime(timezone=True), nullable=False)  # UTC
    duration_hours = Column(Float, nullable=False)
    court_id = Column(Integer, ForeignKey("courts.id"), nullable=True)
    open_signups_at = Column(DateTime(timezone=True), nullable=True)  # UTC. NULL means always open
    weekly_schedule_id = Column(Integer, ForeignKey("weekly_schedules.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("players.id"), nullable=True)
    updated_by = Column(Integer, ForeignKey("players.id"), nullable=True)

    # Relationships
    season = relationship("Season", back_populates="signups")
    court = relationship("Court", back_populates="signups")
    weekly_schedule = relationship("WeeklySchedule", back_populates="signups")
    players = relationship("SignupPlayer", back_populates="signup", cascade="all, delete-orphan")
    events = relationship("SignupEvent", back_populates="signup", cascade="all, delete-orphan")
    creator = relationship("Player", foreign_keys=[created_by], backref="created_signups")
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_signups")

    __table_args__ = (
        Index("idx_signups_season", "season_id"),
        Index("idx_signups_scheduled_datetime", "scheduled_datetime"),
        Index("idx_signups_open_signups_at", "open_signups_at"),
        Index("idx_signups_weekly_schedule", "weekly_schedule_id"),
    )


class SignupPlayer(Base):
    """Join table for players signed up."""

    __tablename__ = "signup_players"

    signup_id = Column(Integer, ForeignKey("signups.id", ondelete="CASCADE"), primary_key=True)
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), primary_key=True)
    signed_up_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )  # UTC

    # Relationships
    signup = relationship("Signup", back_populates="players")
    player = relationship("Player", back_populates="signup_registrations")

    __table_args__ = (
        UniqueConstraint("signup_id", "player_id"),
        Index("idx_signup_players_signup", "signup_id"),
        Index("idx_signup_players_player", "player_id"),
    )


class SignupEvent(Base):
    """Audit log of signup/dropout actions."""

    __tablename__ = "signup_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    signup_id = Column(Integer, ForeignKey("signups.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(Enum(SignupEventType), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)  # UTC
    created_by = Column(
        Integer, ForeignKey("players.id"), nullable=True
    )  # For future admin/player signup capabilities

    # Relationships
    signup = relationship("Signup", back_populates="events")
    player = relationship("Player", foreign_keys=[player_id], backref="signup_events")
    creator = relationship("Player", foreign_keys=[created_by], backref="created_signup_events")

    __table_args__ = (
        Index("idx_signup_events_signup", "signup_id"),
        Index("idx_signup_events_player", "player_id"),
        Index("idx_signup_events_created_at", "created_at"),
    )
