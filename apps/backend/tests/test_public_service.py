"""
Tests for public_service — sitemap and public page service functions.
"""

import datetime

import pytest
import pytest_asyncio
import bcrypt
from backend.database.models import (
    Court,
    League,
    LeagueMember,
    Location,
    Match,
    Player,
    PlayerGlobalStats,
    PlayerSeasonStats,
    Region,
    Season,
    Session,
    SessionStatus,
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


# ============================================================================
# get_public_leagues (paginated list)
# ============================================================================


@pytest.mark.asyncio
async def test_get_public_leagues_empty(db_session):
    """Returns empty items when no leagues exist."""
    result = await public_service.get_public_leagues(db_session)
    assert result["items"] == []
    assert result["total_count"] == 0
    assert result["page"] == 1
    assert result["page_size"] == 25


@pytest.mark.asyncio
async def test_get_public_leagues_excludes_private(db_session, test_location):
    """Private leagues are excluded from the list."""
    league = League(name="Secret League", location_id=test_location.id, is_public=False)
    db_session.add(league)
    await db_session.commit()

    result = await public_service.get_public_leagues(db_session)
    assert result["items"] == []
    assert result["total_count"] == 0


@pytest.mark.asyncio
async def test_get_public_leagues_returns_public(db_session, test_location):
    """Public leagues are returned with basic info, member count, location."""
    league = League(
        name="Beach League",
        description="Fun league",
        location_id=test_location.id,
        is_public=True,
        gender="mixed",
        level="intermediate",
        is_open=True,
    )
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)

    result = await public_service.get_public_leagues(db_session)
    assert result["total_count"] == 1
    assert len(result["items"]) == 1

    item = result["items"][0]
    assert item["id"] == league.id
    assert item["name"] == "Beach League"
    assert item["description"] == "Fun league"
    assert item["gender"] == "mixed"
    assert item["level"] == "intermediate"
    assert item["is_open"] is True
    assert item["member_count"] == 0
    assert item["games_played"] == 0
    assert item["location"] is not None
    assert item["location"]["city"] == "Test City"
    assert item["location"]["slug"] == "test-city"


@pytest.mark.asyncio
async def test_get_public_leagues_with_member_count(db_session, test_location, test_player):
    """League member count is included."""
    league = League(name="Members League", location_id=test_location.id, is_public=True)
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)

    member = LeagueMember(league_id=league.id, player_id=test_player.id, role="member")
    db_session.add(member)
    await db_session.commit()

    result = await public_service.get_public_leagues(db_session)
    assert result["items"][0]["member_count"] == 1


@pytest.mark.asyncio
async def test_get_public_leagues_with_games_played(db_session, test_location, test_player):
    """League games played count is included."""
    league = League(name="Active League", location_id=test_location.id, is_public=True)
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)

    season = Season(
        league_id=league.id, name="S1",
        start_date=datetime.date(2026, 1, 1),
        end_date=datetime.date(2026, 6, 30),
    )
    db_session.add(season)
    await db_session.commit()
    await db_session.refresh(season)

    sess = Session(
        date="2026-02-01", name="Sess 1",
        status=SessionStatus.SUBMITTED, season_id=season.id,
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)

    # Need 4 players for a match
    p2 = Player(full_name="Player Two")
    p3 = Player(full_name="Player Three")
    p4 = Player(full_name="Player Four")
    db_session.add_all([p2, p3, p4])
    await db_session.commit()
    await db_session.refresh(p2)
    await db_session.refresh(p3)
    await db_session.refresh(p4)

    match = Match(
        session_id=sess.id, date="2026-02-01",
        team1_player1_id=test_player.id, team1_player2_id=p2.id,
        team2_player1_id=p3.id, team2_player2_id=p4.id,
        team1_score=21, team2_score=15, winner=1,
    )
    db_session.add(match)
    await db_session.commit()

    result = await public_service.get_public_leagues(db_session)
    assert result["items"][0]["games_played"] == 1


