"""Tests for the open-season uniqueness invariant.

A league may have at most ONE open-ended season (``end_date IS NULL``) at a
time, enforced by the partial unique index ``uq_seasons_open_per_league``.
Closed seasons (with an ``end_date``) are unconstrained.

Note: leagues no longer auto-seed a "Season 1" on creation. Seasons are
explicit competitive periods an admin creates deliberately; until one exists,
league games are logged as gap games (league_id set, season_id NULL) and
standings fall back to league all-time.
"""

import pytest
import pytest_asyncio
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import League, Season


@pytest_asyncio.fixture
async def league(db_session: AsyncSession) -> League:
    """A bare league with no seasons."""
    lg = League(name="Test League", is_open=True)
    db_session.add(lg)
    await db_session.commit()
    await db_session.refresh(lg)
    return lg


async def _seasons_for(db_session: AsyncSession, league_id: int) -> list[Season]:
    result = await db_session.execute(select(Season).where(Season.league_id == league_id))
    return list(result.scalars().all())


@pytest.mark.asyncio
async def test_only_one_open_season_per_league_enforced(db_session: AsyncSession, league: League):
    """The DB rejects a second open-ended season for the same league."""
    today = date.today()
    db_session.add(Season(league_id=league.id, name="Rolling A", start_date=today, end_date=None))
    await db_session.commit()

    db_session.add(Season(league_id=league.id, name="Rolling B", start_date=today, end_date=None))
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_multiple_closed_seasons_allowed(db_session: AsyncSession, league: League):
    """The partial index only constrains open seasons — closed ones are free."""
    today = date.today()
    db_session.add_all(
        [
            Season(
                league_id=league.id,
                name="S1",
                start_date=today - timedelta(days=60),
                end_date=today - timedelta(days=30),
            ),
            Season(
                league_id=league.id,
                name="S2",
                start_date=today - timedelta(days=29),
                end_date=today - timedelta(days=1),
            ),
        ]
    )
    await db_session.commit()  # no IntegrityError
    assert len(await _seasons_for(db_session, league.id)) == 2
