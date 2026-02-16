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
    season_rank: int


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


class CreateMatchResponse(BaseModel):
    """Response from creating a match."""

    status: str
    message: str
    match_id: int
    session_id: int


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
    email: Optional[str] = None
    is_verified: bool
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

    id: str
    created_at: str
    updated_at: str


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

    id: str  # Primary key: hub_id from CSV (e.g., "socal_la", "hi_oahu")
    slug: Optional[str] = None  # SEO-friendly URL slug (e.g., "manhattan-beach")
    created_at: str
    updated_at: str


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
    gender: Optional[str] = None  # 'male', 'female', 'mixed'
    level: Optional[str] = None  # 'juniors', 'beginner', 'intermediate', 'advanced', 'AA', 'Open'


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
    point_system: Optional[str] = None  # Legacy field, kept for backward compatibility
    scoring_system: Optional[str] = None  # "points_system" or "season_rating"
    points_per_win: Optional[int] = None  # For Points System (default 3)
    points_per_loss: Optional[int] = None  # For Points System (default 1, can be 0 or negative)


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
    city_latitude: Optional[float] = None
    city_longitude: Optional[float] = None
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
    player_name: str
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

    notifications: List[NotificationResponse]
    total_count: int
    has_more: bool


class MarkAsReadRequest(BaseModel):
    """Request to mark notification as read. Note: notification_id is in URL path."""

    pass


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
    location: Optional[PublicLocationRef] = None
    stats: PublicPlayerStats
    league_memberships: List[PublicPlayerLeagueMembership] = []
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PublicLocationDirectoryItem(BaseModel):
    """Single location in the directory listing."""

    id: str
    name: str
    city: Optional[str] = None
    state: Optional[str] = None
    slug: str
    league_count: int = 0
    player_count: int = 0


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


class PaginatedPublicPlayersResponse(BaseModel):
    """Response for GET /api/public/players."""

    items: List[PublicPlayerListItem] = []
    total_count: int = 0
    page: int = 1
    page_size: int = 25
