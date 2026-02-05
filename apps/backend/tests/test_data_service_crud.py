"""
Comprehensive tests for data_service CRUD operations.
Tests critical database operations for leagues, seasons, sessions, and matches.
"""
import pytest
import pytest_asyncio
from datetime import date, datetime, timedelta
import pytz
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.database.models import (
    League, LeagueMember, Season, Session, Match, Player, SessionStatus,
    WeeklySchedule, Signup, OpenSignupsMode, User, ScoringSystem, EloHistory,
    SessionParticipant,
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
# Scoring System Tests
# ============================================================================

@pytest.mark.asyncio
async def test_create_season_points_system(db_session, test_player):
    """Test creating a season with Points System scoring."""
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
        scoring_system="points_system",
        points_per_win=3,
        points_per_loss=1,
    )
    
    assert season["id"] > 0
    assert season["scoring_system"] == "points_system"
    assert season["point_system"] is not None
    
    # Verify point_system JSON structure
    point_system = json.loads(season["point_system"])
    assert point_system["type"] == "points_system"
    assert point_system["points_per_win"] == 3
    assert point_system["points_per_loss"] == 1


@pytest.mark.asyncio
async def test_create_season_points_system_defaults(db_session, test_player):
    """Test creating a season with Points System using default values."""
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
        scoring_system="points_system",
    )
    
    assert season["scoring_system"] == "points_system"
    import json
    point_system = json.loads(season["point_system"])
    assert point_system["type"] == "points_system"
    assert point_system["points_per_win"] == 3  # Default
    assert point_system["points_per_loss"] == 1  # Default


@pytest.mark.asyncio
async def test_create_season_season_rating(db_session, test_player):
    """Test creating a season with Season Rating scoring."""
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
        scoring_system="season_rating",
    )
    
    assert season["id"] > 0
    assert season["scoring_system"] == "season_rating"
    assert season["point_system"] is not None
    
    # Verify point_system JSON structure
    import json
    point_system = json.loads(season["point_system"])
    assert point_system["type"] == "season_rating"


@pytest.mark.asyncio
async def test_update_season_scoring_system(db_session, test_player):
    """Test updating a season's scoring system."""
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
        name="Test Season",
        start_date="2024-01-01",
        end_date="2024-12-31",
        scoring_system="points_system",
        points_per_win=3,
        points_per_loss=1,
    )
    
    # Update to Season Rating
    updated = await data_service.update_season(
        session=db_session,
        season_id=created["id"],
        scoring_system="season_rating",
    )
    
    assert updated["scoring_system"] == "season_rating"
    import json
    point_system = json.loads(updated["point_system"])
    assert point_system["type"] == "season_rating"


@pytest.mark.asyncio
async def test_update_season_points_per_win_loss(db_session, test_player):
    """Test updating points_per_win and points_per_loss."""
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
        name="Test Season",
        start_date="2024-01-01",
        end_date="2024-12-31",
        scoring_system="points_system",
        points_per_win=3,
        points_per_loss=1,
    )
    
    # Update points values
    updated = await data_service.update_season(
        session=db_session,
        season_id=created["id"],
        points_per_win=5,
        points_per_loss=0,
    )
    
    assert updated["scoring_system"] == "points_system"
    import json
    point_system = json.loads(updated["point_system"])
    assert point_system["points_per_win"] == 5
    assert point_system["points_per_loss"] == 0


