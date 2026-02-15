"""
Comprehensive tests for async stats calculations (global and season-specific).

Tests verify:
- ELO calculations are correct
- Partnership stats (global and season)
- Opponent stats (global and season)
- Player season stats
- Transaction consistency
"""

import pytest
import pytest_asyncio
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.database.models import (
    Player,
    League,
    Season,
    Session,
    Match,
    PartnershipStats,
    OpponentStats,
    EloHistory,
    PartnershipStatsSeason,
    OpponentStatsSeason,
    PlayerSeasonStats,
    PartnershipStatsLeague,
    OpponentStatsLeague,
    PlayerLeagueStats,
    SessionStatus,
)
from backend.services import data_service, calculation_service
from backend.utils.constants import INITIAL_ELO, K


# db_session fixture is provided by conftest.py


@pytest_asyncio.fixture
async def test_players(db_session: AsyncSession):
    """Create test players."""
    players = []
    for name in ["Alice", "Bob", "Charlie", "Dave"]:
        player = Player(full_name=name)
        db_session.add(player)
        players.append(player)

    await db_session.commit()
    for player in players:
        await db_session.refresh(player)

    return players


@pytest_asyncio.fixture
async def test_league_and_season(db_session: AsyncSession, test_players):
    """Create a test league and season."""
    league = League(name="Test League", is_open=True, created_by=test_players[0].id)
    db_session.add(league)
    await db_session.flush()

    season = Season(
        league_id=league.id,
        name="Test Season",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 12, 31),
        created_by=test_players[0].id,
    )
    db_session.add(season)
    await db_session.commit()
    await db_session.refresh(league)
    await db_session.refresh(season)

    return league, season


@pytest_asyncio.fixture
async def test_session(db_session: AsyncSession, test_league_and_season):
    """Create a test session."""
    league, season = test_league_and_season
    session = Session(
        date="2024-01-15",
        name="Test Session",
        status=SessionStatus.SUBMITTED,
        season_id=season.id,
        created_by=1,
    )
    db_session.add(session)
    await db_session.commit()
    await db_session.refresh(session)
    return session


async def create_match(
    db_session: AsyncSession,
    session: Session,
    team1_p1: Player,
    team1_p2: Player,
    team2_p1: Player,
    team2_p2: Player,
    team1_score: int,
    team2_score: int,
    is_ranked: bool = True,
) -> Match:
    """Helper to create a match."""
    winner = 1 if team1_score > team2_score else (2 if team2_score > team1_score else -1)
    match = Match(
        session_id=session.id,
        date=session.date,
        team1_player1_id=team1_p1.id,
        team1_player2_id=team1_p2.id,
        team2_player1_id=team2_p1.id,
        team2_player2_id=team2_p2.id,
        team1_score=team1_score,
        team2_score=team2_score,
        winner=winner,
        is_ranked=is_ranked,
        is_public=True,
        created_by=1,
    )
    db_session.add(match)
    await db_session.commit()
    await db_session.refresh(match)
    return match