@pytest.mark.asyncio
async def test_get_public_leagues_filter_by_gender(db_session, test_location):
    """Gender filter returns only matching leagues."""
    l1 = League(name="Mixed", location_id=test_location.id, is_public=True, gender="mixed")
    l2 = League(name="Male", location_id=test_location.id, is_public=True, gender="male")
    db_session.add_all([l1, l2])
    await db_session.commit()

    result = await public_service.get_public_leagues(db_session, gender="male")
    assert result["total_count"] == 1
    assert result["items"][0]["name"] == "Male"


@pytest.mark.asyncio
async def test_get_public_leagues_filter_by_location(db_session, test_location):
    """Location filter returns only matching leagues."""
    loc2 = Location(
        id="other_loc", name="Other Beach", city="Other City",
        state="CA", slug="other-city",
    )
    db_session.add(loc2)
    await db_session.commit()

    l1 = League(name="At Test", location_id=test_location.id, is_public=True)
    l2 = League(name="At Other", location_id="other_loc", is_public=True)
    db_session.add_all([l1, l2])
    await db_session.commit()

    result = await public_service.get_public_leagues(db_session, location_id=test_location.id)
    assert result["total_count"] == 1
    assert result["items"][0]["name"] == "At Test"


@pytest.mark.asyncio
async def test_get_public_leagues_filter_by_region(db_session, test_location, test_region):
    """Region filter returns only leagues at locations in that region."""
    result = await public_service.get_public_leagues(db_session, region_id=test_region.id)
    # No leagues yet
    assert result["total_count"] == 0

    league = League(name="Regional", location_id=test_location.id, is_public=True)
    db_session.add(league)
    await db_session.commit()

    result = await public_service.get_public_leagues(db_session, region_id=test_region.id)
    assert result["total_count"] == 1
    assert result["items"][0]["name"] == "Regional"


@pytest.mark.asyncio
async def test_get_public_leagues_pagination(db_session, test_location):
    """Pagination returns correct slices and total count."""
    for i in range(5):
        db_session.add(League(name=f"League {i}", location_id=test_location.id, is_public=True))
    await db_session.commit()

    result = await public_service.get_public_leagues(db_session, page=1, page_size=2)
    assert result["total_count"] == 5
    assert len(result["items"]) == 2
    assert result["page"] == 1
    assert result["page_size"] == 2

    result2 = await public_service.get_public_leagues(db_session, page=3, page_size=2)
    assert len(result2["items"]) == 1  # 5th item on page 3


@pytest.mark.asyncio
async def test_get_public_leagues_no_location(db_session):
    """League without location returns location=None and region=None."""
    league = League(name="No Loc", location_id=None, is_public=True)
    db_session.add(league)
    await db_session.commit()

    result = await public_service.get_public_leagues(db_session)
    assert result["items"][0]["location"] is None
    assert result["items"][0]["region"] is None


# ============================================================================
# get_public_league
# ============================================================================


