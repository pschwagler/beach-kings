"""
Weekly schedule and signup CRUD operations.

Extracted from data_service.py.  Covers:
- Weekly schedule CRUD with auto-generated signup rows
- Ad-hoc signup CRUD
- Player signup / dropout with event logging
- Signup serialisation helpers
"""

from typing import List, Dict, Optional, Tuple
from datetime import datetime, date, time, timedelta
import pytz

__all__ = [
    "create_weekly_schedule",
    "get_weekly_schedules",
    "get_weekly_schedule",
    "update_weekly_schedule",
    "delete_weekly_schedule",
    "recalculate_open_signups_for_season",
    "create_signup",
    "get_signups",
    "get_signup",
    "update_signup",
    "delete_signup",
    "signup_player",
    "dropout_player",
    "get_signup_players",
    "get_signup_events",
]

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, and_

from backend.database.models import (
    Season,
    Court,
    Signup,
    SignupPlayer,
    SignupEvent,
    WeeklySchedule,
    OpenSignupsMode,
    SignupEventType,
    Player,
)
from backend.utils.datetime_utils import utcnow


# ---------------------------------------------------------------------------
# Weekly schedule CRUD
# ---------------------------------------------------------------------------


async def create_weekly_schedule(
    session: AsyncSession,
    season_id: int,
    day_of_week: int,
    start_time: str,
    duration_hours: float,
    court_id: Optional[int],
    open_signups_mode: str,
    open_signups_day_of_week: Optional[int],
    open_signups_time: Optional[str],
    start_date: str,
    end_date: str,
    creator_player_id: Optional[int] = None,
) -> Dict:
    """
    Create a weekly schedule and auto-generate signup rows.

    Validates that ``start_date`` is within the season bounds, that
    ``start_date <= end_date``, and that ``end_date`` does not exceed
    either the season end or six months from today.

    Args:
        session: Async database session.
        season_id: Season this schedule belongs to.
        day_of_week: 0 = Monday … 6 = Sunday (Python ``weekday()``).
        start_time: Session start time as ``"HH:MM"`` (UTC).
        duration_hours: Session duration in hours.
        court_id: Optional court ID for the session.
        open_signups_mode: One of the :class:`OpenSignupsMode` enum values.
        open_signups_day_of_week: Required when mode is SPECIFIC_DAY_TIME.
        open_signups_time: Required when mode is SPECIFIC_DAY_TIME (``"HH:MM"``).
        start_date: ISO date string for first occurrence.
        end_date: ISO date string for last possible occurrence.
        creator_player_id: Optional player ID of the creator.

    Returns:
        Weekly schedule dict from :func:`_weekly_schedule_to_dict`.

    Raises:
        ValueError: For invalid dates, missing season, or out-of-range end_date.
    """
    season_result = await session.execute(select(Season).where(Season.id == season_id))
    season = season_result.scalar_one_or_none()
    if not season:
        raise ValueError("Season not found")

    start_date_obj = (
        datetime.fromisoformat(start_date).date() if isinstance(start_date, str) else start_date
    )
    end_date_obj = (
        datetime.fromisoformat(end_date).date() if isinstance(end_date, str) else end_date
    )

    if start_date_obj > end_date_obj:
        raise ValueError("start_date cannot be after end_date")

    if start_date_obj < season.start_date:
        raise ValueError(
            f"start_date cannot be before season start_date ({season.start_date.isoformat()})"
        )

    max_end_date = min(date.today() + timedelta(days=180), season.end_date)
    if end_date_obj > max_end_date:
        raise ValueError(f"end_date cannot exceed {max_end_date.isoformat()}")

    schedule = WeeklySchedule(
        season_id=season_id,
        day_of_week=day_of_week,
        start_time=start_time,
        duration_hours=duration_hours,
        court_id=court_id,
        open_signups_mode=OpenSignupsMode(open_signups_mode),
        open_signups_day_of_week=open_signups_day_of_week,
        open_signups_time=open_signups_time,
        start_date=start_date_obj,
        end_date=end_date_obj,
        created_by=creator_player_id,
        updated_by=creator_player_id,
    )
    session.add(schedule)
    await session.flush()

    await _generate_signups_from_schedule(session, schedule, season)
    await recalculate_open_signups_for_season(session, season_id)

    await session.commit()
    await session.refresh(schedule)

    return _weekly_schedule_to_dict(schedule)


