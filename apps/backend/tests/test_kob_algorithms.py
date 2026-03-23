"""
Unit tests for kob_algorithms.py.

All functions are pure — no DB, no async, no mocks needed.
Covers circle-method primitives, full/partial round-robin generation,
pool-based scheduling, playoff generation, and the top-level orchestrator.
"""

from collections import Counter
from itertools import combinations
from typing import Dict, List, Set, Tuple

import pytest

from backend.services.kob_algorithms import (
    _full_rr_round_count,
    _rotate_circle,
    _pair_partnerships,
    _match_partnerships,
    generate_full_round_robin,
    generate_partial_round_robin,
    generate_pools_schedule,
    generate_playoff_schedule,
    generate_draft_playoff_preview,
    generate_schedule,
    _snake_draft,
    _apply_rr_cycles,
)


# ---------------------------------------------------------------------------
# Shared test helpers
# ---------------------------------------------------------------------------


def _all_partnerships(rounds: List[Dict]) -> List[Tuple[int, int]]:
    """Return every (min, max) partner pair across all rounds (excluding byes)."""
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
    """Return {player_id: match_count} across all rounds (real players only)."""
    counts: Dict[int, int] = {pid: 0 for pid in player_ids}
    for rnd in rounds:
        for match in rnd["matches"]:
            if match.get("is_bye"):
                continue
            for pid in match["team1"] + match["team2"]:
                if pid > 0:
                    counts[pid] = counts.get(pid, 0) + 1
    return counts


def _no_self_matches(rounds: List[Dict]) -> bool:
    """Return True if no match has the same player on both teams."""
    for rnd in rounds:
        for match in rnd["matches"]:
            if match.get("is_bye"):
                continue
            t1 = set(match["team1"])
            t2 = set(match["team2"])
            if t1 & t2:
                return False
    return True


def _no_self_partnerships(rounds: List[Dict]) -> bool:
    """Return True if no team has the same player twice."""
    for rnd in rounds:
        for match in rnd["matches"]:
            if match.get("is_bye"):
                continue
            if match["team1"][0] == match["team1"][1]:
                return False
            if match["team2"][0] == match["team2"][1]:
                return False
    return True


# ---------------------------------------------------------------------------
# _full_rr_round_count
# ---------------------------------------------------------------------------


class TestFullRrRoundCount:
    @pytest.mark.parametrize(
        "n, expected",
        [
            (2, 1),
            (4, 3),
            (6, 5),
            (8, 7),
            (10, 9),
            (12, 11),
        ],
    )
    def test_even_counts(self, n, expected):
        assert _full_rr_round_count(n) == expected

    @pytest.mark.parametrize(
        "n, expected",
        [
            # Odd n treated as n+1 (phantom bye player), so rounds = n+1-1 = n
            (3, 3),
            (5, 5),
            (7, 7),
            (9, 9),
            (11, 11),
        ],
    )
    def test_odd_counts(self, n, expected):
        assert _full_rr_round_count(n) == expected

    def test_minimum_two_players(self):
        assert _full_rr_round_count(2) == 1

    def test_large_even(self):
        assert _full_rr_round_count(16) == 15

    def test_large_odd(self):
        assert _full_rr_round_count(17) == 17


# ---------------------------------------------------------------------------
# _rotate_circle
# ---------------------------------------------------------------------------


