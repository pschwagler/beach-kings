"""
Privacy feature tests.

Covers:
1. PUT /api/users/me persists profile_is_private and show_game_history
2. Public profile of a private player returns floor only to a stranger
3. Public player with public profile hides game history when show_game_history=False
4. Public player + show_game_history=True exposes game_history_visible=True
5. Owner always sees everything (game_history_visible=True)
6. League-mate sees shared-league stats on a private player (via get_public_player)
7. GET /api/public/courts/{slug}/check-ins returns level/gender counts, no names

Tests 1 and 7 use the TestClient + monkeypatching pattern (no DB).
Tests 2-6 use the db_session fixture for full-service integration.
"""

import pytest
import pytest_asyncio
import bcrypt
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.database.models import (
    Court,
    CourtCheckIn,
    League,
    LeagueMember,
    Location,
    Player,
    PlayerGlobalStats,
    Region,
    User,
)
from backend.services import auth_service, court_service, public_service, user_service


# ============================================================================
# Shared fixtures (DB-backed)
# ============================================================================


@pytest_asyncio.fixture
async def test_region(db_session):
    """Create a test region."""
    region = Region(id="priv_region", name="Privacy Test Region")
    db_session.add(region)
    await db_session.commit()
    await db_session.refresh(region)
    return region


@pytest_asyncio.fixture
async def test_location(db_session, test_region):
    """Create a test location."""
    loc = Location(
        id="priv_loc",
        name="Privacy Beach",
        city="Privacy City",
        state="CA",
        region_id=test_region.id,
        slug="privacy-city",
    )
    db_session.add(loc)
    await db_session.commit()
    await db_session.refresh(loc)
    return loc


@pytest_asyncio.fixture
async def owner_user(db_session):
    """User whose player profile will be tested for privacy."""
    ph = bcrypt.hashpw("pw".encode(), bcrypt.gensalt()).decode()
    user_id = await user_service.create_user(
        session=db_session,
        phone_number="+15551110001",
        password_hash=ph,
        email="privacy_owner@example.com",
    )
    return {"id": user_id}


@pytest_asyncio.fixture
async def owner_player(db_session, owner_user, test_location):
    """Player belonging to owner_user."""
    player = Player(
        full_name="Privacy Owner",
        user_id=owner_user["id"],
        gender="male",
        level="advanced",
        city="Privacy City",
        state="CA",
        location_id=test_location.id,
    )
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)
    return player


@pytest_asyncio.fixture
async def owner_stats(db_session, owner_player):
    """Global stats for the owner player (>0 games so player is public-visible)."""
    stats = PlayerGlobalStats(
        player_id=owner_player.id,
        total_games=10,
        total_wins=6,
        current_rating=1500.0,
    )
    db_session.add(stats)
    await db_session.commit()
    await db_session.refresh(stats)
    return stats


@pytest_asyncio.fixture
async def stranger_user(db_session):
    """Unrelated user — viewer who shares no league with the owner."""
    ph = bcrypt.hashpw("pw".encode(), bcrypt.gensalt()).decode()
    user_id = await user_service.create_user(
        session=db_session,
        phone_number="+15551110002",
        password_hash=ph,
        email="privacy_stranger@example.com",
    )
    return {"id": user_id}


@pytest_asyncio.fixture
async def league_mate_user(db_session):
    """User who shares a league with the owner player."""
    ph = bcrypt.hashpw("pw".encode(), bcrypt.gensalt()).decode()
    user_id = await user_service.create_user(
        session=db_session,
        phone_number="+15551110003",
        password_hash=ph,
        email="privacy_leaguemate@example.com",
    )
    return {"id": user_id}


@pytest_asyncio.fixture
async def league_mate_player(db_session, league_mate_user, test_location):
    """Player belonging to league_mate_user."""
    player = Player(
        full_name="League Mate",
        user_id=league_mate_user["id"],
        location_id=test_location.id,
    )
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)
    return player


@pytest_asyncio.fixture
async def shared_league(db_session, test_location, owner_player, league_mate_player):
    """A public league that both owner and league-mate belong to."""
    league = League(name="Shared League", location_id=test_location.id, is_public=True)
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)

    db_session.add(LeagueMember(league_id=league.id, player_id=owner_player.id, role="member"))
    db_session.add(
        LeagueMember(league_id=league.id, player_id=league_mate_player.id, role="member")
    )
    await db_session.commit()
    return league


