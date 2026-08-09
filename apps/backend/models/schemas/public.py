"""Public models."""

from typing import Optional, List, Literal
from pydantic import BaseModel, ConfigDict
from .leagues import LeagueMemberResponse


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
    """Player stats in a public player profile.

    ``current_rating``, ``total_wins``, and ``win_rate`` are ``Optional``
    because the service returns ``None`` for private profiles (floor-only
    visibility).  ``total_games`` is always present.
    """

    current_rating: Optional[float] = None
    total_games: int = 0
    total_wins: Optional[int] = None
    win_rate: Optional[float] = None


class PublicPlayerLeagueMembership(BaseModel):
    """League membership entry in a public player profile."""

    league_id: int
    league_name: str


class PublicPlayerResponse(BaseModel):
    """Response for GET /api/public/players/{player_id}.

    Privacy flags are always serialised so clients can gate UI accordingly:
    - ``profile_is_private``: True when the owner has hidden their full stats.
    - ``game_history_visible``: True when the owner permits match-history views.

    ``city`` and ``state`` are top-level floor fields (always present when set;
    the nested ``location`` object carries the full location record).
    """

    id: int
    full_name: str
    avatar: Optional[str] = None
    gender: Optional[str] = None
    level: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    is_placeholder: bool = False
    location: Optional[PublicLocationRef] = None
    stats: PublicPlayerStats
    league_memberships: List[PublicPlayerLeagueMembership] = []
    game_history_visible: bool = True
    profile_is_private: bool = False
    friend_status: str = "none"
    friend_request_id: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


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
    display_name: Optional[str] = None
    status: str
    created_at: Optional[str] = None
    requested_at: Optional[str] = None
    avatar_url: Optional[str] = None


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


class InvitablePlayerResponse(BaseModel):
    """A player that can be invited to a league, with section and invite status."""

    model_config = ConfigDict(extra="ignore")

    player_id: int
    display_name: str
    initials: str
    avatar_url: Optional[str] = None
    location_name: Optional[str] = None
    level: Optional[str] = None
    invite_status: Literal["none", "member", "invited", "requested"]
    section: Literal["friends", "recent_opponents", "suggested"]


class LeagueInviteItemResponse(BaseModel):
    """A league invite record, used by admin list and sent-invites views."""

    model_config = ConfigDict(extra="ignore")

    id: int
    league_id: int
    league_name: str
    player_id: int
    display_name: str
    initials: str
    avatar_url: Optional[str] = None
    invited_at: str
    status: Literal["pending", "accepted", "declined"]
    game_count: Optional[int] = None


class InviteActionResponse(BaseModel):
    """Response returned after accepting or declining a league invite."""

    status: str


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


class DiscoverPlayerItem(PublicPlayerListItem):
    """Player item with mutual friend count and friend status for discovery."""

    mutual_friend_count: int = 0
    friend_status: str = "none"
    friend_request_id: Optional[int] = None


class PaginatedDiscoverPlayersResponse(BaseModel):
    """Response for GET /api/friends/discover."""

    items: List[DiscoverPlayerItem] = []
    total_count: int = 0
    page: int = 1
    page_size: int = 25
