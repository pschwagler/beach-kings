"""
Pydantic models for API request/response validation.
"""

from datetime import datetime
from typing import Any, Optional, List
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator


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


class MatchStatusResponse(BaseModel):
    """Response from updating or deleting a match."""

    model_config = ConfigDict(extra="ignore")

    status: str
    message: str
    match_id: int


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
    sort_dir: str = "desc"  # 'asc' | 'desc'


class RankingsQueryRequest(BaseModel):
    """Body for rankings query endpoint."""

    season_id: Optional[int] = None
    league_id: Optional[int] = None


# Authentication schemas


class SignupRequest(BaseModel):
    """Request to sign up a new user."""

    phone_number: str
    password: str
    full_name: str  # Required - used to create player profile
    email: Optional[str] = None


class LoginRequest(BaseModel):
    """Request to login with password. Accepts either phone_number or email."""

    phone_number: Optional[str] = None
    email: Optional[str] = None
    password: str

    @model_validator(mode="after")
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


class GoogleAuthRequest(BaseModel):
    """Request to authenticate with Google ID token."""

    id_token: str


class AuthResponse(BaseModel):
    """Authentication response with JWT token."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: int
    phone_number: Optional[str] = None
    is_verified: bool
    auth_provider: str = "phone"
    profile_complete: Optional[bool] = None


class RefreshTokenRequest(BaseModel):
    """Request to refresh access token."""

    refresh_token: str


class RefreshTokenResponse(BaseModel):
    """Response with new access and rotated refresh token."""

    access_token: str
    refresh_token: str
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
    phone_number: Optional[str] = None
    email: Optional[str] = None
    is_verified: bool
    auth_provider: str = "phone"
    deletion_scheduled_at: Optional[str] = None
    created_at: str


class UserUpdate(BaseModel):
    """Request to update user profile."""

    email: Optional[str] = None


# League-based schema models


class RegionBase(BaseModel):
    """Base region model."""

    name: str


class RegionCreate(RegionBase):
    """Request to create a region."""

    id: str  # lowercase_snake_case identifier


class RegionResponse(RegionBase):
    """Region response."""

    model_config = ConfigDict(extra="ignore")

    id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class LocationBase(BaseModel):
    """Base location model."""

    name: str
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = "USA"
    region_id: Optional[str] = None
    tier: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    seasonality: Optional[str] = None
    radius_miles: Optional[float] = None


class LocationCreate(LocationBase):
    """Request to create a location."""

    id: str  # Primary key: hub_id from CSV (e.g., "socal_la", "hi_oahu")


class LocationResponse(LocationBase):
    """Location response."""

    model_config = ConfigDict(extra="ignore")

    id: str  # Primary key: hub_id from CSV (e.g., "socal_la", "hi_oahu")
    slug: Optional[str] = None  # SEO-friendly URL slug (e.g., "manhattan-beach")
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class CourtBase(BaseModel):
    """Base court model."""

    name: str
    address: Optional[str] = None
    location_id: str
    geoJson: Optional[str] = None


class CourtCreate(CourtBase):
    """Request to create a court."""

    pass


class CourtResponse(CourtBase):
    """Court response."""

    id: int
    is_placeholder: bool = False
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
    location_id: Optional[str] = None
    is_open: bool = True
    is_public: Optional[bool] = True  # Whether league is visible on public pages
    whatsapp_group_id: Optional[str] = None
    gender: Optional[str] = None  # 'mens', 'womens', 'coed'
    level: Optional[str] = None  # 'juniors', 'beginner', 'intermediate', 'advanced', 'AA', 'Open'


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
    position: int = 0


class LeagueResponse(LeagueBase):
    """League response."""

    id: int
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    home_courts: List[HomeCourtResponse] = []


class LeagueMemberBase(BaseModel):
    """Base league member model."""

    role: str = "member"  # 'admin' or 'member'


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
    points_per_loss: Optional[int] = None  # For Points System (default 1, can be 0 or negative)


class SeasonCreate(SeasonBase):
    """Request to create a season."""

    league_id: int


class SeasonResponse(SeasonBase):
    """Season response."""

    model_config = ConfigDict(extra="ignore")

    id: int
    league_id: int
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PlayerBase(BaseModel):
    """Base player model."""

    full_name: str
    nickname: Optional[str] = None
    gender: Optional[str] = None
    level: Optional[str] = None  # 'juniors', 'beginner', 'intermediate', 'advanced', 'AA', 'Open'
    date_of_birth: Optional[str] = None  # ISO date string (YYYY-MM-DD)
    height: Optional[str] = None
    preferred_side: Optional[str] = None  # 'left', 'right', 'none', etc.
    location_id: Optional[str] = None
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
    date_of_birth: Optional[str] = None  # ISO date string (YYYY-MM-DD)
    height: Optional[str] = None
    preferred_side: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    city_latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    city_longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    location_id: Optional[str] = (
        None  # Optional: manually override auto-matched location (location_id string, e.g., "socal_la")
    )
    distance_to_location: Optional[float] = None  # Optional: pre-calculated distance from frontend


class PlayerResponse(PlayerBase):
    """Player response."""

    id: int
    user_id: Optional[int] = None
    avp_playerProfileId: Optional[int] = None
    is_placeholder: bool = False
    created_at: str
    updated_at: str


# --- Placeholder Player Schemas ---


class CreatePlaceholderRequest(BaseModel):
    """Request to create a placeholder player."""

    name: str
    phone_number: Optional[str] = None
    league_id: Optional[int] = None
    gender: Optional[str] = None
    level: Optional[str] = None


class PlaceholderPlayerResponse(BaseModel):
    """Response after creating a placeholder player."""

    player_id: int
    name: str
    invite_token: str
    invite_url: str


class PlaceholderListItem(BaseModel):
    """Single placeholder in the creator's list."""

    player_id: int
    name: str
    phone_number: Optional[str] = None
    match_count: int = 0
    invite_token: str
    invite_url: str
    status: str
    created_at: str


