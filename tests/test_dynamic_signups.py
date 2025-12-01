
import pytest
import pytz
from datetime import datetime, timedelta, date
from sqlalchemy import select
from backend.database.models import Season, League, WeeklySchedule, Signup, OpenSignupsMode
from backend.services.data_service import (
    create_weekly_schedule,
    update_weekly_schedule,
    delete_weekly_schedule,
    get_signups
)

@pytest.mark.asyncio
async def test_dynamic_signup_opening_time(session):
    # Setup
    league = League(name="Test League")
    session.add(league)
    await session.flush()
    
    season = Season(
        league_id=league.id,
        name="Test Season",
        start_date=date.today(),
        end_date=date.today() + timedelta(days=60),
        is_active=True
    )
    session.add(season)
    await session.commit()
    await session.refresh(season)
    
    # 1. Create Schedule A: Monday 12:00 (Duration 2h)
    # We'll use a day_of_week that ensures we have signups in the future
    # Let's pick a day 2 days from now to be safe
    target_date = date.today() + timedelta(days=14) # 2 weeks from now
    day_of_week = target_date.weekday()
    
    schedule_a = await create_weekly_schedule(
        session=session,
        season_id=season.id,
        day_of_week=day_of_week,
        start_time="12:00",
        duration_hours=2.0,
        court_id=None,
        open_signups_mode="auto_after_last_session",
        open_signups_day_of_week=None,
        open_signups_time=None,
        end_date=(date.today() + timedelta(days=30)).isoformat()
    )
    
    # Verify initial opening time
    # Should be based on itself (previous week)
    # Previous week session ends at 14:00 (12+2)
    # So open_signups_at should be 14:00 on the signup day (approx)
    # Note: The logic looks for "last session of previous week".
    # If this is the first week, there might be no previous session?
    # create_weekly_schedule generates signups starting from "next occurrence".
    # If we are in week 1, and target is week 3.
    # Week 2 session exists.
    # So Week 3 signup should look at Week 2 session.
    
    signups = await get_signups(session, season.id)
    signups.sort(key=lambda x: x['scheduled_datetime'])
    
    # We expect at least 2 signups (Week 1, Week 2, ...) if duration allows
    assert len(signups) >= 2
    
    # Pick a signup that is NOT the first one (so it has a previous week)
    # The first generated signup might have open_signups_at=None if no previous session exists in DB
    # But create_weekly_schedule generates from start_date.
    # Let's look at the second signup
    signup_target = signups[1]
    target_dt = datetime.fromisoformat(signup_target['scheduled_datetime'])
    open_at = datetime.fromisoformat(signup_target['open_signups_at'])
    
    # Expected open time: Same day as target_dt (since it's 7 days after prev), at 14:00
    # Wait, target_dt is Week N. Prev session is Week N-1.
    # Prev session was at 12:00, duration 2h -> ends 14:00.
    # Open time is "immediately after last session".
    # So open time should be Week N-1, 14:00.
    # Which is target_dt - 7 days + 14:00 (since target_dt is at 12:00)
    # target_dt is at 12:00.
    # open_at should be target_dt - 7 days + 2 hours.
    
    expected_open_a = target_dt - timedelta(days=7) + timedelta(hours=2)
    # Compare timestamps (ignoring timezone info difference if any, both should be UTC/offset-aware)
    assert abs((open_at - expected_open_a).total_seconds()) < 60, f"Expected {expected_open_a}, got {open_at}"
    
    # 2. Create Schedule B: Same day, 17:00 (Duration 2h)
    schedule_b = await create_weekly_schedule(
        session=session,
        season_id=season.id,
        day_of_week=day_of_week,
        start_time="17:00",
        duration_hours=2.0,
        court_id=None,
        open_signups_mode="auto_after_last_session",
        open_signups_day_of_week=None,
        open_signups_time=None,
        end_date=(date.today() + timedelta(days=30)).isoformat()
    )
    
    # Verify Signup A updated
    # Now "last session of previous week" is Schedule B (ends 19:00)
    # So open time should be Week N-1, 19:00.
    # Which is target_dt - 7 days + 7 hours (12:00 -> 19:00 is +7h difference? No)
    # target_dt is 12:00.
    # 19:00 is 12:00 + 7 hours.
    # So open_at should be target_dt - 7 days + 7 hours.
    
    # Refresh signups
    signups_updated = await get_signups(session, season.id)
    # Match by scheduled_datetime since IDs change on regeneration
    signup_target_updated = next(s for s in signups_updated if s['scheduled_datetime'] == signup_target['scheduled_datetime'])
    open_at_updated = datetime.fromisoformat(signup_target_updated['open_signups_at'])
    
    expected_open_b = target_dt - timedelta(days=7) + timedelta(hours=7) # 12:00 + 7h = 19:00
    assert abs((open_at_updated - expected_open_b).total_seconds()) < 60, f"Expected {expected_open_b}, got {open_at_updated}"
    
    # 3. Verify passed signups are NOT affected
    # Manually insert a past signup
    past_dt = datetime.now().astimezone() - timedelta(days=10)
    past_signup = Signup(
        season_id=season.id,
        scheduled_datetime=past_dt,
        duration_hours=2.0,
        court_id=None,
        open_signups_at=past_dt - timedelta(days=7), # Arbitrary old time
        weekly_schedule_id=schedule_a['id']
    )
    session.add(past_signup)
    await session.commit()
    await session.refresh(past_signup)
    original_past_open_at = past_signup.open_signups_at
    
    # Trigger recalculation by updating Schedule A (no changes needed, just trigger update)
    await update_weekly_schedule(
        session=session,
        schedule_id=schedule_a['id']
    )
    
    await session.refresh(past_signup)
    assert past_signup.open_signups_at == original_past_open_at, "Past signup should not be modified"
    
    # 4. Delete Schedule B
    await delete_weekly_schedule(session, schedule_b['id'])
    
    # Verify Signup A reverted
    signups_reverted = await get_signups(session, season.id)
    signup_target_reverted = next(s for s in signups_reverted if s['scheduled_datetime'] == signup_target['scheduled_datetime'])
    open_at_reverted = datetime.fromisoformat(signup_target_reverted['open_signups_at'])
    
    assert abs((open_at_reverted - expected_open_a).total_seconds()) < 60, "Should revert to original open time"