@pytest.mark.asyncio
async def test_update_season_scoring_system_triggers_recalc(db_session, test_player, monkeypatch):
    """Test that updating scoring system triggers stats recalculation."""
    from backend.services.stats_queue import get_stats_queue
    
    # Track enqueue calls
    enqueue_calls = []
    
    async def mock_enqueue(session, calc_type, league_id):
        enqueue_calls.append((calc_type, league_id))
        return 1  # Return a fake job ID
    
    # Create league and season
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
        name="Test Season",
        start_date="2024-01-01",
        end_date="2024-12-31",
        scoring_system="points_system",
    )
    
    # Mock the queue's enqueue_calculation method
    queue = get_stats_queue()
    monkeypatch.setattr(queue, "enqueue_calculation", mock_enqueue)
    
    # Update scoring system
    await data_service.update_season(
        session=db_session,
        season_id=created["id"],
        scoring_system="season_rating",
    )
    
    # Verify enqueue was called
    assert len(enqueue_calls) > 0
    assert ("league", league["id"]) in enqueue_calls


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
    # Use dynamic dates - today for the session, season spans current year
    today = date.today()
    season_start = date(today.year, 1, 1).isoformat()
    season_end = date(today.year, 12, 31).isoformat()
    session_date = f"{today.month}/{today.day}/{today.year}"

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
        start_date=season_start,
        end_date=season_end,
        point_system=None,
    )

    # First session should just be the date
    session1 = await data_service.create_league_session(
        session=db_session,
        league_id=league["id"],
        date=session_date,
        name=None,
        created_by=test_player.id
    )
    assert session1["name"] == session_date
    
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
        date=session_date,
        name=None,
        created_by=test_player.id
    )
    assert session2["name"] == f"{session_date} Session #2"

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
        date=session_date,
        name=None,
        created_by=test_player.id
    )
    assert session3["name"] == f"{session_date} Session #3"

    # Different date should start numbering at 1 again (just the date)
    tomorrow = today + timedelta(days=1)
    tomorrow_date = f"{tomorrow.month}/{tomorrow.day}/{tomorrow.year}"
    session4 = await data_service.create_league_session(
        session=db_session,
        league_id=league["id"],
        date=tomorrow_date,
        name=None,
        created_by=test_player.id
    )
    assert session4["name"] == tomorrow_date

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
        date=tomorrow_date,
        name="Custom Name",
        created_by=test_player.id
    )
    assert session5["name"] == "Custom Name"


@pytest.mark.asyncio
async def test_get_or_create_active_league_session_numbering(db_session, test_player):
    """Test that get_or_create_active_league_session properly numbers sessions."""
    # Use dynamic dates
    today = date.today()
    season_start = date(today.year, 1, 1).isoformat()
    season_end = date(today.year, 12, 31).isoformat()
    the_session_date = f"{today.month}/{today.day}/{today.year}"

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
        start_date=season_start,
        end_date=season_end,
        point_system=None,
    )

    # First call should create session with just the date
    session1 = await data_service.get_or_create_active_league_session(
        session=db_session,
        league_id=league["id"],
        session_date=the_session_date,
        created_by=test_player.id
    )
    assert session1["name"] == the_session_date

    # Second call with same date should return the same session
    session1_again = await data_service.get_or_create_active_league_session(
        session=db_session,
        league_id=league["id"],
        session_date=the_session_date,
        created_by=test_player.id
    )
    assert session1_again["id"] == session1["id"]
    assert session1_again["name"] == the_session_date

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
        session_date=the_session_date,
        created_by=test_player.id
    )
    assert session2["name"] == f"{the_session_date} Session #2"
    assert session2["id"] != session1["id"]


@pytest.mark.asyncio
async def test_session_name_format_with_iso_date(db_session, test_player):
    """Test that ISO format dates (YYYY-MM-DD) are converted to M/D/YYYY format for session names."""
    # Use dynamic dates
    today = date.today()
    season_start = date(today.year, 1, 1).isoformat()
    season_end = date(today.year, 12, 31).isoformat()
    iso_date = today.isoformat()  # YYYY-MM-DD format
    expected_name = f"{today.month}/{today.day}/{today.year}"  # M/D/YYYY format

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
        start_date=season_start,
        end_date=season_end,
        point_system=None,
    )

    # Create a session with ISO format date - name should be formatted as M/D/YYYY
    session1 = await data_service.get_or_create_active_league_session(
        session=db_session,
        league_id=league["id"],
        session_date=iso_date,  # ISO format
        created_by=test_player.id
    )
    assert session1["name"] == expected_name  # Should be converted to M/D/YYYY format

    # Submit session to allow creating another
    from backend.database.models import Session as SessionModel, SessionStatus
    result = await db_session.execute(
        select(SessionModel).where(SessionModel.id == session1["id"])
    )
    session_obj = result.scalar_one()
    session_obj.status = SessionStatus.SUBMITTED
    await db_session.commit()

    # Second session with ISO date should also be formatted correctly
    session2 = await data_service.get_or_create_active_league_session(
        session=db_session,
        league_id=league["id"],
        session_date=iso_date,  # ISO format
        created_by=test_player.id
    )
    assert session2["name"] == f"{expected_name} Session #2"


