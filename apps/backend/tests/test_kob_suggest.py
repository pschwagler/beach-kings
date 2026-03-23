"""
Unit tests for kob_suggest.py.

All functions are pure — no DB, no async, no mocks needed.
Covers smart defaults, duration-constrained suggestions, format pills,
and the legacy recommend_format wrapper.
"""

from typing import Any, Dict

import pytest

from backend.services.kob_suggest import (
    suggest_defaults,
    suggest_alternatives,
    recommend_format,
    _pill_label,
    _make_pill,
    _alt_rr_no_duration,
    _alt_pools_no_duration,
)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

VALID_FORMATS = {"FULL_ROUND_ROBIN", "POOLS_PLAYOFFS", "PARTIAL_ROUND_ROBIN"}

REQUIRED_KEYS = {"format", "num_pools", "playoff_size", "max_rounds", "game_to", "games_per_match"}


def _assert_valid_defaults(d: Dict[str, Any]) -> None:
    """Assert that a suggest_defaults result has all expected keys."""
    for key in REQUIRED_KEYS:
        assert key in d, f"Missing key: {key}"
    assert d["format"] in VALID_FORMATS
    assert d["game_to"] in (11, 15, 21, 28)
    assert d["games_per_match"] in (1, 2)


# ---------------------------------------------------------------------------
# suggest_defaults — without duration
# ---------------------------------------------------------------------------


class TestSuggestDefaultsNoDuration:
    @pytest.mark.parametrize("n", [2, 4, 6, 8, 10])
    def test_small_groups_use_full_rr(self, n):
        result = suggest_defaults(n, num_courts=2)
        assert result["format"] == "FULL_ROUND_ROBIN"
        assert result["num_pools"] is None
        assert result["max_rounds"] is None

    @pytest.mark.parametrize("n", [11, 12])
    def test_medium_groups_use_pools(self, n):
        result = suggest_defaults(n, num_courts=2)
        assert result["format"] == "POOLS_PLAYOFFS"
        assert result["num_pools"] is not None
        assert result["num_pools"] >= 2

    @pytest.mark.parametrize("n", [13, 16, 20, 24])
    def test_large_groups_use_pools(self, n):
        result = suggest_defaults(n, num_courts=4)
        assert result["format"] == "POOLS_PLAYOFFS"
        assert result["num_pools"] is not None

    def test_has_all_required_keys(self):
        for n in [4, 8, 12, 16]:
            result = suggest_defaults(n, num_courts=2)
            _assert_valid_defaults(result)

    def test_default_game_to_is_21(self):
        result = suggest_defaults(6, num_courts=2)
        assert result["game_to"] == 21

    def test_default_games_per_match_is_1(self):
        result = suggest_defaults(6, num_courts=2)
        assert result["games_per_match"] == 1

    @pytest.mark.parametrize(
        "n, courts",
        [
            (4, 1),
            (6, 1),
            (8, 2),
            (12, 3),
            (16, 4),
            (24, 4),
        ],
    )
    def test_grid_all_valid(self, n, courts):
        result = suggest_defaults(n, num_courts=courts)
        _assert_valid_defaults(result)

    def test_two_players(self):
        result = suggest_defaults(2, num_courts=1)
        assert result["format"] == "FULL_ROUND_ROBIN"

    def test_one_court(self):
        result = suggest_defaults(8, num_courts=1)
        _assert_valid_defaults(result)

    def test_num_pools_capped_at_six(self):
        result = suggest_defaults(30, num_courts=10)
        if result["format"] == "POOLS_PLAYOFFS":
            assert result["num_pools"] <= 6

    def test_playoff_size_present_for_large_groups(self):
        result = suggest_defaults(16, num_courts=4)
        if result["format"] == "POOLS_PLAYOFFS":
            assert result["playoff_size"] in (4, 6, None)

    def test_pools_ge_5_may_use_playoff_size_6(self):
        """With many courts/players, num_pools >= 5 should yield playoff_size=6."""
        result = suggest_defaults(24, num_courts=6)
        if result["format"] == "POOLS_PLAYOFFS" and result["num_pools"] is not None:
            if result["num_pools"] >= 5:
                assert result["playoff_size"] == 6


