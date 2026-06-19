"""Tests for Phase 2: session creation stamps league_id and update_session invariant.

Covers:
  1. get_or_create_active_league_session stamps league_id + session_type='league' and
     returns league_id in the dict (both existing-session and new-session paths).
  2. create_session(league_id=X) stamps league_id and sets session_type='league'.
  3. create_session() with no league_id → league_id is None, session_type stays default.
  4. create_session(league_id=X, session_type='pickup') → caller-supplied session_type
     is preserved (does not force 'league').
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

from backend.database.models import League, Season, Session, Player, User
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


# ---------------------------------------------------------------------------
# 1. get_or_create_active_league_session — new session path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_or_create_stamps_league_id_new_session(
    db_session: AsyncSession, league_a: League, season_a: Season
):
    """Creating a new session via get_or_create_active_league_session stamps league_id
    and session_type='league' on the ORM row, and returns them in the dict."""
    today = date.today().strftime("%-m/%-d/%Y")

    result = await data_service.get_or_create_active_league_session(
        db_session,
        league_id=league_a.id,
        session_date=today,
        season_id=season_a.id,
    )

    assert result["league_id"] == league_a.id
    assert result["season_id"] == season_a.id

    orm = await _load_session(db_session, result["id"])
    assert orm.league_id == league_a.id
    assert orm.session_type == "league"


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
    and session_type unforced (None by default)."""
    today = date.today().strftime("%-m/%-d/%Y")

    result = await data_service.create_session(db_session, date=today)

    assert result["league_id"] is None
    assert result["session_type"] is None

    orm = await _load_session(db_session, result["id"])
    assert orm.league_id is None


# ---------------------------------------------------------------------------
# 5. create_session(league_id=X, session_type='pickup') — caller value preserved
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_session_explicit_session_type_preserved(
    db_session: AsyncSession, league_a: League
):
    """When the caller explicitly passes session_type='pickup' alongside league_id,
    the caller-supplied value is not overridden — it stays 'pickup'."""
    today = date.today().strftime("%-m/%-d/%Y")

    result = await data_service.create_session(
        db_session,
        date=today,
        league_id=league_a.id,
        session_type="pickup",
    )

    assert result["league_id"] == league_a.id
    assert result["session_type"] == "pickup"

    orm = await _load_session(db_session, result["id"])
    assert orm.session_type == "pickup"


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
