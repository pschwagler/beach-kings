"""
Tests for public_service — sitemap endpoint service functions.
"""

import pytest
import pytest_asyncio
import bcrypt
from backend.database.models import (
    League,
    Location,
    Player,
    PlayerGlobalStats,
    Region,
)
from backend.services import public_service
from backend.services import user_service

# db_session fixture is provided by conftest.py


@pytest_asyncio.fixture
async def test_user(db_session):
    """Create a test user."""
    password_hash = bcrypt.hashpw("test_password".encode(), bcrypt.gensalt()).decode()
    user_id = await user_service.create_user(
        session=db_session,
        phone_number="+15559990001",
        password_hash=password_hash,
        email="public_test@example.com",
    )
    return {"id": user_id}


@pytest_asyncio.fixture
async def test_region(db_session):
    """Create a test region."""
    region = Region(id="test_region", name="Test Region")
    db_session.add(region)
    await db_session.commit()
    await db_session.refresh(region)
    return region


@pytest_asyncio.fixture
async def test_location(db_session, test_region):
    """Create a test location with a slug."""
    location = Location(
        id="test_loc",
        name="Test Beach",
        city="Test City",
        state="CA",
        region_id=test_region.id,
        slug="test-city",
    )
    db_session.add(location)
    await db_session.commit()
    await db_session.refresh(location)
    return location


@pytest_asyncio.fixture
async def test_location_no_slug(db_session, test_region):
    """Create a location without a slug (should be excluded from sitemap)."""
    location = Location(
        id="no_slug_loc",
        name="No Slug Beach",
        city="No Slug City",
        state="CA",
        region_id=test_region.id,
        slug=None,
    )
    db_session.add(location)
    await db_session.commit()
    await db_session.refresh(location)
    return location


@pytest_asyncio.fixture
async def test_player(db_session, test_user):
    """Create a test player."""
    player = Player(full_name="Test Player", user_id=test_user["id"])
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)
    return player


# ============================================================================
# get_sitemap_leagues
# ============================================================================


@pytest.mark.asyncio
async def test_get_sitemap_leagues_returns_public(db_session, test_location):
    """Public leagues are included in the sitemap."""
    league = League(name="Public League", location_id=test_location.id, is_public=True)
    db_session.add(league)
    await db_session.commit()

    result = await public_service.get_sitemap_leagues(db_session)
    assert len(result) == 1
    assert result[0]["id"] == league.id
    assert result[0]["name"] == "Public League"
    assert "updated_at" in result[0]


@pytest.mark.asyncio
async def test_get_sitemap_leagues_excludes_private(db_session, test_location):
    """Private leagues are excluded from the sitemap."""
    league = League(name="Private League", location_id=test_location.id, is_public=False)
    db_session.add(league)
    await db_session.commit()

    result = await public_service.get_sitemap_leagues(db_session)
    assert len(result) == 0


@pytest.mark.asyncio
async def test_get_sitemap_leagues_empty(db_session):
    """Returns empty list when no leagues exist."""
    result = await public_service.get_sitemap_leagues(db_session)
    assert result == []


# ============================================================================
# get_sitemap_players
# ============================================================================


@pytest.mark.asyncio
async def test_get_sitemap_players_with_games(db_session, test_player):
    """Players with at least 1 game are included."""
    stats = PlayerGlobalStats(
        player_id=test_player.id, total_games=5, total_wins=3, current_rating=1250.0
    )
    db_session.add(stats)
    await db_session.commit()

    result = await public_service.get_sitemap_players(db_session)
    assert len(result) == 1
    assert result[0]["id"] == test_player.id
    assert result[0]["full_name"] == "Test Player"
    assert "updated_at" in result[0]


@pytest.mark.asyncio
async def test_get_sitemap_players_excludes_zero_games(db_session, test_player):
    """Players with 0 games are excluded."""
    stats = PlayerGlobalStats(
        player_id=test_player.id, total_games=0, total_wins=0, current_rating=1200.0
    )
    db_session.add(stats)
    await db_session.commit()

    result = await public_service.get_sitemap_players(db_session)
    assert len(result) == 0


@pytest.mark.asyncio
async def test_get_sitemap_players_excludes_no_stats(db_session, test_player):
    """Players without global stats record are excluded."""
    result = await public_service.get_sitemap_players(db_session)
    assert len(result) == 0


@pytest.mark.asyncio
async def test_get_sitemap_players_empty(db_session):
    """Returns empty list when no players exist."""
    result = await public_service.get_sitemap_players(db_session)
    assert result == []


# ============================================================================
# get_sitemap_locations
# ============================================================================


@pytest.mark.asyncio
async def test_get_sitemap_locations_with_league(db_session, test_location):
    """Locations with a slug and at least 1 league are included."""
    league = League(name="Beach League", location_id=test_location.id, is_public=True)
    db_session.add(league)
    await db_session.commit()

    result = await public_service.get_sitemap_locations(db_session)
    assert len(result) == 1
    assert result[0]["slug"] == "test-city"
    assert "updated_at" in result[0]


@pytest.mark.asyncio
async def test_get_sitemap_locations_excludes_no_leagues(db_session, test_location):
    """Locations without any leagues are excluded."""
    result = await public_service.get_sitemap_locations(db_session)
    assert len(result) == 0


@pytest.mark.asyncio
async def test_get_sitemap_locations_excludes_no_slug(db_session, test_location_no_slug):
    """Locations without a slug are excluded even if they have leagues."""
    league = League(name="No Slug League", location_id=test_location_no_slug.id, is_public=True)
    db_session.add(league)
    await db_session.commit()

    result = await public_service.get_sitemap_locations(db_session)
    assert len(result) == 0


@pytest.mark.asyncio
async def test_get_sitemap_locations_empty(db_session):
    """Returns empty list when no locations exist."""
    result = await public_service.get_sitemap_locations(db_session)
    assert result == []