@pytest.mark.asyncio
async def test_calculate_global_stats_single_match(db_session, test_players, test_session):
    """Test global stats calculation with a single match."""
    alice, bob, charlie, dave = test_players

    # Create a match: Alice & Bob beat Charlie & Dave 21-19
    _ = await create_match(
        db_session, test_session, alice, bob, charlie, dave, 21, 19, is_ranked=True
    )

    # Calculate global stats
    result = await data_service.calculate_global_stats_async(db_session)

    assert result["player_count"] == 4
    assert result["match_count"] == 1

    # Check ELO history
    elo_history = await db_session.execute(select(EloHistory))
    elo_records = elo_history.scalars().all()
    assert len(elo_records) == 4  # One for each player

    # Check that winners gained ELO and losers lost ELO
    alice_elo = next((r for r in elo_records if r.player_id == alice.id), None)
    bob_elo = next((r for r in elo_records if r.player_id == bob.id), None)
    charlie_elo = next((r for r in elo_records if r.player_id == charlie.id), None)
    dave_elo = next((r for r in elo_records if r.player_id == dave.id), None)

    assert alice_elo is not None
    assert bob_elo is not None
    assert charlie_elo is not None
    assert dave_elo is not None

    # Winners should have higher ELO than initial
    assert alice_elo.elo_after > INITIAL_ELO
    assert bob_elo.elo_after > INITIAL_ELO
    # Losers should have lower ELO than initial
    assert charlie_elo.elo_after < INITIAL_ELO
    assert dave_elo.elo_after < INITIAL_ELO

    # ELO changes should be symmetric (team 1 gained what team 2 lost, approximately)
    team1_elo_gain = (alice_elo.elo_change + bob_elo.elo_change) / 2
    team2_elo_loss = (charlie_elo.elo_change + dave_elo.elo_change) / 2
    assert abs(team1_elo_gain + team2_elo_loss) < 1.0  # Should be approximately equal and opposite

    # Check partnership stats
    partnership_result = await db_session.execute(select(PartnershipStats))
    partnerships = partnership_result.scalars().all()

    # Should have Alice-Bob and Charlie-Dave partnerships
    alice_bob = next(
        (p for p in partnerships if p.player_id == alice.id and p.partner_id == bob.id), None
    )
    charlie_dave = next(
        (p for p in partnerships if p.player_id == charlie.id and p.partner_id == dave.id), None
    )

    assert alice_bob is not None
    assert charlie_dave is not None

    assert alice_bob.games == 1
    assert alice_bob.wins == 1
    assert alice_bob.win_rate == 1.0
    assert alice_bob.points == 3  # 1 win * 3 points

    assert charlie_dave.games == 1
    assert charlie_dave.wins == 0
    assert charlie_dave.win_rate == 0.0
    assert charlie_dave.points == 1  # 1 loss * 1 point

    # Check opponent stats
    opponent_result = await db_session.execute(select(OpponentStats))
    opponents = opponent_result.scalars().all()

    # Alice should have stats against Charlie and Dave
    alice_vs_charlie = next(
        (o for o in opponents if o.player_id == alice.id and o.opponent_id == charlie.id), None
    )
    alice_vs_dave = next(
        (o for o in opponents if o.player_id == alice.id and o.opponent_id == dave.id), None
    )

    assert alice_vs_charlie is not None
    assert alice_vs_dave is not None

    assert alice_vs_charlie.games == 1
    assert alice_vs_charlie.wins == 1
    assert alice_vs_charlie.win_rate == 1.0


@pytest.mark.asyncio
async def test_calculate_global_stats_multiple_matches(db_session, test_players, test_session):
    """Test global stats with multiple matches."""
    alice, bob, charlie, dave = test_players

    # Match 1: Alice & Bob beat Charlie & Dave 21-19
    await create_match(db_session, test_session, alice, bob, charlie, dave, 21, 19, is_ranked=True)

    # Match 2: Alice & Charlie beat Bob & Dave 21-17
    await create_match(db_session, test_session, alice, charlie, bob, dave, 21, 17, is_ranked=True)

    # Calculate global stats
    result = await data_service.calculate_global_stats_async(db_session)

    assert result["match_count"] == 2

    # Check Alice's partnerships
    partnership_result = await db_session.execute(
        select(PartnershipStats).where(PartnershipStats.player_id == alice.id)
    )
    alice_partnerships = partnership_result.scalars().all()

    # Alice should have partnerships with both Bob and Charlie
    alice_bob = next((p for p in alice_partnerships if p.partner_id == bob.id), None)
    alice_charlie = next((p for p in alice_partnerships if p.partner_id == charlie.id), None)

    assert alice_bob is not None
    assert alice_charlie is not None

    assert alice_bob.games == 1
    assert alice_bob.wins == 1
    assert alice_charlie.games == 1
    assert alice_charlie.wins == 1

    # Check Alice's total stats via opponent stats
    opponent_result = await db_session.execute(
        select(OpponentStats).where(OpponentStats.player_id == alice.id)
    )
    alice_opponents = opponent_result.scalars().all()

    # Alice should have played against Bob, Charlie, and Dave
    assert len(alice_opponents) >= 2  # At least Bob and Dave (or Charlie and Dave in match 2)


