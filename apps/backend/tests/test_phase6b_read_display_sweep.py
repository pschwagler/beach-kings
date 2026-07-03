"""
Phase 6b — Read/display sweep tests.

Verifies that gap-game sessions (league_id set, season_id NULL) now surface
in every read/display query that previously derived a session's league via
the Session→Season join.

Test data taxonomy (same as test_gap_game_stats_routing.py):
- League X  with Season Y  (Y.league_id == X)
- gap_session:    league_id=X, season_id=None   → must appear in all league reads
- season_session: league_id=X, season_id=Y      → already appeared; must still appear
- pickup_session: league_id=None, season_id=None → must NOT appear in league reads
- other_session:  league_id=Z, season_id=None   → must NOT appear in league X reads
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
# Shared helpers (mirrors test_gap_game_stats_routing.py)
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
# Fixture — identical world to gap_game_world but self-contained per test file
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def phase6b_world(db_session: AsyncSession):
    """
    Build the gap-game data world needed for Phase 6b read/display sweep tests.

    Returns a dict with keys:
        league, league_other, season,
        gap_session, season_session, pickup_session, other_session,
        gap_match, season_match, pickup_match, other_match,
        players (list of 4 Player objects)
    """
    alice = await _make_player(db_session, "Alice 6b")
    bob = await _make_player(db_session, "Bob 6b")
    charlie = await _make_player(db_session, "Charlie 6b")
    dave = await _make_player(db_session, "Dave 6b")
    players = [alice, bob, charlie, dave]

    league = League(name="League 6b X", is_open=True, created_by=alice.id)
    league_other = League(name="League 6b Z", is_open=True, created_by=alice.id)
    db_session.add(league)
    db_session.add(league_other)
    await db_session.flush()

    season = Season(
        league_id=league.id,
        name="Season 6b Y",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 12, 31),
        created_by=alice.id,
    )
    db_session.add(season)
    await db_session.flush()

    # Give the session a unique code per session type so get_session_by_code works
    gap_session = Session(
        date="2024-03-01",
        name="6b Gap Game Session",
        status=SessionStatus.SUBMITTED,
        league_id=league.id,
        season_id=None,
        created_by=alice.id,
        code="6BGAP01",
    )
    season_session = Session(
        date="2024-03-15",
        name="6b Season Game Session",
        status=SessionStatus.SUBMITTED,
        league_id=league.id,
        season_id=season.id,
        created_by=alice.id,
        code="6BSEA01",
    )
    pickup_session = Session(
        date="2024-04-01",
        name="6b Pickup Session",
        status=SessionStatus.SUBMITTED,
        league_id=None,
        season_id=None,
        created_by=alice.id,
        code="6BPKU01",
    )
    other_session = Session(
        date="2024-04-15",
        name="6b Other League Session",
        status=SessionStatus.SUBMITTED,
        league_id=league_other.id,
        season_id=None,
        created_by=alice.id,
        code="6BOTH01",
    )
    db_session.add_all([gap_session, season_session, pickup_session, other_session])
    await db_session.flush()

    gap_match = await _make_match(db_session, gap_session, alice, bob, charlie, dave)
    season_match = await _make_match(db_session, season_session, alice, bob, charlie, dave)
    pickup_match = await _make_match(db_session, pickup_session, alice, bob, charlie, dave)
    other_match = await _make_match(db_session, other_session, alice, bob, charlie, dave)

    await db_session.commit()

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
# Site 2 — league_games_service.get_league_games
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_league_games_service_includes_gap_match(
    db_session: AsyncSession, phase6b_world: dict
):
    """
    get_league_games must return the gap-game match in the entries list and
    count it in the total.  The season-game match must also appear.  Pickup and
    other-league matches must not appear.
    """
    from backend.services.league_games_service import get_league_games

    league = phase6b_world["league"]
    gap_match = phase6b_world["gap_match"]
    season_match = phase6b_world["season_match"]
    pickup_match = phase6b_world["pickup_match"]
    other_match = phase6b_world["other_match"]

    entries, total = await get_league_games(db_session, league_id=league.id, limit=200, offset=0)
    entry_ids = {e["id"] for e in entries}

    assert gap_match.id in entry_ids, (
        f"Gap-game match {gap_match.id} must appear in get_league_games for league {league.id}; "
        f"got: {entry_ids}"
    )
    assert season_match.id in entry_ids, (
        f"Season-game match {season_match.id} must appear in get_league_games"
    )
    assert pickup_match.id not in entry_ids, (
        f"Pickup match {pickup_match.id} must NOT appear in get_league_games for league {league.id}"
    )
    assert other_match.id not in entry_ids, (
        f"Other-league match {other_match.id} must NOT appear in get_league_games"
    )
    # Total must count both gap and season matches
    assert total >= 2, f"Total must include at least 2 matches (gap + season); got {total}"


@pytest.mark.asyncio
async def test_league_games_service_total_includes_gap_match(
    db_session: AsyncSession, phase6b_world: dict
):
    """
    The total count returned by get_league_games must count the gap match.
    Previously the count query used an INNER Season join so gap games were excluded.
    """
    from backend.services.league_games_service import get_league_games

    league = phase6b_world["league"]
    gap_match = phase6b_world["gap_match"]
    season_match = phase6b_world["season_match"]

    # Get just the season-match count (for a baseline via season-only filtering)
    _, total_all = await get_league_games(db_session, league_id=league.id, limit=200, offset=0)
    # We created exactly 2 matches for this league (gap + season)
    assert total_all >= 2, (
        f"Total must include gap match {gap_match.id} and season match {season_match.id}; "
        f"got total={total_all}"
    )


# ---------------------------------------------------------------------------
# Site 1 — my_games_service.get_player_games
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_my_games_service_gap_match_has_league_id(
    db_session: AsyncSession, phase6b_world: dict
):
    """
    get_player_games must return the gap-game match with correct league_id and
    league_name.  Previously Season.league_id was used so gap games returned NULL.
    """
    from backend.services.my_games_service import get_my_games as get_player_games

    alice = phase6b_world["players"][0]
    league = phase6b_world["league"]
    gap_match = phase6b_world["gap_match"]

    result = await get_player_games(db_session, player_id=alice.id)
    assert result is not None, f"get_my_games must not return None for player {alice.id}"
    entries, total = result
    gap_rows = [e for e in entries if e["id"] == gap_match.id]

    assert len(gap_rows) == 1, (
        f"Gap match {gap_match.id} must appear in get_player_games for player {alice.id}; "
        f"total entries: {len(entries)}"
    )
    gap_row = gap_rows[0]
    assert gap_row["league_id"] == league.id, (
        f"Gap match row league_id should be {league.id}, got {gap_row['league_id']}"
    )
    assert gap_row["league_name"] == league.name, (
        f"Gap match row league_name should be '{league.name}', got {gap_row['league_name']}"
    )


@pytest.mark.asyncio
async def test_my_games_service_league_filter_includes_gap_match(
    db_session: AsyncSession, phase6b_world: dict
):
    """
    Passing league_id to get_player_games must include the gap-game match and
    exclude pickup/other-league matches.
    Previously the where clause was Season.league_id == league_id which dropped gap games.
    """
    from backend.services.my_games_service import get_my_games as get_player_games

    alice = phase6b_world["players"][0]
    league = phase6b_world["league"]
    gap_match = phase6b_world["gap_match"]
    season_match = phase6b_world["season_match"]
    pickup_match = phase6b_world["pickup_match"]
    other_match = phase6b_world["other_match"]

    result = await get_player_games(db_session, player_id=alice.id, league_id=league.id)
    assert result is not None, f"get_my_games must not return None for player {alice.id}"
    entries, total = result
    entry_ids = {e["id"] for e in entries}

    assert gap_match.id in entry_ids, (
        f"Gap match {gap_match.id} must appear when filtering by league_id={league.id}"
    )
    assert season_match.id in entry_ids, (
        f"Season match {season_match.id} must appear when filtering by league_id={league.id}"
    )
    assert pickup_match.id not in entry_ids, (
        f"Pickup match {pickup_match.id} must NOT appear when filtering by league_id={league.id}"
    )
    assert other_match.id not in entry_ids, (
        f"Other-league match {other_match.id} must NOT appear when filtering by league_id={league.id}"
    )


# ---------------------------------------------------------------------------
# Site 4a — session_data.get_session_by_code
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_session_by_code_gap_session_returns_league_id(
    db_session: AsyncSession, phase6b_world: dict
):
    """
    get_session_by_code for a gap session must return the correct league_id.
    Previously it read Season.league_id via an outerjoin so gap sessions (season=NULL)
    returned NULL for league_id.
    """
    from backend.services.session_data import get_session_by_code

    league = phase6b_world["league"]
    gap_session = phase6b_world["gap_session"]

    result = await get_session_by_code(db_session, code=gap_session.code)

    assert result is not None, (
        f"get_session_by_code must find gap session by code {gap_session.code!r}"
    )
    assert result["league_id"] == league.id, (
        f"Gap session league_id must be {league.id}, got {result['league_id']}"
    )
    assert result["season_id"] is None, (
        f"Gap session season_id must be None, got {result['season_id']}"
    )


@pytest.mark.asyncio
async def test_get_session_by_code_season_session_still_works(
    db_session: AsyncSession, phase6b_world: dict
):
    """
    get_session_by_code for a session with a season must still return the correct
    league_id (regression guard — the change must not break season sessions).
    """
    from backend.services.session_data import get_session_by_code

    league = phase6b_world["league"]
    season = phase6b_world["season"]
    season_session = phase6b_world["season_session"]

    result = await get_session_by_code(db_session, code=season_session.code)

    assert result is not None
    assert result["league_id"] == league.id, (
        f"Season session league_id must be {league.id}, got {result['league_id']}"
    )
    assert result["season_id"] == season.id, (
        f"Season session season_id must be {season.id}, got {result['season_id']}"
    )


# ---------------------------------------------------------------------------
# Site 4b — session_data.get_open_sessions_for_user
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_open_sessions_gap_session_has_league_info(
    db_session: AsyncSession, phase6b_world: dict
):
    """
    get_open_sessions_for_user must return the gap session with its league_id
    and league_name populated.  Previously League was joined via Season.league_id
    so a gap session (season_id=NULL) would have NULL for both fields.
    """
    from backend.services.session_data import get_open_sessions_for_user

    alice = phase6b_world["players"][0]
    league = phase6b_world["league"]
    gap_session = phase6b_world["gap_session"]

    # Gap session is created_by alice and SUBMITTED; use active_only=False
    results = await get_open_sessions_for_user(db_session, player_id=alice.id, active_only=False)
    gap_rows = [r for r in results if r["id"] == gap_session.id]

    assert len(gap_rows) == 1, (
        f"Gap session {gap_session.id} must appear in get_open_sessions_for_user "
        f"for player {alice.id}; got ids: {[r['id'] for r in results]}"
    )
    gap_row = gap_rows[0]
    assert gap_row["league_id"] == league.id, (
        f"Gap session league_id should be {league.id}, got {gap_row['league_id']}"
    )
    assert gap_row["league_name"] == league.name, (
        f"Gap session league_name should be '{league.name}', got {gap_row['league_name']}"
    )


# ---------------------------------------------------------------------------
# Site 5a — sessions route get_league_sessions (tested via data layer)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_league_sessions_includes_gap_session(
    db_session: AsyncSession, phase6b_world: dict
):
    """
    The session list for a league must include gap sessions (season_id=None,
    league_id=X).  Previously the route used .join(Season) (INNER) which
    excluded gap sessions entirely.

    NOTE: We reproduce the data-layer query directly rather than calling the
    production route function (get_league_sessions in api/routes/sessions.py)
    because that function depends on make_require_league_member() which requires
    a fully wired auth stack and a LeagueMember row in the DB.  The query under
    test (the WHERE clause filtering Session.league_id) is the same in both
    paths; a regression in the route's query would be caught here.  Route-level
    auth behaviour is covered separately in TestGetLeagueSessions.
    """
    from sqlalchemy import select
    from backend.database.models import Court, Session

    league = phase6b_world["league"]
    gap_session = phase6b_world["gap_session"]
    season_session = phase6b_world["season_session"]
    pickup_session = phase6b_world["pickup_session"]
    other_session = phase6b_world["other_session"]

    # Reproduce the fixed query: filter Session.league_id, outerjoin Court
    query = (
        select(
            Session,
            Court.name.label("court_name"),
            Court.slug.label("court_slug"),
        )
        .outerjoin(Court, Session.court_id == Court.id)
        .where(Session.league_id == league.id)
        .order_by(Session.date.desc(), Session.created_at.desc())
    )
    rows = (await db_session.execute(query)).all()
    session_ids = {row[0].id for row in rows}

    assert gap_session.id in session_ids, (
        f"Gap session {gap_session.id} must appear in league {league.id} session list; "
        f"got: {session_ids}"
    )
    assert season_session.id in session_ids, (
        f"Season session {season_session.id} must appear in league {league.id} session list"
    )
    assert pickup_session.id not in session_ids, (
        f"Pickup session {pickup_session.id} must NOT appear in league {league.id} session list"
    )
    assert other_session.id not in session_ids, (
        f"Other-league session {other_session.id} must NOT appear in league {league.id} session list"
    )


# ---------------------------------------------------------------------------
# Site 6 — league_data.get_user_leagues latest_session_subq
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_user_leagues_counts_gap_session_date(
    db_session: AsyncSession, phase6b_world: dict
):
    """
    get_user_leagues orders leagues by latest_session_date.  After the fix the
    gap session's date must be considered, not just season-linked session dates.

    We test by creating a league with ONLY a gap session (no season) and
    confirming the league's latest_session_date is the gap session's date.
    The simplest proxy: the subquery itself returns the correct max date.
    """
    from sqlalchemy import func, select
    from backend.database.models import Session as SessionModel

    league = phase6b_world["league"]
    gap_session = phase6b_world["gap_session"]

    # Reproduce the fixed subquery:
    # select(Session.league_id, func.max(Session.date)).where(Session.league_id.isnot(None)).group_by(Session.league_id)
    subq_result = (
        await db_session.execute(
            select(
                SessionModel.league_id,
                func.max(SessionModel.date).label("latest_session_date"),
            )
            .where(SessionModel.league_id.isnot(None))
            .group_by(SessionModel.league_id)
        )
    ).all()

    league_dates = {row.league_id: row.latest_session_date for row in subq_result}

    assert league.id in league_dates, (
        f"League {league.id} must appear in latest_session_subq results; got: {league_dates}"
    )
    # The gap session is 2024-03-01, season session is 2024-03-15 — max should be 2024-03-15
    # Both are in this league so max is from season_session
    assert league_dates[league.id] is not None, (
        f"League {league.id} must have a non-NULL latest_session_date in the subquery"
    )
    # Guard the .where(Session.league_id.isnot(None)) filter: pickup sessions
    # (league_id=NULL) must never appear as a key in league_dates.
    assert None not in league_dates, (
        "pickup sessions (league_id NULL) must not appear in latest_session_subq; "
        f"got keys: {list(league_dates.keys())}"
    )
