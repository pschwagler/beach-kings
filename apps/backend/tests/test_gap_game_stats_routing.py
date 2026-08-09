"""
Phase 5 — Gap-game stats routing tests.

Verifies that gap-game sessions (league_id set, season_id NULL) are correctly
included in league-scoped stat queries, while remaining absent from season-scoped
queries.  Tests are written against the real async database (test DB) and invoke
the service functions directly.

Test data taxonomy
------------------
- League X  with Season Y  (Y.league_id == X)
- gap_session:    league_id=X, season_id=None   → league all-time only
- season_session: league_id=X, season_id=Y      → season + league all-time
- pickup_session: league_id=None, season_id=None → global only
- other_league:   league_id=Z, season_id=None   → different league, must not appear
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
from backend.services.stats.stats_calc_data import load_stat_eligible_matches_async
from backend.services.stats.stats_read_data import (
    get_league_matches_with_elo,
    get_player_match_history_by_id,
    query_matches,
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
async def gap_game_world(db_session: AsyncSession):
    """
    Create the full data world needed for Phase 5 tests.

    Returns a dict with keys:
        league, league_other, season,
        gap_session, season_session, pickup_session, other_session,
        gap_match, season_match, pickup_match, other_match,
        players (list of 4 Player objects)
    """
    # Players
    alice = await _make_player(db_session, "Alice Gap")
    bob = await _make_player(db_session, "Bob Gap")
    charlie = await _make_player(db_session, "Charlie Gap")
    dave = await _make_player(db_session, "Dave Gap")
    players = [alice, bob, charlie, dave]

    # Leagues
    league = League(name="League X", is_open=True, created_by=alice.id)
    league_other = League(name="League Z", is_open=True, created_by=alice.id)
    db_session.add(league)
    db_session.add(league_other)
    await db_session.flush()

    # Season belongs to league X
    season = Season(
        league_id=league.id,
        name="Season Y",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 12, 31),
        created_by=alice.id,
    )
    db_session.add(season)
    await db_session.flush()

    # Sessions
    gap_session = Session(
        date="2024-03-01",
        name="Gap Game Session",
        status=SessionStatus.SUBMITTED,
        league_id=league.id,
        season_id=None,
        created_by=alice.id,
    )
    season_session = Session(
        date="2024-03-15",
        name="Season Game Session",
        status=SessionStatus.SUBMITTED,
        league_id=league.id,
        season_id=season.id,
        created_by=alice.id,
    )
    pickup_session = Session(
        date="2024-04-01",
        name="Pickup Session",
        status=SessionStatus.SUBMITTED,
        league_id=None,
        season_id=None,
        created_by=alice.id,
    )
    other_session = Session(
        date="2024-04-15",
        name="Other League Session",
        status=SessionStatus.SUBMITTED,
        league_id=league_other.id,
        season_id=None,
        created_by=alice.id,
    )
    db_session.add_all([gap_session, season_session, pickup_session, other_session])
    await db_session.flush()

    # Matches (one per session)
    gap_match = await _make_match(db_session, gap_session, alice, bob, charlie, dave)
    season_match = await _make_match(db_session, season_session, alice, bob, charlie, dave)
    pickup_match = await _make_match(db_session, pickup_session, alice, bob, charlie, dave)
    other_match = await _make_match(db_session, other_session, alice, bob, charlie, dave)

    await db_session.commit()

    # Refresh to populate .id attributes on all objects
    for obj in [
        league,
        league_other,
        season,
        gap_session,
        season_session,
        pickup_session,
        other_session,
        gap_match,
        season_match,
        pickup_match,
        other_match,
        *players,
    ]:
        await db_session.refresh(obj)

    return {
        "league": league,
        "league_other": league_other,
        "season": season,
        "gap_session": gap_session,
        "season_session": season_session,
        "pickup_session": pickup_session,
        "other_session": other_session,
        "gap_match": gap_match,
        "season_match": season_match,
        "pickup_match": pickup_match,
        "other_match": other_match,
        "players": players,
    }


# ---------------------------------------------------------------------------
# Test 1: load_stat_eligible_matches_async(league_id=X) includes gap-game match
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_loader_league_includes_gap_and_season_matches(
    db_session: AsyncSession, gap_game_world: dict
):
    """
    load_stat_eligible_matches_async(league_id=X) must return BOTH:
    - the gap-game match (session with league_id=X, season_id=None)
    - the season-game match (session with league_id=X, season_id=Y)
    """
    league = gap_game_world["league"]
    gap_match = gap_game_world["gap_match"]
    season_match = gap_game_world["season_match"]

    matches = await load_stat_eligible_matches_async(db_session, league_id=league.id)
    match_ids = {m.id for m in matches}

    assert gap_match.id in match_ids, (
        f"Gap-game match {gap_match.id} was NOT returned for league_id={league.id}; "
        f"got ids: {match_ids}"
    )
    assert season_match.id in match_ids, (
        f"Season-game match {season_match.id} was NOT returned for league_id={league.id}; "
        f"got ids: {match_ids}"
    )


# ---------------------------------------------------------------------------
# Test 2: load_stat_eligible_matches_async(season_id=Y) EXCLUDES gap-game match
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_loader_season_excludes_gap_match(db_session: AsyncSession, gap_game_world: dict):
    """
    load_stat_eligible_matches_async(season_id=Y) must include the season-game
    match and MUST NOT include the gap-game match (which has season_id=None).
    """
    season = gap_game_world["season"]
    gap_match = gap_game_world["gap_match"]
    season_match = gap_game_world["season_match"]

    matches = await load_stat_eligible_matches_async(db_session, season_id=season.id)
    match_ids = {m.id for m in matches}

    assert season_match.id in match_ids, (
        f"Season-game match {season_match.id} missing from season_id={season.id} results"
    )
    assert gap_match.id not in match_ids, (
        f"Gap-game match {gap_match.id} must NOT appear in season_id={season.id} results; "
        f"it has season_id=None and must not count toward season stats"
    )


# ---------------------------------------------------------------------------
# Test 3: league loader excludes pickup and other-league matches
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_loader_league_excludes_pickup_and_other_league(
    db_session: AsyncSession, gap_game_world: dict
):
    """
    load_stat_eligible_matches_async(league_id=X) must exclude:
    - pickup matches (session league_id=None)
    - matches from a different league (league_id=Z)
    """
    league = gap_game_world["league"]
    pickup_match = gap_game_world["pickup_match"]
    other_match = gap_game_world["other_match"]

    matches = await load_stat_eligible_matches_async(db_session, league_id=league.id)
    match_ids = {m.id for m in matches}

    assert pickup_match.id not in match_ids, (
        f"Pickup match {pickup_match.id} must NOT appear in league_id={league.id} results"
    )
    assert other_match.id not in match_ids, (
        f"Other-league match {other_match.id} must NOT appear in league_id={league.id} results"
    )


# ---------------------------------------------------------------------------
# Test 4: query_matches({league_id: X}) returns gap-game match
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_query_matches_league_includes_gap_match(
    db_session: AsyncSession, gap_game_world: dict
):
    """
    query_matches with league_id=X must return the gap-game match.

    Regression: the old code filtered `Session.season_id.isnot(None)` which
    excluded gap games entirely from league-scoped match queries.
    """
    league = gap_game_world["league"]
    gap_match = gap_game_world["gap_match"]
    season_match = gap_game_world["season_match"]
    pickup_match = gap_game_world["pickup_match"]
    other_match = gap_game_world["other_match"]

    result = await query_matches(
        db_session,
        body={
            "league_id": league.id,
            "include_non_public": True,
            "submitted_only": True,
            "limit": 100,
            "offset": 0,
        },
    )
    result_ids = {row["id"] for row in result}

    assert gap_match.id in result_ids, (
        f"Gap-game match {gap_match.id} must appear in query_matches(league_id={league.id}); "
        f"got ids: {result_ids}"
    )
    assert season_match.id in result_ids, (
        f"Season-game match {season_match.id} must appear in query_matches(league_id={league.id})"
    )
    assert pickup_match.id not in result_ids, (
        f"Pickup match {pickup_match.id} must NOT appear in query_matches(league_id={league.id})"
    )
    assert other_match.id not in result_ids, (
        f"Other-league match {other_match.id} must NOT appear in "
        f"query_matches(league_id={league.id})"
    )


# ---------------------------------------------------------------------------
# Test 5: get_player_match_history_by_id — gap-game row has league_id / league_name
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_player_match_history_gap_game_has_league_info(
    db_session: AsyncSession, gap_game_world: dict
):
    """
    get_player_match_history_by_id must return non-None league_id and league_name
    for gap-game matches, and None for season_name (correct — gap game has no season).

    Regression: the old query joined Season → League via Season.league_id, so gap
    games (season=NULL) returned NULL league_id / league_name even though the
    Session itself had league_id set.
    """
    alice = gap_game_world["players"][0]
    league = gap_game_world["league"]
    gap_match = gap_game_world["gap_match"]
    season_match = gap_game_world["season_match"]

    history = await get_player_match_history_by_id(db_session, alice.id)
    assert history is not None, "Expected non-None match history for Alice"

    gap_rows = [r for r in history if r["session_id"] == gap_game_world["gap_session"].id]
    assert len(gap_rows) == 1, (
        f"Expected exactly 1 gap-game history row for Alice, got {len(gap_rows)}"
    )
    gap_row = gap_rows[0]

    assert gap_row["league_id"] == league.id, (
        f"Gap-game row league_id should be {league.id}, got {gap_row['league_id']}"
    )
    assert gap_row["league_name"] == league.name, (
        f"Gap-game row league_name should be '{league.name}', got {gap_row['league_name']}"
    )
    assert gap_row["season_name"] is None, (
        f"Gap-game row season_name should be None (no season), got {gap_row['season_name']!r}"
    )

    # Season-game must still have both league_id AND season_name populated
    season_rows = [r for r in history if r["session_id"] == gap_game_world["season_session"].id]
    assert len(season_rows) == 1
    season_row = season_rows[0]
    assert season_row["league_id"] == league.id
    assert season_row["season_name"] == gap_game_world["season"].name


# ---------------------------------------------------------------------------
# Test 6: get_league_matches_with_elo(league_id=X) includes gap-game match
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_league_matches_with_elo_includes_gap_match(
    db_session: AsyncSession, gap_game_world: dict
):
    """
    get_league_matches_with_elo must return gap-game matches.

    Regression (site 2a): the query used `.where(Season.league_id == league_id)` which
    required a non-NULL Season join — gap games (season_id=NULL) were excluded.
    """
    league = gap_game_world["league"]
    gap_match = gap_game_world["gap_match"]
    season_match = gap_game_world["season_match"]
    pickup_match = gap_game_world["pickup_match"]
    other_match = gap_game_world["other_match"]

    results = await get_league_matches_with_elo(db_session, league_id=league.id)
    result_ids = {row["id"] for row in results}

    assert gap_match.id in result_ids, (
        f"Gap-game match {gap_match.id} must appear in get_league_matches_with_elo "
        f"for league {league.id}; got: {result_ids}"
    )
    assert season_match.id in result_ids, (
        f"Season-game match {season_match.id} must appear in get_league_matches_with_elo"
    )
    assert pickup_match.id not in result_ids, (
        f"Pickup match must NOT appear in get_league_matches_with_elo for league {league.id}"
    )
    assert other_match.id not in result_ids, (
        f"Other-league match must NOT appear in get_league_matches_with_elo for league {league.id}"
    )


# ---------------------------------------------------------------------------
# Test 7: lock_in_session on a gap game enqueues a league recalc (write side)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_lock_in_gap_session_enqueues_league_recalc(
    db_session: AsyncSession, gap_game_world: dict, monkeypatch
):
    """Submitting a gap-game session must enqueue a league recalculation.

    Regression (write-side mirror of the read-side fix): lock_in_session
    previously derived league_id via the Season join and guarded on
    ``if season_id:``, so a gap game (season_id=None) triggered NO league
    recalc — reads showed gap games but stats were never recomputed.  It now
    reads ``Session.league_id`` directly.
    """
    from backend.services import stats_queue
    from backend.services.games.session_data import lock_in_session

    enqueue_calls: list[tuple[str, int | None]] = []

    class _FakeQueue:
        async def enqueue_calculation(self, session, calc_type, league_id=None):
            enqueue_calls.append((calc_type, league_id))
            return 1

    monkeypatch.setattr(stats_queue, "get_stats_queue", lambda: _FakeQueue())

    league = gap_game_world["league"]
    gap_session = gap_game_world["gap_session"]

    result = await lock_in_session(db_session, gap_session.id)

    assert result is not None
    assert result["season_id"] is None
    assert result["league_job_id"] is not None, "gap game must enqueue a league recalc"
    assert ("league", league.id) in enqueue_calls
    assert ("global", None) in enqueue_calls


@pytest.mark.asyncio
async def test_lock_in_pickup_session_skips_league_recalc(
    db_session: AsyncSession, gap_game_world: dict, monkeypatch
):
    """A pickup session (league_id=None) must NOT enqueue any league recalc."""
    from backend.services import stats_queue
    from backend.services.games.session_data import lock_in_session

    enqueue_calls: list[tuple[str, int | None]] = []

    class _FakeQueue:
        async def enqueue_calculation(self, session, calc_type, league_id=None):
            enqueue_calls.append((calc_type, league_id))
            return 1

    monkeypatch.setattr(stats_queue, "get_stats_queue", lambda: _FakeQueue())

    pickup_session = gap_game_world["pickup_session"]

    result = await lock_in_session(db_session, pickup_session.id)

    assert result is not None
    assert result["league_job_id"] is None
    assert all(calc_type != "league" for calc_type, _ in enqueue_calls)
    assert ("global", None) in enqueue_calls
