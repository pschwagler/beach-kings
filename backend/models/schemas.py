"""
Pydantic models for API request/response validation.
"""

from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict, model_validator


class RankingResponse(BaseModel):
    """Player ranking data."""
    model_config = ConfigDict(populate_by_name=True)
    Name: str
    Points: int
    Games: int
    Win_Rate: float = Field(alias="Win Rate")
    Wins: int
    Losses: int
    Avg_Pt_Diff: float = Field(alias="Avg Pt Diff")
    ELO: int


class PartnershipStats(BaseModel):
    """Partnership statistics."""
    model_config = ConfigDict(populate_by_name=True)
    Partner: str
    Games: int
    Wins: int
    Losses: int
    Win_Rate: float = Field(alias="Win Rate")
    Avg_Pt_Diff: float = Field(alias="Avg Pt Diff")


class OpponentStats(BaseModel):
    """Opponent statistics."""
    model_config = ConfigDict(populate_by_name=True)
    Opponent: str
    Games: int
    Wins: int
    Losses: int
    Win_Rate: float = Field(alias="Win Rate")
    Avg_Pt_Diff: float = Field(alias="Avg Pt Diff")


class PlayerStatsResponse(BaseModel):
    """Combined player statistics."""
    overall: dict
    partnerships: List[PartnershipStats]
    opponents: List[OpponentStats]


class MatchResponse(BaseModel):
    """Match result data."""
    model_config = ConfigDict(populate_by_name=True)
    Date: str
    Team_1_Player_1: str = Field(alias="Team 1 Player 1")
    Team_1_Player_2: str = Field(alias="Team 1 Player 2")
    Team_2_Player_1: str = Field(alias="Team 2 Player 1")
    Team_2_Player_2: str = Field(alias="Team 2 Player 2")
    Team_1_Score: int = Field(alias="Team 1 Score")
    Team_2_Score: int = Field(alias="Team 2 Score")
    Winner: str
    Team_1_ELO_Change: float = Field(alias="Team 1 ELO Change")
    Team_2_ELO_Change: float = Field(alias="Team 2 ELO Change")


class PlayerMatchHistoryResponse(BaseModel):
    """Player's match history."""
    model_config = ConfigDict(populate_by_name=True)
    Date: str
    Partner: str
    Opponent_1: str = Field(alias="Opponent 1")
    Opponent_2: str = Field(alias="Opponent 2")
    Result: str
    Score: str
    ELO_Change: float = Field(alias="ELO Change")


class EloTimelineResponse(BaseModel):
    """ELO timeline data for charting."""
    Date: str
    # Additional fields will be player names with their ELO values


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
    date: Optional[str] = None  # If not provided, use current date


class EndSessionRequest(BaseModel):
    """Request to end a session."""
    session_id: int


class CreateMatchRequest(BaseModel):
    """Request to create a new match."""
    session_id: int
    team1_player1: str
    team1_player2: str
    team2_player1: str
    team2_player2: str
    team1_score: int
    team2_score: int
    is_public: Optional[bool] = True


class CreateMatchResponse(BaseModel):
    """Response from creating a match."""
    status: str
    message: str
    match_id: int
    session_id: int


class UpdateMatchRequest(BaseModel):
    """Request to update an existing match."""
    team1_player1: str
    team1_player2: str
    team2_player1: str
    team2_player2: str
    team1_score: int
    team2_score: int
    is_public: Optional[bool] = None


class MatchesQueryRequest(BaseModel):
    """Body for matches query endpoint."""
    limit: int = 50
    offset: int = 0
    league_id: Optional[int] = None
    season_id: Optional[int] = None
    date_from: Optional[str] = None  # ISO date
    date_to: Optional[str] = None    # ISO date
    player_ids: Optional[List[int]] = None
    submitted_only: bool = True
    include_non_public: bool = False
    sort_by: str = "id"   # 'date' | 'id'
    sort_dir: str = "desc"  # 'asc' | 'desc'


class RankingsQueryRequest(BaseModel):
    """Body for rankings query endpoint."""
    season_id: Optional[int] = None


# Authentication schemas

class SignupRequest(BaseModel):
    """Request to sign up a new user."""
    phone_number: str
    password: str
    full_name: str  # Required - used to create player profile
    name: Optional[str] = None  # Optional - user display name
    email: Optional[str] = None


