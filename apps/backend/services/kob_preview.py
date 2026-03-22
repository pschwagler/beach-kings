"""
KOB schedule preview generation.

Generates full schedule previews with time estimates, explanations,
and usage warnings. Consumes leaf modules only (kob_time, kob_algorithms)
so it can be safely imported by kob_suggest without circular dependencies.
"""

import math
from typing import Any, Dict, Optional

from backend.services.kob_time import (
    _wave_minutes,
    _round_time_minutes,
    _split_into_time_slots,
    _games_per_player_range,
    _auto_pool_game_to,
)
from backend.services.kob_algorithms import (
    generate_schedule,
    generate_playoff_schedule,
    generate_draft_playoff_preview,
)


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
    eff_playoff_games_per_match = (
        playoff_games_per_match if playoff_games_per_match is not None else games_per_match
    )

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

    pool_play_rounds_data = [r for r in schedule["rounds"] if r["phase"] == "pool_play"]

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
        preview_pools = {str(k): v for k, v in schedule["pools"].items()}

    # Per-pool game_to auto-calculation
    pool_game_to_map: Optional[Dict[int, int]] = None
    resp_pool_courts: Optional[Dict[int, int]] = schedule.get("pool_courts")
    if preview_pools:
        pool_sizes = {
            int(pool_id): len(pool_players) for pool_id, pool_players in preview_pools.items()
        }
        pool_game_to_map = _auto_pool_game_to(pool_sizes, game_to)

    # Build preview rounds with time info (per-phase game_to / games_per_match)
    preview_rounds = []
    pool_play_time = 0
    playoff_time = 0

    for rnd in all_rounds:
        is_playoff = rnd["phase"] == "playoffs"
        rnd_games_per_match = eff_playoff_games_per_match if is_playoff else games_per_match

        if is_playoff:
            rnd_game_to = eff_playoff_game_to
        elif pool_game_to_map:
            # Use the max per-pool game_to for the merged round time estimate
            # (the round finishes when the slowest pool finishes)
            pool_ids_in_round = set(m.get("pool_id") for m in rnd["matches"] if m.get("pool_id"))
            if pool_ids_in_round:
                rnd_game_to = max(
                    pool_game_to_map.get(pool_id, game_to) for pool_id in pool_ids_in_round
                )
            else:
                rnd_game_to = game_to
        else:
            rnd_game_to = game_to

        round_time = _round_time_minutes(
            len(rnd["matches"]), num_courts, rnd_games_per_match, rnd_game_to
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
    playoff_games = (
        sum(len(r["matches"]) for r in playoff_rounds_data) * eff_playoff_games_per_match
    )
    total_games = pool_play_games + playoff_games
    min_gpp, max_gpp = _games_per_player_range(all_rounds, num_players, games_per_match)
    gpc = math.ceil(total_games / num_courts) if num_courts > 0 else 0

    pool_play_round_count = len(pool_play_rounds_data)
    playoff_round_count = len(playoff_rounds_data)

    # Build explanation
    explanation = _build_explanation(
        format,
        num_players,
        num_courts,
        num_pools,
        playoff_size,
        pool_play_round_count,
        playoff_round_count,
        total_time,
        games_per_match,
        num_rr_cycles,
    )

    # Build suggestion
    suggestion = _build_suggestion(
        format,
        num_players,
        num_rr_cycles,
        games_per_match,
        pool_play_round_count,
        total_time,
        duration_minutes,
        max_games_per_player=max_gpp,
        game_to=game_to,
    )

    # Split rounds into time slots — each slot has at most num_courts matches.
    # This makes each preview round = one time slot on the courts.
    preview_rounds = _split_into_time_slots(preview_rounds, num_courts)
    pool_play_round_count = sum(1 for r in preview_rounds if r["phase"] == "pool_play")
    playoff_round_count = sum(1 for r in preview_rounds if r["phase"] == "playoffs")

    # Serialize pool_game_to and pool_courts with string keys for JSON
    resp_pool_game_to = (
        {str(k): v for k, v in pool_game_to_map.items()} if pool_game_to_map else None
    )
    resp_pool_courts_str = (
        {str(k): v for k, v in resp_pool_courts.items()} if resp_pool_courts else None
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
        return (
            f"{desc}{cycle_note}. {pool_play_rounds + playoff_rounds} total rounds, ~{time_str}."
        )

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

    Uses total points (max_games x game_to) instead of raw game count
    so that 14 games to 11 (154 pts) isn't penalized more than 7 games
    to 21 (147 pts).

    Thresholds calibrated to 21-point games:
    - "Lots of volleyball": 10 games x 21 = 210 points
    - "Consider reducing": 14 games x 21 = 294 points
    """

    def _fmt(mins: int) -> str:
        """Format minutes as 'Xh Ym', e.g. 150 -> '2h 30m'."""
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