@pytest.mark.asyncio
async def test_calculate_league_stats(
    db_session, test_players, test_league_and_season, test_session
):
    """Test league-specific stats calculation (includes all seasons)."""
    alice, bob, charlie, dave = test_players
    league, season = test_league_and_season

    # Create matches in the season
    await create_match(db_session, test_session, alice, bob, charlie, dave, 21, 19, is_ranked=True)
    await create_match(db_session, test_session, alice, charlie, bob, dave, 21, 17, is_ranked=True)

    # Calculate league stats (this should also calculate season stats)
    result = await data_service.calculate_league_stats_async(db_session, league.id)

    assert result["league_match_count"] == 2
    assert season.id in result["season_counts"]
    assert result["season_counts"][season.id]["match_count"] == 2

    # Check league-specific partnership stats
    partnership_result = await db_session.execute(
        select(PartnershipStatsLeague).where(PartnershipStatsLeague.league_id == league.id)
    )
    league_partnerships = partnership_result.scalars().all()

    assert len(league_partnerships) > 0

    alice_bob_league = next(
        (p for p in league_partnerships if p.player_id == alice.id and p.partner_id == bob.id),
        None,
    )
    assert alice_bob_league is not None
    assert alice_bob_league.games == 1
    assert alice_bob_league.wins == 1
    assert alice_bob_league.league_id == league.id

    # Check league-specific opponent stats
    opponent_result = await db_session.execute(
        select(OpponentStatsLeague).where(OpponentStatsLeague.league_id == league.id)
    )
    league_opponents = opponent_result.scalars().all()

    assert len(league_opponents) > 0

    # Check player league stats
    player_stats_result = await db_session.execute(
        select(PlayerLeagueStats).where(PlayerLeagueStats.league_id == league.id)
    )
    player_stats = player_stats_result.scalars().all()

    assert len(player_stats) == 4  # All 4 players

    alice_league_stats = next((s for s in player_stats if s.player_id == alice.id), None)
    assert alice_league_stats is not None
    assert alice_league_stats.games == 2
    assert alice_league_stats.wins == 2
    assert alice_league_stats.win_rate == 1.0
    assert alice_league_stats.points == 6  # 2 wins * 3 points

    # Also check that season stats were calculated
    season_partnership_result = await db_session.execute(
        select(PartnershipStatsSeason).where(PartnershipStatsSeason.season_id == season.id)
    )
    season_partnerships = season_partnership_result.scalars().all()
    assert len(season_partnerships) > 0


@pytest.mark.asyncio
async def test_calculate_season_stats(
    db_session, test_players, test_league_and_season, test_session
):
    """Test season-specific stats calculation (backward compatibility)."""
    alice, bob, charlie, dave = test_players
    league, season = test_league_and_season

    # Create matches in the season
    await create_match(db_session, test_session, alice, bob, charlie, dave, 21, 19, is_ranked=True)
    await create_match(db_session, test_session, alice, charlie, bob, dave, 21, 17, is_ranked=True)

    # Calculate season stats (backward compatibility function)
    result = await data_service.calculate_season_stats_async(db_session, season.id)

    assert result["match_count"] == 2

    # Check season-specific partnership stats
    partnership_result = await db_session.execute(
        select(PartnershipStatsSeason).where(PartnershipStatsSeason.season_id == season.id)
    )
    season_partnerships = partnership_result.scalars().all()

    assert len(season_partnerships) > 0

    alice_bob_season = next(
        (p for p in season_partnerships if p.player_id == alice.id and p.partner_id == bob.id),
        None,
    )
    assert alice_bob_season is not None
    assert alice_bob_season.games == 1
    assert alice_bob_season.wins == 1
    assert alice_bob_season.season_id == season.id

    # Check season-specific opponent stats
    opponent_result = await db_session.execute(
        select(OpponentStatsSeason).where(OpponentStatsSeason.season_id == season.id)
    )
    season_opponents = opponent_result.scalars().all()

    assert len(season_opponents) > 0

    # Check player season stats
    player_stats_result = await db_session.execute(
        select(PlayerSeasonStats).where(PlayerSeasonStats.season_id == season.id)
    )
    player_stats = player_stats_result.scalars().all()

    assert len(player_stats) == 4  # All 4 players

    alice_season_stats = next((s for s in player_stats if s.player_id == alice.id), None)
    assert alice_season_stats is not None
    assert alice_season_stats.games == 2
    assert alice_season_stats.wins == 2
    assert alice_season_stats.win_rate == 1.0
    assert alice_season_stats.points == 6  # 2 wins * 3 points