class PlaceholderListResponse(BaseModel):
    """List of placeholders created by the current user."""

    placeholders: List[PlaceholderListItem]


class DeletePlaceholderResponse(BaseModel):
    """Response after deleting a placeholder."""

    affected_matches: int


# --- Invite Schemas ---


class InviteUrlResponse(BaseModel):
    """Response containing a placeholder player's invite URL."""

    invite_url: str


class InviteDetailsResponse(BaseModel):
    """Public-facing invite details for the landing page."""

    inviter_name: str
    placeholder_name: str
    match_count: int
    league_names: List[str]
    status: str


class ClaimInviteResponse(BaseModel):
    """Response after claiming an invite."""

    success: bool
    message: str
    player_id: int
    redirect_url: Optional[str] = None
    warnings: Optional[List[str]] = None


class PlayerSeasonStatsResponse(BaseModel):
    """Player season stats response."""

    model_config = ConfigDict(extra="ignore")

    id: int
    player_id: int
    season_id: int
    games: int
    wins: int
    points: float  # Float to support season_rating type (precise ratings) and points_system (integer values)
    win_rate: float
    avg_point_diff: float
    created_at: str
    updated_at: str


class PaginatedPlayersResponse(BaseModel):
    """Paginated player list response for GET /api/players."""

    model_config = ConfigDict(extra="ignore")

    items: List[Any]
    total_count: int


class CreatePlayerResponse(BaseModel):
    """Response after creating a player via POST /api/players."""

    model_config = ConfigDict(extra="ignore")

    status: str
    message: str
    player_id: int
    name: str


class PlayerSeasonStatsDataResponse(BaseModel):
    """Season stats for a player as returned by GET /api/players/{player_id}/season/{season_id}/stats."""

    model_config = ConfigDict(extra="ignore")

    player_id: int
    season_id: int
    games: int
    wins: int
    losses: int
    win_rate: float
    points: float
    avg_pt_diff: float


class SendMessageRequest(BaseModel):
    """Request to send a direct message."""

    receiver_player_id: int
    message_text: str = Field(min_length=1, max_length=500)


class DirectMessageResponse(BaseModel):
    """Single direct message."""

    id: int
    sender_player_id: int
    receiver_player_id: int
    message_text: str
    is_read: bool
    read_at: Optional[datetime] = None
    created_at: datetime


class ConversationResponse(BaseModel):
    """Single conversation in the conversation list."""

    player_id: int
    full_name: str
    avatar: Optional[str] = None
    last_message_text: str
    last_message_at: str
    last_message_sender_id: int
    unread_count: int = 0
    is_friend: bool = False


class ConversationListResponse(BaseModel):
    """Paginated conversation list."""

    items: List[ConversationResponse]
    total_count: int