# ============================================================================
# Helper — flip User privacy flags directly on the DB row
# ============================================================================


async def _set_privacy_flags(
    db_session,
    user_id: int,
    profile_is_private: bool,
    show_game_history: bool,
) -> None:
    """Update a user's privacy flags in-place for test setup."""
    from sqlalchemy import select, update
    from sqlalchemy.sql import func

    await db_session.execute(
        update(User)
        .where(User.id == user_id)
        .values(
            profile_is_private=profile_is_private,
            show_game_history=show_game_history,
            updated_at=func.now(),
        )
    )
    await db_session.commit()


# ============================================================================
# Task 1: PUT /api/users/me persists both toggles
# ============================================================================


class TestPutUserMePrivacyToggles:
    """PUT /api/users/me should persist profile_is_private and show_game_history."""

    def _make_authed_client(self, monkeypatch, user_id: int = 1):
        """Return a TestClient with auth mocked out."""

        def fake_verify_token(token: str):
            return {"user_id": user_id, "phone_number": "+10000000000"}

        monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
        return TestClient(app), {"Authorization": "Bearer dummy"}

    def test_persist_profile_is_private_true(self, monkeypatch):
        """Setting profile_is_private=True is persisted and echoed in the response."""
        client, headers = self._make_authed_client(monkeypatch)
        captured: dict = {}

        async def fake_update_user(
            session, user_id, email=None, profile_is_private=None, show_game_history=None
        ):
            captured.update(
                profile_is_private=profile_is_private,
                show_game_history=show_game_history,
            )
            return True

        async def fake_get_user_by_id(session, uid: int):
            return {
                "id": uid,
                "phone_number": "+10000000000",
                "email": None,
                "is_verified": True,
                "created_at": "2024-01-01T00:00:00",
                "profile_is_private": True,
                "show_game_history": False,
            }

        monkeypatch.setattr(user_service, "update_user", fake_update_user, raising=True)
        monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)

        response = client.put(
            "/api/users/me",
            json={"profile_is_private": True},
            headers=headers,
        )

        assert response.status_code == 200
        assert captured["profile_is_private"] is True
        data = response.json()
        assert data["profile_is_private"] is True

    def test_persist_show_game_history_true(self, monkeypatch):
        """Setting show_game_history=True is persisted and echoed in the response."""
        client, headers = self._make_authed_client(monkeypatch)
        captured: dict = {}

        async def fake_update_user(
            session, user_id, email=None, profile_is_private=None, show_game_history=None
        ):
            captured.update(show_game_history=show_game_history)
            return True

        async def fake_get_user_by_id(session, uid: int):
            return {
                "id": uid,
                "phone_number": "+10000000000",
                "email": None,
                "is_verified": True,
                "created_at": "2024-01-01T00:00:00",
                "profile_is_private": False,
                "show_game_history": True,
            }

        monkeypatch.setattr(user_service, "update_user", fake_update_user, raising=True)
        monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)

        response = client.put(
            "/api/users/me",
            json={"show_game_history": True},
            headers=headers,
        )

        assert response.status_code == 200
        assert captured["show_game_history"] is True
        data = response.json()
        assert data["show_game_history"] is True

    def test_persist_both_toggles_at_once(self, monkeypatch):
        """Both privacy toggles can be set in a single request."""
        client, headers = self._make_authed_client(monkeypatch)
        captured: dict = {}

        async def fake_update_user(
            session, user_id, email=None, profile_is_private=None, show_game_history=None
        ):
            captured.update(
                profile_is_private=profile_is_private,
                show_game_history=show_game_history,
            )
            return True

        async def fake_get_user_by_id(session, uid: int):
            return {
                "id": uid,
                "phone_number": "+10000000000",
                "email": None,
                "is_verified": True,
                "created_at": "2024-01-01T00:00:00",
                "profile_is_private": True,
                "show_game_history": True,
            }

        monkeypatch.setattr(user_service, "update_user", fake_update_user, raising=True)
        monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)

        response = client.put(
            "/api/users/me",
            json={"profile_is_private": True, "show_game_history": True},
            headers=headers,
        )

        assert response.status_code == 200
        assert captured["profile_is_private"] is True
        assert captured["show_game_history"] is True


