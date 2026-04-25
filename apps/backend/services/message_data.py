"""
League message CRUD operations.

Extracted from data_service.py.  Provides read/write access to the
``league_messages`` table with player-name context joined from the
``users`` and ``players`` tables.
"""

from typing import Dict, List, Optional

__all__ = [
    "get_league_messages",
    "create_league_message",
]

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import LeagueMessage, Player


async def get_league_messages(
    session: AsyncSession,
    league_id: int,
    current_user_id: Optional[int] = None,
) -> List[Dict]:
    """
    Return all messages for a league, ordered oldest-first.

    Each message dict contains the author's ``player_name`` joined from
    the ``players`` table via the shared ``user_id`` foreign key, plus
    an ``is_mine`` flag indicating whether the authenticated caller
    authored the message.

    Args:
        session: Async database session.
        league_id: League to fetch messages for.
        current_user_id: Authenticated caller's user id. When None,
            ``is_mine`` is always False.

    Returns:
        List of message dicts with keys:
        ``id``, ``league_id``, ``user_id``, ``player_id``,
        ``player_name``, ``message``, ``created_at``, ``is_mine``.
    """
    result = await session.execute(
        select(
            LeagueMessage.id,
            LeagueMessage.league_id,
            LeagueMessage.user_id,
            Player.id.label("player_id"),
            Player.full_name.label("player_name"),
            LeagueMessage.message_text.label("message"),
            LeagueMessage.created_at,
        )
        .outerjoin(Player, LeagueMessage.user_id == Player.user_id)
        .where(LeagueMessage.league_id == league_id)
        .order_by(LeagueMessage.created_at.asc())
    )
    rows = result.all()
    return [
        {
            "id": row.id,
            "league_id": row.league_id,
            "user_id": row.user_id,
            "player_id": row.player_id,
            "player_name": row.player_name,
            "message": row.message,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "is_mine": current_user_id is not None and row.user_id == current_user_id,
        }
        for row in rows
    ]


async def create_league_message(
    session: AsyncSession,
    league_id: int,
    user_id: int,
    message_text: str,
) -> Dict:
    """
    Create a new message in a league.

    Args:
        session: Async database session.
        league_id: League to post the message to.
        user_id: ID of the user posting the message.
        message_text: Message body text.

    Returns:
        Message dict with keys:
        ``id``, ``league_id``, ``user_id``, ``player_id``,
        ``player_name``, ``message``, ``created_at``.
    """
    msg = LeagueMessage(
        league_id=league_id,
        user_id=user_id,
        message_text=message_text,
    )
    session.add(msg)
    await session.flush()
    await session.refresh(msg)

    # Resolve player name for the response
    player_id: Optional[int] = None
    player_name: Optional[str] = None
    player_result = await session.execute(
        select(Player.id, Player.full_name).where(Player.user_id == user_id)
    )
    player_row = player_result.one_or_none()
    if player_row is not None:
        player_id = player_row.id
        player_name = player_row.full_name

    return {
        "id": msg.id,
        "league_id": msg.league_id,
        "user_id": msg.user_id,
        "player_id": player_id,
        "player_name": player_name,
        "message": msg.message_text,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
        "is_mine": True,
    }
