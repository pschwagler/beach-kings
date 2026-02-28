"""
Tests for season awards service.

Verifies award computation (podium + stat awards), one-stat-per-player
exclusion, Rising Star with ELO history, lazy computation, double-compute
idempotency, award clearing on season re-open, update_season integration,
and minimum threshold enforcement.
"""

import pytest
import pytest_asyncio
import uuid
from datetime import date, timedelta

from sqlalchemy import select

from backend.database.models import (
    EloHistory,
    League,
    Match,
    Player,
    PlayerSeasonStats,
    Season,
    SeasonAward,
    Session,
    SessionStatus,
    Notification,
    NotificationType,
)
from backend.services import season_awards_service, data_service
from backend.services.season_awards_service import (
    compute_season_awards,
    get_season_awards,
    get_player_awards,
    get_league_awards,
    clear_season_awards,
    MIN_GAMES_STAT_AWARD,
)
from backend.services import user_service
from backend.utils.datetime_utils import utcnow


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _unique_phone():
    """Generate a unique phone number."""
    return f"+1555{uuid.uuid4().hex[:7]}"


@pytest_asyncio.fixture
async def users_and_players(db_session):
    """Create 6 players (3 with user accounts for notifications)."""
    players = []
    user_ids = []
    for i in range(1, 7):
        if i <= 3:
            user_id = await user_service.create_user(
                session=db_session, phone_number=_unique_phone(), password_hash="hashed"
            )
            user_ids.append(user_id)
        else:
            user_ids.append(None)

        p = Player(
            full_name=f"Award Player {i}",
            user_id=user_ids[-1],
            gender="M",
            level="intermediate",
        )
        db_session.add(p)
        await db_session.flush()
        players.append(p)

    return players, user_ids


@pytest_asyncio.fixture
async def league_and_past_season(db_session):
    """Create a league with a past season (ended yesterday)."""
    league = League(name="Awards Test League", is_open=True)
    db_session.add(league)
    await db_session.flush()

    season = Season(
        league_id=league.id,
        name="Past Season",
        start_date=date(2025, 1, 1),
        end_date=date.today() - timedelta(days=1),
    )
    db_session.add(season)
    await db_session.flush()
    return league, season


@pytest_asyncio.fixture
async def season_with_stats(db_session, users_and_players, league_and_past_season):
    """
    Create player season stats for 6 players with varying stats.

    Player rankings (by points desc):
      1. Player 1: 30 pts, 10 games, 7 wins
      2. Player 2: 25 pts, 8 games, 6 wins
      3. Player 3: 20 pts, 7 games, 5 wins
      4. Player 4: 15 pts, 12 games, 4 wins  (Ironman candidate)
      5. Player 5: 10 pts, 6 games, 5 wins   (Sharpshooter candidate - 83%)
      6. Player 6: 5 pts, 5 games, 3 wins
    """
    players, _ = users_and_players
    league, season = league_and_past_season

    stats_data = [
        # (points, games, wins, win_rate, avg_point_diff)
        (30, 10, 7, 0.7, 3.0),
        (25, 8, 6, 0.75, 2.5),
        (20, 7, 5, 0.714, 2.0),
        (15, 12, 4, 0.333, -1.0),  # Most games, low win rate
        (10, 6, 5, 0.833, 4.5),    # Best win rate (83%), best avg pt diff
        (5, 5, 3, 0.6, 1.0),       # Exactly at threshold
    ]

    for i, (points, games, wins, win_rate, avg_pt_diff) in enumerate(stats_data):
        stat = PlayerSeasonStats(
            player_id=players[i].id,
            season_id=season.id,
            points=points,
            games=games,
            wins=wins,
            win_rate=win_rate,
            avg_point_diff=avg_pt_diff,
        )
        db_session.add(stat)

    await db_session.flush()
    return league, season, players


# ---------------------------------------------------------------------------
# Tests: compute_season_awards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_compute_awards_creates_podium(db_session, season_with_stats):
    """Top 3 players should receive gold, silver, bronze placements."""
    league, season, players = season_with_stats

    awards = await compute_season_awards(db_session, season.id)

    placements = [a for a in awards if a["award_type"] == "placement"]
    assert len(placements) == 3

    gold = next(a for a in placements if a["award_key"] == "gold")
    silver = next(a for a in placements if a["award_key"] == "silver")
    bronze = next(a for a in placements if a["award_key"] == "bronze")

    assert gold["player_id"] == players[0].id
    assert gold["rank"] == 1
    assert silver["player_id"] == players[1].id
    assert silver["rank"] == 2
    assert bronze["player_id"] == players[2].id
    assert bronze["rank"] == 3


