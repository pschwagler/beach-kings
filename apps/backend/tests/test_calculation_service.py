"""
Tests for the calculation service - ELO calculations and statistics.
"""

from backend.services import calculation_service
from backend.utils.constants import INITIAL_ELO, K, USE_POINT_DIFFERENTIAL


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
    assert low_result < 0.1  # Very low ELO should have very low win probability


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
    """Test K-factor returns the constant."""
    assert calculation_service.k_factor(K) == K


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


def create_mock_match(
    team1_players, team2_players, team1_score, team2_score, match_id=1, date=None
):
    """Helper to create a mock Match object."""

    # Create a simple mock object that matches the Match model interface
    class MockMatch:
        def __init__(self, player_ids, team1_score, team2_score, match_id, date, is_ranked=True):
            self.player_ids = player_ids  # List of [team1_ids, team2_ids]
            self.team1_score = team1_score
            self.team2_score = team2_score
            self.id = match_id
            self.date = date or "2024-01-01"
            self.is_ranked = is_ranked

    return MockMatch(
        [team1_players, team2_players],  # Now expects lists of player IDs
        team1_score,
        team2_score,
        match_id,
        date,
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
        match_id=1,
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
        match_id=1,
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
    partnerships, opponents, elo_history = calculation_service.process_matches(matches)

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


# ============================================================================
# Tests for extracted builder helpers
# ============================================================================


def _make_tracker_with_matches():
    """Create a StatsTracker with 2 processed matches for builder tests."""
    tracker = calculation_service.StatsTracker()
    m1 = create_mock_match([1, 2], [3, 4], 21, 19, match_id=1)
    m2 = create_mock_match([1, 3], [2, 4], 21, 17, match_id=2)
    tracker.process_match(m1)
    tracker.process_match(m2)
    return tracker


def test_build_partnership_stats():
    """Test _build_partnership_stats produces correct ORM objects."""
    tracker = _make_tracker_with_matches()
    partnerships = calculation_service._build_partnership_stats(tracker, {})

    assert len(partnerships) > 0
    # Every entry should have valid stats
    for p in partnerships:
        assert p.games > 0
        assert 0 <= p.win_rate <= 1
        assert p.player_id != p.partner_id

    # Alice (1) played with Bob (2) in match 1 and Charlie (3) in match 2
    alice_partners = {p.partner_id for p in partnerships if p.player_id == 1}
    assert 2 in alice_partners
    assert 3 in alice_partners


def test_build_opponent_stats():
    """Test _build_opponent_stats produces correct ORM objects."""
    tracker = _make_tracker_with_matches()
    opponents = calculation_service._build_opponent_stats(tracker, {})

    assert len(opponents) > 0
    for o in opponents:
        assert o.games > 0
        assert o.player_id != o.opponent_id

    # Alice (1) played against Charlie (3) and Dave (4) in match 1
    alice_opponents = {o.opponent_id for o in opponents if o.player_id == 1}
    assert 3 in alice_opponents or 4 in alice_opponents


def test_build_elo_history():
    """Test _build_elo_history produces correct ORM objects."""
    tracker = _make_tracker_with_matches()
    history = calculation_service._build_elo_history(tracker)

    assert len(history) > 0
    for eh in history:
        assert eh.match_id in [1, 2]
        assert eh.elo_after > 0
        assert eh.date == "2024-01-01"


def test_calculate_elo_deltas():
    """Test _calculate_elo_deltas helper on StatsTracker."""
    tracker = calculation_service.StatsTracker()
    # Seed players
    for pid in [1, 2, 3, 4]:
        tracker.get_player(pid)

    teams = [[1, 2], [3, 4]]
    deltas = tracker._calculate_elo_deltas(
        teams,
        K,
        1.0,
        rating_getter=lambda p: p.elo,
    )
    assert len(deltas) == 2
    assert deltas[0] > 0  # Winning team gains
    assert deltas[1] < 0  # Losing team drops
    # Should be symmetric
    assert abs(deltas[0] + deltas[1]) < 0.01


def test_season_elo_updates_independently():
    """Test that season ELO and global ELO update independently."""
    # season_rating mode requires scoring_config type = "season_rating"
    tracker = calculation_service.StatsTracker(
        initial_ratings={1: 1200, 2: 1200, 3: 1200, 4: 1200},
        scoring_config={"type": "season_rating"},
    )
    match = create_mock_match([1, 2], [3, 4], 21, 15, match_id=1)
    tracker.process_match(match)

    p1 = tracker.get_player(1)
    # Both should have changed from initial
    assert p1.elo != INITIAL_ELO
    assert p1.season_rating != 1200
    # They use different K-factors so changes should differ
    global_change = p1.elo - INITIAL_ELO
    season_change = p1.season_rating - 1200
    assert global_change != 0
    assert season_change != 0


# ============================================================================
# Tests for get_scoring_config
# ============================================================================


def test_get_scoring_config_none():
    """get_scoring_config returns default when input is None."""
    config = calculation_service.get_scoring_config(None)
    assert config == {"type": "points_system", "points_per_win": 3, "points_per_loss": 1}


def test_get_scoring_config_empty_string():
    """get_scoring_config returns default when input is empty string."""
    config = calculation_service.get_scoring_config("")
    assert config == {"type": "points_system", "points_per_win": 3, "points_per_loss": 1}


def test_get_scoring_config_valid_points_system():
    """get_scoring_config parses valid points_system JSON."""
    import json

    raw = json.dumps({"type": "points_system", "points_per_win": 5, "points_per_loss": 0})
    config = calculation_service.get_scoring_config(raw)
    assert config["type"] == "points_system"
    assert config["points_per_win"] == 5
    assert config["points_per_loss"] == 0


def test_get_scoring_config_points_system_defaults_missing_keys():
    """get_scoring_config fills in missing points_per_win/loss for points_system."""
    import json

    raw = json.dumps({"type": "points_system"})
    config = calculation_service.get_scoring_config(raw)
    assert config["points_per_win"] == 3
    assert config["points_per_loss"] == 1


def test_get_scoring_config_season_rating():
    """get_scoring_config parses season_rating JSON."""
    import json

    raw = json.dumps({"type": "season_rating"})
    config = calculation_service.get_scoring_config(raw)
    assert config["type"] == "season_rating"


def test_get_scoring_config_malformed_json():
    """get_scoring_config returns default on malformed JSON."""
    config = calculation_service.get_scoring_config("{bad json!!}")
    assert config == {"type": "points_system", "points_per_win": 3, "points_per_loss": 1}


def test_get_scoring_config_malformed_json_logs_warning(caplog):
    """get_scoring_config logs a warning when JSON is malformed."""
    import logging

    with caplog.at_level(logging.WARNING, logger="backend.services.calculation_service"):
        calculation_service.get_scoring_config("{bad}")
    assert any("Malformed point_system JSON" in record.message for record in caplog.records)


# ============================================================================
# Tests for calculate_points
# ============================================================================


def test_calculate_points_default():
    """calculate_points with default scoring (3/1)."""
    config = {"type": "points_system", "points_per_win": 3, "points_per_loss": 1}
    assert calculation_service.calculate_points(5, 3, config) == 5 * 3 + 3 * 1


def test_calculate_points_custom():
    """calculate_points with custom scoring (5/0)."""
    config = {"type": "points_system", "points_per_win": 5, "points_per_loss": 0}
    assert calculation_service.calculate_points(4, 2, config) == 4 * 5 + 2 * 0


def test_calculate_points_season_rating_returns_zero():
    """calculate_points returns 0 for season_rating mode (partnership/opponent context)."""
    config = {"type": "season_rating"}
    assert calculation_service.calculate_points(10, 5, config) == 0


def test_calculate_points_missing_config_keys():
    """calculate_points falls back to 3/1 when config keys are absent."""
    config = {"type": "points_system"}
    assert calculation_service.calculate_points(2, 1, config) == 2 * 3 + 1 * 1


# ============================================================================
# Tests for PlayerStats.points with custom scoring configs
# ============================================================================


def test_player_stats_points_custom_scoring():
    """PlayerStats.points uses custom points_per_win/loss from scoring_config."""
    config = {"type": "points_system", "points_per_win": 5, "points_per_loss": 0}
    stats = calculation_service.PlayerStats(player_id=1, scoring_config=config)
    stats.game_count = 8
    stats.win_count = 5
    # 5 wins * 5 + 3 losses * 0 = 25
    assert stats.points == 25.0


def test_player_stats_points_season_rating():
    """PlayerStats.points returns season_rating for season_rating mode."""
    config = {"type": "season_rating"}
    stats = calculation_service.PlayerStats(
        player_id=1, initial_rating=100.0, scoring_config=config
    )
    stats.game_count = 2
    stats.win_count = 1
    # Should return season_rating, not a win/loss points formula
    assert stats.points == 100.0  # No matches processed, so still initial


def test_process_matches_custom_scoring_config():
    """process_matches uses custom scoring config for partnership/opponent points."""
    config = {"type": "points_system", "points_per_win": 5, "points_per_loss": 0}
    matches = [
        create_mock_match([1, 2], [3, 4], 21, 19, match_id=1),
    ]
    partnerships, opponents, _ = calculation_service.process_matches(
        matches, scoring_config=config
    )

    # Winners (1 & 2) each have 1 win, 0 losses -> 5 points
    p1_partner = next(p for p in partnerships if p.player_id == 1 and p.partner_id == 2)
    assert p1_partner.points == 5

    # Losers (3 & 4) each have 0 wins, 1 loss -> 0 points
    p3_partner = next(p for p in partnerships if p.player_id == 3 and p.partner_id == 4)
    assert p3_partner.points == 0


def test_stats_tracker_non_member_initial_rating():
    """Non-member players (not in initial_ratings) fall back to INITIAL_ELO for season_rating."""
    # Player 5 is not in initial_ratings — simulates a non-member guest
    tracker = calculation_service.StatsTracker(
        initial_ratings={1: 100.0, 2: 100.0, 3: 100.0, 4: 100.0},
        scoring_config={"type": "season_rating"},
    )
    member = tracker.get_player(1)
    non_member = tracker.get_player(5)

    assert member.season_rating == 100.0
    assert (
        non_member.season_rating == INITIAL_ELO
    )  # 1200 — the bug we're fixing in stats_calc_data
