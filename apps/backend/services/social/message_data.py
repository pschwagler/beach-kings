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
    "publish_approved_league_message",
]

from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import LeagueMessage, Player
from backend.services import interaction_policy, message_write_policy, moderation_worker


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
            Player.profile_picture_url.label("avatar_url"),
            LeagueMessage.message_text.label("message"),
            LeagueMessage.created_at,
            LeagueMessage.moderation_visibility,
        )
        .outerjoin(Player, LeagueMessage.user_id == Player.user_id)
        .where(
            LeagueMessage.league_id == league_id,
            or_(
                LeagueMessage.moderation_visibility == "visible",
                and_(
                    LeagueMessage.user_id == current_user_id,
                    LeagueMessage.moderation_visibility == "pending",
                ),
            ),
        )
        .order_by(LeagueMessage.created_at.asc())
    )
    rows = result.all()
    viewer_player_id = None
    blocked_ids: set[int] = set()
    if current_user_id is not None:
        viewer_player_id = (
            await session.execute(select(Player.id).where(Player.user_id == current_user_id))
        ).scalar_one_or_none()
        if viewer_player_id is not None:
            # Shared league facts and chat stay present. Only the viewer who
            # initiated a block gets the other player's chat rows collapsed.
            blocked_ids = await interaction_policy.blocked_by_viewer_player_ids(
                session, viewer_player_id
            )
    return [
        {
            "id": row.id,
            "league_id": row.league_id,
            "user_id": row.user_id,
            "player_id": row.player_id,
            "player_name": row.player_name,
            "avatar_url": row.avatar_url,
            "message": row.message,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "is_mine": current_user_id is not None and row.user_id == current_user_id,
            "moderation_visibility": row.moderation_visibility,
            "collapsed_for_viewer": row.player_id in blocked_ids,
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
    await message_write_policy.enforce_write_enabled(
        session, message_write_policy.MessageSurface.LEAGUE_CHAT
    )

    player_id_result = await session.execute(select(Player.id).where(Player.user_id == user_id))
    author_player_id = player_id_result.scalar_one_or_none()
    if author_player_id is None:
        raise ValueError("Player profile required")
    await interaction_policy.enforce_ugc_creation(session, author_player_id)

    msg = LeagueMessage(
        league_id=league_id,
        user_id=user_id,
        message_text=message_text,
        moderation_visibility=moderation_worker.initial_visibility(),
    )
    session.add(msg)
    await session.flush()
    await session.refresh(msg)
    await moderation_worker.enqueue_target(session, "league_message", msg.id)

    if msg.moderation_visibility == "visible":
        await publish_approved_league_message(session, msg)

    # Resolve player name for the response
    player_id: Optional[int] = author_player_id
    player_name: Optional[str] = None
    avatar_url: Optional[str] = None
    player_result = await session.execute(
        select(Player.id, Player.full_name, Player.profile_picture_url).where(
            Player.user_id == user_id
        )
    )
    player_row = player_result.one_or_none()
    if player_row is not None:
        player_id = player_row.id
        player_name = player_row.full_name
        avatar_url = player_row.profile_picture_url

    return {
        "id": msg.id,
        "league_id": msg.league_id,
        "user_id": msg.user_id,
        "player_id": player_id,
        "player_name": player_name,
        "avatar_url": avatar_url,
        "message": msg.message_text,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
        "is_mine": True,
        "moderation_visibility": msg.moderation_visibility,
        "collapsed_for_viewer": False,
    }


async def publish_approved_league_message(session: AsyncSession, msg: LeagueMessage) -> None:
    """Notify league members only after a message is safe to publish."""
    from backend.services import notification_service

    await notification_service.notify_league_members_about_message(
        session=session,
        league_id=msg.league_id,
        message_id=msg.id,
        sender_user_id=msg.user_id,
        message_text=msg.message_text,
    )
