"""Social models."""

from datetime import datetime
from typing import Dict, Optional, List, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    moderation_visibility: str = "visible"


class InteractionCapabilityResponse(BaseModel):
    """Privacy-safe, action-specific interaction state for one player."""

    actions: Dict[str, bool]
    blocked_by_viewer: bool = False
    viewer_restricted: bool = False


def _available_interaction_capability() -> InteractionCapabilityResponse:
    return InteractionCapabilityResponse(
        actions={
            "direct_message": True,
            "friend_request": True,
            "league_invite": True,
            "session_invite": True,
            "mention": True,
            "reply": True,
            "presence": True,
            "read_receipt": True,
            "notification": True,
            "discovery": True,
            "shared_operational_content": True,
        }
    )


class InteractionCapabilityBatchRequest(BaseModel):
    player_ids: List[int] = Field(min_length=1, max_length=100)

    @field_validator("player_ids")
    @classmethod
    def unique_player_ids(cls, value: List[int]) -> List[int]:
        if len(set(value)) != len(value):
            raise ValueError("player_ids must be unique")
        return value


class InteractionCapabilityBatchResponse(BaseModel):
    capabilities: Dict[str, InteractionCapabilityResponse]


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
    capability: InteractionCapabilityResponse = Field(
        default_factory=_available_interaction_capability
    )


class ConversationListResponse(BaseModel):
    """Paginated conversation list."""

    items: List[ConversationResponse]
    total_count: int


class ThreadResponse(BaseModel):
    """Paginated thread of messages with a specific player."""

    items: List[DirectMessageResponse]
    total_count: int
    has_more: bool
    capability: InteractionCapabilityResponse = Field(
        default_factory=_available_interaction_capability
    )


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
    mutual_friends_count: int = 0
    shared_league_name: Optional[str] = None


class FriendListItem(BaseModel):
    """Single friend in the friends list."""

    id: int
    player_id: int
    full_name: str
    avatar: Optional[str] = None
    location_name: Optional[str] = None
    level: Optional[str] = None
    shared_league_name: Optional[str] = None
    last_active: Optional[str] = None


class FriendListResponse(BaseModel):
    """Paginated friends list response."""

    items: List[FriendListItem]
    total_count: int


class PlayerSearchItem(BaseModel):
    """
    Player picker search hit.

    ``tags`` are the (at most three) pills to render: any of ``in_league``,
    ``shared_league``, ``friend``, ``recent_opp``. ``score`` is the additive
    relevance score (debug/telemetry; clients keep the response order).
    ``first_name``/``last_name`` are sent so the client can render a
    last-initial etc.; ``full_name`` is the canonical display + sort string.
    ``is_guest`` flags placeholder players so the client seats them like a
    freshly added "Add New Player" guest.
    """

    id: int
    first_name: str = ""
    last_name: str = ""
    full_name: Optional[str] = None
    nickname: Optional[str] = None
    initials: str = ""
    profile_picture_url: Optional[str] = None
    tags: List[str] = []
    score: int = 0
    in_session: bool = False  # layout signal for the compact-chip group; not a pill
    is_guest: bool = False


class PlayerSearchResponse(BaseModel):
    """
    Relevance-ranked player picker response — one bounded list.

    The caller's whole network is returned ranked by score (the client
    scrolls it locally); a name term additionally appends capped score-0
    strangers. There is no pagination cursor.
    """

    items: List[PlayerSearchItem]


class FriendBatchStatusRequest(BaseModel):
    """Request to check friend status for multiple players."""

    player_ids: List[int] = Field(..., max_length=100)


class FriendRelationshipResponse(BaseModel):
    """Canonical relationship state between the viewer and another player."""

    status: Literal["self", "none", "friend", "pending_outgoing", "pending_incoming"]
    request_id: Optional[int] = None


class FriendBatchStatusResponse(BaseModel):
    """Batch friend status response."""

    statuses: dict  # { player_id: "friend"|"pending_outgoing"|"pending_incoming"|"none" }
    relationships: dict[str, FriendRelationshipResponse] = Field(default_factory=dict)
    mutual_counts: dict


class FriendSuggestionItem(BaseModel):
    """Single friend suggestion item."""

    player_id: int
    full_name: str
    avatar: Optional[str] = None
    level: Optional[str] = None
    location_name: Optional[str] = None
    shared_league_count: int = 0
    mutual_friend_count: int = 0
    shared_session_count: int = 0
    reason: str = ""


class MutualFriendItem(BaseModel):
    """Single mutual friend item."""

    player_id: int
    full_name: str
    avatar: Optional[str] = None
