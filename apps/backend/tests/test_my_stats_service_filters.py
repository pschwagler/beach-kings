"""
Integration tests for my_stats_service filter paths (P3.5).

Covers the three computation paths in ``get_my_stats``:
1. Fast path — no filters
2. League-only path — ``league_id`` set
3. Recompute path — ``days`` set (with or without ``league_id``)

Seeds two leagues (A, B) with one season each, a focal player P, two partners
and two opponents, and matches distributed across the last ~400 days. Each
test exercises a different combination of filters and asserts the resulting
overall counts, breakdowns, and timeline reflect only the windowed activity.

Trophies are intentionally not seeded — they are not windowed by ``days`` and
their league-filtering logic is exercised at the unit level by other tests.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import List, Tuple

import pytest
import pytest_asyncio

from backend.database.models import (
    EloHistory,
    League,
    Match,
    Player,
    PlayerGlobalStats,
    Season,
    Session,
    SessionStatus,
)
from backend.services import my_stats_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _iso(d: date) -> str:
    return d.isoformat()


async def _create_player(db_session, full_name: str) -> Player:
    p = Player(full_name=full_name, first_name=full_name.split()[0], last_name=full_name.split()[-1])
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


async def _create_league(db_session, name: str) -> League:
    league = League(name=name)
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)
    return league


async def _create_season(db_session, league: League, name: str) -> Season:
    season = Season(
        league_id=league.id,
        name=name,
        start_date=date.today() - timedelta(days=730),
        end_date=date.today() + timedelta(days=30),
    )
    db_session.add(season)
    await db_session.commit()
    await db_session.refresh(season)
    return season


async def _create_session(
    db_session, season: Season, when: date, name: str = "S"
) -> Session:
    s = Session(
        date=_iso(when),
        name=name,
        status=SessionStatus.SUBMITTED,
        season_id=season.id,
    )
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)
    return s


async def _create_match(
    db_session,
    session_obj: Session,
    team1: Tuple[int, int],
    team2: Tuple[int, int],
    score1: int,
    score2: int,
) -> Match:
    if score1 > score2:
        winner = 1
    elif score2 > score1:
        winner = 2
    else:
        winner = -1
    m = Match(
        session_id=session_obj.id,
        team1_player1_id=team1[0],
        team1_player2_id=team1[1],
        team2_player1_id=team2[0],
        team2_player2_id=team2[1],
        team1_score=score1,
        team2_score=score2,
        winner=winner,
    )
    db_session.add(m)
    await db_session.commit()
    await db_session.refresh(m)
    return m


async def _add_elo(db_session, player_id: int, match_id: int, when: date, elo_after: float):
    eh = EloHistory(
        player_id=player_id,
        match_id=match_id,
        date=_iso(when),
        elo_after=elo_after,
        elo_change=0.0,
    )
    db_session.add(eh)
    await db_session.commit()


# ---------------------------------------------------------------------------
# Fixture: full seed
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def seeded(db_session):
    """Seed two leagues, one season each, players, matches across time."""
    p = await _create_player(db_session, "Player Focal")
    partner_a = await _create_player(db_session, "Partner A")
    partner_b = await _create_player(db_session, "Partner B")
    opp_a = await _create_player(db_session, "Opp A")
    opp_b = await _create_player(db_session, "Opp B")

    league_a = await _create_league(db_session, "League A")
    league_b = await _create_league(db_session, "League B")
    season_a = await _create_season(db_session, league_a, "Season A1")
    season_b = await _create_season(db_session, league_b, "Season B1")

    # Global stats row so current_rating doesn't fall back to INITIAL_ELO.
    # Lifetime totals span both leagues so the (None, None) baseline test has
    # something meaningful to assert against.
    db_session.add(
        PlayerGlobalStats(
            player_id=p.id,
            current_rating=1500.0,
            total_games=6,
            total_wins=4,
            avg_point_diff=3.5,
        )
    )
    await db_session.commit()

    today = date.today()

    # League A — recent (10d): 2 wins with partner_a vs opp_a/opp_b.
    sess_a_recent = await _create_session(db_session, season_a, today - timedelta(days=10), "AR")
    m1 = await _create_match(
        db_session, sess_a_recent, (p.id, partner_a.id), (opp_a.id, opp_b.id), 21, 15
    )
    m2 = await _create_match(
        db_session, sess_a_recent, (p.id, partner_a.id), (opp_a.id, opp_b.id), 21, 18
    )
    await _add_elo(db_session, p.id, m1.id, today - timedelta(days=10), 1520.0)
    await _add_elo(db_session, p.id, m2.id, today - timedelta(days=10), 1540.0)

    # League A — old (200d): 1 loss with partner_b vs opp_a/opp_b.
    sess_a_old = await _create_session(db_session, season_a, today - timedelta(days=200), "AO")
    m3 = await _create_match(
        db_session, sess_a_old, (p.id, partner_b.id), (opp_a.id, opp_b.id), 12, 21
    )
    await _add_elo(db_session, p.id, m3.id, today - timedelta(days=200), 1480.0)

    # League B — recent (5d): 1 win + 1 loss with partner_b vs opp_a/opp_b.
    sess_b_recent = await _create_session(db_session, season_b, today - timedelta(days=5), "BR")
    m4 = await _create_match(
        db_session, sess_b_recent, (p.id, partner_b.id), (opp_a.id, opp_b.id), 21, 10
    )
    m5 = await _create_match(
        db_session, sess_b_recent, (p.id, partner_b.id), (opp_a.id, opp_b.id), 17, 21
    )
    await _add_elo(db_session, p.id, m4.id, today - timedelta(days=5), 1560.0)
    await _add_elo(db_session, p.id, m5.id, today - timedelta(days=5), 1545.0)

    # League B — old (300d): 1 win with partner_a vs opp_a/opp_b.
    sess_b_old = await _create_session(db_session, season_b, today - timedelta(days=300), "BO")
    m6 = await _create_match(
        db_session, sess_b_old, (p.id, partner_a.id), (opp_a.id, opp_b.id), 21, 19
    )
    await _add_elo(db_session, p.id, m6.id, today - timedelta(days=300), 1495.0)

    return {
        "player": p,
        "partner_a": partner_a,
        "partner_b": partner_b,
        "opp_a": opp_a,
        "opp_b": opp_b,
        "league_a": league_a,
        "league_b": league_b,
        "season_a": season_a,
        "season_b": season_b,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_no_filters_baseline(db_session, seeded):
    """No filters: lifetime overall block is read from PlayerGlobalStats, and
    elo_timeline reflects every match across both leagues."""
    payload = await my_stats_service.get_my_stats(
        session=db_session, player_id=seeded["player"].id
    )

    assert payload is not None
    overall = payload["overall"]
    # current_rating + lifetime totals from PlayerGlobalStats
    assert overall["rating"] == 1500
    assert overall["games_played"] == 6
    assert overall["wins"] == 4
    assert overall["losses"] == 2
    # win_rate is percentage (0-100) — 4/6 ≈ 66.7
    assert overall["win_rate"] == pytest.approx(66.7, abs=0.1)
    assert overall["avg_point_diff"] == pytest.approx(3.5, abs=0.1)
    # peak_rating max across all matches: 1560
    assert overall["peak_rating"] == 1560
    # elo_timeline has every distinct elo date: -300, -200, -10, -5
    dates = [pt["date"] for pt in payload["elo_timeline"]]
    assert len(dates) == 4
    assert dates == sorted(dates)


@pytest.mark.asyncio
async def test_no_filters_falls_back_when_global_stats_missing(db_session, seeded):
    """If PlayerGlobalStats is missing the row, lifetime overall block is zeros.

    Regression guard: previously this path read PlayerSeasonStats's most-recent
    row and returned latest-season numbers as if they were lifetime.
    """
    # Drop the seeded PlayerGlobalStats row.
    from sqlalchemy import delete

    await db_session.execute(
        delete(PlayerGlobalStats).where(PlayerGlobalStats.player_id == seeded["player"].id)
    )
    await db_session.commit()

    payload = await my_stats_service.get_my_stats(
        session=db_session, player_id=seeded["player"].id
    )
    assert payload is not None
    overall = payload["overall"]
    assert overall["games_played"] == 0
    assert overall["wins"] == 0
    assert overall["losses"] == 0
    assert overall["win_rate"] == 0.0
    assert overall["avg_point_diff"] == 0.0


@pytest.mark.asyncio
async def test_league_a_only(db_session, seeded):
    """league_id=A: peak and elo_timeline restricted to league A matches."""
    payload = await my_stats_service.get_my_stats(
        session=db_session, player_id=seeded["player"].id, league_id=seeded["league_a"].id
    )

    assert payload is not None
    # League A peak: max(1520, 1540, 1480) = 1540
    assert payload["overall"]["peak_rating"] == 1540
    # Only league A elo dates: -200, -10
    assert len(payload["elo_timeline"]) == 2


@pytest.mark.asyncio
async def test_days_30_only(db_session, seeded):
    """days=30: recomputes from raw matches in last 30 days across both leagues.

    Recent matches: 2 in league A (-10d, both wins) + 2 in league B (-5d, 1W/1L) = 4 matches.
    Wins = 3, losses = 1, games = 4.
    """
    payload = await my_stats_service.get_my_stats(
        session=db_session, player_id=seeded["player"].id, days=30
    )

    assert payload is not None
    overall = payload["overall"]
    assert overall["games_played"] == 4
    assert overall["wins"] == 3
    assert overall["losses"] == 1
    assert overall["win_rate"] == 75.0
    # Peak across recompute set: max(1520, 1540, 1560, 1545) = 1560
    assert overall["peak_rating"] == 1560
    # Partners: partner_a in 2 league-A games, partner_b in 2 league-B games
    partner_ids = {row["player_id"]: row for row in payload["partners"]}
    assert seeded["partner_a"].id in partner_ids
    assert seeded["partner_b"].id in partner_ids
    assert partner_ids[seeded["partner_a"].id]["games_played"] == 2
    assert partner_ids[seeded["partner_a"].id]["wins"] == 2
    assert partner_ids[seeded["partner_b"].id]["games_played"] == 2
    assert partner_ids[seeded["partner_b"].id]["wins"] == 1
    # Opponents: opp_a + opp_b in all 4 recent matches
    for opp_row in payload["opponents"]:
        assert opp_row["games_played"] == 4
    # ELO timeline restricted to 4 matches → 2 distinct dates (-10 and -5)
    assert len(payload["elo_timeline"]) == 2


@pytest.mark.asyncio
async def test_league_a_and_days_30(db_session, seeded):
    """league_id=A AND days=30: only league A's recent (-10d) matches qualify.

    Two wins with partner_a vs opp_a/opp_b.
    """
    payload = await my_stats_service.get_my_stats(
        session=db_session,
        player_id=seeded["player"].id,
        league_id=seeded["league_a"].id,
        days=30,
    )

    assert payload is not None
    overall = payload["overall"]
    assert overall["games_played"] == 2
    assert overall["wins"] == 2
    assert overall["losses"] == 0
    assert overall["win_rate"] == 100.0
    # Only partner_a appears
    partner_ids = {row["player_id"] for row in payload["partners"]}
    assert partner_ids == {seeded["partner_a"].id}
    # ELO timeline: 1 distinct date
    assert len(payload["elo_timeline"]) == 1


@pytest.mark.asyncio
async def test_days_30_no_recent_activity(db_session, seeded):
    """days window with zero matches → zeros + empty arrays + peak falls
    back to current_rating."""
    payload = await my_stats_service.get_my_stats(
        session=db_session, player_id=seeded["player"].id, days=1
    )

    # days=1 means "last 1 day"; cutoff is yesterday's ISO date.
    # All seeded matches are 5+ days old → empty result set.
    assert payload is not None
    overall = payload["overall"]
    assert overall["games_played"] == 0
    assert overall["wins"] == 0
    assert overall["losses"] == 0
    assert overall["win_rate"] == 0.0
    assert overall["avg_point_diff"] == 0.0
    # peak falls back to current_rating
    assert overall["peak_rating"] == overall["rating"] == 1500
    assert payload["partners"] == []
    assert payload["opponents"] == []
    assert payload["elo_timeline"] == []
    assert overall["current_streak"] == 0


@pytest.mark.asyncio
async def test_league_with_no_player_matches(db_session, seeded):
    """league_id pointing at a league the player has no matches in → zeros."""
    # Create a third league with no matches
    league_c = await _create_league(db_session, "League C")

    payload = await my_stats_service.get_my_stats(
        session=db_session, player_id=seeded["player"].id, league_id=league_c.id
    )

    assert payload is not None
    overall = payload["overall"]
    assert overall["games_played"] == 0
    assert overall["wins"] == 0
    assert overall["losses"] == 0
    # peak falls back to current rating since no matches in league C
    assert overall["peak_rating"] == 1500
    assert payload["partners"] == []
    assert payload["opponents"] == []
    assert payload["elo_timeline"] == []


@pytest.mark.asyncio
async def test_streak_bounded_by_filters(db_session, seeded):
    """Streak is bounded by league_id + days filters.

    League A in last 30 days: only 2 wins → win streak of +2.
    """
    payload = await my_stats_service.get_my_stats(
        session=db_session,
        player_id=seeded["player"].id,
        league_id=seeded["league_a"].id,
        days=30,
    )

    assert payload is not None
    assert payload["overall"]["current_streak"] == 2
