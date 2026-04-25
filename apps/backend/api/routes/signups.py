"""Weekly schedule and signup route handlers."""

import logging
from datetime import datetime
from typing import List, Optional

import pytz
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.db import get_db_session
from backend.database.models import Player, Season, Court
from backend.services import data_service
from backend.api.auth_dependencies import (
    get_current_user_optional,
    require_user,
    make_require_league_admin_from_season,
    make_require_league_member_from_season,
    make_require_league_admin_from_schedule,
    make_require_league_admin_from_signup,
)
from backend.models.schemas import (
    WeeklyScheduleCreate,
    WeeklyScheduleResponse,
    WeeklyScheduleUpdate,
    SignupCreate,
    SignupResponse,
    SignupUpdate,
    SignupWithPlayersResponse,
    LeagueSignupsResponse,
    LeagueSignupItem,
    LeagueScheduleItem,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# League signups aggregate endpoint
# ---------------------------------------------------------------------------

_DAY_NAMES = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
]


def _format_time_label(time_str: str) -> str:
    """Convert HH:MM to a human-readable label such as '6:00 PM'.

    Args:
        time_str: Time string in ``"HH:MM"`` format.

    Returns:
        Formatted 12-hour time string, e.g. ``"6:00 PM"``.
    """
    try:
        t = datetime.strptime(time_str, "%H:%M")
        return t.strftime("%-I:%M %p").lstrip("0") or "12:00 AM"
    except (ValueError, AttributeError):
        return time_str