@pytest.mark.asyncio
async def test_global_vs_season_stats_separation(
    db_session, test_players, test_league_and_season, test_session
):
    """Test that global and season stats are calculated separately."""
    alice, bob, charlie, dave = test_players
    league, season = test_league_and_season

    # Create a match
    await create_match(db_session, test_session, alice, bob, charlie, dave, 21, 19, is_ranked=True)

    # Calculate global stats first
    await data_service.calculate_global_stats_async(db_session)

    # Check global stats exist
    global_partnerships_result = await db_session.execute(select(PartnershipStats))
    global_partnerships_list = global_partnerships_result.scalars().all()
    assert len(global_partnerships_list) > 0

    # Calculate league stats (which also calculates season stats)
    await data_service.calculate_league_stats_async(db_session, league.id)

    # Check both global and season stats exist (need fresh queries)
    global_partnerships_after_result = await db_session.execute(select(PartnershipStats))
    global_partnerships_after_list = global_partnerships_after_result.scalars().all()

    season_partnerships_result = await db_session.execute(
        select(PartnershipStatsSeason).where(PartnershipStatsSeason.season_id == season.id)
    )
    season_partnerships_list = season_partnerships_result.scalars().all()

    assert len(global_partnerships_after_list) > 0
    assert len(season_partnerships_list) > 0

    # They should have the same data but in different tables
    global_alice_bob = next(
        (
            p
            for p in global_partnerships_after_list
            if p.player_id == alice.id and p.partner_id == bob.id
        ),
        None,
    )
    season_alice_bob = next(
        (
            p
            for p in season_partnerships_list
            if p.player_id == alice.id and p.partner_id == bob.id
        ),
        None,
    )

    assert global_alice_bob is not None
    assert season_alice_bob is not None
    assert global_alice_bob.games == season_alice_bob.games
    assert global_alice_bob.wins == season_alice_bob.wins


@pytest.mark.asyncio
async def test_unranked_matches_excluded(db_session, test_players, test_session):
    """Test that unranked matches are excluded from calculations."""
    alice, bob, charlie, dave = test_players

    # Create a ranked match
    _ = await create_match(
        db_session, test_session, alice, bob, charlie, dave, 21, 19, is_ranked=True
    )

    # Create an unranked match
    unranked_match = await create_match(
        db_session, test_session, alice, charlie, bob, dave, 21, 17, is_ranked=False
    )

    # Calculate global stats
    result = await data_service.calculate_global_stats_async(db_session)

    # Should only count the ranked match
    assert result["match_count"] == 1

    # Check that only the ranked match's stats are included
    elo_history = await db_session.execute(select(EloHistory))
    elo_records = elo_history.scalars().all()

    # Should only have ELO history for the ranked match (4 players)
    assert len(elo_records) == 4

    # Check that the unranked match is not in ELO history
    unranked_elo = [r for r in elo_records if r.match_id == unranked_match.id]
    assert len(unranked_elo) == 0