# ============================================================================
# Tasks 2-6: Public player privacy gating (DB-backed service tests)
# ============================================================================


@pytest.mark.asyncio
async def test_private_player_stranger_gets_floor_only(
    db_session, owner_user, owner_player, owner_stats, stranger_user
):
    """
    A private player's profile returns only the floor when viewed by a stranger.

    Floor = name, avatar, level, city/state, total_games.
    W-L, rank, win%, leagues are hidden.
    """
    await _set_privacy_flags(db_session, owner_user["id"], profile_is_private=True, show_game_history=False)

    result = await public_service.get_public_player(
        db_session, owner_player.id, viewer_user=stranger_user
    )

    assert result is not None
    # Floor fields always present
    assert result["full_name"] == "Privacy Owner"
    assert result["level"] == "advanced"
    assert result["city"] == "Privacy City"
    assert result["stats"]["total_games"] == 10

    # Full-detail fields hidden for non-self viewer
    assert result["stats"]["total_wins"] is None
    assert result["stats"]["win_rate"] is None
    assert result["stats"]["current_rating"] is None
    assert result["league_memberships"] == []
    assert result["game_history_visible"] is False
    assert result["profile_is_private"] is True


@pytest.mark.asyncio
async def test_public_player_hides_game_history_by_default(
    db_session, owner_user, owner_player, owner_stats, stranger_user
):
    """
    Public profile (profile_is_private=False) with show_game_history=False
    exposes W-L and rank but signals game_history_visible=False.
    """
    await _set_privacy_flags(db_session, owner_user["id"], profile_is_private=False, show_game_history=False)

    result = await public_service.get_public_player(
        db_session, owner_player.id, viewer_user=stranger_user
    )

    assert result is not None
    # Full stats visible
    assert result["stats"]["total_wins"] == 6
    assert result["stats"]["win_rate"] is not None
    assert result["stats"]["current_rating"] is not None
    # But game history NOT visible
    assert result["game_history_visible"] is False


@pytest.mark.asyncio
async def test_public_player_shows_game_history_when_enabled(
    db_session, owner_user, owner_player, owner_stats, stranger_user
):
    """
    Public profile + show_game_history=True signals game_history_visible=True for non-self.
    """
    await _set_privacy_flags(db_session, owner_user["id"], profile_is_private=False, show_game_history=True)

    result = await public_service.get_public_player(
        db_session, owner_player.id, viewer_user=stranger_user
    )

    assert result is not None
    assert result["game_history_visible"] is True


@pytest.mark.asyncio
async def test_owner_sees_everything_even_when_private(
    db_session, owner_user, owner_player, owner_stats
):
    """
    Owner (viewer whose user_id matches the player's user_id) always sees full detail,
    regardless of profile_is_private or show_game_history.
    """
    await _set_privacy_flags(db_session, owner_user["id"], profile_is_private=True, show_game_history=False)

    result = await public_service.get_public_player(
        db_session, owner_player.id, viewer_user=owner_user
    )

    assert result is not None
    # Owner sees full stats
    assert result["stats"]["total_wins"] == 6
    assert result["stats"]["current_rating"] is not None
    # Owner always has game_history_visible=True
    assert result["game_history_visible"] is True


@pytest.mark.asyncio
async def test_league_mate_sees_shared_league_in_memberships(
    db_session,
    owner_user,
    owner_player,
    owner_stats,
    shared_league,
    league_mate_user,
):
    """
    A league-mate can see the shared league in the owner's public profile
    even when the owner's profile is public (the league-mate exception is about
    visibility within shared leagues, not about bypassing the private floor).

    When the profile IS public, league memberships include the shared league for
    all viewers including league-mates.
    """
    # Public profile — league-mate sees the shared league
    await _set_privacy_flags(db_session, owner_user["id"], profile_is_private=False, show_game_history=False)

    result = await public_service.get_public_player(
        db_session, owner_player.id, viewer_user=league_mate_user
    )

    assert result is not None
    league_ids = [m["league_id"] for m in result["league_memberships"]]
    assert shared_league.id in league_ids


