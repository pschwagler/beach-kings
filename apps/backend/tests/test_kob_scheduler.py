"""
Comprehensive unit tests for the KOB scheduling algorithm.

Tests the pure-Python scheduling functions in kob_scheduler.py and the score
validation helper in kob_service.py.  No database connection is required.
"""

from collections import Counter
from itertools import combinations
from typing import Dict, List, Set, Tuple

import pytest

from backend.services.kob_scheduler import (
    generate_full_round_robin,
    generate_partial_round_robin,
    generate_pools_schedule,
    generate_preview,
    generate_schedule,
    suggest_defaults,
    _snake_draft,
    _full_rr_round_count,
)
from backend.services.kob_service import _validate_score


# ---------------------------------------------------------------------------
# Helpers shared across test classes
# ---------------------------------------------------------------------------

def _all_partnerships(rounds: List[Dict]) -> List[Tuple[int, int]]:
    """Return every (partner_a, partner_b) pair that appears across all rounds.

    Partners are canonicalized so (a, b) and (b, a) are the same pair.
    """
    pairs: List[Tuple[int, int]] = []
    for rnd in rounds:
        for match in rnd["matches"]:
            if match.get("is_bye"):
                continue
            t1 = match["team1"]
            t2 = match["team2"]
            pairs.append((min(t1[0], t1[1]), max(t1[0], t1[1])))
            pairs.append((min(t2[0], t2[1]), max(t2[0], t2[1])))
    return pairs


def _game_counts(rounds: List[Dict], player_ids: List[int]) -> Dict[int, int]:
    """Return {player_id: number_of_matches_played} across all rounds."""
    counts: Dict[int, int] = {pid: 0 for pid in player_ids}
    for rnd in rounds:
        for match in rnd["matches"]:
            if match.get("is_bye"):
                continue
            for pid in match["team1"] + match["team2"]:
                if pid > 0:
                    counts[pid] = counts.get(pid, 0) + 1
    return counts


def _court_nums(rounds: List[Dict]) -> Set[int]:
    """Collect every court_num value seen across all real matches."""
    courts: Set[int] = set()
    for rnd in rounds:
        for match in rnd["matches"]:
            if not match.get("is_bye"):
                courts.add(match["court_num"])
    return courts


# ===========================================================================
# 1. generate_full_round_robin
# ===========================================================================

