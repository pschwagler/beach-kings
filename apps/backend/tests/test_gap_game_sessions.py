"""Tests for Phase 3: gap-game session creation (no active season).

Covers get_or_create_active_league_session and create_league_session tolerating
a missing active season.  When no active season exists and no explicit season_id
is passed, creation must succeed with season_id=NULL (a "gap game").

Three-state model under test:
  Pickup:        league_id=NULL, season_id=NULL
  League gap:    league_id=X,    season_id=NULL
  Season game:   league_id=X,    season_id=Y   (Y.league_id == X)
"""

import pytest
import pytest_asyncio
from datetime import date, timedelta

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import League, Season, Session
from backend.services import data_service


# ---------------------------------------------------------------------------
# Date helpers (fixed at module load — same as test_resolve_active_season.py)
# ---------------------------------------------------------------------------

TODAY = date.today()
TODAY_STR = TODAY.strftime("%-m/%-d/%Y")
TOMORROW = TODAY + timedelta(days=1)
YESTERDAY = TODAY - timedelta(days=1)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def league_no_seasons(db_session: AsyncSession) -> League:
    """A league that has zero seasons — triggers gap-game path."""
    lg = League(name="Gap Game League", is_open=True)
    db_session.add(lg)
    await db_session.commit()
    await db_session.refresh(lg)
    return lg


@pytest_asyncio.fixture
async def league_with_active(db_session: AsyncSession) -> League:
    """A league that will receive an active season via season_active fixture."""
    lg = League(name="Active Season League", is_open=True)
    db_session.add(lg)
    await db_session.commit()
    await db_session.refresh(lg)
    return lg


@pytest_asyncio.fixture
async def season_active(db_session: AsyncSession, league_with_active: League) -> Season:
    """Active open-ended season attached to league_with_active."""
    s = Season(
        league_id=league_with_active.id,
        name="Active Season",
        start_date=TODAY - timedelta(days=10),
        end_date=None,  # open-ended
    )
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)
    return s


@pytest_asyncio.fixture
async def league_b(db_session: AsyncSession) -> League:
    """A second independent league used to test cross-league season validation."""
    lg = League(name="League B", is_open=True)
    db_session.add(lg)
    await db_session.commit()
    await db_session.refresh(lg)
    return lg


@pytest_asyncio.fixture
async def season_b(db_session: AsyncSession, league_b: League) -> Season:
    """Active season belonging to league_b."""
    s = Season(
        league_id=league_b.id,
        name="Season B",
        start_date=TODAY - timedelta(days=10),
        end_date=None,
    )
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)
    return s


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _load_session(db_session: AsyncSession, session_id: int) -> Session:
    """Load a Session ORM row by id, bypassing the expired-attribute cache."""
    result = await db_session.execute(select(Session).where(Session.id == session_id))
    return result.scalar_one()


async def _count_seasons_for_league(db_session: AsyncSession, league_id: int) -> int:
    """Return the number of Season rows belonging to league_id."""
    result = await db_session.execute(
        select(func.count(Season.id)).where(Season.league_id == league_id)
    )
    return result.scalar() or 0


async def _count_sessions_for_league_date(
    db_session: AsyncSession, league_id: int, session_date: str
) -> int:
    """Return the number of Session rows for league_id on a given date string."""
    result = await db_session.execute(
        select(func.count(Session.id)).where(
            Session.league_id == league_id,
            Session.date == session_date,
        )
    )
    return result.scalar() or 0


# ===========================================================================
# 1. get_or_create_active_league_session — no active season → gap game
# ===========================================================================


@pytest.mark.asyncio
async def test_get_or_create_no_active_season_creates_gap_game(
    db_session: AsyncSession, league_no_seasons: League
):
    """With no active season and no explicit season_id, creation succeeds.

    The resulting session must have season_id=None, league_id set to the league,
    and session_type='league'.  No Season row is created as a side-effect.
    """
    result = await data_service.get_or_create_active_league_session(
        db_session,
        league_id=league_no_seasons.id,
        session_date=TODAY_STR,
    )

    # Returned dict must signal gap-game state
    assert result["season_id"] is None
    assert result["league_id"] == league_no_seasons.id

    # ORM row must agree
    orm = await _load_session(db_session, result["id"])
    assert orm.season_id is None
    assert orm.league_id == league_no_seasons.id
    assert orm.session_type == "league"

    # No Season row must have been created as a side-effect
    season_count = await _count_seasons_for_league(db_session, league_no_seasons.id)
    assert season_count == 0, "Gap game must NOT auto-create a Season"


# ===========================================================================
# 2. Idempotency: two consecutive gap-game calls → same session, no duplicate
# ===========================================================================


@pytest.mark.asyncio
async def test_get_or_create_gap_game_idempotent(
    db_session: AsyncSession, league_no_seasons: League
):
    """Calling get_or_create twice for the same league+date with no active season
    must return the SAME session id and produce exactly ONE Session row.
    """
    first = await data_service.get_or_create_active_league_session(
        db_session,
        league_id=league_no_seasons.id,
        session_date=TODAY_STR,
    )

    # Flush so the newly added row is visible on the next query
    await db_session.flush()

    second = await data_service.get_or_create_active_league_session(
        db_session,
        league_id=league_no_seasons.id,
        session_date=TODAY_STR,
    )

    assert second["id"] == first["id"], "Second call must return the same session"
    assert second["season_id"] is None
    assert second["league_id"] == league_no_seasons.id

    row_count = await _count_sessions_for_league_date(db_session, league_no_seasons.id, TODAY_STR)
    assert row_count == 1, "Exactly one Session row must exist for this league+date"


