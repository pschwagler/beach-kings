"""
KOB tournament scheduling algorithm.

Generates round-robin schedules where individual players rotate partners
each round. Uses the circle method (1-factorization) to ensure every
player partners with every other player exactly once in a full round robin.

Schedule data format (JSONB stored on kob_tournaments.schedule_data):
{
    "rounds": [
        {
            "round_num": 1,
            "phase": "pool_play",
            "pool_id": null,
            "matches": [
                {
                    "matchup_id": "r1m1",
                    "court_num": 1,
                    "team1": [player_id_a, player_id_b],
                    "team2": [player_id_c, player_id_d],
                    "is_bye": false
                }
            ]
        }
    ],
    "total_rounds": 7,
    "byes_per_round": {},  // round_num -> [player_ids with byes]
    "pools": {             // only for POOLS_PLAYOFFS
        "1": [pid1, pid2, ...],
        "2": [pid3, pid4, ...]
    }
}
"""

import logging
import math
from typing import List, Dict, Optional, Tuple, Any

logger = logging.getLogger(__name__)


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


# ---------------------------------------------------------------------------
# Time calculation helpers
# ---------------------------------------------------------------------------

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
    Split preview rounds so each round = one time slot (≤ num_courts matches).

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
                chunk = matches[i:i + num_courts]
                result.append({
                    **rnd,
                    "round_num": slot_num,
                    "matches": chunk,
                    "time_minutes": time_per_slot,
                })
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

# Ordered score targets for bumping up/down
_GAME_TO_LADDER = [7, 11, 15, 21, 28]


def _auto_pool_game_to(
    pool_sizes: Dict[int, int],
    base_game_to: int,
) -> Dict[int, int]:
    """
    Auto-calculate per-pool game_to when pool sizes differ.

    If all pools are the same size, every pool uses base_game_to.
    If uneven, the smaller pool bumps up one notch on the ladder
    (e.g. 21→28) so that total play time is roughly balanced.

    Args:
        pool_sizes: {pool_id: num_players_in_pool}.
        base_game_to: Default target score.

    Returns:
        {pool_id: game_to} mapping.
    """
    sizes = list(pool_sizes.values())
    if len(set(sizes)) <= 1:
        # All pools same size — uniform game_to
        return {pid: base_game_to for pid in pool_sizes}

    max_size = max(sizes)
    ladder_idx = (
        _GAME_TO_LADDER.index(base_game_to)
        if base_game_to in _GAME_TO_LADDER
        else 3  # default to 21's index
    )

    result = {}
    for pid, size in pool_sizes.items():
        if size < max_size and ladder_idx < len(_GAME_TO_LADDER) - 1:
            # Smaller pool → bump up one notch for longer games
            result[pid] = _GAME_TO_LADDER[ladder_idx + 1]
        else:
            result[pid] = base_game_to
    return result


# ---------------------------------------------------------------------------
# Smart defaults
# ---------------------------------------------------------------------------

