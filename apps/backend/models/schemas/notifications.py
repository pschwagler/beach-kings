"""Notifications models."""

from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, field_validator


class NotificationResponse(BaseModel):
    """Notification response."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    actor_player_id: Optional[int] = None
    type: str
    title: str
    message: str
    data: Optional[dict] = None
    is_read: bool
    read_at: Optional[str] = None
    dismissed_at: Optional[str] = None
    dedup_key: Optional[str] = None
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


class UnreadCountResponse(BaseModel):
    """Unread notification count response."""

    count: int


class RegisterPushTokenRequest(BaseModel):
    """Request to register a device push token."""

    token: str
    platform: str  # "ios" or "android"
    installation_id: Optional[str] = Field(default=None, min_length=16, max_length=128)

    @field_validator("platform")
    @classmethod
    def validate_platform(cls, v: str) -> str:
        """Validate platform is ios or android."""
        if v not in ("ios", "android"):
            raise ValueError("platform must be 'ios' or 'android'")
        return v

    @field_validator("token")
    @classmethod
    def validate_token(cls, v: str) -> str:
        """Validate token is not empty and looks like an Expo push token."""
        v = v.strip()
        if not v:
            raise ValueError("token must not be empty")
        if not v.startswith("ExponentPushToken["):
            raise ValueError("token must be a valid Expo push token")
        return v


class PushTokenResponse(BaseModel):
    """Response after registering a push token."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    token: str
    platform: str
    installation_id: Optional[str] = None
    unregister_secret: Optional[str] = None
    created_at: str


class UnregisterPushInstallationRequest(BaseModel):
    """Credentialed installation retirement after an auth session expires."""

    installation_id: str = Field(min_length=16, max_length=128)
    unregister_secret: str = Field(min_length=32, max_length=255)


class PushPrefsResponse(BaseModel):
    """Response schema for GET /api/users/me/push-prefs.

    Returns the full push notification preference row. When no DB row
    exists for the authenticated user, the service returns all defaults.
    """

    push_enabled: bool
    direct_messages: bool
    league_messages: bool
    friend_requests: bool
    match_invites: bool
    tournament_updates: bool
    ranking_changes: bool


class PushPrefsUpdate(BaseModel):
    """Request schema for PATCH /api/users/me/push-prefs.

    All fields are optional. Only provided fields are applied (partial
    update / upsert semantics).
    """

    push_enabled: Optional[bool] = None
    direct_messages: Optional[bool] = None
    league_messages: Optional[bool] = None
    friend_requests: Optional[bool] = None
    match_invites: Optional[bool] = None
    tournament_updates: Optional[bool] = None
    ranking_changes: Optional[bool] = None
