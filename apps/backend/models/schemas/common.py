"""Common models."""

from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, model_validator


class RankingResponse(BaseModel):
    """Player ranking data."""

    name: str
    points: int
    games: int
    win_rate: float
    wins: int
    losses: int
    avg_pt_diff: float
    elo: int
    season_rank: int


class PartnershipStats(BaseModel):
    """Partnership statistics."""

    player_id: int
    partner_opponent: str
    points: int
    games: int
    wins: int
    losses: int
    win_rate: float
    avg_pt_diff: float


class OpponentStats(BaseModel):
    """Opponent statistics."""

    player_id: int
    partner_opponent: str
    points: int
    games: int
    wins: int
    losses: int
    win_rate: float
    avg_pt_diff: float


class PartnershipOpponentStatsResponse(BaseModel):
    """Response model for partnership and opponent stats."""

    partnerships: List[PartnershipStats]
    opponents: List[OpponentStats]


class PlayerStatsResponse(BaseModel):
    """Combined player statistics."""

    model_config = ConfigDict(extra="ignore")

    overall: dict
    partnerships: List[PartnershipStats]
    opponents: List[OpponentStats]


class MatchResponse(BaseModel):
    """Match result data."""

    date: str
    team_1_player_1: str
    team_1_player_2: str
    team_2_player_1: str
    team_2_player_2: str
    team_1_score: int
    team_2_score: int
    winner: str
    team_1_elo_change: float
    team_2_elo_change: float


class PlayerMatchHistoryResponse(BaseModel):
    """Player's match history."""

    date: str
    partner: str
    partner_id: Optional[int] = None
    opponent_1: str
    opponent_1_id: Optional[int] = None
    opponent_2: str
    opponent_2_id: Optional[int] = None
    result: str
    score: str
    elo_change: float


class EloTimelineResponse(BaseModel):
    """ELO timeline data for charting."""

    date: str


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    data_available: bool
    message: str


class CalculateResponse(BaseModel):
    """Response from calculate endpoint."""

    status: str
    message: str
    player_count: int
    match_count: int


class CreateSessionRequest(BaseModel):
    """Request to create a new session."""

    date: Optional[str] = None


class EndSessionRequest(BaseModel):
    """Request to end a session."""

    session_id: int


class CreateMatchRequest(BaseModel):
    """Request to create a new match."""

    session_id: Optional[int] = None
    league_id: Optional[int] = None
    season_id: Optional[int] = None
    date: Optional[str] = None
    team1_player1_id: int
    team1_player2_id: int
    team2_player1_id: int
    team2_player2_id: int
    team1_score: int
    team2_score: int
    is_public: Optional[bool] = True
    is_ranked: Optional[bool] = True
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)


class CreateMatchResponse(BaseModel):
    """Response from creating a match."""

    status: str
    message: str
    match_id: int
    session_id: int
    global_job_id: Optional[int] = None
    league_job_id: Optional[int] = None


class MatchStatusResponse(BaseModel):
    """Response from updating or deleting a match."""

    model_config = ConfigDict(extra="ignore")

    status: str
    message: str
    match_id: int
    global_job_id: Optional[int] = None
    league_job_id: Optional[int] = None


class StatusResponse(BaseModel):
    """Generic status/message response."""

    model_config = ConfigDict(extra="ignore")

    status: str
    message: Optional[str] = None


class PhotoJobResponse(BaseModel):
    """Response from initiating a photo processing job."""

    model_config = ConfigDict(extra="ignore")

    job_id: int
    session_id: str
    status: str


class PhotoJobStatusResponse(BaseModel):
    """Response from polling a photo processing job's status."""

    model_config = ConfigDict(extra="ignore")

    job_id: int
    status: str
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    result: Optional[dict] = None
    partial_matches: Optional[list] = None


class ConfirmMatchesResponse(BaseModel):
    """Response from confirming photo-parsed matches."""

    model_config = ConfigDict(extra="ignore")

    status: str
    message: str
    matches_created: int
    match_ids: List[int]


class UpdateMatchRequest(BaseModel):
    """Request to update an existing match."""

    team1_player1_id: int
    team1_player2_id: int
    team2_player1_id: int
    team2_player2_id: int
    team1_score: int
    team2_score: int
    is_public: Optional[bool] = None
    is_ranked: Optional[bool] = None


class MatchesQueryRequest(BaseModel):
    """Body for matches query endpoint."""

    limit: int = 50
    offset: int = 0
    league_id: Optional[int] = None
    season_id: Optional[int] = None
    date_from: Optional[str] = None  # ISO date
    date_to: Optional[str] = None  # ISO date
    player_ids: Optional[List[int]] = None
    submitted_only: bool = True
    include_non_public: bool = False
    sort_by: str = "id"  # 'date' | 'id'
    sort_dir: str = "desc"


class RankingsQueryRequest(BaseModel):
    """Body for rankings query endpoint."""

    season_id: Optional[int] = None
    league_id: Optional[int] = None


class SignupRequest(BaseModel):
    """Request to sign up a new user.

    Accepts either ``phone_number`` or ``email`` (or both). At least one is
    required. The chosen channel determines whether signup is verified via
    SMS OTP (phone) or email OTP (email).

    Accepts ``first_name`` + ``last_name`` (preferred) **or** ``full_name``.
    When first/last are provided they take precedence and ``full_name`` is
    computed.  When only ``full_name`` is provided it is split on the first
    space.
    """

    phone_number: Optional[str] = None
    email: Optional[str] = None
    password: str
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    eligibility_token: Optional[str] = None

    @model_validator(mode="after")
    def validate_phone_or_email(self) -> "SignupRequest":
        """Ensure at least one of phone_number / email is provided."""
        if not self.phone_number and not self.email:
            raise ValueError("Either phone_number or email must be provided")
        return self

    @model_validator(mode="after")
    def resolve_names(self) -> "SignupRequest":
        """Ensure all three name fields are populated."""
        from backend.services.players.player_data import resolve_name_fields

        result = resolve_name_fields(
            first_name=self.first_name,
            last_name=self.last_name,
            full_name=self.full_name,
        )
        if result is None:
            raise ValueError("A name is required: provide first_name + last_name, or full_name")
        self.first_name = result["first_name"]
        self.last_name = result["last_name"]
        self.full_name = result["full_name"]
        return self