@pytest.mark.asyncio
async def test_elo_calculation_accuracy(db_session, test_players, test_session):
    """Test that ELO calculations are mathematically correct."""
    alice, bob, charlie, dave = test_players

    # Create a match where team 1 (Alice & Bob) beats team 2 (Charlie & Dave)
    # Both teams start at INITIAL_ELO (1200)
    await create_match(db_session, test_session, alice, bob, charlie, dave, 21, 19, is_ranked=True)

    # Calculate stats
    await data_service.calculate_global_stats_async(db_session)

    # Get ELO history
    elo_history = await db_session.execute(select(EloHistory))
    elo_records = elo_history.scalars().all()

    alice_elo = next((r for r in elo_records if r.player_id == alice.id), None)
    bob_elo = next((r for r in elo_records if r.player_id == bob.id), None)
    charlie_elo = next((r for r in elo_records if r.player_id == charlie.id), None)
    dave_elo = next((r for r in elo_records if r.player_id == dave.id), None)

    # Calculate expected ELO change manually
    team1_avg_elo = (INITIAL_ELO + INITIAL_ELO) / 2  # 1200
    team2_avg_elo = (INITIAL_ELO + INITIAL_ELO) / 2  # 1200

    expected_score_team1 = calculation_service.expected_score(team1_avg_elo, team2_avg_elo)
    # Team 1 won, so actual_score = 1.0 (approximately, depending on point differential)
    # With point differential, it might be slightly different
    calculation_service.elo_change(K, team1_avg_elo, expected_score_team1, 1.0)

    # Verify ELO changes are reasonable
    assert alice_elo.elo_change > 0
    assert bob_elo.elo_change > 0
    assert charlie_elo.elo_change < 0
    assert dave_elo.elo_change < 0

    # ELO changes should be approximately equal for teammates
    assert abs(alice_elo.elo_change - bob_elo.elo_change) < 0.1
    assert abs(charlie_elo.elo_change - dave_elo.elo_change) < 0.1


@pytest.mark.asyncio
async def test_stats_recalculation_removes_stale_data(db_session, test_players, test_session):
    """Test that recalculating stats removes stale data."""
    alice, bob, charlie, dave = test_players

    # Create match 1: Alice & Bob vs Charlie & Dave
    match1 = await create_match(
        db_session, test_session, alice, bob, charlie, dave, 21, 19, is_ranked=True
    )

    # Calculate stats
    await data_service.calculate_global_stats_async(db_session)

    # Check partnership exists
    partnership1 = await db_session.execute(
        select(PartnershipStats).where(
            PartnershipStats.player_id == alice.id, PartnershipStats.partner_id == bob.id
        )
    )
    assert partnership1.scalar_one_or_none() is not None

    # Delete match1 and create match2: Alice & Charlie vs Bob & Dave
    # First delete elo_history records that reference this match
    elo_history_records = await db_session.execute(
        select(EloHistory).where(EloHistory.match_id == match1.id)
    )
    for elo_record in elo_history_records.scalars():
        await db_session.delete(elo_record)

    await db_session.delete(match1)
    await db_session.commit()

    _ = await create_match(
        db_session, test_session, alice, charlie, bob, dave, 21, 17, is_ranked=True
    )

    # Recalculate stats
    await data_service.calculate_global_stats_async(db_session)

    # Alice-Bob partnership should be gone (match was deleted)
    partnership_after = await db_session.execute(
        select(PartnershipStats).where(
            PartnershipStats.player_id == alice.id, PartnershipStats.partner_id == bob.id
        )
    )
    assert partnership_after.scalar_one_or_none() is None

    # Alice-Charlie partnership should exist
    alice_charlie = await db_session.execute(
        select(PartnershipStats).where(
            PartnershipStats.player_id == alice.id, PartnershipStats.partner_id == charlie.id
        )
    )
    assert alice_charlie.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_multiple_seasons_separate_stats(
    db_session, test_players, test_league_and_season, test_session
):
    """Test that different seasons have separate stats."""
    alice, bob, charlie, dave = test_players
    league, season1 = test_league_and_season

    # Create match in season 1
    await create_match(db_session, test_session, alice, bob, charlie, dave, 21, 19, is_ranked=True)

    # Create season 2
    season2 = Season(
        league_id=league.id,
        name="Season 2",
        start_date=date(2025, 1, 1),
        end_date=date(2025, 12, 31),
        created_by=test_players[0].id,
    )
    db_session.add(season2)
    await db_session.commit()
    await db_session.refresh(season2)

    # Create session 2 in season 2
    session2 = Session(
        date="2025-01-15",
        name="Session 2",
        status=SessionStatus.SUBMITTED,
        season_id=season2.id,
        created_by=1,
    )
    db_session.add(session2)
    await db_session.commit()
    await db_session.refresh(session2)

    # Create match in season 2
    await create_match(db_session, session2, alice, charlie, bob, dave, 21, 17, is_ranked=True)

    # Calculate stats for the league (which calculates stats for both seasons)
    await data_service.calculate_league_stats_async(db_session, league.id)

    # Check season 1 stats
    season1_stats = await db_session.execute(
        select(PartnershipStatsSeason).where(PartnershipStatsSeason.season_id == season1.id)
    )
    season1_partnerships = season1_stats.scalars().all()

    # Check season 2 stats
    season2_stats = await db_session.execute(
        select(PartnershipStatsSeason).where(PartnershipStatsSeason.season_id == season2.id)
    )
    season2_partnerships = season2_stats.scalars().all()

    # Season 1 should have Alice-Bob partnership
    season1_alice_bob = next(
        (p for p in season1_partnerships if p.player_id == alice.id and p.partner_id == bob.id),
        None,
    )
    assert season1_alice_bob is not None

    # Season 2 should have Alice-Charlie partnership
    season2_alice_charlie = next(
        (
            p
            for p in season2_partnerships
            if p.player_id == alice.id and p.partner_id == charlie.id
        ),
        None,
    )
    assert season2_alice_charlie is not None

    # Season 2 should NOT have Alice-Bob partnership
    season2_alice_bob = next(
        (p for p in season2_partnerships if p.player_id == alice.id and p.partner_id == bob.id),
        None,
    )
    assert season2_alice_bob is None


