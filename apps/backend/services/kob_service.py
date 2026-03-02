"""
KOB (King/Queen of the Beach) tournament service.

Handles tournament CRUD, player management, scheduling, scoring,
standings calculation, and round advancement.
"""

import hashlib
import logging
import secrets
import string
from datetime import date
from typing import List, Dict, NamedTuple, Optional, Any

from sqlalchemy import select, delete, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.database.models import (
    KobTournament,
    KobPlayer,
    KobMatch,
    Player,
    TournamentStatus,
    TournamentFormat,
)
from backend.services import kob_scheduler

logger = logging.getLogger(__name__)

CODE_ALPHABET = string.ascii_uppercase + string.digits
CODE_LENGTH = 6
MIN_TOURNAMENT_PLAYERS = 4
# Re-exported from kob_scheduler for backwards compatibility within this module.
UNSEEDED_SORT_KEY = kob_scheduler.UNSEEDED_SORT_KEY


class GameSettings(NamedTuple):
    """Phase-aware game settings for scoring."""

    game_to: int
    score_cap: Optional[int]
    games_per_match: int


# ---------------------------------------------------------------------------
# Code generation
# ---------------------------------------------------------------------------

def _generate_code() -> str:
    """Generate a unique tournament code like 'KOB-A3X9R2'."""
    suffix = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
    return f"KOB-{suffix}"


async def _ensure_unique_code(session: AsyncSession) -> str:
    """Generate a code that doesn't collide with existing tournaments."""
    for _ in range(10):
        code = _generate_code()
        exists = await session.execute(
            select(KobTournament.id).where(KobTournament.code == code)
        )
        if not exists.scalar_one_or_none():
            return code
    raise ValueError("Failed to generate unique tournament code — please try again")


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

async def create_tournament(
    session: AsyncSession,
    director_player_id: int,
    data: dict,
) -> KobTournament:
    """
    Create a new KOB tournament.

    Args:
        session: Database session.
        director_player_id: Player ID of the tournament director.
        data: Tournament config fields from KobTournamentCreate schema.

    Returns:
        Created KobTournament instance.
    """
    code = await _ensure_unique_code(session)

    scheduled_date = None
    if data.get("scheduled_date"):
        scheduled_date = date.fromisoformat(data["scheduled_date"])

    tournament = KobTournament(
        name=data["name"],
        code=code,
        director_player_id=director_player_id,
        gender=data["gender"],
        format=TournamentFormat(data.get("format", "FULL_ROUND_ROBIN")),
        game_to=data.get("game_to", 21),
        win_by=2,
        num_courts=data.get("num_courts", 2),
        max_rounds=data.get("max_rounds"),
        has_playoffs=data.get("has_playoffs", False),
        playoff_size=data.get("playoff_size"),
        num_pools=data.get("num_pools"),
        games_per_match=data.get("games_per_match", 1),
        num_rr_cycles=data.get("num_rr_cycles", 1),
        score_cap=data.get("score_cap"),
        playoff_format=data.get("playoff_format"),
        playoff_game_to=data.get("playoff_game_to"),
        playoff_games_per_match=data.get("playoff_games_per_match"),
        playoff_score_cap=data.get("playoff_score_cap"),
        is_ranked=data.get("is_ranked", False),
        league_id=data.get("league_id"),
        location_id=data.get("location_id"),
        auto_advance=data.get("auto_advance", True),
        scheduled_date=scheduled_date,
        status=TournamentStatus.SETUP,
    )
    session.add(tournament)
    await session.flush()
    await session.refresh(tournament)
    return tournament


async def get_tournament(
    session: AsyncSession,
    tournament_id: int,
) -> Optional[KobTournament]:
    """
    Get a tournament by ID with players and matches eager-loaded.

    Args:
        session: Database session.
        tournament_id: Tournament ID.

    Returns:
        KobTournament or None.
    """
    result = await session.execute(
        select(KobTournament)
        .options(
            selectinload(KobTournament.kob_players).selectinload(KobPlayer.player),
            selectinload(KobTournament.kob_matches),
            selectinload(KobTournament.director),
        )
        .where(KobTournament.id == tournament_id)
    )
    return result.scalar_one_or_none()


async def get_tournament_by_code(
    session: AsyncSession,
    code: str,
) -> Optional[KobTournament]:
    """
    Get a tournament by its shareable code with eager-loaded relations.

    Args:
        session: Database session.
        code: Tournament code (e.g. "KOB-A3X9R2").

    Returns:
        KobTournament or None.
    """
    result = await session.execute(
        select(KobTournament)
        .options(
            selectinload(KobTournament.kob_players).selectinload(KobPlayer.player),
            selectinload(KobTournament.kob_matches),
            selectinload(KobTournament.director),
        )
        .where(KobTournament.code == code)
    )
    return result.scalar_one_or_none()


async def update_tournament(
    session: AsyncSession,
    tournament_id: int,
    director_player_id: int,
    data: dict,
) -> KobTournament:
    """
    Update tournament config (only allowed in SETUP status).

    Args:
        session: Database session.
        tournament_id: Tournament ID.
        director_player_id: Must match director.
        data: Fields to update from KobTournamentUpdate schema.

    Returns:
        Updated KobTournament.

    Raises:
        ValueError: If tournament not found, not director, or not in SETUP.
    """
    tournament = await get_tournament(session, tournament_id)
    if not tournament:
        raise ValueError("Tournament not found")
    if tournament.director_player_id != director_player_id:
        raise ValueError("Only the director can update this tournament")
    if tournament.status != TournamentStatus.SETUP:
        raise ValueError("Can only update tournaments in SETUP status")

    for key, value in data.items():
        if value is not None and hasattr(tournament, key):
            if key == "format":
                setattr(tournament, key, TournamentFormat(value))
            elif key == "scheduled_date":
                setattr(tournament, key, date.fromisoformat(value) if value else None)
            else:
                setattr(tournament, key, value)

    await session.flush()
    await session.refresh(tournament)
    return tournament