@pytest.mark.asyncio
async def test_private_player_league_mate_still_gets_floor_from_public_endpoint(
    db_session,
    owner_user,
    owner_player,
    owner_stats,
    shared_league,
    league_mate_user,
):
    """
    When a player is private, even a league-mate gets the floor only from the
    cross-league public profile endpoint.  The league-mate exception only grants
    visibility within shared-league stat pages — NOT the cross-league profile.
    """
    await _set_privacy_flags(db_session, owner_user["id"], profile_is_private=True, show_game_history=False)

    result = await public_service.get_public_player(
        db_session, owner_player.id, viewer_user=league_mate_user
    )

    assert result is not None
    # Still floor only — league-mate exception does not unlock the full public profile
    assert result["stats"]["total_wins"] is None
    assert result["stats"]["current_rating"] is None
    assert result["league_memberships"] == []
    assert result["game_history_visible"] is False


# ============================================================================
# Task 7: Check-ins endpoint returns level/gender counts, no names
# ============================================================================


@pytest.mark.asyncio
async def test_get_active_check_ins_aggregate_shape(db_session, test_region, test_location):
    """
    get_active_check_ins returns { total, breakdown: [{level, gender, count}] }.
    No player names or IDs are exposed.
    """
    court = Court(
        name="Privacy Court",
        slug="privacy-court",
        location_id=test_location.id,
        status="approved",
        is_active=True,
    )
    db_session.add(court)
    await db_session.commit()
    await db_session.refresh(court)

    ph = bcrypt.hashpw("pw".encode(), bcrypt.gensalt()).decode()
    uid1 = await user_service.create_user(
        session=db_session,
        phone_number="+15559001001",
        password_hash=ph,
        email="ci_player1@example.com",
    )
    uid2 = await user_service.create_user(
        session=db_session,
        phone_number="+15559001002",
        password_hash=ph,
        email="ci_player2@example.com",
    )

    p1 = Player(full_name="Checkin P1", user_id=uid1, level="intermediate", gender="male")
    p2 = Player(full_name="Checkin P2", user_id=uid2, level="advanced", gender="female")
    db_session.add_all([p1, p2])
    await db_session.commit()
    await db_session.refresh(p1)
    await db_session.refresh(p2)

    await court_service.check_in(db_session, court.id, p1.id)
    await court_service.check_in(db_session, court.id, p2.id)

    result = await court_service.get_active_check_ins(db_session, court.id)

    assert result["total"] == 2
    assert "breakdown" in result
    # No identity fields
    assert "checked_in_players" not in result
    for entry in result["breakdown"]:
        assert "player_name" not in entry
        assert "player_id" not in entry
        assert "avatar" not in entry
        assert "level" in entry
        assert "gender" in entry
        assert "count" in entry

    # Breakdown counts sum to total
    assert sum(b["count"] for b in result["breakdown"]) == 2


@pytest.mark.asyncio
async def test_get_active_check_ins_empty_court(db_session, test_region, test_location):
    """Empty court returns total=0 and an empty breakdown."""
    court = Court(
        name="Empty Privacy Court",
        slug="empty-privacy-court",
        location_id=test_location.id,
        status="approved",
        is_active=True,
    )
    db_session.add(court)
    await db_session.commit()
    await db_session.refresh(court)

    result = await court_service.get_active_check_ins(db_session, court.id)
    assert result["total"] == 0
    assert result["breakdown"] == []


def test_public_check_ins_endpoint_returns_aggregate(monkeypatch):
    """
    GET /api/public/courts/{slug}/check-ins returns aggregate counts, no names.
    Route-level test using monkeypatched service layer.
    """

    async def fake_get_court_id(session, slug):
        return 42

    async def fake_get_check_ins(session, court_id):
        return {
            "total": 3,
            "breakdown": [
                {"level": "intermediate", "gender": "male", "count": 2},
                {"level": None, "gender": None, "count": 1},
            ],
        }

    monkeypatch.setattr(court_service, "get_court_id_by_slug", fake_get_court_id, raising=True)
    monkeypatch.setattr(court_service, "get_active_check_ins", fake_get_check_ins, raising=True)

    client = TestClient(app)
    response = client.get("/api/public/courts/some-court/check-ins")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3
    assert len(data["breakdown"]) == 2
    assert "checked_in_players" not in data
    for entry in data["breakdown"]:
        assert "player_name" not in entry
        assert "count" in entry
