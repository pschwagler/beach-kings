"""Leagues models."""

from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class LeagueConfigBase(BaseModel):
    """Base league config model."""

    point_system: Optional[str] = None


class LeagueConfigCreate(LeagueConfigBase):
    """Request to create league config."""

    pass


class LeagueConfigResponse(LeagueConfigBase):
    """League config response."""

    id: int
    league_id: int
    created_at: str
    updated_at: str


class LeagueBase(BaseModel):
    """Base league model."""

    name: str
    description: Optional[str] = None
    location_id: Optional[str] = None
    is_open: bool = True
    is_public: Optional[bool] = True  # Whether league is visible on public pages
    whatsapp_group_id: Optional[str] = None
    gender: Optional[str] = None  # 'mens', 'womens', 'coed'
    level: Optional[str] = None


class LeagueCreate(LeagueBase):
    """Request to create a league."""

    pass


class HomeCourtResponse(BaseModel):
    """Home court summary for league responses."""

    model_config = ConfigDict(extra="ignore")

    id: int
    name: Optional[str] = None
    address: Optional[str] = None
    position: int = 0


class PlayerHomeCourtResponse(BaseModel):
    """Home court summary for player responses, includes position."""

    model_config = ConfigDict(extra="ignore")

    id: int
    name: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    position: int = 0


class LeagueResponse(LeagueBase):
    """League response."""

    id: int
    location_name: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    home_courts: List[HomeCourtResponse] = []


class LeagueDetailResponse(LeagueResponse):
    """Enriched league detail including membership context and current-season stats."""

    member_count: int = 0
    season_count: int = 0
    current_season_id: Optional[int] = None
    current_season_name: Optional[str] = None
    is_active: bool = False
    user_role: Optional[str] = None  # 'admin' | 'member' | None
    user_rank: Optional[int] = None
    user_wins: Optional[int] = None
    user_losses: Optional[int] = None
    user_rating: Optional[float] = None
    has_pending_request: bool = False


class LeagueMemberBase(BaseModel):
    """Base league member model."""

    role: str = "member"


class LeagueMemberCreate(LeagueMemberBase):
    """Request to add a player to a league."""

    player_id: int


class LeagueMemberResponse(LeagueMemberBase):
    """League member response."""

    model_config = ConfigDict(extra="ignore")

    id: int
    league_id: Optional[int] = None
    player_id: int
    created_at: Optional[str] = None


class SeasonBase(BaseModel):
    """Base season model."""

    name: Optional[str] = None
    start_date: str  # ISO date string
    end_date: str  # ISO date string
    point_system: Optional[str] = None  # Legacy field, kept for backward compatibility
    scoring_system: Optional[str] = None  # "points_system" or "season_rating"
    points_per_win: Optional[int] = None  # For Points System (default 3)
    points_per_loss: Optional[int] = None


class SeasonCreate(SeasonBase):
    """Request to create a season."""

    league_id: int


class SeasonResponse(SeasonBase):
    """Season response."""

    model_config = ConfigDict(extra="ignore")

    id: int
    league_id: int
    start_date: Optional[str] = None  # type: ignore[assignment]
    end_date: Optional[str] = None  # type: ignore[assignment]
    is_active: Optional[bool] = None
    session_count: int = 0
    game_count: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class LeagueStandingEntry(BaseModel):
    """Single row in the league standings table."""

    rank: int
    player_id: int
    display_name: str
    initials: str
    avatar_url: Optional[str] = None
    wins: int
    losses: int
    win_rate: float
    rating: Optional[float] = None
    rating_delta: Optional[float] = None
    games_played: int


class LeagueSeasonInfoResponse(BaseModel):
    """Season metadata returned alongside standings."""

    id: int
    name: str
    started_at: Optional[str] = None
    session_count: int
    game_count: int


class LeagueStandingsResponse(BaseModel):
    """Response for GET /api/leagues/{league_id}/standings."""

    standings: List[LeagueStandingEntry]
    season_info: Optional[LeagueSeasonInfoResponse] = None


class LeagueGameEntry(BaseModel):
    """A single league-wide match, shaped symmetrically (team1 / team2).

    Mirrors the shared LeagueGameEntry TS type consumed by the mobile
    All Games view. ``winner`` is a discriminator: 1 = team1, 2 = team2,
    -1 = tie, 0 = no result yet (in progress).
    """

    id: int
    session_id: int
    session_date: Optional[str] = None
    session_status: str
    court_label: Optional[str] = None
    team1_player_names: List[str]
    team1_player_ids: List[Optional[int]]
    team2_player_names: List[str]
    team2_player_ids: List[Optional[int]]
    team1_score: int
    team2_score: int
    winner: int


class LeagueGamesResponse(BaseModel):
    """Response envelope for GET /api/leagues/{league_id}/games."""

    games: List[LeagueGameEntry]
    total: int
