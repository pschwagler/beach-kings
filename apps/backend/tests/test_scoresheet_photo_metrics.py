from scripts.scoresheet_evals.photo_metrics import evaluate_photo


def slot(name, *ids):
    return {"acceptable_player_ids": list(ids), "acceptable_names": [name]}


def reference():
    return [
        {
            "t1": [slot("Kevin", 1, 5), slot("Alex", 2, 6)],
            "t2": [slot("Sam", 3), slot("Lee", 4)],
            "s": "21-19",
        }
    ]


def test_correct_abstention_is_positive_without_requiring_hidden_identity():
    result = evaluate_photo([{"t1": ["Kevin", "Alex"], "t2": [3, 4], "s": "21-19"}], reference())
    assert result["photo_consistent_games"] == 1
    assert result["appropriate_ambiguous_abstentions"] == 2
    assert result["ambiguous_identity_selections"] == 0


def test_same_name_identity_choice_is_distinguished_from_safe_abstention():
    result = evaluate_photo([{"t1": [5, 6], "t2": [3, 4], "s": "21-19"}], reference())
    assert result["photo_consistent_games"] == 1
    assert result["appropriate_ambiguous_abstentions"] == 0
    assert result["ambiguous_identity_selections"] == 2


def test_wrong_visible_name_or_winner_is_not_credited():
    for game in [
        {"t1": ["Ken", "Alex"], "t2": [3, 4], "s": "21-19"},
        {"t1": ["Kevin", "Alex"], "t2": [3, 4], "s": "19-21"},
    ]:
        assert evaluate_photo([game], reference())["photo_consistent_games"] == 0


def test_orientation_and_duplicates_are_handled():
    game = {"t1": [4, 3], "t2": ["Alex", "Kevin"], "s": "19-21"}
    result = evaluate_photo([game, game], reference())
    assert result["photo_consistent_games"] == 1
    assert result["photo_precision"] == 0.5


def test_uncertain_reference_is_excluded_instead_of_marked_correct():
    refs = reference()
    refs[0]["needs_label_review"] = True
    result = evaluate_photo([{"t1": ["Kevin", "Alex"], "t2": [3, 4], "s": "21-19"}], refs)
    assert result["reviewed_reference_games"] == 0
    assert result["pending_label_review_games"] == 1
    assert result["photo_consistent_games"] == 0
    assert result["photo_recall"] is None