class ThreadResponse(BaseModel):
    """Paginated thread of messages with a specific player."""

    items: List[DirectMessageResponse]
    total_count: int
    has_more: bool


class FriendCreate(BaseModel):
    """Request to create a friendship."""

    player2_id: int


class FriendResponse(BaseModel):
    """Friend response."""

    id: int
    player1_id: int
    player2_id: int
    created_at: str


class FriendRequestCreate(BaseModel):
    """Request to send a friend request."""

    receiver_player_id: int


class FriendRequestResponse(BaseModel):
    """Friend request response."""

    model_config = ConfigDict(extra="ignore")

    id: int
    sender_player_id: int
    sender_name: str
    sender_avatar: Optional[str] = None
    receiver_player_id: int
    receiver_name: str
    receiver_avatar: Optional[str] = None
    status: str
    created_at: Optional[str] = None


class FriendListItem(BaseModel):
    """Single friend in the friends list."""

    id: int
    player_id: int
    full_name: str
    avatar: Optional[str] = None
    location_name: Optional[str] = None
    level: Optional[str] = None


class FriendListResponse(BaseModel):
    """Paginated friends list response."""

    items: List[FriendListItem]
    total_count: int


class FriendBatchStatusRequest(BaseModel):
    """Request to check friend status for multiple players."""

    player_ids: List[int] = Field(..., max_length=100)


class FriendBatchStatusResponse(BaseModel):
    """Batch friend status response."""

    statuses: dict  # { player_id: "friend"|"pending_outgoing"|"pending_incoming"|"none" }
    mutual_counts: dict  # { player_id: int }


# Update SessionResponse to include new fields
class SessionResponse(BaseModel):
    """Session data."""

    id: int
    date: str
    name: str
    status: str  # ACTIVE, SUBMITTED, or EDITED
    season_id: Optional[int] = None
    court_id: Optional[int] = None
    location_id: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: str


class SessionDetailResponse(BaseModel):
    """Detailed session data including court info and creator details."""

    model_config = ConfigDict(extra="ignore")

    id: int
    code: Optional[str] = None
    date: Optional[str] = None
    name: Optional[str] = None
    status: Optional[str] = None
    season_id: Optional[int] = None
    court_id: Optional[int] = None
    court_name: Optional[str] = None
    court_slug: Optional[str] = None
    league_id: Optional[int] = None
    location_id: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_by: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    updated_by: Optional[int] = None
    updated_by_name: Optional[str] = None


class SessionListItemResponse(BaseModel):
    """Session list item for league session listings."""

    model_config = ConfigDict(extra="ignore")

    id: int
    date: Optional[str] = None
    name: Optional[str] = None
    status: Optional[str] = None
    season_id: Optional[int] = None
    court_id: Optional[int] = None
    court_name: Optional[str] = None
    court_slug: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    created_by: Optional[int] = None
    updated_by: Optional[int] = None


class OpenSessionResponse(BaseModel):
    """Session summary for open/active sessions visible to the current user."""

    model_config = ConfigDict(extra="ignore")

    id: int
    code: Optional[str] = None
    date: Optional[str] = None
    name: Optional[str] = None
    status: Optional[str] = None
    season_id: Optional[int] = None
    league_id: Optional[int] = None
    league_name: Optional[str] = None
    court_id: Optional[int] = None
    court_name: Optional[str] = None
    court_slug: Optional[str] = None
    match_count: int = 0
    user_match_count: int = 0
    participation: Optional[str] = None
    created_by: Optional[int] = None
    created_by_name: Optional[str] = None
    updated_at: Optional[str] = None


class SessionWithStatusResponse(BaseModel):
    """Response wrapping a session with a status/message envelope."""

    model_config = ConfigDict(extra="ignore")

    status: str
    message: str
    session: SessionDetailResponse


class SubmitSessionResponse(BaseModel):
    """Response after submitting/locking in a session."""

    model_config = ConfigDict(extra="ignore")

    status: str
    message: str
    global_job_id: Optional[int] = None
    league_job_id: Optional[int] = None
    season_id: Optional[int] = None


class DeleteSessionResponse(BaseModel):
    """Response after deleting a session."""

    model_config = ConfigDict(extra="ignore")

    status: str
    message: str
    session_id: int


