"""
Comprehensive tests for data_service CRUD operations.
Tests critical database operations for leagues, seasons, sessions, and matches.
"""
import pytest
import pytest_asyncio
from datetime import date, datetime, timedelta
import pytz
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.database.models import (
    League, LeagueMember, Season, Session, Match, Player, SessionStatus,
    WeeklySchedule, Signup, OpenSignupsMode, User
)
from backend.services import data_service
from backend.services import user_service
import bcrypt

# db_session fixture is provided by conftest.py


@pytest_asyncio.fixture
async def test_user(db_session):
    """Create a test user. Truncation should have cleared all users, so this creates fresh."""
    password_hash = bcrypt.hashpw("test_password".encode(), bcrypt.gensalt()).decode()
    user_id = await user_service.create_user(
        session=db_session,
        phone_number="+15551234567",
        password_hash=password_hash,
        email="test@example.com"
    )
    return {"id": user_id, "phone_number": "+15551234567"}


@pytest_asyncio.fixture
async def test_user_id(db_session, test_user):
    """Provide test user ID for convenience."""
    return test_user["id"]


@pytest_asyncio.fixture
async def test_player(db_session, test_user):
    """Create a test player associated with test_user."""
    player = Player(full_name="Test Player", user_id=test_user["id"])
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)
    return player


# ============================================================================
# League CRUD Tests
# ============================================================================

@pytest.mark.asyncio
async def test_create_league(db_session, test_player, test_user):
    """Test creating a league."""
    league = await data_service.create_league(
        session=db_session,
        name="Test League",
        description="Test Description",
        location_id=None,
        is_open=True,
        whatsapp_group_id=None,
        creator_user_id=test_player.user_id,
        gender="male",
        level="Open"
    )
    
    assert league["id"] > 0
    assert league["name"] == "Test League"
    assert league["description"] == "Test Description"
    assert league["is_open"] is True
    assert league["gender"] == "male"
    assert league["level"] == "Open"
    
    # Verify league was created in database
    result = await db_session.execute(
        select(League).where(League.id == league["id"])
    )
    db_league = result.scalar_one_or_none()
    assert db_league is not None
    assert db_league.name == "Test League"
    
    # Verify creator was added as admin
    result = await db_session.execute(
        select(LeagueMember).where(
            LeagueMember.league_id == league["id"],
            LeagueMember.player_id == test_player.id
        )
    )
    member = result.scalar_one_or_none()
    assert member is not None
    assert member.role == "admin"


@pytest.mark.asyncio
async def test_create_league_no_player(db_session):
    """Test creating a league when player doesn't exist raises error."""
    with pytest.raises(ValueError, match="Player not found"):
        await data_service.create_league(
            session=db_session,
            name="Test League",
            description=None,
            location_id=None,
            is_open=True,
            whatsapp_group_id=None,
            creator_user_id=999  # Non-existent user
        )


@pytest.mark.asyncio
async def test_list_leagues(db_session, test_player):
    """Test listing leagues."""
    # Create two leagues
    league1 = await data_service.create_league(
        session=db_session,
        name="League 1",
        description=None,
        location_id=None,
        is_open=True,
        whatsapp_group_id=None,
        creator_user_id=test_player.user_id
    )
    
    league2 = await data_service.create_league(
        session=db_session,
        name="League 2",
        description=None,
        location_id=None,
        is_open=False,
        whatsapp_group_id=None,
        creator_user_id=test_player.user_id
    )
    
    leagues = await data_service.list_leagues(db_session)
    
    assert len(leagues) >= 2
    league_names = [l["name"] for l in leagues]
    assert "League 1" in league_names
    assert "League 2" in league_names


@pytest.mark.asyncio
async def test_get_league(db_session, test_player):
    """Test getting a specific league."""
    created = await data_service.create_league(
        session=db_session,
        name="Test League",
        description="Test",
        location_id=None,
        is_open=True,
        whatsapp_group_id=None,
        creator_user_id=test_player.user_id
    )
    
    league = await data_service.get_league(db_session, created["id"])
    
    assert league is not None
    assert league["id"] == created["id"]
    assert league["name"] == "Test League"
    assert league["description"] == "Test"