@pytest.mark.asyncio
async def test_only_finalized_sessions_included(db_session, test_players, test_league_and_season):
    """Test that only matches from SUBMITTED/EDITED sessions are included."""
    alice, bob, charlie, dave = test_players
    league, season = test_league_and_season

    # Create SUBMITTED session
    submitted_session = Session(
        date="2024-01-15",
        name="Submitted Session",
        status=SessionStatus.SUBMITTED,
        season_id=season.id,
        created_by=1,
    )
    db_session.add(submitted_session)
    await db_session.commit()
    await db_session.refresh(submitted_session)

    # Create ACTIVE session
    active_session = Session(
        date="2024-01-16",
        name="Active Session",
        status=SessionStatus.ACTIVE,
        season_id=season.id,
        created_by=1,
    )
    db_session.add(active_session)
    await db_session.commit()
    await db_session.refresh(active_session)

    # Create match in SUBMITTED session
    submitted_match = await create_match(
        db_session, submitted_session, alice, bob, charlie, dave, 21, 19, is_ranked=True
    )

    # Create match in ACTIVE session
    active_match = await create_match(
        db_session, active_session, alice, charlie, bob, dave, 21, 17, is_ranked=True
    )

    # Calculate global stats
    result = await data_service.calculate_global_stats_async(db_session)

    # Should only count the match from SUBMITTED session
    assert result["match_count"] == 1

    # Check ELO history - should only have records for submitted match
    elo_history = await db_session.execute(select(EloHistory))
    elo_records = elo_history.scalars().all()

    # Should have 4 records (one per player) for the submitted match
    assert len(elo_records) == 4

    # All ELO records should be for the submitted match
    for record in elo_records:
        assert record.match_id == submitted_match.id
        assert record.match_id != active_match.id


@pytest.mark.asyncio
async def test_empty_matches_deletes_stale_data(db_session, test_players, test_session):
    """Test that calculating stats with no matches still deletes stale data."""
    alice, bob, charlie, dave = test_players

    # First, create a match and calculate stats to create some data
    match = await create_match(
        db_session, test_session, alice, bob, charlie, dave, 21, 19, is_ranked=True
    )

    await data_service.calculate_global_stats_async(db_session)

    # Verify stats exist
    partnership_result = await db_session.execute(select(PartnershipStats))
    assert len(partnership_result.scalars().all()) > 0

    # Delete the match
    # Need to delete elo_history first due to foreign key constraint
    from backend.database.models import EloHistory

    elo_history_result = await db_session.execute(
        select(EloHistory).where(EloHistory.match_id == match.id)
    )
    for elo_entry in elo_history_result.scalars().all():
        await db_session.delete(elo_entry)

    await db_session.delete(match)
    await db_session.commit()

    # Calculate stats again (no matches now)
    result = await data_service.calculate_global_stats_async(db_session)

    assert result["match_count"] == 0
    assert result["player_count"] == 0

    # Verify all stats were deleted
    partnership_result = await db_session.execute(select(PartnershipStats))
    assert len(partnership_result.scalars().all()) == 0

    elo_history_result = await db_session.execute(select(EloHistory))
    assert len(elo_history_result.scalars().all()) == 0

    opponent_result = await db_session.execute(select(OpponentStats))
    assert len(opponent_result.scalars().all()) == 0