async def delete_tournament(
    session: AsyncSession,
    tournament_id: int,
    director_player_id: int,
) -> None:
    """
    Delete a tournament (cascades to players and matches).

    Args:
        session: Database session.
        tournament_id: Tournament ID.
        director_player_id: Must match director.

    Raises:
        ValueError: If not found or not director.
    """
    tournament = await get_tournament(session, tournament_id)
    if not tournament:
        raise ValueError("Tournament not found")
    if tournament.director_player_id != director_player_id:
        raise ValueError("Only the director can delete this tournament")
    if tournament.status != TournamentStatus.SETUP:
        raise ValueError("Can only delete tournaments in SETUP status")
    await session.delete(tournament)
    await session.flush()


# ---------------------------------------------------------------------------
# Player management
# ---------------------------------------------------------------------------

async def add_player(
    session: AsyncSession,
    tournament_id: int,
    player_id: int,
    seed: Optional[int] = None,
) -> KobPlayer:
    """
    Add a player to a tournament roster.

    Args:
        session: Database session.
        tournament_id: Tournament ID.
        player_id: Player to add.
        seed: Optional seed number.

    Returns:
        Created KobPlayer entry.

    Raises:
        ValueError: If tournament not in SETUP or player already added.
    """
    tournament = await get_tournament(session, tournament_id)
    if not tournament:
        raise ValueError("Tournament not found")
    if tournament.status != TournamentStatus.SETUP:
        raise ValueError("Can only add players during SETUP")

    # Validate player exists
    player_exists = await session.execute(
        select(Player.id).where(Player.id == player_id)
    )
    if not player_exists.scalar_one_or_none():
        raise ValueError(f"Player {player_id} not found")

    # Check for duplicate
    existing = await session.execute(
        select(KobPlayer).where(
            and_(
                KobPlayer.tournament_id == tournament_id,
                KobPlayer.player_id == player_id,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError("Player is already in this tournament")

    # Auto-assign seed if not provided
    if seed is None:
        result = await session.execute(
            select(func.count(KobPlayer.id)).where(
                KobPlayer.tournament_id == tournament_id
            )
        )
        seed = result.scalar() + 1

    entry = KobPlayer(
        tournament_id=tournament_id,
        player_id=player_id,
        seed=seed,
    )
    session.add(entry)
    await session.flush()
    await session.refresh(entry)
    return entry


async def remove_player(
    session: AsyncSession,
    tournament_id: int,
    player_id: int,
) -> None:
    """
    Remove a player from a tournament roster (SETUP only).

    Args:
        session: Database session.
        tournament_id: Tournament ID.
        player_id: Player to remove.

    Raises:
        ValueError: If not in SETUP status.
    """
    tournament = await get_tournament(session, tournament_id)
    if not tournament:
        raise ValueError("Tournament not found")
    if tournament.status != TournamentStatus.SETUP:
        raise ValueError("Can only remove players during SETUP")

    await session.execute(
        delete(KobPlayer).where(
            and_(
                KobPlayer.tournament_id == tournament_id,
                KobPlayer.player_id == player_id,
            )
        )
    )
    await session.flush()


async def reorder_seeds(
    session: AsyncSession,
    tournament_id: int,
    player_ids: List[int],
) -> None:
    """
    Reorder player seeds. Position in list = seed number.

    Args:
        session: Database session.
        tournament_id: Tournament ID.
        player_ids: Ordered list of player IDs (index 0 = seed 1).

    Raises:
        ValueError: If tournament not in SETUP or unknown player IDs provided.
    """
    tournament = await get_tournament(session, tournament_id)
    if not tournament:
        raise ValueError("Tournament not found")
    if tournament.status != TournamentStatus.SETUP:
        raise ValueError("Can only reorder seeds during SETUP")

    # Bulk-load all entries in one query
    entry_map = {kp.player_id: kp for kp in tournament.kob_players}

    # Validate all provided IDs exist in tournament
    unknown = set(player_ids) - set(entry_map.keys())
    if unknown:
        raise ValueError(f"Unknown player IDs: {unknown}")

    for idx, pid in enumerate(player_ids):
        entry_map[pid].seed = idx + 1

    await session.flush()


async def drop_player(
    session: AsyncSession,
    tournament_id: int,
    player_id: int,
) -> None:
    """
    Drop a player from an active tournament. Their future matches become byes.

    Args:
        session: Database session.
        tournament_id: Tournament ID.
        player_id: Player to drop.

    Raises:
        ValueError: If tournament not active.
    """
    tournament = await get_tournament(session, tournament_id)
    if not tournament:
        raise ValueError("Tournament not found")
    if tournament.status != TournamentStatus.ACTIVE:
        raise ValueError("Can only drop players from active tournaments")

    result = await session.execute(
        select(KobPlayer).where(
            and_(
                KobPlayer.tournament_id == tournament_id,
                KobPlayer.player_id == player_id,
            )
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise ValueError("Player not in this tournament")

    entry.is_dropped = True
    entry.dropped_at_round = tournament.current_round

    # Mark unscored current + future matches involving this player as byes
    result = await session.execute(
        select(KobMatch).where(
            and_(
                KobMatch.tournament_id == tournament_id,
                KobMatch.winner.is_(None),
                KobMatch.round_num >= tournament.current_round,
            )
        )
    )
    future_matches = result.scalars().all()
    for match in future_matches:
        players_in_match = [
            match.team1_player1_id, match.team1_player2_id,
            match.team2_player1_id, match.team2_player2_id,
        ]
        if player_id in players_in_match:
            match.is_bye = True
            # Auto-score: team without dropped player wins default score
            if player_id in [match.team1_player1_id, match.team1_player2_id]:
                match.team1_score = 0
                match.team2_score = tournament.game_to
                match.winner = 2
            else:
                match.team1_score = tournament.game_to
                match.team2_score = 0
                match.winner = 1

    await session.flush()


# ---------------------------------------------------------------------------
# Schedule + Start
# ---------------------------------------------------------------------------

async def start_tournament(
    session: AsyncSession,
    tournament_id: int,
    director_player_id: int,
) -> KobTournament:
    """
    Lock roster, generate schedule, create round 1 matches, and start.

    Args:
        session: Database session.
        tournament_id: Tournament ID.
        director_player_id: Must match director.

    Returns:
        Updated KobTournament with schedule_data and ACTIVE status.

    Raises:
        ValueError: If not director, not SETUP, or too few players.
    """
    tournament = await get_tournament(session, tournament_id)
    if not tournament:
        raise ValueError("Tournament not found")
    if tournament.director_player_id != director_player_id:
        raise ValueError("Only the director can start the tournament")
    if tournament.status != TournamentStatus.SETUP:
        raise ValueError("Tournament is not in SETUP status")

    # Get player IDs ordered by seed
    players = sorted(tournament.kob_players, key=lambda p: p.seed or UNSEEDED_SORT_KEY)
    if len(players) < MIN_TOURNAMENT_PLAYERS:
        raise ValueError("Need at least 4 players to start a tournament")

    player_ids = [p.player_id for p in players]

    # Generate schedule
    schedule_data = kob_scheduler.generate_schedule(
        player_ids=player_ids,
        format=tournament.format.value,
        num_courts=tournament.num_courts,
        num_pools=tournament.num_pools,
        max_rounds=tournament.max_rounds,
        playoff_size=tournament.playoff_size,
        num_rr_cycles=tournament.num_rr_cycles or 1,
    )

    tournament.schedule_data = schedule_data
    tournament.status = TournamentStatus.ACTIVE
    tournament.current_round = 1
    tournament.current_phase = "pool_play"

    # Assign pools if applicable
    if schedule_data.get("pools"):
        for pool_id_str, pool_pids in schedule_data["pools"].items():
            pool_id = int(pool_id_str)
            for pid in pool_pids:
                result = await session.execute(
                    select(KobPlayer).where(
                        and_(
                            KobPlayer.tournament_id == tournament_id,
                            KobPlayer.player_id == pid,
                        )
                    )
                )
                entry = result.scalar_one_or_none()
                if entry:
                    entry.pool_id = pool_id

    # Create match rows for all scheduled rounds
    await _create_matches_from_schedule(session, tournament)

    await session.flush()
    await session.refresh(tournament)
    return tournament


async def _create_matches_from_schedule(
    session: AsyncSession,
    tournament: KobTournament,
) -> None:
    """Create KobMatch rows for all rounds in the schedule."""
    if not tournament.schedule_data or "rounds" not in tournament.schedule_data:
        return

    for rnd in tournament.schedule_data["rounds"]:
        for m in rnd["matches"]:
            match = KobMatch(
                tournament_id=tournament.id,
                matchup_id=m["matchup_id"],
                round_num=rnd["round_num"],
                phase=rnd.get("phase", "pool_play"),
                pool_id=rnd.get("pool_id"),
                court_num=m.get("court_num"),
                team1_player1_id=m["team1"][0],
                team1_player2_id=m["team1"][1],
                team2_player1_id=m["team2"][0],
                team2_player2_id=m["team2"][1],
                bracket_position=rnd.get("bracket_position"),
                is_bye=m.get("is_bye", False),
            )
            session.add(match)


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

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


async def submit_score(
    session: AsyncSession,
    tournament_id: int,
    matchup_id: str,
    team1_score: int,
    team2_score: int,
    game_index: Optional[int] = None,
) -> KobMatch:
    """
    Submit a score for a match (public — anyone with the link can score).

    Phase-aware: uses playoff game_to/cap for playoff matches.
    Bo3-aware: when games_per_match == 3, appends to game_scores JSONB array
    and only sets winner when a team reaches 2 game wins.

    Args:
        session: Database session.
        tournament_id: Tournament ID.
        matchup_id: Match identifier (e.g. "r1m1").
        team1_score: Team 1 score.
        team2_score: Team 2 score.
        game_index: For Bo3 updates — which game to update (0-based). None = append new game.

    Returns:
        Updated KobMatch.

    Raises:
        ValueError: If match not found, already scored, or invalid score.
    """
    tournament = await get_tournament(session, tournament_id)
    if not tournament:
        raise ValueError("Tournament not found")
    if tournament.status != TournamentStatus.ACTIVE:
        raise ValueError("Tournament is not active")

    # Row-level lock to prevent concurrent double-scoring
    result = await session.execute(
        select(KobMatch)
        .where(
            and_(
                KobMatch.tournament_id == tournament_id,
                KobMatch.matchup_id == matchup_id,
            )
        )
        .with_for_update()
    )
    match = result.scalar_one_or_none()
    if not match:
        raise ValueError("Match not found")
    if match.is_bye:
        raise ValueError("Cannot score a bye match")
    if match.round_num != tournament.current_round:
        raise ValueError(
            f"Match is in round {match.round_num}, "
            f"but tournament is in round {tournament.current_round}"
        )

    # Phase-aware settings
    settings = _effective_game_settings(tournament, match.phase)

    # Validate the individual game score
    _validate_score(
        team1_score, team2_score, settings.game_to,
        score_cap=settings.score_cap,
    )

    if settings.games_per_match >= 3:
        # Bo3 scoring — manage game_scores array
        _apply_bo3_score(match, team1_score, team2_score, game_index)
    else:
        # Single-game scoring (existing behavior)
        if match.winner is not None:
            raise ValueError("Match already scored")
        match.team1_score = team1_score
        match.team2_score = team2_score
        match.winner = 1 if team1_score > team2_score else 2
        match.game_scores = [{"team1_score": team1_score, "team2_score": team2_score}]

    await session.flush()

    # Check if round is complete for auto-advance
    if tournament.auto_advance and match.winner is not None:
        round_complete = await check_round_complete(
            session, tournament_id, match.round_num
        )
        if round_complete:
            await advance_round(session, tournament_id)

    await session.refresh(match)
    return match


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
            raise ValueError("Match already decided")
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


async def update_score(
    session: AsyncSession,
    tournament_id: int,
    matchup_id: str,
    team1_score: int,
    team2_score: int,
    game_index: Optional[int] = None,
) -> KobMatch:
    """
    Director override to edit a score.

    Phase-aware and Bo3-aware.

    Args:
        session: Database session.
        tournament_id: Tournament ID.
        matchup_id: Match identifier.
        team1_score: Corrected team 1 score.
        team2_score: Corrected team 2 score.
        game_index: For Bo3 — which game to update (0-based).

    Returns:
        Updated KobMatch.
    """
    tournament = await get_tournament(session, tournament_id)
    if not tournament:
        raise ValueError("Tournament not found")

    result = await session.execute(
        select(KobMatch).where(
            and_(
                KobMatch.tournament_id == tournament_id,
                KobMatch.matchup_id == matchup_id,
            )
        )
    )
    match = result.scalar_one_or_none()
    if not match:
        raise ValueError("Match not found")

    settings = _effective_game_settings(tournament, match.phase)

    _validate_score(
        team1_score, team2_score, settings.game_to,
        score_cap=settings.score_cap,
    )

    if settings.games_per_match >= 3 and game_index is not None:
        # Bo3 — update specific game
        _apply_bo3_score(match, team1_score, team2_score, game_index)
    else:
        # Single-game edit
        match.team1_score = team1_score
        match.team2_score = team2_score
        match.winner = 1 if team1_score > team2_score else 2
        match.game_scores = [{"team1_score": team1_score, "team2_score": team2_score}]

    await session.flush()
    await session.refresh(match)
    return match


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
        raise ValueError(
            f"When score exceeds {game_to}, difference must be exactly 2"
        )


# ---------------------------------------------------------------------------
# Round advancement
# ---------------------------------------------------------------------------

async def check_round_complete(
    session: AsyncSession,
    tournament_id: int,
    round_num: int,
) -> bool:
    """
    Check if all non-bye matches in a round have been scored.

    Args:
        session: Database session.
        tournament_id: Tournament ID.
        round_num: Round number to check.

    Returns:
        True if all matches are scored.
    """
    result = await session.execute(
        select(func.count(KobMatch.id)).where(
            and_(
                KobMatch.tournament_id == tournament_id,
                KobMatch.round_num == round_num,
                KobMatch.is_bye.is_(False),
                KobMatch.team1_score.is_(None),
            )
        )
    )
    unscored = result.scalar()
    return unscored == 0


async def advance_round(
    session: AsyncSession,
    tournament_id: int,
) -> KobTournament:
    """
    Advance to the next round (or to playoffs, or complete).

    Args:
        session: Database session.
        tournament_id: Tournament ID.

    Returns:
        Updated KobTournament.
    """
    tournament = await get_tournament(session, tournament_id)
    if not tournament:
        raise ValueError("Tournament not found")
    if tournament.status != TournamentStatus.ACTIVE:
        raise ValueError("Tournament is not active")

    schedule = tournament.schedule_data
    if not schedule:
        raise ValueError("No schedule data")

    current_round = tournament.current_round or 1
    total_rounds = schedule["total_rounds"]

    # Check if we need to transition to playoffs
    if (
        tournament.has_playoffs
        and tournament.current_phase == "pool_play"
        and current_round >= total_rounds
    ):
        await _advance_to_playoffs(session, tournament)
        return tournament

    # Draft bracket: after semi round, create final match with winners
    if (
        tournament.current_phase == "playoffs"
        and tournament.effective_playoff_format == "DRAFT"
    ):
        advanced = await _try_advance_draft_bracket(session, tournament)
        if advanced:
            return tournament

    # Check if tournament is complete
    if current_round >= total_rounds:
        tournament.status = TournamentStatus.COMPLETED
        await session.flush()
        await session.refresh(tournament)
        return tournament

    # Advance to next round
    tournament.current_round = current_round + 1
    await session.flush()
    await session.refresh(tournament)
    return tournament


async def _advance_to_playoffs(
    session: AsyncSession,
    tournament: KobTournament,
) -> None:
    """
    Compute pool standings, generate playoff schedule, create matches.

    Branches on playoff_format:
    - ROUND_ROBIN (default): existing full RR playoff behavior.
    - DRAFT: auto-populate teams by seed, single-elimination bracket.

    Args:
        session: Database session.
        tournament: Active tournament.
    """
    schedule = tournament.schedule_data
    pools = schedule.get("pools", {})
    advance_per_pool = schedule.get("advance_per_pool", 2)

    # Get advancing players from pool standings
    advancing = []
    if pools:
        for pool_id_str, pool_pids in pools.items():
            pool_standings = await get_standings(
                session, tournament.id, pool_id=int(pool_id_str)
            )
            for entry in pool_standings[:advance_per_pool]:
                advancing.append(entry["player_id"])
    else:
        # No pools — use overall standings
        standings = await get_standings(session, tournament.id, phase="pool_play")
        playoff_size = tournament.playoff_size or 4
        advancing = [s["player_id"] for s in standings[:playoff_size]]

    if len(advancing) < 4:
        tournament.status = TournamentStatus.COMPLETED
        await session.flush()
        return

    playoff_format = tournament.effective_playoff_format

    if playoff_format == "DRAFT":
        await _create_draft_bracket(session, tournament, advancing)
    else:
        await _create_rr_playoffs(session, tournament, advancing)


async def _create_rr_playoffs(
    session: AsyncSession,
    tournament: KobTournament,
    advancing: List[int],
) -> None:
    """Create round-robin playoff rounds (existing behavior)."""
    schedule = tournament.schedule_data

    playoff_rounds = kob_scheduler.generate_playoff_schedule(
        advancing,
        tournament.num_courts,
        round_offset=tournament.current_round,
    )

    schedule["rounds"].extend(playoff_rounds)
    schedule["total_rounds"] = tournament.current_round + len(playoff_rounds)
    tournament.schedule_data = schedule

    tournament.current_phase = "playoffs"
    tournament.current_round = tournament.current_round + 1

    for rnd in playoff_rounds:
        for m in rnd["matches"]:
            match = KobMatch(
                tournament_id=tournament.id,
                matchup_id=m["matchup_id"],
                round_num=rnd["round_num"],
                phase="playoffs",
                court_num=m.get("court_num"),
                team1_player1_id=m["team1"][0],
                team1_player2_id=m["team1"][1],
                team2_player1_id=m["team2"][0],
                team2_player2_id=m["team2"][1],
                is_bye=m.get("is_bye", False),
            )
            session.add(match)

    await session.flush()


async def _create_draft_bracket(
    session: AsyncSession,
    tournament: KobTournament,
    advancing: List[int],
) -> None:
    """
    Create draft-format single-elimination bracket matches.

    Auto-populates teams by seed. Director can swap before match starts.
    Top 4: seed1+seed4 vs seed2+seed3 (final).
    Top 6: Semi: seed3+seed6 vs seed4+seed5, then seed1+lowestSemiWinner
           vs seed2+otherSemiWinner in final (final created after semis scored).

    Args:
        session: Database session.
        tournament: Active tournament.
        advancing: Seed-ordered player IDs advancing to playoffs.
    """
    schedule = tournament.schedule_data
    round_offset = tournament.current_round
    playoff_size = len(advancing)

    if playoff_size == 4:
        # Single final: seed1+seed4 vs seed2+seed3
        rnd = {
            "round_num": round_offset + 1,
            "phase": "playoffs",
            "pool_id": None,
            "bracket_position": "final",
            "label": "Final",
            "matches": [{
                "matchup_id": "pf_bracket_final",
                "court_num": 1,
                "team1": [advancing[0], advancing[3]],
                "team2": [advancing[1], advancing[2]],
                "is_bye": False,
            }],
        }
        schedule["rounds"].append(rnd)
        schedule["total_rounds"] = round_offset + 1
        tournament.schedule_data = schedule

        match = KobMatch(
            tournament_id=tournament.id,
            matchup_id="pf_bracket_final",
            round_num=round_offset + 1,
            phase="playoffs",
            court_num=1,
            team1_player1_id=advancing[0],
            team1_player2_id=advancing[3],
            team2_player1_id=advancing[1],
            team2_player2_id=advancing[2],
            bracket_position="final",
        )
        session.add(match)

    elif playoff_size >= 6:
        # Semifinal round: seed3+seed6 vs seed4+seed5
        semi_rnd = {
            "round_num": round_offset + 1,
            "phase": "playoffs",
            "pool_id": None,
            "bracket_position": "semifinal",
            "label": "Semifinal",
            "matches": [
                {
                    "matchup_id": "pf_bracket_sf1",
                    "court_num": 1,
                    "team1": [advancing[2], advancing[5]],
                    "team2": [advancing[3], advancing[4]],
                    "is_bye": False,
                },
            ],
        }
        # If 8+ players, add sf2
        if playoff_size >= 8:
            semi_rnd["matches"].append({
                "matchup_id": "pf_bracket_sf2",
                "court_num": min(2, tournament.num_courts),
                "team1": [advancing[4], advancing[7]] if playoff_size >= 8 else [0, 0],
                "team2": [advancing[5], advancing[6]] if playoff_size >= 8 else [0, 0],
                "is_bye": False,
            })

        schedule["rounds"].append(semi_rnd)
        # Final will be added after semis complete — reserve the slot
        schedule["total_rounds"] = round_offset + 2
        tournament.schedule_data = schedule

        # Create semi match rows
        for m in semi_rnd["matches"]:
            match = KobMatch(
                tournament_id=tournament.id,
                matchup_id=m["matchup_id"],
                round_num=round_offset + 1,
                phase="playoffs",
                court_num=m["court_num"],
                team1_player1_id=m["team1"][0],
                team1_player2_id=m["team1"][1],
                team2_player1_id=m["team2"][0],
                team2_player2_id=m["team2"][1],
                bracket_position="semifinal",
            )
            session.add(match)

    tournament.current_phase = "playoffs"
    tournament.current_round = round_offset + 1
    await session.flush()


async def _try_advance_draft_bracket(
    session: AsyncSession,
    tournament: KobTournament,
) -> bool:
    """
    Check if current draft bracket round is complete. If semis are done,
    create the final match with seed1/seed2 paired with semi winners.

    Returns True if bracket was advanced, False otherwise.
    """
    current_round = tournament.current_round or 1

    # Get current round matches
    result = await session.execute(
        select(KobMatch).where(
            and_(
                KobMatch.tournament_id == tournament.id,
                KobMatch.round_num == current_round,
                KobMatch.phase == "playoffs",
            )
        )
    )
    current_matches = result.scalars().all()

    # Check if all are scored
    if any(m.winner is None and not m.is_bye for m in current_matches):
        return False

    # Check if this is a semifinal round
    semi_matches = [m for m in current_matches if m.bracket_position == "semifinal"]
    if not semi_matches:
        return False

    # Check if final already exists
    result = await session.execute(
        select(KobMatch).where(
            and_(
                KobMatch.tournament_id == tournament.id,
                KobMatch.bracket_position == "final",
            )
        )
    )
    existing_final = result.scalar_one_or_none()
    if existing_final:
        # Final already created — just advance round
        if current_round < (tournament.schedule_data or {}).get("total_rounds", 0):
            tournament.current_round = current_round + 1
            await session.flush()
            await session.refresh(tournament)
        return True

    # Collect semi winners + semi losers
    semi_winners = []
    for m in semi_matches:
        if m.winner == 1:
            semi_winners.extend([m.team1_player1_id, m.team1_player2_id])
        else:
            semi_winners.extend([m.team2_player1_id, m.team2_player2_id])

    # Get seed-ordered advancing players
    players = sorted(tournament.kob_players, key=lambda p: p.seed or UNSEEDED_SORT_KEY)
    advancing_pids = [p.player_id for p in players if not p.is_dropped]
    playoff_size = tournament.playoff_size or len(advancing_pids)
    top_pids = advancing_pids[:playoff_size]

    # Seed 1 + lowest-ranked semi winner, Seed 2 + other semi winner
    seed1 = top_pids[0] if len(top_pids) > 0 else 0
    seed2 = top_pids[1] if len(top_pids) > 1 else 0

    # From semi_winners, exclude seed1/seed2 (they didn't play semis for Top 6)
    available_winners = [pid for pid in semi_winners if pid not in (seed1, seed2)]
    # Sort by seed (higher seed number = lower rank)
    seed_map = {p.player_id: p.seed or UNSEEDED_SORT_KEY for p in players}
    available_winners.sort(key=lambda pid: seed_map.get(pid, UNSEEDED_SORT_KEY), reverse=True)

    # Seed1 picks lowest-ranked winner, Seed2 gets the other
    partner1 = available_winners[0] if available_winners else 0
    partner2 = available_winners[1] if len(available_winners) > 1 else 0

    final_round_num = current_round + 1
    schedule = tournament.schedule_data
    final_rnd = {
        "round_num": final_round_num,
        "phase": "playoffs",
        "pool_id": None,
        "bracket_position": "final",
        "label": "Final",
        "matches": [{
            "matchup_id": "pf_bracket_final",
            "court_num": 1,
            "team1": [seed1, partner1],
            "team2": [seed2, partner2],
            "is_bye": False,
        }],
    }
    schedule["rounds"].append(final_rnd)
    schedule["total_rounds"] = final_round_num
    tournament.schedule_data = schedule

    final_match = KobMatch(
        tournament_id=tournament.id,
        matchup_id="pf_bracket_final",
        round_num=final_round_num,
        phase="playoffs",
        court_num=1,
        team1_player1_id=seed1,
        team1_player2_id=partner1,
        team2_player1_id=seed2,
        team2_player2_id=partner2,
        bracket_position="final",
    )
    session.add(final_match)

    tournament.current_round = final_round_num
    await session.flush()
    await session.refresh(tournament)
    return True


async def update_bracket_match(
    session: AsyncSession,
    tournament_id: int,
    match_id: int,
    team1: List[int],
    team2: List[int],
) -> KobMatch:
    """
    Director: swap player assignments in a bracket match that hasn't started.

    Args:
        session: Database session.
        tournament_id: Tournament ID.
        match_id: KobMatch.id to update.
        team1: [player_id, player_id] for team 1.
        team2: [player_id, player_id] for team 2.

    Returns:
        Updated KobMatch.

    Raises:
        ValueError: If match not found, already scored, or invalid players.
    """
    result = await session.execute(
        select(KobMatch).where(
            and_(
                KobMatch.id == match_id,
                KobMatch.tournament_id == tournament_id,
            )
        )
    )
    match = result.scalar_one_or_none()
    if not match:
        raise ValueError("Match not found")
    if match.winner is not None:
        raise ValueError("Cannot edit a match that has already been scored")
    if not match.bracket_position:
        raise ValueError("Can only edit bracket matches")

    if len(team1) != 2 or len(team2) != 2:
        raise ValueError("Each team must have exactly 2 players")

    match.team1_player1_id = team1[0]
    match.team1_player2_id = team1[1]
    match.team2_player1_id = team2[0]
    match.team2_player2_id = team2[1]

    await session.flush()
    await session.refresh(match)
    return match


async def complete_tournament(
    session: AsyncSession,
    tournament_id: int,
    director_player_id: int,
) -> KobTournament:
    """
    Manually complete a tournament.

    Args:
        session: Database session.
        tournament_id: Tournament ID.
        director_player_id: Must match director.

    Returns:
        Updated KobTournament with COMPLETED status.
    """
    tournament = await get_tournament(session, tournament_id)
    if not tournament:
        raise ValueError("Tournament not found")
    if tournament.director_player_id != director_player_id:
        raise ValueError("Only the director can complete the tournament")
    if tournament.status != TournamentStatus.ACTIVE:
        raise ValueError("Tournament is not active")

    tournament.status = TournamentStatus.COMPLETED
    await session.flush()
    await session.refresh(tournament)
    return tournament


# ---------------------------------------------------------------------------
# Standings
# ---------------------------------------------------------------------------


def _tiebreak_hash(tournament_id: int, player_id: int) -> str:
    """Deterministic coin-flip tiebreaker using a stable hash."""
    return hashlib.sha256(f"{tournament_id}-{player_id}".encode()).hexdigest()


async def get_standings(
    session: AsyncSession,
    tournament_id: int,
    pool_id: Optional[int] = None,
    phase: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Compute standings from scored matches.

    Sort: wins (desc) → points_for (desc) → point_diff (desc).

    Args:
        session: Database session.
        tournament_id: Tournament ID.
        pool_id: Filter to a specific pool.
        phase: Filter to a specific phase.

    Returns:
        List of standing dicts ordered by rank.
    """
    # Only count fully decided matches (winner set) to avoid
    # partially-scored Bo3 matches being counted as losses.
    query = select(KobMatch).where(
        and_(
            KobMatch.tournament_id == tournament_id,
            KobMatch.winner.isnot(None),
        )
    )
    if phase:
        query = query.where(KobMatch.phase == phase)

    result = await session.execute(query)
    matches = result.scalars().all()

    # Get tournament players
    player_query = select(KobPlayer).where(
        KobPlayer.tournament_id == tournament_id
    )
    if pool_id is not None:
        player_query = player_query.where(KobPlayer.pool_id == pool_id)

    result = await session.execute(
        player_query.options(selectinload(KobPlayer.player))
    )
    kob_players = result.scalars().all()

    player_ids_in_scope = {kp.player_id for kp in kob_players}

    # Build stats map
    stats: Dict[int, Dict[str, Any]] = {}
    for kp in kob_players:
        stats[kp.player_id] = {
            "player_id": kp.player_id,
            "player_name": kp.player.full_name if kp.player else None,
            "player_avatar": kp.player.profile_picture_url if kp.player else None,
            "wins": 0,
            "losses": 0,
            "points_for": 0,
            "points_against": 0,
            "point_diff": 0,
            "pool_id": kp.pool_id,
        }

    # If filtering by pool, only count matches where all players are in that pool
    for m in matches:
        all_pids = [
            m.team1_player1_id, m.team1_player2_id,
            m.team2_player1_id, m.team2_player2_id,
        ]

        # If pool filter, only count matches with players in this pool
        if pool_id is not None:
            if not all(pid in player_ids_in_scope for pid in all_pids):
                continue

        # Team 1 players
        for pid in [m.team1_player1_id, m.team1_player2_id]:
            if pid in stats:
                stats[pid]["points_for"] += m.team1_score or 0
                stats[pid]["points_against"] += m.team2_score or 0
                if m.winner == 1:
                    stats[pid]["wins"] += 1
                else:
                    stats[pid]["losses"] += 1

        # Team 2 players
        for pid in [m.team2_player1_id, m.team2_player2_id]:
            if pid in stats:
                stats[pid]["points_for"] += m.team2_score or 0
                stats[pid]["points_against"] += m.team1_score or 0
                if m.winner == 2:
                    stats[pid]["wins"] += 1
                else:
                    stats[pid]["losses"] += 1

    # Calculate point diff and sort
    standings = list(stats.values())
    for s in standings:
        s["point_diff"] = s["points_for"] - s["points_against"]

    # Sort: wins → point diff → deterministic coin flip
    standings.sort(
        key=lambda x: (
            x["wins"],
            x["point_diff"],
            _tiebreak_hash(tournament_id, x["player_id"]),
        ),
        reverse=True,
    )

    # Assign ranks
    for i, s in enumerate(standings):
        s["rank"] = i + 1

    return standings


# ---------------------------------------------------------------------------
# Director utility
# ---------------------------------------------------------------------------

async def get_my_tournaments(
    session: AsyncSession,
    player_id: int,
) -> List[KobTournament]:
    """
    Get tournaments directed by or participated in by a player.

    Args:
        session: Database session.
        player_id: Player ID.

    Returns:
        List of KobTournaments.
    """
    # Directed
    directed = await session.execute(
        select(KobTournament)
        .options(selectinload(KobTournament.kob_players))
        .where(KobTournament.director_player_id == player_id)
        .order_by(KobTournament.created_at.desc())
    )
    directed_list = directed.scalars().all()

    # Participated in
    participated = await session.execute(
        select(KobTournament)
        .options(selectinload(KobTournament.kob_players))
        .join(KobPlayer, KobPlayer.tournament_id == KobTournament.id)
        .where(KobPlayer.player_id == player_id)
        .where(KobTournament.director_player_id != player_id)
        .order_by(KobTournament.created_at.desc())
    )
    participated_list = participated.scalars().all()

    return directed_list + participated_list


# ---------------------------------------------------------------------------
# Response building
# ---------------------------------------------------------------------------


def _serialize_match(match: KobMatch, player_map: Dict[int, dict]) -> dict:
    """
    Serialize a KobMatch to a response dict.

    Args:
        match: KobMatch instance.
        player_map: Dict mapping player ID to {"name": ..., "avatar": ...}.

    Returns:
        Dict matching KobMatchResponse shape.
    """
    return {
        "id": match.id,
        "matchup_id": match.matchup_id,
        "round_num": match.round_num,
        "phase": match.phase,
        "pool_id": match.pool_id,
        "court_num": match.court_num,
        "team1_player1_id": match.team1_player1_id,
        "team1_player2_id": match.team1_player2_id,
        "team2_player1_id": match.team2_player1_id,
        "team2_player2_id": match.team2_player2_id,
        "team1_player1_name": player_map.get(match.team1_player1_id, {}).get("name"),
        "team1_player2_name": player_map.get(match.team1_player2_id, {}).get("name"),
        "team2_player1_name": player_map.get(match.team2_player1_id, {}).get("name"),
        "team2_player2_name": player_map.get(match.team2_player2_id, {}).get("name"),
        "team1_score": match.team1_score,
        "team2_score": match.team2_score,
        "winner": match.winner,
        "game_scores": match.game_scores,
        "bracket_position": match.bracket_position,
        "is_bye": match.is_bye,
    }


async def build_detail_response(
    session: AsyncSession,
    tournament: KobTournament,
) -> dict:
    """
    Build a full detail response dict for a tournament.

    Args:
        session: Database session.
        tournament: Loaded KobTournament.

    Returns:
        Dict matching KobTournamentDetailResponse shape.
    """
    # Build player name lookup
    player_ids = set()
    for kp in tournament.kob_players:
        player_ids.add(kp.player_id)
    for m in tournament.kob_matches:
        player_ids.update([
            m.team1_player1_id, m.team1_player2_id,
            m.team2_player1_id, m.team2_player2_id,
        ])

    result = await session.execute(
        select(Player.id, Player.full_name, Player.profile_picture_url).where(
            Player.id.in_(player_ids)
        )
    )
    player_map = {row.id: {"name": row.full_name, "avatar": row.profile_picture_url} for row in result}

    # Build players list
    players_resp = []
    for kp in sorted(tournament.kob_players, key=lambda p: p.seed or UNSEEDED_SORT_KEY):
        p_info = player_map.get(kp.player_id, {})
        players_resp.append({
            "id": kp.id,
            "player_id": kp.player_id,
            "player_name": p_info.get("name"),
            "player_avatar": p_info.get("avatar"),
            "seed": kp.seed,
            "pool_id": kp.pool_id,
            "is_dropped": kp.is_dropped,
            "dropped_at_round": kp.dropped_at_round,
        })

    # Build matches list
    matches_resp = [
        _serialize_match(m, player_map)
        for m in sorted(tournament.kob_matches, key=lambda x: (x.round_num, x.matchup_id))
    ]

    # Build standings
    standings = await get_standings(session, tournament.id)

    return {
        "id": tournament.id,
        "name": tournament.name,
        "code": tournament.code,
        "gender": tournament.gender,
        "format": tournament.format.value if tournament.format else None,
        "status": tournament.status.value if tournament.status else None,
        "game_to": tournament.game_to,
        "win_by": tournament.win_by,
        "num_courts": tournament.num_courts,
        "max_rounds": tournament.max_rounds,
        "has_playoffs": tournament.has_playoffs,
        "playoff_size": tournament.playoff_size,
        "num_pools": tournament.num_pools,
        "games_per_match": tournament.games_per_match or 1,
        "num_rr_cycles": tournament.num_rr_cycles or 1,
        "score_cap": tournament.score_cap,
        "playoff_format": tournament.playoff_format,
        "playoff_game_to": tournament.playoff_game_to,
        "playoff_games_per_match": tournament.playoff_games_per_match,
        "playoff_score_cap": tournament.playoff_score_cap,
        "is_ranked": tournament.is_ranked,
        "current_phase": tournament.current_phase,
        "current_round": tournament.current_round,
        "auto_advance": tournament.auto_advance,
        "scheduled_date": str(tournament.scheduled_date) if tournament.scheduled_date else None,
        "director_player_id": tournament.director_player_id,
        "director_name": tournament.director.full_name if tournament.director else None,
        "league_id": tournament.league_id,
        "location_id": tournament.location_id,
        "schedule_data": tournament.schedule_data,
        "players": players_resp,
        "matches": matches_resp,
        "standings": standings,
        "created_at": tournament.created_at.isoformat() if tournament.created_at else None,
        "updated_at": tournament.updated_at.isoformat() if tournament.updated_at else None,
    }


async def build_match_response(session: AsyncSession, match: KobMatch) -> dict:
    """
    Build a match response dict with player names resolved.

    Args:
        session: Database session.
        match: KobMatch instance.

    Returns:
        Dict matching KobMatchResponse shape.
    """
    pids = [
        match.team1_player1_id, match.team1_player2_id,
        match.team2_player1_id, match.team2_player2_id,
    ]
    result = await session.execute(
        select(Player.id, Player.full_name, Player.profile_picture_url).where(
            Player.id.in_(pids)
        )
    )
    player_map = {
        row.id: {"name": row.full_name, "avatar": row.profile_picture_url}
        for row in result
    }
    return _serialize_match(match, player_map)


def build_summary_response(tournament: KobTournament, player_count: int = 0) -> dict:
    """
    Build a summary response dict for a tournament listing.

    Args:
        tournament: KobTournament instance.
        player_count: Number of players in roster.

    Returns:
        Dict matching KobTournamentResponse shape.
    """
    return {
        "id": tournament.id,
        "name": tournament.name,
        "code": tournament.code,
        "gender": tournament.gender,
        "format": tournament.format.value if tournament.format else None,
        "status": tournament.status.value if tournament.status else None,
        "num_courts": tournament.num_courts,
        "game_to": tournament.game_to,
        "scheduled_date": str(tournament.scheduled_date) if tournament.scheduled_date else None,
        "player_count": player_count,
        "current_round": tournament.current_round,
        "created_at": tournament.created_at.isoformat() if tournament.created_at else None,
    }