class TestGenerateFullRoundRobin:
    """Tests for the circle-method full round-robin generator."""

    # -----------------------------------------------------------------------
    # Round count
    # -----------------------------------------------------------------------

    @pytest.mark.parametrize("n", [4, 6, 8, 10])
    def test_even_player_count_rounds(self, n: int):
        """Even N players → exactly N-1 rounds."""
        player_ids = list(range(1, n + 1))
        result = generate_full_round_robin(player_ids, num_courts=2)
        assert result["total_rounds"] == n - 1
        assert len(result["rounds"]) == n - 1

    @pytest.mark.parametrize("n", [5, 7, 9])
    def test_odd_player_count_rounds(self, n: int):
        """Odd N players → exactly N rounds (one phantom added for byes)."""
        player_ids = list(range(1, n + 1))
        result = generate_full_round_robin(player_ids, num_courts=2)
        assert result["total_rounds"] == n
        assert len(result["rounds"]) == n

    # -----------------------------------------------------------------------
    # Partnership coverage — every pair partners exactly once
    # -----------------------------------------------------------------------

    @pytest.mark.parametrize("n", [4, 6, 8])
    def test_no_duplicate_partnerships_even(self, n: int):
        """Full RR: no (a, b) partnership appears more than once for even N."""
        player_ids = list(range(1, n + 1))
        result = generate_full_round_robin(player_ids, num_courts=4)

        partnership_list = _all_partnerships(result["rounds"])
        actual_pairs = Counter(partnership_list)

        # No pair may partner more than once
        assert all(v == 1 for v in actual_pairs.values()), (
            f"Some partnerships appear more than once: "
            f"{[(k, v) for k, v in actual_pairs.items() if v != 1]}"
        )

    @pytest.mark.parametrize("n", [5, 7])
    def test_no_duplicate_partnerships_odd(self, n: int):
        """Full RR: no (a, b) partnership appears more than once for odd N."""
        player_ids = list(range(1, n + 1))
        result = generate_full_round_robin(player_ids, num_courts=4)

        partnership_list = _all_partnerships(result["rounds"])
        actual_pairs = Counter(partnership_list)

        assert all(v == 1 for v in actual_pairs.values()), (
            f"Some partnerships appear more than once: "
            f"{[(k, v) for k, v in actual_pairs.items() if v != 1]}"
        )

    # -----------------------------------------------------------------------
    # Byes (odd player counts)
    # -----------------------------------------------------------------------

    def test_odd_players_have_byes_every_round(self):
        """With 5 players, exactly one player gets a bye per round."""
        result = generate_full_round_robin(list(range(1, 6)), num_courts=2)
        for rnd in result["rounds"]:
            round_key = str(rnd["round_num"])
            byes = result["byes_per_round"].get(round_key, [])
            assert len(byes) >= 1, (
                f"Round {rnd['round_num']} has no bye player despite odd count"
            )

    def test_even_players_no_byes(self):
        """With 4 players, there should be no byes."""
        result = generate_full_round_robin([1, 2, 3, 4], num_courts=2)
        assert result["byes_per_round"] == {}

    def test_odd_byes_cover_all_players(self):
        """Each player gets a bye at least once across all rounds (7 players)."""
        player_ids = list(range(1, 8))
        result = generate_full_round_robin(player_ids, num_courts=4)
        bye_players: Set[int] = set()
        for byes in result["byes_per_round"].values():
            bye_players.update(byes)
        assert bye_players == set(player_ids)

    # -----------------------------------------------------------------------
    # Court assignments
    # -----------------------------------------------------------------------

    @pytest.mark.parametrize("num_courts", [1, 2, 3])
    def test_court_assignments_respect_limit(self, num_courts: int):
        """Court numbers must never exceed num_courts."""
        result = generate_full_round_robin(list(range(1, 9)), num_courts=num_courts)
        for court in _court_nums(result["rounds"]):
            assert 1 <= court <= num_courts, (
                f"Court {court} out of range [1, {num_courts}]"
            )

    def test_court_numbers_start_at_one(self):
        """Court numbering starts at 1, not 0."""
        result = generate_full_round_robin(list(range(1, 7)), num_courts=2)
        courts = _court_nums(result["rounds"])
        assert 0 not in courts

    # -----------------------------------------------------------------------
    # Structure
    # -----------------------------------------------------------------------

    def test_result_keys_present(self):
        """Result dict contains the required top-level keys."""
        result = generate_full_round_robin([1, 2, 3, 4], num_courts=1)
        for key in ("rounds", "total_rounds", "byes_per_round", "pools"):
            assert key in result

    def test_match_structure(self):
        """Each match dict contains the required fields."""
        result = generate_full_round_robin([1, 2, 3, 4], num_courts=1)
        for rnd in result["rounds"]:
            for match in rnd["matches"]:
                for field in ("matchup_id", "court_num", "team1", "team2", "is_bye"):
                    assert field in match
                assert len(match["team1"]) == 2
                assert len(match["team2"]) == 2

    def test_matchup_ids_are_unique(self):
        """Every matchup_id is unique across the entire schedule."""
        result = generate_full_round_robin(list(range(1, 9)), num_courts=2)
        ids = [
            m["matchup_id"]
            for rnd in result["rounds"]
            for m in rnd["matches"]
        ]
        assert len(ids) == len(set(ids))

    def test_four_players_produces_three_rounds(self):
        """4 players → 3 rounds, one match per round."""
        result = generate_full_round_robin([1, 2, 3, 4], num_courts=1)
        assert result["total_rounds"] == 3
        for rnd in result["rounds"]:
            assert len(rnd["matches"]) == 1

    def test_six_players_produces_five_rounds(self):
        """6 players → 5 rounds, each with 1-2 matches depending on courts."""
        result = generate_full_round_robin(list(range(1, 7)), num_courts=2)
        assert result["total_rounds"] == 5


# ===========================================================================
# 2. generate_partial_round_robin
# ===========================================================================

