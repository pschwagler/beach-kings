"""Players models."""

from typing import Any, Optional, List
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class PlayerBase(BaseModel):
    """Base player model."""

    full_name: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    nickname: Optional[str] = None
    gender: Optional[str] = None
    level: Optional[str] = None  # 'juniors', 'beginner', 'intermediate', 'advanced', 'AA', 'Open'
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
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    nickname: Optional[str] = None
    gender: Optional[str] = None
    level: Optional[str] = None
    date_of_birth: Optional[str] = None
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

    @field_validator("gender", "level")
    @classmethod
    def reject_blank_demographics(cls, value: Optional[str]) -> Optional[str]:
        """Owner demographics may be omitted, but not saved as blank text."""
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("gender and level must not be blank")
        return normalized

    @model_validator(mode="after")
    def resolve_names(self) -> "PlayerUpdate":
        """Recompute name fields when any name input is provided.

        Rejects explicitly-provided-but-empty name fields (e.g. full_name="").
        """
        from backend.services.players.player_data import resolve_name_fields

        # Reject empty/whitespace-only name fields that were explicitly set
        any_name_provided = (
            self.full_name is not None or self.first_name is not None or self.last_name is not None
        )
        result = resolve_name_fields(
            first_name=self.first_name,
            last_name=self.last_name,
            full_name=self.full_name,
        )
        if any_name_provided and result is None:
            raise ValueError("full_name must not be empty")
        if result is not None:
            self.first_name = result["first_name"]
            self.last_name = result["last_name"]
            self.full_name = result["full_name"]
        return self

    @model_validator(mode="after")
    def reject_exact_birthdate(self) -> "PlayerUpdate":
        if self.date_of_birth is not None:
            raise ValueError("Date of birth is not collected; use the age-assurance flow")
        return self


class PlayerResponse(PlayerBase):
    """Player response."""

    id: int
    user_id: Optional[int] = None
    avp_playerProfileId: Optional[int] = None
    is_placeholder: bool = False
    created_at: str
    updated_at: str


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