def test_format_session_date_function():
    """Test the format_session_date utility function."""
    from backend.utils.datetime_utils import format_session_date
    from datetime import datetime
    
    # ISO format
    assert format_session_date("2024-01-21") == "1/21/2024"
    assert format_session_date("2024-12-05") == "12/5/2024"
    
    # US format with leading zeros
    assert format_session_date("01/05/2024") == "1/5/2024"
    
    # US format without leading zeros (already correct)
    assert format_session_date("1/5/2024") == "1/5/2024"
    
    # datetime object
    assert format_session_date(datetime(2024, 1, 21)) == "1/21/2024"
    assert format_session_date(datetime(2024, 12, 5)) == "12/5/2024"


# ============================================================================
# Match CRUD Tests
# ============================================================================

@pytest.mark.asyncio
async def test_create_match_async(db_session, test_player):
    """Test creating a match."""
    from backend.models.schemas import CreateMatchRequest

    # Create session and players
    sess = await data_service.create_session(db_session, date="2024-01-15")
    player1_id = await data_service.get_or_create_player(db_session, "Player 1")
    player2_id = await data_service.get_or_create_player(db_session, "Player 2")
    player3_id = await data_service.get_or_create_player(db_session, "Player 3")
    player4_id = await data_service.get_or_create_player(db_session, "Player 4")

    match_request = CreateMatchRequest(
        session_id=sess["id"],
        team1_player1_id=player1_id,
        team1_player2_id=player2_id,
        team2_player1_id=player3_id,
        team2_player2_id=player4_id,
        team1_score=21,
        team2_score=19
    )

    match_id = await data_service.create_match_async(
        session=db_session,
        match_request=match_request,
        session_id=sess["id"],
        date="2024-01-15"
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
    from backend.models.schemas import CreateMatchRequest

    # Create session and players
    sess = await data_service.create_session(db_session, date="2024-01-15")
    player1_id = await data_service.get_or_create_player(db_session, "Player 1")
    player2_id = await data_service.get_or_create_player(db_session, "Player 2")
    player3_id = await data_service.get_or_create_player(db_session, "Player 3")
    player4_id = await data_service.get_or_create_player(db_session, "Player 4")

    match_request = CreateMatchRequest(
        session_id=sess["id"],
        team1_player1_id=player1_id,
        team1_player2_id=player2_id,
        team2_player1_id=player3_id,
        team2_player2_id=player4_id,
        team1_score=21,
        team2_score=19
    )

    created_id = await data_service.create_match_async(
        session=db_session,
        match_request=match_request,
        session_id=sess["id"],
        date="2024-01-15"
    )

    match = await data_service.get_match_async(db_session, created_id)

    assert match is not None
    assert match["id"] == created_id
    assert match["team1_score"] == 21


@pytest.mark.asyncio
async def test_update_match_async(db_session, test_player):
    """Test updating a match."""
    from backend.models.schemas import CreateMatchRequest

    # Create session and players
    sess = await data_service.create_session(db_session, date="2024-01-15")
    player1_id = await data_service.get_or_create_player(db_session, "Player 1")
    player2_id = await data_service.get_or_create_player(db_session, "Player 2")
    player3_id = await data_service.get_or_create_player(db_session, "Player 3")
    player4_id = await data_service.get_or_create_player(db_session, "Player 4")

    match_request = CreateMatchRequest(
        session_id=sess["id"],
        team1_player1_id=player1_id,
        team1_player2_id=player2_id,
        team2_player1_id=player3_id,
        team2_player2_id=player4_id,
        team1_score=21,
        team2_score=19
    )

    created_id = await data_service.create_match_async(
        session=db_session,
        match_request=match_request,
        session_id=sess["id"],
        date="2024-01-15"
    )

    # Update with new scores
    update_request = CreateMatchRequest(
        session_id=sess["id"],
        team1_player1_id=player1_id,
        team1_player2_id=player2_id,
        team2_player1_id=player3_id,
        team2_player2_id=player4_id,
        team1_score=22,
        team2_score=20
    )

    result = await data_service.update_match_async(
        session=db_session,
        match_id=created_id,
        match_request=update_request
    )

    assert result is True

    # Verify match was updated
    updated_match = await data_service.get_match_async(db_session, created_id)
    assert updated_match["team1_score"] == 22
    assert updated_match["team2_score"] == 20


@pytest.mark.asyncio
async def test_delete_match_async(db_session, test_player):
    """Test deleting a match."""
    from backend.models.schemas import CreateMatchRequest

    # Create session and players
    sess = await data_service.create_session(db_session, date="2024-01-15")
    player1_id = await data_service.get_or_create_player(db_session, "Player 1")
    player2_id = await data_service.get_or_create_player(db_session, "Player 2")
    player3_id = await data_service.get_or_create_player(db_session, "Player 3")
    player4_id = await data_service.get_or_create_player(db_session, "Player 4")

    match_request = CreateMatchRequest(
        session_id=sess["id"],
        team1_player1_id=player1_id,
        team1_player2_id=player2_id,
        team2_player1_id=player3_id,
        team2_player2_id=player4_id,
        team1_score=21,
        team2_score=19
    )

    created_id = await data_service.create_match_async(
        session=db_session,
        match_request=match_request,
        session_id=sess["id"],
        date="2024-01-15"
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
    today = date.today()
    season_start = date(today.year, 1, 1).isoformat()
    season_end = date(today.year, 12, 31).isoformat()
    # Weekly schedule end_date must be within 6 months
    schedule_end = (today + timedelta(days=90)).isoformat()

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
        start_date=season_start,
        end_date=season_end,
        point_system=None,
    )

    # Create a weekly schedule (end_date must be within 6 months)
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
        start_date=season_start,
        end_date=schedule_end,
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
        start_date=today,  # Required start_date
        end_date=today + timedelta(days=90),  # Use dynamic date within 6 months
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
    today = date.today()
    season_start = date(today.year, 1, 1).isoformat()
    season_end = date(today.year, 12, 31).isoformat()
    # Weekly schedule end_date must be within 6 months
    schedule_end = (today + timedelta(days=90)).isoformat()

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
        start_date=season_start,
        end_date=season_end,
        point_system=None,
    )

    # Create a weekly schedule (before patching, so it uses the real function)
    # end_date must be within 6 months
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
        start_date=season_start,
        end_date=schedule_end,
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


