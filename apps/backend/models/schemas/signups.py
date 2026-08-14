"""Signups models."""

from typing import Optional, List
from pydantic import BaseModel


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
    end_date: str


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
    open_signups_at: Optional[str] = None


class SignupPlayerResponse(BaseModel):
    """Signup player response."""

    player_id: int
    player_name: str
    signed_up_at: str


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
    players: Optional[List[SignupPlayerResponse]] = None


class SignupWithPlayersResponse(SignupResponse):
    """Signup response with players list."""

    players: List[SignupPlayerResponse]


class LeagueSignupItem(BaseModel):
    """A single upcoming signup event for the league signups tab."""

    id: int
    scheduled_datetime: str  # ISO UTC
    duration_hours: float
    court_name: Optional[str] = None
    player_count: int
    is_open: bool
    user_status: str


class LeagueScheduleItem(BaseModel):
    """A weekly schedule row for the league signups tab."""

    day_of_week: str  # "Monday", "Tuesday", etc.
    time_label: str  # "6:00 PM"
    court_name: Optional[str] = None


class LeagueSignupsResponse(BaseModel):
    """Aggregate response for the league signups tab."""

    signups: List[LeagueSignupItem]
    schedule: List[LeagueScheduleItem]
