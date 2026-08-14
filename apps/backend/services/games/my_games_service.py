"""
Service for GET /api/users/me/games.

Provides a player's game history in the shape expected by the mobile My Games
screen, derived from the existing match/session/EloHistory tables.
"""

from __future__ import annotations

import logging
from datetime import datetime
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
    Session,
    SessionStatus,
)
from backend.services.players.player_lifecycle import historical_id, historical_name

logger = logging.getLogger(__name__)


def _normalize_session_date(raw: object) -> Optional[str]:
    """
    Normalize a session date value to ISO format YYYY-MM-DD.

    Session.date is stored as a String with mixed legacy formats:
    - ISO ("2025-11-04")
    - US-style ("5/17/2026" or "12/11/2025")

    Returns None when the value is empty or unparseable.
    """
    if raw is None:
        return None
    value = str(raw).strip()
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            continue
    logger.warning("Unrecognized session_date format: %r", value)
    return None


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

    def deleted_at(field: str):
        return getattr(row, field, None)

    if on_team1:
        my_score = row.team1_score or 0
        opp_score = row.team2_score or 0
        partners = [
            (row.team1_player1_name, row.team1_player1_id, deleted_at("t1p1_deleted_at")),
            (row.team1_player2_name, row.team1_player2_id, deleted_at("t1p2_deleted_at")),
        ]
        partners = [item for item in partners if item[1] != player_id]
        opponents = [
            (row.team2_player1_name, row.team2_player1_id, deleted_at("t2p1_deleted_at")),
            (row.team2_player2_name, row.team2_player2_id, deleted_at("t2p2_deleted_at")),
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
        partners = [
            (row.team2_player1_name, row.team2_player1_id, deleted_at("t2p1_deleted_at")),
            (row.team2_player2_name, row.team2_player2_id, deleted_at("t2p2_deleted_at")),
        ]
        partners = [item for item in partners if item[1] != player_id]
        opponents = [
            (row.team1_player1_name, row.team1_player1_id, deleted_at("t1p1_deleted_at")),
            (row.team1_player2_name, row.team1_player2_id, deleted_at("t1p2_deleted_at")),
        ]
        if row.winner == 2:
            result = "W"
        elif row.winner == -1:
            result = "D"
        else:
            result = "L"

    partner_names = [historical_name(name, deleted_at) for name, _, deleted_at in partners]
    partner_ids = [historical_id(pid, deleted_at) for _, pid, deleted_at in partners]
    opponent_names = [historical_name(name, deleted_at) for name, _, deleted_at in opponents]
    opponent_ids = [historical_id(pid, deleted_at) for _, pid, deleted_at in opponents]

    # A session is "submitted" for display purposes whenever it is no longer
    # ACTIVE. Both SUBMITTED and EDITED are locked/finalized states (EDITED is a
    # session that was submitted and then had a game re-locked). Only ACTIVE is
    # genuinely live, so treating anything != ACTIVE as submitted prevents EDITED
    # sessions from showing a phantom "LIVE" pill in the mobile games list.
    session_submitted = row.session_status not in (
        SessionStatus.ACTIVE,
        "ACTIVE",
    )

    rating_change: Optional[int] = None
    if row.elo_change is not None:
        rating_change = int(round(row.elo_change))

    has_placeholder = any(
        bool(getattr(row, field, False))
        for field in (
            "t1p1_is_placeholder",
            "t1p2_is_placeholder",
            "t2p1_is_placeholder",
            "t2p2_is_placeholder",
        )
    )
    rating_pending_reason: Optional[str] = None
    if rating_change is None:
        if not session_submitted:
            rating_pending_reason = "session_submission"
        elif has_placeholder:
            rating_pending_reason = "player_account"
        else:
            rating_pending_reason = "calculation"

    session_date = _normalize_session_date(getattr(row, "session_date", None))

    return {
        "id": row.match_id,
        "session_id": row.session_id,
        "session_date": session_date,
        "court_label": row.court_name,
        "league_name": row.league_name,
        "league_id": row.league_id,
        "result": result,
        "my_score": my_score,
        "opponent_score": opp_score,
        "partner_names": partner_names,
        "partner_ids": partner_ids,
        "opponent_names": opponent_names,
        "opponent_ids": opponent_ids,
        "rating_change": rating_change,
        "session_submitted": session_submitted,
        "rating_pending_reason": rating_pending_reason,
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

    player_exists = await session.execute(
        select(Player.id).where(Player.id == player_id, Player.deleted_at.is_(None))
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
            p1.deleted_at.label("t1p1_deleted_at"),
            p2.deleted_at.label("t1p2_deleted_at"),
            p3.deleted_at.label("t2p1_deleted_at"),
            p4.deleted_at.label("t2p2_deleted_at"),
            p1.is_placeholder.label("t1p1_is_placeholder"),
            p2.is_placeholder.label("t1p2_is_placeholder"),
            p3.is_placeholder.label("t2p1_is_placeholder"),
            p4.is_placeholder.label("t2p2_is_placeholder"),
            eh.elo_change,
            Session.status.label("session_status"),
            Session.date.label("session_date"),
            Session.league_id.label("league_id"),
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
        .outerjoin(League, Session.league_id == League.id)
        .outerjoin(Court, Session.court_id == Court.id)
        .where(base_where)
    )

    if league_id is not None:
        query = query.where(Session.league_id == league_id)

    all_rows = (await session.execute(query)).all()

    entries = [_build_entry(row, player_id) for row in all_rows]

    if result_filter is not None:
        entries = [e for e in entries if e["result"] == result_filter]

    total = len(entries)

    # Sort by match id descending (newest first), then paginate.
    entries.sort(key=lambda e: e["id"], reverse=True)
    paginated = entries[offset : offset + limit]

    return paginated, total
