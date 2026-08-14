"""Kob models."""

from typing import Optional, List, Literal
from pydantic import BaseModel, Field, field_validator


class _KobTournamentBase(BaseModel):
    """Shared fields for KOB tournament create/update schemas."""

    name: str = Field(default=None, min_length=1, max_length=100)
    gender: Optional[Literal["mens", "womens", "coed"]] = None
    format: Optional[Literal["FULL_ROUND_ROBIN", "POOLS_PLAYOFFS", "PARTIAL_ROUND_ROBIN"]] = None
    game_to: Optional[int] = Field(default=None, ge=7, le=28)
    num_courts: Optional[int] = Field(default=None, ge=1, le=20)
    max_rounds: Optional[int] = Field(default=None, ge=1)
    has_playoffs: Optional[bool] = None
    playoff_size: Optional[int] = Field(default=None, ge=4)
    num_pools: Optional[int] = Field(default=None, ge=2, le=6)
    games_per_match: Optional[int] = None
    num_rr_cycles: Optional[int] = Field(default=None, ge=1, le=3)
    score_cap: Optional[int] = Field(default=None, ge=7)
    playoff_format: Optional[Literal["ROUND_ROBIN", "DRAFT"]] = None
    playoff_game_to: Optional[int] = Field(default=None, ge=7, le=28)
    playoff_games_per_match: Optional[int] = None
    playoff_score_cap: Optional[int] = Field(default=None, ge=7)
    is_ranked: Optional[bool] = None
    scheduled_date: Optional[str] = None
    auto_advance: Optional[bool] = None

    @field_validator("games_per_match", "playoff_games_per_match", mode="before")
    @classmethod
    def validate_games_per_match(cls, v):
        """Only 1 (single game) or 3 (best-of-3) are supported."""
        if v is not None and v not in (1, 3):
            raise ValueError("games_per_match must be 1 or 3")
        return v


class KobTournamentCreate(_KobTournamentBase):
    """Request to create a KOB tournament."""

    name: str = Field(..., min_length=1, max_length=100)
    gender: Literal["mens", "womens", "coed"] = "coed"
    format: Literal["FULL_ROUND_ROBIN", "POOLS_PLAYOFFS", "PARTIAL_ROUND_ROBIN"] = (
        "FULL_ROUND_ROBIN"
    )
    game_to: int = Field(21, ge=7, le=28)
    num_courts: int = Field(2, ge=1, le=20)
    games_per_match: int = 1
    num_rr_cycles: int = Field(1, ge=1, le=3)
    has_playoffs: bool = False
    is_ranked: bool = False
    auto_advance: bool = True
    league_id: Optional[int] = None
    location_id: Optional[str] = None