@pytest.mark.asyncio
async def test_compute_awards_stat_awards_exclude_podium(db_session, season_with_stats):
    """Stat awards should not go to top 3 players."""
    league, season, players = season_with_stats
    podium_ids = {players[0].id, players[1].id, players[2].id}

    awards = await compute_season_awards(db_session, season.id)

    stat_awards = [a for a in awards if a["award_type"] == "stat_award"]
    for award in stat_awards:
        assert award["player_id"] not in podium_ids, (
            f"Stat award {award['award_key']} went to podium player {award['player_id']}"
        )


@pytest.mark.asyncio
async def test_compute_awards_ironman(db_session, season_with_stats):
    """Ironman should go to the player with the most games (Player 4: 12 games)."""
    league, season, players = season_with_stats

    awards = await compute_season_awards(db_session, season.id)

    ironman = next((a for a in awards if a["award_key"] == "ironman"), None)
    assert ironman is not None
    assert ironman["player_id"] == players[3].id  # 12 games
    assert ironman["value"] == 12.0


@pytest.mark.asyncio
async def test_compute_awards_sharpshooter(db_session, season_with_stats):
    """Sharpshooter should go to the player with the highest win rate (Player 5: 83.3%)."""
    league, season, players = season_with_stats

    awards = await compute_season_awards(db_session, season.id)

    sharp = next((a for a in awards if a["award_key"] == "sharpshooter"), None)
    assert sharp is not None
    assert sharp["player_id"] == players[4].id  # 83.3% win rate


@pytest.mark.asyncio
async def test_compute_awards_point_machine(db_session, season_with_stats):
    """Point Machine should NOT go to Player 5 (already won sharpshooter).

    With one-stat-per-player rule, Player 5 has best win rate AND best avg pt
    diff. Sharpshooter is assigned first → Player 5 wins that. Point Machine
    then goes to the next eligible player (Player 6: +1.0 avg pt diff).
    """
    league, season, players = season_with_stats

    awards = await compute_season_awards(db_session, season.id)

    pm = next((a for a in awards if a["award_key"] == "point_machine"), None)
    # Player 5 should NOT win point_machine (already won sharpshooter)
    if pm is not None:
        assert pm["player_id"] != players[4].id, (
            "Player 5 already won sharpshooter, shouldn't also get point_machine"
        )
        # Should go to Player 6 (index 5) who has +1.0 avg pt diff
        assert pm["player_id"] == players[5].id


@pytest.mark.asyncio
async def test_compute_awards_sets_finalized_at(db_session, season_with_stats):
    """Computing awards should set awards_finalized_at on the season."""
    league, season, players = season_with_stats

    await compute_season_awards(db_session, season.id)

    # Refresh season from DB
    result = await db_session.execute(select(Season).where(Season.id == season.id))
    refreshed = result.scalar_one()
    assert refreshed.awards_finalized_at is not None


@pytest.mark.asyncio
async def test_compute_awards_sends_notifications(db_session, season_with_stats):
    """Winners with user accounts should receive SEASON_AWARD notifications."""
    league, season, players = season_with_stats

    awards = await compute_season_awards(db_session, season.id)

    # Check notifications were created
    result = await db_session.execute(
        select(Notification).where(
            Notification.type == NotificationType.SEASON_AWARD.value
        )
    )
    notifications = result.scalars().all()

    # At least the podium winners (players 1-3 have user_ids) should be notified
    assert len(notifications) >= 3