@pytest.mark.asyncio
async def test_get_league_not_found(db_session):
    """Test getting non-existent league returns None."""
    league = await data_service.get_league(db_session, 99999)
    assert league is None


@pytest.mark.asyncio
async def test_update_league(db_session, test_player):
    """Test updating a league."""
    created = await data_service.create_league(
        session=db_session,
        name="Old Name",
        description="Old Desc",
        location_id=None,
        is_open=True,
        whatsapp_group_id=None,
        creator_user_id=test_player.user_id
    )
    
    updated = await data_service.update_league(
        session=db_session,
        league_id=created["id"],
        name="New Name",
        description="New Desc",
        location_id=None,
        is_open=False,
        whatsapp_group_id=None
    )
    
    assert updated["name"] == "New Name"
    assert updated["description"] == "New Desc"
    assert updated["is_open"] is False


@pytest.mark.asyncio
async def test_delete_league(db_session, test_player):
    """Test deleting a league."""
    created = await data_service.create_league(
        session=db_session,
        name="Test League",
        description=None,
        location_id=None,
        is_open=True,
        whatsapp_group_id=None,
        creator_user_id=test_player.user_id
    )
    
    result = await data_service.delete_league(db_session, created["id"])
    assert result is True
    
    # Verify league was deleted
    league = await data_service.get_league(db_session, created["id"])
    assert league is None


# ============================================================================
# Season CRUD Tests
# ============================================================================

@pytest.mark.asyncio
async def test_create_season(db_session, test_player):
    """Test creating a season."""
    league = await data_service.create_league(
        session=db_session,
        name="Test League",
        description=None,
        location_id=None,
        is_open=True,
        whatsapp_group_id=None,
        creator_user_id=test_player.user_id
    )
    
    season = await data_service.create_season(
        session=db_session,
        league_id=league["id"],
        name="Test Season",
        start_date="2024-01-01",
        end_date="2024-12-31",
        point_system=None,
    )
    
    assert season["id"] > 0
    assert season["name"] == "Test Season"
    assert season["league_id"] == league["id"]


@pytest.mark.asyncio
async def test_list_seasons(db_session, test_player):
    """Test listing seasons for a league."""
    league = await data_service.create_league(
        session=db_session,
        name="Test League",
        description=None,
        location_id=None,
        is_open=True,
        whatsapp_group_id=None,
        creator_user_id=test_player.user_id
    )
    
    season1 = await data_service.create_season(
        session=db_session,
        league_id=league["id"],
        name="Season 1",
        start_date="2024-01-01",
        end_date="2024-06-30",
        point_system=None,
    )
    
    season2 = await data_service.create_season(
        session=db_session,
        league_id=league["id"],
        name="Season 2",
        start_date="2024-07-01",
        end_date="2024-12-31",
        point_system=None,
    )
    
    seasons = await data_service.list_seasons(db_session, league["id"])
    
    assert len(seasons) == 2
    season_names = [s["name"] for s in seasons]
    assert "Season 1" in season_names
    assert "Season 2" in season_names


@pytest.mark.asyncio
async def test_update_season(db_session, test_player):
    """Test updating a season."""
    league = await data_service.create_league(
        session=db_session,
        name="Test League",
        description=None,
        location_id=None,
        is_open=True,
        whatsapp_group_id=None,
        creator_user_id=test_player.user_id
    )
    
    created = await data_service.create_season(
        session=db_session,
        league_id=league["id"],
        name="Old Name",
        start_date="2024-01-01",
        end_date="2024-12-31",
        point_system=None,
    )
    
    updated = await data_service.update_season(
        session=db_session,
        season_id=created["id"],
        name="New Name",
    )
    
    assert updated["name"] == "New Name"


