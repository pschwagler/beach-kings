"""
Unit tests for signup_data module.

Tests cover pure/synchronous functions that require no database connection:
- _get_previous_calendar_week_range: calendar week boundary calculation
- _weekly_schedule_to_dict: ORM-to-dict serialisation

Re-export smoke tests verify that data_service still exposes signup functions.
"""

import pytest
from datetime import datetime, date, time, timedelta
from unittest.mock import MagicMock
import pytz

from backend.services.signup_data import (
    _get_previous_calendar_week_range,
    _weekly_schedule_to_dict,
)
from backend.services import signup_data


# ---------------------------------------------------------------------------
# Re-export smoke tests
# ---------------------------------------------------------------------------


def test_signup_data_exports_schedule_functions():
    """signup_data should expose weekly schedule CRUD helpers."""
    for name in [
        "create_weekly_schedule",
        "get_weekly_schedules",
        "get_weekly_schedule",
        "update_weekly_schedule",
        "delete_weekly_schedule",
    ]:
        assert hasattr(signup_data, name), f"signup_data missing: {name}"


def test_signup_data_exports_signup_functions():
    """signup_data should expose ad-hoc signup CRUD helpers."""
    for name in [
        "create_signup",
        "get_signups",
        "get_signup",
        "update_signup",
        "delete_signup",
        "signup_player",
        "dropout_player",
        "get_signup_players",
        "get_signup_events",
    ]:
        assert hasattr(signup_data, name), f"signup_data missing: {name}"


def test_signup_data_exports_internal_helpers():
    """signup_data should expose internal helpers used in other modules."""
    for name in [
        "_generate_signups_from_schedule",
        "_get_previous_calendar_week_range",
        "_calculate_open_signups_at",
        "recalculate_open_signups_for_season",
        "_weekly_schedule_to_dict",
        "_signup_to_dict",
        "_signup_to_dict_with_players",
    ]:
        assert hasattr(signup_data, name), f"signup_data missing: {name}"


# ---------------------------------------------------------------------------
# _get_previous_calendar_week_range
# ---------------------------------------------------------------------------


def _utc_datetime(year, month, day, hour=0, minute=0):
    """Build a UTC-aware datetime for test inputs."""
    utc = pytz.UTC
    return utc.localize(datetime(year, month, day, hour, minute))


def test_get_previous_calendar_week_range_returns_two_mondays():
    """Should return (prev_monday_00:00, current_monday_00:00) in UTC."""
    # Wednesday 2024-01-10
    scheduled = _utc_datetime(2024, 1, 10)  # Wednesday

    prev_start, current_start = _get_previous_calendar_week_range(scheduled)

    # Current Monday should be 2024-01-08 (Monday of that week)
    assert current_start.date() == date(2024, 1, 8)
    # Previous Monday should be 2024-01-01
    assert prev_start.date() == date(2024, 1, 1)


def test_get_previous_calendar_week_range_both_results_are_utc():
    """Both returned datetimes should be UTC-aware at midnight."""
    scheduled = _utc_datetime(2024, 3, 20)  # Wednesday

    prev_start, current_start = _get_previous_calendar_week_range(scheduled)

    assert prev_start.tzinfo is not None
    assert current_start.tzinfo is not None
    assert prev_start.hour == 0
    assert prev_start.minute == 0
    assert current_start.hour == 0
    assert current_start.minute == 0


def test_get_previous_calendar_week_range_on_monday():
    """When scheduled_datetime is a Monday, current_monday should be that same day."""
    scheduled = _utc_datetime(2024, 1, 8)  # Monday

    prev_start, current_start = _get_previous_calendar_week_range(scheduled)

    assert current_start.date() == date(2024, 1, 8)
    assert prev_start.date() == date(2024, 1, 1)


def test_get_previous_calendar_week_range_on_sunday():
    """When scheduled_datetime is a Sunday, current_monday is the Monday of that week."""
    scheduled = _utc_datetime(2024, 1, 14)  # Sunday

    prev_start, current_start = _get_previous_calendar_week_range(scheduled)

    assert current_start.date() == date(2024, 1, 8)
    assert prev_start.date() == date(2024, 1, 1)


