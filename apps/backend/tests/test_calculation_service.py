"""
Tests for the calculation service - ELO calculations and statistics.
"""
import pytest
from backend.services import calculation_service
from backend.utils.constants import INITIAL_ELO, K, USE_POINT_DIFFERENTIAL
from backend.database.models import Match, Player, Session as MatchSession


# Test helper functions
def test_expected_score():
    """Test expected_score calculation."""
    # Equal ELOs should give 0.5 expected score
    assert calculation_service.expected_score(1200, 1200) == 0.5
    
    # expected_score(elo_a, elo_b) = expected score for A against B
    # If A has higher ELO than B, A should have > 0.5 expected score
    # Formula: P(A beats B) = 1 / (1 + 10^((elo_b - elo_a) / 400))
    # If elo_a = 1400, elo_b = 1200: (1200-1400)/400 = -0.5, 10^-0.5 ≈ 0.316
    # P(A beats B) = 1 / (1 + 0.316) = 1/1.316 ≈ 0.76 (A is favored)
    result1 = calculation_service.expected_score(1400, 1200)
    result2 = calculation_service.expected_score(1200, 1400)
    
    # They should be complementary (sum to 1)
    assert abs((result1 + result2) - 1.0) < 0.01
    
    # Higher ELO player should have > 0.5 expected score
    assert result1 > 0.5  # 1400 vs 1200, higher ELO wins
    assert result2 < 0.5  # 1200 vs 1400, lower ELO loses
    
    # Very large difference
    high_result = calculation_service.expected_score(2000, 1200)
    low_result = calculation_service.expected_score(1200, 2000)
    assert abs((high_result + low_result) - 1.0) < 0.01
    assert high_result > 0.9  # Very high ELO should have very high win probability
    assert low_result < 0.1   # Very low ELO should have very low win probability


def test_elo_change():
    """Test ELO change calculation."""
    k = K
    old_elo = 1200
    expected = 0.5
    
    # Win (actual_score = 1.0)
    change_win = calculation_service.elo_change(k, old_elo, expected, 1.0)
    assert change_win > 0
    assert change_win == k * (1.0 - expected)  # Should be k * 0.5 = 20
    
    # Loss (actual_score = 0.0)
    change_loss = calculation_service.elo_change(k, old_elo, expected, 0.0)
    assert change_loss < 0
    assert change_loss == k * (0.0 - expected)  # Should be k * -0.5 = -20
    
    # Tie (actual_score = 0.5)
    change_tie = calculation_service.elo_change(k, old_elo, expected, 0.5)
    assert abs(change_tie) < 0.01  # Should be very close to 0


def test_k_factor():
    """Test K-factor calculation."""
    # Currently returns constant
    assert calculation_service.k_factor(0, K) == K
    assert calculation_service.k_factor(100, K) == K


def test_calculate_winner():
    """Test winner calculation."""
    assert calculation_service.calculate_winner(21, 19) == 1  # Team 1 wins
    assert calculation_service.calculate_winner(19, 21) == 2  # Team 2 wins
    assert calculation_service.calculate_winner(21, 21) == -1  # Tie
    assert calculation_service.calculate_winner(0, 0) == -1  # Tie


def test_normalize_score():
    """Test score normalization."""
    # Team 1 wins
    norm = calculation_service.normalize_score(21, 19, 1)
    if USE_POINT_DIFFERENTIAL:
        assert 0.5 < norm <= 1.0
    else:
        assert norm == 1.0
    
    # Team 2 wins
    norm = calculation_service.normalize_score(19, 21, 2)
    if USE_POINT_DIFFERENTIAL:
        assert 0.0 <= norm < 0.5
    else:
        assert norm == 0.0
    
    # Tie
    norm = calculation_service.normalize_score(21, 21, -1)
    assert norm == 0.5


# Test PlayerStats class
def test_player_stats_init():
    """Test PlayerStats initialization."""
    stats = calculation_service.PlayerStats(player_id=1)
    assert stats.player_id == 1
    assert stats.elo == INITIAL_ELO
    assert stats.game_count == 0
    assert stats.win_count == 0
    assert stats.win_rate == 0.0
    assert stats.avg_point_diff == 0.0
    assert stats.points == 0


