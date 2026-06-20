"""
Service for GET /api/leagues/{league_id}/games.

Returns every match in a league across all sessions, shaped neutrally
(team1 / team2 instead of "me" / "opponent") so the mobile All Games
view can render without a per-user perspective.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from backend.database.models import (
    Court,
    Match,
    Player,
    Session,
)

if TYPE_CHECKING:
    from sqlalchemy import Row

logger = logging.getLogger(__name__)

# Match.winner discriminator values (mirrors packages/shared LeagueGameEntry):
#   1 = team1 won, 2 = team2 won, -1 = tie, 0 = no result yet (in progress).
WINNER_NO_RESULT = 0


def _normalize_session_date(raw: object) -> str | None:
    """Normalize legacy date strings to ISO YYYY-MM-DD; None on failure."""
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


def _build_entry(row: "Row") -> dict:
    """Transform a raw query row into a LeagueGameEntry-shaped dict."""
    team1_names = [
        n for n in [row.team1_player1_name, row.team1_player2_name] if n is not None
    ]
    team1_ids = [
        pid for pid in [row.team1_player1_id, row.team1_player2_id] if pid is not None
    ]
    team2_names = [
        n for n in [row.team2_player1_name, row.team2_player2_name] if n is not None
    ]
    team2_ids = [
        pid for pid in [row.team2_player1_id, row.team2_player2_id] if pid is not None
    ]

    # Normalize session_status to a plain string (enum.value or already-str).
    raw_status = row.session_status
    session_status = (
        raw_status.value if hasattr(raw_status, "value") else str(raw_status)
    )

    return {
        "id": row.match_id,
        "session_id": row.session_id,
        "session_date": _normalize_session_date(getattr(row, "session_date", None)),
        "session_status": session_status,
        "court_label": row.court_name,
        "team1_player_names": team1_names,
        "team1_player_ids": team1_ids,
        "team2_player_names": team2_names,
        "team2_player_ids": team2_ids,
        "team1_score": row.team1_score or 0,
        "team2_score": row.team2_score or 0,
        "winner": row.winner if row.winner is not None else WINNER_NO_RESULT,
    }


async def get_league_games(
    session: AsyncSession,
    league_id: int,
    limit: int = 200,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """
    Fetch a page of matches in a league, shaped for the mobile All Games view.

    Pagination (ORDER BY / LIMIT / OFFSET) and the ``total`` count are computed
    in SQL so the full match set is never loaded into memory. Entries come back
    sorted newest-first (descending match id).

    Args:
        session: SQLAlchemy async session.
        league_id: League whose matches to return.
        limit: Max rows to return (caller is expected to bound this).
        offset: Rows to skip for pagination.

    Returns:
        ``(entries, total)`` where ``entries`` is the requested page and
        ``total`` is the full count of league matches (ignoring limit/offset).
    """
    p1 = aliased(Player)
    p2 = aliased(Player)
    p3 = aliased(Player)
    p4 = aliased(Player)

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
            Session.status.label("session_status"),
            Session.date.label("session_date"),
            Court.name.label("court_name"),
        )
        .select_from(Match)
        .outerjoin(p1, Match.team1_player1_id == p1.id)
        .outerjoin(p2, Match.team1_player2_id == p2.id)
        .outerjoin(p3, Match.team2_player1_id == p3.id)
        .outerjoin(p4, Match.team2_player2_id == p4.id)
        .outerjoin(Session, Match.session_id == Session.id)
        .outerjoin(Court, Session.court_id == Court.id)
        .where(Session.league_id == league_id)
    )

    # Count the full filtered set independently of the page window.
    # Plain join; the WHERE on Session.league_id includes gap sessions (season_id NULL).
    count_query = (
        select(func.count())
        .select_from(Match)
        .join(Session, Match.session_id == Session.id)
        .where(Session.league_id == league_id)
    )
    total = (await session.execute(count_query)).scalar_one()

    paginated = query.order_by(Match.id.desc()).limit(limit).offset(offset)
    rows = (await session.execute(paginated)).all()
    entries = [_build_entry(row) for row in rows]
    return entries, total
