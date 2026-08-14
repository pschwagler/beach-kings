"""Courts models."""

from typing import Annotated, Optional, List, Literal
from urllib.parse import urlsplit
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, model_validator


def _normalize_court_website(value):
    """Normalize optional court links and reject unsafe/non-web schemes."""
    if value is None:
        return None
    if not isinstance(value, str):
        return value

    value = value.strip()
    if not value:
        return None
    if len(value) > 500:
        raise ValueError("website must be at most 500 characters")

    parsed = urlsplit(value)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        raise ValueError("website must be an absolute http:// or https:// URL")
    return value


CourtWebsite = Annotated[Optional[str], BeforeValidator(_normalize_court_website)]


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
    moderation_visibility: str = "visible"
    target_type: str = "court_review_photo"


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
    moderation_visibility: str = "visible"


class CourtListItem(BaseModel):
    """Court card in directory listing."""

    id: int
    name: str
    slug: str
    address: Optional[str] = None
    location_id: str
    location_name: Optional[str] = None
    location_slug: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    court_count: Optional[int] = None
    surface_type: Optional[str] = None
    wind_exposure: Optional[Literal["sheltered", "mixed", "exposed"]] = None
    wind_notes: Optional[str] = Field(default=None, max_length=140)
    sand_depth: Optional[Literal["shallow", "typical", "deep"]] = None
    sand_notes: Optional[str] = Field(default=None, max_length=140)
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
    is_saved: Optional[bool] = None


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
    wind_exposure: Optional[Literal["sheltered", "mixed", "exposed"]] = None
    wind_notes: Optional[str] = Field(default=None, max_length=140)
    sand_depth: Optional[Literal["shallow", "typical", "deep"]] = None
    sand_notes: Optional[str] = Field(default=None, max_length=140)
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


class CourtPhotoResponse(BaseModel):
    """A standalone court photo as returned by the public photos endpoint."""

    id: int
    url: str
    caption: Optional[str] = None
    sort_order: int = 0
    created_at: Optional[str] = None
    moderation_visibility: str = "visible"
    target_type: str = "court_photo"


class CourtPhotoUploadResponse(BaseModel):
    """Response for a successfully uploaded court photo."""

    id: int
    url: str
    caption: Optional[str] = None
    sort_order: int = 0
    created_at: Optional[str] = None
    moderation_visibility: str = "visible"


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


class CourtCheckInResponse(BaseModel):
    """A single check-in record."""

    id: int
    player_id: int
    player_name: str
    avatar: Optional[str] = None
    checked_in_at: str
    expires_at: str


class CourtCheckInCountResponse(BaseModel):
    """Active check-in count with player list."""

    count: int
    checked_in_players: List[CourtCheckInResponse] = []


class CourtLeagueItem(BaseModel):
    """A league that plays at a court."""

    id: int
    name: str
    slug: Optional[str] = None
    gender: Optional[str] = None
    level: Optional[str] = None
    member_count: int = 0


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
    website: CourtWebsite = None
    wind_exposure: Optional[Literal["sheltered", "mixed", "exposed"]] = None
    wind_notes: Optional[str] = Field(default=None, max_length=140)
    sand_depth: Optional[Literal["shallow", "typical", "deep"]] = None
    sand_notes: Optional[str] = Field(default=None, max_length=140)
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)

    @model_validator(mode="after")
    def validate_coordinates(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must be provided together")
        return self


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
    website: CourtWebsite = None
    wind_exposure: Optional[Literal["sheltered", "mixed", "exposed"]] = None
    wind_notes: Optional[str] = Field(default=None, max_length=140)
    sand_depth: Optional[Literal["shallow", "typical", "deep"]] = None
    sand_notes: Optional[str] = Field(default=None, max_length=140)
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    is_active: Optional[bool] = None

    @model_validator(mode="after")
    def validate_coordinates(self):
        lat_set = "latitude" in self.model_fields_set
        lng_set = "longitude" in self.model_fields_set
        if lat_set != lng_set or (lat_set and (self.latitude is None or self.longitude is None)):
            raise ValueError("latitude and longitude must be provided together")
        return self


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


class CourtEditSuggestionChanges(BaseModel):
    """Strict set of court fields a community member may suggest changing."""

    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    address: Optional[str] = None
    description: Optional[str] = None
    court_count: Optional[int] = Field(default=None, ge=0)
    surface_type: Optional[str] = None
    is_free: Optional[bool] = None
    cost_info: Optional[str] = None
    has_lights: Optional[bool] = None
    has_restrooms: Optional[bool] = None
    has_parking: Optional[bool] = None
    parking_info: Optional[str] = None
    nets_provided: Optional[bool] = None
    hours: Optional[str] = None
    phone: Optional[str] = Field(default=None, max_length=30)
    website: CourtWebsite = None
    wind_exposure: Optional[Literal["sheltered", "mixed", "exposed"]] = None
    wind_notes: Optional[str] = Field(default=None, max_length=140)
    sand_depth: Optional[Literal["shallow", "typical", "deep"]] = None
    sand_notes: Optional[str] = Field(default=None, max_length=140)
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)

    @model_validator(mode="after")
    def validate_changes(self):
        if not self.model_fields_set:
            raise ValueError("at least one court change is required")

        lat_set = "latitude" in self.model_fields_set
        lng_set = "longitude" in self.model_fields_set
        if lat_set != lng_set or (lat_set and (self.latitude is None or self.longitude is None)):
            raise ValueError("latitude and longitude must be proposed together")
        return self


class CourtEditSuggestionRequest(BaseModel):
    """Request to suggest moderated edits to a court."""

    model_config = ConfigDict(extra="forbid")

    changes: CourtEditSuggestionChanges
    note: Optional[str] = Field(default=None, max_length=280)


class CourtEditSuggestionResolutionRequest(BaseModel):
    """Optional selected proposal fields for a partial moderation decision."""

    model_config = ConfigDict(extra="forbid")

    applied_changes: Optional[CourtEditSuggestionChanges] = None


class CourtEditSuggestionResponse(BaseModel):
    """Response for a court edit suggestion."""

    id: int
    court_id: int
    suggested_by: int
    suggester_name: Optional[str] = None
    changes: dict
    applied_changes: Optional[dict] = None
    note: Optional[str] = None
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
