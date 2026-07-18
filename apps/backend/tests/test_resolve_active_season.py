"""Tests for the canonical resolve_active_season resolver.

The resolver returns the league's active season according to the canonical rule:
  active = (start_date IS NULL OR start_date <= today)
            AND (end_date IS NULL OR end_date >= today)

Tiebreak: most recently created season wins.  Returns None when no season
qualifies — never raises, never creates.
"""

import pytest
import pytest_asyncio
from datetime import date, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import League, Season
from backend.services import data_service


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def league(db_session: AsyncSession) -> League:
    """A bare league with no seasons."""
    lg = League(name="Resolver Test League", is_open=True)
    db_session.add(lg)
    await db_session.commit()
    await db_session.refresh(lg)
    return lg


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _add_season(
    db_session: AsyncSession,
    league_id: int,
    *,
    name: str = "Test Season",
    start_date: date | None,
    end_date: date | None,
) -> Season:
    """Create and persist a Season, returning the refreshed ORM object."""
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


TODAY = date.today()
YESTERDAY = TODAY - timedelta(days=1)
TOMORROW = TODAY + timedelta(days=1)


# ---------------------------------------------------------------------------
# 1. No seasons → None
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_no_seasons_returns_none(db_session: AsyncSession, league: League):
    """A league with zero seasons must return None, not raise."""
    result = await data_service.resolve_active_season(db_session, league.id)
    assert result is None


# ---------------------------------------------------------------------------
# 2. Future start → None
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_future_start_date_returns_none(db_session: AsyncSession, league: League):
    """A season that has not started yet is NOT active."""
    await _add_season(
        db_session, league.id, start_date=TOMORROW, end_date=TODAY + timedelta(days=30)
    )
    result = await data_service.resolve_active_season(db_session, league.id)
    assert result is None


# ---------------------------------------------------------------------------
# 3. Ended (end_date = yesterday) → None
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ended_season_returns_none(db_session: AsyncSession, league: League):
    """A season whose end_date is in the past is NOT active."""
    await _add_season(
        db_session,
        league.id,
        start_date=TODAY - timedelta(days=30),
        end_date=YESTERDAY,
    )
    result = await data_service.resolve_active_season(db_session, league.id)
    assert result is None


# ---------------------------------------------------------------------------
# 4. Bounded active season → returns it
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bounded_active_season_returned(db_session: AsyncSession, league: League):
    """A season with start_date in the past and end_date in the future is active."""
    s = await _add_season(
        db_session,
        league.id,
        start_date=TODAY - timedelta(days=5),
        end_date=TODAY + timedelta(days=5),
    )
    result = await data_service.resolve_active_season(db_session, league.id)
    assert result is not None
    assert result.id == s.id


# ---------------------------------------------------------------------------
# 5. Null end_date → active (open-ended / rolling season)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_null_end_date_is_active(db_session: AsyncSession, league: League):
    """A season with start_date in the past and no end_date is always active."""
    s = await _add_season(
        db_session,
        league.id,
        start_date=TODAY - timedelta(days=5),
        end_date=None,
    )
    result = await data_service.resolve_active_season(db_session, league.id)
    assert result is not None
    assert result.id == s.id


# ---------------------------------------------------------------------------
# 6. A future-start season is ignored when an active bounded season co-exists.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolver_ignores_future_start_when_active_season_exists(
    db_session: AsyncSession, league: League
):
    """A future-start (not-yet-started) season must not be returned when an
    active bounded season co-exists for the same league.
    """
    # Active bounded season
    active = await _add_season(
        db_session,
        league.id,
        name="Active Normal",
        start_date=TODAY - timedelta(days=1),
        end_date=TODAY + timedelta(days=30),
    )
    # Inactive future-start season
    await _add_season(
        db_session,
        league.id,
        name="Future Start",
        start_date=TODAY + timedelta(days=10),
        end_date=TODAY + timedelta(days=60),
    )
    result = await data_service.resolve_active_season(db_session, league.id)
    assert result is not None
    assert result.id == active.id