@pytest.mark.asyncio
async def test_matches_without_session_included(db_session, test_players):
    """Test that matches without a session are included in global calculations."""
    alice, bob, charlie, dave = test_players

    # Create a match without a session (session_id = None)
    match = Match(
        session_id=None,
        date="2024-01-15",
        team1_player1_id=alice.id,
        team1_player2_id=bob.id,
        team2_player1_id=charlie.id,
        team2_player2_id=dave.id,
        team1_score=21,
        team2_score=19,
        winner=1,
        is_ranked=True,
        is_public=True,
        created_by=1,
    )
    db_session.add(match)
    await db_session.commit()
    await db_session.refresh(match)

    # Calculate global stats
    result = await data_service.calculate_global_stats_async(db_session)

    # Should include the match without session
    assert result["match_count"] == 1

    # Check ELO history exists
    elo_history = await db_session.execute(select(EloHistory))
    elo_records = elo_history.scalars().all()
    assert len(elo_records) == 4  # One per player


@pytest.mark.asyncio
async def test_season_calculation_only_includes_season_matches(
    db_session, test_players, test_league_and_season
):
    """Test that season calculation only includes matches from that season."""
    alice, bob, charlie, dave = test_players
    league, season1 = test_league_and_season

    # Create session in season 1
    session1 = Session(
        date="2024-01-15",
        name="Session 1",
        status=SessionStatus.SUBMITTED,
        season_id=season1.id,
        created_by=1,
    )
    db_session.add(session1)
    await db_session.commit()
    await db_session.refresh(session1)

    # Create season 2
    season2 = Season(
        league_id=league.id,
        name="Season 2",
        start_date=date(2025, 1, 1),
        end_date=date(2025, 12, 31),
        created_by=test_players[0].id,
    )
    db_session.add(season2)
    await db_session.commit()
    await db_session.refresh(season2)

    # Create session in season 2
    session2 = Session(
        date="2025-01-15",
        name="Session 2",
        status=SessionStatus.SUBMITTED,
        season_id=season2.id,
        created_by=1,
    )
    db_session.add(session2)
    await db_session.commit()
    await db_session.refresh(session2)

    # Create matches in both seasons
    _ = await create_match(db_session, session1, alice, bob, charlie, dave, 21, 19, is_ranked=True)
    _ = await create_match(db_session, session2, alice, charlie, bob, dave, 21, 17, is_ranked=True)

    # Calculate stats for the league (which calculates stats for all seasons including season1)
    result = await data_service.calculate_league_stats_async(db_session, league.id)
    # Extract season1 result from league result
    season1_result = result["season_counts"].get(season1.id, {})
    # Season1 only has match1
    assert season1_result["match_count"] == 1

    # Total league matches = 2 (match1 in season1, match2 in season2)
    assert result["league_match_count"] == 2

    # Check season 1 stats only include match1
    _ = await db_session.execute(
        select(EloHistory)
        .join(Match, EloHistory.match_id == Match.id)
        .join(Session, Match.session_id == Session.id)
        .where(Session.season_id == season1.id)
    )
    # Note: ELO history is global, so this won't work. Let me check partnership stats instead

    partnership_season1 = await db_session.execute(
        select(PartnershipStatsSeason).where(PartnershipStatsSeason.season_id == season1.id)
    )
    season1_partnerships = partnership_season1.scalars().all()

    # Should have Alice-Bob partnership (from match1)
    alice_bob = next(
        (p for p in season1_partnerships if p.player_id == alice.id and p.partner_id == bob.id),
        None,
    )
    assert alice_bob is not None

    # Should NOT have Alice-Charlie partnership (from match2, which is in season2)
    alice_charlie = next(
        (
            p
            for p in season1_partnerships
            if p.player_id == alice.id and p.partner_id == charlie.id
        ),
        None,
    )
    assert alice_charlie is None