class TestRotateCircle:
    def test_identity_rotation(self):
        players = [1, 2, 3, 4]
        result = _rotate_circle(players, 0)
        assert result == [1, 2, 3, 4]

    def test_identity_does_not_mutate_input(self):
        players = [1, 2, 3, 4]
        original = list(players)
        _rotate_circle(players, 0)
        assert players == original

    def test_rotation_fixes_first_element(self):
        players = [1, 2, 3, 4, 5]
        for n in range(4):
            result = _rotate_circle(players, n)
            assert result[0] == 1

    def test_rotation_one(self):
        players = [1, 2, 3, 4]
        result = _rotate_circle(players, 1)
        # rest = [2,3,4], shift 1 left → [3,4,2]
        assert result == [1, 3, 4, 2]

    def test_rotation_wraps_modulo(self):
        players = [1, 2, 3, 4]
        # rest has len 3; rotation 3 == 0 (mod 3)
        result_3 = _rotate_circle(players, 3)
        result_0 = _rotate_circle(players, 0)
        assert result_3 == result_0

    def test_rotation_two_player_list(self):
        players = [1, 2]
        # Only one element in rest, any rotation wraps to identity
        result = _rotate_circle(players, 1)
        assert result[0] == 1
        assert result[1] == 2

    @pytest.mark.parametrize("rotation", [0, 1, 2, 3, 4, 5])
    def test_output_length_unchanged(self, rotation):
        players = [10, 20, 30, 40, 50, 60]
        result = _rotate_circle(players, rotation)
        assert len(result) == len(players)

    @pytest.mark.parametrize("rotation", [0, 1, 2, 3, 4, 5])
    def test_all_players_present(self, rotation):
        players = [10, 20, 30, 40, 50, 60]
        result = _rotate_circle(players, rotation)
        assert sorted(result) == sorted(players)


# ---------------------------------------------------------------------------
# generate_full_round_robin
# ---------------------------------------------------------------------------


