"""
Service for GET /api/users/me/games.

Provides a player's game history in the shape expected by the mobile My Games
screen, derived from the existing match/session/EloHistory tables.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from backend.database.models import (
    Court,
    EloHistory,
    League,
    Match,
    Player,
    Season,
    Session,
    SessionStatus,
)

logger = logging.getLogger(__name__)


def _build_entry(
    row,
    player_id: int,
) -> Dict:
    """
    Transform a raw query row into a GameHistoryEntry-shaped dict.

    Determines which team the player is on and builds partner/opponent
    name lists, result, scores, and rating change accordingly.
    """
    on_team1 = row.team1_player1_id == player_id or row.team1_player2_id == player_id

    if on_team1:
        my_score = row.team1_score or 0
        opp_score = row.team2_score or 0
        partner_names = [
            n
            for n in [
                row.team1_player1_name if row.team1_player1_id != player_id else None,
                row.team1_player2_name if row.team1_player2_id != player_id else None,
            ]
            if n is not None
        ]
        opponent_names = [
            n for n in [row.team2_player1_name, row.team2_player2_name] if n is not None
        ]
        if row.winner == 1:
            result = "W"
        elif row.winner == -1:
            result = "D"
        else:
            result = "L"
    else:
        my_score = row.team2_score or 0
        opp_score = row.team1_score or 0
        partner_names = [
            n
            for n in [
                row.team2_player1_name if row.team2_player1_id != player_id else None,
                row.team2_player2_name if row.team2_player2_id != player_id else None,
            ]
            if n is not None
        ]
        opponent_names = [
            n for n in [row.team1_player1_name, row.team1_player2_name] if n is not None
        ]
        if row.winner == 2:
            result = "W"
        elif row.winner == -1:
            result = "D"
        else:
            result = "L"

    session_submitted = (
        row.session_status == SessionStatus.SUBMITTED
        or row.session_status == "SUBMITTED"
    )

    rating_change: Optional[int] = None
    if row.elo_change is not None:
        rating_change = int(round(row.elo_change))

    return {
        "id": row.match_id,
        "session_id": row.session_id,
        "court_label": row.court_name,
        "league_name": row.league_name,
        "league_id": row.league_id,
        "result": result,
        "my_score": my_score,
        "opponent_score": opp_score,
        "partner_names": partner_names,
        "opponent_names": opponent_names,
        "rating_change": rating_change,
        "session_submitted": session_submitted,
    }


async def get_my_games(
    session: AsyncSession,
    player_id: int,
    league_id: Optional[int] = None,
    result_filter: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Optional[Tuple[List[Dict], int]]:
    """
    Fetch game history for a player, shaped for the My Games screen.

    Args:
        session: Async DB session.
        player_id: ID of the current player.
        league_id: Optional filter by league.
        result_filter: Optional filter by result — "W", "L", or "D".
        limit: Max number of records to return.
        offset: Pagination offset.

    Returns:
        Tuple of (list of GameHistoryEntry dicts, total count), or None when
        the player is not found.
    """
    from sqlalchemy import func

    player_exists = await session.execute(
        select(Player.id).where(Player.id == player_id)
    )
    if not player_exists.scalar_one_or_none():
        return None

    p1 = aliased(Player)
    p2 = aliased(Player)
    p3 = aliased(Player)
    p4 = aliased(Player)
    eh = aliased(EloHistory)

    base_where = or_(
        Match.team1_player1_id == player_id,
        Match.team1_player2_id == player_id,
        Match.team2_player1_id == player_id,
        Match.team2_player2_id == player_id,
    )

    query = (
        select(
            Match.id.label("match_id"),
            Match.session_id,
            Match.team1_player1_id,
            Match.team1_player2_id,
            Match.team2_player1_id,
            Match.team2_player2_id,
            Match.team1_score,
            Match.team2_score,
            Match.winner,
            p1.full_name.label("team1_player1_name"),
            p2.full_name.label("team1_player2_name"),
            p3.full_name.label("team2_player1_name"),
            p4.full_name.label("team2_player2_name"),
            eh.elo_change,
            Session.status.label("session_status"),
            Season.league_id.label("league_id"),
            League.name.label("league_name"),
            Court.name.label("court_name"),
        )
        .select_from(Match)
        .outerjoin(p1, Match.team1_player1_id == p1.id)
        .outerjoin(p2, Match.team1_player2_id == p2.id)
        .outerjoin(p3, Match.team2_player1_id == p3.id)
        .outerjoin(p4, Match.team2_player2_id == p4.id)
        .outerjoin(eh, and_(eh.match_id == Match.id, eh.player_id == player_id))
        .outerjoin(Session, Match.session_id == Session.id)
        .outerjoin(Season, Session.season_id == Season.id)
        .outerjoin(League, Season.league_id == League.id)
        .outerjoin(Court, Session.court_id == Court.id)
        .where(base_where)
    )

    if league_id is not None:
        query = query.where(Season.league_id == league_id)

    all_rows = (await session.execute(query)).all()

    entries = [_build_entry(row, player_id) for row in all_rows]

    if result_filter is not None:
        entries = [e for e in entries if e["result"] == result_filter]

    total = len(entries)

    # Sort by match id descending (newest first), then paginate.
    entries.sort(key=lambda e: e["id"], reverse=True)
    paginated = entries[offset : offset + limit]

    return paginated, total