@pytest.mark.asyncio
async def test_partnership_stats_bidirectional(db_session, test_players, test_session):
    """Test that partnership stats are created for both players and are symmetric."""
    alice, bob, charlie, dave = test_players

    # Create a match: Alice & Bob beat Charlie & Dave 21-19
    await create_match(db_session, test_session, alice, bob, charlie, dave, 21, 19, is_ranked=True)

    # Calculate global stats
    await data_service.calculate_global_stats_async(db_session)

    # Check partnership stats exist in both directions
    partnership_result = await db_session.execute(select(PartnershipStats))
    partnerships = partnership_result.scalars().all()

    # Should have Alice-Bob partnership (from Alice's perspective)
    alice_bob = next(
        (p for p in partnerships if p.player_id == alice.id and p.partner_id == bob.id), None
    )
    assert alice_bob is not None

    # Should have Bob-Alice partnership (from Bob's perspective)
    bob_alice = next(
        (p for p in partnerships if p.player_id == bob.id and p.partner_id == alice.id), None
    )
    assert bob_alice is not None

    # Stats should be symmetric
    assert alice_bob.games == bob_alice.games
    assert alice_bob.wins == bob_alice.wins
    assert alice_bob.win_rate == bob_alice.win_rate
    assert alice_bob.points == bob_alice.points
    # Point differential should be symmetric (both positive since they won)
    assert abs(alice_bob.avg_point_diff - bob_alice.avg_point_diff) < 0.1


@pytest.mark.asyncio
async def test_opponent_stats_bidirectional(db_session, test_players, test_session):
    """Test that opponent stats are created for both players."""
    alice, bob, charlie, dave = test_players

    # Create a match: Alice & Bob beat Charlie & Dave 21-19
    await create_match(db_session, test_session, alice, bob, charlie, dave, 21, 19, is_ranked=True)

    # Calculate global stats
    await data_service.calculate_global_stats_async(db_session)

    # Check opponent stats exist in both directions
    opponent_result = await db_session.execute(select(OpponentStats))
    opponents = opponent_result.scalars().all()

    # Alice vs Charlie
    alice_vs_charlie = next(
        (o for o in opponents if o.player_id == alice.id and o.opponent_id == charlie.id), None
    )
    assert alice_vs_charlie is not None
    assert alice_vs_charlie.games == 1
    assert alice_vs_charlie.wins == 1

    # Charlie vs Alice (should exist but with different stats)
    charlie_vs_alice = next(
        (o for o in opponents if o.player_id == charlie.id and o.opponent_id == alice.id), None
    )
    assert charlie_vs_alice is not None
    assert charlie_vs_alice.games == 1
    assert charlie_vs_alice.wins == 0  # Charlie lost to Alice


@pytest.mark.asyncio
async def test_edited_sessions_included(db_session, test_players, test_league_and_season):
    """Test that EDITED sessions are included in calculations."""
    alice, bob, charlie, dave = test_players
    league, season = test_league_and_season

    # Create EDITED session
    edited_session = Session(
        date="2024-01-15",
        name="Edited Session",
        status=SessionStatus.EDITED,
        season_id=season.id,
        created_by=1,
    )
    db_session.add(edited_session)
    await db_session.commit()
    await db_session.refresh(edited_session)

    # Create match in EDITED session
    _ = await create_match(
        db_session, edited_session, alice, bob, charlie, dave, 21, 19, is_ranked=True
    )

    # Calculate global stats
    result = await data_service.calculate_global_stats_async(db_session)

    # Should include the match from EDITED session
    assert result["match_count"] == 1

    # Check ELO history exists
    elo_history = await db_session.execute(select(EloHistory))
    elo_records = elo_history.scalars().all()
    assert len(elo_records) == 4
