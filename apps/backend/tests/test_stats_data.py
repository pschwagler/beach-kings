"""
Unit tests for stats_data / stats_read_data / stats_calc_data modules.

Tests verify that the re-export shim works and that core stat calculation
helper functions behave correctly in isolation without needing a live DB.
"""

from unittest.mock import MagicMock
from backend.services import stats_data
from backend.services.stats_read_data import (
    _sort_rankings_all_seasons,
    _sort_rankings_single_season,
    _match_row_to_elo_dict,
)
from backend.services.stats_calc_data import _chunks


# ---------------------------------------------------------------------------
# Re-export shim tests
# ---------------------------------------------------------------------------


def test_stats_data_exports_rankings():
    """stats_data should expose get_rankings from the re-export shim."""
    assert hasattr(stats_data, "get_rankings")
    assert callable(stats_data.get_rankings)


def test_stats_data_exports_calc_functions():
    """stats_data should expose key calculation helpers."""
    for name in [
        "delete_global_stats_async",
        "delete_season_stats_async",
        "delete_league_stats_async",
        "calculate_global_stats_async",
        "calculate_season_stats_async",
        "calculate_league_stats_async",
        "register_stats_queue_callbacks",
        "insert_elo_history_async",
        "upsert_player_global_stats_async",
    ]:
        assert hasattr(stats_data, name), f"stats_data missing: {name}"


def test_stats_data_exports_read_functions():
    """stats_data should expose key read helpers."""
    for name in [
        "get_rankings",
        "get_elo_timeline",
        "get_season_matches_with_elo",
        "get_league_matches_with_elo",
        "query_matches",
        "get_player_stats_by_id",
        "get_player_season_stats",
        "get_player_league_stats",
        "get_all_player_season_stats",
        "get_all_player_league_stats",
        "export_matches_to_csv",
        "get_player_match_history_by_id",
    ]:
        assert hasattr(stats_data, name), f"stats_data missing: {name}"


# ---------------------------------------------------------------------------
# _sort_rankings_all_seasons
# ---------------------------------------------------------------------------


def test_sort_rankings_all_seasons_by_wins():
    """Should sort by wins descending as primary key."""
    rankings = [
        {"wins": 5, "win_rate": 0.5, "avg_pt_diff": 0.0, "elo": 1200},
        {"wins": 10, "win_rate": 0.5, "avg_pt_diff": 0.0, "elo": 1200},
        {"wins": 1, "win_rate": 0.5, "avg_pt_diff": 0.0, "elo": 1200},
    ]
    result = _sort_rankings_all_seasons(rankings)
    assert result[0]["wins"] == 10
    assert result[1]["wins"] == 5
    assert result[2]["wins"] == 1


def test_sort_rankings_all_seasons_win_rate_tiebreak():
    """With equal wins, higher win_rate comes first."""
    rankings = [
        {"wins": 5, "win_rate": 0.4, "avg_pt_diff": 0.0, "elo": 1200},
        {"wins": 5, "win_rate": 0.8, "avg_pt_diff": 0.0, "elo": 1200},
    ]
    result = _sort_rankings_all_seasons(rankings)
    assert result[0]["win_rate"] == 0.8


def test_sort_rankings_all_seasons_avg_pt_diff_tiebreak():
    """With equal wins and win_rate, higher avg_pt_diff comes first."""
    rankings = [
        {"wins": 5, "win_rate": 0.5, "avg_pt_diff": 2.0, "elo": 1200},
        {"wins": 5, "win_rate": 0.5, "avg_pt_diff": 5.0, "elo": 1200},
    ]
    result = _sort_rankings_all_seasons(rankings)
    assert result[0]["avg_pt_diff"] == 5.0


def test_sort_rankings_all_seasons_elo_final_tiebreak():
    """With equal wins/win_rate/avg_pt_diff, higher elo comes first."""
    rankings = [
        {"wins": 5, "win_rate": 0.5, "avg_pt_diff": 0.0, "elo": 1100},
        {"wins": 5, "win_rate": 0.5, "avg_pt_diff": 0.0, "elo": 1300},
    ]
    result = _sort_rankings_all_seasons(rankings)
    assert result[0]["elo"] == 1300


def test_sort_rankings_all_seasons_none_values():
    """None values should be treated as 0 without raising exceptions."""
    rankings = [
        {"wins": None, "win_rate": None, "avg_pt_diff": None, "elo": None},
        {"wins": 3, "win_rate": 0.6, "avg_pt_diff": 1.0, "elo": 1200},
    ]
    result = _sort_rankings_all_seasons(rankings)
    # Player with wins=3 should rank first
    assert result[0]["wins"] == 3


def test_sort_rankings_all_seasons_empty():
    """Empty input should return empty list."""
    assert _sort_rankings_all_seasons([]) == []


# ---------------------------------------------------------------------------
# _sort_rankings_single_season
# ---------------------------------------------------------------------------


def test_sort_rankings_single_season_by_points():
    """Should sort by points descending as primary key."""
    rankings = [
        {"points": 10, "avg_pt_diff": 0.0, "win_rate": 0.5, "elo": 1200},
        {"points": 20, "avg_pt_diff": 0.0, "win_rate": 0.5, "elo": 1200},
        {"points": 5, "avg_pt_diff": 0.0, "win_rate": 0.5, "elo": 1200},
    ]
    result = _sort_rankings_single_season(rankings)
    assert result[0]["points"] == 20
    assert result[2]["points"] == 5