@pytest.mark.asyncio
async def test_calendar_week_consistency(session):
    # Setup
    league = League(name="Test League Consistency")
    session.add(league)
    await session.flush()
    
    # Start season on a Monday
    season_start = date(2025, 12, 1) # Dec 1, 2025 is a Monday
    season = Season(
        league_id=league.id,
        name="Test Season Consistency",
        start_date=season_start,
        end_date=season_start + timedelta(days=60),
        is_active=True
    )
    session.add(season)
    await session.commit()
    await session.refresh(season)
    
    # Create 3 schedules: Tue, Wed, Fri
    # Tue 6am
    await create_weekly_schedule(
        session=session,
        season_id=season.id,
        day_of_week=1, # Tuesday
        start_time="06:00",
        duration_hours=2.0,
        court_id=None,
        open_signups_mode="auto_after_last_session",
        open_signups_day_of_week=None,
        open_signups_time=None,
        end_date=(season_start + timedelta(days=30)).isoformat()
    )
    
    # Wed 9am
    await create_weekly_schedule(
        session=session,
        season_id=season.id,
        day_of_week=2, # Wednesday
        start_time="09:00",
        duration_hours=2.0,
        court_id=None,
        open_signups_mode="auto_after_last_session",
        open_signups_day_of_week=None,
        open_signups_time=None,
        end_date=(season_start + timedelta(days=30)).isoformat()
    )
    
    # Fri 6am
    await create_weekly_schedule(
        session=session,
        season_id=season.id,
        day_of_week=4, # Friday
        start_time="06:00",
        duration_hours=2.0,
        court_id=None,
        open_signups_mode="auto_after_last_session",
        open_signups_day_of_week=None,
        open_signups_time=None,
        end_date=(season_start + timedelta(days=30)).isoformat()
    )
    
    # Get signups for Week 2 (Dec 8 - Dec 14)
    signups = await get_signups(session, season.id)
    
    # Filter for Week 2
    week_2_start = datetime(2025, 12, 8, tzinfo=pytz.UTC)
    week_2_end = datetime(2025, 12, 15, tzinfo=pytz.UTC)
    
    week_2_signups = []
    for s in signups:
        dt = datetime.fromisoformat(s['scheduled_datetime'])
        if dt.tzinfo is None:
            dt = pytz.UTC.localize(dt)
        if week_2_start <= dt < week_2_end:
            week_2_signups.append(s)
            
    week_2_signups.sort(key=lambda x: x['scheduled_datetime'])
    
    # Expected: ALL signups for Week 2 should open at the same time
    # Previous week (Dec 1-7) final session is Fri Dec 5, 6am-8am.
    # So expected open time is Dec 5 08:00 UTC.
    expected_open_time = datetime(2025, 12, 5, 8, 0, 0, tzinfo=pytz.UTC)
    
    for s in week_2_signups:
        open_at = datetime.fromisoformat(s['open_signups_at'])
        if open_at.tzinfo is None:
            open_at = pytz.UTC.localize(open_at)
            
        assert abs((open_at - expected_open_time).total_seconds()) < 60, f"Inconsistent open time for {s['scheduled_datetime']}"