class TestGeneratePartialRoundRobin:
    """Tests for the balanced partial round-robin generator."""

    # -----------------------------------------------------------------------
    # Round count respects max_rounds
    # -----------------------------------------------------------------------

    @pytest.mark.parametrize("max_rounds", [3, 4, 5, 6])
    def test_round_count_respects_max_rounds(self, max_rounds: int):
        """Partial RR must produce exactly max_rounds rounds."""
        player_ids = list(range(1, 9))  # 8 players → 7 full rounds
        result = generate_partial_round_robin(player_ids, num_courts=2, max_rounds=max_rounds)
        assert len(result["rounds"]) == max_rounds
        assert result["total_rounds"] == max_rounds

    def test_max_rounds_at_or_above_full_returns_full(self):
        """When max_rounds >= full RR count, full schedule is returned."""
        player_ids = list(range(1, 7))  # 6 players → 5 full rounds
        result = generate_partial_round_robin(player_ids, num_courts=2, max_rounds=10)
        assert len(result["rounds"]) == 5  # full RR for 6 players

    # -----------------------------------------------------------------------
    # Partnership balance
    # -----------------------------------------------------------------------

    def test_game_count_balance_even_players(self):
        """For 8 players with 5 rounds, max-min game count difference ≤ 1."""
        player_ids = list(range(1, 9))
        result = generate_partial_round_robin(player_ids, num_courts=2, max_rounds=5)
        counts = _game_counts(result["rounds"], player_ids)
        assert max(counts.values()) - min(counts.values()) <= 1, (
            f"Game counts not balanced: {counts}"
        )

    def test_game_count_balance_odd_players(self):
        """For 7 players with 4 rounds, max-min game count difference ≤ 1."""
        player_ids = list(range(1, 8))
        result = generate_partial_round_robin(player_ids, num_courts=2, max_rounds=4)
        counts = _game_counts(result["rounds"], player_ids)
        assert max(counts.values()) - min(counts.values()) <= 1, (
            f"Game counts not balanced: {counts}"
        )

    def test_no_player_sits_out_every_round(self):
        """No player should have 0 games when max_rounds is reasonably large."""
        player_ids = list(range(1, 7))
        result = generate_partial_round_robin(player_ids, num_courts=2, max_rounds=4)
        counts = _game_counts(result["rounds"], player_ids)
        for pid, count in counts.items():
            assert count > 0, f"Player {pid} never plays"

    # -----------------------------------------------------------------------
    # Structure
    # -----------------------------------------------------------------------

    def test_rounds_renumbered_sequentially(self):
        """Round numbers must be 1, 2, … max_rounds in order."""
        player_ids = list(range(1, 9))
        result = generate_partial_round_robin(player_ids, num_courts=2, max_rounds=4)
        for i, rnd in enumerate(result["rounds"]):
            assert rnd["round_num"] == i + 1

    def test_court_assignments_respect_limit_partial(self):
        """Court numbers in partial RR must not exceed num_courts."""
        result = generate_partial_round_robin(
            list(range(1, 9)), num_courts=2, max_rounds=4
        )
        for court in _court_nums(result["rounds"]):
            assert 1 <= court <= 2


# ===========================================================================
# 3. generate_pools_schedule
# ===========================================================================

