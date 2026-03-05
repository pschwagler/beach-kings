"""
KOB pure schedule generation algorithms.

Circle method (1-factorization) for round-robin partnership rotation,
full/partial round-robin generators, pool-based scheduling with snake
draft, playoff round generation, and top-level schedule orchestration.
All functions are pure (no DB).
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Circle method primitives
# ---------------------------------------------------------------------------

def _full_rr_round_count(num_players: int) -> int:
    """Number of rounds in a full RR for N players."""
    n = num_players if num_players % 2 == 0 else num_players + 1
    return n - 1


def _rotate_circle(players: List[int], rotation: int) -> List[int]:
    """
    Circle method rotation: fix player[0], rotate rest.

    For rotation=0, returns original list.
    Each subsequent rotation shifts players[1:] by one position.
    """
    if rotation == 0:
        return list(players)
    fixed = players[0]
    rest = players[1:]
    # Rotate rest left by `rotation` positions
    shift = rotation % len(rest)
    rotated_rest = rest[shift:] + rest[:shift]
    return [fixed] + rotated_rest


def _pair_partnerships(players: List[int]) -> List[Tuple[int, int]]:
    """
    Pair players into partnerships from a circle arrangement.

    Player[0] pairs with player[N-1], player[1] with player[N-2], etc.
    """
    n = len(players)
    pairs = []
    for i in range(n // 2):
        pairs.append((players[i], players[n - 1 - i]))
    return pairs


def _match_partnerships(
    partnerships: List[Tuple[int, int]],
    round_num: int,
    phase: str,
    num_courts: int,
    phantom: Optional[int] = None,
) -> Tuple[List[Dict], List[int]]:
    """
    Create matches by pairing partnerships against each other.

    Filters out partnerships containing the phantom player (bye).

    Args:
        partnerships: List of (playerA, playerB) tuples.
        round_num: Current round number.
        phase: Current phase string.
        num_courts: Available courts.
        phantom: Phantom player ID for bye detection.

    Returns:
        Tuple of (match_dicts, bye_player_ids).
    """
    # Separate real and bye partnerships
    real_pairs = []
    bye_players = []

    for p1, p2 in partnerships:
        if phantom is not None and (p1 == phantom or p2 == phantom):
            # The real player in this pair gets a bye
            real_player = p1 if p2 == phantom else p2
            bye_players.append(real_player)
        else:
            real_pairs.append((p1, p2))

    # Pair partnerships into matches: pair[0] vs pair[1], pair[2] vs pair[3], etc.
    matches = []
    court = 1

    for i in range(0, len(real_pairs) - 1, 2):
        team1 = real_pairs[i]
        team2 = real_pairs[i + 1]
        match_id = f"r{round_num}m{len(matches) + 1}"
        matches.append({
            "matchup_id": match_id,
            "court_num": ((court - 1) % num_courts) + 1,
            "team1": list(team1),
            "team2": list(team2),
            "is_bye": False,
        })
        court += 1

    # If odd number of real pairs, last pair sits out (rare)
    if len(real_pairs) % 2 == 1:
        last_pair = real_pairs[-1]
        bye_players.extend(last_pair)

    return matches, bye_players


# ---------------------------------------------------------------------------
# Full round robin
# ---------------------------------------------------------------------------

def generate_full_round_robin(
    player_ids: List[int],
    num_courts: int,
) -> Dict:
    """
    Full round robin using circle method (1-factorization).

    Every player partners with every other player exactly once.
    With N players, produces N-1 rounds (N if odd, with byes).

    Args:
        player_ids: Ordered player list.
        num_courts: Available courts.

    Returns:
        Schedule data dict.
    """
    players = list(player_ids)
    n = len(players)

    # Odd number: add phantom for bye handling
    phantom = None
    if n % 2 == 1:
        phantom = -1
        players.append(phantom)
        n += 1

    num_rounds = n - 1
    rounds = []
    byes_per_round = {}

    for r in range(num_rounds):
        rotated = _rotate_circle(players, r)
        partnerships = _pair_partnerships(rotated)
        round_matches, round_byes = _match_partnerships(
            partnerships, r + 1, "pool_play", num_courts, phantom
        )
        rounds.append({
            "round_num": r + 1,
            "phase": "pool_play",
            "pool_id": None,
            "matches": round_matches,
        })
        if round_byes:
            byes_per_round[str(r + 1)] = round_byes

    return {
        "rounds": rounds,
        "total_rounds": num_rounds,
        "byes_per_round": byes_per_round,
        "pools": None,
    }


# ---------------------------------------------------------------------------
# Partial round robin
# ---------------------------------------------------------------------------

def generate_partial_round_robin(
    player_ids: List[int],
    num_courts: int,
    max_rounds: int,
) -> Dict:
    """
    Balanced partial round robin -- select max_rounds from a full RR
    with game counts as even as possible (max-min diff <= 1).

    Strategy:
    1. Generate full RR.
    2. Greedy-select rounds that spread byes across different players.
    3. Post-process: swap overplayed players into bye slots so that
       no player's game count differs by more than 1 from any other.

    Args:
        player_ids: Ordered player list.
        num_courts: Available courts.
        max_rounds: Maximum number of rounds to play.

    Returns:
        Schedule data dict.
    """
    full = generate_full_round_robin(player_ids, num_courts)
    total_available = len(full["rounds"])

    if max_rounds >= total_available:
        return full

    # --- Step 1: Greedy round selection for bye balance ---
    selected_indices = _select_balanced_rounds(
        full["rounds"], full["byes_per_round"], max_rounds, player_ids,
    )

    selected_rounds = [full["rounds"][i] for i in selected_indices]
    selected_byes = {}
    for rnd in selected_rounds:
        key = str(rnd["round_num"])
        if key in full["byes_per_round"]:
            selected_byes[key] = full["byes_per_round"][key]

    # --- Step 2: Rebalance via swaps (max-min diff -> <= 1) ---
    selected_rounds, selected_byes = _rebalance_game_counts(
        selected_rounds, selected_byes, player_ids,
    )

    # --- Renumber rounds sequentially ---
    new_byes = {}
    for i, rnd in enumerate(selected_rounds):
        old_key = str(rnd["round_num"])
        rnd["round_num"] = i + 1
        new_key = str(i + 1)
        if old_key in selected_byes:
            new_byes[new_key] = selected_byes[old_key]
        # Also renumber matchup_ids
        for j, m in enumerate(rnd["matches"]):
            m["matchup_id"] = f"r{i + 1}m{j + 1}"

    return {
        "rounds": selected_rounds,
        "total_rounds": max_rounds,
        "byes_per_round": new_byes,
        "pools": None,
    }


def _select_balanced_rounds(
    all_rounds: List[Dict],
    byes_per_round: Dict[str, List[int]],
    target_count: int,
    player_ids: List[int],
) -> List[int]:
    """
    Greedy-select rounds from a full RR to spread byes evenly.

    Heuristic: pick the round whose bye players have the most
    accumulated games so far (i.e., they're "overdue" for a rest).

    Args:
        all_rounds: All rounds from the full RR.
        byes_per_round: Bye mapping from the full RR.
        target_count: How many rounds to select.
        player_ids: All player IDs.

    Returns:
        Sorted list of selected round indices.
    """
    games: Dict[int, int] = {pid: 0 for pid in player_ids}
    selected: List[int] = []
    available = set(range(len(all_rounds)))

    for _ in range(target_count):
        best_idx = -1
        best_score = -1

        for idx in available:
            rnd = all_rounds[idx]
            bye_key = str(rnd["round_num"])
            byes = byes_per_round.get(bye_key, [])

            if byes:
                # Higher score = bye players have more games = good to rest them
                score = sum(games.get(pid, 0) for pid in byes)
            else:
                # No byes -> always fine to pick
                score = float("inf")

            if score > best_score:
                best_score = score
                best_idx = idx

        selected.append(best_idx)
        available.discard(best_idx)

        # Update game counts from the selected round
        rnd = all_rounds[best_idx]
        for m in rnd["matches"]:
            for pid in m["team1"] + m["team2"]:
                if pid > 0:
                    games[pid] = games.get(pid, 0) + 1

    selected.sort()
    return selected


def _rebalance_game_counts(
    rounds: List[Dict],
    byes_per_round: Dict[str, List[int]],
    player_ids: List[int],
) -> Tuple[List[Dict], Dict[str, List[int]]]:
    """
    Post-process rounds so max-min game count <= 1.

    If a player has too many games, swap them out of a match
    and into the bye list, replacing them with an underplayed
    bye player. Safe for partial RR (no coverage guarantee needed).

    Args:
        rounds: Selected rounds (will be mutated).
        byes_per_round: Bye mapping (will be mutated).
        player_ids: All player IDs.

    Returns:
        Tuple of (rounds, byes_per_round) -- same objects, mutated.
    """
    # Count games per player
    games: Dict[int, int] = {pid: 0 for pid in player_ids}
    for rnd in rounds:
        for m in rnd["matches"]:
            for pid in m["team1"] + m["team2"]:
                if pid > 0:
                    games[pid] = games.get(pid, 0) + 1

    if not games:
        return rounds, byes_per_round

    # Iteratively swap until balanced (max 50 iterations as safety)
    for _ in range(50):
        max_g = max(games.values())
        min_g = min(games.values())
        if max_g - min_g <= 1:
            break

        # Find an overplayed player and an underplayed player
        over_pid = max(games, key=games.get)
        under_pid = min(games, key=games.get)

        # Find a round where over_pid plays AND under_pid has a bye
        swapped = False
        for rnd in rounds:
            bye_key = str(rnd["round_num"])
            byes = byes_per_round.get(bye_key, [])

            if under_pid not in byes:
                continue

            # Find the match containing over_pid
            for m in rnd["matches"]:
                if over_pid in m["team1"] or over_pid in m["team2"]:
                    # Swap: over_pid -> bye, under_pid -> match
                    if over_pid in m["team1"]:
                        idx = m["team1"].index(over_pid)
                        m["team1"][idx] = under_pid
                    else:
                        idx = m["team2"].index(over_pid)
                        m["team2"][idx] = under_pid

                    byes.remove(under_pid)
                    byes.append(over_pid)
                    byes_per_round[bye_key] = byes

                    games[over_pid] -= 1
                    games[under_pid] += 1
                    swapped = True
                    break
            if swapped:
                break

        if not swapped:
            # No direct swap possible; try finding any round where
            # over_pid plays and ANYONE with fewer games is on bye
            for rnd in rounds:
                bye_key = str(rnd["round_num"])
                byes = byes_per_round.get(bye_key, [])
                swap_candidate = None
                for bpid in byes:
                    if games.get(bpid, 0) < games[over_pid] - 1:
                        swap_candidate = bpid
                        break
                if swap_candidate is None:
                    continue

                for m in rnd["matches"]:
                    if over_pid in m["team1"] or over_pid in m["team2"]:
                        if over_pid in m["team1"]:
                            idx = m["team1"].index(over_pid)
                            m["team1"][idx] = swap_candidate
                        else:
                            idx = m["team2"].index(over_pid)
                            m["team2"][idx] = swap_candidate
                        byes.remove(swap_candidate)
                        byes.append(over_pid)
                        byes_per_round[bye_key] = byes
                        games[over_pid] -= 1
                        games[swap_candidate] += 1
                        swapped = True
                        break
                if swapped:
                    break

            if not swapped:
                break  # Can't improve further

    return rounds, byes_per_round


# ---------------------------------------------------------------------------
# Pool-based scheduling
# ---------------------------------------------------------------------------

def generate_pools_schedule(
    player_ids: List[int],
    num_pools: int,
    num_courts: int,
    playoff_size: int,
) -> Dict:
    """
    Pool play with optional playoff round.

    Snake-draft players into pools by seed, run full RR within each pool.

    Args:
        player_ids: Seed-ordered player list.
        num_pools: Number of pools.
        num_courts: Available courts.
        playoff_size: Total players advancing to playoffs.

    Returns:
        Schedule data dict.
    """
    pools = _snake_draft(player_ids, num_pools)
    all_rounds = []
    all_byes = {}

    # Generate pool play rounds
    max_pool_rounds = 0
    for pool_idx, pool_players in enumerate(pools):
        pool_id = pool_idx + 1
        pool_schedule = generate_full_round_robin(pool_players, num_courts)
        max_pool_rounds = max(max_pool_rounds, pool_schedule["total_rounds"])

        for rnd in pool_schedule["rounds"]:
            rnd["pool_id"] = pool_id
            # Prefix matchup_ids with pool
            for m in rnd["matches"]:
                m["matchup_id"] = f"p{pool_id}_{m['matchup_id']}"

        all_rounds.extend(pool_schedule["rounds"])
        for k, v in pool_schedule["byes_per_round"].items():
            all_byes[f"p{pool_id}_r{k}"] = v

    # Merge pool rounds so they play concurrently
    merged_rounds, pool_courts = _merge_pool_rounds(
        all_rounds, num_courts, num_pools
    )

    pools_map = {}
    for i, pool in enumerate(pools):
        pools_map[str(i + 1)] = pool

    return {
        "rounds": merged_rounds,
        "total_rounds": len(merged_rounds),
        "byes_per_round": all_byes,
        "pools": pools_map,
        "pool_courts": pool_courts,
        "playoff_size": playoff_size,
        "advance_per_pool": max(1, playoff_size // num_pools),
    }


def _snake_draft(
    player_ids: List[int],
    num_pools: int,
) -> List[List[int]]:
    """
    Snake-draft players into pools (seed-balanced).

    Seed 1 -> pool 1, seed 2 -> pool 2, ..., seed N -> pool N,
    seed N+1 -> pool N, seed N+2 -> pool N-1, ... (snake)

    Args:
        player_ids: Seed-ordered player list.
        num_pools: Number of pools.

    Returns:
        List of pool player lists.
    """
    pools: List[List[int]] = [[] for _ in range(num_pools)]
    forward = True

    for i, pid in enumerate(player_ids):
        if forward:
            pool_idx = i % num_pools
        else:
            pool_idx = num_pools - 1 - (i % num_pools)

        pools[pool_idx].append(pid)

        # Switch direction at the end of each sweep
        if (i + 1) % num_pools == 0:
            forward = not forward

    return pools


def _merge_pool_rounds(
    all_rounds: List[Dict],
    num_courts: int,
    num_pools: int,
) -> Tuple[List[Dict], Dict[int, int]]:
    """
    Merge per-pool rounds into unified rounds (concurrent play).

    Pool 1 round 1 + Pool 2 round 1 -> merged round 1.
    Assigns each pool a sticky court: pool N -> court ((N-1) % num_courts) + 1.
    Tags each match with its pool_id.

    Args:
        all_rounds: Per-pool round dicts (each has pool_id set).
        num_courts: Available courts.
        num_pools: Total number of pools.

    Returns:
        Tuple of (merged_rounds, pool_courts_map).
        pool_courts_map: {pool_id: court_num}.
    """
    # Deterministic court assignment per pool
    pool_courts = {
        pool_id: ((pool_id - 1) % num_courts) + 1
        for pool_id in range(1, num_pools + 1)
    }

    # Group by round_num
    by_round: Dict[int, List[Dict]] = {}
    for rnd in all_rounds:
        rn = rnd["round_num"]
        if rn not in by_round:
            by_round[rn] = []
        by_round[rn].append(rnd)

    merged = []
    for round_num in sorted(by_round.keys()):
        pool_rounds = by_round[round_num]
        all_matches = []
        for pr in pool_rounds:
            pool_id = pr.get("pool_id")
            court = pool_courts.get(pool_id, 1) if pool_id else 1
            for m in pr["matches"]:
                m["court_num"] = court
                m["pool_id"] = pool_id
                all_matches.append(m)
        merged.append({
            "round_num": round_num,
            "phase": "pool_play",
            "pool_id": None,  # merged round spans pools
            "matches": all_matches,
        })

    return merged, pool_courts


# ---------------------------------------------------------------------------
# Playoff round generation
# ---------------------------------------------------------------------------

def generate_playoff_schedule(
    advancing_player_ids: List[int],
    num_courts: int,
    round_offset: int = 0,
) -> List[Dict]:
    """
    Generate playoff RR rounds for advancing players.

    Args:
        advancing_player_ids: Players who qualified.
        num_courts: Available courts.
        round_offset: Starting round number (continues from pool play).

    Returns:
        List of round dicts (to be appended to schedule_data.rounds).
    """
    schedule = generate_full_round_robin(advancing_player_ids, num_courts)
    playoff_rounds = []

    for rnd in schedule["rounds"]:
        rnd["round_num"] += round_offset
        rnd["phase"] = "playoffs"
        for m in rnd["matches"]:
            m["matchup_id"] = f"pf_{m['matchup_id']}"
        playoff_rounds.append(rnd)

    return playoff_rounds


# ---------------------------------------------------------------------------
# Draft playoff bracket preview
# ---------------------------------------------------------------------------

def generate_draft_playoff_preview(
    playoff_size: int,
    num_courts: int,
    round_offset: int = 0,
) -> List[Dict[str, Any]]:
    """
    Generate draft-format playoff preview with bracket positions.

    Top 4: 1 final match (1st-pick team vs 2nd-pick team).
    Top 6: Semi round + Final round (3rd/4th-pick vs 5th/6th-pick semis,
           then top seeds pick from remaining for final).

    Teams use [0, 0] placeholders since partners are draft-determined.

    Args:
        playoff_size: Number of players in playoffs (4 or 6).
        num_courts: Available courts.
        round_offset: Starting round number offset.

    Returns:
        List of round dicts with bracket_position and label metadata.
    """
    rounds = []

    if playoff_size == 4:
        # Top 4: 1st picks a partner, remaining 2 are auto-paired
        rounds.append({
            "round_num": round_offset + 1,
            "phase": "playoffs",
            "pool_id": None,
            "bracket_position": "final",
            "label": "Final — 1st picks partner",
            "matches": [{
                "matchup_id": "pf_bracket_final",
                "court_num": 1,
                "team1": [1, 0],  # 1st seed + picked partner
                "team2": [0, 0],  # remaining 2 auto-paired
                "is_bye": False,
            }],
        })
    elif playoff_size >= 6:
        # Top 6 bracket: 1 match per round, pick-and-play format.
        # Semi: 3rd picks partner from 4th-6th -> 2v2 vs remaining 2
        # Final: 1st picks partner from remaining 4 -> 2v2 vs remaining 2
        rounds.append({
            "round_num": round_offset + 1,
            "phase": "playoffs",
            "pool_id": None,
            "bracket_position": "semifinal",
            "label": "Semifinal — 1st & 2nd have byes",
            "matches": [{
                "matchup_id": "pf_bracket_sf",
                "court_num": 1,
                "team1": [3, 0],  # 3rd picks partner
                "team2": [0, 0],  # remaining 2
                "is_bye": False,
            }],
        })

        # Final: 1st picks partner -> 2v2 vs remaining 2
        rounds.append({
            "round_num": round_offset + 2,
            "phase": "playoffs",
            "pool_id": None,
            "bracket_position": "final",
            "label": "Final",
            "matches": [{
                "matchup_id": "pf_bracket_final",
                "court_num": 1,
                "team1": [1, 0],  # 1st picks partner
                "team2": [0, 0],  # remaining 2
                "is_bye": False,
            }],
        })

    return rounds


# ---------------------------------------------------------------------------
# Schedule generation (top-level orchestration)
# ---------------------------------------------------------------------------

def generate_schedule(
    player_ids: List[int],
    format: str,
    num_courts: int,
    num_pools: Optional[int] = None,
    max_rounds: Optional[int] = None,
    seeds: Optional[List[int]] = None,
    playoff_size: Optional[int] = None,
    num_rr_cycles: int = 1,
) -> Dict[str, Any]:
    """
    Generate a complete tournament schedule.

    Args:
        player_ids: Ordered list of player IDs (order = seeding if seeds not given).
        format: One of FULL_ROUND_ROBIN, POOLS_PLAYOFFS, PARTIAL_ROUND_ROBIN.
        num_courts: Available courts.
        num_pools: Number of pools (POOLS_PLAYOFFS only).
        max_rounds: Cap on rounds (PARTIAL_ROUND_ROBIN only).
        seeds: Explicit seed order (player_ids reordered by seed).
        playoff_size: Number of players advancing to playoffs.
        num_rr_cycles: How many times to repeat the full RR schedule (1-3).

    Returns:
        Schedule data dict (stored as JSONB).
    """
    ordered = seeds if seeds else player_ids

    if format == "FULL_ROUND_ROBIN":
        schedule = generate_full_round_robin(ordered, num_courts)
    elif format == "PARTIAL_ROUND_ROBIN":
        schedule = generate_partial_round_robin(ordered, num_courts, max_rounds or 5)
    elif format == "POOLS_PLAYOFFS":
        schedule = generate_pools_schedule(
            ordered,
            num_pools or 2,
            num_courts,
            playoff_size or 4,
        )
    else:
        raise ValueError(f"Unknown format: {format}")

    # Apply RR cycles if > 1 (duplicate pool play rounds)
    if num_rr_cycles > 1:
        schedule = _apply_rr_cycles(schedule, num_rr_cycles)

    return schedule


def _apply_rr_cycles(
    schedule: Dict[str, Any],
    num_rr_cycles: int,
) -> Dict[str, Any]:
    """
    Duplicate pool_play rounds N times for multiple RR cycles.

    Playoff rounds (if any) are NOT repeated -- they go after all cycles.

    Args:
        schedule: Base schedule dict.
        num_rr_cycles: Total number of cycles (including the original).

    Returns:
        Modified schedule with duplicated pool play rounds.
    """
    pool_play_rounds = [r for r in schedule["rounds"] if r["phase"] == "pool_play"]
    # Deep-copy other_rounds so renumbering does not mutate the original
    # schedule dicts (shared references from the input schedule).
    other_rounds = [dict(r) for r in schedule["rounds"] if r["phase"] != "pool_play"]

    all_pool_rounds = []
    for cycle in range(num_rr_cycles):
        for rnd in pool_play_rounds:
            new_round = {
                "round_num": len(all_pool_rounds) + 1,
                "phase": "pool_play",
                "pool_id": rnd.get("pool_id"),
                "matches": [],
            }
            for m in rnd["matches"]:
                new_match = dict(m)
                # Prefix matchup_id with cycle number (c2_, c3_ etc)
                if cycle > 0:
                    new_match["matchup_id"] = f"c{cycle + 1}_{m['matchup_id']}"
                new_round["matches"].append(new_match)
            all_pool_rounds.append(new_round)

    # Renumber other rounds (playoffs) to come after all pool play
    offset = len(all_pool_rounds)
    for rnd in other_rounds:
        rnd["round_num"] = offset + 1
        offset += 1

    schedule["rounds"] = all_pool_rounds + other_rounds
    schedule["total_rounds"] = len(schedule["rounds"])
    return schedule
