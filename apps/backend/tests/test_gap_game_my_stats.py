"""Tests for Bug #2: my_stats_service drops gap games from league-scoped stats.

The four ``_seasons_in_league_subquery`` call sites in my_stats_service.py use
``Session.season_id.in_(...)`` which excludes gap games (season_id=NULL).
The fix replaces those four sites with ``Session.league_id == league_id``.

Test structure mirrors test_gap_game_stats_routing.py but targets the four
specific stat-computation helpers:
  - _peak_rating_from_aggregates  (line 260)
  - _elo_timeline_full            (line 372)
  - _overall_from_matches         (line 420)
  - _compute_current_streak       (line 617)
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    EloHistory,
    League,
    Match,
    Player,
    Season,
    Session,
    SessionStatus,
)
from backend.services.stats.my_stats_service import (
    _compute_current_streak,
    _elo_timeline_full,
    _overall_from_matches,
    _peak_rating_from_aggregates,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _make_player(db: AsyncSession, name: str) -> Player:
    """Create and persist a Player."""
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
    winner: int = 1,
) -> Match:
    """Create a ranked, public, stat-eligible match."""
    m = Match(
        session_id=sess.id,
        team1_player1_id=p1.id,
        team1_player2_id=p2.id,
        team2_player1_id=p3.id,
        team2_player2_id=p4.id,
        team1_score=21,
        team2_score=15,
        winner=winner,
        is_ranked=True,
        ranked_intent=True,
        is_public=True,
        created_by=p1.id,
    )
    db.add(m)
    await db.flush()
    return m


# ---------------------------------------------------------------------------
# Fixture: full data world
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def stats_world(db_session: AsyncSession) -> dict:
    """
    Build a minimal data world for my_stats bug tests.

    Layout:
      - alice: the player-under-test
      - bob, carol, dave: opponents/partners
      - league: the primary league
      - season: season belonging to league
      - gap_session:    league_id=league, season_id=None   → gap game
      - season_session: league_id=league, season_id=season → season game
      - pickup_session: league_id=None,   season_id=None   → pickup
    Each session has exactly one match featuring alice.
    """
    alice = await _make_player(db_session, "Alice Stats")
    bob = await _make_player(db_session, "Bob Stats")
    carol = await _make_player(db_session, "Carol Stats")
    dave = await _make_player(db_session, "Dave Stats")

    league = League(name="Stats League", is_open=True, created_by=alice.id)
    db_session.add(league)
    await db_session.flush()

    season = Season(
        league_id=league.id,
        name="Stats Season",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 12, 31),
        created_by=alice.id,
    )
    db_session.add(season)
    await db_session.flush()

    gap_session = Session(
        date="2024-03-01",
        name="Gap Session",
        status=SessionStatus.SUBMITTED,
        league_id=league.id,
        season_id=None,
        created_by=alice.id,
    )
    season_session = Session(
        date="2024-03-15",
        name="Season Session",
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
    db_session.add_all([gap_session, season_session, pickup_session])
    await db_session.flush()

    gap_match = await _make_match(db_session, gap_session, alice, bob, carol, dave, winner=1)
    season_match = await _make_match(db_session, season_session, alice, bob, carol, dave, winner=1)
    pickup_match = await _make_match(db_session, pickup_session, alice, bob, carol, dave, winner=1)

    # EloHistory rows for the peak/timeline tests
    db_session.add(
        EloHistory(
            player_id=alice.id,
            match_id=gap_match.id,
            elo_after=1020,
            elo_change=20,
            date="2024-03-01",
        )
    )
    db_session.add(
        EloHistory(
            player_id=alice.id,
            match_id=season_match.id,
            elo_after=1045,
            elo_change=25,
            date="2024-03-15",
        )
    )
    db_session.add(
        EloHistory(
            player_id=alice.id,
            match_id=pickup_match.id,
            elo_after=1060,
            elo_change=15,
            date="2024-04-01",
        )
    )
    await db_session.commit()

    for obj in [
        league,
        season,
        gap_session,
        season_session,
        pickup_session,
        gap_match,
        season_match,
        pickup_match,
        alice,
        bob,
        carol,
        dave,
    ]:
        await db_session.refresh(obj)

    return {
        "alice": alice,
        "bob": bob,
        "carol": carol,
        "dave": dave,
        "league": league,
        "season": season,
        "gap_session": gap_session,
        "season_session": season_session,
        "pickup_session": pickup_session,
        "gap_match": gap_match,
        "season_match": season_match,
        "pickup_match": pickup_match,
    }


# ---------------------------------------------------------------------------
# Bug #2a: _peak_rating_from_aggregates (line 260)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_peak_rating_includes_gap_game_elo(db_session: AsyncSession, stats_world: dict):
    """REGRESSION (Bug #2, site 1): peak ELO must include gap-game sessions.

    Old code: ``.where(Session.season_id.in_(_seasons_in_league_subquery(league_id)))``
    excluded gap games (season_id=NULL).  The gap-game ELO row (elo_after=1020)
    was never counted, so the peak was under-reported.

    This test detects the bug by verifying the gap-game ELO entry is visible
    when the season-game ELO is LOWER (1010) and the gap-game ELO is the peak
    (1020).  With the old code, only the season ELO (1010) is returned,
    making peak=1010 instead of 1020.
    """
    from backend.database.models import EloHistory as EH

    alice = stats_world["alice"]
    league = stats_world["league"]
    gap_match = stats_world["gap_match"]
    season_match = stats_world["season_match"]

    # Overwrite ELO history so gap-game ELO (1020) > season-game ELO (1010).
    # The old code only sees the season match, so it returns 1010.  The fix
    # must return 1020 because the gap match has the higher peak.
    existing_gap = await db_session.get(EH, {"player_id": alice.id, "match_id": gap_match.id})
    if existing_gap:
        existing_gap.elo_after = 1020
        existing_gap.elo_change = 20
    existing_season = await db_session.get(
        EH, {"player_id": alice.id, "match_id": season_match.id}
    )
    if existing_season:
        existing_season.elo_after = 1010
        existing_season.elo_change = -10
    await db_session.commit()

    peak = await _peak_rating_from_aggregates(db_session, alice.id, league_id=league.id)

    assert peak is not None, "peak_rating must not be None for a player with ELO history"
    assert peak == 1020, (
        f"Peak rating for league_id={league.id} should be 1020 (from the gap-game ELO), "
        f"got {peak}.  Bug #2 (site 1) not fixed: season_id filter excludes the gap-game ELO, "
        "returning only the season-game peak of 1010."
    )


# ---------------------------------------------------------------------------
# Bug #2b: _elo_timeline_full (line 372)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_elo_timeline_includes_gap_game_date(db_session: AsyncSession, stats_world: dict):
    """REGRESSION (Bug #2, site 2): ELO timeline must include gap-game ELO entry.

    Old code excluded gap games from the timeline because the session_id filter
    was Season-based.  The gap-game ELO date 2024-03-01 must appear.
    """
    alice = stats_world["alice"]
    league = stats_world["league"]

    timeline = await _elo_timeline_full(db_session, alice.id, league_id=league.id)
    dates_in_timeline = {entry["date"] for entry in timeline}

    assert "2024-03-01" in dates_in_timeline, (
        "ELO timeline for league_id must include the gap-game date 2024-03-01.  "
        "Bug #2 (site 2) not fixed: _seasons_in_league_subquery still in use."
    )
    assert "2024-03-15" in dates_in_timeline, (
        "ELO timeline must still include the season-game date 2024-03-15"
    )
    # Pickup match ELO (2024-04-01) must NOT appear in league-scoped timeline
    assert "2024-04-01" not in dates_in_timeline, (
        "ELO timeline for league must NOT include the pickup-game ELO (pickup has no league_id)"
    )


# ---------------------------------------------------------------------------
# Bug #2c: _overall_from_matches (line 420)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_overall_from_matches_counts_gap_game(db_session: AsyncSession, stats_world: dict):
    """REGRESSION (Bug #2, site 3): _overall_from_matches must count gap games.

    Old code: ``Session.season_id.in_(_seasons_in_league_subquery(league_id))``
    excluded the gap-game match, so games_played was 1 instead of 2.
    """
    alice = stats_world["alice"]
    league = stats_world["league"]

    match_ids, overall = await _overall_from_matches(
        db_session, alice.id, league_id=league.id, date_cutoff=None
    )

    assert overall["games_played"] >= 2, (
        f"_overall_from_matches(league_id={league.id}) must count both the gap-game "
        f"match and the season-game match (games_played >= 2), got {overall['games_played']}.  "
        "Bug #2 (site 3) not fixed."
    )
    # Pickup match must NOT be counted
    assert overall["games_played"] == 2, (
        "games_played must be exactly 2 (gap + season), NOT 3 (pickup must be excluded)"
    )


# ---------------------------------------------------------------------------
# Bug #2d: _compute_current_streak (line 617)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_current_streak_includes_gap_game(db_session: AsyncSession, stats_world: dict):
    """REGRESSION (Bug #2, site 4): streak must include gap-game matches.

    Both gap and season matches are wins for alice (winner=1, alice on team1).
    Old code only saw the season match, giving streak=1.  Fixed code sees both,
    giving streak=2 (consecutive wins).
    """
    alice = stats_world["alice"]
    league = stats_world["league"]

    streak = await _compute_current_streak(db_session, alice.id, league_id=league.id)

    # Both gap and season matches are wins; consecutive → streak +2
    assert streak == 2, (
        f"_compute_current_streak(league_id={league.id}) should be 2 (both gap and season "
        f"are alice's wins), got {streak}.  Bug #2 (site 4) not fixed."
    )