# ============================================================================
# Session CRUD Tests
# ============================================================================

@pytest.mark.asyncio
async def test_create_session(db_session):
    """Test creating a session."""
    session = await data_service.create_session(
        session=db_session,
        date="2024-01-15"
    )
    
    assert session["id"] > 0
    assert session["date"] == "2024-01-15"


@pytest.mark.asyncio
async def test_get_sessions(db_session):
    """Test getting all sessions."""
    session1 = await data_service.create_session(db_session, date="2024-01-15")
    session2 = await data_service.create_session(db_session, date="2024-01-16")
    
    sessions = await data_service.get_sessions(db_session)
    
    assert len(sessions) >= 2
    dates = [s["date"] for s in sessions]
    assert "2024-01-15" in dates
    assert "2024-01-16" in dates


@pytest.mark.asyncio
async def test_get_active_session(db_session):
    """Test getting active session."""
    # Create active session
    active = await data_service.create_session(db_session, date="2024-01-15")
    
    # Lock it in (makes it SUBMITTED)
    await data_service.lock_in_session(db_session, active["id"])
    
    # Create new active session
    new_active = await data_service.create_session(db_session, date="2024-01-16")
    
    # Get active session should return the new one
    result = await data_service.get_active_session(db_session)
    assert result is not None
    assert result["id"] == new_active["id"]


@pytest.mark.asyncio
async def test_lock_in_session(db_session, test_player, monkeypatch):
    """Test locking in a session."""
    # Mock the stats queue to avoid creating real async tasks
    # Note: lock_in_session uses lazy import, so we need to patch the module function
    class FakeQueue:
        async def enqueue_calculation(self, session, calc_type, season_id=None):
            return 1
    
    fake_queue = FakeQueue()
    from backend.services import stats_queue
    monkeypatch.setattr(stats_queue, "get_stats_queue", lambda: fake_queue)
    
    session = await data_service.create_session(db_session, date="2024-01-15")
    
    result = await data_service.lock_in_session(db_session, session["id"], updated_by=test_player.id)
    
    assert result is not None
    assert result["success"] is True
    assert "global_job_id" in result
    
    # Verify session status changed
    result_query = await db_session.execute(
        select(Session).where(Session.id == session["id"])
    )
    db_session_obj = result_query.scalar_one_or_none()
    assert db_session_obj.status == SessionStatus.SUBMITTED


@pytest.mark.asyncio
async def test_delete_session(db_session):
    """Test deleting an active session."""
    session = await data_service.create_session(db_session, date="2024-01-15")
    
    result = await data_service.delete_session(db_session, session["id"])
    assert result is True
    
    # Verify session was deleted
    result_query = await db_session.execute(
        select(Session).where(Session.id == session["id"])
    )
    db_session_obj = result_query.scalar_one_or_none()
    assert db_session_obj is None


@pytest.mark.asyncio
async def test_delete_session_not_active(db_session):
    """Test that deleting a submitted session raises error."""
    session = await data_service.create_session(db_session, date="2024-01-15")
    await data_service.lock_in_session(db_session, session["id"])
    
    with pytest.raises(ValueError, match="Cannot delete"):
        await data_service.delete_session(db_session, session["id"])


@pytest.mark.asyncio
async def test_session_numbering_for_same_date(db_session):
    """Test that multiple sessions on the same date get numbered correctly."""
    # First session should just be the date
    session1 = await data_service.create_session(db_session, date="1/15/2024")
    assert session1["name"] == "1/15/2024"
    
    # Submit first session so we can create another
    await data_service.lock_in_session(db_session, session1["id"])
    
    # Second session should be "date Session #2"
    session2 = await data_service.create_session(db_session, date="1/15/2024")
    assert session2["name"] == "1/15/2024 Session #2"
    
    # Submit second session
    await data_service.lock_in_session(db_session, session2["id"])
    
    # Third session should be "date Session #3"
    session3 = await data_service.create_session(db_session, date="1/15/2024")
    assert session3["name"] == "1/15/2024 Session #3"
    
    # Different date should start numbering at 1 again (just the date)
    session4 = await data_service.create_session(db_session, date="1/16/2024")
    assert session4["name"] == "1/16/2024"