class TestGeneratePoolsSchedule:
    """Tests for pool-play schedule generation."""

    # -----------------------------------------------------------------------
    # Snake-draft correctness
    # -----------------------------------------------------------------------

    def test_snake_draft_8_players_2_pools(self):
        """
        8 players, 2 pools → snake order:
        Pool 1 gets seeds 1, 4, 5, 8  (positions 0, 3, 4, 7)
        Pool 2 gets seeds 2, 3, 6, 7  (positions 1, 2, 5, 6)
        """
        player_ids = list(range(1, 9))  # seeds 1-8
        pools = _snake_draft(player_ids, num_pools=2)
        assert set(pools[0]) == {1, 4, 5, 8}, f"Pool 1 got {pools[0]}"
        assert set(pools[1]) == {2, 3, 6, 7}, f"Pool 2 got {pools[1]}"

    def test_snake_draft_8_players_2_pools_via_schedule(self):
        """Snake-draft seeding is reflected in generate_pools_schedule's pools map."""
        player_ids = list(range(1, 9))
        result = generate_pools_schedule(player_ids, num_pools=2, num_courts=2, playoff_size=4)
        pool1 = set(result["pools"]["1"])
        pool2 = set(result["pools"]["2"])
        assert pool1 == {1, 4, 5, 8}
        assert pool2 == {2, 3, 6, 7}

    def test_snake_draft_12_players_3_pools(self):
        """
        12 players, 3 pools — verify seeding balance.
        Round 1 (forward): seeds 1→pool1, 2→pool2, 3→pool3
        Round 2 (reverse): seeds 4→pool3, 5→pool2, 6→pool1
        Round 3 (forward): seeds 7→pool1, 8→pool2, 9→pool3
        Round 4 (reverse): seeds 10→pool3, 11→pool2, 12→pool1
        """
        player_ids = list(range(1, 13))
        pools = _snake_draft(player_ids, num_pools=3)
        # Pool 1 should have seeds: 1, 6, 7, 12
        assert set(pools[0]) == {1, 6, 7, 12}, f"Pool 1 got {pools[0]}"
        # Pool 2 should have seeds: 2, 5, 8, 11
        assert set(pools[1]) == {2, 5, 8, 11}, f"Pool 2 got {pools[1]}"
        # Pool 3 should have seeds: 3, 4, 9, 10
        assert set(pools[2]) == {3, 4, 9, 10}, f"Pool 3 got {pools[2]}"

    def test_all_players_assigned_to_exactly_one_pool(self):
        """Every player appears in exactly one pool."""
        player_ids = list(range(1, 13))
        result = generate_pools_schedule(player_ids, num_pools=3, num_courts=3, playoff_size=6)
        seen: List[int] = []
        for pool_players in result["pools"].values():
            seen.extend(pool_players)
        assert sorted(seen) == player_ids

    # -----------------------------------------------------------------------
    # Pool RR rounds
    # -----------------------------------------------------------------------

    def test_each_pool_has_full_rr_rounds(self):
        """Merged rounds should cover all pool RR matchups."""
        player_ids = list(range(1, 9))  # 2 pools of 4 → 3 rounds each
        result = generate_pools_schedule(player_ids, num_pools=2, num_courts=2, playoff_size=4)
        # 4 players per pool → 3 RR rounds; merged rounds should be 3
        assert len(result["rounds"]) == 3

    def test_matches_tagged_with_pool_id(self):
        """Every match in a pools schedule has a pool_id tag."""
        player_ids = list(range(1, 9))
        result = generate_pools_schedule(player_ids, num_pools=2, num_courts=2, playoff_size=4)
        for rnd in result["rounds"]:
            for match in rnd["matches"]:
                assert match.get("pool_id") is not None, (
                    f"Match {match['matchup_id']} missing pool_id"
                )

    def test_pools_map_present_in_result(self):
        """Result includes a pools map keyed by pool id string."""
        player_ids = list(range(1, 9))
        result = generate_pools_schedule(player_ids, num_pools=2, num_courts=2, playoff_size=4)
        assert "pools" in result
        assert "1" in result["pools"]
        assert "2" in result["pools"]

    def test_pool_courts_map_present(self):
        """Result includes a pool_courts map."""
        player_ids = list(range(1, 9))
        result = generate_pools_schedule(player_ids, num_pools=2, num_courts=2, playoff_size=4)
        assert "pool_courts" in result
        assert result["pool_courts"] is not None

    def test_inter_pool_partnerships_never_occur(self):
        """Players from different pools should never partner in pool play."""
        player_ids = list(range(1, 9))
        result = generate_pools_schedule(player_ids, num_pools=2, num_courts=2, playoff_size=4)
        pool1 = set(result["pools"]["1"])
        pool2 = set(result["pools"]["2"])

        for rnd in result["rounds"]:
            for match in rnd["matches"]:
                if match.get("is_bye"):
                    continue
                t1_set = set(match["team1"])
                t2_set = set(match["team2"])
                # Neither team should mix pools
                assert not (t1_set & pool1 and t1_set & pool2), (
                    f"Team1 {match['team1']} spans pools"
                )
                assert not (t2_set & pool1 and t2_set & pool2), (
                    f"Team2 {match['team2']} spans pools"
                )

    def test_within_pool_full_rr_coverage(self):
        """Every player partners with every pool-mate exactly once."""
        player_ids = list(range(1, 9))
        result = generate_pools_schedule(player_ids, num_pools=2, num_courts=2, playoff_size=4)
        pool1 = list(result["pools"]["1"])
        pool2 = list(result["pools"]["2"])

        partnerships = _all_partnerships(result["rounds"])
        pair_counts = Counter(partnerships)

        for pool in [pool1, pool2]:
            expected = {
                (min(a, b), max(a, b)) for a, b in combinations(pool, 2)
            }
            for pair in expected:
                assert pair_counts[pair] == 1, (
                    f"Partnership {pair} appears {pair_counts[pair]} times (expected 1)"
                )


# ===========================================================================
# 4. generate_schedule — format dispatch
# ===========================================================================

class TestGenerateSchedule:
    """Tests for the top-level generate_schedule dispatcher."""

    def test_full_round_robin_dispatch(self):
        """FULL_ROUND_ROBIN format produces a full RR schedule."""
        player_ids = list(range(1, 7))
        result = generate_schedule(player_ids, format="FULL_ROUND_ROBIN", num_courts=2)
        assert result["total_rounds"] == 5  # 6 players → 5 rounds
        assert result["pools"] is None

    def test_partial_round_robin_dispatch(self):
        """PARTIAL_ROUND_ROBIN format caps rounds at max_rounds."""
        player_ids = list(range(1, 9))
        result = generate_schedule(
            player_ids, format="PARTIAL_ROUND_ROBIN", num_courts=2, max_rounds=3
        )
        assert result["total_rounds"] == 3
        assert len(result["rounds"]) == 3

    def test_pools_playoffs_dispatch(self):
        """POOLS_PLAYOFFS format generates pool structure."""
        player_ids = list(range(1, 9))
        result = generate_schedule(
            player_ids, format="POOLS_PLAYOFFS", num_courts=2,
            num_pools=2, playoff_size=4
        )
        assert result.get("pools") is not None
        assert "1" in result["pools"]
        assert "2" in result["pools"]

    def test_unknown_format_raises_value_error(self):
        """Unknown format string must raise ValueError."""
        with pytest.raises(ValueError, match="Unknown format"):
            generate_schedule([1, 2, 3, 4], format="BOGUS_FORMAT", num_courts=1)

    def test_seeds_override_player_order(self):
        """When seeds are provided, they determine the ordering used."""
        # Players 4, 3, 2, 1 passed as seeds → seeded top-to-bottom
        player_ids = [1, 2, 3, 4]
        seeds = [4, 3, 2, 1]
        result = generate_schedule(
            player_ids, format="POOLS_PLAYOFFS", num_courts=2,
            num_pools=2, playoff_size=4, seeds=seeds
        )
        # Pool 1 gets seeds 1&4 of the seeds list = player_ids 4 and 1
        pool1 = set(result["pools"]["1"])
        assert 4 in pool1 and 1 in pool1

    def test_num_rr_cycles_doubles_rounds(self):
        """num_rr_cycles=2 should double the pool-play rounds."""
        player_ids = list(range(1, 7))
        single = generate_schedule(player_ids, format="FULL_ROUND_ROBIN", num_courts=2)
        double = generate_schedule(
            player_ids, format="FULL_ROUND_ROBIN", num_courts=2, num_rr_cycles=2
        )
        assert double["total_rounds"] == single["total_rounds"] * 2

    def test_partial_rr_default_max_rounds_fallback(self):
        """generate_schedule uses max_rounds=5 when not provided for PARTIAL_ROUND_ROBIN."""
        player_ids = list(range(1, 9))
        result = generate_schedule(
            player_ids, format="PARTIAL_ROUND_ROBIN", num_courts=2
        )
        assert result["total_rounds"] == 5