@pytest_asyncio.fixture
async def public_league_full(db_session, test_location, test_player):
    """Create a public league with members, a season with standings, and matches."""
    # League created by test_player
    league = League(
        name="Public Beach League",
        description="A great beach league",
        location_id=test_location.id,
        is_public=True,
        gender="mixed",
        level="intermediate",
        created_by=test_player.id,
    )
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)

    # Add test_player as a member
    member = LeagueMember(league_id=league.id, player_id=test_player.id, role="admin")
    db_session.add(member)

    # Create a second player + member
    player2 = Player(full_name="Jane Smith", user_id=None)
    db_session.add(player2)
    await db_session.commit()
    await db_session.refresh(player2)

    member2 = LeagueMember(league_id=league.id, player_id=player2.id, role="member")
    db_session.add(member2)

    # Create two more players for matches (4 total for 2v2)
    player3 = Player(full_name="Bob Jones", user_id=None)
    player4 = Player(full_name="Alice Brown", user_id=None)
    db_session.add_all([player3, player4])
    await db_session.commit()
    await db_session.refresh(player3)
    await db_session.refresh(player4)

    for p in [player3, player4]:
        db_session.add(LeagueMember(league_id=league.id, player_id=p.id, role="member"))

    # Season
    season = Season(
        league_id=league.id,
        name="Spring 2026",
        start_date=datetime.date(2026, 1, 1),
        end_date=datetime.date(2026, 6, 30),
    )
    db_session.add(season)
    await db_session.commit()
    await db_session.refresh(season)

    # Season stats (standings data)
    stats1 = PlayerSeasonStats(
        player_id=test_player.id, season_id=season.id, games=5, wins=4, points=12, win_rate=0.8, avg_point_diff=3.0
    )
    stats2 = PlayerSeasonStats(
        player_id=player2.id, season_id=season.id, games=5, wins=2, points=6, win_rate=0.4, avg_point_diff=-1.0
    )
    db_session.add_all([stats1, stats2])

    # Session + match
    sess = Session(
        date="2026-02-01", name="Session 1", status=SessionStatus.SUBMITTED, season_id=season.id
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)

    match = Match(
        session_id=sess.id,
        date="2026-02-01",
        team1_player1_id=test_player.id,
        team1_player2_id=player2.id,
        team2_player1_id=player3.id,
        team2_player2_id=player4.id,
        team1_score=21,
        team2_score=15,
        winner=1,
    )
    db_session.add(match)
    await db_session.commit()
    await db_session.refresh(match)

    return {
        "league": league,
        "players": [test_player, player2, player3, player4],
        "season": season,
        "match": match,
    }


@pytest.mark.asyncio
async def test_get_public_league_not_found(db_session):
    """Returns None for nonexistent league."""
    result = await public_service.get_public_league(db_session, 99999)
    assert result is None


@pytest.mark.asyncio
async def test_get_public_league_full_data(db_session, public_league_full):
    """Public league returns full data: info, members, standings, matches."""
    league = public_league_full["league"]
    result = await public_service.get_public_league(db_session, league.id)

    assert result is not None
    assert result["id"] == league.id
    assert result["name"] == "Public Beach League"
    assert result["is_public"] is True
    assert result["gender"] == "mixed"
    assert result["level"] == "intermediate"
    assert result["description"] == "A great beach league"
    assert result["creator_name"] == "Test Player"

    # Location
    assert result["location"] is not None
    assert result["location"]["city"] == "Test City"
    assert result["location"]["slug"] == "test-city"

    # Members
    assert result["member_count"] == 4
    assert len(result["members"]) == 4
    member_names = [m["full_name"] for m in result["members"]]
    assert "Test Player" in member_names
    assert "Jane Smith" in member_names

    # Standings (ordered by points desc)
    assert len(result["standings"]) == 2
    assert result["standings"][0]["full_name"] == "Test Player"
    assert result["standings"][0]["rank"] == 1
    assert result["standings"][0]["points"] == 12
    assert result["standings"][1]["full_name"] == "Jane Smith"
    assert result["standings"][1]["rank"] == 2

    # Current season
    assert result["current_season"] is not None
    assert result["current_season"]["name"] == "Spring 2026"

    # Recent matches
    assert len(result["recent_matches"]) == 1
    match = result["recent_matches"][0]
    assert match["team1_score"] == 21
    assert match["team2_score"] == 15
    assert match["winner"] == 1


@pytest.mark.asyncio
async def test_get_public_league_private_limited(db_session, test_location, test_player):
    """Private league returns limited data without members/standings/matches."""
    league = League(
        name="Private League",
        location_id=test_location.id,
        is_public=False,
        created_by=test_player.id,
    )
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)

    member = LeagueMember(league_id=league.id, player_id=test_player.id, role="admin")
    db_session.add(member)
    await db_session.commit()

    result = await public_service.get_public_league(db_session, league.id)

    assert result is not None
    assert result["name"] == "Private League"
    assert result["is_public"] is False
    assert result["member_count"] == 1
    assert result["games_played"] == 0
    assert result["creator_name"] == "Test Player"

    # Full data fields should NOT be present
    assert "members" not in result
    assert "standings" not in result
    assert "recent_matches" not in result
    assert "description" not in result