# ============================================================================
# Non-League Sessions Tests
# ============================================================================

@pytest_asyncio.fixture
async def four_players(db_session):
    """Create four users and players for match tests (each user has one player)."""
    players = []
    for i, name in enumerate(["Alice", "Bob", "Charlie", "Dave"]):
        phone = f"+1555000{i:04d}"
        password_hash = bcrypt.hashpw("test_password".encode(), bcrypt.gensalt()).decode()
        user_id = await user_service.create_user(
            session=db_session,
            phone_number=phone,
            password_hash=password_hash,
            email=f"{name.lower()}@example.com",
        )
        p = Player(full_name=name, user_id=user_id)
        db_session.add(p)
        players.append(p)
    await db_session.commit()
    for p in players:
        await db_session.refresh(p)
    return players


@pytest.mark.asyncio
async def test_create_session_with_code(db_session, test_player):
    """Test creating a non-league session generates a unique code."""
    session = await data_service.create_session(
        db_session,
        date="2024-01-15",
        created_by=test_player.id,
    )
    assert session["id"] > 0
    assert session["code"] is not None
    assert len(session["code"]) == 8  # SESSION_CODE_LENGTH in data_service
    assert session["season_id"] is None


@pytest.mark.asyncio
async def test_get_session_by_code(db_session, test_player):
    """Test fetching session by shareable code."""
    created = await data_service.create_session(
        db_session, date="2024-01-15", created_by=test_player.id
    )
    code = created["code"]
    sess = await data_service.get_session_by_code(db_session, code)
    assert sess is not None
    assert sess["id"] == created["id"]
    assert sess["code"] == code
    assert sess["season_id"] is None


@pytest.mark.asyncio
async def test_get_session_by_code_not_found(db_session):
    """Test get_session_by_code returns None for invalid code."""
    sess = await data_service.get_session_by_code(db_session, "INVALID")
    assert sess is None


@pytest.mark.asyncio
async def test_get_open_sessions_for_user(db_session, test_player):
    """Test open sessions include sessions where user is creator, has match, or invited."""
    # Create session as creator
    created = await data_service.create_session(
        db_session, date="2024-01-15", created_by=test_player.id
    )
    sessions = await data_service.get_open_sessions_for_user(db_session, test_player.id)
    assert len(sessions) >= 1
    found = next((s for s in sessions if s["id"] == created["id"]), None)
    assert found is not None
    assert found["participation"] == "creator"


@pytest.mark.asyncio
async def test_join_session_by_code(db_session, test_player, four_players):
    """Test joining a session by code adds player to participants."""
    creator = four_players[0]
    joiner = four_players[1]
    created = await data_service.create_session(
        db_session, date="2024-01-15", created_by=creator.id
    )
    result = await data_service.join_session_by_code(db_session, created["code"], joiner.id)
    assert result is not None
    assert result["id"] == created["id"]
    # Verify participant was added
    part_result = await db_session.execute(
        select(SessionParticipant).where(
            SessionParticipant.session_id == created["id"],
            SessionParticipant.player_id == joiner.id,
        )
    )
    part = part_result.scalar_one_or_none()
    assert part is not None


