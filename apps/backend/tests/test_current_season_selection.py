"""Tests for Phase 6a: centralized "current display season" selection.

Verifies that both get_league_detail and get_user_leagues prefer a genuinely
active season over a later-start inactive season, fall back to the most-recent
season when nothing is active, and return None/null when no seasons exist.

The regression: before this change, both functions used
    row_number() over(order_by Season.start_date.desc(), Season.id.desc())
which picked the latest season by start_date.  A future-dated season therefore
silently displaced an in-progress season as the "current" one.
"""

import pytest
import pytest_asyncio
from datetime import date, timedelta

import bcrypt
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import League, LeagueMember, Player, Season
from backend.services import data_service
from backend.services import user_service


# ---------------------------------------------------------------------------
# Date constants (relative to today so tests never go stale)
# ---------------------------------------------------------------------------

TODAY = date.today()
ACTIVE_START = TODAY - timedelta(days=5)   # 5 days ago
ACTIVE_END = TODAY + timedelta(days=5)     # 5 days from now
FUTURE_START = TODAY + timedelta(days=10)  # clearly not yet started
FUTURE_END = TODAY + timedelta(days=40)
PAST_START = TODAY - timedelta(days=60)
PAST_END = TODAY - timedelta(days=10)      # ended 10 days ago


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def user(db_session: AsyncSession):
    """A minimal user record."""
    password_hash = bcrypt.hashpw(b"test1234", bcrypt.gensalt()).decode()
    user_id = await user_service.create_user(
        session=db_session,
        phone_number="+15550001111",
        password_hash=password_hash,
        email="season_sel@example.com",
    )
    return {"id": user_id}


@pytest_asyncio.fixture
async def player(db_session: AsyncSession, user):
    """A player linked to the test user."""
    p = Player(full_name="Season Sel Player", user_id=user["id"])
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


@pytest_asyncio.fixture
async def league(db_session: AsyncSession, player):
    """A league whose creator is the test player."""
    lg = await data_service.create_league(
        session=db_session,
        name="Season Selection League",
        description=None,
        location_id=None,
        is_open=True,
        whatsapp_group_id=None,
        creator_user_id=player.user_id,
    )
    return lg


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


async def _add_season(
    db_session: AsyncSession,
    league_id: int,
    *,
    name: str,
    start_date: date | None,
    end_date: date | None,
) -> Season:
    """Persist a Season and return the refreshed ORM object."""
    s = Season(
        league_id=league_id,
        name=name,
        start_date=start_date,
        end_date=end_date,
    )
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)
    return s


# ===========================================================================
# 1. Active season preferred over later-start NOT-YET-STARTED season
#    (THE primary regression test)
# ===========================================================================


@pytest.mark.asyncio
async def test_get_league_detail_prefers_active_over_later_start(
    db_session: AsyncSession, league, user, player
):
    """get_league_detail must return the in-progress season, not the future one.

    Setup:
      (a) active season  [today-5 .. today+5]  — genuinely active RIGHT NOW
      (b) future season  [today+10 .. today+40] — later start_date, NOT yet active

    Before the fix the row_number approach picked (b) as "current" because
    its start_date is larger.  After the fix (a) must win.
    """
    active_season = await _add_season(
        db_session,
        league["id"],
        name="Active Season",
        start_date=ACTIVE_START,
        end_date=ACTIVE_END,
    )
    future_season = await _add_season(
        db_session,
        league["id"],
        name="Future Season",
        start_date=FUTURE_START,
        end_date=FUTURE_END,
    )

    detail = await data_service.get_league_detail(db_session, league["id"], user["id"])

    assert detail is not None
    # The active season is selected — not the future one.
    assert detail["current_season_id"] == active_season.id, (
        f"Expected active season (id={active_season.id}) but got "
        f"season id={detail['current_season_id']} (future season id={future_season.id})"
    )
    assert detail["current_season_name"] == "Active Season"
    # is_active must be True for the in-progress season.
    assert detail["is_active"] is True
    # Negative: the future season was NOT selected.
    assert detail["current_season_id"] != future_season.id


@pytest.mark.asyncio
async def test_get_user_leagues_prefers_active_over_later_start(
    db_session: AsyncSession, league, user, player
):
    """get_user_leagues must surface the in-progress season, not the future one.

    Same two-season setup as above; validates the get_user_leagues path.
    """
    active_season = await _add_season(
        db_session,
        league["id"],
        name="Active Season",
        start_date=ACTIVE_START,
        end_date=ACTIVE_END,
    )
    future_season = await _add_season(
        db_session,
        league["id"],
        name="Future Season",
        start_date=FUTURE_START,
        end_date=FUTURE_END,
    )

    leagues = await data_service.get_user_leagues(db_session, user["id"])

    assert len(leagues) == 1
    entry = leagues[0]
    cs = entry["current_season"]
    assert cs is not None, "current_season must not be None when seasons exist"
    assert cs["id"] == active_season.id, (
        f"Expected active season (id={active_season.id}) but got "
        f"season id={cs['id']} (future season id={future_season.id})"
    )
    assert cs["name"] == "Active Season"
    assert cs["is_active"] is True
    # Negative: future season must not appear as current.
    assert cs["id"] != future_season.id


# ===========================================================================
# 2. Only an ended season exists → it is shown, is_active False
#    (preserves the existing display-fallback behaviour)
# ===========================================================================