@pytest.mark.asyncio
async def test_league_session_numbering_for_same_date(db_session, test_player):
    """Test that multiple league sessions on the same date get numbered correctly."""
    # Create a league with an active season
    league = await data_service.create_league(
        session=db_session,
        name="Test League",
        description=None,
        location_id=None,
        is_open=True,
        whatsapp_group_id=None,
        creator_user_id=test_player.user_id
    )
    
    season = await data_service.create_season(
        session=db_session,
        league_id=league["id"],
        name="Test Season",
        start_date="2024-01-01",
        end_date="2024-12-31",
        point_system=None,
    )
    
    # First session should just be the date
    session1 = await data_service.create_league_session(
        session=db_session,
        league_id=league["id"],
        date="1/15/2024",
        name=None,
        created_by=test_player.id
    )
    assert session1["name"] == "1/15/2024"
    
    # Submit first session so we can create another
    from backend.database.models import Session as SessionModel, SessionStatus
    result = await db_session.execute(
        select(SessionModel).where(SessionModel.id == session1["id"])
    )
    session_obj = result.scalar_one()
    session_obj.status = SessionStatus.SUBMITTED
    await db_session.commit()
    
    # Second session should be "date Session #2"
    session2 = await data_service.create_league_session(
        session=db_session,
        league_id=league["id"],
        date="1/15/2024",
        name=None,
        created_by=test_player.id
    )
    assert session2["name"] == "1/15/2024 Session #2"
    
    # Submit second session
    result = await db_session.execute(
        select(SessionModel).where(SessionModel.id == session2["id"])
    )
    session_obj = result.scalar_one()
    session_obj.status = SessionStatus.SUBMITTED
    await db_session.commit()
    
    # Third session should be "date Session #3"
    session3 = await data_service.create_league_session(
        session=db_session,
        league_id=league["id"],
        date="1/15/2024",
        name=None,
        created_by=test_player.id
    )
    assert session3["name"] == "1/15/2024 Session #3"
    
    # Different date should start numbering at 1 again (just the date)
    session4 = await data_service.create_league_session(
        session=db_session,
        league_id=league["id"],
        date="1/16/2024",
        name=None,
        created_by=test_player.id
    )
    assert session4["name"] == "1/16/2024"
    
    # Test that custom name is preserved
    result = await db_session.execute(
        select(SessionModel).where(SessionModel.id == session4["id"])
    )
    session_obj = result.scalar_one()
    session_obj.status = SessionStatus.SUBMITTED
    await db_session.commit()
    
    session5 = await data_service.create_league_session(
        session=db_session,
        league_id=league["id"],
        date="1/16/2024",
        name="Custom Name",
        created_by=test_player.id
    )
    assert session5["name"] == "Custom Name"


@pytest.mark.asyncio
async def test_get_or_create_active_league_session_numbering(db_session, test_player):
    """Test that get_or_create_active_league_session properly numbers sessions."""
    # Create a league with an active season
    league = await data_service.create_league(
        session=db_session,
        name="Test League",
        description=None,
        location_id=None,
        is_open=True,
        whatsapp_group_id=None,
        creator_user_id=test_player.user_id
    )
    
    season = await data_service.create_season(
        session=db_session,
        league_id=league["id"],
        name="Test Season",
        start_date="2024-01-01",
        end_date="2024-12-31",
        point_system=None,
    )
    
    # First call should create session with just the date
    session1 = await data_service.get_or_create_active_league_session(
        session=db_session,
        league_id=league["id"],
        date="1/20/2024",
        created_by=test_player.id
    )
    assert session1["name"] == "1/20/2024"
    
    # Second call with same date should return the same session
    session1_again = await data_service.get_or_create_active_league_session(
        session=db_session,
        league_id=league["id"],
        date="1/20/2024",
        created_by=test_player.id
    )
    assert session1_again["id"] == session1["id"]
    assert session1_again["name"] == "1/20/2024"
    
    # Submit the session
    from backend.database.models import Session as SessionModel, SessionStatus
    result = await db_session.execute(
        select(SessionModel).where(SessionModel.id == session1["id"])
    )
    session_obj = result.scalar_one()
    session_obj.status = SessionStatus.SUBMITTED
    await db_session.commit()
    
    # Now creating a new session should number it as #2
    session2 = await data_service.get_or_create_active_league_session(
        session=db_session,
        league_id=league["id"],
        date="1/20/2024",
        created_by=test_player.id
    )
    assert session2["name"] == "1/20/2024 Session #2"
    assert session2["id"] != session1["id"]