@pytest.mark.asyncio
async def test_add_session_participant(db_session, test_player, four_players):
    """Test add_session_participant adds player to session participants."""
    creator = four_players[0]
    invitee = four_players[1]
    created = await data_service.create_session(
        db_session, date="2024-01-15", created_by=creator.id
    )
    result = await data_service.add_session_participant(
        db_session, created["id"], invitee.id, invited_by=creator.id
    )
    assert result is True
    part_result = await db_session.execute(
        select(SessionParticipant).where(
            SessionParticipant.session_id == created["id"],
            SessionParticipant.player_id == invitee.id,
        )
    )
    part = part_result.scalar_one_or_none()
    assert part is not None
    assert part.invited_by == creator.id


@pytest.mark.asyncio
async def test_add_session_participant_idempotent(db_session, four_players):
    """Test add_session_participant is idempotent (already present returns True)."""
    creator = four_players[0]
    invitee = four_players[1]
    created = await data_service.create_session(
        db_session, date="2024-01-15", created_by=creator.id
    )
    await data_service.add_session_participant(
        db_session, created["id"], invitee.id, invited_by=creator.id
    )
    result = await data_service.add_session_participant(
        db_session, created["id"], invitee.id, invited_by=creator.id
    )
    assert result is True


@pytest.mark.asyncio
async def test_can_user_add_match_to_session_creator(db_session, test_user, four_players):
    """Test creator can add match to non-league session."""
    creator = four_players[0]
    created = await data_service.create_session(
        db_session, date="2024-01-15", created_by=creator.id
    )
    session_obj = {
        "season_id": None,
        "created_by": creator.id,
    }
    # Creator's user_id - need to get from player
    creator_user_id = (await db_session.get(Player, creator.id)).user_id
    result = await data_service.can_user_add_match_to_session(
        db_session, created["id"], session_obj, creator_user_id
    )
    assert result is True


@pytest.mark.asyncio
async def test_can_user_add_match_to_session_invited(db_session, test_user, four_players):
    """Test invited player can add match to non-league session."""
    creator = four_players[0]
    invitee = four_players[1]
    created = await data_service.create_session(
        db_session, date="2024-01-15", created_by=creator.id
    )
    await data_service.add_session_participant(
        db_session, created["id"], invitee.id, invited_by=creator.id
    )
    session_obj = {"season_id": None, "created_by": creator.id}
    invitee_user_id = (await db_session.get(Player, invitee.id)).user_id
    result = await data_service.can_user_add_match_to_session(
        db_session, created["id"], session_obj, invitee_user_id
    )
    assert result is True


@pytest.mark.asyncio
async def test_can_user_add_match_to_session_random_user_denied(db_session, test_user, four_players):
    """Test random user (not creator, no match, not invited) cannot add match."""
    creator = four_players[0]
    random_player = four_players[3]
    created = await data_service.create_session(
        db_session, date="2024-01-15", created_by=creator.id
    )
    session_obj = {"season_id": None, "created_by": creator.id}
    random_user_id = (await db_session.get(Player, random_player.id)).user_id
    result = await data_service.can_user_add_match_to_session(
        db_session, created["id"], session_obj, random_user_id
    )
    assert result is False


@pytest.mark.asyncio
async def test_create_match_session_id_only(db_session, four_players):
    """Test creating a match with session_id only (non-league session)."""
    from backend.models.schemas import CreateMatchRequest

    creator = four_players[0]
    created = await data_service.create_session(
        db_session, date="2024-01-15", created_by=creator.id
    )
    alice, bob, charlie, dave = four_players
    match_request = CreateMatchRequest(
        session_id=created["id"],
        team1_player1_id=alice.id,
        team1_player2_id=bob.id,
        team2_player1_id=charlie.id,
        team2_player2_id=dave.id,
        team1_score=21,
        team2_score=19,
    )
    match_id = await data_service.create_match_async(
        db_session,
        match_request=match_request,
        session_id=created["id"],
        date=created["date"],
    )
    assert match_id > 0
    match = await data_service.get_match_async(db_session, match_id)
    assert match is not None
    assert match["session_id"] == created["id"]
    assert match["team1_score"] == 21
    assert match["team2_score"] == 19
