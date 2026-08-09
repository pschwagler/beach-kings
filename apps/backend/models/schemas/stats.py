"""Stats models."""

from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class EloTimelinePoint(BaseModel):
    """Single ELO rating data point for a player's rating history chart."""

    date: str
    rating: int


class MyStatsOverall(BaseModel):
    """Overall aggregate stats for the authenticated player."""

    wins: int
    losses: int
    games_played: int
    rating: int
    peak_rating: int
    win_rate: float
    current_streak: int
    avg_point_diff: float


class MyStatsTrophy(BaseModel):
    """A single season placement trophy (gold/silver/bronze only)."""

    league_id: int
    league_name: str
    season_name: str
    place: int


class MyStatsRelationStat(BaseModel):
    """Stats for a single partner or opponent relationship."""

    player_id: int
    display_name: str
    initials: str
    avatar_url: Optional[str] = None
    games_played: int
    wins: int
    losses: int
    win_rate: float


class MyStatsPayload(BaseModel):
    """Full my-stats payload returned by GET /api/users/me/stats."""

    model_config = ConfigDict(extra="ignore")

    player_name: str
    player_avatar_url: Optional[str] = None
    player_city: Optional[str] = None
    player_level: Optional[str] = None
    overall: MyStatsOverall
    trophies: List[MyStatsTrophy]
    partners: List[MyStatsRelationStat]
    opponents: List[MyStatsRelationStat]
    elo_timeline: List[EloTimelinePoint]


class SeasonAwardResponse(BaseModel):
    """Season award data for API responses."""

    model_config = ConfigDict(extra="ignore")

    id: int
    season_id: int
    season_name: Optional[str] = None
    league_id: int
    league_name: Optional[str] = None
    player_id: int
    player_name: Optional[str] = None
    player_avatar: Optional[str] = None
    player_profile_picture_url: Optional[str] = None
    award_type: str
    award_key: str
    rank: Optional[int] = None
    value: Optional[float] = None
    created_at: Optional[str] = None