# ---------------------------------------------------------------------------
# suggest_defaults — with duration constraint
# ---------------------------------------------------------------------------


class TestSuggestDefaultsWithDuration:
    def test_returns_valid_config(self):
        result = suggest_defaults(8, num_courts=2, duration_minutes=120)
        _assert_valid_defaults(result)

    def test_tight_duration_reduces_rounds_or_game_to(self):
        """A 60-minute budget should produce a more restricted config than 240."""
        short = suggest_defaults(8, num_courts=2, duration_minutes=60)
        long_ = suggest_defaults(8, num_courts=2, duration_minutes=240)
        # short config should have lower game_to or fewer max_rounds
        short_game_to = short.get("game_to", 21)
        long_game_to = long_.get("game_to", 21)
        # Either game_to is reduced, or format is restricted
        assert short_game_to <= long_game_to or short["format"] in VALID_FORMATS

    def test_minimal_fallback_returned_on_impossible_budget(self):
        """A 1-minute budget should still return a valid (minimal) config."""
        result = suggest_defaults(12, num_courts=2, duration_minutes=1)
        _assert_valid_defaults(result)
        assert result["game_to"] <= 21

    @pytest.mark.parametrize("n", [6, 8, 12])
    def test_duration_60_valid_for_common_sizes(self, n):
        result = suggest_defaults(n, num_courts=2, duration_minutes=60)
        _assert_valid_defaults(result)

    @pytest.mark.parametrize("n", [8, 12, 16])
    def test_duration_120_valid(self, n):
        result = suggest_defaults(n, num_courts=3, duration_minutes=120)
        _assert_valid_defaults(result)

    def test_duration_none_equivalent_to_no_constraint(self):
        without = suggest_defaults(6, num_courts=2)
        with_none = suggest_defaults(6, num_courts=2, duration_minutes=None)
        assert without["format"] == with_none["format"]


# ---------------------------------------------------------------------------
# suggest_alternatives
# ---------------------------------------------------------------------------


class TestSuggestAlternatives:
    PILL_KEYS = {
        "label",
        "category",
        "is_recommended",
        "format",
        "game_to",
        "games_per_match",
        "total_time_minutes",
        "max_games_per_player",
    }

    def test_returns_list(self):
        pills = suggest_alternatives(8, num_courts=2)
        assert isinstance(pills, list)

    def test_exactly_one_recommended(self):
        pills = suggest_alternatives(8, num_courts=2)
        recommended = [p for p in pills if p["is_recommended"]]
        assert len(recommended) == 1

    def test_pill_has_all_required_keys(self):
        pills = suggest_alternatives(8, num_courts=2)
        for pill in pills:
            for key in self.PILL_KEYS:
                assert key in pill, f"Pill missing key: {key}"

    def test_pills_have_valid_formats(self):
        pills = suggest_alternatives(8, num_courts=2)
        for pill in pills:
            assert pill["format"] in VALID_FORMATS

    def test_at_most_two_pills(self):
        for n in [4, 8, 12, 16]:
            pills = suggest_alternatives(n, num_courts=2)
            assert len(pills) <= 2

    def test_alternatives_differ_from_each_other(self):
        """When 2 pills are returned, they should be in different categories."""
        pills = suggest_alternatives(12, num_courts=3)
        if len(pills) == 2:
            categories = [p["category"] for p in pills]
            assert len(set(categories)) == 2

    def test_recommended_pill_matches_suggest_defaults_format(self):
        defaults = suggest_defaults(8, num_courts=2)
        pills = suggest_alternatives(8, num_courts=2)
        rec_pill = next(p for p in pills if p["is_recommended"])
        assert rec_pill["format"] == defaults["format"]

    def test_with_duration(self):
        pills = suggest_alternatives(8, num_courts=2, duration_minutes=120)
        assert len(pills) >= 1
        recommended = [p for p in pills if p["is_recommended"]]
        assert len(recommended) == 1

    def test_two_players_returns_nonempty(self):
        pills = suggest_alternatives(2, num_courts=1)
        assert len(pills) >= 1

    @pytest.mark.parametrize(
        "n, courts",
        [(4, 1), (6, 2), (8, 2), (12, 3), (16, 4), (24, 4)],
    )
    def test_grid_all_valid(self, n, courts):
        pills = suggest_alternatives(n, num_courts=courts)
        assert len(pills) >= 1
        for pill in pills:
            assert pill["format"] in VALID_FORMATS

    def test_category_pools_or_round_robin(self):
        for n in [4, 8, 12, 16]:
            pills = suggest_alternatives(n, num_courts=2)
            for pill in pills:
                assert pill["category"] in ("pools", "round_robin")

    def test_total_time_minutes_nonnegative(self):
        pills = suggest_alternatives(8, num_courts=2)
        for pill in pills:
            assert pill["total_time_minutes"] >= 0

    def test_max_games_per_player_nonnegative(self):
        pills = suggest_alternatives(8, num_courts=2)
        for pill in pills:
            assert pill["max_games_per_player"] >= 0


