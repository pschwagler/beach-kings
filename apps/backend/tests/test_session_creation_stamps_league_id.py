"""Tests for Phase 2: session creation stamps league_id and update_session invariant.

Covers:
  1. get_or_create_active_league_session stamps league_id + session_type='league' and
     returns league_id in the dict (both existing-session and new-session paths).
  2. create_session(league_id=X) stamps league_id and sets session_type='league'.
  3. create_session() with no league_id → league_id is None, session_type='pickup'.
  4. session_type is derived from league context and cannot be caller-controlled.
  5. update_session moving to a season from the SAME league → league_id correct.
  6. update_session moving to a season from a DIFFERENT league → league_id synced to
     that season's league (cross-field invariant holds).
  7. update_session setting season_id to null → league_id unchanged, no error.
"""

import pytest
import pytest_asyncio
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import Court, League, Location, Season, Session
from backend.services import data_service


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def league_a(db_session: AsyncSession) -> League:
    """A league with one active season."""
    lg = League(name="League A", is_open=True)
    db_session.add(lg)
    await db_session.commit()
    await db_session.refresh(lg)
    return lg


@pytest_asyncio.fixture
async def season_a(db_session: AsyncSession, league_a: League) -> Season:
    """Active season belonging to league_a."""
    today = date.today()
    s = Season(
        league_id=league_a.id,
        name="Season A",
        start_date=today - timedelta(days=10),
        end_date=None,  # open-ended / active
    )
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)
    return s


@pytest_asyncio.fixture
async def league_b(db_session: AsyncSession) -> League:
    """A second, independent league."""
    lg = League(name="League B", is_open=True)
    db_session.add(lg)
    await db_session.commit()
    await db_session.refresh(lg)
    return lg


@pytest_asyncio.fixture
async def season_b(db_session: AsyncSession, league_b: League) -> Season:
    """Active season belonging to league_b."""
    today = date.today()
    s = Season(
        league_id=league_b.id,
        name="Season B",
        start_date=today - timedelta(days=10),
        end_date=None,
    )
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)
    return s


async def _load_session(db_session: AsyncSession, session_id: int) -> Session:
    """Load a Session ORM row by id."""
    result = await db_session.execute(select(Session).where(Session.id == session_id))
    return result.scalar_one()


@pytest_asyncio.fixture
async def court(db_session: AsyncSession) -> Court:
    location = Location(id="session-test-location", name="Session Test Location")
    db_session.add(location)
    await db_session.flush()
    value = Court(name="Session Test Court", location_id=location.id)
    db_session.add(value)
    await db_session.commit()
    await db_session.refresh(value)
    return value


# ---------------------------------------------------------------------------
# 1. get_or_create_active_league_session — new session path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_or_create_stamps_league_id_new_session(
    db_session: AsyncSession, league_a: League, season_a: Season, court: Court
):
    """Creating a new session via get_or_create_active_league_session stamps league_id
    and session_type='league' on the ORM row, and returns them in the dict."""
    today = date.today().strftime("%-m/%-d/%Y")

    result = await data_service.get_or_create_active_league_session(
        db_session,
        league_id=league_a.id,
        session_date=today,
        season_id=season_a.id,
        court_id=court.id,
        start_time="18:30",
        is_ranked=False,
    )

    assert result["league_id"] == league_a.id
    assert result["season_id"] == season_a.id

    orm = await _load_session(db_session, result["id"])
    assert orm.league_id == league_a.id
    assert orm.session_type == "league"
    assert orm.court_id == court.id
    assert orm.start_time == "18:30"
    assert orm.is_ranked is True


# ---------------------------------------------------------------------------
# 2. get_or_create_active_league_session — existing session path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_or_create_returns_league_id_existing_session(
    db_session: AsyncSession, league_a: League, season_a: Season
):
    """When an existing session is found, the returned dict includes league_id
    read from the ORM row (backfill already populated it)."""
    today = date.today().strftime("%-m/%-d/%Y")

    # Create on first call
    first = await data_service.get_or_create_active_league_session(
        db_session,
        league_id=league_a.id,
        session_date=today,
        season_id=season_a.id,
    )

    # Second call must return the SAME session with league_id in the dict
    second = await data_service.get_or_create_active_league_session(
        db_session,
        league_id=league_a.id,
        session_date=today,
        season_id=season_a.id,
    )

    assert second["id"] == first["id"]
    assert second["league_id"] == league_a.id


# ---------------------------------------------------------------------------
# 3. create_session(league_id=X) stamps league_id and sets session_type='league'
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_session_with_league_id_stamps_league_id(
    db_session: AsyncSession, league_a: League, season_a: Season
):
    """create_session(league_id=X) sets league_id on the ORM row, defaults
    session_type to 'league', and returns both in the dict."""
    today = date.today().strftime("%-m/%-d/%Y")

    result = await data_service.create_session(
        db_session,
        date=today,
        league_id=league_a.id,
    )

    assert result["league_id"] == league_a.id
    assert result["session_type"] == "league"

    orm = await _load_session(db_session, result["id"])
    assert orm.league_id == league_a.id
    assert orm.session_type == "league"


# ---------------------------------------------------------------------------
# 4. create_session() with no league_id → league_id is None
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_session_without_league_id_is_none(db_session: AsyncSession):
    """create_session() with no league_id produces a session with league_id=None
    and server-derived session_type='pickup'."""
    today = date.today().strftime("%-m/%-d/%Y")

    result = await data_service.create_session(db_session, date=today)

    assert result["league_id"] is None
    assert result["session_type"] == "pickup"

    orm = await _load_session(db_session, result["id"])
    assert orm.league_id is None


