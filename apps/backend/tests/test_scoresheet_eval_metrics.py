from scripts.scoresheet_evals.metrics import evaluate


def test_accepts_teammate_row_and_team_order_changes():
    expected = [{"t1": [1, 2], "t2": [3, 4], "s": "21-19"}]
    actual = [{"t1": [4, 3], "t2": [2, 1], "s": "19-21"}]
    assert evaluate(actual, expected)["all_games_correct"]


def test_detects_wrong_scores_extra_games_and_duplicates():
    expected = [{"t1": [1, 2], "t2": [3, 4], "s": "21-19"}]
    assert evaluate([{**expected[0], "s": "21-18"}], expected)["exact_games"] == 0
    result = evaluate(expected * 2, expected)
    assert result["precision"] == 0.5
    assert result["recall"] == 1
    assert not result["all_games_correct"]


def test_wrong_winner_is_not_hidden_by_team_normalization():
    expected = [{"t1": [1, 2], "t2": [3, 4], "s": "21-19"}]
    result = evaluate([{**expected[0], "s": "19-21"}], expected)
    assert result["exact_games"] == 0
    assert result["correct_teams"] == 1


def test_unresolved_numeric_name_is_not_a_resolved_player_id():
    expected = [{"t1": [1, 2], "t2": [3, 4], "s": "21-19"}]
    actual = [{"t1": ["1", 2], "t2": [3, 4], "s": "21-19"}]
    assert evaluate(actual, expected)["exact_games"] == 0
    assert evaluate(actual, expected)["unresolved_player_slots"] == 1
