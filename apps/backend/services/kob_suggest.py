"""
KOB format recommendation engine and pills.

Provides smart defaults (suggest_defaults) that pick the best tournament
format given player count, court count, and an optional time budget.
Also generates alternative "pill" recommendations for quick format
switching in the UI.
"""

import logging
from typing import Any, Dict, List, Optional

from backend.services.kob_algorithms import _full_rr_round_count
from backend.services.kob_preview import generate_preview
from backend.services.kob_time import MAX_POOL_PLAY_GPP

logger = logging.getLogger(__name__)


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


def _best_in_tier(candidates: List[Dict]) -> Optional[Dict]:
    """
    Pick the candidate that best fills the time budget.

    Prefer higher game_to (longer, more competitive games) over more
    total games. Break ties with total time usage. Strips internal
    scoring keys (_total_time, _max_gpp) from the winning candidate.

    Args:
        candidates: List of config dicts with _total_time, game_to, and
            _max_gpp scoring keys alongside the public config fields.

    Returns:
        The best candidate dict (internal keys removed), or None if the
        list is empty.
    """
    best = None
    best_score = (-1, -1, -1)
    for c in candidates:
        score = (c["_total_time"], c["game_to"], c["_max_gpp"])
        if score > best_score:
            best_score = score
            best = c
    if best:
        # Strip internal scoring keys before returning
        best.pop("_total_time", None)
        best.pop("_max_gpp", None)
    return best