# ---------------------------------------------------------------------------
# Tests: fewer than 3 players
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_compute_awards_fewer_than_three_players(db_session):
    """With only 2 active players, should create 2 placements (gold+silver only)."""
    league = League(name="Small League", is_open=True)
    db_session.add(league)
    await db_session.flush()

    season = Season(
        league_id=league.id,
        name="Small Season",
        start_date=date(2025, 1, 1),
        end_date=date.today() - timedelta(days=1),
    )
    db_session.add(season)
    await db_session.flush()

    for i in range(2):
        p = Player(full_name=f"Small P{i+1}", gender="M", level="beginner")
        db_session.add(p)
        await db_session.flush()

        stat = PlayerSeasonStats(
            player_id=p.id,
            season_id=season.id,
            points=10 - i * 5,
            games=3,
            wins=2 - i,
            win_rate=0.66 - i * 0.3,
            avg_point_diff=2.0 - i,
        )
        db_session.add(stat)

    await db_session.flush()

    awards = await compute_season_awards(db_session, season.id)
    placements = [a for a in awards if a["award_type"] == "placement"]
    assert len(placements) == 2
    assert placements[0]["award_key"] == "gold"
    assert placements[1]["award_key"] == "silver"


# ---------------------------------------------------------------------------
# Tests: min games threshold
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stat_awards_respect_min_games(db_session):
    """Players with fewer than MIN_GAMES_STAT_AWARD games shouldn't get stat awards."""
    league = League(name="Threshold League", is_open=True)
    db_session.add(league)
    await db_session.flush()

    season = Season(
        league_id=league.id,
        name="Threshold Season",
        start_date=date(2025, 1, 1),
        end_date=date.today() - timedelta(days=1),
    )
    db_session.add(season)
    await db_session.flush()

    # 4 players: 3 for podium + 1 with too few games
    for i in range(4):
        p = Player(full_name=f"Threshold P{i+1}", gender="M", level="beginner")
        db_session.add(p)
        await db_session.flush()

        stat = PlayerSeasonStats(
            player_id=p.id,
            season_id=season.id,
            points=20 - i * 5,
            games=10 if i < 3 else MIN_GAMES_STAT_AWARD - 1,  # 4th player below threshold
            wins=7 - i,
            win_rate=0.7 - i * 0.1,
            avg_point_diff=3.0 - i,
        )
        db_session.add(stat)

    await db_session.flush()

    awards = await compute_season_awards(db_session, season.id)
    stat_awards = [a for a in awards if a["award_type"] == "stat_award"]

    # No stat awards since the only non-podium player is below threshold
    assert len(stat_awards) == 0


# ---------------------------------------------------------------------------
# Tests: clear_season_awards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_clear_season_awards(db_session, season_with_stats):
    """Clearing awards should delete all awards and reset finalized_at."""
    league, season, players = season_with_stats

    # Compute first
    await compute_season_awards(db_session, season.id)

    # Verify awards exist
    result = await db_session.execute(
        select(SeasonAward).where(SeasonAward.season_id == season.id)
    )
    assert len(result.scalars().all()) > 0

    # Clear
    await clear_season_awards(db_session, season.id)
    await db_session.commit()

    # Verify awards deleted
    result = await db_session.execute(
        select(SeasonAward).where(SeasonAward.season_id == season.id)
    )
    assert len(result.scalars().all()) == 0

    # Verify finalized_at reset
    result = await db_session.execute(select(Season).where(Season.id == season.id))
    refreshed = result.scalar_one()
    assert refreshed.awards_finalized_at is None


# ---------------------------------------------------------------------------
# Tests: lazy computation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_season_awards_lazy_computes(db_session, season_with_stats):
    """get_season_awards should compute awards on first call for a past season."""
    league, season, players = season_with_stats

    # Ensure not yet finalized
    result = await db_session.execute(select(Season).where(Season.id == season.id))
    s = result.scalar_one()
    assert s.awards_finalized_at is None

    # First call should trigger computation
    awards = await get_season_awards(db_session, season.id)
    assert len(awards) > 0

    # Season should now be finalized
    result = await db_session.execute(select(Season).where(Season.id == season.id))
    s = result.scalar_one()
    assert s.awards_finalized_at is not None


@pytest.mark.asyncio
async def test_get_season_awards_no_recompute(db_session, season_with_stats):
    """get_season_awards should not recompute if already finalized."""
    league, season, players = season_with_stats

    # Compute once
    awards1 = await get_season_awards(db_session, season.id)
    count1 = len(awards1)

    # Call again — should return same results without recomputing
    awards2 = await get_season_awards(db_session, season.id)
    assert len(awards2) == count1