# ===========================================================================
# 2b. Gap games for different leagues on the same date stay isolated
# ===========================================================================


@pytest.mark.asyncio
async def test_get_or_create_gap_games_isolated_per_league(
    db_session: AsyncSession,
    league_no_seasons: League,
    league_b: League,
):
    """A gap game logged for League A must NOT collide with a gap game logged
    for League B on the same date. The dedup key must include league_id, so each
    league gets its OWN session row.
    """
    a = await data_service.get_or_create_active_league_session(
        db_session, league_id=league_no_seasons.id, session_date=TODAY_STR
    )
    await db_session.flush()

    b = await data_service.get_or_create_active_league_session(
        db_session, league_id=league_b.id, session_date=TODAY_STR
    )

    assert a["id"] != b["id"], "Different leagues must get different gap sessions"
    assert a["season_id"] is None and b["season_id"] is None
    assert a["league_id"] == league_no_seasons.id
    assert b["league_id"] == league_b.id

    # Exactly one row per league for this date — no cross-league collision.
    assert await _count_sessions_for_league_date(db_session, league_no_seasons.id, TODAY_STR) == 1
    assert await _count_sessions_for_league_date(db_session, league_b.id, TODAY_STR) == 1


# ===========================================================================
# 3. Regression: active season present, no explicit season_id → attaches to it
# ===========================================================================


@pytest.mark.asyncio
async def test_get_or_create_with_active_season_attaches_to_it(
    db_session: AsyncSession,
    league_with_active: League,
    season_active: Season,
):
    """When an active season exists and no explicit season_id is passed, the
    new session must be attached to the active season (not a gap game).
    """
    result = await data_service.get_or_create_active_league_session(
        db_session,
        league_id=league_with_active.id,
        session_date=TODAY_STR,
    )

    assert result["season_id"] == season_active.id
    assert result["league_id"] == league_with_active.id

    orm = await _load_session(db_session, result["id"])
    assert orm.season_id == season_active.id
    assert orm.session_type == "league"


# ===========================================================================
# 4. Explicit valid season_id → attaches to that exact season
# ===========================================================================


@pytest.mark.asyncio
async def test_get_or_create_explicit_season_id_attaches(
    db_session: AsyncSession,
    league_with_active: League,
    season_active: Season,
):
    """Passing an explicit season_id (which belongs to the league) uses that
    season, bypassing the active-season resolver entirely.
    """
    result = await data_service.get_or_create_active_league_session(
        db_session,
        league_id=league_with_active.id,
        session_date=TODAY_STR,
        season_id=season_active.id,
    )

    assert result["season_id"] == season_active.id
    assert result["league_id"] == league_with_active.id


# ===========================================================================
# 5. Explicit season_id that does NOT exist → raises ValueError
# ===========================================================================


@pytest.mark.asyncio
async def test_get_or_create_explicit_nonexistent_season_raises(
    db_session: AsyncSession, league_no_seasons: League
):
    """Providing an explicit season_id that doesn't exist must raise ValueError
    (strict validation path for explicit IDs is preserved).
    """
    with pytest.raises(ValueError):
        await data_service.get_or_create_active_league_session(
            db_session,
            league_id=league_no_seasons.id,
            session_date=TODAY_STR,
            season_id=999_999,
        )


# ===========================================================================
# 5b. Explicit season_id belonging to a DIFFERENT league → raises ValueError
# ===========================================================================


@pytest.mark.asyncio
async def test_get_or_create_explicit_cross_league_season_raises(
    db_session: AsyncSession,
    league_no_seasons: League,
    league_b: League,
    season_b: Season,
):
    """Providing an explicit season_id that belongs to a different league must
    raise ValueError.
    """
    with pytest.raises(ValueError):
        await data_service.get_or_create_active_league_session(
            db_session,
            league_id=league_no_seasons.id,
            session_date=TODAY_STR,
            season_id=season_b.id,
        )


# ===========================================================================
# 6. create_league_session — no active season → gap game
# ===========================================================================


@pytest.mark.asyncio
async def test_create_league_session_no_active_season_creates_gap_game(
    db_session: AsyncSession, league_no_seasons: League
):
    """create_league_session with no active season succeeds and produces a gap
    game: season_id=None, league_id set, session_type='league'.
    """
    result = await data_service.create_league_session(
        db_session,
        league_id=league_no_seasons.id,
        date=TODAY_STR,
        name=None,
    )

    assert result["season_id"] is None
    assert result["league_id"] == league_no_seasons.id

    orm = await _load_session(db_session, result["id"])
    assert orm.season_id is None
    assert orm.league_id == league_no_seasons.id
    assert orm.session_type == "league"


# ===========================================================================
# 7. create_league_session — duplicate prevention for gap games
# ===========================================================================


@pytest.mark.asyncio
async def test_create_league_session_gap_game_duplicate_raises(
    db_session: AsyncSession, league_no_seasons: League
):
    """Calling create_league_session twice for the same league+date with no
    active season must raise ValueError on the second call (duplicate prevention
    must anchor on the gap-game key: league_id+date+season_id IS NULL).
    """
    # First call succeeds
    await data_service.create_league_session(
        db_session,
        league_id=league_no_seasons.id,
        date=TODAY_STR,
        name=None,
    )

    # Second call must raise
    with pytest.raises(ValueError, match="already exists"):
        await data_service.create_league_session(
            db_session,
            league_id=league_no_seasons.id,
            date=TODAY_STR,
            name=None,
        )