# ---------------------------------------------------------------------------
# 5. create_session derives session_type from league context
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_session_session_type_is_derived(db_session: AsyncSession, league_a: League):
    """A league-linked session is always persisted as a league session."""
    today = date.today().strftime("%-m/%-d/%Y")

    result = await data_service.create_session(
        db_session,
        date=today,
        league_id=league_a.id,
    )

    assert result["league_id"] == league_a.id
    assert result["session_type"] == "league"

    orm = await _load_session(db_session, result["id"])
    assert orm.session_type == "league"


@pytest.mark.asyncio
async def test_update_session_supports_date_start_time_and_court_clearing(
    db_session: AsyncSession, court: Court
):
    """Explicit null update flags clear nullable session fields without court-name writes."""
    initial = await data_service.create_session(
        db_session,
        date="6/10/2026",
        start_time="18:00",
    )

    set_court = await data_service.update_session(
        db_session,
        initial["id"],
        date="6/11/2026",
        court_id=court.id,
        update_court_id=True,
    )
    assert set_court is not None
    assert set_court["date"] == "6/11/2026"
    assert set_court["court_id"] == court.id

    cleared = await data_service.update_session(
        db_session,
        initial["id"],
        start_time=None,
        update_start_time=True,
        court_id=None,
        update_court_id=True,
    )
    assert cleared is not None
    assert cleared["start_time"] is None
    assert cleared["court_id"] is None


# ---------------------------------------------------------------------------
# 6. update_session — move to season from SAME league
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_session_season_same_league_syncs_correctly(
    db_session: AsyncSession, league_a: League, season_a: Season
):
    """Moving a session to a different season within the same league keeps
    league_id consistent and sets the new season_id."""
    today = date.today()
    today_str = today.strftime("%-m/%-d/%Y")

    # Create a second season in the same league.  Must have a concrete end_date
    # because the DB enforces uq_seasons_open_per_league (only one open-ended
    # season per league at a time).
    season_a2 = Season(
        league_id=league_a.id,
        name="Season A2",
        start_date=today + timedelta(days=1),
        end_date=today + timedelta(days=60),
    )
    db_session.add(season_a2)
    await db_session.commit()
    await db_session.refresh(season_a2)

    # Create a session attached to season_a
    initial = await data_service.get_or_create_active_league_session(
        db_session,
        league_id=league_a.id,
        session_date=today_str,
        season_id=season_a.id,
    )

    updated = await data_service.update_session(
        db_session,
        session_id=initial["id"],
        season_id=season_a2.id,
        update_season_id=True,
    )

    assert updated is not None
    assert updated["season_id"] == season_a2.id
    assert updated["league_id"] == league_a.id

    orm = await _load_session(db_session, initial["id"])
    assert orm.league_id == league_a.id


# ---------------------------------------------------------------------------
# 7. update_session — move to season from DIFFERENT league is REJECTED
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_session_season_different_league_rejected(
    db_session: AsyncSession,
    league_a: League,
    season_a: Season,
    league_b: League,
    season_b: Season,
):
    """A session may only move between seasons of its OWN league. Attaching a
    season from a different league is nonsensical (its games/participants belong
    to the original league) and must be rejected, leaving the session unchanged."""
    today_str = date.today().strftime("%-m/%-d/%Y")

    initial = await data_service.get_or_create_active_league_session(
        db_session,
        league_id=league_a.id,
        session_date=today_str,
        season_id=season_a.id,
    )
    assert initial["league_id"] == league_a.id

    with pytest.raises(ValueError):
        await data_service.update_session(
            db_session,
            session_id=initial["id"],
            season_id=season_b.id,
            update_season_id=True,
        )

    # Rejection happens before any DB mutation — session is untouched.
    orm = await _load_session(db_session, initial["id"])
    assert orm.league_id == league_a.id
    assert orm.season_id == season_a.id


@pytest.mark.asyncio
async def test_update_session_nonexistent_season_raises(
    db_session: AsyncSession, league_a: League, season_a: Season
):
    """Attaching a season that does not exist raises ValueError."""
    today_str = date.today().strftime("%-m/%-d/%Y")
    initial = await data_service.get_or_create_active_league_session(
        db_session,
        league_id=league_a.id,
        session_date=today_str,
        season_id=season_a.id,
    )

    with pytest.raises(ValueError):
        await data_service.update_session(
            db_session,
            session_id=initial["id"],
            season_id=999_999,
            update_season_id=True,
        )


# ---------------------------------------------------------------------------
# 8. update_session — set season_id to null leaves league_id unchanged
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_session_null_season_leaves_league_id(
    db_session: AsyncSession, league_a: League, season_a: Season
):
    """Setting season_id=None (gap-game state) does not change league_id."""
    today_str = date.today().strftime("%-m/%-d/%Y")

    initial = await data_service.get_or_create_active_league_session(
        db_session,
        league_id=league_a.id,
        session_date=today_str,
        season_id=season_a.id,
    )
    assert initial["league_id"] == league_a.id

    updated = await data_service.update_session(
        db_session,
        session_id=initial["id"],
        season_id=None,
        update_season_id=True,
    )

    assert updated is not None
    assert updated["season_id"] is None
    # league_id must be preserved
    assert updated["league_id"] == league_a.id

    orm = await _load_session(db_session, initial["id"])
    assert orm.league_id == league_a.id
