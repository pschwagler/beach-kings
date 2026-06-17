"""Tests for automatic season provisioning.

Every league must always have a current, active season so logging a game never
dead-ends on "no active season". Two entry points guarantee this:

  * ``create_league`` seeds an open-ended "Season 1" on creation.
  * ``get_or_create_active_season`` returns the active season, creating an
    open-ended (rolling) one when none is active — covering date gaps between
    seasons and legacy leagues that predate auto-seeding.

An open-ended season has ``end_date = None``: it stays active until an admin
sets an end date to close it, at which point the next game opens the next one.
"""

import pytest
import pytest_asyncio
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import League, Season, Player, User
from backend.services import data_service


# db_session fixture is provided by conftest.py


@pytest_asyncio.fixture
async def league(db_session: AsyncSession) -> League:
    """A bare league with no seasons."""
    lg = League(name="Test League", is_open=True)
    db_session.add(lg)
    await db_session.commit()
    await db_session.refresh(lg)
    return lg


async def _seasons_for(db_session: AsyncSession, league_id: int) -> list[Season]:
    result = await db_session.execute(
        select(Season).where(Season.league_id == league_id)
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# create_league
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_league_seeds_open_ended_season(db_session: AsyncSession):
    user = User(auth_provider="phone")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    player = Player(full_name="Creator", user_id=user.id)
    db_session.add(player)
    await db_session.commit()

    created = await data_service.create_league(
        session=db_session,
        name="Fresh League",
        description=None,
        location_id=None,
        is_open=True,
        whatsapp_group_id=None,
        creator_user_id=user.id,
    )

    seasons = await _seasons_for(db_session, created["id"])
    assert len(seasons) == 1
    season = seasons[0]
    assert season.start_date == date.today()
    assert season.end_date is None  # open-ended / rolling
    assert season.name == "Season 1"


# ---------------------------------------------------------------------------
# get_or_create_active_season
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_returns_existing_active_season(db_session: AsyncSession, league: League):
    today = date.today()
    active = Season(
        league_id=league.id,
        name="Active",
        start_date=today - timedelta(days=5),
        end_date=today + timedelta(days=5),
    )
    db_session.add(active)
    await db_session.commit()
    await db_session.refresh(active)

    result = await data_service.get_or_create_active_season(db_session, league.id)

    assert result["id"] == active.id
    assert len(await _seasons_for(db_session, league.id)) == 1  # no new season


@pytest.mark.asyncio
async def test_treats_null_end_date_as_active(db_session: AsyncSession, league: League):
    today = date.today()
    rolling = Season(
        league_id=league.id,
        name="Rolling",
        start_date=today - timedelta(days=5),
        end_date=None,
    )
    db_session.add(rolling)
    await db_session.commit()
    await db_session.refresh(rolling)

    result = await data_service.get_or_create_active_season(db_session, league.id)

    assert result["id"] == rolling.id  # reused, not duplicated
    assert len(await _seasons_for(db_session, league.id)) == 1


@pytest.mark.asyncio
async def test_creates_when_only_ended_season_exists(
    db_session: AsyncSession, league: League
):
    today = date.today()
    ended = Season(
        league_id=league.id,
        name="Spring",
        start_date=today - timedelta(days=60),
        end_date=today - timedelta(days=10),
    )
    db_session.add(ended)
    await db_session.commit()
    await db_session.refresh(ended)

    result = await data_service.get_or_create_active_season(db_session, league.id)

    # A brand-new open-ended season — the ended one is NOT reopened.
    assert result["id"] != ended.id
    assert result["end_date"] is None
    assert date.fromisoformat(result["start_date"]) == today
    await db_session.refresh(ended)
    assert ended.end_date == today - timedelta(days=10)  # untouched


@pytest.mark.asyncio
async def test_creates_for_zero_season_league(db_session: AsyncSession, league: League):
    result = await data_service.get_or_create_active_season(db_session, league.id)

    assert result["league_id"] == league.id
    assert result["end_date"] is None
    assert date.fromisoformat(result["start_date"]) == date.today()
    assert len(await _seasons_for(db_session, league.id)) == 1


# ---------------------------------------------------------------------------
# Open-season uniqueness invariant (uq_seasons_open_per_league)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_only_one_open_season_per_league_enforced(
    db_session: AsyncSession, league: League
):
    """The DB rejects a second open-ended season for the same league."""
    today = date.today()
    db_session.add(
        Season(league_id=league.id, name="Rolling A", start_date=today, end_date=None)
    )
    await db_session.commit()

    db_session.add(
        Season(league_id=league.id, name="Rolling B", start_date=today, end_date=None)
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_multiple_closed_seasons_allowed(
    db_session: AsyncSession, league: League
):
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