async def get_weekly_schedules(session: AsyncSession, season_id: int) -> List[Dict]:
    """
    Get all weekly schedules for a season.

    Args:
        session: Async database session.
        season_id: Season ID.

    Returns:
        List of weekly schedule dicts ordered by ``day_of_week`` then
        ``start_time``.
    """
    result = await session.execute(
        select(WeeklySchedule)
        .where(WeeklySchedule.season_id == season_id)
        .order_by(WeeklySchedule.day_of_week, WeeklySchedule.start_time)
    )
    schedules = result.scalars().all()
    return [_weekly_schedule_to_dict(s) for s in schedules]


async def get_weekly_schedule(session: AsyncSession, schedule_id: int) -> Optional[Dict]:
    """
    Get a weekly schedule by ID.

    Args:
        session: Async database session.
        schedule_id: Weekly schedule ID.

    Returns:
        Weekly schedule dict or None if not found.
    """
    result = await session.execute(select(WeeklySchedule).where(WeeklySchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()
    if not schedule:
        return None
    return _weekly_schedule_to_dict(schedule)


async def update_weekly_schedule(
    session: AsyncSession,
    schedule_id: int,
    day_of_week: Optional[int] = None,
    start_time: Optional[str] = None,
    duration_hours: Optional[float] = None,
    court_id: Optional[int] = None,
    open_signups_mode: Optional[str] = None,
    open_signups_day_of_week: Optional[int] = None,
    open_signups_time: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    updater_player_id: Optional[int] = None,
) -> Optional[Dict]:
    """
    Update a weekly schedule and regenerate future signups.

    Only future signups (after the end of the current Mon-Sun week) are
    deleted and re-created; current-week signups are preserved.

    Args:
        session: Async database session.
        schedule_id: Weekly schedule ID to update.
        day_of_week: Optional new day of week.
        start_time: Optional new start time ``"HH:MM"``.
        duration_hours: Optional new duration.
        court_id: Optional new court ID.
        open_signups_mode: Optional new signup open mode.
        open_signups_day_of_week: Optional new signup open day.
        open_signups_time: Optional new signup open time.
        start_date: Optional new start date (ISO string).
        end_date: Optional new end date (ISO string).
        updater_player_id: Optional player ID of the updater.

    Returns:
        Updated weekly schedule dict, or None if not found.

    Raises:
        ValueError: For invalid date ranges or missing season.
    """
    result = await session.execute(select(WeeklySchedule).where(WeeklySchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()
    if not schedule:
        return None

    season_result = await session.execute(select(Season).where(Season.id == schedule.season_id))
    season = season_result.scalar_one_or_none()
    if not season:
        raise ValueError("Season not found")

    if day_of_week is not None:
        schedule.day_of_week = day_of_week
    if start_time is not None:
        schedule.start_time = start_time
    if duration_hours is not None:
        schedule.duration_hours = duration_hours
    if court_id is not None:
        schedule.court_id = court_id
    if open_signups_mode is not None:
        schedule.open_signups_mode = OpenSignupsMode(open_signups_mode)
    if open_signups_day_of_week is not None:
        schedule.open_signups_day_of_week = open_signups_day_of_week
    if open_signups_time is not None:
        schedule.open_signups_time = open_signups_time
    if start_date is not None:
        start_date_obj = (
            datetime.fromisoformat(start_date).date()
            if isinstance(start_date, str)
            else start_date
        )
        if start_date_obj < season.start_date:
            raise ValueError(
                f"start_date cannot be before season start_date ({season.start_date.isoformat()})"
            )
        if schedule.end_date and start_date_obj > schedule.end_date:
            raise ValueError("start_date cannot be after end_date")
        schedule.start_date = start_date_obj
    if end_date is not None:
        end_date_obj = (
            datetime.fromisoformat(end_date).date() if isinstance(end_date, str) else end_date
        )
        max_end_date = min(date.today() + timedelta(days=180), season.end_date)
        if end_date_obj > max_end_date:
            raise ValueError(f"end_date cannot exceed {max_end_date.isoformat()}")
        if schedule.start_date and end_date_obj < schedule.start_date:
            raise ValueError("end_date cannot be before start_date")
        schedule.end_date = end_date_obj

    if updater_player_id is not None:
        schedule.updated_by = updater_player_id

    # Preserve current-week signups; delete only future weeks.
    today = date.today()
    days_since_monday = today.weekday()
    current_week_monday = today - timedelta(days=days_since_monday)
    current_week_sunday = current_week_monday + timedelta(days=6)

    utc = pytz.UTC
    current_week_sunday_end = utc.localize(datetime.combine(current_week_sunday, time(23, 59, 59)))

    await session.execute(
        delete(Signup).where(
            and_(
                Signup.weekly_schedule_id == schedule_id,
                Signup.scheduled_datetime > current_week_sunday_end,
            )
        ),
        execution_options={"synchronize_session": False},
    )
    await _generate_signups_from_schedule(session, schedule, season, skip_current_week=True)
    await recalculate_open_signups_for_season(session, schedule.season_id)

    await session.commit()
    await session.refresh(schedule)

    return _weekly_schedule_to_dict(schedule)


async def delete_weekly_schedule(session: AsyncSession, schedule_id: int) -> bool:
    """
    Delete a weekly schedule and its future signups only.

    Past signups are preserved for historical records.  Cascade deletes
    handle ``signup_players`` and ``signup_events`` rows of future signups.

    Args:
        session: Async database session.
        schedule_id: Weekly schedule ID.

    Returns:
        True if deleted, False if not found.
    """
    now_utc = utcnow()

    result = await session.execute(select(WeeklySchedule).where(WeeklySchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()
    if not schedule:
        return False

    await session.execute(
        delete(Signup).where(
            Signup.weekly_schedule_id == schedule_id, Signup.scheduled_datetime > now_utc
        )
    )

    await session.delete(schedule)
    await recalculate_open_signups_for_season(session, schedule.season_id)

    await session.commit()
    return True


# ---------------------------------------------------------------------------
# Internal schedule helpers
# ---------------------------------------------------------------------------


async def _generate_signups_from_schedule(
    session: AsyncSession,
    schedule: WeeklySchedule,
    season: Season,
    skip_current_week: bool = False,
) -> None:
    """
    Generate ``Signup`` rows from a ``WeeklySchedule`` for the schedule
    duration.

    Args:
        session: Async database session.
        schedule: WeeklySchedule ORM instance.
        season: Season ORM instance.
        skip_current_week: When True, skips the Mon-Sun week containing
            today and starts from next Monday.
    """
    utc = pytz.UTC
    now_utc = utcnow()

    if hasattr(schedule, "start_date") and schedule.start_date:
        base_start_date = schedule.start_date
    else:
        base_start_date = max(date.today(), season.start_date)

    if skip_current_week:
        today = date.today()
        days_since_monday = today.weekday()
        current_week_monday = today - timedelta(days=days_since_monday)
        next_monday = current_week_monday + timedelta(days=7)
        start_date = max(next_monday, base_start_date)
    else:
        start_date = base_start_date

    end_date = min(schedule.end_date, season.end_date)

    time_parts = schedule.start_time.split(":")
    start_hour = int(time_parts[0])
    start_minute = int(time_parts[1]) if len(time_parts) > 1 else 0

    current_date = start_date
    while current_date <= end_date:
        if current_date.weekday() == schedule.day_of_week:
            scheduled_datetime = utc.localize(
                datetime.combine(current_date, time(start_hour, start_minute))
            )

            open_signups_at = await _calculate_open_signups_at(
                session, schedule, scheduled_datetime, season
            )

            if scheduled_datetime >= now_utc.replace(hour=0, minute=0, second=0, microsecond=0):
                signup = Signup(
                    season_id=schedule.season_id,
                    scheduled_datetime=scheduled_datetime,
                    duration_hours=schedule.duration_hours,
                    court_id=schedule.court_id,
                    open_signups_at=open_signups_at,
                    weekly_schedule_id=schedule.id,
                    created_by=schedule.created_by,
                    updated_by=schedule.updated_by,
                )
                session.add(signup)
                await session.flush()

        current_date += timedelta(days=1)

    await session.flush()


def _get_previous_calendar_week_range(
    scheduled_datetime: datetime,
) -> Tuple[datetime, datetime]:
    """
    Return the UTC start and end (exclusive) of the calendar week
    preceding ``scheduled_datetime``.

    Args:
        scheduled_datetime: Timezone-aware UTC datetime.

    Returns:
        ``(prev_monday_00:00, current_monday_00:00)`` both UTC-aware.
    """
    utc = pytz.UTC
    sched_date = scheduled_datetime.date()
    days_since_monday = sched_date.weekday()
    current_week_monday_date = sched_date - timedelta(days=days_since_monday)
    prev_week_monday_date = current_week_monday_date - timedelta(days=7)

    prev_week_start = utc.localize(datetime.combine(prev_week_monday_date, time(0, 0, 0)))
    current_week_start = utc.localize(datetime.combine(current_week_monday_date, time(0, 0, 0)))

    return prev_week_start, current_week_start


async def _calculate_open_signups_at(
    session: AsyncSession,
    schedule: WeeklySchedule,
    scheduled_datetime: datetime,
    season: Season,
) -> Optional[datetime]:
    """
    Calculate when signups should open for a scheduled datetime.

    Modes:
    - ``ALWAYS_OPEN``: returns ``None`` (no restriction).
    - ``SPECIFIC_DAY_TIME``: returns the matching weekday in the prior week
      at the configured time.
    - ``AUTO_AFTER_LAST_SESSION``: returns the end time of the last signup
      in the previous calendar week, or ``None`` if none exists.

    Args:
        session: Async database session.
        schedule: WeeklySchedule ORM instance.
        scheduled_datetime: UTC datetime for the session occurrence.
        season: Season ORM instance.

    Returns:
        UTC-aware datetime or None.
    """
    utc = pytz.UTC

    if schedule.open_signups_mode == OpenSignupsMode.ALWAYS_OPEN:
        return None

    if schedule.open_signups_mode == OpenSignupsMode.SPECIFIC_DAY_TIME:
        if not schedule.open_signups_day_of_week or not schedule.open_signups_time:
            return None

        time_parts = schedule.open_signups_time.split(":")
        open_hour = int(time_parts[0])
        open_minute = int(time_parts[1]) if len(time_parts) > 1 else 0

        target_date = scheduled_datetime.date() - timedelta(days=7)
        days_until_target = (schedule.open_signups_day_of_week - target_date.weekday()) % 7
        if days_until_target == 0 and target_date.weekday() != schedule.open_signups_day_of_week:
            days_until_target = 7
        open_date = target_date + timedelta(days=days_until_target)

        return utc.localize(datetime.combine(open_date, time(open_hour, open_minute)))

    # AUTO_AFTER_LAST_SESSION
    prev_week_start, current_week_start = _get_previous_calendar_week_range(scheduled_datetime)

    result = await session.execute(
        select(Signup)
        .where(
            Signup.season_id == season.id,
            Signup.scheduled_datetime >= prev_week_start,
            Signup.scheduled_datetime < current_week_start,
        )
        .order_by(Signup.scheduled_datetime.desc())
        .limit(1)
    )
    last_signup = result.scalar_one_or_none()

    if last_signup:
        return last_signup.scheduled_datetime + timedelta(hours=last_signup.duration_hours)
    return None


async def recalculate_open_signups_for_season(session: AsyncSession, season_id: int) -> None:
    """
    Recalculate ``open_signups_at`` for all future signups in a season.

    Only ``AUTO_AFTER_LAST_SESSION`` mode signups are updated.  Called
    whenever a schedule is added, updated, or deleted so that dynamic
    opening times remain consistent across all schedules.

    Args:
        session: Async database session.
        season_id: Season ID.
    """
    now_utc = utcnow()
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)

    result = await session.execute(
        select(Signup, WeeklySchedule)
        .join(WeeklySchedule, Signup.weekly_schedule_id == WeeklySchedule.id)
        .where(Signup.season_id == season_id, Signup.scheduled_datetime >= today_start)
        .order_by(Signup.scheduled_datetime.asc())
    )
    rows = result.all()

    season_result = await session.execute(select(Season).where(Season.id == season_id))
    season = season_result.scalar_one_or_none()
    if not season:
        return

    for signup, schedule in rows:
        if schedule.open_signups_mode == OpenSignupsMode.AUTO_AFTER_LAST_SESSION:
            new_open_at = await _calculate_open_signups_at(
                session, schedule, signup.scheduled_datetime, season
            )
            if signup.open_signups_at != new_open_at:
                signup.open_signups_at = new_open_at
                session.add(signup)

    await session.flush()


def _weekly_schedule_to_dict(schedule: WeeklySchedule) -> Dict:
    """
    Convert a ``WeeklySchedule`` ORM instance to a plain dict.

    Args:
        schedule: WeeklySchedule ORM instance.

    Returns:
        Dict with all public fields serialised to JSON-safe types.
    """
    return {
        "id": schedule.id,
        "season_id": schedule.season_id,
        "day_of_week": schedule.day_of_week,
        "start_time": schedule.start_time,
        "duration_hours": schedule.duration_hours,
        "court_id": schedule.court_id,
        "open_signups_mode": schedule.open_signups_mode.value,
        "open_signups_day_of_week": schedule.open_signups_day_of_week,
        "open_signups_time": schedule.open_signups_time,
        "start_date": schedule.start_date.isoformat() if schedule.start_date else None,
        "end_date": schedule.end_date.isoformat() if schedule.end_date else None,
        "created_at": schedule.created_at.isoformat() if schedule.created_at else None,
        "updated_at": schedule.updated_at.isoformat() if schedule.updated_at else None,
    }


# ---------------------------------------------------------------------------
# Ad-hoc signup CRUD
# ---------------------------------------------------------------------------


async def create_signup(
    session: AsyncSession,
    season_id: int,
    scheduled_datetime: str,
    duration_hours: float,
    court_id: Optional[int],
    open_signups_at: Optional[str] = None,
    creator_player_id: Optional[int] = None,
) -> Dict:
    """
    Create an ad-hoc (non-schedule) signup.

    Args:
        session: Async database session.
        season_id: Season ID.
        scheduled_datetime: ISO datetime string (UTC or with TZ offset).
        duration_hours: Duration in hours.
        court_id: Optional court ID.
        open_signups_at: Optional ISO datetime when signups open.
            ``None`` = always open.
        creator_player_id: Optional player ID of the creator.

    Returns:
        Signup dict from :func:`_signup_to_dict`.

    Raises:
        ValueError: If ``open_signups_at`` is in the past.
    """
    utc = pytz.UTC
    now_utc = utcnow()

    scheduled_dt = datetime.fromisoformat(scheduled_datetime.replace("Z", "+00:00"))
    if scheduled_dt.tzinfo is None:
        scheduled_dt = utc.localize(scheduled_dt)

    if open_signups_at is None:
        open_dt = None
    else:
        open_dt = datetime.fromisoformat(open_signups_at.replace("Z", "+00:00"))
        if open_dt.tzinfo is None:
            open_dt = utc.localize(open_dt)
        if open_dt < now_utc:
            raise ValueError("open_signups_at cannot be in the past")

    signup = Signup(
        season_id=season_id,
        scheduled_datetime=scheduled_dt,
        duration_hours=duration_hours,
        court_id=court_id,
        open_signups_at=open_dt,
        created_by=creator_player_id,
        updated_by=creator_player_id,
    )
    session.add(signup)
    await session.commit()
    await session.refresh(signup)

    return await _signup_to_dict(session, signup)


async def get_signups(
    session: AsyncSession,
    season_id: int,
    upcoming_only: bool = False,
    past_only: bool = False,
    include_players: bool = False,
) -> List[Dict]:
    """
    Get signups for a season with optional temporal filtering.

    Args:
        session: Async database session.
        season_id: Season ID.
        upcoming_only: When True, only return future signups.
        past_only: When True, only return past signups.
        include_players: When True, include the signed-up players list.

    Returns:
        List of signup dicts ordered by ``scheduled_datetime`` ascending.
    """
    now_utc = utcnow()

    if include_players:
        query = (
            select(
                Signup,
                SignupPlayer.player_id,
                Player.full_name.label("player_name"),
                SignupPlayer.signed_up_at,
            )
            .select_from(Signup)
            .outerjoin(SignupPlayer, Signup.id == SignupPlayer.signup_id)
            .outerjoin(Player, SignupPlayer.player_id == Player.id)
            .where(Signup.season_id == season_id)
        )

        if upcoming_only:
            query = query.where(Signup.scheduled_datetime >= now_utc)
        elif past_only:
            query = query.where(Signup.scheduled_datetime < now_utc)

        query = query.order_by(Signup.scheduled_datetime.asc(), SignupPlayer.signed_up_at.asc())

        result = await session.execute(query)
        rows = result.all()

        signups_dict: Dict = {}
        for row in rows:
            signup = row[0]
            player_id = row[1]
            player_name = row[2]
            signed_up_at = row[3]

            if signup.id not in signups_dict:
                signups_dict[signup.id] = {"signup": signup, "players": []}

            if player_id is not None and player_name is not None:
                signups_dict[signup.id]["players"].append(
                    {
                        "player_id": player_id,
                        "player_name": player_name,
                        "signed_up_at": signed_up_at.isoformat() if signed_up_at else None,
                    }
                )

        return [
            await _signup_to_dict_with_players(session, data["signup"], data["players"])
            for data in signups_dict.values()
        ]
    else:
        query = select(Signup).where(Signup.season_id == season_id)

        if upcoming_only:
            query = query.where(Signup.scheduled_datetime >= now_utc)
        elif past_only:
            query = query.where(Signup.scheduled_datetime < now_utc)

        query = query.order_by(Signup.scheduled_datetime.asc())

        result = await session.execute(query)
        signups = result.scalars().all()

        return [await _signup_to_dict(session, s, include_players=False) for s in signups]


async def get_signup(
    session: AsyncSession, signup_id: int, include_players: bool = False
) -> Optional[Dict]:
    """
    Get a signup by ID.

    Args:
        session: Async database session.
        signup_id: Signup ID.
        include_players: When True, include the signed-up players list.

    Returns:
        Signup dict or None if not found.
    """
    result = await session.execute(select(Signup).where(Signup.id == signup_id))
    signup = result.scalar_one_or_none()
    if not signup:
        return None
    return await _signup_to_dict(session, signup, include_players=include_players)


async def update_signup(
    session: AsyncSession,
    signup_id: int,
    scheduled_datetime: Optional[str] = None,
    duration_hours: Optional[float] = None,
    court_id: Optional[int] = None,
    open_signups_at: Optional[str] = None,
    updater_player_id: Optional[int] = None,
) -> Optional[Dict]:
    """
    Update a signup.

    Args:
        session: Async database session.
        signup_id: Signup ID.
        scheduled_datetime: Optional new ISO datetime.
        duration_hours: Optional new duration.
        court_id: Optional new court ID.
        open_signups_at: Optional new open-signups datetime.
        updater_player_id: Optional player ID of the updater.

    Returns:
        Updated signup dict or None if not found.

    Raises:
        ValueError: If ``open_signups_at`` is in the past.
    """
    utc = pytz.UTC
    now_utc = utcnow()

    result = await session.execute(select(Signup).where(Signup.id == signup_id))
    signup = result.scalar_one_or_none()
    if not signup:
        return None

    if scheduled_datetime is not None:
        scheduled_dt = datetime.fromisoformat(scheduled_datetime.replace("Z", "+00:00"))
        if scheduled_dt.tzinfo is None:
            scheduled_dt = utc.localize(scheduled_dt)
        signup.scheduled_datetime = scheduled_dt

    if duration_hours is not None:
        signup.duration_hours = duration_hours

    if court_id is not None:
        signup.court_id = court_id

    if open_signups_at is not None:
        open_dt = datetime.fromisoformat(open_signups_at.replace("Z", "+00:00"))
        if open_dt.tzinfo is None:
            open_dt = utc.localize(open_dt)
        if open_dt < now_utc:
            raise ValueError("open_signups_at cannot be in the past")
        signup.open_signups_at = open_dt

    if updater_player_id is not None:
        signup.updated_by = updater_player_id

    await session.commit()
    await session.refresh(signup)

    return await _signup_to_dict(session, signup)


async def delete_signup(session: AsyncSession, signup_id: int) -> bool:
    """
    Delete a signup.

    Args:
        session: Async database session.
        signup_id: Signup ID.

    Returns:
        True if deleted, False if not found.
    """
    result = await session.execute(select(Signup).where(Signup.id == signup_id))
    signup = result.scalar_one_or_none()
    if not signup:
        return False

    await session.delete(signup)
    await session.commit()
    return True


# ---------------------------------------------------------------------------
# Player signup / dropout
# ---------------------------------------------------------------------------


async def signup_player(
    session: AsyncSession,
    signup_id: int,
    player_id: int,
    creator_player_id: Optional[int] = None,
) -> bool:
    """
    Add a player to a signup and log a SIGNUP event.

    Args:
        session: Async database session.
        signup_id: Signup ID.
        player_id: Player ID to add.
        creator_player_id: Player acting on behalf of (defaults to
            ``player_id``).

    Returns:
        True if added, False if already signed up.

    Raises:
        ValueError: If signup not found or signups are not yet open.
    """
    now_utc = utcnow()

    result = await session.execute(select(Signup).where(Signup.id == signup_id))
    signup = result.scalar_one_or_none()
    if not signup:
        raise ValueError("Signup not found")

    if signup.open_signups_at is not None and signup.open_signups_at > now_utc:
        raise ValueError("Signups are not yet open for this session")

    existing = await session.execute(
        select(SignupPlayer).where(
            SignupPlayer.signup_id == signup_id, SignupPlayer.player_id == player_id
        )
    )
    if existing.scalar_one_or_none():
        return False

    session.add(SignupPlayer(signup_id=signup_id, player_id=player_id))
    session.add(
        SignupEvent(
            signup_id=signup_id,
            player_id=player_id,
            event_type=SignupEventType.SIGNUP,
            created_by=creator_player_id or player_id,
        )
    )
    await session.commit()
    return True


async def dropout_player(
    session: AsyncSession,
    signup_id: int,
    player_id: int,
    creator_player_id: Optional[int] = None,
) -> bool:
    """
    Remove a player from a signup and log a DROPOUT event.

    Args:
        session: Async database session.
        signup_id: Signup ID.
        player_id: Player ID to remove.
        creator_player_id: Player acting on behalf of (defaults to
            ``player_id``).

    Returns:
        True if removed, False if player was not signed up.

    Raises:
        ValueError: If signup not found or signups are not yet open.
    """
    now_utc = utcnow()

    result = await session.execute(select(Signup).where(Signup.id == signup_id))
    signup = result.scalar_one_or_none()
    if not signup:
        raise ValueError("Signup not found")

    if signup.open_signups_at is not None and signup.open_signups_at > now_utc:
        raise ValueError("Signups are not yet open for this session")

    del_result = await session.execute(
        delete(SignupPlayer).where(
            SignupPlayer.signup_id == signup_id, SignupPlayer.player_id == player_id
        )
    )
    if del_result.rowcount == 0:
        return False

    session.add(
        SignupEvent(
            signup_id=signup_id,
            player_id=player_id,
            event_type=SignupEventType.DROPOUT,
            created_by=creator_player_id or player_id,
        )
    )
    await session.commit()
    return True


async def get_signup_players(session: AsyncSession, signup_id: int) -> List[Dict]:
    """
    Get all players signed up for a signup.

    Args:
        session: Async database session.
        signup_id: Signup ID.

    Returns:
        List of dicts with ``player_id``, ``player_name``, ``signed_up_at``,
        ordered by signup time ascending.
    """
    result = await session.execute(
        select(SignupPlayer, Player)
        .join(Player, SignupPlayer.player_id == Player.id)
        .where(SignupPlayer.signup_id == signup_id)
        .order_by(SignupPlayer.signed_up_at.asc())
    )
    rows = result.all()
    return [
        {
            "player_id": sp.player_id,
            "player_name": p.full_name,
            "signed_up_at": sp.signed_up_at.isoformat() if sp.signed_up_at else None,
        }
        for sp, p in rows
    ]


async def get_signup_events(session: AsyncSession, signup_id: int) -> List[Dict]:
    """
    Get the event log for a signup.

    Args:
        session: Async database session.
        signup_id: Signup ID.

    Returns:
        List of event dicts ordered by ``created_at`` descending.
    """
    result = await session.execute(
        select(SignupEvent, Player)
        .join(Player, SignupEvent.player_id == Player.id)
        .where(SignupEvent.signup_id == signup_id)
        .order_by(SignupEvent.created_at.desc())
    )
    rows = result.all()
    return [
        {
            "id": event.id,
            "player_id": event.player_id,
            "player_name": p.full_name,
            "event_type": event.event_type.value,
            "created_at": event.created_at.isoformat() if event.created_at else None,
            "created_by": event.created_by,
        }
        for event, p in rows
    ]


# ---------------------------------------------------------------------------
# Signup serialisation helpers
# ---------------------------------------------------------------------------


async def _signup_to_dict(
    session: AsyncSession, signup: Signup, include_players: bool = False
) -> Dict:
    """
    Convert a ``Signup`` ORM instance to a plain dict.

    Computes ``is_open`` (``open_signups_at`` is NULL or in the past) and
    ``is_past`` (``scheduled_datetime`` is before now).

    Args:
        session: Async database session.
        signup: Signup ORM instance.
        include_players: When True, attach the players list.

    Returns:
        Signup dict with computed fields.
    """
    utc = pytz.UTC
    now_utc = utcnow()

    count_result = await session.execute(
        select(func.count(SignupPlayer.player_id)).where(SignupPlayer.signup_id == signup.id)
    )
    player_count = count_result.scalar() or 0

    court_name = None
    court_slug = None
    if signup.court_id:
        court_result = await session.execute(
            select(Court.name, Court.slug).where(Court.id == signup.court_id)
        )
        court_row = court_result.one_or_none()
        if court_row:
            court_name, court_slug = court_row

    scheduled_dt = signup.scheduled_datetime
    if scheduled_dt and scheduled_dt.tzinfo is None:
        scheduled_dt = utc.localize(scheduled_dt)

    open_at = signup.open_signups_at
    if open_at and open_at.tzinfo is None:
        open_at = utc.localize(open_at)

    is_open = open_at is None or open_at <= now_utc
    is_past = scheduled_dt < now_utc

    result: Dict = {
        "id": signup.id,
        "season_id": signup.season_id,
        "scheduled_datetime": signup.scheduled_datetime.isoformat()
        if signup.scheduled_datetime
        else None,
        "duration_hours": signup.duration_hours,
        "court_id": signup.court_id,
        "court_name": court_name,
        "court_slug": court_slug,
        "open_signups_at": signup.open_signups_at.isoformat() if signup.open_signups_at else None,
        "weekly_schedule_id": signup.weekly_schedule_id,
        "player_count": player_count,
        "is_open": is_open,
        "is_past": is_past,
        "created_at": signup.created_at.isoformat() if signup.created_at else None,
        "updated_at": signup.updated_at.isoformat() if signup.updated_at else None,
    }

    if include_players:
        result["players"] = await get_signup_players(session, signup.id)

    return result


async def _signup_to_dict_with_players(
    session: AsyncSession, signup: Signup, players: List[Dict]
) -> Dict:
    """
    Convert a ``Signup`` ORM instance to a dict with pre-loaded players.

    Avoids the N+1 ``get_signup_players`` call when players are already
    joined in the parent query.

    Args:
        session: Async database session.
        signup: Signup ORM instance.
        players: Pre-loaded list of player dicts.

    Returns:
        Signup dict with the ``players`` key populated.
    """
    now_utc = utcnow()

    court_name = None
    court_slug = None
    if signup.court_id:
        court_result = await session.execute(
            select(Court.name, Court.slug).where(Court.id == signup.court_id)
        )
        court_row = court_result.one_or_none()
        if court_row:
            court_name, court_slug = court_row

    is_open = signup.open_signups_at is None or signup.open_signups_at <= now_utc
    is_past = signup.scheduled_datetime < now_utc

    return {
        "id": signup.id,
        "season_id": signup.season_id,
        "scheduled_datetime": signup.scheduled_datetime.isoformat()
        if signup.scheduled_datetime
        else None,
        "duration_hours": signup.duration_hours,
        "court_id": signup.court_id,
        "court_name": court_name,
        "court_slug": court_slug,
        "open_signups_at": signup.open_signups_at.isoformat() if signup.open_signups_at else None,
        "weekly_schedule_id": signup.weekly_schedule_id,
        "player_count": len(players),
        "is_open": is_open,
        "is_past": is_past,
        "created_at": signup.created_at.isoformat() if signup.created_at else None,
        "updated_at": signup.updated_at.isoformat() if signup.updated_at else None,
        "players": players,
    }
