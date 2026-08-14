"""
KOB pure scoring helpers (no DB access).

Provides the GameSettings named tuple, phase-aware settings resolution,
Bo3 score management, and score validation.
"""

from typing import NamedTuple, Optional

from backend.database.models import KobTournament, KobMatch


class GameSettings(NamedTuple):
    """Phase-aware game settings for scoring."""

    game_to: int
    score_cap: Optional[int]
    games_per_match: int


def _effective_game_settings(
    tournament: KobTournament,
    phase: str,
) -> GameSettings:
    """
    Return phase-aware game settings for scoring.

    Playoff matches use playoff-specific overrides when set,
    falling back to the tournament's base settings.

    Args:
        tournament: KobTournament with config loaded.
        phase: Match phase ("pool_play" or "playoffs").

    Returns:
        GameSettings named tuple with game_to, score_cap, games_per_match.
    """
    if phase == "playoffs":
        return GameSettings(
            game_to=tournament.effective_playoff_game_to,
            score_cap=tournament.effective_playoff_score_cap,
            games_per_match=tournament.effective_playoff_games_per_match,
        )
    return GameSettings(
        game_to=tournament.game_to,
        score_cap=tournament.score_cap,
        games_per_match=tournament.games_per_match or 1,
    )


def _apply_bo3_score(
    match: KobMatch,
    team1_score: int,
    team2_score: int,
    game_index: Optional[int] = None,
) -> None:
    """
    Append or update a game score in a Bo3 match.

    Sets match winner when a team reaches 2 game wins.
    Stores latest game scores on the row-level team1_score/team2_score.

    Args:
        match: The KobMatch to update.
        team1_score: Game score for team 1.
        team2_score: Game score for team 2.
        game_index: If set, update this specific game; otherwise append.

    Raises:
        ValueError: If match already decided or game_index out of range.
    """
    scores = list(match.game_scores or [])
    game_entry = {"team1_score": team1_score, "team2_score": team2_score}

    if game_index is not None:
        # Update a specific game
        if game_index < 0 or game_index >= len(scores):
            raise ValueError(f"game_index {game_index} out of range (0-{len(scores) - 1})")
        scores[game_index] = game_entry
    else:
        # Append new game
        if match.winner is not None:
            raise ValueError("Game already decided")
        if len(scores) >= 3:
            raise ValueError("All 3 games already scored")
        scores.append(game_entry)

    # Count game wins
    t1_wins = sum(1 for g in scores if g["team1_score"] > g["team2_score"])
    t2_wins = sum(1 for g in scores if g["team2_score"] > g["team1_score"])

    # Update JSONB (must reassign for SQLAlchemy to detect change)
    match.game_scores = scores

    # Store latest game scores on the row for display
    match.team1_score = team1_score
    match.team2_score = team2_score

    # Determine series winner
    if t1_wins >= 2:
        match.winner = 1
    elif t2_wins >= 2:
        match.winner = 2
    elif game_index is not None:
        # Re-editing a game might undo a previous decision
        match.winner = None


def _validate_score(
    team1_score: int,
    team2_score: int,
    game_to: int,
    win_by: int = 2,
    score_cap: Optional[int] = None,
) -> None:
    """
    Validate a score against game_to, win_by (always 2), and optional score_cap.

    Rules:
    - Scores cannot be negative or tied.
    - Winning score must be at least game_to.
    - If high == score_cap: just needs high > low (cap ends the game).
    - If high < score_cap (or no cap): must win by at least 2.
    - If high > game_to and high != score_cap: difference must be exactly 2.
    - high cannot exceed score_cap.

    Raises:
        ValueError: If the score is invalid.
    """
    if team1_score < 0 or team2_score < 0:
        raise ValueError("Scores cannot be negative")
    if team1_score == team2_score:
        raise ValueError("Scores cannot be tied")

    high = max(team1_score, team2_score)
    low = min(team1_score, team2_score)

    if high < game_to:
        raise ValueError(f"Winning score must be at least {game_to}")

    if score_cap is not None and high > score_cap:
        raise ValueError(f"Score cannot exceed the cap of {score_cap}")

    if score_cap is not None and high == score_cap:
        # Cap ends the game — just needs high > low
        return

    # Standard win-by-2 rules
    if high - low < 2:
        raise ValueError("Winner must win by at least 2")

    # If over game_to, must be exactly 2 apart (e.g. 22-20 but not 25-20)
    if high > game_to and (high - low) != 2:
        raise ValueError(f"When score exceeds {game_to}, difference must be exactly 2")