# ---------------------------------------------------------------------------
# Tests: get_player_awards and get_league_awards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_player_awards(db_session, season_with_stats):
    """get_player_awards should return awards for a specific player."""
    league, season, players = season_with_stats

    await compute_season_awards(db_session, season.id)

    # Player 1 should have gold
    awards = await get_player_awards(db_session, players[0].id)
    assert len(awards) >= 1
    assert any(a["award_key"] == "gold" for a in awards)


@pytest.mark.asyncio
async def test_get_league_awards(db_session, season_with_stats):
    """get_league_awards should return all awards for a league."""
    league, season, players = season_with_stats

    await compute_season_awards(db_session, season.id)

    awards = await get_league_awards(db_session, league.id)
    assert len(awards) > 0
    assert all(a["league_id"] == league.id for a in awards)


# ---------------------------------------------------------------------------
# Tests: no rankings
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_compute_awards_empty_season(db_session):
    """Season with no stats should return empty awards."""
    league = League(name="Empty League", is_open=True)
    db_session.add(league)
    await db_session.flush()

    season = Season(
        league_id=league.id,
        name="Empty Season",
        start_date=date(2025, 1, 1),
        end_date=date.today() - timedelta(days=1),
    )
    db_session.add(season)
    await db_session.flush()

    awards = await compute_season_awards(db_session, season.id)
    assert awards == []


# ---------------------------------------------------------------------------
# Tests: one stat award per player
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_one_stat_award_per_player(db_session, season_with_stats):
    """Each non-podium player should win at most one stat award.

    Player 5 has both best win rate (sharpshooter) and best avg pt diff (point_machine),
    but should only win one of them (sharpshooter, since ironman is assigned first to
    Player 4, then sharpshooter is the next award in order).
    """
    league, season, players = season_with_stats

    awards = await compute_season_awards(db_session, season.id)

    stat_awards = [a for a in awards if a["award_type"] == "stat_award"]
    # Count awards per player — each should have at most 1
    player_award_counts = {}
    for a in stat_awards:
        player_award_counts[a["player_id"]] = player_award_counts.get(a["player_id"], 0) + 1

    for pid, count in player_award_counts.items():
        assert count == 1, f"Player {pid} has {count} stat awards, expected 1"


@pytest.mark.asyncio
async def test_point_machine_not_awarded_to_sharpshooter_winner(db_session, season_with_stats):
    """Player 5 wins sharpshooter → should NOT also win point_machine.

    Point machine should go to Player 6 (next best avg pt diff) or no one.
    """
    league, season, players = season_with_stats

    awards = await compute_season_awards(db_session, season.id)

    sharp = next((a for a in awards if a["award_key"] == "sharpshooter"), None)
    pm = next((a for a in awards if a["award_key"] == "point_machine"), None)

    assert sharp is not None
    # If point_machine exists, it should NOT be the same player as sharpshooter
    if pm is not None:
        assert pm["player_id"] != sharp["player_id"]