# ---------------------------------------------------------------------------
# 7. Tiebreak: two overlapping actives → most recently created wins
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tiebreak_most_recently_created_wins(db_session: AsyncSession, league: League):
    """When multiple seasons overlap the active window, most recent created_at wins."""
    older = await _add_season(
        db_session,
        league.id,
        name="Older Active",
        start_date=TODAY - timedelta(days=10),
        end_date=TODAY + timedelta(days=10),
    )
    # The DB unique constraint only blocks a second open-ended season.
    # Two bounded active seasons are allowed.
    newer = await _add_season(
        db_session,
        league.id,
        name="Newer Active",
        start_date=TODAY - timedelta(days=5),
        end_date=TODAY + timedelta(days=5),
    )
    result = await data_service.resolve_active_season(db_session, league.id)
    assert result is not None
    assert result.id == newer.id
    assert result.id != older.id


@pytest.mark.asyncio
async def test_list_marks_only_canonical_overlapping_season_active(
    db_session: AsyncSession, league: League
):
    """List consumers receive one active label even for legacy overlaps."""
    older = await _add_season(
        db_session,
        league.id,
        name="Older Active",
        start_date=TODAY - timedelta(days=10),
        end_date=TODAY + timedelta(days=10),
    )
    newer = await _add_season(
        db_session,
        league.id,
        name="Newer Active",
        start_date=TODAY - timedelta(days=5),
        end_date=TODAY + timedelta(days=5),
    )

    seasons = await data_service.list_seasons(db_session, league.id)
    active_ids = [season["id"] for season in seasons if season["is_active"]]

    assert active_ids == [newer.id]
    assert older.id not in active_ids


# ---------------------------------------------------------------------------
# 8. today= param honored: explicit date makes season active
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_explicit_today_makes_season_active(db_session: AsyncSession, league: League):
    """Passing an explicit today= that falls inside the season window returns it."""
    future_today = TODAY + timedelta(days=20)
    s = await _add_season(
        db_session,
        league.id,
        start_date=TODAY + timedelta(days=15),
        end_date=TODAY + timedelta(days=25),
    )
    result = await data_service.resolve_active_season(db_session, league.id, today=future_today)
    assert result is not None
    assert result.id == s.id


# ---------------------------------------------------------------------------
# 9. today= param honored: explicit date makes season inactive
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_explicit_today_makes_season_inactive(db_session: AsyncSession, league: League):
    """Passing an explicit today= that falls outside the season window returns None."""
    past_today = TODAY - timedelta(days=30)
    await _add_season(
        db_session,
        league.id,
        start_date=TODAY - timedelta(days=10),
        end_date=TODAY + timedelta(days=10),
    )
    result = await data_service.resolve_active_season(db_session, league.id, today=past_today)
    assert result is None


# ---------------------------------------------------------------------------
# 10. Never raises when no active season exists
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_never_raises_when_no_active_season(db_session: AsyncSession, league: League):
    """With only an ended season, the function must return None — not raise."""
    await _add_season(
        db_session,
        league.id,
        start_date=TODAY - timedelta(days=60),
        end_date=TODAY - timedelta(days=30),
    )
    # Must not raise
    result = await data_service.resolve_active_season(db_session, league.id)
    assert result is None


# ---------------------------------------------------------------------------
# 11. Active on exact start_date boundary (start_date == today)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_active_on_exact_start_date_boundary(db_session: AsyncSession, league: League):
    """A season whose start_date equals today is active (boundary inclusive)."""
    s = await _add_season(
        db_session,
        league.id,
        start_date=TODAY,
        end_date=TODAY + timedelta(days=30),
    )
    result = await data_service.resolve_active_season(db_session, league.id)
    assert result is not None
    assert result.id == s.id


# ---------------------------------------------------------------------------
# 12. Active on exact end_date boundary (end_date == today)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_active_on_exact_end_date_boundary(db_session: AsyncSession, league: League):
    """A season whose end_date equals today is still active (boundary inclusive)."""
    s = await _add_season(
        db_session,
        league.id,
        start_date=TODAY - timedelta(days=30),
        end_date=TODAY,
    )
    result = await data_service.resolve_active_season(db_session, league.id)
    assert result is not None
    assert result.id == s.id


# ---------------------------------------------------------------------------
# 13. Inactive day after end_date
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_inactive_day_after_end_date(db_session: AsyncSession, league: League):
    """The day after end_date the season is no longer active."""
    await _add_season(
        db_session,
        league.id,
        start_date=TODAY - timedelta(days=30),
        end_date=TODAY - timedelta(days=1),
    )
    result = await data_service.resolve_active_season(db_session, league.id)
    assert result is None