def test_get_previous_calendar_week_range_span_is_seven_days():
    """The span between prev_start and current_start must always be exactly 7 days."""
    for delta_days in range(7):
        scheduled = _utc_datetime(2024, 6, 3 + delta_days)  # Week of Jun 3 (Mon)
        prev_start, current_start = _get_previous_calendar_week_range(scheduled)
        span = current_start - prev_start
        assert span == timedelta(days=7), f"Expected 7-day span for offset {delta_days}"


# ---------------------------------------------------------------------------
# _weekly_schedule_to_dict
# ---------------------------------------------------------------------------


def _make_schedule(
    id=1,
    season_id=10,
    day_of_week=2,
    start_time="09:00",
    duration_hours=2.0,
    court_id=5,
    open_signups_mode_value="ALWAYS_OPEN",
    open_signups_day_of_week=None,
    open_signups_time=None,
    start_date=date(2024, 1, 10),
    end_date=date(2024, 3, 31),
    created_at=None,
    updated_at=None,
):
    """Build a minimal WeeklySchedule-like MagicMock."""
    schedule = MagicMock()
    schedule.id = id
    schedule.season_id = season_id
    schedule.day_of_week = day_of_week
    schedule.start_time = start_time
    schedule.duration_hours = duration_hours
    schedule.court_id = court_id

    mode_mock = MagicMock()
    mode_mock.value = open_signups_mode_value
    schedule.open_signups_mode = mode_mock

    schedule.open_signups_day_of_week = open_signups_day_of_week
    schedule.open_signups_time = open_signups_time
    schedule.start_date = start_date
    schedule.end_date = end_date
    schedule.created_at = created_at
    schedule.updated_at = updated_at
    return schedule


def test_weekly_schedule_to_dict_basic_fields():
    """All expected keys should be present and match the model attributes."""
    schedule = _make_schedule()
    result = _weekly_schedule_to_dict(schedule)

    assert result["id"] == 1
    assert result["season_id"] == 10
    assert result["day_of_week"] == 2
    assert result["start_time"] == "09:00"
    assert result["duration_hours"] == 2.0
    assert result["court_id"] == 5
    assert result["open_signups_mode"] == "ALWAYS_OPEN"
    assert result["open_signups_day_of_week"] is None
    assert result["open_signups_time"] is None


def test_weekly_schedule_to_dict_dates_are_iso():
    """start_date and end_date should be ISO-formatted strings."""
    schedule = _make_schedule(
        start_date=date(2024, 1, 10),
        end_date=date(2024, 3, 31),
    )
    result = _weekly_schedule_to_dict(schedule)

    assert result["start_date"] == "2024-01-10"
    assert result["end_date"] == "2024-03-31"


def test_weekly_schedule_to_dict_none_dates():
    """None start_date/end_date should produce None values (not raise)."""
    schedule = _make_schedule(start_date=None, end_date=None)
    result = _weekly_schedule_to_dict(schedule)

    assert result["start_date"] is None
    assert result["end_date"] is None


def test_weekly_schedule_to_dict_timestamps_iso():
    """created_at and updated_at should be ISO strings when present."""
    from datetime import timezone

    created = datetime(2024, 1, 10, 8, 0, 0, tzinfo=timezone.utc)
    updated = datetime(2024, 2, 1, 12, 30, 0, tzinfo=timezone.utc)
    schedule = _make_schedule(created_at=created, updated_at=updated)
    result = _weekly_schedule_to_dict(schedule)

    assert result["created_at"] == created.isoformat()
    assert result["updated_at"] == updated.isoformat()


def test_weekly_schedule_to_dict_none_timestamps():
    """None created_at / updated_at should map to None."""
    schedule = _make_schedule(created_at=None, updated_at=None)
    result = _weekly_schedule_to_dict(schedule)

    assert result["created_at"] is None
    assert result["updated_at"] is None


def test_weekly_schedule_to_dict_specific_day_time_fields():
    """open_signups_day_of_week and open_signups_time are preserved."""
    schedule = _make_schedule(
        open_signups_mode_value="SPECIFIC_DAY_TIME",
        open_signups_day_of_week=1,
        open_signups_time="08:00",
    )
    result = _weekly_schedule_to_dict(schedule)

    assert result["open_signups_mode"] == "SPECIFIC_DAY_TIME"
    assert result["open_signups_day_of_week"] == 1
    assert result["open_signups_time"] == "08:00"