@pytest.mark.asyncio
async def test_get_public_league_no_season(db_session, test_location):
    """Public league with no seasons returns empty standings/matches."""
    league = League(name="New League", location_id=test_location.id, is_public=True)
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)

    result = await public_service.get_public_league(db_session, league.id)

    assert result is not None
    assert result["current_season"] is None
    assert result["standings"] == []
    assert result["recent_matches"] == []
    assert result["members"] == []


@pytest.mark.asyncio
async def test_get_public_league_no_location(db_session):
    """League without a location returns location=None."""
    league = League(name="No Loc League", location_id=None, is_public=True)
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)

    result = await public_service.get_public_league(db_session, league.id)

    assert result is not None
    assert result["location"] is None


@pytest.mark.asyncio
async def test_get_public_league_avatar_fallback(db_session, test_location, test_user):
    """Members without avatars get generated initials."""
    league = League(name="Avatar League", location_id=test_location.id, is_public=True)
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)

    player = Player(full_name="John Doe", user_id=test_user["id"], avatar=None)
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)

    member = LeagueMember(league_id=league.id, player_id=player.id, role="member")
    db_session.add(member)
    await db_session.commit()

    result = await public_service.get_public_league(db_session, league.id)

    assert len(result["members"]) == 1
    # Avatar should be initials fallback, not None
    assert result["members"][0]["avatar"] is not None
    assert result["members"][0]["avatar"] != ""


# ============================================================================
# get_public_player
# ============================================================================


@pytest.mark.asyncio
async def test_get_public_player_with_stats(db_session, test_player, test_location):
    """Player with stats returns full profile data."""
    # Set player fields
    test_player.gender = "male"
    test_player.level = "intermediate"
    test_player.location_id = test_location.id
    db_session.add(test_player)

    stats = PlayerGlobalStats(
        player_id=test_player.id, total_games=25, total_wins=15, current_rating=1450.0
    )
    db_session.add(stats)
    await db_session.commit()

    result = await public_service.get_public_player(db_session, test_player.id)

    assert result is not None
    assert result["id"] == test_player.id
    assert result["full_name"] == "Test Player"
    assert result["gender"] == "male"
    assert result["level"] == "intermediate"
    assert result["avatar"] is not None
    assert result["stats"]["current_rating"] == 1450.0
    assert result["stats"]["total_games"] == 25
    assert result["stats"]["total_wins"] == 15
    assert result["stats"]["win_rate"] == 0.6
    assert "created_at" in result
    assert "updated_at" in result


@pytest.mark.asyncio
async def test_get_public_player_zero_games(db_session, test_player):
    """Player with 0 games returns None (not publicly visible)."""
    stats = PlayerGlobalStats(
        player_id=test_player.id, total_games=0, total_wins=0, current_rating=1200.0
    )
    db_session.add(stats)
    await db_session.commit()

    result = await public_service.get_public_player(db_session, test_player.id)
    assert result is None


@pytest.mark.asyncio
async def test_get_public_player_not_found(db_session):
    """Nonexistent player returns None."""
    result = await public_service.get_public_player(db_session, 99999)
    assert result is None


@pytest.mark.asyncio
async def test_get_public_player_with_location(db_session, test_player, test_location):
    """Player with location includes location data with slug."""
    test_player.location_id = test_location.id
    db_session.add(test_player)

    stats = PlayerGlobalStats(
        player_id=test_player.id, total_games=5, total_wins=3, current_rating=1250.0
    )
    db_session.add(stats)
    await db_session.commit()

    result = await public_service.get_public_player(db_session, test_player.id)

    assert result is not None
    assert result["location"] is not None
    assert result["location"]["id"] == "test_loc"
    assert result["location"]["name"] == "Test Beach"
    assert result["location"]["city"] == "Test City"
    assert result["location"]["state"] == "CA"
    assert result["location"]["slug"] == "test-city"