def test_player_stats_win_rate():
    """Test win rate calculation."""
    stats = calculation_service.PlayerStats(player_id=1)
    
    # No games
    assert stats.win_rate == 0.0
    
    # 50% win rate
    stats.game_count = 10
    stats.win_count = 5
    assert stats.win_rate == 0.5
    
    # 100% win rate
    stats.win_count = 10
    assert stats.win_rate == 1.0
    
    # 0% win rate
    stats.win_count = 0
    assert stats.win_rate == 0.0


def test_player_stats_avg_point_diff():
    """Test average point differential calculation."""
    stats = calculation_service.PlayerStats(player_id=1)
    
    # No games
    assert stats.avg_point_diff == 0.0
    
    # Average point diff
    stats.game_count = 4
    stats.total_point_diff = 20
    assert stats.avg_point_diff == 5.0


def test_player_stats_points():
    """Test points calculation (3 for win, 1 for loss)."""
    stats = calculation_service.PlayerStats(player_id=1)
    
    # No games
    assert stats.points == 0
    
    # 5 wins, 3 losses
    stats.game_count = 8
    stats.win_count = 5
    assert stats.points == (5 * 3) + (3 * 1)  # 15 + 3 = 18


def test_player_stats_record_methods():
    """Test recording methods."""
    stats = calculation_service.PlayerStats(player_id=1)
    
    # Record partnerships (now uses player IDs)
    stats.record_game_with(2)  # Bob's ID
    stats.record_win_with(2)
    assert stats.games_with[2] == 1
    assert stats.wins_with[2] == 1
    
    # Record opponents
    stats.record_game_against(3)  # Charlie's ID
    stats.record_win_against(3)
    assert stats.games_against[3] == 1
    assert stats.wins_against[3] == 1
    
    # Record point differentials
    stats.record_point_diff_with(2, 5)
    stats.record_point_diff_against(3, -3)
    assert stats.point_diff_with[2] == 5
    assert stats.point_diff_against[3] == -3


def test_player_stats_update_elo():
    """Test ELO update."""
    stats = calculation_service.PlayerStats(player_id=1)
    initial_elo = stats.elo
    
    # Update ELO
    stats.update_elo(20.5, date="2024-01-01", match_id=1)
    assert stats.elo == initial_elo + 20.5
    assert len(stats.elo_history) == 1
    assert stats.elo_history[0] == initial_elo + 20.5
    assert len(stats.match_elo_history) == 1
    assert stats.match_elo_history[0] == (1, initial_elo + 20.5, 20.5, "2024-01-01")


# Test StatsTracker class
def test_stats_tracker_init():
    """Test StatsTracker initialization."""
    tracker = calculation_service.StatsTracker()
    assert tracker.players == {}


def test_stats_tracker_get_player():
    """Test getting/creating players."""
    tracker = calculation_service.StatsTracker()
    
    # Get new player (now uses player_id)
    player = tracker.get_player(1)
    assert player.player_id == 1
    assert 1 in tracker.players
    
    # Get existing player
    player2 = tracker.get_player(1)
    assert player is player2  # Same instance


def create_mock_match(team1_players, team2_players, team1_score, team2_score, match_id=1, date=None):
    """Helper to create a mock Match object."""
    # Create a simple mock object that matches the Match model interface
    class MockMatch:
        def __init__(self, player_ids, team1_score, team2_score, match_id, date):
            self.player_ids = player_ids  # List of [team1_ids, team2_ids]
            self.team1_score = team1_score
            self.team2_score = team2_score
            self.id = match_id
            self.date = date or "2024-01-01"
    
    return MockMatch(
        [team1_players, team2_players],  # Now expects lists of player IDs
        team1_score,
        team2_score,
        match_id,
        date
    )


