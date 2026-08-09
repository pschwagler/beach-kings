"""
KOB tournament database reads and standings.

Provides tournament lookup queries (by ID, code, player) and
standings computation from scored matches.
"""

import hashlib
import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.database.models import (
    KobTournament,
    KobPlayer,
    KobMatch,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tournament lookups
# ---------------------------------------------------------------------------


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

    Sort: wins (desc) -> points_for (desc) -> point_diff (desc).

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
    player_query = select(KobPlayer).where(KobPlayer.tournament_id == tournament_id)
    if pool_id is not None:
        player_query = player_query.where(KobPlayer.pool_id == pool_id)

    result = await session.execute(player_query.options(selectinload(KobPlayer.player)))
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
            m.team1_player1_id,
            m.team1_player2_id,
            m.team2_player1_id,
            m.team2_player2_id,
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

    # Sort: wins -> point diff -> deterministic coin flip
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
