"""Tests for Bug #1: gap-game auth misclassification in session_data.py and matches routes.

Gap games (league_id SET, season_id NULL) were being treated as pickup sessions
because authorization checks branched on season_id instead of league_id.

Three-state model:
  Pickup:        league_id=NULL, season_id=NULL  → participant-only auth
  League gap:    league_id=X,    season_id=NULL  → league-admin auth
  Season game:   league_id=X,    season_id=Y    → league-admin auth
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from datetime import date, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    League,
    Player,
    Season,
    Session,
    SessionParticipant,
    User,
)
from backend.services.session_data import can_user_add_match_to_session


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def league(db_session: AsyncSession) -> League:
    """Primary league for all tests."""
    lg = League(name="Gap Auth League", is_open=True)
    db_session.add(lg)
    await db_session.commit()
    await db_session.refresh(lg)
    return lg


@pytest_asyncio.fixture
async def season(db_session: AsyncSession, league: League) -> Season:
    """Active season attached to league."""
    s = Season(
        league_id=league.id,
        name="Auth Test Season",
        start_date=date.today() - timedelta(days=10),
        end_date=None,
    )
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)
    return s


@pytest_asyncio.fixture
async def regular_user(db_session: AsyncSession) -> User:
    """A plain authenticated user with no league membership."""
    u = User(email="regular@test.example", auth_provider="phone", is_verified=True)
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest_asyncio.fixture
async def regular_player(db_session: AsyncSession, regular_user: User) -> Player:
    """Player linked to regular_user."""
    p = Player(
        full_name="Regular Player",
        first_name="Regular",
        last_name="Player",
        user_id=regular_user.id,
    )
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


# ---------------------------------------------------------------------------
# can_user_add_match_to_session: session_data.py Bug #1a
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_can_add_match_gap_game_returns_true_for_league(
    db_session: AsyncSession,
    league: League,
    regular_player: Player,
    regular_user: User,
):
    """REGRESSION (Bug #1a): gap game (league_id SET, season_id NULL) must return True.

    The old code checked ``if session_obj.get("season_id") is not None``, which
    caused gap games to fall through to the pickup participant-check.  The fix
    must branch on league_id instead.

    To expose the bug: use a different player as creator so the creator shortcut
    does not mask the failure.  The test user is not a participant and not the
    creator, so the old pickup path returns False.  The correct league-game path
    must return True unconditionally.
    """
    # Create a separate player as the session creator so regular_player/user
    # does NOT benefit from the "is creator" shortcut in the pickup branch.
    other_creator_user = User(
        email="gapgamecreator@test.example", auth_provider="phone", is_verified=True
    )
    db_session.add(other_creator_user)
    await db_session.commit()
    await db_session.refresh(other_creator_user)
    other_creator = Player(
        full_name="Gap Creator",
        first_name="Gap",
        last_name="Creator",
        user_id=other_creator_user.id,
    )
    db_session.add(other_creator)
    await db_session.commit()
    await db_session.refresh(other_creator)

    sess = Session(
        date=date.today().isoformat(),
        name="Gap Game",
        league_id=league.id,
        season_id=None,  # gap game: league_id set, no season
        created_by=other_creator.id,  # NOT regular_player — avoids creator shortcut
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)

    # session_obj dict as the route would supply it (league_id set, season_id None)
    session_obj = {
        "id": sess.id,
        "league_id": league.id,
        "season_id": None,
        "created_by": other_creator.id,
    }

    result = await can_user_add_match_to_session(db_session, sess.id, session_obj, regular_user.id)
    assert result is True, (
        "can_user_add_match_to_session must return True for gap games (league_id set, "
        "season_id None) so the caller defers to the league-admin check.  "
        "Got False — season_id branch still in use (bug #1a not fixed)."
    )


@pytest.mark.asyncio
async def test_can_add_match_season_game_returns_true(
    db_session: AsyncSession,
    league: League,
    season: Season,
    regular_player: Player,
    regular_user: User,
):
    """Season game (both league_id and season_id set) must still return True."""
    sess = Session(
        date=date.today().isoformat(),
        name="Season Game",
        league_id=league.id,
        season_id=season.id,
        created_by=regular_player.id,
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)

    session_obj = {
        "id": sess.id,
        "league_id": league.id,
        "season_id": season.id,
        "created_by": regular_player.id,
    }

    result = await can_user_add_match_to_session(db_session, sess.id, session_obj, regular_user.id)
    assert result is True


@pytest.mark.asyncio
async def test_can_add_match_pickup_non_participant_returns_false(
    db_session: AsyncSession,
    regular_player: Player,
    regular_user: User,
):
    """Pickup session (both NULL) with no participation → False."""
    other_user = User(email="other@test.example", auth_provider="phone", is_verified=True)
    db_session.add(other_user)
    await db_session.commit()
    await db_session.refresh(other_user)
    other_player = Player(
        full_name="Other Player",
        first_name="Other",
        last_name="Player",
        user_id=other_user.id,
    )
    db_session.add(other_player)
    await db_session.commit()
    await db_session.refresh(other_player)

    sess = Session(
        date=date.today().isoformat(),
        name="Pickup",
        league_id=None,
        season_id=None,
        created_by=other_player.id,  # someone else created it
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)

    session_obj = {
        "id": sess.id,
        "league_id": None,
        "season_id": None,
        "created_by": other_player.id,
    }

    result = await can_user_add_match_to_session(db_session, sess.id, session_obj, regular_user.id)
    assert result is False, "Non-participant of a pickup session must be denied"


@pytest.mark.asyncio
async def test_can_add_match_pickup_creator_returns_true(
    db_session: AsyncSession,
    regular_player: Player,
    regular_user: User,
):
    """Pickup session creator must still return True (pickup path preserved)."""
    sess = Session(
        date=date.today().isoformat(),
        name="Own Pickup",
        league_id=None,
        season_id=None,
        created_by=regular_player.id,
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)

    session_obj = {
        "id": sess.id,
        "league_id": None,
        "season_id": None,
        "created_by": regular_player.id,
    }

    result = await can_user_add_match_to_session(db_session, sess.id, session_obj, regular_user.id)
    assert result is True, "Pickup session creator must be allowed"


@pytest.mark.asyncio
async def test_can_add_match_pickup_participant_returns_true(
    db_session: AsyncSession,
    regular_player: Player,
    regular_user: User,
):
    """Pickup session participant (in session_participants) must return True."""
    other_user = User(email="creator2@test.example", auth_provider="phone", is_verified=True)
    db_session.add(other_user)
    await db_session.commit()
    await db_session.refresh(other_user)
    other_player = Player(
        full_name="Creator Two",
        first_name="Creator",
        last_name="Two",
        user_id=other_user.id,
    )
    db_session.add(other_player)
    await db_session.commit()
    await db_session.refresh(other_player)

    sess = Session(
        date=date.today().isoformat(),
        name="Pickup With Participant",
        league_id=None,
        season_id=None,
        created_by=other_player.id,
    )
    db_session.add(sess)
    await db_session.commit()
    await db_session.refresh(sess)

    # Add regular_player as participant
    db_session.add(SessionParticipant(session_id=sess.id, player_id=regular_player.id))
    await db_session.commit()

    session_obj = {
        "id": sess.id,
        "league_id": None,
        "season_id": None,
        "created_by": other_player.id,
    }

    result = await can_user_add_match_to_session(db_session, sess.id, session_obj, regular_user.id)
    assert result is True, "Session participant must be allowed to add a match"