def suggest_defaults(
    num_players: int,
    num_courts: int,
    duration_minutes: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Suggest sensible tournament config defaults given player/court count.

    When duration_minutes is provided, tries to fit the tournament within
    the time budget by adjusting format, game_to, and max_rounds.
    Maximizes games-per-player while staying under budget.

    Args:
        num_players: Total player count.
        num_courts: Available courts.
        duration_minutes: Optional time budget in minutes.

    Returns:
        Dict with format, num_pools, playoff_size, max_rounds, game_to,
        games_per_match.
    """
    if duration_minutes:
        return _suggest_with_duration(num_players, num_courts, duration_minutes)

    base = _suggest_without_duration(num_players, num_courts)
    base["game_to"] = 21
    base["games_per_match"] = 1
    return base


def _suggest_without_duration(
    num_players: int,
    num_courts: int,
) -> Dict[str, Any]:
    """Format suggestion without a time budget."""
    if num_players <= 10:
        return {
            "format": "FULL_ROUND_ROBIN",
            "num_pools": None,
            "playoff_size": None,
            "max_rounds": None,
        }

    if num_players <= 12:
        num_pools = min(num_courts, 3)
        num_pools = max(num_pools, 2)
        return {
            "format": "POOLS_PLAYOFFS",
            "num_pools": num_pools,
            "playoff_size": 4,
            "max_rounds": None,
        }

    # 13+ players — pools + playoffs
    num_pools = min(num_courts, num_players // 4)
    num_pools = max(num_pools, 2)
    num_pools = min(num_pools, 6)
    playoff_size = 6 if num_pools >= 5 else 4
    return {
        "format": "POOLS_PLAYOFFS",
        "num_pools": num_pools,
        "playoff_size": playoff_size,
        "max_rounds": None,
    }


def _suggest_with_duration(
    num_players: int,
    num_courts: int,
    duration_minutes: int,
) -> Dict[str, Any]:
    """
    Find the best tournament config that fits within a time budget.

    Strategy: try pools first (if eligible), then RR formats as fallback.
    Pools are preferred for 8+ players on 2+ courts because each pool
    runs independently on its own court — no cross-court waiting.

    Within each format tier, score by (total_time, max_games_per_player,
    game_to) to fill the time budget and maximize play.

    Args:
        num_players: Total player count.
        num_courts: Available courts.
        duration_minutes: Time budget in minutes.

    Returns:
        Suggested config dict.
    """
    full_rounds = _full_rr_round_count(num_players)
    game_to_candidates = [28, 21, 15, 11]
    gpm_candidates = [1, 2]

    def _best_in_tier(candidates: List[Dict]) -> Optional[Dict]:
        """Pick the candidate that best fills the time budget.

        Prefer higher game_to (longer, more competitive games) over
        more total games. Break ties with total time usage.
        """
        best = None
        best_score = (-1, -1, -1)
        for c in candidates:
            score = (c["_total_time"], c["game_to"], c["_max_gpp"])
            if score > best_score:
                best_score = score
                best = c
        if best:
            # Strip internal scoring keys
            best.pop("_total_time", None)
            best.pop("_max_gpp", None)
        return best

    MAX_POOL_PLAY_GPP = 8  # Don't suggest configs where pool play alone exceeds this

    def _try_config(fmt: str, gt: int, gpm: int = 1, **kwargs) -> Optional[Dict]:
        """Generate preview; return config dict if it fits budget."""
        try:
            preview = generate_preview(
                num_players, num_courts, fmt,
                game_to=gt, games_per_match=gpm, **kwargs,
            )
        except Exception:
            return None
        total = preview["total_time_minutes"]
        if total > duration_minutes:
            return None

        # Cap pool-play games per player to avoid exhausting tournaments.
        # Playoff games on top are fine — only advancing players play them.
        pool_rounds = [r for r in preview["preview_rounds"]
                       if r["phase"] == "pool_play"]
        if pool_rounds:
            player_games: Dict[int, int] = {}
            for rnd in pool_rounds:
                for m in rnd["matches"]:
                    for pid in m["team1"] + m["team2"]:
                        player_games[pid] = player_games.get(pid, 0) + gpm
            pool_max_gpp = max(player_games.values()) if player_games else 0
            if pool_max_gpp > MAX_POOL_PLAY_GPP:
                return None

        return {
            "format": fmt,
            "game_to": gt,
            "games_per_match": gpm,
            "num_pools": kwargs.get("num_pools"),
            "playoff_size": kwargs.get("playoff_size"),
            "playoff_format": kwargs.get("playoff_format"),
            "max_rounds": kwargs.get("max_rounds"),
            "_total_time": total,
            "_max_gpp": preview["max_games_per_player"],
        }

    # --- Tier 1: Pools + playoffs (8+ players, 2+ courts) ---
    # Pools are the standard tournament format: each court runs its own
    # schedule independently, so variance in match duration doesn't cascade.
    # Try pool counts in preference order (matching courts first), and
    # return the best config from the first pool count that has any fit.
    #
    # For shorter time budgets (≤150 min), try DRAFT playoffs first — they
    # use 1 round instead of full RR, which keeps game_to at 21.
    prefer_draft = duration_minutes <= 150
    playoff_formats = ["DRAFT", None] if prefer_draft else [None, "DRAFT"]

    if num_players >= 8 and num_courts >= 2:
        max_pools = min(num_courts, num_players // 4, 6)
        pool_counts = sorted(
            set(range(2, max_pools + 1)),
            key=lambda np: abs(np - num_courts),
        )
        for np_val in pool_counts:
            # Try with playoffs first; only fall back to no-playoffs
            # if no playoff config fits the budget.
            playoff_candidates = []
            no_playoff_candidates = []
            for gt in game_to_candidates:
                for gpm in gpm_candidates:
                    for ps in [4, 6]:
                        if ps > num_players:
                            continue
                        for pf in playoff_formats:
                            c = _try_config("POOLS_PLAYOFFS", gt, gpm,
                                            num_pools=np_val, playoff_size=ps,
                                            playoff_format=pf)
                            if c:
                                playoff_candidates.append(c)
                    c = _try_config("POOLS_PLAYOFFS", gt, gpm,
                                    num_pools=np_val, playoff_size=None)
                    if c:
                        no_playoff_candidates.append(c)
            result = _best_in_tier(playoff_candidates)
            if result:
                return result
            result = _best_in_tier(no_playoff_candidates)
            if result:
                return result

    # --- Tier 2: Pools on 1 court (8+ players) ---
    # Still try pools even with 1 court — less advantage but can work
    pool1_candidates = []
    pool1_no_playoff = []
    if num_players >= 8 and num_courts == 1:
        for np_val in [2]:
            for gt in game_to_candidates:
                for gpm in gpm_candidates:
                    c = _try_config("POOLS_PLAYOFFS", gt, gpm,
                                    num_pools=np_val, playoff_size=4)
                    if c:
                        pool1_candidates.append(c)
                    c = _try_config("POOLS_PLAYOFFS", gt, gpm,
                                    num_pools=np_val, playoff_size=None)
                    if c:
                        pool1_no_playoff.append(c)

    # --- Tier 3: Full RR ---
    rr_candidates = []
    for gt in game_to_candidates:
        for gpm in gpm_candidates:
            c = _try_config("FULL_ROUND_ROBIN", gt, gpm)
            if c:
                rr_candidates.append(c)

    # --- Tier 4: Partial RR ---
    partial_candidates = []
    for gt in game_to_candidates:
        for gpm in gpm_candidates:
            lo, hi = 3, min(full_rounds - 1, 12)
            best_mr = None
            while lo <= hi:
                mid = (lo + hi) // 2
                try:
                    preview = generate_preview(
                        num_players, num_courts, "PARTIAL_ROUND_ROBIN",
                        max_rounds=mid, game_to=gt, games_per_match=gpm,
                    )
                    if preview["total_time_minutes"] <= duration_minutes:
                        best_mr = mid
                        lo = mid + 1
                    else:
                        hi = mid - 1
                except Exception:
                    hi = mid - 1
            if best_mr:
                c = _try_config("PARTIAL_ROUND_ROBIN", gt, gpm,
                                max_rounds=best_mr)
                if c:
                    partial_candidates.append(c)

    # Pick best from remaining tiers: prefer pools-1ct > full RR > partial.
    # No-playoff pool fallback comes after partial RR (only if nothing else fits).
    for tier in [pool1_candidates, rr_candidates, partial_candidates, pool1_no_playoff]:
        result = _best_in_tier(tier)
        if result:
            return result

    # Nothing fits — return minimal config
    return {
        "format": "PARTIAL_ROUND_ROBIN",
        "game_to": 11,
        "games_per_match": 1,
        "num_pools": None,
        "playoff_size": None,
        "max_rounds": 3,
    }


# ---------------------------------------------------------------------------
# Format recommendation pills
# ---------------------------------------------------------------------------


def _try_pill_config(
    num_players: int,
    num_courts: int,
    duration_minutes: Optional[int],
    fmt: str,
    gt: int,
    gpm: int = 1,
    **kwargs,
) -> Optional[Dict[str, Any]]:
    """
    Try a config via generate_preview; return enriched dict if it fits budget.

    Args:
        num_players: Total player count.
        num_courts: Available courts.
        duration_minutes: Time budget (None = no limit).
        fmt: Tournament format.
        gt: Game-to target score.
        gpm: Games per match.
        **kwargs: num_pools, playoff_size, max_rounds.

    Returns:
        Config dict with total_time_minutes and max_games_per_player, or None.
    """
    try:
        preview = generate_preview(
            num_players, num_courts, fmt,
            game_to=gt, games_per_match=gpm, **kwargs,
        )
    except Exception:
        return None
    total = preview["total_time_minutes"]
    if duration_minutes and total > duration_minutes:
        return None
    return {
        "format": fmt,
        "game_to": gt,
        "games_per_match": gpm,
        "num_pools": kwargs.get("num_pools"),
        "playoff_size": kwargs.get("playoff_size"),
        "playoff_format": kwargs.get("playoff_format"),
        "max_rounds": kwargs.get("max_rounds"),
        "total_time_minutes": total,
        "max_games_per_player": preview["max_games_per_player"],
    }


def _pill_label(
    fmt: str,
    num_pools: Optional[int],
    playoff_size: Optional[int],
    max_rounds: Optional[int],
) -> str:
    """
    Generate human-readable label for a format pill.

    Args:
        fmt: Tournament format string.
        num_pools: Number of pools (POOLS_PLAYOFFS only).
        playoff_size: Players advancing to playoffs.
        max_rounds: Round cap (PARTIAL_ROUND_ROBIN only).

    Returns:
        Label string like "2 Pools + Top 4" or "Round Robin (5 rounds)".
    """
    if fmt == "POOLS_PLAYOFFS":
        label = f"{num_pools} Pools"
        if playoff_size:
            label += f" + Top {playoff_size}"
        return label
    if fmt == "PARTIAL_ROUND_ROBIN":
        return f"Round Robin ({max_rounds} rounds)"
    return "Round Robin"


def _make_pill(config: Dict[str, Any], is_recommended: bool = False) -> Dict[str, Any]:
    """
    Convert an enriched config dict to a pill response dict.

    Args:
        config: Config dict from _try_pill_config.
        is_recommended: Whether this is the recommended pill.

    Returns:
        Dict matching KobPillRecommendation schema.
    """
    fmt = config["format"]
    return {
        "label": _pill_label(
            fmt, config.get("num_pools"),
            config.get("playoff_size"), config.get("max_rounds"),
        ),
        "category": "pools" if fmt == "POOLS_PLAYOFFS" else "round_robin",
        "is_recommended": is_recommended,
        "format": fmt,
        "num_pools": config.get("num_pools"),
        "playoff_size": config.get("playoff_size"),
        "max_rounds": config.get("max_rounds"),
        "game_to": config.get("game_to", 21),
        "games_per_match": config.get("games_per_match", 1),
        "playoff_format": config.get("playoff_format"),
        "total_time_minutes": config.get("total_time_minutes", 0),
        "max_games_per_player": config.get("max_games_per_player", 0),
    }


def suggest_alternatives(
    num_players: int,
    num_courts: int,
    duration_minutes: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Return 1-2 format recommendation pills, one per format category.

    Each pill is a lightweight config summary with time/stats for quick
    format switching in the UI. Exactly one pill is marked is_recommended
    (matching suggest_defaults output).

    Args:
        num_players: Total player count.
        num_courts: Available courts.
        duration_minutes: Optional time budget in minutes.

    Returns:
        List of pill dicts matching KobPillRecommendation schema.
    """
    recommended = suggest_defaults(num_players, num_courts, duration_minutes)
    rec_enriched = _try_pill_config(
        num_players, num_courts, None,  # skip budget check — already validated
        recommended["format"],
        recommended.get("game_to", 21),
        recommended.get("games_per_match", 1),
        num_pools=recommended.get("num_pools"),
        playoff_size=recommended.get("playoff_size"),
        max_rounds=recommended.get("max_rounds"),
        playoff_format=recommended.get("playoff_format"),
    )
    if not rec_enriched:
        return []

    pills = [_make_pill(rec_enriched, is_recommended=True)]

    rec_is_pools = recommended["format"] == "POOLS_PLAYOFFS"
    if duration_minutes:
        alt = (
            _find_alt_rr(num_players, num_courts, duration_minutes)
            if rec_is_pools
            else _find_alt_pools(num_players, num_courts, duration_minutes)
        )
    else:
        alt = (
            _alt_rr_no_duration(num_players, num_courts)
            if rec_is_pools
            else _alt_pools_no_duration(num_players, num_courts)
        )

    if alt:
        pills.append(_make_pill(alt, is_recommended=False))

    return pills


def _find_alt_rr(
    num_players: int,
    num_courts: int,
    duration_minutes: int,
) -> Optional[Dict[str, Any]]:
    """
    Find the best round-robin config that fits the duration budget.

    Tries full RR first, then partial RR with decreasing round counts.
    Picks the candidate that best fills the budget.

    Args:
        num_players: Total player count.
        num_courts: Available courts.
        duration_minutes: Time budget in minutes.

    Returns:
        Enriched config dict or None.
    """
    candidates: List[Dict] = []

    # Full RR
    for gt in [28, 21, 15, 11]:
        c = _try_pill_config(
            num_players, num_courts, duration_minutes,
            "FULL_ROUND_ROBIN", gt, 1,
        )
        if c:
            candidates.append(c)

    # Partial RR — iterate from max rounds down, stop at first fit per game_to
    full_rounds = _full_rr_round_count(num_players)
    for gt in [28, 21, 15, 11]:
        for mr in range(min(full_rounds - 1, 10), 2, -1):
            c = _try_pill_config(
                num_players, num_courts, duration_minutes,
                "PARTIAL_ROUND_ROBIN", gt, 1, max_rounds=mr,
            )
            if c:
                candidates.append(c)
                break  # best max_rounds for this game_to

    if not candidates:
        return None
    return max(
        candidates,
        key=lambda c: (c["total_time_minutes"], c["game_to"], c["max_games_per_player"]),
    )


def _find_alt_pools(
    num_players: int,
    num_courts: int,
    duration_minutes: int,
) -> Optional[Dict[str, Any]]:
    """
    Find the best pools config that fits the duration budget.

    Tries pool counts matching courts, with playoffs, gpm=1.

    Args:
        num_players: Total player count.
        num_courts: Available courts.
        duration_minutes: Time budget in minutes.

    Returns:
        Enriched config dict or None.
    """
    if num_players < 8:
        return None

    max_pools = min(num_courts, num_players // 4, 6)
    max_pools = max(max_pools, 2)
    candidates: List[Dict] = []

    for np_val in range(2, max_pools + 1):
        for gt in [28, 21, 15, 11]:
            for ps in [4, 6]:
                if ps > num_players:
                    continue
                c = _try_pill_config(
                    num_players, num_courts, duration_minutes,
                    "POOLS_PLAYOFFS", gt, 1,
                    num_pools=np_val, playoff_size=ps,
                )
                if c:
                    candidates.append(c)

    if not candidates:
        return None
    return max(
        candidates,
        key=lambda c: (c["total_time_minutes"], c["game_to"], c["max_games_per_player"]),
    )


def _alt_rr_no_duration(
    num_players: int,
    num_courts: int,
) -> Optional[Dict[str, Any]]:
    """
    Generate a round-robin alternative when no duration constraint.

    Uses full RR for small player counts, partial RR for larger.

    Args:
        num_players: Total player count.
        num_courts: Available courts.

    Returns:
        Enriched config dict or None.
    """
    if num_players <= 12:
        return _try_pill_config(
            num_players, num_courts, None,
            "FULL_ROUND_ROBIN", 21, 1,
        )
    # Large group — partial RR is more practical
    max_rounds = min(_full_rr_round_count(num_players) - 1, 7)
    return _try_pill_config(
        num_players, num_courts, None,
        "PARTIAL_ROUND_ROBIN", 21, 1, max_rounds=max_rounds,
    )


def _alt_pools_no_duration(
    num_players: int,
    num_courts: int,
) -> Optional[Dict[str, Any]]:
    """
    Generate a pools alternative when no duration constraint.

    Args:
        num_players: Total player count.
        num_courts: Available courts.

    Returns:
        Enriched config dict or None.
    """
    if num_players < 8:
        return None
    num_pools = min(num_courts, num_players // 4, 6)
    num_pools = max(num_pools, 2)
    return _try_pill_config(
        num_players, num_courts, None,
        "POOLS_PLAYOFFS", 21, 1,
        num_pools=num_pools, playoff_size=4,
    )


# ---------------------------------------------------------------------------
# Preview generation
# ---------------------------------------------------------------------------

def generate_preview(
    num_players: int,
    num_courts: int,
    format: str,
    num_pools: Optional[int] = None,
    playoff_size: Optional[int] = None,
    max_rounds: Optional[int] = None,
    games_per_match: int = 1,
    num_rr_cycles: int = 1,
    game_to: int = 21,
    duration_minutes: Optional[int] = None,
    playoff_format: Optional[str] = None,
    playoff_game_to: Optional[int] = None,
    playoff_games_per_match: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Generate a full schedule preview with time estimates.

    Uses placeholder player IDs (1-based) to show what the schedule
    will look like without real players.

    Args:
        num_players: Total player count.
        num_courts: Available courts.
        format: Tournament format (FULL_ROUND_ROBIN, POOLS_PLAYOFFS, PARTIAL_ROUND_ROBIN).
        num_pools: Number of pools (POOLS_PLAYOFFS only).
        playoff_size: Players advancing to playoffs (0/None = no playoffs).
        max_rounds: Cap on rounds (PARTIAL_ROUND_ROBIN only).
        games_per_match: Games per matchup slot (1 or 2).
        num_rr_cycles: How many times to repeat the full RR (1-3).
        game_to: Target score (affects time estimates).
        duration_minutes: Optional time budget.
        playoff_format: "ROUND_ROBIN" (default) or "DRAFT".
        playoff_game_to: Playoff-specific game_to (falls back to game_to).
        playoff_games_per_match: Playoff-specific games_per_match (falls back to games_per_match).

    Returns:
        Dict matching KobFormatRecommendation schema shape.
    """
    placeholder_ids = list(range(1, num_players + 1))

    # Effective playoff settings (fall back to pool play values)
    eff_playoff_format = playoff_format or "ROUND_ROBIN"
    eff_playoff_game_to = playoff_game_to if playoff_game_to is not None else game_to
    eff_playoff_gpm = playoff_games_per_match if playoff_games_per_match is not None else games_per_match

    # Determine if playoffs are active (supported for all formats)
    has_playoffs = playoff_size is not None and playoff_size > 0

    # Generate base schedule
    schedule = generate_schedule(
        player_ids=placeholder_ids,
        format=format,
        num_courts=num_courts,
        num_pools=num_pools,
        max_rounds=max_rounds,
        playoff_size=playoff_size if has_playoffs else None,
        num_rr_cycles=num_rr_cycles,
    )

    pool_play_rounds_data = [
        r for r in schedule["rounds"] if r["phase"] == "pool_play"
    ]

    # If has_playoffs, generate preview playoff rounds
    playoff_rounds_data = []
    if has_playoffs and playoff_size and playoff_size >= 4:
        advancing_ids = list(range(1, playoff_size + 1))
        round_offset = len(pool_play_rounds_data)

        if eff_playoff_format == "DRAFT":
            playoff_rounds_data = generate_draft_playoff_preview(
                playoff_size, num_courts, round_offset=round_offset
            )
        else:
            playoff_rounds_data = generate_playoff_schedule(
                advancing_ids, num_courts, round_offset=round_offset
            )

    all_rounds = pool_play_rounds_data + playoff_rounds_data

    # Build pools map for preview
    preview_pools = None
    if schedule.get("pools"):
        preview_pools = {
            str(k): v for k, v in schedule["pools"].items()
        }

    # Per-pool game_to auto-calculation
    pool_game_to_map: Optional[Dict[int, int]] = None
    resp_pool_courts: Optional[Dict[int, int]] = schedule.get("pool_courts")
    if preview_pools:
        pool_sizes = {
            int(pid): len(players)
            for pid, players in preview_pools.items()
        }
        pool_game_to_map = _auto_pool_game_to(pool_sizes, game_to)

    # Build preview rounds with time info (per-phase game_to / gpm)
    preview_rounds = []
    pool_play_time = 0
    playoff_time = 0

    for rnd in all_rounds:
        is_playoff = rnd["phase"] == "playoffs"
        rnd_gpm = eff_playoff_gpm if is_playoff else games_per_match

        if is_playoff:
            rnd_game_to = eff_playoff_game_to
        elif pool_game_to_map:
            # Use the max per-pool game_to for the merged round time estimate
            # (the round finishes when the slowest pool finishes)
            pool_ids_in_round = set(
                m.get("pool_id") for m in rnd["matches"] if m.get("pool_id")
            )
            if pool_ids_in_round:
                rnd_game_to = max(
                    pool_game_to_map.get(pid, game_to)
                    for pid in pool_ids_in_round
                )
            else:
                rnd_game_to = game_to
        else:
            rnd_game_to = game_to

        round_time = _round_time_minutes(
            len(rnd["matches"]), num_courts, rnd_gpm, rnd_game_to
        )
        byes = schedule.get("byes_per_round", {}).get(str(rnd["round_num"]), [])

        preview_round = {
            "round_num": rnd["round_num"],
            "phase": rnd["phase"],
            "pool_id": rnd.get("pool_id"),
            "matches": [
                {
                    "matchup_id": m["matchup_id"],
                    "court_num": m["court_num"],
                    "team1": m["team1"],
                    "team2": m["team2"],
                    "is_bye": m.get("is_bye", False),
                    "pool_id": m.get("pool_id"),
                }
                for m in rnd["matches"]
            ],
            "byes": byes,
            "time_minutes": round_time,
            "bracket_position": rnd.get("bracket_position"),
            "label": rnd.get("label"),
        }
        preview_rounds.append(preview_round)

        if rnd["phase"] == "pool_play":
            pool_play_time += round_time
        else:
            playoff_time += round_time

    total_time = pool_play_time + playoff_time

    # Stats
    total_matches = sum(len(r["matches"]) for r in all_rounds)
    pool_play_games = sum(len(r["matches"]) for r in pool_play_rounds_data) * games_per_match
    playoff_games = sum(len(r["matches"]) for r in playoff_rounds_data) * eff_playoff_gpm
    total_games = pool_play_games + playoff_games
    min_gpp, max_gpp = _games_per_player_range(all_rounds, num_players, games_per_match)
    gpc = math.ceil(total_games / num_courts) if num_courts > 0 else 0

    pool_play_round_count = len(pool_play_rounds_data)
    playoff_round_count = len(playoff_rounds_data)

    # Build explanation
    explanation = _build_explanation(
        format, num_players, num_courts, num_pools, playoff_size,
        pool_play_round_count, playoff_round_count, total_time,
        games_per_match, num_rr_cycles,
    )

    # Build suggestion
    suggestion = _build_suggestion(
        format, num_players, num_rr_cycles, games_per_match,
        pool_play_round_count, total_time, duration_minutes,
        max_games_per_player=max_gpp, game_to=game_to,
    )

    # Split rounds into time slots — each slot has at most num_courts matches.
    # This makes each preview round = one time slot on the courts.
    preview_rounds = _split_into_time_slots(preview_rounds, num_courts)
    pool_play_round_count = sum(
        1 for r in preview_rounds if r["phase"] == "pool_play"
    )
    playoff_round_count = sum(
        1 for r in preview_rounds if r["phase"] == "playoffs"
    )

    # Serialize pool_game_to and pool_courts with string keys for JSON
    resp_pool_game_to = (
        {str(k): v for k, v in pool_game_to_map.items()}
        if pool_game_to_map else None
    )
    resp_pool_courts_str = (
        {str(k): v for k, v in resp_pool_courts.items()}
        if resp_pool_courts else None
    )

    return {
        "format": format,
        "num_pools": num_pools,
        "playoff_size": playoff_size if has_playoffs else None,
        "max_rounds": max_rounds,
        "game_to": game_to,
        "games_per_match": games_per_match,
        "num_rr_cycles": num_rr_cycles,
        "playoff_format": playoff_format,
        "playoff_game_to": playoff_game_to,
        "playoff_games_per_match": playoff_games_per_match,
        "minutes_per_round": _wave_minutes(game_to, games_per_match),
        "total_time_minutes": total_time,
        "pool_play_time_minutes": pool_play_time,
        "playoff_time_minutes": playoff_time,
        "estimated_rounds": pool_play_round_count + playoff_round_count,
        "pool_play_rounds": pool_play_round_count,
        "playoff_rounds": playoff_round_count,
        "total_matches": total_matches,
        "min_games_per_player": min_gpp,
        "max_games_per_player": max_gpp,
        "games_per_court": gpc,
        "preview_rounds": preview_rounds,
        "preview_pools": preview_pools,
        "pool_game_to": resp_pool_game_to,
        "pool_courts": resp_pool_courts_str,
        "explanation": explanation,
        "suggestion": suggestion,
    }


def _build_explanation(
    format: str,
    num_players: int,
    num_courts: int,
    num_pools: Optional[int],
    playoff_size: Optional[int],
    pool_play_rounds: int,
    playoff_rounds: int,
    total_time: int,
    games_per_match: int,
    num_rr_cycles: int,
) -> str:
    """Build a human-readable summary explanation."""
    hours = total_time // 60
    mins = total_time % 60
    time_str = f"{hours}h {mins}m" if hours else f"{mins}m"

    if format == "FULL_ROUND_ROBIN":
        base = f"Full round robin with {num_players} players"
        if num_rr_cycles > 1:
            base += f" ({num_rr_cycles}x cycles)"
        return f"{base}. {pool_play_rounds} rounds, ~{time_str}."

    if format == "PARTIAL_ROUND_ROBIN":
        return (
            f"Limited rounds — {pool_play_rounds} rounds of play "
            f"with {num_players} players. ~{time_str}."
        )

    if format == "POOLS_PLAYOFFS":
        pool_size = math.ceil(num_players / (num_pools or 2))
        parts = [f"{num_pools} pools of ~{pool_size}"]
        if playoff_size and playoff_size > 0:
            parts.append(f"top {playoff_size} advance to playoffs")
        desc = " → ".join(parts)
        cycle_note = f" ({num_rr_cycles}x cycles)" if num_rr_cycles > 1 else ""
        return f"{desc}{cycle_note}. {pool_play_rounds + playoff_rounds} total rounds, ~{time_str}."

    return f"{pool_play_rounds + playoff_rounds} rounds, ~{time_str}."


def _build_suggestion(
    format: str,
    num_players: int,
    num_rr_cycles: int,
    games_per_match: int,
    pool_play_rounds: int,
    total_time: int,
    duration_minutes: Optional[int],
    max_games_per_player: int = 0,
    game_to: int = 21,
) -> Optional[str]:
    """Build an optional warning when the tournament will be unusually long.

    Uses total points (max_games × game_to) instead of raw game count
    so that 14 games to 11 (154 pts) isn't penalized more than 7 games
    to 21 (147 pts).

    Thresholds calibrated to 21-point games:
    - "Lots of volleyball": 10 games × 21 = 210 points
    - "Consider reducing": 14 games × 21 = 294 points
    """
    def _fmt(mins: int) -> str:
        """Format minutes as 'Xh Ym', e.g. 150 → '2h 30m'."""
        h, m = divmod(int(mins), 60)
        if h == 0:
            return f"{m}m"
        if m == 0:
            return f"{h}h"
        return f"{h}h {m}m"

    # Over time budget (with 30-min grace)
    if duration_minutes and total_time > duration_minutes + 30:
        return f"This format runs ~{_fmt(total_time)} — {_fmt(total_time - duration_minutes)} over your time budget."

    # Generic long-tournament warning (only when no duration set)
    hours = total_time / 60
    if hours > 5 and not duration_minutes:
        return f"Heads up: this format is estimated at {_fmt(total_time)}. Consider fewer players per pool or a shorter game."

    # Points-based intensity warnings
    total_points = max_games_per_player * game_to
    games_equiv = total_points / 21  # equivalent games at 21 pts

    if hours > 3.5 and total_points > 210 and not duration_minutes:
        return (
            f"Each player may play up to ~{games_equiv:.0f} full games worth of volleyball "
            f"over ~{_fmt(total_time)} — that's a lot."
        )

    if total_points > 294:
        return (
            f"Players could play up to {max_games_per_player} games to {game_to} "
            f"(~{games_equiv:.0f} full games equivalent). Consider reducing rounds or games per matchup."
        )

    return None


# ---------------------------------------------------------------------------
# Legacy compat: recommend_format → calls suggest_defaults + generate_preview
# ---------------------------------------------------------------------------

def recommend_format(
    num_players: int,
    num_courts: int,
    duration_minutes: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Legacy wrapper. Use suggest_defaults() + generate_preview() directly.

    Args:
        num_players: Total player count.
        num_courts: Available courts.
        duration_minutes: Estimated time budget (optional).

    Returns:
        Dict matching KobFormatRecommendation schema.
    """
    defaults = suggest_defaults(num_players, num_courts)
    return generate_preview(
        num_players=num_players,
        num_courts=num_courts,
        format=defaults["format"],
        num_pools=defaults["num_pools"],
        playoff_size=defaults["playoff_size"],
        max_rounds=defaults["max_rounds"],
        duration_minutes=duration_minutes,
    )


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
        # Semi: 3rd picks partner from 4th-6th → 2v2 vs remaining 2
        # Final: 1st picks partner from remaining 4 → 2v2 vs remaining 2
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

        # Final: 1st picks partner → 2v2 vs remaining 2
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
# Schedule generation
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

    Playoff rounds (if any) are NOT repeated — they go after all cycles.

    Args:
        schedule: Base schedule dict.
        num_rr_cycles: Total number of cycles (including the original).

    Returns:
        Modified schedule with duplicated pool play rounds.
    """
    pool_play_rounds = [r for r in schedule["rounds"] if r["phase"] == "pool_play"]
    other_rounds = [r for r in schedule["rounds"] if r["phase"] != "pool_play"]

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


def generate_full_round_robin(
    player_ids: List[int],
    num_courts: int,
) -> Dict[str, Any]:
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


def generate_partial_round_robin(
    player_ids: List[int],
    num_courts: int,
    max_rounds: int,
) -> Dict[str, Any]:
    """
    Balanced partial round robin — select max_rounds from a full RR
    with game counts as even as possible (max-min diff ≤ 1).

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

    # --- Step 2: Rebalance via swaps (max-min diff → ≤ 1) ---
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
                # No byes → always fine to pick
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
    Post-process rounds so max-min game count ≤ 1.

    If a player has too many games, swap them out of a match
    and into the bye list, replacing them with an underplayed
    bye player. Safe for partial RR (no coverage guarantee needed).

    Args:
        rounds: Selected rounds (will be mutated).
        byes_per_round: Bye mapping (will be mutated).
        player_ids: All player IDs.

    Returns:
        Tuple of (rounds, byes_per_round) — same objects, mutated.
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

    # Target: floor(total_slots / num_players) or ceil
    total_slots = sum(games.values())
    n = len(player_ids)
    target_lo = total_slots // n
    target_hi = target_lo + (1 if total_slots % n else 0)

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
                    # Swap: over_pid → bye, under_pid → match
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


def generate_pools_schedule(
    player_ids: List[int],
    num_pools: int,
    num_courts: int,
    playoff_size: int,
) -> Dict[str, Any]:
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


def generate_playoff_schedule(
    advancing_player_ids: List[int],
    num_courts: int,
    round_offset: int = 0,
) -> List[Dict[str, Any]]:
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
# Internal helpers
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


def _snake_draft(
    player_ids: List[int],
    num_pools: int,
) -> List[List[int]]:
    """
    Snake-draft players into pools (seed-balanced).

    Seed 1 → pool 1, seed 2 → pool 2, ..., seed N → pool N,
    seed N+1 → pool N, seed N+2 → pool N-1, ... (snake)

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
) -> Tuple[List[Dict[str, Any]], Dict[int, int]]:
    """
    Merge per-pool rounds into unified rounds (concurrent play).

    Pool 1 round 1 + Pool 2 round 1 → merged round 1.
    Assigns each pool a sticky court: pool N → court ((N-1) % num_courts) + 1.
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
        pid: ((pid - 1) % num_courts) + 1
        for pid in range(1, num_pools + 1)
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
