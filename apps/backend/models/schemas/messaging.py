"""Messaging models."""

from typing import Optional
from pydantic import BaseModel, ConfigDict


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
    moderation_visibility: str = "visible"
    collapsed_for_viewer: bool = False


class FeedbackCreate(BaseModel):
    """Request to create feedback."""

    feedback_text: str
    category: str = "feedback"  # "feedback" or "support"
    email: Optional[str] = None


class FeedbackResponse(BaseModel):
    """Feedback response."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: Optional[int] = None
    feedback_text: str
    category: str = "feedback"
    email: Optional[str] = None
    is_resolved: bool
    created_at: str
    user_name: Optional[str] = None