def _try_config(
    num_players: int,
    num_courts: int,
    duration_minutes: int,
    fmt: str,
    game_to: int,
    games_per_match: int = 1,
    **kwargs,
) -> Optional[Dict]:
    """
    Generate a schedule preview and return a scored config dict if it fits
    within the time budget.

    Pool-play games per player are capped at MAX_POOL_PLAY_GPP to filter
    out exhausting configurations. Playoff games on top are fine -- only
    advancing players play them.

    Args:
        num_players: Total player count.
        num_courts: Available courts.
        duration_minutes: Time budget in minutes.
        fmt: Tournament format string.
        game_to: Target score for the preview.
        games_per_match: Games per matchup slot.
        **kwargs: Additional kwargs forwarded to generate_preview
            (num_pools, playoff_size, playoff_format, max_rounds, etc.).

    Returns:
        Config dict with _total_time and _max_gpp scoring keys, or None if
        the config does not fit the budget or raises a ValueError.
    """
    try:
        preview = generate_preview(
            num_players, num_courts, fmt,
            game_to=game_to, games_per_match=games_per_match, **kwargs,
        )
    except ValueError:
        logger.debug(
            "_try_config: generate_preview raised ValueError for fmt=%s "
            "game_to=%d games_per_match=%d kwargs=%s",
            fmt, game_to, games_per_match, kwargs,
        )
        return None
    total = preview["total_time_minutes"]
    if total > duration_minutes:
        return None

    # Cap pool-play games per player to avoid exhausting tournaments.
    pool_rounds = [r for r in preview["preview_rounds"] if r["phase"] == "pool_play"]
    if pool_rounds:
        player_games: Dict[int, int] = {}
        for rnd in pool_rounds:
            for m in rnd["matches"]:
                for player_id in m["team1"] + m["team2"]:
                    player_games[player_id] = player_games.get(player_id, 0) + games_per_match
        pool_max_gpp = max(player_games.values()) if player_games else 0
        if pool_max_gpp > MAX_POOL_PLAY_GPP:
            return None

    return {
        "format": fmt,
        "game_to": game_to,
        "games_per_match": games_per_match,
        "num_pools": kwargs.get("num_pools"),
        "playoff_size": kwargs.get("playoff_size"),
        "playoff_format": kwargs.get("playoff_format"),
        "max_rounds": kwargs.get("max_rounds"),
        "_total_time": total,
        "_max_gpp": preview["max_games_per_player"],
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
    runs independently on its own court -- no cross-court waiting.

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
    games_per_match_candidates = [1, 2]

    # --- Tier 1: Pools + playoffs (8+ players, 2+ courts) ---
    # Pools are the standard tournament format: each court runs its own
    # schedule independently, so variance in match duration doesn't cascade.
    # Try pool counts in preference order (matching courts first), and
    # return the best config from the first pool count that has any fit.
    #
    # For shorter time budgets (<=150 min), try DRAFT playoffs first -- they
    # use 1 round instead of full RR, which keeps game_to at 21.
    prefer_draft = duration_minutes <= 150
    playoff_formats = ["DRAFT", None] if prefer_draft else [None, "DRAFT"]

    if num_players >= 8 and num_courts >= 2:
        max_pools = min(num_courts, num_players // 4, 6)
        pool_counts = sorted(
            set(range(2, max_pools + 1)),
            key=lambda num_pools: abs(num_pools - num_courts),
        )
        for num_pools in pool_counts:
            # Try with playoffs first; only fall back to no-playoffs
            # if no playoff config fits the budget.
            playoff_candidates = []
            no_playoff_candidates = []
            for game_to in game_to_candidates:
                for games_per_match in games_per_match_candidates:
                    for ps in [4, 6]:
                        if ps > num_players:
                            continue
                        for pf in playoff_formats:
                            c = _try_config(
                                num_players, num_courts, duration_minutes,
                                "POOLS_PLAYOFFS", game_to, games_per_match,
                                num_pools=num_pools, playoff_size=ps,
                                playoff_format=pf,
                            )
                            if c:
                                playoff_candidates.append(c)
                    c = _try_config(
                        num_players, num_courts, duration_minutes,
                        "POOLS_PLAYOFFS", game_to, games_per_match,
                        num_pools=num_pools, playoff_size=None,
                    )
                    if c:
                        no_playoff_candidates.append(c)
            result = _best_in_tier(playoff_candidates)
            if result:
                return result
            result = _best_in_tier(no_playoff_candidates)
            if result:
                return result

    # --- Tier 2: Pools on 1 court (8+ players) ---
    # Still try pools even with 1 court -- less advantage but can work
    pool1_candidates = []
    pool1_no_playoff = []
    if num_players >= 8 and num_courts == 1:
        for num_pools in [2]:
            for game_to in game_to_candidates:
                for games_per_match in games_per_match_candidates:
                    c = _try_config(
                        num_players, num_courts, duration_minutes,
                        "POOLS_PLAYOFFS", game_to, games_per_match,
                        num_pools=num_pools, playoff_size=4,
                    )
                    if c:
                        pool1_candidates.append(c)
                    c = _try_config(
                        num_players, num_courts, duration_minutes,
                        "POOLS_PLAYOFFS", game_to, games_per_match,
                        num_pools=num_pools, playoff_size=None,
                    )
                    if c:
                        pool1_no_playoff.append(c)

    # --- Tier 3: Full RR ---
    rr_candidates = []
    for game_to in game_to_candidates:
        for games_per_match in games_per_match_candidates:
            c = _try_config(
                num_players, num_courts, duration_minutes,
                "FULL_ROUND_ROBIN", game_to, games_per_match,
            )
            if c:
                rr_candidates.append(c)

    # --- Tier 4: Partial RR ---
    partial_candidates = []
    for game_to in game_to_candidates:
        for games_per_match in games_per_match_candidates:
            lo, hi = 3, min(full_rounds - 1, 12)
            best_mr = None
            while lo <= hi:
                mid = (lo + hi) // 2
                try:
                    preview = generate_preview(
                        num_players, num_courts, "PARTIAL_ROUND_ROBIN",
                        max_rounds=mid, game_to=game_to,
                        games_per_match=games_per_match,
                    )
                    if preview["total_time_minutes"] <= duration_minutes:
                        best_mr = mid
                        lo = mid + 1
                    else:
                        hi = mid - 1
                except ValueError:
                    logger.debug(
                        "_suggest_with_duration: generate_preview raised ValueError "
                        "for PARTIAL_ROUND_ROBIN max_rounds=%d game_to=%d "
                        "games_per_match=%d",
                        mid, game_to, games_per_match,
                    )
                    hi = mid - 1
            if best_mr:
                c = _try_config(
                    num_players, num_courts, duration_minutes,
                    "PARTIAL_ROUND_ROBIN", game_to, games_per_match,
                    max_rounds=best_mr,
                )
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
    game_to: int,
    games_per_match: int = 1,
    **kwargs,
) -> Optional[Dict[str, Any]]:
    """
    Try a config via generate_preview; return enriched dict if it fits budget.

    Args:
        num_players: Total player count.
        num_courts: Available courts.
        duration_minutes: Time budget (None = no limit).
        fmt: Tournament format.
        game_to: Game-to target score.
        games_per_match: Games per match.
        **kwargs: num_pools, playoff_size, max_rounds.

    Returns:
        Config dict with total_time_minutes and max_games_per_player, or None.
    """
    try:
        preview = generate_preview(
            num_players, num_courts, fmt,
            game_to=game_to, games_per_match=games_per_match, **kwargs,
        )
    except ValueError:
        logger.debug(
            "_try_pill_config: generate_preview raised ValueError for fmt=%s "
            "game_to=%d games_per_match=%d kwargs=%s",
            fmt, game_to, games_per_match, kwargs,
        )
        return None
    total = preview["total_time_minutes"]
    if duration_minutes and total > duration_minutes:
        return None
    return {
        "format": fmt,
        "game_to": game_to,
        "games_per_match": games_per_match,
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
    for game_to in [28, 21, 15, 11]:
        c = _try_pill_config(
            num_players, num_courts, duration_minutes,
            "FULL_ROUND_ROBIN", game_to, 1,
        )
        if c:
            candidates.append(c)

    # Partial RR — iterate from max rounds down, stop at first fit per game_to
    full_rounds = _full_rr_round_count(num_players)
    for game_to in [28, 21, 15, 11]:
        for mr in range(min(full_rounds - 1, 10), 2, -1):
            c = _try_pill_config(
                num_players, num_courts, duration_minutes,
                "PARTIAL_ROUND_ROBIN", game_to, 1, max_rounds=mr,
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

    Tries pool counts matching courts, with playoffs, games_per_match=1.

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

    for num_pools in range(2, max_pools + 1):
        for game_to in [28, 21, 15, 11]:
            for ps in [4, 6]:
                if ps > num_players:
                    continue
                c = _try_pill_config(
                    num_players, num_courts, duration_minutes,
                    "POOLS_PLAYOFFS", game_to, 1,
                    num_pools=num_pools, playoff_size=ps,
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
# Legacy compat
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
