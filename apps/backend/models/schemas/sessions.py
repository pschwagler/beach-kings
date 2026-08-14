"""Sessions models."""

from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    start_time: Optional[str] = None
    session_type: Optional[str] = None
    is_ranked: Optional[bool] = True


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
    game_count: int = 0
    player_count: int = 0


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
    global_job_id: Optional[int] = None
    league_job_id: Optional[int] = None


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


class SessionRosterPlayerResponse(BaseModel):
    """A single player entry in the session roster detail response."""

    model_config = ConfigDict(extra="ignore")

    entry_id: int
    player_id: int
    display_name: str
    initials: str
    avatar_url: Optional[str] = None
    game_count: int
    is_placeholder: bool = False
    # Populated for placeholder players that have an open PlayerInvite row.
    # Allows the mobile app to share an invite link straight from the
    # session-detail roster without a follow-up fetch.
    invite_url: Optional[str] = None


class SessionGameResponse(BaseModel):
    """A single game/match within a session, returned as part of session detail."""

    model_config = ConfigDict(extra="ignore")

    id: int
    game_number: int
    team1_player1_id: Optional[int] = None
    team1_player2_id: Optional[int] = None
    team2_player1_id: Optional[int] = None
    team2_player2_id: Optional[int] = None
    team1_player1_name: str = ""
    team1_player2_name: str = ""
    team2_player1_name: str = ""
    team2_player2_name: str = ""
    team1_score: Optional[int] = None
    team2_score: Optional[int] = None
    winner: Optional[int] = None
    rating_change: Optional[float] = None
    is_ranked: Optional[bool] = None


class SessionRosterDetailResponse(BaseModel):
    """Full session detail including roster and games, returned by GET /api/sessions/:id."""

    model_config = ConfigDict(extra="ignore")

    id: int
    code: Optional[str] = None
    court_name: Optional[str] = None
    court_id: Optional[int] = None
    session_type: Optional[str] = None
    status: str
    season_id: Optional[int] = None
    league_id: Optional[int] = None
    league_name: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    session_number: int = 1
    is_ranked: Optional[bool] = True
    players: List[SessionRosterPlayerResponse]
    games: List[SessionGameResponse] = []
    user_wins: int = 0
    user_losses: int = 0
    user_rating_change: Optional[float] = None


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
    """Request to create a session (league or non-league).

    Historically this was non-league only; ``league_id`` + ``season_id`` were
    added so the score-screen "Manage Session" flow can lazily create a
    league session before any matches are saved (see
    apps/mobile/MOBILE_ADD_GAMES_VALIDATION.md Flow 2.3 / 4.3).
    All fields are optional. ``date`` defaults to today on the backend when
    omitted. The backend derives ``session_type`` from ``league_id``.
    """

    model_config = ConfigDict(extra="forbid")

    date: Optional[str] = None  # MM/DD/YYYY; defaults to today when omitted
    name: Optional[str] = None
    court_id: Optional[int] = None
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    start_time: Optional[str] = None
    # League/season context — when provided, the session is attached to that
    # season; otherwise a non-league session is created.
    league_id: Optional[int] = None
    season_id: Optional[int] = None
    is_ranked: Optional[bool] = (
        None  # Session-level ranked intent; defaults to True on the backend when omitted
    )


class UpdateSessionRequest(BaseModel):
    """Request to update a session (submit, rename, re-date, re-season, re-court).

    A session's ``league_id`` is never set directly by the client on update — it
    is derived authoritatively inside ``update_session`` from the attached
    season (a session may only move between seasons of its own league).
    The backend derives ``session_type`` from the resulting ``league_id``.
    """

    model_config = ConfigDict(extra="forbid")

    submit: Optional[bool] = None
    name: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    season_id: Optional[int] = None
    court_id: Optional[int] = None
    is_ranked: Optional[bool] = None

    @model_validator(mode="after")
    def validate_explicit_nulls(self):
        for field_name in ("name", "date"):
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} must be a string")
        if "is_ranked" in self.model_fields_set and self.is_ranked is None:
            raise ValueError("is_ranked must be true or false")
        return self


class EditPhotoResultsRequest(BaseModel):
    """Request to send an edit prompt for photo-match conversation refinement."""

    edit_prompt: str


class ConfirmPhotoMatchesRequest(BaseModel):
    """Request to confirm parsed photo matches and create them in the database.

    ``season_id`` is optional to support gap games (league_id set, season_id
    NULL).  When omitted the matches are recorded as a gap game under the
    league; when provided the season-belongs-to-league validation is applied.
    """

    season_id: Optional[int] = None
    match_date: str
    player_overrides: Optional[list] = None