class SessionMatchItemResponse(BaseModel):
    """Single match item within a session."""

    model_config = ConfigDict(extra="ignore")

    id: int
    date: Optional[str] = None
    session_id: Optional[int] = None
    session_name: Optional[str] = None
    session_status: Optional[str] = None
    team1_player1_id: Optional[int] = None
    team1_player1_name: str = ""
    team1_player2_id: Optional[int] = None
    team1_player2_name: str = ""
    team2_player1_id: Optional[int] = None
    team2_player1_name: str = ""
    team2_player2_id: Optional[int] = None
    team2_player2_name: str = ""
    team1_score: Optional[int] = None
    team2_score: Optional[int] = None
    winner: Optional[int] = None
    is_ranked: Optional[bool] = None
    ranked_intent: Optional[bool] = None


class SessionParticipantItemResponse(BaseModel):
    """Single participant in a session."""

    model_config = ConfigDict(extra="ignore")

    player_id: int
    full_name: str
    level: Optional[str] = None
    gender: Optional[str] = None
    location_name: Optional[str] = None
    is_placeholder: bool = False


class BatchInviteFailItem(BaseModel):
    """Single failed invite in a batch invite response."""

    model_config = ConfigDict(extra="ignore")

    player_id: int
    error: str


class BatchInviteResponse(BaseModel):
    """Response from batch invite endpoint."""

    model_config = ConfigDict(extra="ignore")

    added: List[int]
    failed: List[BatchInviteFailItem]


# Weekly Schedule schemas
class WeeklyScheduleBase(BaseModel):
    """Base weekly schedule model."""

    day_of_week: int  # 0-6, Monday=0
    start_time: str  # HH:MM format
    duration_hours: float = 2.0
    court_id: Optional[int] = None
    open_signups_mode: str = (
        "auto_after_last_session"  # 'auto_after_last_session', 'specific_day_time', 'always_open'
    )
    open_signups_day_of_week: Optional[int] = None  # For specific_day_time mode
    open_signups_time: Optional[str] = None  # HH:MM format for specific_day_time mode
    start_date: str  # ISO date string - when to start generating signups
    end_date: str  # ISO date string


class WeeklyScheduleCreate(WeeklyScheduleBase):
    """Request to create a weekly schedule. season_id is provided in the URL path."""


class WeeklyScheduleUpdate(BaseModel):
    """Request to update a weekly schedule."""

    day_of_week: Optional[int] = None
    start_time: Optional[str] = None
    duration_hours: Optional[float] = None
    court_id: Optional[int] = None
    open_signups_mode: Optional[str] = None
    open_signups_day_of_week: Optional[int] = None
    open_signups_time: Optional[str] = None
    start_date: Optional[str] = None
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
    open_signups_at: Optional[str] = (
        None  # ISO datetime string (UTC). If None, defaults to now (immediately open)
    )


class SignupCreate(SignupBase):
    """Request to create a signup. season_id is provided in the URL path."""


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
    is_open: bool = False  # Computed: open_signups_at is NULL or open_signups_at <= now (UTC). NULL means always open.
    is_past: bool = False  # Computed: scheduled_datetime < now (UTC)
    created_at: str
    updated_at: str
    players: Optional[List[SignupPlayerResponse]] = None  # Optional, populated when requested


class SignupWithPlayersResponse(SignupResponse):
    """Signup response with players list."""

    players: List[SignupPlayerResponse]


# League Messages
class LeagueMessageCreate(BaseModel):
    """Create a league message."""

    message: str


class LeagueMessageResponse(BaseModel):
    """League message response."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    league_id: int
    user_id: int
    player_id: Optional[int] = None
    player_name: Optional[str] = None
    message: str
    created_at: str


# Feedback schemas
class FeedbackCreate(BaseModel):
    """Request to create feedback."""

    feedback_text: str
    email: Optional[str] = None


class FeedbackResponse(BaseModel):
    """Feedback response."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: Optional[int] = None
    feedback_text: str
    email: Optional[str] = None
    is_resolved: bool
    created_at: str
    user_name: Optional[str] = None  # Computed field


