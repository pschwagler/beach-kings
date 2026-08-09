"""Stats models."""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.database.db import Base


class PlayerSeasonStats(Base):
    """Season-specific player stats."""

    __tablename__ = "player_season_stats"

    id = Column(Integer, primary_key=True, autoincrement=True)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False)
    games = Column(Integer, default=0, nullable=False)
    wins = Column(Integer, default=0, nullable=False)
    points = Column(
        Float, default=0.0, nullable=False
    )  # Note: Points and ranking only apply to seasons, not league-wide stats. For season_rating type, this stores the float rating.
    win_rate = Column(Float, default=0.0, nullable=False)
    avg_point_diff = Column(Float, default=0.0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    player = relationship("Player", back_populates="season_stats")
    season = relationship("Season", back_populates="player_stats")

    __table_args__ = (
        UniqueConstraint("player_id", "season_id"),
        Index("idx_player_season_stats_player", "player_id"),
        Index("idx_player_season_stats_season", "season_id"),
    )


class PartnershipStats(Base):
    """How each player performs WITH each partner (global stats)."""

    __tablename__ = "partnership_stats"

    player_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    partner_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    games = Column(Integer, default=0, nullable=False)
    wins = Column(Integer, default=0, nullable=False)
    points = Column(Integer, default=0, nullable=False)
    win_rate = Column(Float, default=0.0, nullable=False)
    avg_point_diff = Column(Float, default=0.0, nullable=False)

    # Relationships
    player = relationship("Player", foreign_keys=[player_id])
    partner = relationship("Player", foreign_keys=[partner_id])

    __table_args__ = (
        Index("idx_partnership_stats_player", "player_id"),
        Index("idx_partnership_stats_partner", "partner_id"),
    )


class OpponentStats(Base):
    """How each player performs AGAINST each opponent (global stats)."""

    __tablename__ = "opponent_stats"

    player_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    opponent_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    games = Column(Integer, default=0, nullable=False)
    wins = Column(Integer, default=0, nullable=False)
    points = Column(Integer, default=0, nullable=False)
    win_rate = Column(Float, default=0.0, nullable=False)
    avg_point_diff = Column(Float, default=0.0, nullable=False)

    # Relationships
    player = relationship("Player", foreign_keys=[player_id])
    opponent = relationship("Player", foreign_keys=[opponent_id])

    __table_args__ = (
        Index("idx_opponent_stats_player", "player_id"),
        Index("idx_opponent_stats_opponent", "opponent_id"),
    )


class EloHistory(Base):
    """Track ELO changes over time for charting (global)."""

    __tablename__ = "elo_history"

    player_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=False, primary_key=True)
    date = Column(String, nullable=False)
    elo_after = Column(Float, nullable=False)
    elo_change = Column(Float, nullable=False)

    # Relationships
    player = relationship("Player", back_populates="elo_history")
    match = relationship("Match")

    __table_args__ = (
        Index("idx_elo_history_player", "player_id"),
        Index("idx_elo_history_match", "match_id"),
    )


class SeasonRatingHistory(Base):
    """Track season rating changes over time for charting (season-specific)."""

    __tablename__ = "season_rating_history"

    player_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, primary_key=True)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=False, primary_key=True)
    date = Column(String, nullable=False)
    rating_after = Column(Float, nullable=False)
    rating_change = Column(Float, nullable=False)

    # Relationships
    player = relationship("Player", back_populates="season_rating_history")
    season = relationship("Season")
    match = relationship("Match")

    __table_args__ = (
        Index("idx_season_rating_history_player", "player_id"),
        Index("idx_season_rating_history_season", "season_id"),
        Index("idx_season_rating_history_match", "match_id"),
    )


