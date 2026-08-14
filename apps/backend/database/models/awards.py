"""Awards models."""

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


class SeasonAward(Base):
    """Awards earned by players when a season ends (podium + stat awards)."""

    __tablename__ = "season_awards"

    id = Column(Integer, primary_key=True, autoincrement=True)
    season_id = Column(Integer, ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    award_type = Column(String(50), nullable=False)  # "placement" or "stat_award"
    award_key = Column(
        String(50), nullable=False
    )  # gold, silver, bronze, ironman, sharpshooter, rising_star, point_machine
    rank = Column(Integer, nullable=True)  # 1/2/3 for placements
    value = Column(Float, nullable=True)  # stat value that earned the award
    season_name = Column(String, nullable=True)  # denormalized for display
    league_id = Column(
        Integer, ForeignKey("leagues.id", ondelete="CASCADE"), nullable=False
    )  # denormalized for player queries
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    season = relationship("Season", back_populates="awards")
    player = relationship("Player", backref="season_awards")
    league = relationship("League", backref="season_awards")

    __table_args__ = (
        UniqueConstraint("season_id", "award_key", name="uq_season_awards_season_key"),
        Index("idx_season_awards_player", "player_id"),
        Index("idx_season_awards_season", "season_id"),
        Index("idx_season_awards_league", "league_id"),
    )
