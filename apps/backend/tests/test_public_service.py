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
    Friend,
    FriendRequest,
    Player,
    PlayerGlobalStats,
    PlayerSeasonStats,
    Region,
    Season,
    Session,
    SessionStatus,
    User,
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
        league_id=league.id,
        name="S1",
        start_date=datetime.date(2026, 1, 1),
        end_date=datetime.date(2026, 6, 30),
    )
    db_session.add(season)
    await db_session.commit()
    await db_session.refresh(season)

    sess = Session(
        date="2026-02-01",
        name="Sess 1",
        status=SessionStatus.SUBMITTED,
        season_id=season.id,
        league_id=league.id,
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
        team1_player1_id=test_player.id,
        team1_player2_id=p2.id,
        team2_player1_id=p3.id,
        team2_player2_id=p4.id,
        team1_score=21,
        team2_score=15,
        winner=1,
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
        id="other_loc",
        name="Other Beach",
        city="Other City",
        state="CA",
        slug="other-city",
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
        player_id=test_player.id,
        season_id=season.id,
        games=5,
        wins=4,
        points=12,
        win_rate=0.8,
        avg_point_diff=3.0,
    )
    stats2 = PlayerSeasonStats(
        player_id=player2.id,
        season_id=season.id,
        games=5,
        wins=2,
        points=6,
        win_rate=0.4,
        avg_point_diff=-1.0,
    )
    db_session.add_all([stats1, stats2])

    # Session + match (league_id set so gap-game-aware queries can find it)
    sess = Session(
        date="2026-02-01",
        name="Session 1",
        status=SessionStatus.SUBMITTED,
        season_id=season.id,
        league_id=league.id,
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)

    match = Match(
        session_id=sess.id,
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
async def test_get_public_player_with_stats(db_session, test_player, test_user, test_location):
    """Player with show_game_history=True returns full profile data to any viewer."""
    # Opt the user into showing game history so W-L is visible to unauthenticated viewers.
    # Under the new privacy model, W-L is gated on show_game_history (not profile_is_private).
    user = await db_session.get(User, test_user["id"])
    user.show_game_history = True
    db_session.add(user)

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
    assert result["game_history_visible"] is True
    assert "created_at" in result
    assert "updated_at" in result


@pytest.mark.asyncio
async def test_get_public_player_show_game_history_false_hides_wl(
    db_session, test_player, test_user
):
    """
    Player with show_game_history=False hides W-L but keeps rating + games visible.

    Under the new privacy model profile_is_private is a no-op for display;
    only show_game_history gates W-L for non-owner viewers.
    """
    # Ensure show_game_history=False (the default — explicit here for clarity)
    user = await db_session.get(User, test_user["id"])
    user.show_game_history = False
    db_session.add(user)

    stats = PlayerGlobalStats(
        player_id=test_player.id, total_games=20, total_wins=12, current_rating=1300.0
    )
    db_session.add(stats)
    await db_session.commit()

    # No viewer_user — unauthenticated viewer
    result = await public_service.get_public_player(db_session, test_player.id)

    assert result is not None
    # Rating and game count always visible
    assert result["stats"]["current_rating"] == 1300.0
    assert result["stats"]["total_games"] == 20
    # W-L hidden
    assert result["stats"]["total_wins"] is None
    assert result["stats"]["win_rate"] is None
    assert result["game_history_visible"] is False
    # League memberships still populated (not gated on show_game_history)
    assert "league_memberships" in result


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
async def test_get_public_player_zero_games_visible_to_friend(db_session, test_player):
    """Accepted friends can open a direct profile before the player has games."""
    viewer_user = User(phone_number="+15559990101", password_hash="hash", is_verified=True)
    db_session.add(viewer_user)
    await db_session.flush()
    viewer_player = Player(full_name="Friend Viewer", user_id=viewer_user.id)
    db_session.add(viewer_player)
    await db_session.flush()

    p1, p2 = sorted([viewer_player.id, test_player.id])
    db_session.add(Friend(player1_id=p1, player2_id=p2, created_by=viewer_player.id))
    db_session.add(
        PlayerGlobalStats(
            player_id=test_player.id, total_games=0, total_wins=0, current_rating=1200.0
        )
    )
    await db_session.commit()

    result = await public_service.get_public_player(
        db_session, test_player.id, viewer_user={"id": viewer_user.id}
    )

    assert result is not None
    assert result["id"] == test_player.id
    assert result["stats"]["total_games"] == 0
    assert result["friend_status"] == "friend"
    assert result["friend_request_id"] is None


@pytest.mark.asyncio
async def test_get_public_player_exposes_incoming_request_action(db_session, test_player):
    """A receiver can open a zero-game sender profile and use its request id."""
    viewer_user = User(phone_number="+15559990102", password_hash="hash", is_verified=True)
    db_session.add(viewer_user)
    await db_session.flush()
    viewer_player = Player(full_name="Request Receiver", user_id=viewer_user.id)
    db_session.add(viewer_player)
    await db_session.flush()
    request = FriendRequest(
        sender_player_id=test_player.id,
        receiver_player_id=viewer_player.id,
        status="pending",
    )
    db_session.add_all(
        [
            request,
            PlayerGlobalStats(
                player_id=test_player.id,
                total_games=0,
                total_wins=0,
                current_rating=1200.0,
            ),
        ]
    )
    await db_session.commit()

    result = await public_service.get_public_player(
        db_session, test_player.id, viewer_user={"id": viewer_user.id}
    )

    assert result is not None
    assert result["friend_status"] == "pending_incoming"
    assert result["friend_request_id"] == request.id


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
        id="orphan_loc",
        name="Orphan Beach",
        city="Orphan City",
        state="TX",
        region_id=None,
        slug="orphan-city",
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
        player_id=test_player.id,
        total_games=5,
        total_wins=3,
        current_rating=1250.0,
    )
    db_session.add(stats)
    await db_session.commit()

    result = await public_service.get_public_locations(db_session)
    loc = result[0]["locations"][0]
    assert loc["player_count"] == 1