# ============================================================================
# Match CRUD Tests
# ============================================================================

@pytest.mark.asyncio
async def test_create_match_async(db_session, test_player):
    """Test creating a match."""
    # Create session
    session = await data_service.create_session(db_session, date="2024-01-15")
    
    match_id = await data_service.create_match_async(
        session=db_session,
        session_id=session["id"],
        date="2024-01-15",
        team1_player1="Player 1",
        team1_player2="Player 2",
        team2_player1="Player 3",
        team2_player2="Player 4",
        team1_score=21,
        team2_score=19,
        is_public=True
    )
    
    assert match_id > 0
    
    # Verify match was created
    match = await data_service.get_match_async(db_session, match_id)
    assert match is not None
    assert match["team1_score"] == 21
    assert match["team2_score"] == 19


@pytest.mark.asyncio
async def test_get_match_async(db_session, test_player):
    """Test getting a match."""
    # Create session
    session = await data_service.create_session(db_session, date="2024-01-15")
    
    created_id = await data_service.create_match_async(
        session=db_session,
        session_id=session["id"],
        date="2024-01-15",
        team1_player1="Player 1",
        team1_player2="Player 2",
        team2_player1="Player 3",
        team2_player2="Player 4",
        team1_score=21,
        team2_score=19,
        is_public=True
    )
    
    match = await data_service.get_match_async(db_session, created_id)
    
    assert match is not None
    assert match["id"] == created_id
    assert match["team1_score"] == 21


@pytest.mark.asyncio
async def test_update_match_async(db_session, test_player):
    """Test updating a match."""
    # Create session
    session = await data_service.create_session(db_session, date="2024-01-15")
    
    created_id = await data_service.create_match_async(
        session=db_session,
        session_id=session["id"],
        date="2024-01-15",
        team1_player1="Player 1",
        team1_player2="Player 2",
        team2_player1="Player 3",
        team2_player2="Player 4",
        team1_score=21,
        team2_score=19,
        is_public=True
    )
    
    result = await data_service.update_match_async(
        session=db_session,
        match_id=created_id,
        team1_player1="Player 1",
        team1_player2="Player 2",
        team2_player1="Player 3",
        team2_player2="Player 4",
        team1_score=22,
        team2_score=20
    )
    
    assert result is True
    
    # Verify match was updated
    updated_match = await data_service.get_match_async(db_session, created_id)
    assert updated_match["team1_score"] == 22
    assert updated_match["team2_score"] == 20


@pytest.mark.asyncio
async def test_delete_match_async(db_session, test_player):
    """Test deleting a match."""
    # Create session
    session = await data_service.create_session(db_session, date="2024-01-15")
    
    created_id = await data_service.create_match_async(
        session=db_session,
        session_id=session["id"],
        date="2024-01-15",
        team1_player1="Player 1",
        team1_player2="Player 2",
        team2_player1="Player 3",
        team2_player2="Player 4",
        team1_score=21,
        team2_score=19,
        is_public=True
    )
    
    result = await data_service.delete_match_async(db_session, created_id)
    assert result is True
    
    # Verify match was deleted
    match = await data_service.get_match_async(db_session, created_id)
    assert match is None