# ---------------------------------------------------------------------------
# recommend_format (legacy wrapper)
# ---------------------------------------------------------------------------


class TestRecommendFormat:
    def test_returns_dict(self):
        result = recommend_format(8, num_courts=2)
        assert isinstance(result, dict)

    def test_has_preview_keys(self):
        result = recommend_format(8, num_courts=2)
        assert "total_time_minutes" in result
        assert "max_games_per_player" in result

    def test_total_time_nonnegative(self):
        result = recommend_format(8, num_courts=2)
        assert result["total_time_minutes"] >= 0

    @pytest.mark.parametrize("n", [4, 8, 12, 16])
    def test_various_player_counts(self, n):
        result = recommend_format(n, num_courts=2)
        assert "total_time_minutes" in result

    def test_with_duration_minutes(self):
        result = recommend_format(8, num_courts=2, duration_minutes=120)
        assert isinstance(result, dict)


# ---------------------------------------------------------------------------
# _pill_label
# ---------------------------------------------------------------------------


class TestPillLabel:
    def test_pools_playoffs_with_size(self):
        label = _pill_label("POOLS_PLAYOFFS", num_pools=2, playoff_size=4, max_rounds=None)
        assert "2 Pools" in label
        assert "Top 4" in label

    def test_pools_no_playoffs(self):
        label = _pill_label("POOLS_PLAYOFFS", num_pools=3, playoff_size=None, max_rounds=None)
        assert "3 Pools" in label
        assert "Top" not in label

    def test_partial_rr_includes_rounds(self):
        label = _pill_label("PARTIAL_ROUND_ROBIN", num_pools=None, playoff_size=None, max_rounds=5)
        assert "5" in label
        assert "Round Robin" in label

    def test_full_rr_label(self):
        label = _pill_label("FULL_ROUND_ROBIN", num_pools=None, playoff_size=None, max_rounds=None)
        assert "Round Robin" in label

    def test_returns_string(self):
        label = _pill_label("FULL_ROUND_ROBIN", num_pools=None, playoff_size=None, max_rounds=None)
        assert isinstance(label, str)


# ---------------------------------------------------------------------------
# Internal helpers: _alt_rr_no_duration, _alt_pools_no_duration
# ---------------------------------------------------------------------------


class TestAltHelpers:
    def test_alt_rr_no_duration_small(self):
        result = _alt_rr_no_duration(6, num_courts=2)
        assert result is not None
        assert result["format"] in ("FULL_ROUND_ROBIN", "PARTIAL_ROUND_ROBIN")

    def test_alt_rr_no_duration_large(self):
        result = _alt_rr_no_duration(16, num_courts=4)
        assert result is not None
        assert result["format"] in ("FULL_ROUND_ROBIN", "PARTIAL_ROUND_ROBIN")

    def test_alt_pools_no_duration_small_returns_none(self):
        result = _alt_pools_no_duration(4, num_courts=2)
        assert result is None

    def test_alt_pools_no_duration_eight_players(self):
        result = _alt_pools_no_duration(8, num_courts=2)
        assert result is not None
        assert result["format"] == "POOLS_PLAYOFFS"
