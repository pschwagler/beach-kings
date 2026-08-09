"""Moderation models."""

from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, field_validator


class BlockCreate(BaseModel):
    player_id: int


class BlockedPlayerResponse(BaseModel):
    player_id: int
    full_name: str
    avatar: Optional[str] = None
    blocked_at: datetime


class ModerationReportCreate(BaseModel):
    target_type: Literal[
        "player",
        "direct_message",
        "league_message",
        "court_review",
        "court_photo",
        "court_review_photo",
    ]
    target_id: int
    reason: Literal[
        "harassment",
        "hate_discrimination",
        "threats_violence",
        "stalking_doxxing",
        "sexual_content",
        "sexual_exploitation",
        "minor_safety",
        "self_harm",
        "privacy_impersonation",
        "spam_scam",
        "other",
    ]
    details: Optional[str] = Field(default=None, max_length=1000)


class ModerationReportReceipt(BaseModel):
    id: int
    target_type: str
    target_id: int
    reason: str
    status: str
    created_at: datetime


class ModerationActionRequest(BaseModel):
    action: Literal[
        "acknowledge",
        "dismiss",
        "quarantine",
        "restore",
        "remove",
        "warn",
        "interaction_lock",
        "account_suspend",
        "account_ban",
        "account_restore",
        "grant_appeal",
        "uphold_appeal",
        "legal_hold",
    ]
    reason: str = Field(min_length=1, max_length=1000)
    lock_hours: Optional[int] = Field(default=None, ge=1, le=24 * 30)
    legal_hold: Optional[bool] = None
    appeal_id: Optional[int] = None


class ModerationAppealCreate(BaseModel):
    case_id: int
    statement: str = Field(min_length=10, max_length=2000)

    @field_validator("statement")
    @classmethod
    def validate_statement(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 10:
            raise ValueError("statement must be at least 10 characters")
        return normalized


class ModerationAppealReceipt(BaseModel):
    id: int
    case_id: int
    status: Literal["open", "granted", "upheld"]
    statement: str
    resolution_reason: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None


class AccountModerationStatusResponse(BaseModel):
    account_status: Literal["active", "suspended", "banned"]
    account_expires_at: Optional[datetime] = None
    account_case_id: Optional[int] = None
    interaction_restricted_until: Optional[datetime] = None
    interaction_restriction_case_id: Optional[int] = None
    appeals: List[ModerationAppealReceipt] = Field(default_factory=list)


class ModerationRetryRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


class ModerationEscalationRequest(BaseModel):
    channel: Literal[
        "emergency_services",
        "ncmec_cybertipline",
        "cybertip_ca",
        "us_988",
        "canada_988",
        "local_law_enforcement",
        "specialist_consultation",
    ]
    jurisdiction: Literal["united_states", "canada", "unknown"]
    external_reference: Optional[str] = Field(default=None, max_length=200)
    note: str = Field(min_length=1, max_length=2000)

    @field_validator("note")
    @classmethod
    def validate_note(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("note must not be blank")
        return normalized