# ============================================================================
# Weekly Schedule Tests
# ============================================================================

@pytest.mark.asyncio
async def test_delete_weekly_schedule_only_deletes_future_signups(db_session, test_player):
    """Test that deleting a weekly schedule only deletes future signups, not past ones."""
    
    utc = pytz.UTC
    now_utc = datetime.now(utc)
    
    # Create league and season
    league = await data_service.create_league(
        session=db_session,
        name="Test League",
        description="Test Description",
        location_id=None,
        is_open=True,
        whatsapp_group_id=None,
        creator_user_id=test_player.user_id,
        gender="male",
        level="Open"
    )
    
    season = await data_service.create_season(
        session=db_session,
        league_id=league["id"],
        name="Test Season",
        start_date="2024-01-01",
        end_date="2024-12-31",
        point_system=None,
    )
    
    # Create a weekly schedule
    schedule = await data_service.create_weekly_schedule(
        session=db_session,
        season_id=season["id"],
        day_of_week=0,  # Monday
        start_time="18:00",
        duration_hours=2.0,
        court_id=None,
        open_signups_mode="auto_after_last_session",
        open_signups_day_of_week=None,
        open_signups_time=None,
        end_date="2024-12-31",
        creator_player_id=test_player.id
    )
    
    schedule_id = schedule["id"]
    
    # Manually create past and future signups linked to this schedule
    # Past signup (1 week ago)
    past_datetime = now_utc - timedelta(days=7)
    past_signup = Signup(
        season_id=season["id"],
        scheduled_datetime=past_datetime,
        duration_hours=2.0,
        court_id=None,
        open_signups_at=None,
        weekly_schedule_id=schedule_id,
        created_by=test_player.id
    )
    db_session.add(past_signup)
    
    # Future signup (1 week from now)
    future_datetime = now_utc + timedelta(days=7)
    future_signup = Signup(
        season_id=season["id"],
        scheduled_datetime=future_datetime,
        duration_hours=2.0,
        court_id=None,
        open_signups_at=None,
        weekly_schedule_id=schedule_id,
        created_by=test_player.id
    )
    db_session.add(future_signup)
    
    # Another future signup (2 weeks from now)
    future_datetime2 = now_utc + timedelta(days=14)
    future_signup2 = Signup(
        season_id=season["id"],
        scheduled_datetime=future_datetime2,
        duration_hours=2.0,
        court_id=None,
        open_signups_at=None,
        weekly_schedule_id=schedule_id,
        created_by=test_player.id
    )
    db_session.add(future_signup2)
    
    # Create a signup from a different schedule (should not be affected)
    other_schedule = WeeklySchedule(
        season_id=season["id"],
        day_of_week=1,  # Tuesday
        start_time="19:00",
        duration_hours=2.0,
        court_id=None,
        open_signups_mode=OpenSignupsMode.AUTO_AFTER_LAST_SESSION,
        open_signups_day_of_week=None,
        open_signups_time=None,
        end_date=date(2024, 12, 31),
        created_by=test_player.id
    )
    db_session.add(other_schedule)
    await db_session.flush()
    
    other_future_signup = Signup(
        season_id=season["id"],
        scheduled_datetime=future_datetime,
        duration_hours=2.0,
        court_id=None,
        open_signups_at=None,
        weekly_schedule_id=other_schedule.id,
        created_by=test_player.id
    )
    db_session.add(other_future_signup)
    
    await db_session.commit()
    
    # Get signup IDs before deletion
    past_signup_id = past_signup.id
    future_signup_id = future_signup.id
    future_signup2_id = future_signup2.id
    other_future_signup_id = other_future_signup.id
    
    # Delete the schedule
    result = await data_service.delete_weekly_schedule(db_session, schedule_id)
    assert result is True
    
    # Verify the schedule was deleted
    schedule_result = await db_session.execute(
        select(WeeklySchedule).where(WeeklySchedule.id == schedule_id)
    )
    deleted_schedule = schedule_result.scalar_one_or_none()
    assert deleted_schedule is None
    
    # Verify past signup is still there
    past_result = await db_session.execute(
        select(Signup).where(Signup.id == past_signup_id)
    )
    past_signup_after = past_result.scalar_one_or_none()
    assert past_signup_after is not None, "Past signup should be preserved"
    # Note: The weekly_schedule_id may be set to NULL when the schedule is deleted,
    # but the signup itself should still exist
    
    # Verify future signups are deleted
    future_result = await db_session.execute(
        select(Signup).where(Signup.id == future_signup_id)
    )
    future_signup_after = future_result.scalar_one_or_none()
    assert future_signup_after is None, "Future signup should be deleted"
    
    future_result2 = await db_session.execute(
        select(Signup).where(Signup.id == future_signup2_id)
    )
    future_signup2_after = future_result2.scalar_one_or_none()
    assert future_signup2_after is None, "Second future signup should be deleted"
    
    # Verify signup from other schedule is unaffected
    other_result = await db_session.execute(
        select(Signup).where(Signup.id == other_future_signup_id)
    )
    other_signup_after = other_result.scalar_one_or_none()
    assert other_signup_after is not None, "Signup from other schedule should be preserved"
    assert other_signup_after.weekly_schedule_id == other_schedule.id