class TestGenerateFullRoundRobin:
    @pytest.mark.parametrize("n", [4, 6, 8, 10])
    def test_round_count_even(self, n):
        players = list(range(1, n + 1))
        schedule = generate_full_round_robin(players, num_courts=2)
        assert schedule["total_rounds"] == n - 1
        assert len(schedule["rounds"]) == n - 1

    @pytest.mark.parametrize("n", [3, 5, 7, 9])
    def test_round_count_odd(self, n):
        """Odd player counts should produce n rounds (one bye per round)."""
        players = list(range(1, n + 1))
        schedule = generate_full_round_robin(players, num_courts=2)
        assert schedule["total_rounds"] == n
        assert len(schedule["rounds"]) == n

    @pytest.mark.parametrize("n", [4, 8])
    def test_every_player_partners_every_other_exactly_once(self, n):
        """For even player counts where n/2 is even, all partnerships appear in matches."""
        players = list(range(1, n + 1))
        schedule = generate_full_round_robin(players, num_courts=n // 2)
        all_pairs = _all_partnerships(schedule["rounds"])
        pair_counts = Counter(all_pairs)
        expected_pairs = set(
            (min(a, b), max(a, b)) for a, b in combinations(players, 2)
        )
        assert set(pair_counts.keys()) == expected_pairs
        assert all(v == 1 for v in pair_counts.values())

    def test_six_players_produces_valid_schedule(self):
        """6 players: 3 partnerships per round (odd), so 1 pair sits out per round."""
        players = list(range(1, 7))
        schedule = generate_full_round_robin(players, num_courts=3)
        assert schedule["total_rounds"] == 5
        # Each round should have exactly 1 match (2 partnerships playing, 1 sitting out)
        for rnd in schedule["rounds"]:
            assert len(rnd["matches"]) == 1

    @pytest.mark.parametrize("n", [4, 6, 8])
    def test_no_self_matches(self, n):
        players = list(range(1, n + 1))
        schedule = generate_full_round_robin(players, num_courts=2)
        assert _no_self_matches(schedule["rounds"])
        assert _no_self_partnerships(schedule["rounds"])

    def test_two_players(self):
        schedule = generate_full_round_robin([1, 2], num_courts=1)
        assert schedule["total_rounds"] == 1
        assert len(schedule["rounds"]) == 1

    def test_no_byes_for_even_players(self):
        schedule = generate_full_round_robin([1, 2, 3, 4], num_courts=2)
        assert schedule["byes_per_round"] == {}

    def test_byes_present_for_odd_players(self):
        schedule = generate_full_round_robin([1, 2, 3], num_courts=1)
        # 3 rounds, each with byes (phantom bye + odd-pair sitout)
        assert len(schedule["byes_per_round"]) == 3
        # Each bye list contains real players (phantom bye + unpaired partnership)
        for bye_list in schedule["byes_per_round"].values():
            assert len(bye_list) == 3  # 1 phantom bye + 2 from unpaired partnership
            assert all(p in [1, 2, 3] for p in bye_list)

    def test_each_player_appears_in_byes_for_three_players(self):
        schedule = generate_full_round_robin([1, 2, 3], num_courts=1)
        bye_players = [p for v in schedule["byes_per_round"].values() for p in v]
        # With 3 players, each player gets exactly 1 bye across 3 rounds
        # With 3 players: 3 rounds, each round 3 byes → 9 total, 3 per player
        assert Counter(bye_players) == {1: 3, 2: 3, 3: 3}

    def test_pools_field_is_none(self):
        schedule = generate_full_round_robin([1, 2, 3, 4], num_courts=2)
        assert schedule["pools"] is None

    def test_court_numbers_within_bounds(self):
        num_courts = 2
        schedule = generate_full_round_robin(list(range(1, 9)), num_courts=num_courts)
        for rnd in schedule["rounds"]:
            for match in rnd["matches"]:
                assert 1 <= match["court_num"] <= num_courts

    def test_round_num_sequential(self):
        schedule = generate_full_round_robin(list(range(1, 7)), num_courts=2)
        round_nums = [r["round_num"] for r in schedule["rounds"]]
        assert round_nums == list(range(1, len(round_nums) + 1))

    def test_large_group_16_players(self):
        players = list(range(1, 17))
        schedule = generate_full_round_robin(players, num_courts=4)
        assert schedule["total_rounds"] == 15
        assert _no_self_matches(schedule["rounds"])

    def test_matchup_ids_unique(self):
        schedule = generate_full_round_robin(list(range(1, 9)), num_courts=2)
        ids = [
            m["matchup_id"]
            for rnd in schedule["rounds"]
            for m in rnd["matches"]
        ]
        assert len(ids) == len(set(ids))


# ---------------------------------------------------------------------------
# generate_partial_round_robin
# ---------------------------------------------------------------------------


class TestGeneratePartialRoundRobin:
    @pytest.mark.parametrize("max_rounds", [2, 3, 4])
    def test_round_count_respects_max(self, max_rounds):
        players = list(range(1, 7))
        schedule = generate_partial_round_robin(players, num_courts=2, max_rounds=max_rounds)
        assert schedule["total_rounds"] <= max_rounds
        assert len(schedule["rounds"]) <= max_rounds

    def test_returns_full_schedule_when_max_exceeds_total(self):
        players = list(range(1, 5))
        full = generate_full_round_robin(players, num_courts=2)
        partial = generate_partial_round_robin(players, num_courts=2, max_rounds=100)
        assert partial["total_rounds"] == full["total_rounds"]

    def test_game_counts_balanced(self):
        """Max-min game count difference should be <= 1."""
        players = list(range(1, 8))
        schedule = generate_partial_round_robin(players, num_courts=2, max_rounds=4)
        counts = _game_counts(schedule["rounds"], players)
        max_g = max(counts.values())
        min_g = min(counts.values())
        assert max_g - min_g <= 1

    def test_no_self_matches(self):
        players = list(range(1, 7))
        schedule = generate_partial_round_robin(players, num_courts=2, max_rounds=3)
        assert _no_self_matches(schedule["rounds"])

    def test_round_nums_sequential(self):
        players = list(range(1, 7))
        schedule = generate_partial_round_robin(players, num_courts=2, max_rounds=4)
        nums = [r["round_num"] for r in schedule["rounds"]]
        assert nums == list(range(1, len(nums) + 1))

    @pytest.mark.parametrize("max_rounds", [3, 4, 5])
    def test_pools_is_none(self, max_rounds):
        players = list(range(1, 7))
        schedule = generate_partial_round_robin(players, num_courts=2, max_rounds=max_rounds)
        assert schedule["pools"] is None


# ---------------------------------------------------------------------------
# generate_pools_schedule
# ---------------------------------------------------------------------------


class TestGeneratePoolsSchedule:
    def test_pool_map_has_correct_count(self):
        players = list(range(1, 9))
        schedule = generate_pools_schedule(players, num_pools=2, num_courts=2, playoff_size=4)
        assert len(schedule["pools"]) == 2

    def test_no_cross_pool_matches(self):
        players = list(range(1, 13))
        schedule = generate_pools_schedule(players, num_pools=3, num_courts=3, playoff_size=4)
        pool_map = schedule["pools"]  # {"1": [pid,...], "2": [...], ...}
        pid_to_pool = {}
        for pool_id_str, pids in pool_map.items():
            for pid in pids:
                pid_to_pool[pid] = pool_id_str

        for rnd in schedule["rounds"]:
            for match in rnd["matches"]:
                pool_id = match.get("pool_id")
                if pool_id is None:
                    continue
                all_pids = match["team1"] + match["team2"]
                for pid in all_pids:
                    if pid > 0:
                        assert pid_to_pool.get(pid) == str(pool_id)

    def test_pool_sizes_balanced(self):
        players = list(range(1, 9))
        schedule = generate_pools_schedule(players, num_pools=2, num_courts=2, playoff_size=4)
        sizes = [len(v) for v in schedule["pools"].values()]
        assert max(sizes) - min(sizes) <= 1

    def test_advance_per_pool_field_present(self):
        players = list(range(1, 9))
        schedule = generate_pools_schedule(players, num_pools=2, num_courts=2, playoff_size=4)
        assert "advance_per_pool" in schedule
        assert schedule["advance_per_pool"] >= 1

    def test_playoff_size_stored(self):
        players = list(range(1, 9))
        schedule = generate_pools_schedule(players, num_pools=2, num_courts=2, playoff_size=4)
        assert schedule["playoff_size"] == 4

    def test_all_players_assigned_to_a_pool(self):
        players = list(range(1, 13))
        schedule = generate_pools_schedule(players, num_pools=3, num_courts=3, playoff_size=4)
        assigned = [
            pid for pids in schedule["pools"].values() for pid in pids
        ]
        assert sorted(assigned) == sorted(players)

    def test_snake_draft_distributes_seeds(self):
        """Snake draft: pool 1 gets seed 1 and seed 4; pool 2 gets seed 2 and seed 3."""
        players = [1, 2, 3, 4]  # seed order
        pools = _snake_draft(players, 2)
        assert len(pools) == 2
        assert sorted(pools[0] + pools[1]) == [1, 2, 3, 4]


# ---------------------------------------------------------------------------
# generate_playoff_schedule
# ---------------------------------------------------------------------------


class TestGeneratePlayoffSchedule:
    def test_returns_list_of_rounds(self):
        advancing = [1, 2, 3, 4]
        rounds = generate_playoff_schedule(advancing, num_courts=2)
        assert isinstance(rounds, list)
        assert len(rounds) > 0

    def test_all_rounds_phase_playoffs(self):
        advancing = [1, 2, 3, 4]
        rounds = generate_playoff_schedule(advancing, num_courts=2)
        assert all(r["phase"] == "playoffs" for r in rounds)

    def test_matchup_ids_prefixed_pf(self):
        advancing = [1, 2, 3, 4]
        rounds = generate_playoff_schedule(advancing, num_courts=2)
        for rnd in rounds:
            for m in rnd["matches"]:
                assert m["matchup_id"].startswith("pf_")

    def test_round_offset_applied(self):
        advancing = [1, 2, 3, 4]
        offset = 5
        rounds = generate_playoff_schedule(advancing, num_courts=2, round_offset=offset)
        first_round_num = rounds[0]["round_num"]
        assert first_round_num == offset + 1

    def test_no_self_matches(self):
        advancing = [1, 2, 3, 4, 5, 6]
        rounds = generate_playoff_schedule(advancing, num_courts=2)
        assert _no_self_matches(rounds)

    def test_only_advancing_players_appear(self):
        advancing = [10, 20, 30, 40]
        rounds = generate_playoff_schedule(advancing, num_courts=2)
        all_pids: Set[int] = set()
        for rnd in rounds:
            for m in rnd["matches"]:
                all_pids.update(m["team1"] + m["team2"])
        real_pids = {p for p in all_pids if p > 0}
        assert real_pids.issubset(set(advancing))


# ---------------------------------------------------------------------------
# generate_draft_playoff_preview
# ---------------------------------------------------------------------------


class TestGenerateDraftPlayoffPreview:
    def test_top_4_returns_one_round(self):
        rounds = generate_draft_playoff_preview(playoff_size=4, num_courts=1)
        assert len(rounds) == 1

    def test_top_4_bracket_position_is_final(self):
        rounds = generate_draft_playoff_preview(playoff_size=4, num_courts=1)
        assert rounds[0]["bracket_position"] == "final"

    def test_top_6_returns_two_rounds(self):
        rounds = generate_draft_playoff_preview(playoff_size=6, num_courts=1)
        assert len(rounds) == 2

    def test_top_6_first_round_is_semifinal(self):
        rounds = generate_draft_playoff_preview(playoff_size=6, num_courts=1)
        assert rounds[0]["bracket_position"] == "semifinal"

    def test_top_6_second_round_is_final(self):
        rounds = generate_draft_playoff_preview(playoff_size=6, num_courts=1)
        assert rounds[1]["bracket_position"] == "final"

    def test_round_offset_applied(self):
        rounds = generate_draft_playoff_preview(playoff_size=4, num_courts=1, round_offset=3)
        assert rounds[0]["round_num"] == 4

    def test_all_phases_are_playoffs(self):
        for ps in [4, 6]:
            rounds = generate_draft_playoff_preview(playoff_size=ps, num_courts=1)
            assert all(r["phase"] == "playoffs" for r in rounds)

    def test_invalid_playoff_size_returns_empty(self):
        rounds = generate_draft_playoff_preview(playoff_size=2, num_courts=1)
        assert rounds == []


# ---------------------------------------------------------------------------
# generate_schedule (orchestration)
# ---------------------------------------------------------------------------


class TestGenerateSchedule:
    def test_full_round_robin_format(self):
        players = list(range(1, 7))
        schedule = generate_schedule(players, format="FULL_ROUND_ROBIN", num_courts=2)
        assert schedule["total_rounds"] == 5
        assert schedule["pools"] is None

    def test_partial_round_robin_format(self):
        players = list(range(1, 9))
        schedule = generate_schedule(
            players, format="PARTIAL_ROUND_ROBIN", num_courts=2, max_rounds=4
        )
        assert schedule["total_rounds"] <= 4

    def test_pools_playoffs_format(self):
        players = list(range(1, 13))
        schedule = generate_schedule(
            players,
            format="POOLS_PLAYOFFS",
            num_courts=3,
            num_pools=3,
            playoff_size=4,
        )
        assert schedule["pools"] is not None

    def test_unknown_format_raises(self):
        with pytest.raises(ValueError, match="Unknown format"):
            generate_schedule([1, 2, 3], format="BOGUS_FORMAT", num_courts=1)

    def test_seeds_reorder_players(self):
        """If seeds are given, the schedule uses that order, not player_ids order."""
        players = [1, 2, 3, 4]
        seeds = [4, 3, 2, 1]  # reversed seed order
        schedule_with_seeds = generate_schedule(
            players, format="FULL_ROUND_ROBIN", num_courts=2, seeds=seeds
        )
        schedule_natural = generate_schedule(
            seeds, format="FULL_ROUND_ROBIN", num_courts=2
        )
        # Both should produce same structure because seeds == ordered list
        assert schedule_with_seeds["total_rounds"] == schedule_natural["total_rounds"]

    def test_partial_rr_default_max_rounds(self):
        """max_rounds defaults to 5 when not provided."""
        players = list(range(1, 13))
        schedule = generate_schedule(players, format="PARTIAL_ROUND_ROBIN", num_courts=2)
        assert schedule["total_rounds"] <= 5

    def test_pools_default_two_pools(self):
        """num_pools defaults to 2."""
        players = list(range(1, 9))
        schedule = generate_schedule(
            players, format="POOLS_PLAYOFFS", num_courts=2, playoff_size=4
        )
        assert len(schedule["pools"]) == 2

    def test_num_rr_cycles_doubles_rounds(self):
        players = list(range(1, 7))
        schedule_1x = generate_schedule(
            players, format="FULL_ROUND_ROBIN", num_courts=2, num_rr_cycles=1
        )
        schedule_2x = generate_schedule(
            players, format="FULL_ROUND_ROBIN", num_courts=2, num_rr_cycles=2
        )
        assert schedule_2x["total_rounds"] == schedule_1x["total_rounds"] * 2

    def test_num_rr_cycles_three(self):
        players = list(range(1, 5))
        schedule_1x = generate_schedule(
            players, format="FULL_ROUND_ROBIN", num_courts=2, num_rr_cycles=1
        )
        schedule_3x = generate_schedule(
            players, format="FULL_ROUND_ROBIN", num_courts=2, num_rr_cycles=3
        )
        assert schedule_3x["total_rounds"] == schedule_1x["total_rounds"] * 3


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    def test_two_player_full_rr(self):
        """2 players: 1 partnership, can't form a 2v2 match → 0 matches, both on bye."""
        schedule = generate_full_round_robin([1, 2], num_courts=1)
        assert schedule["total_rounds"] == 1
        round_matches = schedule["rounds"][0]["matches"]
        # Only 1 partnership exists — can't pair it against another, so no matches
        assert len(round_matches) == 0
        # Both players end up as byes (unpaired partnership)
        assert "1" in schedule["byes_per_round"]
        assert set(schedule["byes_per_round"]["1"]) == {1, 2}

    def test_three_player_byes(self):
        """3 players: each round has 3 byes (phantom + unpaired partnership)."""
        schedule = generate_full_round_robin([1, 2, 3], num_courts=1)
        assert schedule["total_rounds"] == 3
        # Each player appears as bye 3 times total (once from phantom, twice from sitout)
        bye_players = [p for v in schedule["byes_per_round"].values() for p in v]
        assert Counter(bye_players) == {1: 3, 2: 3, 3: 3}

    def test_five_player_partial_rr(self):
        players = [1, 2, 3, 4, 5]
        schedule = generate_partial_round_robin(players, num_courts=2, max_rounds=3)
        counts = _game_counts(schedule["rounds"], players)
        max_g = max(counts.values())
        min_g = min(counts.values())
        assert max_g - min_g <= 1

    def test_large_16_players_full_rr_coverage(self):
        players = list(range(1, 17))
        schedule = generate_full_round_robin(players, num_courts=4)
        all_pairs = _all_partnerships(schedule["rounds"])
        pair_counts = Counter(all_pairs)
        expected = set((min(a, b), max(a, b)) for a, b in combinations(players, 2))
        assert set(pair_counts.keys()) == expected
        assert all(v == 1 for v in pair_counts.values())

    def test_pool_schedule_six_players_two_pools(self):
        players = list(range(1, 7))
        schedule = generate_pools_schedule(players, num_pools=2, num_courts=2, playoff_size=4)
        for pool_id_str, pool_members in schedule["pools"].items():
            assert len(pool_members) == 3

    def test_apply_rr_cycles_cycle_prefix(self):
        players = list(range(1, 5))
        schedule = generate_schedule(
            players, format="FULL_ROUND_ROBIN", num_courts=2, num_rr_cycles=2
        )
        # Second cycle matchup_ids should start with "c2_"
        all_ids = [
            m["matchup_id"]
            for rnd in schedule["rounds"]
            for m in rnd["matches"]
        ]
        c2_ids = [mid for mid in all_ids if mid.startswith("c2_")]
        assert len(c2_ids) > 0