def test_stats_tracker_process_match_win():
    """Test processing a match where team 1 wins."""
    tracker = calculation_service.StatsTracker()
    
    # Use player IDs instead of names
    match = create_mock_match(
        [1, 2],  # Team 1: Alice (1) and Bob (2)
        [3, 4],  # Team 2: Charlie (3) and Dave (4)
        21,
        19,
        match_id=1
    )
    
    elo_deltas = tracker.process_match(match)
    
    # Check all players were created (by ID)
    assert 1 in tracker.players
    assert 2 in tracker.players
    assert 3 in tracker.players
    assert 4 in tracker.players
    
    # Check game counts
    for player_id in [1, 2, 3, 4]:
        assert tracker.players[player_id].game_count == 1
    
    # Check win counts (team 1 won)
    assert tracker.players[1].win_count == 1
    assert tracker.players[2].win_count == 1
    assert tracker.players[3].win_count == 0
    assert tracker.players[4].win_count == 0
    
    # Check partnerships (now using player IDs)
    assert tracker.players[1].games_with[2] == 1
    assert tracker.players[2].games_with[1] == 1
    assert tracker.players[3].games_with[4] == 1
    assert tracker.players[4].games_with[3] == 1
    
    # Check opponent records
    alice = tracker.players[1]
    assert 3 in alice.games_against
    assert 4 in alice.games_against
    assert alice.games_against[3] == 1
    assert alice.games_against[4] == 1
    
    # ELO should have changed (team 1 won, so they should gain ELO)
    assert len(elo_deltas) == 2
    assert elo_deltas[0] > 0  # Team 1 gained ELO
    assert elo_deltas[1] < 0  # Team 2 lost ELO


def test_stats_tracker_process_match_tie():
    """Test processing a tie match."""
    tracker = calculation_service.StatsTracker()
    
    match = create_mock_match(
        [1, 2],  # Team 1
        [3, 4],  # Team 2
        21,
        21,
        match_id=1
    )
    
    elo_deltas = tracker.process_match(match)
    
    # Check game counts (all should have played)
    for player_id in [1, 2, 3, 4]:
        assert tracker.players[player_id].game_count == 1
        # No wins in a tie
        assert tracker.players[player_id].win_count == 0
    
    # ELO changes should be minimal (close to 0) for a tie
    # When both teams have same ELO, tie should result in ~0 change
    assert abs(elo_deltas[0]) < 1.0  # Small change
    assert abs(elo_deltas[1]) < 1.0  # Small change


def test_stats_tracker_multiple_matches():
    """Test processing multiple matches."""
    tracker = calculation_service.StatsTracker()
    
    # Match 1: Alice (1) & Bob (2) beat Charlie (3) & Dave (4)
    match1 = create_mock_match([1, 2], [3, 4], 21, 19, match_id=1)
    tracker.process_match(match1)
    
    # Match 2: Alice (1) & Charlie (3) beat Bob (2) & Dave (4)
    match2 = create_mock_match([1, 3], [2, 4], 21, 17, match_id=2)
    tracker.process_match(match2)
    
    # Check Alice's stats (player_id=1)
    alice = tracker.players[1]
    assert alice.game_count == 2
    assert alice.win_count == 2
    assert alice.win_rate == 1.0
    
    # Check partnerships (now using player IDs)
    assert alice.games_with[2] == 1  # Bob
    assert alice.games_with[3] == 1  # Charlie
    
    # Check Bob's stats (player_id=2)
    bob = tracker.players[2]
    assert bob.game_count == 2
    assert bob.win_count == 1  # Won once with Alice, lost once with Dave
    assert bob.win_rate == 0.5


def test_process_matches_integration():
    """Test the main process_matches function."""
    # Create mock matches (now using player IDs directly)
    matches = [
        create_mock_match([1, 2], [3, 4], 21, 19, match_id=1),  # Alice & Bob vs Charlie & Dave
        create_mock_match([1, 3], [2, 4], 21, 17, match_id=2),  # Alice & Charlie vs Bob & Dave
    ]
    
    # Process matches (player_id_map is deprecated, matches now use IDs directly)
    partnerships, opponents, elo_history = calculation_service.process_matches(
        matches
    )
    
    # Check results
    assert len(partnerships) > 0
    assert len(opponents) > 0
    assert len(elo_history) > 0
    
    # Check partnerships include all player pairs
    partnership_player_ids = set()
    for p in partnerships:
        partnership_player_ids.add((p.player_id, p.partner_id))
        assert p.games > 0
        assert p.wins >= 0
        assert 0 <= p.win_rate <= 1
    
    # Check opponents
    opponent_player_ids = set()
    for o in opponents:
        opponent_player_ids.add((o.player_id, o.opponent_id))
        assert o.games > 0
        assert o.wins >= 0
    
    # Check ELO history
    player_ids = {1, 2, 3, 4}
    for eh in elo_history:
        assert eh.player_id in player_ids
        assert eh.match_id in [1, 2]
        assert eh.elo_after >= INITIAL_ELO - 100  # Reasonable ELO range
        assert eh.elo_after <= INITIAL_ELO + 100