@pytest.mark.asyncio
async def test_delete_weekly_schedule_calls_recalculate_open_signups(db_session, test_player, monkeypatch):
    """Test that deleting a weekly schedule calls recalculate_open_signups_for_season."""
    
    # Store original function
    original_recalculate = data_service.recalculate_open_signups_for_season
    
    # Track calls to recalculate_open_signups_for_season
    recalculate_calls = []
    
    async def mock_recalculate(session, season_id):
        recalculate_calls.append(season_id)
        # Call the original function to ensure it works
        await original_recalculate(session, season_id)
    
    # Create league and season first (before patching)
    league = await data_service.create_league(
        session=db_session,
        name="Test League",
        description="Test Description",
        location_id=None,
        is_open=True,
        whatsapp_group_id=None,
        creator_user_id=test_player.user_id,
        gender="male",
        level="Open"
    )
    
    season = await data_service.create_season(
        session=db_session,
        league_id=league["id"],
        name="Test Season",
        start_date="2024-01-01",
        end_date="2024-12-31",
        point_system=None,
    )
    
    # Create a weekly schedule (before patching, so it uses the real function)
    schedule = await data_service.create_weekly_schedule(
        session=db_session,
        season_id=season["id"],
        day_of_week=0,  # Monday
        start_time="18:00",
        duration_hours=2.0,
        court_id=None,
        open_signups_mode="auto_after_last_session",
        open_signups_day_of_week=None,
        open_signups_time=None,
        end_date="2024-12-31",
        creator_player_id=test_player.id
    )
    
    schedule_id = schedule["id"]
    initial_call_count = len(recalculate_calls)
    
    # Now patch the function to track calls from delete_weekly_schedule
    monkeypatch.setattr(
        data_service,
        "recalculate_open_signups_for_season",
        mock_recalculate,
        raising=True
    )
    
    # Delete the schedule
    result = await data_service.delete_weekly_schedule(db_session, schedule_id)
    assert result is True
    
    # Verify recalculate_open_signups_for_season was called at least once
    # (it may have been called during create_weekly_schedule, but should definitely be called during delete)
    assert len(recalculate_calls) > initial_call_count, "recalculate_open_signups_for_season should be called during delete"
    # Verify it was called with the correct season_id
    assert season["id"] in recalculate_calls, f"Should be called with season_id {season['id']}"


@pytest.mark.asyncio
async def test_delete_weekly_schedule_nonexistent(db_session):
    """Test that deleting a non-existent weekly schedule returns False."""
    result = await data_service.delete_weekly_schedule(db_session, 99999)
    assert result is False