def test_sort_rankings_single_season_avg_pt_diff_tiebreak():
    """With equal points, higher avg_pt_diff comes first."""
    rankings = [
        {"points": 10, "avg_pt_diff": 1.0, "win_rate": 0.5, "elo": 1200},
        {"points": 10, "avg_pt_diff": 3.5, "win_rate": 0.5, "elo": 1200},
    ]
    result = _sort_rankings_single_season(rankings)
    assert result[0]["avg_pt_diff"] == 3.5


def test_sort_rankings_single_season_win_rate_tiebreak():
    """With equal points/avg_pt_diff, higher win_rate comes first."""
    rankings = [
        {"points": 10, "avg_pt_diff": 0.0, "win_rate": 0.3, "elo": 1200},
        {"points": 10, "avg_pt_diff": 0.0, "win_rate": 0.7, "elo": 1200},
    ]
    result = _sort_rankings_single_season(rankings)
    assert result[0]["win_rate"] == 0.7


def test_sort_rankings_single_season_none_values():
    """None values should not raise; treated as 0."""
    rankings = [
        {"points": None, "avg_pt_diff": None, "win_rate": None, "elo": None},
        {"points": 5, "avg_pt_diff": 1.0, "win_rate": 0.5, "elo": 1200},
    ]
    result = _sort_rankings_single_season(rankings)
    assert result[0]["points"] == 5


# ---------------------------------------------------------------------------
# _match_row_to_elo_dict
# ---------------------------------------------------------------------------


def _make_match_row(
    id=42,
    date="2024-01-15",
    session_id=5,
    session_name="Test Session",
    session_status=None,
    session_season_id=None,
    team1_player1_id=1,
    team1_player2_id=2,
    team2_player1_id=3,
    team2_player2_id=4,
    team1_player1_name="Alice",
    team1_player2_name="Bob",
    team2_player1_name="Carol",
    team2_player2_name="Dave",
    team1_score=21,
    team2_score=15,
    winner=1,
    is_ranked=True,
    ranked_intent=True,
):
    row = MagicMock()
    row.id = id
    row.date = date
    row.session_id = session_id
    row.session_name = session_name
    row.session_status = session_status
    row.session_season_id = session_season_id
    row.team1_player1_id = team1_player1_id
    row.team1_player2_id = team1_player2_id
    row.team2_player1_id = team2_player1_id
    row.team2_player2_id = team2_player2_id
    row.team1_player1_name = team1_player1_name
    row.team1_player2_name = team1_player2_name
    row.team2_player1_name = team2_player1_name
    row.team2_player2_name = team2_player2_name
    row.team1_score = team1_score
    row.team2_score = team2_score
    row.winner = winner
    row.is_ranked = is_ranked
    row.ranked_intent = ranked_intent
    return row


def test_match_row_to_elo_dict_basic():
    """Should map row attributes to the expected dict shape."""
    row = _make_match_row()
    elo_by_match = {
        42: {
            1: {"elo_before": 1200.0, "elo_after": 1215.0, "elo_change": 15.0},
            3: {"elo_before": 1210.0, "elo_after": 1195.0, "elo_change": -15.0},
        }
    }

    result = _match_row_to_elo_dict(row, elo_by_match)

    assert result["id"] == 42
    assert result["date"] == "2024-01-15"
    assert result["session_id"] == 5
    assert result["team1_score"] == 21
    assert result["team2_score"] == 15
    assert result["team1_player1_name"] == "Alice"
    assert result["team2_player1_name"] == "Carol"
    assert result["elo_changes"] == elo_by_match[42]


def test_match_row_to_elo_dict_missing_elo_entry():
    """When a match has no ELO data, elo_changes should be an empty dict."""
    row = _make_match_row(id=99)
    elo_by_match = {}  # no entry for match 99

    result = _match_row_to_elo_dict(row, elo_by_match)

    assert result["elo_changes"] == {}
    assert result["id"] == 99


# ---------------------------------------------------------------------------
# _chunks
# ---------------------------------------------------------------------------


def test_chunks_even_split():
    """Should split a list evenly into chunks of size n."""
    result = list(_chunks([1, 2, 3, 4], 2))
    assert result == [[1, 2], [3, 4]]


def test_chunks_uneven_split():
    """Last chunk should be smaller when list doesn't divide evenly."""
    result = list(_chunks([1, 2, 3, 4, 5], 2))
    assert result == [[1, 2], [3, 4], [5]]


def test_chunks_size_larger_than_list():
    """When chunk size > list length, returns one chunk with all items."""
    result = list(_chunks([1, 2, 3], 10))
    assert result == [[1, 2, 3]]


def test_chunks_empty_list():
    """Empty list should produce no chunks."""
    result = list(_chunks([], 5))
    assert result == []


def test_chunks_size_one():
    """Chunk size of 1 should produce one item per chunk."""
    result = list(_chunks([10, 20, 30], 1))
    assert result == [[10], [20], [30]]