class KobTournamentUpdate(_KobTournamentBase):
    """Request to update a KOB tournament (pre-start only). All fields optional."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=100)


class KobPlayerAdd(BaseModel):
    """Request to add a player to a KOB tournament."""

    player_id: int
    seed: Optional[int] = None


class KobPlaceholderPlayerAdd(BaseModel):
    """Request to add a placeholder player by name."""

    name: str
    seed: Optional[int] = None


class KobScoreSubmit(BaseModel):
    """Request to submit a match score."""

    team1_score: int
    team2_score: int
    game_index: Optional[int] = None


class KobSeedReorder(BaseModel):
    """Request to reorder seeds."""

    player_ids: List[int]


class KobBracketUpdate(BaseModel):
    """Request to swap player assignments in a bracket match."""

    match_id: int
    team1: List[int]  # [player_id, player_id]
    team2: List[int]


class KobDropPlayer(BaseModel):
    """Request to drop a player mid-tournament."""

    player_id: int


class KobPlayerResponse(BaseModel):
    """Player entry in a tournament roster."""

    id: int
    player_id: int
    player_name: Optional[str] = None
    player_avatar: Optional[str] = None
    seed: Optional[int] = None
    pool_id: Optional[int] = None
    is_dropped: bool = False
    dropped_at_round: Optional[int] = None


class KobMatchResponse(BaseModel):
    """Match data in a KOB tournament."""

    id: int
    matchup_id: str
    round_num: int
    phase: str
    pool_id: Optional[int] = None
    court_num: Optional[int] = None
    team1_player1_id: Optional[int] = None
    team1_player2_id: Optional[int] = None
    team2_player1_id: Optional[int] = None
    team2_player2_id: Optional[int] = None
    team1_player1_name: Optional[str] = None
    team1_player2_name: Optional[str] = None
    team2_player1_name: Optional[str] = None
    team2_player2_name: Optional[str] = None
    team1_score: Optional[int] = None
    team2_score: Optional[int] = None
    winner: Optional[int] = None
    game_scores: Optional[list] = None
    bracket_position: Optional[str] = None
    is_bye: bool = False


class KobStandingEntry(BaseModel):
    """Individual player standing in tournament."""

    player_id: int
    player_name: Optional[str] = None
    player_avatar: Optional[str] = None
    rank: int
    wins: int = 0
    losses: int = 0
    points_for: int = 0
    points_against: int = 0
    point_diff: int = 0
    pool_id: Optional[int] = None


class KobTournamentResponse(BaseModel):
    """Summary tournament data (for listings)."""

    id: int
    name: str
    code: str
    gender: str
    format: str
    status: str
    num_courts: int
    game_to: int
    scheduled_date: Optional[str] = None
    player_count: int = 0
    current_round: Optional[int] = None
    created_at: Optional[str] = None


class KobTournamentDetailResponse(BaseModel):
    """Full tournament data (for detail/live view)."""

    id: int
    name: str
    code: str
    gender: str
    format: str
    status: str
    game_to: int
    win_by: int
    num_courts: int
    max_rounds: Optional[int] = None
    has_playoffs: bool = False
    playoff_size: Optional[int] = None
    num_pools: Optional[int] = None
    games_per_match: int = 1
    num_rr_cycles: int = 1
    score_cap: Optional[int] = None
    playoff_format: Optional[str] = None
    playoff_game_to: Optional[int] = None
    playoff_games_per_match: Optional[int] = None
    playoff_score_cap: Optional[int] = None
    is_ranked: bool = False
    current_phase: Optional[str] = None
    current_round: Optional[int] = None
    auto_advance: bool = True
    scheduled_date: Optional[str] = None
    director_player_id: Optional[int] = None
    director_name: Optional[str] = None
    league_id: Optional[int] = None
    location_id: Optional[str] = None
    schedule_data: Optional[dict] = None
    players: List[KobPlayerResponse] = []
    matches: List[KobMatchResponse] = []
    standings: List[KobStandingEntry] = []
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class KobPreviewMatch(BaseModel):
    """Single match in a schedule preview round."""

    matchup_id: str
    court_num: int
    team1: List[int]
    team2: List[int]
    is_bye: bool = False
    pool_id: Optional[int] = None


class KobPreviewRound(BaseModel):
    """Single round in a schedule preview."""

    round_num: int
    phase: str
    pool_id: Optional[int] = None
    matches: List[KobPreviewMatch]
    byes: List[int] = []
    time_minutes: int
    bracket_position: Optional[str] = None  # "sf1", "final", etc.
    label: Optional[str] = None


class KobFormatRecommendation(BaseModel):
    """Format recommendation with full schedule preview."""

    # Config (echoed back)
    format: str
    num_pools: Optional[int] = None
    playoff_size: Optional[int] = None
    max_rounds: Optional[int] = None
    game_to: int = 21
    games_per_match: int = 1
    num_rr_cycles: int = 1
    playoff_format: Optional[str] = None
    playoff_game_to: Optional[int] = None
    playoff_games_per_match: Optional[int] = None

    # Time model
    minutes_per_round: int = 30
    total_time_minutes: int
    pool_play_time_minutes: int
    playoff_time_minutes: int

    # Stats
    estimated_rounds: int
    pool_play_rounds: int
    playoff_rounds: int
    total_matches: int
    min_games_per_player: int
    max_games_per_player: int
    games_per_court: int

    # Preview
    preview_rounds: List[KobPreviewRound]
    preview_pools: Optional[dict] = None
    pool_game_to: Optional[dict] = None  # pool_id → game_to
    pool_courts: Optional[dict] = None  # pool_id → court_num

    # Suggestion
    explanation: str
    suggestion: Optional[str] = None


class KobPillRecommendation(BaseModel):
    """Lightweight format pill for quick format switching."""

    label: str
    category: str  # "pools" | "round_robin"
    is_recommended: bool = False
    format: str
    num_pools: Optional[int] = None
    playoff_size: Optional[int] = None
    max_rounds: Optional[int] = None
    game_to: int = 21
    games_per_match: int = 1
    playoff_format: Optional[str] = None
    total_time_minutes: int
    max_games_per_player: int
