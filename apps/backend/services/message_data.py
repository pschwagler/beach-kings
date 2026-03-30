"""
League message CRUD operations.

Extracted from data_service.py.  Provides read/write access to the
``league_messages`` table with player-name context joined from the
``users`` and ``players`` tables.
"""

from typing import List, Dict, Optional

__all__ = [
    "get_league_messages",
    "create_league_message",
]

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.database.models import LeagueMessage, User, Player


async def get_league_messages(session: AsyncSession, league_id: int) -> List[Dict]:
    """
    Return all messages for a league, ordered oldest-first.

    Each message dict contains the author's ``player_name`` joined from
    the ``players`` table (falling back to the ``users`` table if no
    player row exists).

    Args:
        session: Async database session.
        league_id: League to fetch messages for.

    Returns:
        List of message dicts with keys:
        ``id``, ``league_id``, ``user_id``, ``player_id``,
        ``player_name``, ``content``, ``created_at``.
    """
    result = await session.execute(
        select(
            LeagueMessage.id,
            LeagueMessage.league_id,
            LeagueMessage.user_id,
            LeagueMessage.player_id,
            Player.full_name.label("player_name"),
            LeagueMessage.content,
            LeagueMessage.created_at,
        )
        .outerjoin(User, LeagueMessage.user_id == User.id)
        .outerjoin(Player, LeagueMessage.player_id == Player.id)
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
            "content": row.content,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


async def create_league_message(
    session: AsyncSession,
    league_id: int,
    user_id: int,
    player_id: Optional[int],
    content: str,
) -> Dict:
    """
    Create a new message in a league.

    Args:
        session: Async database session.
        league_id: League to post the message to.
        user_id: ID of the user posting the message.
        player_id: Optional player profile ID of the author.
        content: Message body text.

    Returns:
        Message dict with keys:
        ``id``, ``league_id``, ``user_id``, ``player_id``,
        ``player_name``, ``content``, ``created_at``.
    """
    message = LeagueMessage(
        league_id=league_id,
        user_id=user_id,
        player_id=player_id,
        content=content,
    )
    session.add(message)
    await session.flush()
    await session.commit()
    await session.refresh(message)

    # Resolve player name for the response
    player_name: Optional[str] = None
    if player_id is not None:
        player_result = await session.execute(
            select(Player.full_name).where(Player.id == player_id)
        )
        player_name = player_result.scalar_one_or_none()

    return {
        "id": message.id,
        "league_id": message.league_id,
        "user_id": message.user_id,
        "player_id": message.player_id,
        "player_name": player_name,
        "content": message.content,
        "created_at": message.created_at.isoformat() if message.created_at else None,
    }
