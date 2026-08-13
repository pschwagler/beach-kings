"""Database-backed contact and visibility rules for junior players."""

from __future__ import annotations

from datetime import date

from sqlalchemy import and_, exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from backend.database.models import Friend, LeagueMember, Player, Season, User


def _friend_pair(viewer_id: int, candidate_id):
    return exists(
        select(Friend.id).where(
            or_(
                and_(Friend.player1_id == viewer_id, Friend.player2_id == candidate_id),
                and_(Friend.player2_id == viewer_id, Friend.player1_id == candidate_id),
            )
        )
    )


def _active_shared_league(viewer_id: int, candidate_id):
    viewer_membership = aliased(LeagueMember)
    candidate_membership = aliased(LeagueMember)
    today = date.today()
    return exists(
        select(Season.id)
        .join(viewer_membership, viewer_membership.league_id == Season.league_id)
        .join(candidate_membership, candidate_membership.league_id == Season.league_id)
        .where(
            viewer_membership.player_id == viewer_id,
            candidate_membership.player_id == candidate_id,
            Season.start_date <= today,
            or_(Season.end_date.is_(None), Season.end_date >= today),
        )
    )


def discovery_visibility(candidate_id, candidate_user_id, viewer_player_id: int | None):
    """SQL predicate: juniors are visible only to friends/active league peers."""
    candidate_is_junior = exists(
        select(User.id).where(User.id == candidate_user_id, User.age_group == "junior")
    )
    if viewer_player_id is None:
        return ~candidate_is_junior
    return or_(
        ~candidate_is_junior,
        _friend_pair(viewer_player_id, candidate_id),
        _active_shared_league(viewer_player_id, candidate_id),
    )


async def player_is_junior(session: AsyncSession, player_id: int) -> bool:
    value = await session.scalar(
        select(User.age_group)
        .join(Player, Player.user_id == User.id)
        .where(Player.id == player_id)
    )
    return value == "junior"


async def share_active_league(
    session: AsyncSession, first_player_id: int, second_player_id: int
) -> bool:
    return bool(
        await session.scalar(
            select(_active_shared_league(first_player_id, second_player_id))
        )
    )


async def enforce_direct_message_pair(
    session: AsyncSession, first_player_id: int, second_player_id: int
) -> None:
    """Junior DMs require the existing friendship plus an active shared league."""
    if not (
        await player_is_junior(session, first_player_id)
        or await player_is_junior(session, second_player_id)
    ):
        return
    if not await share_active_league(session, first_player_id, second_player_id):
        raise ValueError("Direct messages with junior players require an active shared league")