class PlayerGlobalStats(Base):
    """Global aggregate stats for each player (across all leagues/seasons)."""

    __tablename__ = "player_global_stats"

    player_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    current_rating = Column(Float, default=1200.0, nullable=False)
    total_games = Column(Integer, default=0, nullable=False)
    total_wins = Column(Integer, default=0, nullable=False)
    avg_point_diff = Column(Float, default=0.0, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    player = relationship("Player", back_populates="global_stats")

    __table_args__ = (Index("idx_player_global_stats_player", "player_id"),)


class PartnershipStatsSeason(Base):
    """How each player performs WITH each partner (season-specific stats)."""

    __tablename__ = "partnership_stats_season"

    player_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    partner_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, primary_key=True)
    games = Column(Integer, default=0, nullable=False)
    wins = Column(Integer, default=0, nullable=False)
    points = Column(Integer, default=0, nullable=False)
    win_rate = Column(Float, default=0.0, nullable=False)
    avg_point_diff = Column(Float, default=0.0, nullable=False)

    # Relationships
    player = relationship("Player", foreign_keys=[player_id])
    partner = relationship("Player", foreign_keys=[partner_id])
    season = relationship("Season", foreign_keys=[season_id])

    __table_args__ = (
        Index("idx_partnership_stats_season_player", "player_id"),
        Index("idx_partnership_stats_season_partner", "partner_id"),
        Index("idx_partnership_stats_season_season", "season_id"),
    )


class OpponentStatsSeason(Base):
    """How each player performs AGAINST each opponent (season-specific stats)."""

    __tablename__ = "opponent_stats_season"

    player_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    opponent_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, primary_key=True)
    games = Column(Integer, default=0, nullable=False)
    wins = Column(Integer, default=0, nullable=False)
    points = Column(Integer, default=0, nullable=False)
    win_rate = Column(Float, default=0.0, nullable=False)
    avg_point_diff = Column(Float, default=0.0, nullable=False)

    # Relationships
    player = relationship("Player", foreign_keys=[player_id])
    opponent = relationship("Player", foreign_keys=[opponent_id])
    season = relationship("Season", foreign_keys=[season_id])

    __table_args__ = (
        Index("idx_opponent_stats_season_player", "player_id"),
        Index("idx_opponent_stats_season_opponent", "opponent_id"),
        Index("idx_opponent_stats_season_season", "season_id"),
    )


class PlayerLeagueStats(Base):
    """League-specific player stats."""

    __tablename__ = "player_league_stats"

    id = Column(Integer, primary_key=True, autoincrement=True)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=False)
    games = Column(Integer, default=0, nullable=False)
    wins = Column(Integer, default=0, nullable=False)
    points = Column(
        Integer, default=0, nullable=False
    )  # Note: Points and ranking only apply to seasons, not league-wide stats. League stats show games and win % instead.
    win_rate = Column(Float, default=0.0, nullable=False)
    avg_point_diff = Column(Float, default=0.0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    player = relationship("Player")
    league = relationship("League")

    __table_args__ = (
        UniqueConstraint("player_id", "league_id"),
        Index("idx_player_league_stats_player", "player_id"),
        Index("idx_player_league_stats_league", "league_id"),
    )


class PartnershipStatsLeague(Base):
    """How each player performs WITH each partner (league-specific stats)."""

    __tablename__ = "partnership_stats_league"

    player_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    partner_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=False, primary_key=True)
    games = Column(Integer, default=0, nullable=False)
    wins = Column(Integer, default=0, nullable=False)
    points = Column(Integer, default=0, nullable=False)
    win_rate = Column(Float, default=0.0, nullable=False)
    avg_point_diff = Column(Float, default=0.0, nullable=False)

    # Relationships
    player = relationship("Player", foreign_keys=[player_id])
    partner = relationship("Player", foreign_keys=[partner_id])
    league = relationship("League", foreign_keys=[league_id])

    __table_args__ = (
        Index("idx_partnership_stats_league_player", "player_id"),
        Index("idx_partnership_stats_league_partner", "partner_id"),
        Index("idx_partnership_stats_league_league", "league_id"),
    )


class OpponentStatsLeague(Base):
    """How each player performs AGAINST each opponent (league-specific stats)."""

    __tablename__ = "opponent_stats_league"

    player_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    opponent_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=False, primary_key=True)
    games = Column(Integer, default=0, nullable=False)
    wins = Column(Integer, default=0, nullable=False)
    points = Column(Integer, default=0, nullable=False)
    win_rate = Column(Float, default=0.0, nullable=False)
    avg_point_diff = Column(Float, default=0.0, nullable=False)

    # Relationships
    player = relationship("Player", foreign_keys=[player_id])
    opponent = relationship("Player", foreign_keys=[opponent_id])
    league = relationship("League", foreign_keys=[league_id])

    __table_args__ = (
        Index("idx_opponent_stats_league_player", "player_id"),
        Index("idx_opponent_stats_league_opponent", "opponent_id"),
        Index("idx_opponent_stats_league_league", "league_id"),
    )