# ===========================================================================
# 5. _validate_score (from kob_service)
# ===========================================================================

class TestValidateScore:
    """Tests for the score validation helper."""

    # -----------------------------------------------------------------------
    # Valid scores — must not raise
    # -----------------------------------------------------------------------

    def test_valid_exact_game_to(self):
        """21-19 is a valid game_to=21 score."""
        _validate_score(21, 19, game_to=21)  # should not raise

    def test_valid_deuce_22_20(self):
        """22-20 is a valid deuce score for game_to=21."""
        _validate_score(22, 20, game_to=21)

    def test_valid_deuce_23_21(self):
        """23-21 is valid — deuce chain can continue."""
        _validate_score(23, 21, game_to=21)

    def test_valid_deuce_reversed_order(self):
        """Score arg order doesn't matter — team2 winning 22-20."""
        _validate_score(20, 22, game_to=21)

    def test_valid_at_cap_28_26(self):
        """28-26 at cap=28 is a valid score (not over cap)."""
        _validate_score(28, 26, game_to=21, score_cap=28)

    def test_valid_cap_ends_game_28_25(self):
        """28-25 at score_cap=28 is valid — cap wins by any margin."""
        _validate_score(28, 25, game_to=21, score_cap=28)

    def test_valid_game_to_11(self):
        """11-9 is valid for game_to=11."""
        _validate_score(11, 9, game_to=11)

    def test_valid_deuce_at_game_to_11(self):
        """12-10 is valid deuce for game_to=11."""
        _validate_score(12, 10, game_to=11)

    def test_valid_game_to_15(self):
        """15-13 is valid for game_to=15."""
        _validate_score(15, 13, game_to=15)

    def test_valid_game_to_7(self):
        """7-5 is valid for game_to=7."""
        _validate_score(7, 5, game_to=7)

    # -----------------------------------------------------------------------
    # Invalid scores — must raise ValueError
    # -----------------------------------------------------------------------

    def test_negative_score_raises(self):
        """Negative scores are rejected."""
        with pytest.raises(ValueError, match="negative"):
            _validate_score(-1, 21, game_to=21)

    def test_negative_team2_score_raises(self):
        """Negative team2 score is rejected."""
        with pytest.raises(ValueError, match="negative"):
            _validate_score(21, -5, game_to=21)

    def test_tied_score_raises(self):
        """Tied scores are rejected."""
        with pytest.raises(ValueError, match="tied"):
            _validate_score(21, 21, game_to=21)

    def test_winning_score_below_game_to_raises(self):
        """Score where winner doesn't reach game_to is rejected."""
        with pytest.raises(ValueError, match="at least"):
            _validate_score(20, 18, game_to=21)

    def test_score_exceeds_cap_raises(self):
        """Score above score_cap is rejected."""
        with pytest.raises(ValueError, match="cap"):
            _validate_score(29, 20, game_to=21, score_cap=28)

    def test_win_by_less_than_2_raises(self):
        """Winning by only 1 when score is at game_to (no cap) is rejected."""
        with pytest.raises(ValueError):
            _validate_score(22, 21, game_to=21)

    def test_deuce_gap_more_than_2_raises(self):
        """When score is over game_to without cap, gap must be exactly 2."""
        with pytest.raises(ValueError):
            _validate_score(24, 21, game_to=21)

    def test_both_scores_zero_raises(self):
        """0-0 is tied and rejected."""
        with pytest.raises(ValueError, match="tied"):
            _validate_score(0, 0, game_to=21)

    @pytest.mark.parametrize("high,low,game_to,cap", [
        (21, 19, 21, None),    # exact game_to, win by 2
        (22, 20, 21, None),    # deuce +1
        (25, 23, 21, None),    # deuce +2
        (28, 27, 21, 28),      # at cap, win by 1 ok
        (28, 20, 21, 28),      # at cap, large margin ok
        (11, 9, 11, None),     # game_to=11
    ])
    def test_parametrized_valid_scores(self, high, low, game_to, cap):
        """Parametrized valid score combinations should not raise."""
        _validate_score(high, low, game_to=game_to, score_cap=cap)

    @pytest.mark.parametrize("high,low,game_to,cap,match", [
        (20, 18, 21, None, "at least"),      # winner below game_to
        (-1, 21, 21, None, "negative"),       # negative score
        (21, 21, 21, None, "tied"),           # tied
        (22, 21, 21, None, ""),               # win by 1 at deuce
        (24, 21, 21, None, ""),               # win by 3 at deuce
        (29, 20, 21, 28, "cap"),              # exceeds cap
    ])
    def test_parametrized_invalid_scores(self, high, low, game_to, cap, match):
        """Parametrized invalid score combinations should raise ValueError."""
        with pytest.raises(ValueError):
            _validate_score(high, low, game_to=game_to, score_cap=cap)