@pytest.mark.asyncio
async def test_get_public_player_no_location(db_session, test_player):
    """Player without location returns location=None."""
    test_player.location_id = None
    db_session.add(test_player)

    stats = PlayerGlobalStats(
        player_id=test_player.id, total_games=5, total_wins=3, current_rating=1250.0
    )
    db_session.add(stats)
    await db_session.commit()

    result = await public_service.get_public_player(db_session, test_player.id)

    assert result is not None
    assert result["location"] is None


@pytest.mark.asyncio
async def test_get_public_player_public_league_memberships(db_session, test_player, test_location):
    """Player's public league memberships are listed."""
    stats = PlayerGlobalStats(
        player_id=test_player.id, total_games=5, total_wins=3, current_rating=1250.0
    )
    db_session.add(stats)

    league = League(name="Public League", location_id=test_location.id, is_public=True)
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)

    member = LeagueMember(league_id=league.id, player_id=test_player.id, role="member")
    db_session.add(member)
    await db_session.commit()

    result = await public_service.get_public_player(db_session, test_player.id)

    assert result is not None
    assert len(result["league_memberships"]) == 1
    assert result["league_memberships"][0]["league_id"] == league.id
    assert result["league_memberships"][0]["league_name"] == "Public League"


@pytest.mark.asyncio
async def test_get_public_player_private_leagues_excluded(db_session, test_player, test_location):
    """Private league memberships are not listed."""
    stats = PlayerGlobalStats(
        player_id=test_player.id, total_games=5, total_wins=3, current_rating=1250.0
    )
    db_session.add(stats)

    league = League(name="Private League", location_id=test_location.id, is_public=False)
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)

    member = LeagueMember(league_id=league.id, player_id=test_player.id, role="member")
    db_session.add(member)
    await db_session.commit()

    result = await public_service.get_public_player(db_session, test_player.id)

    assert result is not None
    assert len(result["league_memberships"]) == 0


# ============================================================================
# get_public_locations (directory)
# ============================================================================


@pytest.mark.asyncio
async def test_get_public_locations_empty(db_session):
    """Returns empty list when no locations with slugs exist."""
    result = await public_service.get_public_locations(db_session)
    assert result == []


@pytest.mark.asyncio
async def test_get_public_locations_excludes_no_slug(db_session, test_location_no_slug):
    """Locations without a slug are excluded."""
    result = await public_service.get_public_locations(db_session)
    assert result == []


@pytest.mark.asyncio
async def test_get_public_locations_grouped_by_region(db_session, test_location, test_region):
    """Locations are grouped under their region."""
    result = await public_service.get_public_locations(db_session)

    assert len(result) == 1
    assert result[0]["id"] == "test_region"
    assert result[0]["name"] == "Test Region"
    assert len(result[0]["locations"]) == 1
    assert result[0]["locations"][0]["slug"] == "test-city"
    assert result[0]["locations"][0]["city"] == "Test City"
    assert result[0]["locations"][0]["state"] == "CA"


@pytest.mark.asyncio
async def test_get_public_locations_no_region(db_session):
    """Locations without a region go under 'Other'."""
    location = Location(
        id="orphan_loc", name="Orphan Beach", city="Orphan City",
        state="TX", region_id=None, slug="orphan-city",
    )
    db_session.add(location)
    await db_session.commit()

    result = await public_service.get_public_locations(db_session)

    assert len(result) == 1
    assert result[0]["id"] is None
    assert result[0]["name"] == "Other"
    assert len(result[0]["locations"]) == 1
    assert result[0]["locations"][0]["slug"] == "orphan-city"