@pytest.mark.asyncio
async def test_get_public_locations_excludes_zero_game_players(
    db_session, test_location, test_player
):
    """Players with 0 games are not counted."""
    test_player.location_id = test_location.id
    db_session.add(test_player)

    stats = PlayerGlobalStats(
        player_id=test_player.id,
        total_games=0,
        total_wins=0,
        current_rating=1200.0,
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
async def test_get_public_location_excludes_zero_game_players(
    db_session, test_location, test_player
):
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
        date="2026-02-01",
        name="Session 1",
        status=SessionStatus.SUBMITTED,
        season_id=season.id,
        league_id=league.id,
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
    for i, (name, gender, level) in enumerate(
        [
            ("Alice Johnson", "female", "intermediate"),
            ("Bob Smith", "male", "advanced"),
            ("Charlie Brown", "male", "beginner"),
            ("Diana Prince", "female", "advanced"),
        ]
    ):
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
    stats = PlayerGlobalStats(player_id=p.id, total_games=5, total_wins=2, current_rating=1200.0)
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


# ============================================================================
# Privacy model: get_public_league standings include ALL players (including private)
# ============================================================================


@pytest_asyncio.fixture
async def league_with_private_and_public_player(db_session):
    """
    A public league whose season standings contain one private and one public player.

    Both players appear in standings — the privacy flag only gates W-L on the
    individual player profile, not on league standings.
    The public player must appear in both members and standings.

    Design notes:
    - Self-contained (no shared test_region/test_location dependency) so it is
      robust against the pre-existing truncation-deadlock flakiness documented in
      MEMORY.md that can leave 'test_region' in the DB between test runs.
    - Users are inserted directly via ORM (not via user_service.create_user) to
      avoid the mid-fixture commit that create_user performs internally.  That
      intermediate commit causes asyncpg FK visibility issues on the subsequent
      player INSERT when the connection pool reassigns the connection.
    """
    import uuid
    import datetime as _dt
    import bcrypt

    # Unique IDs so this fixture never conflicts with test_region / test_location
    uid_suffix = uuid.uuid4().hex[:8]
    region_id = f"fixc_region_{uid_suffix}"
    location_id = f"fixc_loc_{uid_suffix}"
    ph = bcrypt.hashpw(b"pw", bcrypt.gensalt()).decode()

    # Batch all schema objects into as few commits as possible.
    # Region + Location first (location has FK to region).
    region = Region(id=region_id, name=f"Fix-C Region {uid_suffix}")
    db_session.add(region)
    await db_session.flush()

    location = Location(
        id=location_id,
        name="Fix-C Beach",
        city="Fix-C City",
        state="CA",
        region_id=region_id,
        slug=None,
    )
    db_session.add(location)
    await db_session.flush()

    # Users — one public, one private.  Direct ORM insert avoids the mid-fixture
    # session.commit() that user_service.create_user() performs.
    pub_user = User(
        phone_number=f"+1555{uid_suffix[:7]}1",
        password_hash=ph,
        email=f"standings_public_{uid_suffix}@example.com",
        is_verified=True,
        profile_is_private=False,
    )
    priv_user = User(
        phone_number=f"+1555{uid_suffix[:7]}2",
        password_hash=ph,
        email=f"standings_private_{uid_suffix}@example.com",
        is_verified=True,
        profile_is_private=True,
    )
    db_session.add_all([pub_user, priv_user])
    await db_session.flush()

    # Players linked to those users.  Flush to obtain IDs, then commit.
    # expire_on_commit=False (set on the test session maker) means object
    # attributes survive the commit without needing a refresh call.
    pub_player = Player(full_name="Public Standings Player", user_id=pub_user.id)
    priv_player = Player(full_name="Private Standings Player", user_id=priv_user.id)
    db_session.add_all([pub_player, priv_player])
    await db_session.flush()
    await db_session.commit()

    # League
    league = League(name="Standings Test League", location_id=location_id, is_public=True)
    db_session.add(league)
    await db_session.flush()
    await db_session.commit()

    db_session.add(LeagueMember(league_id=league.id, player_id=pub_player.id, role="member"))
    db_session.add(LeagueMember(league_id=league.id, player_id=priv_player.id, role="member"))

    # Season
    season = Season(
        league_id=league.id,
        name="Privacy Season",
        start_date=_dt.date(2026, 1, 1),
        end_date=_dt.date(2026, 12, 31),
    )
    db_session.add(season)
    await db_session.flush()
    await db_session.commit()

    # Season stats — private player has MORE points; both appear in standings
    priv_stats = PlayerSeasonStats(
        player_id=priv_player.id,
        season_id=season.id,
        games=10,
        wins=8,
        points=20.0,
        win_rate=0.8,
        avg_point_diff=4.0,
    )
    pub_stats = PlayerSeasonStats(
        player_id=pub_player.id,
        season_id=season.id,
        games=10,
        wins=4,
        points=10.0,
        win_rate=0.4,
        avg_point_diff=1.0,
    )
    db_session.add_all([priv_stats, pub_stats])
    await db_session.commit()

    return {
        "league": league,
        "season": season,
        "pub_player": pub_player,
        "priv_player": priv_player,
    }


@pytest.mark.asyncio
async def test_private_player_visible_in_league_standings(
    db_session, league_with_private_and_public_player
):
    """
    New privacy model: a private player's profile_is_private flag does NOT
    affect league standings.  Both public and private players appear in
    standings with their full stats.

    The privacy flag only gates W-L on the individual player-profile endpoint.
    """
    data = league_with_private_and_public_player
    league = data["league"]
    pub_player = data["pub_player"]
    priv_player = data["priv_player"]

    result = await public_service.get_public_league(db_session, league.id)

    assert result is not None

    # Both players appear in the members list
    member_names = [m["full_name"] for m in result["members"]]
    assert pub_player.full_name in member_names, "Public player must appear in members"
    assert priv_player.full_name in member_names, "Private player must appear in members"

    # Both players must appear in standings (privacy no longer filters standings)
    standings_names = [s["full_name"] for s in result["standings"]]
    assert pub_player.full_name in standings_names, "Public player must appear in standings"
    assert priv_player.full_name in standings_names, (
        "Private player must appear in standings — profile_is_private no longer filters"
    )


@pytest.mark.asyncio
async def test_standings_ranks_include_all_players(
    db_session, league_with_private_and_public_player
):
    """
    Both public and private players count toward standings rank.

    The private player has more points (20.0) so they should be rank 1.
    The public player (10.0 pts) should be rank 2.
    """
    data = league_with_private_and_public_player
    result = await public_service.get_public_league(db_session, data["league"].id)

    standings = result["standings"]
    assert len(standings) == 2, f"Expected 2 standing entries (both players), got {len(standings)}"

    # Ranks should be contiguous 1..2
    ranks = [s["rank"] for s in standings]
    assert sorted(ranks) == [1, 2], f"Expected ranks [1, 2] but got {ranks}"

    # Private player (more points) should be rank 1
    priv_player = data["priv_player"]
    priv_entry = next((s for s in standings if s["full_name"] == priv_player.full_name), None)
    assert priv_entry is not None, "Private player must be in standings"
    assert priv_entry["rank"] == 1, (
        f"Private player with more points should be rank 1, got rank {priv_entry['rank']}"
    )


@pytest.mark.asyncio
async def test_placeholder_player_visible_in_standings(db_session, test_location):
    """
    Fix C: Placeholder players (user_id=NULL) have no User row and must be
    treated as public — they should appear in standings.
    """
    import datetime as _dt

    league = League(name="Placeholder League", location_id=test_location.id, is_public=True)
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)

    # Placeholder player has no user
    placeholder = Player(full_name="Placeholder Pat", user_id=None)
    db_session.add(placeholder)
    await db_session.commit()
    await db_session.refresh(placeholder)

    db_session.add(LeagueMember(league_id=league.id, player_id=placeholder.id, role="member"))

    season = Season(
        league_id=league.id,
        name="Placeholder Season",
        start_date=_dt.date(2026, 1, 1),
        end_date=_dt.date(2026, 12, 31),
    )
    db_session.add(season)
    await db_session.commit()
    await db_session.refresh(season)

    stats = PlayerSeasonStats(
        player_id=placeholder.id,
        season_id=season.id,
        games=5,
        wins=3,
        points=8.0,
        win_rate=0.6,
        avg_point_diff=2.0,
    )
    db_session.add(stats)
    await db_session.commit()

    result = await public_service.get_public_league(db_session, league.id)

    assert result is not None
    standings_names = [s["full_name"] for s in result["standings"]]
    assert "Placeholder Pat" in standings_names, (
        "Placeholder (no user) player must appear in standings"
    )