# Notification schemas
class NotificationResponse(BaseModel):
    """Notification response."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    type: str
    title: str
    message: str
    data: Optional[dict] = None
    is_read: bool
    read_at: Optional[str] = None
    link_url: Optional[str] = None
    created_at: str


class NotificationListResponse(BaseModel):
    """Paginated notification list response."""

    items: List[NotificationResponse]
    total_count: int
    has_more: bool


class MarkAsReadRequest(BaseModel):
    """Request to mark notification as read. Note: notification_id is in URL path."""

    pass


# ---------------------------------------------------------------------------
# Session route request schemas
# ---------------------------------------------------------------------------


class EndLeagueSessionRequest(BaseModel):
    """Request to submit/lock a league session."""

    submit: bool


class JoinSessionRequest(BaseModel):
    """Request to join a session by shareable code."""

    code: str


class InviteToSessionRequest(BaseModel):
    """Request to invite a single player to a session."""

    player_id: int


class InviteBatchToSessionRequest(BaseModel):
    """Request to invite multiple players to a session."""

    player_ids: List[int]


class CreateNonLeagueSessionRequest(BaseModel):
    """Request to create a non-league session."""

    date: Optional[str] = None  # MM/DD/YYYY; defaults to today when omitted
    name: Optional[str] = None
    court_id: Optional[int] = None
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)


class UpdateSessionRequest(BaseModel):
    """Request to update a non-league session (submit, rename, re-date, re-season, re-court)."""

    submit: Optional[bool] = None
    name: Optional[str] = None
    date: Optional[str] = None
    season_id: Optional[int] = None
    court_id: Optional[int] = None


# ---------------------------------------------------------------------------
# Player route request schemas
# ---------------------------------------------------------------------------


class CreatePlayerRequest(BaseModel):
    """Request to create a new player by name."""

    name: str


class AddPlayerHomeCourt(BaseModel):
    """Request to add a home court for a player."""

    court_id: int


class SetPlayerHomeCourts(BaseModel):
    """Request to replace all home courts for a player."""

    court_ids: List[int]


class CourtPosition(BaseModel):
    """A single (court_id, position) pair used when reordering home courts."""

    court_id: int
    position: int


class ReorderPlayerHomeCourts(BaseModel):
    """Request to reorder home courts for a player."""

    court_positions: List[CourtPosition]


# ---------------------------------------------------------------------------
# Photo-match route request schemas
# ---------------------------------------------------------------------------


class EditPhotoResultsRequest(BaseModel):
    """Request to send an edit prompt for photo-match conversation refinement."""

    edit_prompt: str


class ConfirmPhotoMatchesRequest(BaseModel):
    """Request to confirm parsed photo matches and create them in the database."""

    season_id: int
    match_date: str
    player_overrides: Optional[list] = None


class UnreadCountResponse(BaseModel):
    """Unread notification count response."""

    count: int


# ============================================================================
# Public API schemas (SEO / unauthenticated endpoints)
# ============================================================================


class SitemapLeagueItem(BaseModel):
    """Single league entry for sitemap generation."""

    id: int
    name: str
    updated_at: Optional[str] = None


class SitemapPlayerItem(BaseModel):
    """Single player entry for sitemap generation."""

    id: int
    full_name: str
    updated_at: Optional[str] = None


class SitemapLocationItem(BaseModel):
    """Single location entry for sitemap generation."""

    slug: str
    updated_at: Optional[str] = None


class PublicLocationRef(BaseModel):
    """Location reference used in public league/player responses."""

    id: str
    name: str
    city: Optional[str] = None
    state: Optional[str] = None
    slug: Optional[str] = None


class PublicRegionRef(BaseModel):
    """Region reference used in public responses."""

    id: str
    name: str


class PublicLeagueListItem(BaseModel):
    """Single league in the paginated public leagues list."""

    id: int
    name: str
    description: Optional[str] = None
    gender: Optional[str] = None
    level: Optional[str] = None
    is_open: bool = True
    member_count: int = 0
    games_played: int = 0
    location: Optional[PublicLocationRef] = None
    region: Optional[PublicRegionRef] = None


class PaginatedPublicLeaguesResponse(BaseModel):
    """Paginated response for GET /api/public/leagues."""

    items: List[PublicLeagueListItem]
    page: int
    page_size: int
    total_count: int


class PublicLeagueMember(BaseModel):
    """Member entry in a public league detail response."""

    player_id: int
    full_name: str
    level: Optional[str] = None
    avatar: Optional[str] = None
    role: str = "member"


class PublicLeagueStandingEntry(BaseModel):
    """Single standing row in a public league detail response."""

    rank: int
    player_id: int
    full_name: str
    games: int = 0
    wins: int = 0
    points: float = 0
    win_rate: float = 0.0
    avg_point_diff: float = 0.0


class PublicLeagueMatchResult(BaseModel):
    """Single match result in a public league detail response."""

    id: int
    date: Optional[str] = None
    team1_player1: Optional[str] = None
    team1_player2: Optional[str] = None
    team2_player1: Optional[str] = None
    team2_player2: Optional[str] = None
    team1_player1_id: Optional[int] = None
    team1_player2_id: Optional[int] = None
    team2_player1_id: Optional[int] = None
    team2_player2_id: Optional[int] = None
    team1_score: int = 0
    team2_score: int = 0
    winner: Optional[int] = None


class PublicLeagueSeason(BaseModel):
    """Current season info in a public league detail response."""

    id: int
    name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class PublicLeagueDetailResponse(BaseModel):
    """Response for GET /api/public/leagues/{league_id}.

    Public leagues include all fields.
    Private leagues omit: description, members, standings, current_season,
    recent_matches. They include games_played instead.
    """

    id: int
    name: str
    is_public: bool
    gender: Optional[str] = None
    level: Optional[str] = None
    member_count: int = 0
    creator_name: Optional[str] = None
    location: Optional[PublicLocationRef] = None
    # Public-only fields
    description: Optional[str] = None
    members: Optional[List[PublicLeagueMember]] = None
    current_season: Optional[PublicLeagueSeason] = None
    standings: Optional[List[PublicLeagueStandingEntry]] = None
    recent_matches: Optional[List[PublicLeagueMatchResult]] = None
    # Private-only field
    games_played: Optional[int] = None


class PublicPlayerStats(BaseModel):
    """Player stats in a public player profile."""

    current_rating: float = 1200.0
    total_games: int = 0
    total_wins: int = 0
    win_rate: float = 0.0


class PublicPlayerLeagueMembership(BaseModel):
    """League membership entry in a public player profile."""

    league_id: int
    league_name: str


class PublicPlayerResponse(BaseModel):
    """Response for GET /api/public/players/{player_id}."""

    id: int
    full_name: str
    avatar: Optional[str] = None
    gender: Optional[str] = None
    level: Optional[str] = None
    is_placeholder: bool = False
    location: Optional[PublicLocationRef] = None
    stats: PublicPlayerStats
    league_memberships: List[PublicPlayerLeagueMembership] = []
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ---------------------------------------------------------------------------
# League route response schemas
# ---------------------------------------------------------------------------


class SuccessResponse(BaseModel):
    """Generic response for operations that return only a success flag."""

    model_config = ConfigDict(extra="ignore")

    success: bool


class SuccessMessageResponse(BaseModel):
    """Generic response for operations that return a success flag and a message."""

    model_config = ConfigDict(extra="ignore")

    success: bool
    message: str


class LeagueMemberDetailResponse(BaseModel):
    """League member response enriched with player profile fields."""

    model_config = ConfigDict(extra="ignore")

    id: int
    league_id: Optional[int] = None
    player_id: int
    role: str
    player_name: Optional[str] = None
    player_nickname: Optional[str] = None
    player_level: Optional[str] = None
    player_avatar: Optional[str] = None
    joined_at: Optional[str] = None
    is_placeholder: bool = False


class BatchMemberFailItem(BaseModel):
    """A single failed entry from a batch member-add operation."""

    model_config = ConfigDict(extra="ignore")

    player_id: Optional[int] = None
    error: str


class BatchMemberResponse(BaseModel):
    """Response from batch-adding league members."""

    model_config = ConfigDict(extra="ignore")

    added: List[LeagueMemberResponse]
    failed: List[BatchMemberFailItem]


class JoinRequestItemResponse(BaseModel):
    """Single league join request item."""

    model_config = ConfigDict(extra="ignore")

    id: int
    league_id: Optional[int] = None
    player_id: int
    player_name: Optional[str] = None
    status: str
    created_at: Optional[str] = None


class JoinRequestsResponse(BaseModel):
    """Response for listing pending and rejected league join requests."""

    model_config = ConfigDict(extra="ignore")

    pending: List[JoinRequestItemResponse]
    rejected: List[JoinRequestItemResponse]


class RequestJoinResponse(BaseModel):
    """Response after successfully submitting a league join request."""

    model_config = ConfigDict(extra="ignore")

    success: bool
    message: str
    request_id: int


class LeagueJoinResponse(BaseModel):
    """Response after joining or approving a join request for a league."""

    model_config = ConfigDict(extra="ignore")

    success: bool
    message: str
    member: LeagueMemberResponse


class PublicLocationDirectoryItem(BaseModel):
    """Single location in the directory listing."""

    id: str
    name: str
    city: Optional[str] = None
    state: Optional[str] = None
    slug: str
    league_count: int = 0
    player_count: int = 0
    court_count: int = 0


class PublicLocationDirectoryRegion(BaseModel):
    """Region group in the location directory."""

    id: Optional[str] = None
    name: str
    locations: List[PublicLocationDirectoryItem] = []


class PublicLocationLeague(BaseModel):
    """League entry on a public location detail page."""

    id: int
    name: str
    gender: Optional[str] = None
    level: Optional[str] = None
    member_count: int = 0


class PublicLocationPlayer(BaseModel):
    """Player entry on a public location detail page."""

    id: int
    full_name: str
    level: Optional[str] = None
    avatar: Optional[str] = None
    current_rating: float = 1200.0
    total_games: int = 0
    total_wins: int = 0


class PublicLocationCourt(BaseModel):
    """Court entry on a public location detail page."""

    id: int
    name: str
    address: Optional[str] = None


class PublicLocationStats(BaseModel):
    """Aggregate stats for a public location page."""

    total_players: int = 0
    total_leagues: int = 0
    total_matches: int = 0
    total_courts: int = 0


class PublicLocationDetailResponse(BaseModel):
    """Response for GET /api/public/locations/{slug}."""

    id: str
    name: str
    city: Optional[str] = None
    state: Optional[str] = None
    slug: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    region: Optional[PublicRegionRef] = None
    leagues: List[PublicLocationLeague] = []
    top_players: List[PublicLocationPlayer] = []
    courts: List[PublicLocationCourt] = []
    stats: PublicLocationStats


class PublicPlayerListItem(BaseModel):
    """Single player in the public players search results."""

    id: int
    full_name: str
    avatar: Optional[str] = None
    gender: Optional[str] = None
    level: Optional[str] = None
    location_name: Optional[str] = None
    total_games: int = 0
    current_rating: float = 1200.0
    is_placeholder: bool = False


class PaginatedPublicPlayersResponse(BaseModel):
    """Response for GET /api/public/players."""

    items: List[PublicPlayerListItem] = []
    total_count: int = 0
    page: int = 1
    page_size: int = 25


# ============================================================================
# Court Discovery & Reviews schemas
# ============================================================================


class CourtTagResponse(BaseModel):
    """Single curated review tag."""

    id: int
    name: str
    slug: str
    category: str
    sort_order: int = 0


class CourtReviewPhotoResponse(BaseModel):
    """Photo attached to a court review."""

    id: int
    url: str
    sort_order: int = 0


class CourtReviewAuthor(BaseModel):
    """Minimal author info embedded in a review response."""

    player_id: int
    full_name: str
    avatar: Optional[str] = None


class CourtReviewResponse(BaseModel):
    """Single court review with tags, photos, and author."""

    id: int
    court_id: int
    rating: int
    review_text: Optional[str] = None
    author: CourtReviewAuthor
    tags: List[CourtTagResponse] = []
    photos: List[CourtReviewPhotoResponse] = []
    created_at: str
    updated_at: str


class CourtListItem(BaseModel):
    """Court card in directory listing."""

    id: int
    name: str
    slug: str
    address: Optional[str] = None
    location_id: str
    location_name: Optional[str] = None
    location_slug: Optional[str] = None
    court_count: Optional[int] = None
    surface_type: Optional[str] = None
    is_free: Optional[bool] = None
    has_lights: Optional[bool] = None
    nets_provided: Optional[bool] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    average_rating: Optional[float] = None
    review_count: int = 0
    top_tags: List[str] = []
    photo_url: Optional[str] = None  # First review photo as thumbnail
    distance_miles: Optional[float] = None  # Present when user_lat/user_lng provided


class PaginatedCourtsResponse(BaseModel):
    """Paginated response for GET /api/public/courts."""

    items: List[CourtListItem] = []
    total_count: int = 0
    page: int = 1
    page_size: int = 20


class CourtDetailResponse(BaseModel):
    """Full court detail for GET /api/public/courts/{slug}."""

    id: int
    name: str
    slug: str
    address: Optional[str] = None
    description: Optional[str] = None
    location_id: str
    location_name: Optional[str] = None
    location_slug: Optional[str] = None
    court_count: Optional[int] = None
    surface_type: Optional[str] = None
    is_free: Optional[bool] = None
    cost_info: Optional[str] = None
    has_lights: Optional[bool] = None
    has_restrooms: Optional[bool] = None
    has_parking: Optional[bool] = None
    parking_info: Optional[str] = None
    nets_provided: Optional[bool] = None
    hours: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    average_rating: Optional[float] = None
    review_count: int = 0
    status: str = "approved"
    is_active: bool = True
    created_by: Optional[int] = None
    reviews: List[CourtReviewResponse] = []
    all_photos: List[CourtReviewPhotoResponse] = []  # Aggregated across reviews
    court_photos: List[CourtReviewPhotoResponse] = []  # Standalone court photos
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class CourtPhotoUploadResponse(BaseModel):
    """Response for a successfully uploaded court photo."""

    id: int
    url: str
    sort_order: int = 0


class ReorderCourtPhotosRequest(BaseModel):
    """Request body for reordering court photos."""

    photo_ids: List[int]


class CourtLeaderboardEntry(BaseModel):
    """A single entry in the court leaderboard."""

    rank: int
    player_id: int
    player_name: str
    avatar: Optional[str] = None
    match_count: int
    win_count: int
    win_rate: float


class CourtNearbyItem(BaseModel):
    """Nearby court with distance."""

    id: int
    name: str
    slug: str
    address: Optional[str] = None
    surface_type: Optional[str] = None
    average_rating: Optional[float] = None
    review_count: int = 0
    distance_miles: float
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class CreateCourtRequest(BaseModel):
    """Request to submit a new court for approval."""

    name: str
    address: str
    location_id: str
    description: Optional[str] = None
    court_count: Optional[int] = None
    surface_type: Optional[str] = None  # 'sand', 'indoor_sand'
    is_free: Optional[bool] = None
    cost_info: Optional[str] = None
    has_lights: Optional[bool] = None
    has_restrooms: Optional[bool] = None
    has_parking: Optional[bool] = None
    parking_info: Optional[str] = None
    nets_provided: Optional[bool] = None
    hours: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)


class UpdateCourtRequest(BaseModel):
    """Request to update court info (creator or admin)."""

    name: Optional[str] = None
    address: Optional[str] = None
    description: Optional[str] = None
    court_count: Optional[int] = None
    surface_type: Optional[str] = None
    is_free: Optional[bool] = None
    cost_info: Optional[str] = None
    has_lights: Optional[bool] = None
    has_restrooms: Optional[bool] = None
    has_parking: Optional[bool] = None
    parking_info: Optional[str] = None
    nets_provided: Optional[bool] = None
    hours: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    is_active: Optional[bool] = None


class CreateReviewRequest(BaseModel):
    """Request to create a court review."""

    rating: int = Field(ge=1, le=5)
    review_text: Optional[str] = None
    tag_ids: List[int] = []


class UpdateReviewRequest(BaseModel):
    """Request to update a court review."""

    rating: Optional[int] = Field(default=None, ge=1, le=5)
    review_text: Optional[str] = None
    tag_ids: Optional[List[int]] = None


class CourtEditSuggestionRequest(BaseModel):
    """Request to suggest edits to a court."""

    changes: dict  # field -> new_value


class CourtEditSuggestionResponse(BaseModel):
    """Response for a court edit suggestion."""

    id: int
    court_id: int
    suggested_by: int
    suggester_name: Optional[str] = None
    changes: dict
    status: str = "pending"
    reviewed_by: Optional[int] = None
    created_at: str
    reviewed_at: Optional[str] = None


class ReviewActionResponse(BaseModel):
    """Response after creating/updating/deleting a review."""

    review_id: Optional[int] = None
    average_rating: Optional[float] = None
    review_count: int = 0


class SitemapCourtItem(BaseModel):
    """Single court entry for sitemap generation."""

    slug: str
    updated_at: Optional[str] = None


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


# ---------------------------------------------------------------------------
# KOB (King/Queen of the Beach) Schemas
# ---------------------------------------------------------------------------


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
    game_index: Optional[int] = None  # For Bo3: which game to update (0-based)


class KobSeedReorder(BaseModel):
    """Request to reorder seeds."""

    player_ids: List[int]  # ordered list, position = seed


class KobBracketUpdate(BaseModel):
    """Request to swap player assignments in a bracket match."""

    match_id: int
    team1: List[int]  # [player_id, player_id]
    team2: List[int]  # [player_id, player_id]


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
    label: Optional[str] = None  # "Semifinal", "Final"


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