@pytest.mark.asyncio
async def test_get_public_locations_with_league_count(db_session, test_location):
    """Locations include count of public leagues."""
    league = League(name="Public L", location_id=test_location.id, is_public=True)
    private = League(name="Private L", location_id=test_location.id, is_public=False)
    db_session.add_all([league, private])
    await db_session.commit()

    result = await public_service.get_public_locations(db_session)
    loc = result[0]["locations"][0]
    assert loc["league_count"] == 1  # only public league counted


@pytest.mark.asyncio
async def test_get_public_locations_with_player_count(db_session, test_location, test_player):
    """Locations include count of players with >=1 game."""
    test_player.location_id = test_location.id
    db_session.add(test_player)

    stats = PlayerGlobalStats(
        player_id=test_player.id, total_games=5, total_wins=3, current_rating=1250.0,
    )
    db_session.add(stats)
    await db_session.commit()

    result = await public_service.get_public_locations(db_session)
    loc = result[0]["locations"][0]
    assert loc["player_count"] == 1


@pytest.mark.asyncio
async def test_get_public_locations_excludes_zero_game_players(db_session, test_location, test_player):
    """Players with 0 games are not counted."""
    test_player.location_id = test_location.id
    db_session.add(test_player)

    stats = PlayerGlobalStats(
        player_id=test_player.id, total_games=0, total_wins=0, current_rating=1200.0,
    )
    db_session.add(stats)
    await db_session.commit()

    result = await public_service.get_public_locations(db_session)
    loc = result[0]["locations"][0]
    assert loc["player_count"] == 0


# ============================================================================
# get_public_location_by_slug
# ============================================================================


@pytest.mark.asyncio
async def test_get_public_location_not_found(db_session):
    """Returns None for nonexistent slug."""
    result = await public_service.get_public_location_by_slug(db_session, "nonexistent-slug")
    assert result is None


@pytest.mark.asyncio
async def test_get_public_location_basic(db_session, test_location, test_region):
    """Location by slug returns basic info with region."""
    result = await public_service.get_public_location_by_slug(db_session, "test-city")

    assert result is not None
    assert result["id"] == "test_loc"
    assert result["name"] == "Test Beach"
    assert result["city"] == "Test City"
    assert result["state"] == "CA"
    assert result["slug"] == "test-city"
    assert result["region"] is not None
    assert result["region"]["id"] == "test_region"
    assert result["region"]["name"] == "Test Region"
    assert result["leagues"] == []
    assert result["top_players"] == []
    assert result["courts"] == []
    assert result["stats"]["total_players"] == 0
    assert result["stats"]["total_leagues"] == 0
    assert result["stats"]["total_matches"] == 0


@pytest.mark.asyncio
async def test_get_public_location_with_leagues(db_session, test_location, test_player):
    """Location includes public leagues with member counts."""
    league = League(
        name="Beach League",
        location_id=test_location.id,
        is_public=True,
        gender="mixed",
        level="intermediate",
    )
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)

    member = LeagueMember(league_id=league.id, player_id=test_player.id, role="member")
    db_session.add(member)
    await db_session.commit()

    result = await public_service.get_public_location_by_slug(db_session, "test-city")

    assert result is not None
    assert len(result["leagues"]) == 1
    assert result["leagues"][0]["id"] == league.id
    assert result["leagues"][0]["name"] == "Beach League"
    assert result["leagues"][0]["gender"] == "mixed"
    assert result["leagues"][0]["level"] == "intermediate"
    assert result["leagues"][0]["member_count"] == 1
    assert result["stats"]["total_leagues"] == 1


@pytest.mark.asyncio
async def test_get_public_location_excludes_private_leagues(db_session, test_location):
    """Private leagues are excluded from location page."""
    league = League(name="Secret League", location_id=test_location.id, is_public=False)
    db_session.add(league)
    await db_session.commit()

    result = await public_service.get_public_location_by_slug(db_session, "test-city")

    assert result is not None
    assert len(result["leagues"]) == 0
    assert result["stats"]["total_leagues"] == 0