class LoginRequest(BaseModel):
    """Request to login with password. Accepts either phone_number or email."""
    phone_number: Optional[str] = None
    email: Optional[str] = None
    password: str
    
    @model_validator(mode='after')
    def validate_phone_or_email(self):
        """Ensure either phone_number or email is provided."""
        if not self.phone_number and not self.email:
            raise ValueError("Either phone_number or email must be provided")
        if self.phone_number and self.email:
            raise ValueError("Provide either phone_number or email, not both")
        return self


class SMSLoginRequest(BaseModel):
    """Request to login with SMS verification code."""
    phone_number: str
    code: str


class VerifyPhoneRequest(BaseModel):
    """Request to verify phone number with code."""
    phone_number: str
    code: str


class CheckPhoneRequest(BaseModel):
    """Request to check if phone number exists."""
    phone_number: str


class AuthResponse(BaseModel):
    """Authentication response with JWT token."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: int
    phone_number: str
    is_verified: bool


class RefreshTokenRequest(BaseModel):
    """Request to refresh access token."""
    refresh_token: str


class RefreshTokenResponse(BaseModel):
    """Response with new access token."""
    access_token: str
    token_type: str = "bearer"


class CheckPhoneResponse(BaseModel):
    """Response for phone number check."""
    exists: bool
    is_verified: bool


class ResetPasswordRequest(BaseModel):
    """Request to initiate password reset."""
    phone_number: str


class ResetPasswordVerifyRequest(BaseModel):
    """Request to verify code and get reset token."""
    phone_number: str
    code: str


class ResetPasswordConfirmRequest(BaseModel):
    """Request to confirm password reset with token and new password."""
    reset_token: str
    new_password: str


class UserResponse(BaseModel):
    """User information response."""
    id: int
    phone_number: str
    name: Optional[str] = None
    email: Optional[str] = None
    is_verified: bool
    created_at: str


# League-based schema models

class LocationBase(BaseModel):
    """Base location model."""
    name: str
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = "USA"


class LocationCreate(LocationBase):
    """Request to create a location."""
    pass


class LocationResponse(LocationBase):
    """Location response."""
    id: int
    created_at: str
    updated_at: str


class CourtBase(BaseModel):
    """Base court model."""
    name: str
    address: Optional[str] = None
    location_id: int
    geoJson: Optional[str] = None


class CourtCreate(CourtBase):
    """Request to create a court."""
    pass


class CourtResponse(CourtBase):
    """Court response."""
    id: int
    created_at: str
    updated_at: str


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
    location_id: Optional[int] = None
    is_open: bool = True
    whatsapp_group_id: Optional[str] = None
    gender: Optional[str] = None  # 'male', 'female', 'mixed'
    level: Optional[str] = None  # 'beginner', 'intermediate', 'advanced', 'Open', etc.


class LeagueCreate(LeagueBase):
    """Request to create a league."""
    pass


class LeagueResponse(LeagueBase):
    """League response."""
    id: int
    created_at: str
    updated_at: str


class LeagueMemberBase(BaseModel):
    """Base league member model."""
    role: str = "member"  # 'admin' or 'member'


class LeagueMemberCreate(LeagueMemberBase):
    """Request to add a player to a league."""
    player_id: int


class LeagueMemberResponse(LeagueMemberBase):
    """League member response."""
    id: int
    league_id: int
    player_id: int
    created_at: str


class SeasonBase(BaseModel):
    """Base season model."""
    name: Optional[str] = None
    start_date: str  # ISO date string
    end_date: str  # ISO date string
    point_system: Optional[str] = None
    is_active: bool = True


class SeasonCreate(SeasonBase):
    """Request to create a season."""
    league_id: int


class SeasonResponse(SeasonBase):
    """Season response."""
    id: int
    league_id: int
    created_at: str
    updated_at: str


class PlayerBase(BaseModel):
    """Base player model."""
    full_name: str
    nickname: Optional[str] = None
    gender: Optional[str] = None
    level: Optional[str] = None  # 'beginner', 'intermediate', 'advanced', 'AA', 'Open'
    age: Optional[int] = None
    height: Optional[str] = None
    preferred_side: Optional[str] = None  # 'left', 'right', etc.
    default_location_id: Optional[int] = None
    profile_picture_url: Optional[str] = None
    status: Optional[str] = None


class PlayerCreate(PlayerBase):
    """Request to create a player."""
    avp_playerProfileId: Optional[int] = None


class PlayerUpdate(BaseModel):
    """Request to update a player profile."""
    full_name: Optional[str] = None
    nickname: Optional[str] = None
    gender: Optional[str] = None
    level: Optional[str] = None
    default_location_id: Optional[int] = None


class PlayerResponse(PlayerBase):
    """Player response."""
    id: int
    user_id: Optional[int] = None
    avp_playerProfileId: Optional[int] = None
    created_at: str
    updated_at: str


class PlayerSeasonStatsResponse(BaseModel):
    """Player season stats response."""
    id: int
    player_id: int
    season_id: int
    current_elo: float
    games: int
    wins: int
    points: int
    win_rate: float
    avg_point_diff: float
    created_at: str
    updated_at: str


class FriendCreate(BaseModel):
    """Request to create a friendship."""
    player2_id: int


class FriendResponse(BaseModel):
    """Friend response."""
    id: int
    player1_id: int
    player2_id: int
    created_at: str


# Update SessionResponse to include new fields
class SessionResponse(BaseModel):
    """Session data."""
    id: int
    date: str
    name: str
    status: str  # ACTIVE, SUBMITTED, or EDITED
    season_id: Optional[int] = None
    court_id: Optional[int] = None
    created_at: str


# Weekly Schedule schemas
class WeeklyScheduleBase(BaseModel):
    """Base weekly schedule model."""
    day_of_week: int  # 0-6, Monday=0
    start_time: str  # HH:MM format
    duration_hours: float = 2.0
    court_id: Optional[int] = None
    open_signups_mode: str = "auto_after_last_session"  # 'auto_after_last_session', 'specific_day_time', 'always_open'
    open_signups_day_of_week: Optional[int] = None  # For specific_day_time mode
    open_signups_time: Optional[str] = None  # HH:MM format for specific_day_time mode
    end_date: str  # ISO date string


class WeeklyScheduleCreate(WeeklyScheduleBase):
    """Request to create a weekly schedule."""
    season_id: int


class WeeklyScheduleUpdate(BaseModel):
    """Request to update a weekly schedule."""
    day_of_week: Optional[int] = None
    start_time: Optional[str] = None
    duration_hours: Optional[float] = None
    court_id: Optional[int] = None
    open_signups_mode: Optional[str] = None
    open_signups_day_of_week: Optional[int] = None
    open_signups_time: Optional[str] = None
    end_date: Optional[str] = None


class WeeklyScheduleResponse(WeeklyScheduleBase):
    """Weekly schedule response."""
    id: int
    season_id: int
    created_at: str
    updated_at: str


# Signup schemas
class SignupBase(BaseModel):
    """Base signup model."""
    scheduled_datetime: str  # ISO datetime string (UTC)
    duration_hours: float
    court_id: Optional[int] = None
    open_signups_at: str  # ISO datetime string (UTC)


class SignupCreate(SignupBase):
    """Request to create a signup."""
    season_id: int


class SignupUpdate(BaseModel):
    """Request to update a signup."""
    scheduled_datetime: Optional[str] = None  # ISO datetime string (UTC)
    duration_hours: Optional[float] = None
    court_id: Optional[int] = None
    open_signups_at: Optional[str] = None  # ISO datetime string (UTC)


class SignupPlayerResponse(BaseModel):
    """Signup player response."""
    player_id: int
    player_name: str
    signed_up_at: str  # ISO datetime string (UTC)


class SignupEventResponse(BaseModel):
    """Signup event response."""
    id: int
    player_id: int
    player_name: str
    event_type: str  # 'signup' or 'dropout'
    created_at: str  # ISO datetime string (UTC)
    created_by: Optional[int] = None


class SignupResponse(SignupBase):
    """Signup response."""
    id: int
    season_id: int
    weekly_schedule_id: Optional[int] = None
    player_count: int = 0
    is_open: bool = False  # Computed: open_signups_at <= now (UTC)
    is_past: bool = False  # Computed: scheduled_datetime < now (UTC)
    created_at: str
    updated_at: str
    players: Optional[List[SignupPlayerResponse]] = None  # Optional, populated when requested


class SignupWithPlayersResponse(SignupResponse):
    """Signup response with players list."""
    players: List[SignupPlayerResponse]