# ===========================================================================
# 6. suggest_defaults
# ===========================================================================

class TestSuggestDefaults:
    """Tests for format/config suggestion logic."""

    # -----------------------------------------------------------------------
    # Without duration constraint
    # -----------------------------------------------------------------------

    def test_small_group_prefers_full_rr(self):
        """≤10 players → FULL_ROUND_ROBIN recommended."""
        result = suggest_defaults(8, num_courts=2)
        assert result["format"] == "FULL_ROUND_ROBIN"

    def test_medium_group_prefers_pools(self):
        """11-12 players → POOLS_PLAYOFFS."""
        result = suggest_defaults(12, num_courts=3)
        assert result["format"] == "POOLS_PLAYOFFS"

    def test_large_group_prefers_pools(self):
        """13+ players → POOLS_PLAYOFFS."""
        result = suggest_defaults(16, num_courts=4)
        assert result["format"] == "POOLS_PLAYOFFS"

    def test_result_contains_required_keys(self):
        """suggest_defaults always returns all required keys."""
        result = suggest_defaults(8, num_courts=2)
        for key in ("format", "num_pools", "playoff_size", "max_rounds", "game_to", "games_per_match"):
            assert key in result, f"Missing key: {key}"

    def test_game_to_default_is_21(self):
        """Default game_to should be 21 when no duration constraint."""
        result = suggest_defaults(8, num_courts=2)
        assert result["game_to"] == 21

    def test_games_per_match_default_is_1(self):
        """Default games_per_match should be 1."""
        result = suggest_defaults(8, num_courts=2)
        assert result["games_per_match"] == 1

    # -----------------------------------------------------------------------
    # With duration constraint
    # -----------------------------------------------------------------------

    def test_with_duration_returns_valid_config(self):
        """Config returned with duration has a valid format and required keys."""
        budget = 120
        result = suggest_defaults(8, num_courts=2, duration_minutes=budget)
        assert "format" in result
        assert result["format"] in (
            "FULL_ROUND_ROBIN", "POOLS_PLAYOFFS", "PARTIAL_ROUND_ROBIN"
        )
        assert "game_to" in result
        assert "games_per_match" in result

    def test_short_duration_does_not_raise(self):
        """Very short duration (60 min) returns some config without crashing."""
        result = suggest_defaults(8, num_courts=2, duration_minutes=60)
        assert "format" in result

    def test_duration_constrained_config_keys(self):
        """Duration-constrained result still has all required keys."""
        result = suggest_defaults(10, num_courts=2, duration_minutes=150)
        for key in ("format", "game_to", "games_per_match"):
            assert key in result


# ===========================================================================
# 7. generate_preview
# ===========================================================================

