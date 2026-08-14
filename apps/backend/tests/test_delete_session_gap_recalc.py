"""
Regression guard: delete_session enqueues a league recalc for submitted gap games.

``delete_session`` was rewritten to read ``session_obj.league_id`` directly
(rather than deriving it via a Season subquery) so that gap-game sessions
(league_id SET, season_id NULL) still trigger a stats recalculation when
deleted.  This file asserts that the enqueue call happens with the correct
arguments.

Test taxonomy
-------------
- gap game  (league_id=X, season_id=None,  status=SUBMITTED) -> enqueues league
- season game (league_id=X, season_id=Y, status=SUBMITTED)   -> enqueues league (baseline)
- pickup    (league_id=None, season_id=None, status=SUBMITTED) -> no league enqueue
- active    (league_id=X, season_id=None,  status=ACTIVE)     -> no enqueue at all
  (only submitted/edited sessions with matches trigger recalc)

All tests use the FakeQueue / monkeypatch pattern from
test_gap_game_stats_routing.py — no real queue workers are exercised.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    League,
    Match,
    Player,
    Season,
    Session,
    SessionStatus,
)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


async def _make_player(db: AsyncSession, name: str) -> Player:
    """Create and persist a Player with the given full_name."""
    p = Player(full_name=name)
    db.add(p)
    await db.flush()
    return p


async def _make_match(
    db: AsyncSession,
    sess: Session,
    p1: Player,
    p2: Player,
    p3: Player,
    p4: Player,
) -> Match:
    """Create a ranked, public match that is stat-eligible."""
    m = Match(
        session_id=sess.id,
        team1_player1_id=p1.id,
        team1_player2_id=p2.id,
        team2_player1_id=p3.id,
        team2_player2_id=p4.id,
        team1_score=21,
        team2_score=15,
        winner=1,
        is_ranked=True,
        ranked_intent=True,
        is_public=True,
        created_by=p1.id,
    )
    db.add(m)
    await db.flush()
    return m


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def delete_world(db_session: AsyncSession):
    """
    Create the minimal data world needed for delete_session tests.

    Returns a dict with keys:
        league, season,
        gap_session, season_session, pickup_session, active_gap_session,
        gap_match, season_match, pickup_match,
        players (list of 4 Player objects)
    """
    alice = await _make_player(db_session, "Alice Del")
    bob = await _make_player(db_session, "Bob Del")
    charlie = await _make_player(db_session, "Charlie Del")
    dave = await _make_player(db_session, "Dave Del")
    players = [alice, bob, charlie, dave]

    league = League(name="Delete Test League", is_open=True, created_by=alice.id)
    db_session.add(league)
    await db_session.flush()

    season = Season(
        league_id=league.id,
        name="Delete Test Season",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 12, 31),
        created_by=alice.id,
    )
    db_session.add(season)
    await db_session.flush()

    # Gap game: submitted, league_id set, season_id NULL.
    gap_session = Session(
        date="2024-05-01",
        name="Gap Game for Delete",
        status=SessionStatus.SUBMITTED,
        league_id=league.id,
        season_id=None,
        created_by=alice.id,
    )
    # Season game: submitted, both league_id and season_id set.
    season_session = Session(
        date="2024-05-15",
        name="Season Game for Delete",
        status=SessionStatus.SUBMITTED,
        league_id=league.id,
        season_id=season.id,
        created_by=alice.id,
    )
    # Pickup: submitted, neither league_id nor season_id.
    pickup_session = Session(
        date="2024-06-01",
        name="Pickup for Delete",
        status=SessionStatus.SUBMITTED,
        league_id=None,
        season_id=None,
        created_by=alice.id,
    )
    # Active gap game: ACTIVE status — delete should NOT enqueue any recalc
    # because the session was never submitted (no stats baked in yet).
    active_gap_session = Session(
        date="2024-06-15",
        name="Active Gap for Delete",
        status=SessionStatus.ACTIVE,
        league_id=league.id,
        season_id=None,
        created_by=alice.id,
    )
    db_session.add_all([gap_session, season_session, pickup_session, active_gap_session])
    await db_session.flush()

    gap_match = await _make_match(db_session, gap_session, alice, bob, charlie, dave)
    season_match = await _make_match(db_session, season_session, alice, bob, charlie, dave)
    pickup_match = await _make_match(db_session, pickup_session, alice, bob, charlie, dave)
    # No match for active_gap_session — it hasn't been played yet.

    await db_session.commit()

    for obj in [
        league,
        season,
        gap_session,
        season_session,
        pickup_session,
        active_gap_session,
        gap_match,
        season_match,
        pickup_match,
        *players,
    ]:
        await db_session.refresh(obj)

    return {
        "league": league,
        "season": season,
        "gap_session": gap_session,
        "season_session": season_session,
        "pickup_session": pickup_session,
        "active_gap_session": active_gap_session,
        "gap_match": gap_match,
        "season_match": season_match,
        "pickup_match": pickup_match,
        "players": players,
    }


# ---------------------------------------------------------------------------
# FakeQueue helper
# ---------------------------------------------------------------------------


class _FakeQueue:
    """Captures enqueue_calculation calls without touching the real queue."""

    def __init__(self):
        self.calls: list[tuple[str, int | None]] = []

    async def enqueue_calculation(
        self, session: AsyncSession, calc_type: str, league_id: int | None = None
    ) -> int:
        self.calls.append((calc_type, league_id))
        return 1


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_submitted_gap_session_enqueues_league_recalc(
    db_session: AsyncSession, delete_world: dict, monkeypatch
):
    """Deleting a SUBMITTED gap game (league_id set, season_id NULL) must
    enqueue both a global and a league recalculation.

    Regression: the old ``delete_session`` derived league_id via a Season
    subquery.  Gap games have season_id=NULL so the subquery returned NULL,
    and the league recalc was silently skipped.  The new implementation reads
    ``session_obj.league_id`` directly from the ORM row before commit.
    """
    from backend.services import stats_queue
    from backend.services.games.session_data import delete_session

    fake = _FakeQueue()
    monkeypatch.setattr(stats_queue, "get_stats_queue", lambda: fake)

    league = delete_world["league"]
    gap_session = delete_world["gap_session"]

    result = await delete_session(db_session, gap_session.id)

    assert result is True, "delete_session must return True for an existing session"
    assert ("global", None) in fake.calls, (
        f"Expected ('global', None) in enqueue calls; got: {fake.calls}"
    )
    assert ("league", league.id) in fake.calls, (
        f"Expected ('league', {league.id}) in enqueue calls for gap game; got: {fake.calls}"
    )


@pytest.mark.asyncio
async def test_delete_submitted_season_session_enqueues_league_recalc(
    db_session: AsyncSession, delete_world: dict, monkeypatch
):
    """Deleting a SUBMITTED season game must also enqueue a league recalc.

    This is the baseline behaviour (season game has league_id set on the
    sessions row directly, so both old and new code agree), verified here
    to ensure the new implementation did not regress the season-game path.
    """
    from backend.services import stats_queue
    from backend.services.games.session_data import delete_session

    fake = _FakeQueue()
    monkeypatch.setattr(stats_queue, "get_stats_queue", lambda: fake)

    league = delete_world["league"]
    season_session = delete_world["season_session"]

    result = await delete_session(db_session, season_session.id)

    assert result is True
    assert ("global", None) in fake.calls
    assert ("league", league.id) in fake.calls, (
        f"Expected ('league', {league.id}) in enqueue calls for season game; got: {fake.calls}"
    )


@pytest.mark.asyncio
async def test_delete_submitted_pickup_session_skips_league_recalc(
    db_session: AsyncSession, delete_world: dict, monkeypatch
):
    """Deleting a SUBMITTED pickup session (league_id=None) must enqueue a
    global recalc but must NOT enqueue any league recalc.
    """
    from backend.services import stats_queue
    from backend.services.games.session_data import delete_session

    fake = _FakeQueue()
    monkeypatch.setattr(stats_queue, "get_stats_queue", lambda: fake)

    pickup_session = delete_world["pickup_session"]

    result = await delete_session(db_session, pickup_session.id)

    assert result is True
    assert ("global", None) in fake.calls
    assert all(calc_type != "league" for calc_type, _ in fake.calls), (
        f"Pickup session delete must not enqueue any league recalc; got: {fake.calls}"
    )


@pytest.mark.asyncio
async def test_delete_active_gap_session_with_no_matches_skips_enqueue(
    db_session: AsyncSession, delete_world: dict, monkeypatch
):
    """Deleting an ACTIVE gap game with no matches must NOT enqueue any recalc.

    ``delete_session`` guards on ``was_submitted and match_ids`` before
    enqueueing.  An ACTIVE session has ``was_submitted=False`` regardless of
    ``league_id``, so no enqueue should fire.
    """
    from backend.services import stats_queue
    from backend.services.games.session_data import delete_session

    fake = _FakeQueue()
    monkeypatch.setattr(stats_queue, "get_stats_queue", lambda: fake)

    active_gap_session = delete_world["active_gap_session"]

    result = await delete_session(db_session, active_gap_session.id)

    assert result is True
    assert fake.calls == [], (
        f"Deleting an ACTIVE session with no matches must not enqueue anything; got: {fake.calls}"
    )


@pytest.mark.asyncio
async def test_delete_nonexistent_session_returns_false(db_session: AsyncSession, monkeypatch):
    """delete_session must return False when the session does not exist."""
    from backend.services import stats_queue
    from backend.services.games.session_data import delete_session

    fake = _FakeQueue()
    monkeypatch.setattr(stats_queue, "get_stats_queue", lambda: fake)

    result = await delete_session(db_session, 999_999_999)

    assert result is False
    assert fake.calls == [], "No enqueue calls expected for a missing session"
