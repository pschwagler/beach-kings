"""Games models."""

from typing import List
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    Float,
    DateTime,
    Enum,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.database.db import Base
from .enums import SessionStatus


class Session(Base):
    """Gaming sessions grouped by date/time."""

    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(String, nullable=False)  # Using String for date to match existing schema
    name = Column(String, nullable=False)
    status = Column(Enum(SessionStatus), default=SessionStatus.ACTIVE, nullable=False)
    code = Column(
        String(12), nullable=True, unique=True
    )  # Shareable code for non-league / invite links
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=True)
    league_id = Column(Integer, ForeignKey("leagues.id", ondelete="SET NULL"), nullable=True)
    court_id = Column(Integer, ForeignKey("courts.id"), nullable=True)
    location_id = Column(String, ForeignKey("locations.id"), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(
        Integer, ForeignKey("players.id"), nullable=True
    )  # Player who created the session
    updated_by = Column(
        Integer, ForeignKey("players.id"), nullable=True
    )  # Player who last updated/submitted the session

    # Extended fields (migration 046)
    start_time = Column(String, nullable=True)  # e.g. "3:00 PM"
    session_type = Column(String, nullable=True)  # 'pickup' | 'league'
    max_players = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    # Ranked intent (migration 055)
    is_ranked = Column(
        Boolean, nullable=False, server_default="true"
    )  # Session-level ranked intent; matches inherit this as ranked_intent

    # Relationships
    season = relationship("Season", back_populates="sessions")
    league = relationship("League", foreign_keys=[league_id])
    court = relationship("Court", back_populates="sessions")
    location = relationship("Location")
    matches = relationship("Match", back_populates="session")
    participants = relationship(
        "SessionParticipant", back_populates="session", cascade="all, delete-orphan"
    )
    creator = relationship("Player", foreign_keys=[created_by], backref="created_sessions")
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_sessions")

    __table_args__ = (
        Index("idx_sessions_date", "date"),
        Index("idx_sessions_status", "status"),
        Index("idx_sessions_season", "season_id"),
        Index("idx_sessions_league", "league_id"),
        Index("idx_sessions_court", "court_id"),
        Index("idx_sessions_code", "code"),
        Index("idx_sessions_location", "location_id"),
        Index("idx_sessions_lat_lng", "latitude", "longitude"),
    )


class SessionParticipant(Base):
    """Players invited to a session (can see and add games before having a match)."""

    __tablename__ = "session_participants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    invited_by = Column(Integer, ForeignKey("players.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("Session", back_populates="participants")
    player = relationship(
        "Player", foreign_keys=[player_id], back_populates="session_participations"
    )
    inviter = relationship("Player", foreign_keys=[invited_by], backref="session_invites_sent")

    __table_args__ = (
        UniqueConstraint("session_id", "player_id", name="uq_session_participants_session_player"),
        Index("idx_session_participants_session_id", "session_id"),
        Index("idx_session_participants_player_id", "player_id"),
    )


class Match(Base):
    """All match results."""

    __tablename__ = "matches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # session_id is nullable for legacy/defensive reasons. In practice, the API
    # always creates or resolves a session before inserting a match, so every
    # active match has a session. Date lives on Session, not Match.
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=True)
    team1_player1_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    team1_player2_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    team2_player1_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    team2_player2_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    team1_score = Column(Integer, nullable=False)
    team2_score = Column(Integer, nullable=False)
    winner = Column(Integer, nullable=False)  # 1 = team1, 2 = team2, -1 = tie
    is_public = Column(Boolean, default=True, nullable=False)
    is_ranked = Column(
        Boolean, default=True, nullable=False
    )  # Effective ranked status (computed from ranked_intent + placeholder presence)
    ranked_intent = Column(
        Boolean, default=True, nullable=False
    )  # User's original ranked/unranked choice (preserved across placeholder claims)
    created_by = Column(
        Integer, ForeignKey("players.id"), nullable=True
    )  # Player who created the match
    updated_by = Column(
        Integer, ForeignKey("players.id"), nullable=True
    )  # Player who last updated the match

    # Relationships
    session = relationship("Session", back_populates="matches")
    team1_player1 = relationship("Player", foreign_keys=[team1_player1_id], lazy="select")
    team1_player2 = relationship("Player", foreign_keys=[team1_player2_id], lazy="select")
    team2_player1 = relationship("Player", foreign_keys=[team2_player1_id], lazy="select")
    team2_player2 = relationship("Player", foreign_keys=[team2_player2_id], lazy="select")
    creator = relationship("Player", foreign_keys=[created_by], backref="created_matches")
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_matches")

    @property
    def team1_player1_name(self) -> str:
        """Get team1 player1 name."""
        return self.team1_player1.full_name if self.team1_player1 else ""

    @property
    def team1_player2_name(self) -> str:
        """Get team1 player2 name."""
        return self.team1_player2.full_name if self.team1_player2 else ""

    @property
    def team2_player1_name(self) -> str:
        """Get team2 player1 name."""
        return self.team2_player1.full_name if self.team2_player1 else ""

    @property
    def team2_player2_name(self) -> str:
        """Get team2 player2 name."""
        return self.team2_player2.full_name if self.team2_player2 else ""

    @property
    def players(self) -> List[List[str]]:
        """Get players as list of teams (for calculation service compatibility)."""
        return [
            [self.team1_player1_name, self.team1_player2_name],
            [self.team2_player1_name, self.team2_player2_name],
        ]

    @property
    def player_ids(self) -> List[List[int]]:
        """Get player IDs as list of teams (for calculation service)."""
        return [
            [self.team1_player1_id, self.team1_player2_id],
            [self.team2_player1_id, self.team2_player2_id],
        ]

    @property
    def original_scores(self) -> List[int]:
        """Get original scores (for calculation service compatibility)."""
        return [self.team1_score, self.team2_score]

    @property
    def team1_diff(self) -> int:
        """Signed point differential from team1's perspective."""
        return self.team1_score - self.team2_score

    def signed_diff_for_player(self, player_id: int) -> int:
        """Signed point diff for `player_id` (positive = won by N, negative = lost by N)."""
        if player_id in (self.team1_player1_id, self.team1_player2_id):
            return self.team1_diff
        return -self.team1_diff

    __table_args__ = (
        Index("idx_matches_session", "session_id"),
        Index("idx_matches_team1_p1", "team1_player1_id"),
        Index("idx_matches_team1_p2", "team1_player2_id"),
        Index("idx_matches_team2_p1", "team2_player1_id"),
        Index("idx_matches_team2_p2", "team2_player2_id"),
    )