class TestGeneratePreview:
    """Tests for the preview generator output structure."""

    def test_full_rr_preview_structure(self):
        """FULL_ROUND_ROBIN preview has expected top-level keys."""
        preview = generate_preview(6, num_courts=2, format="FULL_ROUND_ROBIN")
        expected_keys = (
            "format", "total_time_minutes", "estimated_rounds",
            "max_games_per_player", "min_games_per_player",
            "preview_rounds", "explanation",
        )
        for key in expected_keys:
            assert key in preview, f"Missing key: {key}"

    def test_preview_format_matches_input(self):
        """format field in result matches the requested format."""
        preview = generate_preview(6, num_courts=2, format="FULL_ROUND_ROBIN")
        assert preview["format"] == "FULL_ROUND_ROBIN"

    def test_preview_estimated_rounds_positive(self):
        """estimated_rounds must be > 0 for any valid config."""
        preview = generate_preview(6, num_courts=2, format="FULL_ROUND_ROBIN")
        assert preview["estimated_rounds"] > 0

    def test_preview_total_time_positive(self):
        """total_time_minutes must be > 0."""
        preview = generate_preview(6, num_courts=2, format="FULL_ROUND_ROBIN")
        assert preview["total_time_minutes"] > 0

    def test_preview_rounds_list_not_empty(self):
        """preview_rounds must be a non-empty list."""
        preview = generate_preview(6, num_courts=2, format="FULL_ROUND_ROBIN")
        assert isinstance(preview["preview_rounds"], list)
        assert len(preview["preview_rounds"]) > 0

    def test_preview_round_structure(self):
        """Each preview round has required fields."""
        preview = generate_preview(6, num_courts=2, format="FULL_ROUND_ROBIN")
        for rnd in preview["preview_rounds"]:
            for field in ("round_num", "phase", "matches", "time_minutes"):
                assert field in rnd, f"Round missing field: {field}"

    def test_partial_rr_preview_respects_max_rounds(self):
        """Partial RR preview should have pool_play_rounds == max_rounds."""
        preview = generate_preview(
            8, num_courts=2, format="PARTIAL_ROUND_ROBIN", max_rounds=4
        )
        pool_play_rounds = [
            r for r in preview["preview_rounds"] if r["phase"] == "pool_play"
        ]
        assert len(pool_play_rounds) == 4

    def test_pools_preview_includes_pools_map(self):
        """POOLS_PLAYOFFS preview includes preview_pools."""
        preview = generate_preview(
            8, num_courts=2, format="POOLS_PLAYOFFS",
            num_pools=2, playoff_size=4
        )
        assert preview.get("preview_pools") is not None
        assert "1" in preview["preview_pools"]
        assert "2" in preview["preview_pools"]

    def test_invalid_format_raises_value_error(self):
        """Unknown format string raises ValueError."""
        with pytest.raises(ValueError):
            generate_preview(6, num_courts=2, format="INVALID_FORMAT")

    def test_max_gpp_gte_min_gpp(self):
        """max_games_per_player must be >= min_games_per_player."""
        preview = generate_preview(6, num_courts=2, format="FULL_ROUND_ROBIN")
        assert preview["max_games_per_player"] >= preview["min_games_per_player"]

    def test_pools_preview_with_playoffs(self):
        """Preview with playoffs includes playoff rounds."""
        preview = generate_preview(
            8, num_courts=2, format="POOLS_PLAYOFFS",
            num_pools=2, playoff_size=4
        )
        assert preview["playoff_rounds"] > 0

    def test_pools_preview_without_playoffs(self):
        """Preview without playoffs has 0 playoff rounds."""
        preview = generate_preview(
            8, num_courts=2, format="POOLS_PLAYOFFS",
            num_pools=2, playoff_size=None
        )
        assert preview["playoff_rounds"] == 0


# ===========================================================================
# 8. Edge cases
# ===========================================================================

