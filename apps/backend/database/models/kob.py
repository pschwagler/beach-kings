"""Kob models."""

import enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.database.db import Base


class TournamentStatus(str, enum.Enum):
    """KOB tournament lifecycle status."""

    SETUP = "SETUP"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class TournamentFormat(str, enum.Enum):
    """KOB tournament scheduling format."""

    FULL_ROUND_ROBIN = "FULL_ROUND_ROBIN"
    POOLS_PLAYOFFS = "POOLS_PLAYOFFS"
    PARTIAL_ROUND_ROBIN = "PARTIAL_ROUND_ROBIN"


class KobTournament(Base):
    """King/Queen of the Beach tournament — config + state."""

    __tablename__ = "kob_tournaments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    code = Column(String(10), nullable=False, unique=True)
    director_player_id = Column(
        Integer, ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )

    # Config
    gender = Column(String(10), nullable=False)  # "mens" or "womens"
    format = Column(Enum(TournamentFormat), nullable=False)
    game_to = Column(Integer, nullable=False, default=21)
    win_by = Column(Integer, nullable=False, default=2)
    num_courts = Column(Integer, nullable=False, default=2)
    max_rounds = Column(Integer, nullable=True)
    has_playoffs = Column(Boolean, default=False)
    playoff_size = Column(Integer, nullable=True)
    num_pools = Column(Integer, nullable=True)
    games_per_match = Column(Integer, nullable=False, default=1)
    num_rr_cycles = Column(Integer, nullable=False, default=1)
    score_cap = Column(Integer, nullable=True)
    playoff_format = Column(String(20), nullable=True)  # "ROUND_ROBIN" | "DRAFT"
    playoff_game_to = Column(Integer, nullable=True)
    playoff_games_per_match = Column(Integer, nullable=True)  # 1 or 3 (Bo3)
    playoff_score_cap = Column(Integer, nullable=True)
    is_ranked = Column(Boolean, default=False)

    # Optional associations
    league_id = Column(Integer, ForeignKey("leagues.id", ondelete="SET NULL"), nullable=True)
    location_id = Column(String, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)

    # State
    status = Column(Enum(TournamentStatus), nullable=False, default=TournamentStatus.SETUP)
    current_phase = Column(String(20), nullable=True)  # pool_play / playoffs / finals
    current_round = Column(Integer, nullable=True)
    auto_advance = Column(Boolean, default=True)
    schedule_data = Column(JSONB, nullable=True)

    scheduled_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    director = relationship(
        "Player", foreign_keys=[director_player_id], backref="directed_kob_tournaments"
    )
    league = relationship("League", backref="kob_tournaments")
    location = relationship("Location", backref="kob_tournaments")
    kob_players = relationship(
        "KobPlayer", back_populates="tournament", cascade="all, delete-orphan"
    )
    kob_matches = relationship(
        "KobMatch", back_populates="tournament", cascade="all, delete-orphan"
    )

    @property
    def effective_playoff_format(self) -> str:
        """Playoff format, falling back to ROUND_ROBIN."""
        return self.playoff_format or "ROUND_ROBIN"

    @property
    def effective_playoff_game_to(self) -> int:
        """Playoff game_to, falling back to tournament game_to."""
        return self.playoff_game_to if self.playoff_game_to is not None else self.game_to

    @property
    def effective_playoff_games_per_match(self) -> int:
        """Playoff games_per_match, falling back to tournament games_per_match."""
        return (
            self.playoff_games_per_match
            if self.playoff_games_per_match is not None
            else (self.games_per_match or 1)
        )

    @property
    def effective_playoff_score_cap(self):
        """Playoff score_cap, falling back to tournament score_cap."""
        return self.playoff_score_cap if self.playoff_score_cap is not None else self.score_cap

    __table_args__ = (
        Index("idx_kob_tournaments_code", "code"),
        Index("idx_kob_tournaments_director", "director_player_id"),
        Index("idx_kob_tournaments_status", "status"),
    )


class KobPlayer(Base):
    """Player entry in a KOB tournament — roster + seeding."""

    __tablename__ = "kob_players"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tournament_id = Column(
        Integer,
        ForeignKey("kob_tournaments.id", ondelete="CASCADE"),
        nullable=False,
    )
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    seed = Column(Integer, nullable=True)
    pool_id = Column(Integer, nullable=True)
    is_dropped = Column(Boolean, default=False)
    dropped_at_round = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    tournament = relationship("KobTournament", back_populates="kob_players")
    player = relationship("Player", backref="kob_entries")

    __table_args__ = (
        UniqueConstraint("tournament_id", "player_id", name="uq_kob_players_tournament_player"),
        Index("idx_kob_players_tournament", "tournament_id"),
    )


class KobMatch(Base):
    """Individual match in a KOB tournament."""

    __tablename__ = "kob_matches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tournament_id = Column(
        Integer,
        ForeignKey("kob_tournaments.id", ondelete="CASCADE"),
        nullable=False,
    )
    matchup_id = Column(String(20), nullable=False)  # e.g. "r1m1", "pf_r1m1"

    round_num = Column(Integer, nullable=False)
    phase = Column(String(20), nullable=False)  # "pool_play", "playoffs", "finals"
    pool_id = Column(Integer, nullable=True)
    court_num = Column(Integer, nullable=True)

    # Player FKs use SET NULL so account deletion doesn't fail.
    team1_player1_id = Column(
        Integer, ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    team1_player2_id = Column(
        Integer, ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    team2_player1_id = Column(
        Integer, ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    team2_player2_id = Column(
        Integer, ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )

    team1_score = Column(Integer, nullable=True)
    team2_score = Column(Integer, nullable=True)
    winner = Column(Integer, nullable=True)  # 1 or 2

    game_scores = Column(JSONB, nullable=True)  # [{team1_score, team2_score}, ...]
    bracket_position = Column(String(30), nullable=True)  # "sf1", "final", etc.
    is_bye = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    tournament = relationship("KobTournament", back_populates="kob_matches")
    team1_player1 = relationship("Player", foreign_keys=[team1_player1_id])
    team1_player2 = relationship("Player", foreign_keys=[team1_player2_id])
    team2_player1 = relationship("Player", foreign_keys=[team2_player1_id])
    team2_player2 = relationship("Player", foreign_keys=[team2_player2_id])

    __table_args__ = (
        UniqueConstraint("tournament_id", "matchup_id", name="uq_kob_matches_tournament_matchup"),
        Index("idx_kob_matches_tournament", "tournament_id"),
        Index("idx_kob_matches_round", "tournament_id", "round_num"),
    )
