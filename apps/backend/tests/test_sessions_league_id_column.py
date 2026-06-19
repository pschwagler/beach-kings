"""Tests for sessions.league_id FK column (Phase 0).

Validates:
- The ORM model accepts league_id on Session objects.
- A session with league_id=None can be persisted without error.
- The backfill logic (same UPDATE the migration uses) correctly derives
  league_id from the session's season.
- Deleting a League sets session.league_id to NULL (ON DELETE SET NULL).
"""

import pytest
import pytest_asyncio
from datetime import date
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import League, Season, Session, Player, User


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def league(db_session: AsyncSession) -> League:
    """A minimal league for FK tests."""
    lg = League(name="Test League", is_open=True)
    db_session.add(lg)
    await db_session.commit()
    await db_session.refresh(lg)
    return lg


@pytest_asyncio.fixture
async def season(db_session: AsyncSession, league: League) -> Season:
    """An open-ended season belonging to the test league."""
    s = Season(
        league_id=league.id,
        name="Season 1",
        start_date=date(2025, 1, 1),
        end_date=None,
    )
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)
    return s


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_session_model_has_league_id_field(db_session: AsyncSession, league: League):
    """Session.league_id round-trips through the DB column (not just the ORM attr)."""
    session_obj = Session(
        date="2025-06-01",
        name="League Test Session",
        league_id=league.id,
    )
    db_session.add(session_obj)
    await db_session.commit()
    await db_session.refresh(session_obj)
    assert session_obj.league_id == league.id


@pytest.mark.asyncio
async def test_session_league_id_accepts_null(db_session: AsyncSession):
    """A session with league_id=None can be committed without error."""
    s = Session(
        date="2025-06-01",
        name="Pickup Session",
        league_id=None,
    )
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)

    assert s.id is not None
    assert s.league_id is None


@pytest.mark.asyncio
async def test_backfill_league_id_from_season(
    db_session: AsyncSession, league: League, season: Season
):
    """The migration's UPDATE statement correctly populates league_id from season."""
    s = Session(
        date="2025-06-01",
        name="League Session",
        season_id=season.id,
        league_id=None,
    )
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)

    # Run the same backfill SQL the migration uses
    await db_session.execute(
        text(
            "UPDATE sessions SET league_id = "
            "(SELECT league_id FROM seasons WHERE seasons.id = sessions.season_id) "
            "WHERE season_id IS NOT NULL"
        )
    )
    await db_session.commit()
    await db_session.refresh(s)

    assert s.league_id == season.league_id
    assert s.league_id == league.id


@pytest.mark.asyncio
async def test_session_league_id_fk_set_null_on_league_delete(
    db_session: AsyncSession, league: League
):
    """Deleting a league sets session.league_id to NULL via ON DELETE SET NULL."""
    s = Session(
        date="2025-06-01",
        name="FK Cascade Session",
        league_id=league.id,
    )
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)
    session_id = s.id

    assert s.league_id == league.id

    # Delete the league; FK should cascade to SET NULL
    await db_session.delete(league)
    await db_session.commit()

    # Expire the identity-map cache so the next select hits the DB.
    db_session.expire_all()

    # Re-fetch the session from DB to see the updated value
    result = await db_session.execute(select(Session).where(Session.id == session_id))
    refreshed = result.scalar_one()
    assert refreshed.league_id is None