@pytest.mark.asyncio
async def test_get_league_detail_shows_ended_season_as_inactive(
    db_session: AsyncSession, league, user, player
):
    """When the only season is in the past, get_league_detail still shows it.

    The fallback to most-recent-by-start_date must work so ended leagues don't
    appear to have no season at all.  is_active must be False.
    """
    ended_season = await _add_season(
        db_session,
        league["id"],
        name="Ended Season",
        start_date=PAST_START,
        end_date=PAST_END,
    )

    detail = await data_service.get_league_detail(db_session, league["id"], user["id"])

    assert detail is not None
    assert detail["current_season_id"] == ended_season.id
    assert detail["current_season_name"] == "Ended Season"
    assert detail["is_active"] is False


@pytest.mark.asyncio
async def test_get_user_leagues_shows_ended_season_as_inactive(
    db_session: AsyncSession, league, user, player
):
    """When the only season is in the past, get_user_leagues still surfaces it.

    is_active must be False so the UI can signal the season is over.
    """
    ended_season = await _add_season(
        db_session,
        league["id"],
        name="Ended Season",
        start_date=PAST_START,
        end_date=PAST_END,
    )

    leagues = await data_service.get_user_leagues(db_session, user["id"])

    assert len(leagues) == 1
    cs = leagues[0]["current_season"]
    assert cs is not None, "current_season must not be None for a league with one ended season"
    assert cs["id"] == ended_season.id
    assert cs["name"] == "Ended Season"
    assert cs["is_active"] is False


# ===========================================================================
# 3. No seasons → current season is None / null
# ===========================================================================


@pytest.mark.asyncio
async def test_get_league_detail_no_seasons_current_is_none(
    db_session: AsyncSession, league, user, player
):
    """A brand-new league with no seasons must have current_season_id=None."""
    detail = await data_service.get_league_detail(db_session, league["id"], user["id"])

    assert detail is not None
    assert detail["current_season_id"] is None
    assert detail["current_season_name"] is None
    assert detail["is_active"] is False


@pytest.mark.asyncio
async def test_get_user_leagues_no_seasons_current_is_null(
    db_session: AsyncSession, league, user, player
):
    """A brand-new league with no seasons must have current_season=None."""
    leagues = await data_service.get_user_leagues(db_session, user["id"])

    assert len(leagues) == 1
    assert leagues[0]["current_season"] is None
    assert leagues[0]["games_played"] == 0
    assert leagues[0]["standings"] == []


# ===========================================================================
# 4. Two ended seasons → most-recent by start_date is shown (fallback order)
# ===========================================================================


@pytest.mark.asyncio
async def test_get_league_detail_fallback_picks_most_recent_ended(
    db_session: AsyncSession, league, user, player
):
    """With two ended seasons the most-recent one (by start_date) is shown."""
    # Add older season first so DB id ordering doesn't accidentally mask bugs.
    _older = await _add_season(
        db_session,
        league["id"],
        name="Older Ended",
        start_date=PAST_START - timedelta(days=60),
        end_date=PAST_START - timedelta(days=1),
    )
    newer_ended = await _add_season(
        db_session,
        league["id"],
        name="Newer Ended",
        start_date=PAST_START,
        end_date=PAST_END,
    )

    detail = await data_service.get_league_detail(db_session, league["id"], user["id"])

    assert detail is not None
    assert detail["current_season_id"] == newer_ended.id
    assert detail["is_active"] is False


@pytest.mark.asyncio
async def test_get_user_leagues_fallback_picks_most_recent_ended(
    db_session: AsyncSession, league, user, player
):
    """With two ended seasons the most-recent one (by start_date) is shown."""
    _older = await _add_season(
        db_session,
        league["id"],
        name="Older Ended",
        start_date=PAST_START - timedelta(days=60),
        end_date=PAST_START - timedelta(days=1),
    )
    newer_ended = await _add_season(
        db_session,
        league["id"],
        name="Newer Ended",
        start_date=PAST_START,
        end_date=PAST_END,
    )

    leagues = await data_service.get_user_leagues(db_session, user["id"])

    assert len(leagues) == 1
    cs = leagues[0]["current_season"]
    assert cs is not None
    assert cs["id"] == newer_ended.id
    assert cs["is_active"] is False


# ===========================================================================
# 5. Open-ended season (end_date=None) → is_active True
#    MEDIUM-1 regression guard: old `bool(sd and ed and ...)` returned False
#    for open-ended seasons because `ed` was None (falsy).
# ===========================================================================


@pytest.mark.asyncio
async def test_get_user_leagues_open_ended_season_is_active(
    db_session: AsyncSession, league, user, player
):
    """A league with ONE open-ended season (end_date=None, past start_date) must
    appear as is_active=True in get_user_leagues.

    Regression guard: the old inline formula ``bool(start_date and end_date and ...)``
    treated end_date=None as falsy and incorrectly returned False.  The canonical
    ``_is_season_active`` helper correctly handles null bounds as open.
    """
    open_season = await _add_season(
        db_session,
        league["id"],
        name="Rolling Season",
        start_date=PAST_START,
        end_date=None,  # open-ended / rolling — no end date set
    )

    leagues = await data_service.get_user_leagues(db_session, user["id"])

    assert len(leagues) == 1
    cs = leagues[0]["current_season"]
    assert cs is not None, "current_season must not be None when a season exists"
    assert cs["id"] == open_season.id
    assert cs["is_active"] is True, (
        "An open-ended season (end_date=None) must be reported as active"
    )