@pytest.mark.asyncio
async def test_get_public_location_with_top_players(db_session, test_location, test_player):
    """Location includes top players by ELO who have games at this location."""
    test_player.location_id = test_location.id
    db_session.add(test_player)

    stats = PlayerGlobalStats(
        player_id=test_player.id, total_games=10, total_wins=7, current_rating=1500.0
    )
    db_session.add(stats)
    await db_session.commit()

    result = await public_service.get_public_location_by_slug(db_session, "test-city")

    assert result is not None
    assert len(result["top_players"]) == 1
    assert result["top_players"][0]["id"] == test_player.id
    assert result["top_players"][0]["full_name"] == "Test Player"
    assert result["top_players"][0]["current_rating"] == 1500.0
    assert result["top_players"][0]["avatar"] is not None
    assert result["stats"]["total_players"] == 1


@pytest.mark.asyncio
async def test_get_public_location_excludes_zero_game_players(db_session, test_location, test_player):
    """Players with 0 games are excluded from top players."""
    test_player.location_id = test_location.id
    db_session.add(test_player)

    stats = PlayerGlobalStats(
        player_id=test_player.id, total_games=0, total_wins=0, current_rating=1200.0
    )
    db_session.add(stats)
    await db_session.commit()

    result = await public_service.get_public_location_by_slug(db_session, "test-city")

    assert result is not None
    assert len(result["top_players"]) == 0
    assert result["stats"]["total_players"] == 0


@pytest.mark.asyncio
async def test_get_public_location_with_courts(db_session, test_location):
    """Location includes courts."""
    court = Court(name="Main Court", address="123 Beach Ave", location_id=test_location.id)
    db_session.add(court)
    await db_session.commit()

    result = await public_service.get_public_location_by_slug(db_session, "test-city")

    assert result is not None
    assert len(result["courts"]) == 1
    assert result["courts"][0]["name"] == "Main Court"
    assert result["courts"][0]["address"] == "123 Beach Ave"


@pytest.mark.asyncio
async def test_get_public_location_match_count(db_session, test_location, test_player):
    """Location aggregate stats include total matches across all leagues."""
    # Create league + season + session + match
    league = League(name="Match League", location_id=test_location.id, is_public=True)
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)

    season = Season(
        league_id=league.id,
        name="S1",
        start_date=datetime.date(2026, 1, 1),
        end_date=datetime.date(2026, 6, 30),
    )
    db_session.add(season)
    await db_session.commit()
    await db_session.refresh(season)

    sess = Session(
        date="2026-02-01", name="Session 1", status=SessionStatus.SUBMITTED, season_id=season.id
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)

    # Need 4 players for a match
    p2 = Player(full_name="Player Two")
    p3 = Player(full_name="Player Three")
    p4 = Player(full_name="Player Four")
    db_session.add_all([p2, p3, p4])
    await db_session.commit()
    await db_session.refresh(p2)
    await db_session.refresh(p3)
    await db_session.refresh(p4)

    match = Match(
        session_id=sess.id,
        date="2026-02-01",
        team1_player1_id=test_player.id,
        team1_player2_id=p2.id,
        team2_player1_id=p3.id,
        team2_player2_id=p4.id,
        team1_score=21,
        team2_score=18,
        winner=1,
    )
    db_session.add(match)
    await db_session.commit()

    result = await public_service.get_public_location_by_slug(db_session, "test-city")

    assert result is not None
    assert result["stats"]["total_matches"] == 1


# ============================================================================
# search_public_players
# ============================================================================


