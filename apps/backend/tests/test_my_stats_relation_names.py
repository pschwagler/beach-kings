"""Name-contract tests for authenticated My Stats relation rows."""

from backend.services.stats.my_stats_service import _build_relation_row


def test_relation_row_keeps_abbreviation_and_adds_normalized_full_name():
    row = _build_relation_row(
        player_id=9,
        full_name="  Alexandra   Montgomery-Smith  ",
        avatar_url=None,
        games=4,
        wins=3,
        win_rate=75,
    )

    assert row["display_name"] == "A. Montgomery-Smith"
    assert row["full_name"] == "Alexandra Montgomery-Smith"
    assert row["initials"] == "AM"


def test_relation_row_uses_deterministic_player_fallback_for_blank_name():
    row = _build_relation_row(
        player_id=17,
        full_name=" \t ",
        avatar_url=None,
        games=1,
        wins=0,
        win_rate=0,
    )

    assert row["display_name"] == "Player 17"
    assert row["full_name"] is None
    assert row["initials"] == "P1"
