"""
Comprehensive tests for data_service CRUD operations.
Tests critical database operations for leagues, seasons, sessions, and matches.
"""
import pytest
import pytest_asyncio
from datetime import date, datetime
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select
from backend.database.db import Base
from backend.database.models import (
    League, LeagueMember, Season, Session, Match, Player, SessionStatus
)
from backend.services import data_service


@pytest_asyncio.fixture
async def db_session():
    """Create a test database session."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with async_session_maker() as session:
        yield session
    
    # Cleanup
    await engine.dispose()


@pytest_asyncio.fixture
async def test_player(db_session):
    """Create a test player."""
    player = Player(full_name="Test Player", user_id=1)
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)
    return player


# ============================================================================
# League CRUD Tests
# ============================================================================

@pytest.mark.asyncio
async def test_create_league(db_session, test_player):
    """Test creating a league."""
    league = await data_service.create_league(
        session=db_session,
        name="Test League",
        description="Test Description",
        location_id=None,
        is_open=True,
        whatsapp_group_id=None,
        creator_user_id=1,
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
        creator_user_id=1
    )
    
    league2 = await data_service.create_league(
        session=db_session,
        name="League 2",
        description=None,
        location_id=None,
        is_open=False,
        whatsapp_group_id=None,
        creator_user_id=1
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
        creator_user_id=1
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
        creator_user_id=1
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
        creator_user_id=1
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
        creator_user_id=1
    )
    
    season = await data_service.create_season(
        session=db_session,
        league_id=league["id"],
        name="Test Season",
        start_date="2024-01-01",
        end_date="2024-12-31",
        point_system=None,
        is_active=True
    )
    
    assert season["id"] > 0
    assert season["name"] == "Test Season"
    assert season["league_id"] == league["id"]
    assert season["is_active"] is True


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
        creator_user_id=1
    )
    
    season1 = await data_service.create_season(
        session=db_session,
        league_id=league["id"],
        name="Season 1",
        start_date="2024-01-01",
        end_date="2024-06-30",
        point_system=None,
        is_active=True
    )
    
    season2 = await data_service.create_season(
        session=db_session,
        league_id=league["id"],
        name="Season 2",
        start_date="2024-07-01",
        end_date="2024-12-31",
        point_system=None,
        is_active=False
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
        creator_user_id=1
    )
    
    created = await data_service.create_season(
        session=db_session,
        league_id=league["id"],
        name="Old Name",
        start_date="2024-01-01",
        end_date="2024-12-31",
        point_system=None,
        is_active=True
    )
    
    updated = await data_service.update_season(
        session=db_session,
        season_id=created["id"],
        name="New Name",
        is_active=False
    )
    
    assert updated["name"] == "New Name"
    assert updated["is_active"] is False


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
    assert session["is_active"] is True


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
async def test_lock_in_session(db_session):
    """Test locking in a session."""
    session = await data_service.create_session(db_session, date="2024-01-15")
    
    result = await data_service.lock_in_session(db_session, session["id"], updated_by=1)
    
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