@pytest_asyncio.fixture
async def players_for_search(db_session, test_location, test_user):
    """Create several players with stats for search tests."""
    players = []
    for i, (name, gender, level) in enumerate([
        ("Alice Johnson", "female", "intermediate"),
        ("Bob Smith", "male", "advanced"),
        ("Charlie Brown", "male", "beginner"),
        ("Diana Prince", "female", "advanced"),
    ]):
        p = Player(
            full_name=name,
            gender=gender,
            level=level,
            location_id=test_location.id,
        )
        db_session.add(p)
        await db_session.commit()
        await db_session.refresh(p)
        stats = PlayerGlobalStats(
            player_id=p.id,
            total_games=10 + i,
            total_wins=5 + i,
            current_rating=1200.0 + i * 50,
        )
        db_session.add(stats)
        players.append(p)
    await db_session.commit()
    return players


@pytest.mark.asyncio
async def test_search_public_players_basic(db_session, players_for_search):
    """Basic search returns all players with games."""
    result = await public_service.search_public_players(db_session)
    assert result["total_count"] == 4
    assert len(result["items"]) == 4
    assert result["page"] == 1
    assert result["page_size"] == 25


@pytest.mark.asyncio
async def test_search_public_players_by_name(db_session, players_for_search):
    """Search by name filters correctly."""
    result = await public_service.search_public_players(db_session, search="alice")
    assert result["total_count"] == 1
    assert result["items"][0]["full_name"] == "Alice Johnson"


@pytest.mark.asyncio
async def test_search_public_players_pagination(db_session, players_for_search):
    """Pagination returns correct slices."""
    result = await public_service.search_public_players(db_session, page=1, page_size=2)
    assert result["total_count"] == 4
    assert len(result["items"]) == 2
    assert result["page"] == 1
    assert result["page_size"] == 2

    result2 = await public_service.search_public_players(db_session, page=2, page_size=2)
    assert len(result2["items"]) == 2


@pytest.mark.asyncio
async def test_search_public_players_filter_gender(db_session, players_for_search):
    """Gender filter returns only matching players."""
    result = await public_service.search_public_players(db_session, gender="female")
    assert result["total_count"] == 2
    for item in result["items"]:
        assert item["gender"] == "female"


@pytest.mark.asyncio
async def test_search_public_players_filter_level(db_session, players_for_search):
    """Level filter returns only matching players."""
    result = await public_service.search_public_players(db_session, level="advanced")
    assert result["total_count"] == 2
    for item in result["items"]:
        assert item["level"] == "advanced"


@pytest.mark.asyncio
async def test_search_public_players_like_wildcard_escaping(db_session, test_location):
    """LIKE wildcards in search are escaped (% and _ don't act as wildcards)."""
    # Create a player whose name contains a literal %
    p = Player(full_name="Test%Player", location_id=test_location.id)
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    stats = PlayerGlobalStats(
        player_id=p.id, total_games=5, total_wins=2, current_rating=1200.0
    )
    db_session.add(stats)
    await db_session.commit()

    # Searching for "%" should only match the player with literal % in name
    result = await public_service.search_public_players(db_session, search="%")
    assert result["total_count"] == 1
    assert result["items"][0]["full_name"] == "Test%Player"


@pytest.mark.asyncio
async def test_search_public_players_empty_results(db_session):
    """Returns empty items when no players match."""
    result = await public_service.search_public_players(db_session, search="nonexistent")
    assert result["total_count"] == 0
    assert result["items"] == []


@pytest.mark.asyncio
async def test_search_public_players_excludes_zero_games(db_session, test_player):
    """Players with 0 games are excluded from search."""
    stats = PlayerGlobalStats(
        player_id=test_player.id, total_games=0, total_wins=0, current_rating=1200.0
    )
    db_session.add(stats)
    await db_session.commit()

    result = await public_service.search_public_players(db_session)
    assert result["total_count"] == 0


@pytest.mark.asyncio
async def test_get_public_location_no_region(db_session):
    """Location without a region returns region=None."""
    location = Location(
        id="no_region_loc",
        name="No Region Beach",
        city="Somewhere",
        state="CA",
        region_id=None,
        slug="somewhere",
    )
    db_session.add(location)
    await db_session.commit()

    result = await public_service.get_public_location_by_slug(db_session, "somewhere")

    assert result is not None
    assert result["region"] is None
