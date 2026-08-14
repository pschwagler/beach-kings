"""
KOB time model constants and helpers.

Provides warmup/game duration constants and utility functions for
estimating round times, splitting preview rounds into time slots,
counting games per player, and auto-calculating per-pool game_to.
"""

import math
from typing import Dict, List, Tuple

# ---------------------------------------------------------------------------
# Shared constants
# ---------------------------------------------------------------------------

#: Sort key used when a player has no explicit seed (pushes unseeded players
#: to the end of any seed-ordered list).
UNSEEDED_SORT_KEY = 999

# ---------------------------------------------------------------------------
# Time model constants
# ---------------------------------------------------------------------------

WARMUP_MINUTES = 10  # warmup per wave of court play

# Game duration (excluding warmup) by game_to target score.
GAME_MINUTES = {
    7: 7,
    11: 10,
    15: 15,
    21: 20,
    28: 30,
}

#: Maximum pool-play games per player that _suggest_with_duration will
#: recommend. Configs exceeding this cap are filtered out to avoid
#: exhausting tournaments.
MAX_POOL_PLAY_GPP = 8

# Ordered score targets for bumping up/down
_GAME_TO_LADDER = [7, 11, 15, 21, 28]


# ---------------------------------------------------------------------------
# Time calculation helpers
# ---------------------------------------------------------------------------


def _wave_minutes(game_to: int = 21, games_per_match: int = 1) -> int:
    """
    Minutes per wave of court play.

    One wave = one rotation of teams onto courts. Each team warms up
    once, then plays all their games back-to-back.

    Args:
        game_to: Target score (determines per-game duration).
        games_per_match: Games played per matchup (1 or 2).

    Returns:
        Minutes for one wave.
    """
    game_mins = GAME_MINUTES.get(game_to, 20)
    return WARMUP_MINUTES + (game_mins * games_per_match)


def _round_time_minutes(
    num_matches: int,
    num_courts: int,
    games_per_match: int,
    game_to: int = 21,
) -> int:
    """
    Time for one round: matches run in parallel across courts.

    Each wave = one rotation of teams onto courts (warmup once,
    then play games_per_match games back-to-back). If more matches
    than courts, multiple waves are needed.

    Args:
        num_matches: Number of matches in the round.
        num_courts: Available courts.
        games_per_match: How many games per matchup slot.
        game_to: Target score (determines game duration).

    Returns:
        Estimated minutes for this round.
    """
    if num_matches == 0:
        return 0
    wave_mins = _wave_minutes(game_to, games_per_match)
    waves = math.ceil(num_matches / num_courts)
    return waves * wave_mins


def _split_into_time_slots(
    preview_rounds: List[Dict],
    num_courts: int,
) -> List[Dict]:
    """
    Split preview rounds so each round = one time slot (<=num_courts matches).

    If a round has more matches than courts, split into multiple
    sequential rounds. Renumbers rounds sequentially and divides
    time_minutes proportionally.

    Args:
        preview_rounds: Preview round dicts with matches and time_minutes.
        num_courts: Available courts.

    Returns:
        Potentially expanded list of preview rounds.
    """
    result = []
    slot_num = 1
    for rnd in preview_rounds:
        matches = rnd["matches"]
        # Never split bracket rounds (draft playoffs) — they're conceptual units
        if rnd.get("bracket_position") or len(matches) <= num_courts:
            result.append({**rnd, "round_num": slot_num})
            slot_num += 1
        else:
            # Split into chunks of num_courts
            num_slots = math.ceil(len(matches) / num_courts)
            time_per_slot = rnd["time_minutes"] // num_slots if num_slots else 0
            for i in range(0, len(matches), num_courts):
                chunk = matches[i : i + num_courts]
                result.append(
                    {
                        **rnd,
                        "round_num": slot_num,
                        "matches": chunk,
                        "time_minutes": time_per_slot,
                    }
                )
                slot_num += 1
    return result


def _games_per_player_range(
    all_rounds: List[Dict],
    num_players: int,
    games_per_match: int,
) -> Tuple[int, int]:
    """
    Min and max games per player across all rounds.

    Args:
        all_rounds: List of round dicts with "matches" key.
        num_players: Total player count.
        games_per_match: Games per matchup slot.

    Returns:
        Tuple of (min_games, max_games).
    """
    counts: Dict[int, int] = {}
    for rnd in all_rounds:
        for m in rnd["matches"]:
            if not m.get("is_bye", False):
                for pid in m["team1"] + m["team2"]:
                    if pid > 0:
                        counts[pid] = counts.get(pid, 0) + 1
    # Players not in any match get 0
    for pid in range(1, num_players + 1):
        counts.setdefault(pid, 0)
    if not counts:
        return 0, 0
    values = list(counts.values())
    return min(values) * games_per_match, max(values) * games_per_match


# ---------------------------------------------------------------------------
# Per-pool game_to auto-calculation
# ---------------------------------------------------------------------------


def _auto_pool_game_to(
    pool_sizes: Dict[int, int],
    base_game_to: int,
) -> Dict[int, int]:
    """
    Auto-calculate per-pool game_to when pool sizes differ.

    If all pools are the same size, every pool uses base_game_to.
    If uneven, the smaller pool bumps up one notch on the ladder
    (e.g. 21->28) so that total play time is roughly balanced.

    Args:
        pool_sizes: {pool_id: num_players_in_pool}.
        base_game_to: Default target score.

    Returns:
        {pool_id: game_to} mapping.
    """
    sizes = list(pool_sizes.values())
    if len(set(sizes)) <= 1:
        # All pools same size — uniform game_to
        return {pool_id: base_game_to for pool_id in pool_sizes}

    max_size = max(sizes)
    ladder_idx = (
        _GAME_TO_LADDER.index(base_game_to)
        if base_game_to in _GAME_TO_LADDER
        else 3  # default to 21's index
    )

    result = {}
    for pool_id, size in pool_sizes.items():
        if size < max_size and ladder_idx < len(_GAME_TO_LADDER) - 1:
            # Smaller pool -> bump up one notch for longer games
            result[pool_id] = _GAME_TO_LADDER[ladder_idx + 1]
        else:
            result[pool_id] = base_game_to
    return result
