"""
KOB (King/Queen of the Beach) tournament service.

Handles tournament CRUD, player management, scheduling, scoring,
standings calculation, and round advancement.
"""

import logging
import secrets
import string
from datetime import date
from typing import List, Optional

from sqlalchemy import select, delete, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    KobTournament,
    KobPlayer,
    KobMatch,
    Player,
    TournamentStatus,
    TournamentFormat,
)
from backend.services.kob_algorithms import generate_schedule
from backend.services.kob_time import UNSEEDED_SORT_KEY

logger = logging.getLogger(__name__)

CODE_ALPHABET = string.ascii_uppercase + string.digits
CODE_LENGTH = 6
MIN_TOURNAMENT_PLAYERS = 4


# ---------------------------------------------------------------------------
# Re-exports from submodules (only names used externally via kob_service.X)
# ---------------------------------------------------------------------------

from backend.services.kob_queries import (  # noqa: F401, E402
    get_tournament,
    get_tournament_by_code,
    get_my_tournaments,
    get_standings,
)

from backend.services.kob_scoring import (  # noqa: F401, E402
    _effective_game_settings,
    _apply_bo3_score,
    _validate_score,
)

from backend.services.kob_advancement import (  # noqa: F401, E402
    check_round_complete,
    advance_round,
    update_bracket_match,
    complete_tournament,
)

from backend.services.kob_responses import (  # noqa: F401, E402
    build_detail_response,
    build_match_response,
    build_summary_response,
)


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
        exists = await session.execute(select(KobTournament.id).where(KobTournament.code == code))
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
    player_exists = await session.execute(select(Player.id).where(Player.id == player_id))
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
            select(func.count(KobPlayer.id)).where(KobPlayer.tournament_id == tournament_id)
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
            match.team1_player1_id,
            match.team1_player2_id,
            match.team2_player1_id,
            match.team2_player2_id,
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
    schedule_data = generate_schedule(
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


async def submit_score(
    session: AsyncSession,
    tournament_id: int,
    matchup_id: str,
    team1_score: int,
    team2_score: int,
    game_index: Optional[int] = None,
) -> KobMatch:
    """
    Submit a score for a match (public -- anyone with the link can score).

    Phase-aware: uses playoff game_to/cap for playoff matches.
    Bo3-aware: when games_per_match == 3, appends to game_scores JSONB array
    and only sets winner when a team reaches 2 game wins.

    Args:
        session: Database session.
        tournament_id: Tournament ID.
        matchup_id: Match identifier (e.g. "r1m1").
        team1_score: Team 1 score.
        team2_score: Team 2 score.
        game_index: For Bo3 updates -- which game to update (0-based). None = append new game.

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
        team1_score,
        team2_score,
        settings.game_to,
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
        round_complete = await check_round_complete(session, tournament_id, match.round_num)
        if round_complete:
            await advance_round(session, tournament_id)

    await session.refresh(match)
    return match


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
        game_index: For Bo3 -- which game to update (0-based).

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
        team1_score,
        team2_score,
        settings.game_to,
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
