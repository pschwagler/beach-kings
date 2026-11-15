from copy import deepcopy

import pytest

from scripts.scoresheet_evals.rosters import unique_first_name_case


def test_keeps_recorded_player_over_other_same_name_and_preserves_labels():
    case = {
        "members": [
            {"player_id": 1, "player_name": "Kevin Example"},
            {"player_id": 5, "player_name": "Kevin Sample"},
            {"player_id": 2, "player_name": "Alex Example"},
            {"player_id": 3, "player_name": "Sam Example"},
            {"player_id": 4, "player_name": "Lee Example"},
        ],
        "expected": [{"t1": [5, 2], "t2": [3, 4], "s": "21-19"}],
        "photo_reference": [
            {
                "t1": [{"acceptable_player_ids": [1, 5]}, {"acceptable_player_ids": [2]}],
                "t2": [{"acceptable_player_ids": [3]}, {"acceptable_player_ids": [4]}],
            }
        ],
    }
    original = deepcopy(case)
    result = unique_first_name_case(case)
    assert len(result["members"]) == 4
    assert 5 in [member["player_id"] for member in result["members"]]
    assert result["expected"] == original["expected"]
    assert result["photo_reference"][0]["t1"][0]["acceptable_player_ids"] == [5]
    assert case == original


def test_rejects_reference_that_requires_two_same_first_names():
    case = {
        "members": [
            {"player_id": 1, "player_name": "Kevin Example"},
            {"player_id": 2, "player_name": "Kevin Sample"},
            {"player_id": 3, "player_name": "Sam Example"},
            {"player_id": 4, "player_name": "Lee Example"},
        ],
        "expected": [{"t1": [1, 2], "t2": [3, 4], "s": "21-19"}],
    }
    with pytest.raises(ValueError, match="multiple players"):
        unique_first_name_case(case)
