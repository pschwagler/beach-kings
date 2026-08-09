"""Canonical friendship relationship resolution.

``friends`` rows and pending ``friend_requests`` rows are the only inputs to
the presentation state returned to clients. Historical request rows are
deliberately ignored.
"""

from typing import Dict, Iterable

from sqlalchemy import and_, case, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import Friend, FriendRequest, FriendRequestStatus


Relationship = Dict[str, int | str | None]


async def resolve_relationships(
    session: AsyncSession,
    viewer_player_id: int,
    target_player_ids: Iterable[int],
) -> Dict[str, Relationship]:
    """Resolve the canonical relationship to each target in two queries.

    Friendship wins over a pending request if legacy data contains both. A
    pending request exposes its canonical request id so response actions never
    need to infer it from notification JSON or a separate request list.
    """
    target_ids = list(dict.fromkeys(target_player_ids))
    if not target_ids:
        return {}

    other_player = case(
        (Friend.player1_id == viewer_player_id, Friend.player2_id),
        else_=Friend.player1_id,
    ).label("other_player_id")
    friend_result = await session.execute(
        select(other_player).where(
            and_(
                or_(
                    Friend.player1_id == viewer_player_id,
                    Friend.player2_id == viewer_player_id,
                ),
                other_player.in_(target_ids),
            )
        )
    )
    friend_ids = set(friend_result.scalars().all())

    request_result = await session.execute(
        select(
            FriendRequest.id,
            FriendRequest.sender_player_id,
            FriendRequest.receiver_player_id,
        ).where(
            and_(
                FriendRequest.status == FriendRequestStatus.PENDING.value,
                or_(
                    and_(
                        FriendRequest.sender_player_id == viewer_player_id,
                        FriendRequest.receiver_player_id.in_(target_ids),
                    ),
                    and_(
                        FriendRequest.receiver_player_id == viewer_player_id,
                        FriendRequest.sender_player_id.in_(target_ids),
                    ),
                ),
            )
        )
    )
    pending_by_target = {}
    for row in request_result.all():
        target_id = (
            row.receiver_player_id
            if row.sender_player_id == viewer_player_id
            else row.sender_player_id
        )
        # The partial unique index guarantees one row. Keeping the lowest id is
        # deterministic while a deployment is still auditing legacy data.
        existing = pending_by_target.get(target_id)
        if existing is None or row.id < existing.id:
            pending_by_target[target_id] = row

    relationships: Dict[str, Relationship] = {}
    for target_id in target_ids:
        if target_id == viewer_player_id:
            relationship: Relationship = {"status": "self", "request_id": None}
        elif target_id in friend_ids:
            relationship = {"status": "friend", "request_id": None}
        elif target_id in pending_by_target:
            request = pending_by_target[target_id]
            status = (
                "pending_outgoing"
                if request.sender_player_id == viewer_player_id
                else "pending_incoming"
            )
            relationship = {"status": status, "request_id": request.id}
        else:
            relationship = {"status": "none", "request_id": None}
        relationships[str(target_id)] = relationship

    return relationships


async def resolve_relationship(
    session: AsyncSession, viewer_player_id: int, target_player_id: int
) -> Relationship:
    """Resolve a single relationship using the canonical batch resolver."""
    relationships = await resolve_relationships(session, viewer_player_id, [target_player_id])
    return relationships[str(target_player_id)]