class TestEdgeCases:
    """Edge cases, boundary conditions, and minimum-valid inputs."""

    # -----------------------------------------------------------------------
    # Minimum valid input: 4 players, 1 court
    # -----------------------------------------------------------------------

    def test_minimum_valid_full_rr(self):
        """4 players, 1 court is the minimum valid full RR."""
        result = generate_full_round_robin([1, 2, 3, 4], num_courts=1)
        assert result["total_rounds"] == 3

    def test_minimum_valid_partial_rr(self):
        """4 players, 1 court, max_rounds=2 is valid for partial RR."""
        result = generate_partial_round_robin([1, 2, 3, 4], num_courts=1, max_rounds=2)
        assert len(result["rounds"]) == 2

    def test_minimum_valid_pools(self):
        """8 players, 2 pools, 1 court, playoff_size=4 should not raise."""
        result = generate_pools_schedule(
            list(range(1, 9)), num_pools=2, num_courts=1, playoff_size=4
        )
        assert "rounds" in result

    def test_minimum_valid_preview(self):
        """Preview with 4 players, 1 court, FULL_ROUND_ROBIN should succeed."""
        preview = generate_preview(4, num_courts=1, format="FULL_ROUND_ROBIN")
        assert preview["total_time_minutes"] > 0

    # -----------------------------------------------------------------------
    # Single court scheduling
    # -----------------------------------------------------------------------

    def test_single_court_all_games_on_court_1(self):
        """With 1 court, every match should be on court 1."""
        result = generate_full_round_robin(list(range(1, 7)), num_courts=1)
        for rnd in result["rounds"]:
            for match in rnd["matches"]:
                if not match.get("is_bye"):
                    assert match["court_num"] == 1

    # -----------------------------------------------------------------------
    # Large player counts
    # -----------------------------------------------------------------------

    def test_large_full_rr_10_players(self):
        """10 players → 9 rounds, no duplicate partnerships."""
        player_ids = list(range(1, 11))
        result = generate_full_round_robin(player_ids, num_courts=3)
        assert result["total_rounds"] == 9
        pairs = _all_partnerships(result["rounds"])
        # Verify no duplicate partnerships
        pair_counts = Counter(pairs)
        assert all(v == 1 for v in pair_counts.values()), (
            f"Duplicate partnerships: {[(k, v) for k, v in pair_counts.items() if v > 1]}"
        )

    def test_large_pools_schedule_16_players(self):
        """16 players across 4 pools on 4 courts should not raise."""
        player_ids = list(range(1, 17))
        result = generate_pools_schedule(player_ids, num_pools=4, num_courts=4, playoff_size=8)
        all_pool_players = [
            pid
            for pool_players in result["pools"].values()
            for pid in pool_players
        ]
        assert sorted(all_pool_players) == player_ids

    # -----------------------------------------------------------------------
    # _full_rr_round_count helper
    # -----------------------------------------------------------------------

    @pytest.mark.parametrize("n,expected", [
        (4, 3), (5, 5), (6, 5), (7, 7), (8, 7), (10, 9),
    ])
    def test_full_rr_round_count(self, n: int, expected: int):
        """_full_rr_round_count returns correct round count for N players."""
        assert _full_rr_round_count(n) == expected

    # -----------------------------------------------------------------------
    # Byes tracking
    # -----------------------------------------------------------------------

    def test_byes_per_round_keys_are_strings(self):
        """byes_per_round must use string keys (for JSON serialization)."""
        result = generate_full_round_robin(list(range(1, 6)), num_courts=2)
        for key in result["byes_per_round"]:
            assert isinstance(key, str), f"Non-string key in byes_per_round: {key!r}"

    def test_partial_rr_byes_per_round_keys_are_strings(self):
        """Partial RR byes_per_round must use string keys."""
        result = generate_partial_round_robin(list(range(1, 6)), num_courts=2, max_rounds=3)
        for key in result["byes_per_round"]:
            assert isinstance(key, str)

    # -----------------------------------------------------------------------
    # Matchup ID uniqueness
    # -----------------------------------------------------------------------

    def test_pools_schedule_matchup_ids_unique(self):
        """Matchup IDs across a pools schedule are unique."""
        result = generate_pools_schedule(
            list(range(1, 9)), num_pools=2, num_courts=2, playoff_size=4
        )
        ids = [
            m["matchup_id"]
            for rnd in result["rounds"]
            for m in rnd["matches"]
        ]
        assert len(ids) == len(set(ids)), (
            f"Duplicate matchup IDs found: "
            f"{[mid for mid, cnt in Counter(ids).items() if cnt > 1]}"
        )

    # -----------------------------------------------------------------------
    # Suggest defaults — edge players counts
    # -----------------------------------------------------------------------

    def test_suggest_defaults_4_players(self):
        """4 players returns a usable config."""
        result = suggest_defaults(4, num_courts=1)
        assert result["format"] in ("FULL_ROUND_ROBIN", "PARTIAL_ROUND_ROBIN", "POOLS_PLAYOFFS")

    def test_suggest_defaults_10_players(self):
        """10 players (boundary) returns FULL_ROUND_ROBIN."""
        result = suggest_defaults(10, num_courts=3)
        assert result["format"] == "FULL_ROUND_ROBIN"

    def test_suggest_defaults_11_players(self):
        """11 players (above boundary) returns POOLS_PLAYOFFS."""
        result = suggest_defaults(11, num_courts=2)
        assert result["format"] == "POOLS_PLAYOFFS"

    # -----------------------------------------------------------------------
    # generate_preview — games_per_match=2
    # -----------------------------------------------------------------------

    def test_preview_games_per_match_2(self):
        """games_per_match=2 doubles game counts but not match counts."""
        gpm1 = generate_preview(6, num_courts=2, format="FULL_ROUND_ROBIN", games_per_match=1)
        gpm2 = generate_preview(6, num_courts=2, format="FULL_ROUND_ROBIN", games_per_match=2)
        # Max games per player should roughly double
        assert gpm2["max_games_per_player"] == gpm1["max_games_per_player"] * 2

    # -----------------------------------------------------------------------
    # Court count validation in pools
    # -----------------------------------------------------------------------

    def test_pools_schedule_more_pools_than_courts_allowed(self):
        """More pools than courts is allowed — each pool shares a court."""
        result = generate_pools_schedule(
            list(range(1, 13)), num_pools=3, num_courts=2, playoff_size=6
        )
        # Pool-to-court assignment wraps around: pool3 → court 1, etc.
        courts_used = {m["court_num"] for rnd in result["rounds"] for m in rnd["matches"]}
        assert max(courts_used) <= 2