# ---------------------------------------------------------------------------
# Tests: Rising Star with ELO history
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rising_star_with_elo_history(db_session):
    """Rising Star should go to the player with the biggest ELO gain during the season."""
    league = League(name="Rising Star League", is_open=True)
    db_session.add(league)
    await db_session.flush()

    start = date(2025, 1, 1)
    end = date.today() - timedelta(days=1)
    season = Season(league_id=league.id, name="ELO Season", start_date=start, end_date=end)
    db_session.add(season)
    await db_session.flush()

    # 3 for podium + 4 non-podium to spread stat awards (one-per-player rule).
    # We need enough non-podium players so rising_star has a candidate that
    # hasn't already won ironman/sharpshooter/point_machine.
    players = []
    for i in range(7):
        p = Player(full_name=f"ELO P{i+1}", gender="M", level="intermediate")
        db_session.add(p)
        await db_session.flush()
        players.append(p)

    stats_data = [
        # (points, games, wins, win_rate, avg_point_diff)
        (30, 10, 7, 0.7, 3.0),    # P1: Podium 1st
        (25, 8, 6, 0.75, 2.5),    # P2: Podium 2nd
        (20, 7, 5, 0.714, 2.0),   # P3: Podium 3rd
        (15, 12, 5, 0.417, 0.5),  # P4: Ironman (12 games), also Rising Star candidate
        (10, 6, 5, 0.833, 1.5),   # P5: Sharpshooter (83.3%)
        (8, 6, 4, 0.667, 4.0),    # P6: Point Machine (+4.0)
        (5, 5, 2, 0.4, -1.0),     # P7: Rising Star (biggest ELO growth, no other award)
    ]

    for i, (points, games, wins, wr, apd) in enumerate(stats_data):
        stat = PlayerSeasonStats(
            player_id=players[i].id,
            season_id=season.id,
            points=points,
            games=games,
            wins=wins,
            win_rate=wr,
            avg_point_diff=apd,
        )
        db_session.add(stat)

    # Create sessions + matches for EloHistory FK
    sess = Session(
        date=start.isoformat(),
        name="ELO Test Session",
        status=SessionStatus.SUBMITTED,
        season_id=season.id,
    )
    db_session.add(sess)
    await db_session.flush()

    # Create minimal match rows for EloHistory references
    match_ids = []
    for i in range(4):
        m = Match(
            session_id=sess.id,
            date=(start + timedelta(days=i * 7)).isoformat(),
            team1_player1_id=players[0].id,
            team1_player2_id=players[1].id,
            team2_player1_id=players[2].id,
            team2_player2_id=players[3].id,
            team1_score=21,
            team2_score=18,
            winner=1,
        )
        db_session.add(m)
        await db_session.flush()
        match_ids.append(m.id)

    # Player 7 (index 6): ELO 1000 → 1200 (delta +200) — biggest growth
    for j, (match_id, elo) in enumerate(zip(match_ids[:3], [1000, 1100, 1200])):
        db_session.add(EloHistory(
            player_id=players[6].id,
            match_id=match_id,
            date=(start + timedelta(days=j * 7)).isoformat(),
            elo_after=elo,
            elo_change=100 if j > 0 else 0,
        ))

    # Player 4 (index 3): ELO 1000 → 1050 (delta +50) — less growth
    for j, (match_id, elo) in enumerate(zip(match_ids[:3], [1000, 1030, 1050])):
        db_session.add(EloHistory(
            player_id=players[3].id,
            match_id=match_id,
            date=(start + timedelta(days=j * 7)).isoformat(),
            elo_after=elo,
            elo_change=25 if j > 0 else 0,
        ))

    await db_session.flush()

    awards = await compute_season_awards(db_session, season.id)

    rising = next((a for a in awards if a["award_key"] == "rising_star"), None)
    assert rising is not None, "Rising Star award should be computed"
    assert rising["player_id"] == players[6].id, "Player 7 should win Rising Star (+200 ELO)"
    assert rising["value"] == 200.0


# ---------------------------------------------------------------------------
# Tests: double compute idempotency
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_double_compute_returns_same_awards(db_session, season_with_stats):
    """Calling compute_season_awards twice returns the same results (no duplicates)."""
    league, season, players = season_with_stats

    awards1 = await compute_season_awards(db_session, season.id)
    awards2 = await compute_season_awards(db_session, season.id)

    assert len(awards1) == len(awards2)
    keys1 = sorted(a["award_key"] for a in awards1)
    keys2 = sorted(a["award_key"] for a in awards2)
    assert keys1 == keys2


# ---------------------------------------------------------------------------
# Tests: update_season clears awards on re-open
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_season_clears_awards_on_reopen(db_session, season_with_stats):
    """Extending end_date to the future should clear finalized awards."""
    league, season, players = season_with_stats

    # Finalize awards
    await compute_season_awards(db_session, season.id)

    # Verify awards exist and season is finalized
    result = await db_session.execute(select(Season).where(Season.id == season.id))
    s = result.scalar_one()
    assert s.awards_finalized_at is not None

    # Re-open by setting end_date to the future
    future_date = date.today() + timedelta(days=30)
    await data_service.update_season(
        db_session, season_id=season.id, end_date=future_date.isoformat()
    )

    # Verify awards were cleared
    result = await db_session.execute(
        select(SeasonAward).where(SeasonAward.season_id == season.id)
    )
    assert len(result.scalars().all()) == 0

    # Verify finalized_at is reset
    result = await db_session.execute(select(Season).where(Season.id == season.id))
    s = result.scalar_one()
    assert s.awards_finalized_at is None