@router.get("/api/leagues/{league_id}/signups", response_model=LeagueSignupsResponse)
async def get_league_signups(
    league_id: int,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Return upcoming signups and the weekly schedule for a league's active season.

    Finds the active season for the league (the season whose start_date <= today
    <= end_date), then aggregates upcoming signups (with user sign-up status) and
    the weekly schedule rows.  Returns empty lists when no active season exists.

    Args:
        league_id: ID of the league.
        user: Authenticated user dict from ``require_user``.
        session: Async database session.

    Returns:
        :class:`LeagueSignupsResponse` with ``signups`` and ``schedule`` lists.
    """
    try:
        # Resolve the current player from the auth user.
        player_result = await session.execute(
            select(Player).where(Player.user_id == user["id"])
        )
        player = player_result.scalar_one_or_none()
        if not player:
            raise HTTPException(status_code=404, detail="Player not found for user")

        # Find the active season by date bounds (no is_active column on Season).
        from datetime import date as date_type

        today = date_type.today()
        season_result = await session.execute(
            select(Season)
            .where(
                and_(
                    Season.league_id == league_id,
                    Season.start_date <= today,
                    Season.end_date >= today,
                )
            )
            .order_by(Season.created_at.desc())
            .limit(1)
        )
        active_season = season_result.scalar_one_or_none()

        if not active_season:
            return LeagueSignupsResponse(signups=[], schedule=[])

        # Fetch upcoming signups with players included.
        raw_signups = await data_service.get_signups(
            session,
            active_season.id,
            upcoming_only=True,
            include_players=True,
        )

        current_player_id = player.id

        signup_items: List[LeagueSignupItem] = []
        for s in raw_signups:
            players_list = s.get("players") or []
            signed_up = any(p["player_id"] == current_player_id for p in players_list)
            signup_items.append(
                LeagueSignupItem(
                    id=s["id"],
                    scheduled_datetime=s["scheduled_datetime"],
                    duration_hours=s["duration_hours"],
                    court_name=s.get("court_name"),
                    player_count=s["player_count"],
                    is_open=s["is_open"],
                    user_status="signed_up" if signed_up else "none",
                )
            )

        # Fetch weekly schedules and resolve court names.
        raw_schedules = await data_service.get_weekly_schedules(session, active_season.id)

        schedule_items: List[LeagueScheduleItem] = []
        for sched in raw_schedules:
            court_name: Optional[str] = None
            if sched.get("court_id"):
                court_result = await session.execute(
                    select(Court.name).where(Court.id == sched["court_id"])
                )
                court_row = court_result.scalar_one_or_none()
                court_name = court_row

            day_int = sched.get("day_of_week", 0)
            day_name = _DAY_NAMES[day_int] if 0 <= day_int <= 6 else str(day_int)
            time_label = _format_time_label(sched.get("start_time", ""))

            schedule_items.append(
                LeagueScheduleItem(
                    day_of_week=day_name,
                    time_label=time_label,
                    court_name=court_name,
                )
            )

        return LeagueSignupsResponse(signups=signup_items, schedule=schedule_items)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching league signups: {str(e)}"
        )


# ---------------------------------------------------------------------------
# Weekly Schedule endpoints
# ---------------------------------------------------------------------------


@router.post("/api/seasons/{season_id}/weekly-schedules", response_model=WeeklyScheduleResponse)
async def create_weekly_schedule(
    season_id: int,
    payload: WeeklyScheduleCreate,
    user: dict = Depends(make_require_league_admin_from_season()),
    session: AsyncSession = Depends(get_db_session),
):
    """Create a weekly schedule (admin only)."""
    try:
        result = await session.execute(select(Player).where(Player.user_id == user["id"]))
        player = result.scalar_one_or_none()
        if not player:
            raise HTTPException(status_code=404, detail="Player not found for user")

        schedule = await data_service.create_weekly_schedule(
            session=session,
            season_id=season_id,
            day_of_week=payload.day_of_week,
            start_time=payload.start_time,
            duration_hours=payload.duration_hours,
            court_id=payload.court_id,
            open_signups_mode=payload.open_signups_mode,
            open_signups_day_of_week=payload.open_signups_day_of_week,
            open_signups_time=payload.open_signups_time,
            start_date=payload.start_date,
            end_date=payload.end_date,
            creator_player_id=player.id,
        )
        return schedule
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating weekly schedule: {str(e)}")


@router.get(
    "/api/seasons/{season_id}/weekly-schedules", response_model=List[WeeklyScheduleResponse]
)
async def list_weekly_schedules(
    season_id: int,
    user: dict = Depends(make_require_league_member_from_season()),
    session: AsyncSession = Depends(get_db_session),
):
    """List weekly schedules for a season."""
    try:
        return await data_service.get_weekly_schedules(session, season_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing weekly schedules: {str(e)}")


@router.put("/api/weekly-schedules/{schedule_id}", response_model=WeeklyScheduleResponse)
async def update_weekly_schedule(
    schedule_id: int,
    payload: WeeklyScheduleUpdate,
    user: dict = Depends(make_require_league_admin_from_schedule()),
    session: AsyncSession = Depends(get_db_session),
):
    """Update a weekly schedule (admin only)."""
    try:
        result = await session.execute(select(Player).where(Player.user_id == user["id"]))
        player = result.scalar_one_or_none()
        if not player:
            raise HTTPException(status_code=404, detail="Player not found for user")

        schedule = await data_service.update_weekly_schedule(
            session=session,
            schedule_id=schedule_id,
            day_of_week=payload.day_of_week,
            start_time=payload.start_time,
            duration_hours=payload.duration_hours,
            court_id=payload.court_id,
            open_signups_mode=payload.open_signups_mode,
            open_signups_day_of_week=payload.open_signups_day_of_week,
            open_signups_time=payload.open_signups_time,
            start_date=payload.start_date,
            end_date=payload.end_date,
            updater_player_id=player.id,
        )
        if not schedule:
            raise HTTPException(status_code=404, detail="Weekly schedule not found")
        return schedule
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating weekly schedule: {str(e)}")


@router.delete("/api/weekly-schedules/{schedule_id}")
async def delete_weekly_schedule(
    schedule_id: int,
    user: dict = Depends(make_require_league_admin_from_schedule()),
    session: AsyncSession = Depends(get_db_session),
):
    """Delete a weekly schedule (admin only)."""
    try:
        success = await data_service.delete_weekly_schedule(session, schedule_id)
        if not success:
            raise HTTPException(status_code=404, detail="Weekly schedule not found")
        return {"status": "success", "message": "Weekly schedule deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting weekly schedule: {str(e)}")


# ---------------------------------------------------------------------------
# Signup endpoints
# ---------------------------------------------------------------------------


@router.post("/api/seasons/{season_id}/signups", response_model=SignupResponse)
async def create_signup(
    season_id: int,
    payload: SignupCreate,
    user: dict = Depends(make_require_league_member_from_season()),
    session: AsyncSession = Depends(get_db_session),
):
    """Create an ad-hoc signup (league member)."""
    try:
        result = await session.execute(select(Player).where(Player.user_id == user["id"]))
        player = result.scalar_one_or_none()
        if not player:
            raise HTTPException(status_code=404, detail="Player not found for user")

        signup = await data_service.create_signup(
            session=session,
            season_id=season_id,
            scheduled_datetime=payload.scheduled_datetime,
            duration_hours=payload.duration_hours,
            court_id=payload.court_id,
            open_signups_at=payload.open_signups_at,
            creator_player_id=player.id,
        )
        return signup
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating signup: {str(e)}")


@router.get("/api/seasons/{season_id}/signups", response_model=List[SignupResponse])
async def list_signups(
    season_id: int,
    upcoming_only: bool = False,
    past_only: bool = False,
    include_players: bool = False,
    user: Optional[dict] = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_db_session),
):
    """List signups for a season. Public endpoint."""
    try:
        return await data_service.get_signups(
            session,
            season_id,
            upcoming_only=upcoming_only,
            past_only=past_only,
            include_players=include_players,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing signups: {str(e)}")


@router.get("/api/signups/{signup_id}", response_model=SignupWithPlayersResponse)
async def get_signup(
    signup_id: int,
    user: dict = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_db_session),
):
    """Get a signup by ID with players list. Public endpoint."""
    try:
        signup = await data_service.get_signup(session, signup_id, include_players=True)
        if not signup:
            raise HTTPException(status_code=404, detail="Signup not found")
        return signup
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting signup: {str(e)}")


@router.put("/api/signups/{signup_id}", response_model=SignupResponse)
async def update_signup(
    signup_id: int,
    payload: SignupUpdate,
    user: dict = Depends(make_require_league_admin_from_signup()),
    session: AsyncSession = Depends(get_db_session),
):
    """Update a signup (admin only)."""
    try:
        result = await session.execute(select(Player).where(Player.user_id == user["id"]))
        player = result.scalar_one_or_none()
        if not player:
            raise HTTPException(status_code=404, detail="Player not found for user")

        signup = await data_service.update_signup(
            session=session,
            signup_id=signup_id,
            scheduled_datetime=payload.scheduled_datetime,
            duration_hours=payload.duration_hours,
            court_id=payload.court_id,
            open_signups_at=payload.open_signups_at,
            updater_player_id=player.id,
        )
        if not signup:
            raise HTTPException(status_code=404, detail="Signup not found")
        return signup
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating signup: {str(e)}")


@router.delete("/api/signups/{signup_id}")
async def delete_signup(
    signup_id: int,
    user: dict = Depends(make_require_league_admin_from_signup()),
    session: AsyncSession = Depends(get_db_session),
):
    """Delete a signup (admin only)."""
    try:
        success = await data_service.delete_signup(session, signup_id)
        if not success:
            raise HTTPException(status_code=404, detail="Signup not found")
        return {"status": "success", "message": "Signup deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting signup: {str(e)}")


@router.post("/api/signups/{signup_id}/signup")
async def signup_player_endpoint(
    signup_id: int,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Player signs up for a signup."""
    try:
        result = await session.execute(select(Player).where(Player.user_id == user["id"]))
        player = result.scalar_one_or_none()
        if not player:
            raise HTTPException(status_code=404, detail="Player not found for user")

        success = await data_service.signup_player(
            session=session, signup_id=signup_id, player_id=player.id, creator_player_id=player.id
        )
        if not success:
            return {"status": "already_signed_up", "message": "Already signed up"}
        return {"status": "success", "message": "Signed up successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error signing up: {str(e)}")


@router.post("/api/signups/{signup_id}/dropout")
async def dropout_player_endpoint(
    signup_id: int,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Player drops out of a signup."""
    try:
        result = await session.execute(select(Player).where(Player.user_id == user["id"]))
        player = result.scalar_one_or_none()
        if not player:
            raise HTTPException(status_code=404, detail="Player not found for user")

        success = await data_service.dropout_player(
            session=session, signup_id=signup_id, player_id=player.id, creator_player_id=player.id
        )
        if not success:
            return {"status": "not_signed_up", "message": "Not signed up"}
        return {"status": "success", "message": "Dropped out successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error dropping out: {str(e)}")


@router.get("/api/signups/{signup_id}/players")
async def get_signup_players_endpoint(
    signup_id: int,
    user: dict = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_db_session),
):
    """Get all players signed up for a signup. Public endpoint."""
    try:
        return await data_service.get_signup_players(session, signup_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting signup players: {str(e)}")


@router.get("/api/signups/{signup_id}/events")
async def get_signup_events_endpoint(
    signup_id: int,
    user: dict = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_db_session),
):
    """Get event log for a signup. Public endpoint."""
    try:
        return await data_service.get_signup_events(session, signup_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting signup events: {str(e)}")
