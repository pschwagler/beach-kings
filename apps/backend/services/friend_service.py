"""
Friend service for managing friend requests and friendships.

Handles sending/accepting/declining requests, listing friends,
mutual friend calculations, and league-based suggestions.
"""

from typing import List, Dict, Set, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, and_, or_, case, literal_column
from sqlalchemy.orm import aliased
from backend.database.models import (
    Friend,
    FriendRequest,
    FriendRequestStatus,
    Player,
    Location,
    LeagueMember,
    NotificationType,
)
from backend.services import notification_service
from backend.utils.datetime_utils import utcnow
import logging

logger = logging.getLogger(__name__)


async def get_player_id_for_user(session: AsyncSession, user_id: int) -> Optional[int]:
    """
    Get the player_id associated with a user_id.

    Args:
        session: Database session
        user_id: User ID

    Returns:
        Player ID or None if not found
    """
    result = await session.execute(
        select(Player.id).where(Player.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_friend_ids(session: AsyncSession, player_id: int) -> Set[int]:
    """
    Get the set of all friend player_ids for a given player.

    Args:
        session: Database session
        player_id: Player to look up friends for

    Returns:
        Set of friend player IDs
    """
    result = await session.execute(
        select(
            case(
                (Friend.player1_id == player_id, Friend.player2_id),
                else_=Friend.player1_id,
            )
        ).where(or_(Friend.player1_id == player_id, Friend.player2_id == player_id))
    )
    return set(result.scalars().all())


async def are_friends(
    session: AsyncSession, player_id: int, other_player_id: int
) -> bool:
    """
    Check if two players are friends.

    Args:
        session: Database session
        player_id: First player ID
        other_player_id: Second player ID

    Returns:
        True if the players are friends
    """
    p1, p2 = sorted([player_id, other_player_id])
    result = await session.execute(
        select(Friend.id).where(
            and_(Friend.player1_id == p1, Friend.player2_id == p2)
        )
    )
    return result.scalar_one_or_none() is not None


async def get_pending_request(
    session: AsyncSession, sender_id: int, receiver_id: int
) -> Optional[FriendRequest]:
    """
    Get a pending friend request between two players (in either direction).

    Args:
        session: Database session
        sender_id: Sender player ID
        receiver_id: Receiver player ID

    Returns:
        FriendRequest or None
    """
    result = await session.execute(
        select(FriendRequest).where(
            and_(
                FriendRequest.status == FriendRequestStatus.PENDING.value,
                or_(
                    and_(
                        FriendRequest.sender_player_id == sender_id,
                        FriendRequest.receiver_player_id == receiver_id,
                    ),
                    and_(
                        FriendRequest.sender_player_id == receiver_id,
                        FriendRequest.receiver_player_id == sender_id,
                    ),
                ),
            )
        )
    )
    return result.scalar_one_or_none()


async def send_friend_request(
    session: AsyncSession, sender_player_id: int, receiver_player_id: int
) -> Dict:
    """
    Send a friend request from one player to another.

    Validates that players aren't already friends and no pending request exists.
    Creates a notification for the receiver.

    Args:
        session: Database session
        sender_player_id: Player sending the request
        receiver_player_id: Player receiving the request

    Returns:
        Dict with friend request data

    Raises:
        ValueError: If request is invalid (self-friend, already friends, pending request exists)
    """
    if sender_player_id == receiver_player_id:
        raise ValueError("Cannot send a friend request to yourself")

    # Check if already friends
    if await are_friends(session, sender_player_id, receiver_player_id):
        raise ValueError("Already friends with this player")

    # Check for existing pending request in either direction
    existing = await get_pending_request(session, sender_player_id, receiver_player_id)
    if existing:
        if existing.sender_player_id == sender_player_id:
            raise ValueError("Friend request already sent")
        else:
            raise ValueError(
                "This player already sent you a friend request. Accept it instead."
            )

    # Batch-fetch sender name and receiver user_id in one query
    player_result = await session.execute(
        select(Player.id, Player.full_name, Player.user_id).where(
            Player.id.in_([sender_player_id, receiver_player_id])
        )
    )
    player_map = {row.id: row for row in player_result.all()}
    sender_row = player_map.get(sender_player_id)
    receiver_row = player_map.get(receiver_player_id)
    sender_name = sender_row.full_name if sender_row else "Someone"
    receiver_user_id = receiver_row.user_id if receiver_row else None

    # Create the request
    friend_request = FriendRequest(
        sender_player_id=sender_player_id,
        receiver_player_id=receiver_player_id,
        status=FriendRequestStatus.PENDING.value,
    )
    session.add(friend_request)
    await session.flush()
    await session.refresh(friend_request)

    # Send notification to receiver
    if receiver_user_id:
        try:
            await notification_service.create_notification(
                session=session,
                user_id=receiver_user_id,
                type=NotificationType.FRIEND_REQUEST.value,
                title="Friend Request",
                message=f"{sender_name} sent you a friend request",
                data={
                    "sender_player_id": sender_player_id,
                    "friend_request_id": friend_request.id,
                    "actions": [
                        {"label": "Accept", "action": "accept_friend", "style": "primary"},
                        {"label": "Decline", "action": "decline_friend", "style": "secondary"},
                    ],
                },
                link_url="/home?tab=friends",
            )
        except Exception as e:
            logger.warning(f"Failed to send friend request notification: {e}")

    return await _format_friend_request(session, friend_request)


async def accept_friend_request(
    session: AsyncSession, request_id: int, receiver_player_id: int
) -> Dict:
    """
    Accept a pending friend request.

    Verifies the current player is the receiver, updates request status,
    inserts into friends table (normalized), and notifies the sender.

    Args:
        session: Database session
        request_id: Friend request ID
        receiver_player_id: Player ID of the receiver (current user)

    Returns:
        Dict with updated friend request data

    Raises:
        ValueError: If request not found, wrong receiver, or not pending
    """
    result = await session.execute(
        select(FriendRequest).where(FriendRequest.id == request_id)
    )
    friend_request = result.scalar_one_or_none()

    if not friend_request:
        raise ValueError("Friend request not found")
    if friend_request.receiver_player_id != receiver_player_id:
        raise ValueError("Not authorized to accept this request")
    if friend_request.status != FriendRequestStatus.PENDING.value:
        raise ValueError("Friend request is no longer pending")

    # Update request status
    friend_request.status = FriendRequestStatus.ACCEPTED.value
    friend_request.responded_at = utcnow()

    # Insert into friends table with normalized ordering (player1_id < player2_id)
    p1, p2 = sorted([friend_request.sender_player_id, friend_request.receiver_player_id])
    friendship = Friend(
        player1_id=p1,
        player2_id=p2,
        created_by=receiver_player_id,
    )
    session.add(friendship)
    await session.flush()

    # Batch-fetch receiver name and sender user_id in one query
    player_result = await session.execute(
        select(Player.id, Player.full_name, Player.user_id).where(
            Player.id.in_([receiver_player_id, friend_request.sender_player_id])
        )
    )
    player_map = {row.id: row for row in player_result.all()}
    receiver_row = player_map.get(receiver_player_id)
    sender_row = player_map.get(friend_request.sender_player_id)
    receiver_name = receiver_row.full_name if receiver_row else "Someone"
    sender_user_id = sender_row.user_id if sender_row else None

    # Notify sender that request was accepted
    if sender_user_id:
        try:
            await notification_service.create_notification(
                session=session,
                user_id=sender_user_id,
                type=NotificationType.FRIEND_ACCEPTED.value,
                title="Friend Request Accepted",
                message=f"{receiver_name} accepted your friend request",
                data={"player_id": receiver_player_id},
                link_url=f"/player/{receiver_player_id}",
            )
        except Exception as e:
            logger.warning(f"Failed to send friend accepted notification: {e}")

    return await _format_friend_request(session, friend_request)


async def decline_friend_request(
    session: AsyncSession, request_id: int, receiver_player_id: int
) -> None:
    """
    Decline a pending friend request by deleting it.

    Deletes the row so the sender can re-send later without hitting
    the UniqueConstraint on (sender_player_id, receiver_player_id).

    Args:
        session: Database session
        request_id: Friend request ID
        receiver_player_id: Player ID of the receiver (current user)

    Raises:
        ValueError: If request not found, wrong receiver, or not pending
    """
    result = await session.execute(
        select(FriendRequest).where(FriendRequest.id == request_id)
    )
    friend_request = result.scalar_one_or_none()

    if not friend_request:
        raise ValueError("Friend request not found")
    if friend_request.receiver_player_id != receiver_player_id:
        raise ValueError("Not authorized to decline this request")
    if friend_request.status != FriendRequestStatus.PENDING.value:
        raise ValueError("Friend request is no longer pending")

    await session.delete(friend_request)
    await session.flush()


async def cancel_friend_request(
    session: AsyncSession, request_id: int, sender_player_id: int
) -> None:
    """
    Cancel an outgoing friend request (delete it).

    Args:
        session: Database session
        request_id: Friend request ID
        sender_player_id: Player ID of the sender (current user)

    Raises:
        ValueError: If request not found, wrong sender, or not pending
    """
    result = await session.execute(
        select(FriendRequest).where(FriendRequest.id == request_id)
    )
    friend_request = result.scalar_one_or_none()

    if not friend_request:
        raise ValueError("Friend request not found")
    if friend_request.sender_player_id != sender_player_id:
        raise ValueError("Not authorized to cancel this request")
    if friend_request.status != FriendRequestStatus.PENDING.value:
        raise ValueError("Friend request is no longer pending")

    await session.delete(friend_request)
    await session.flush()


async def remove_friend(
    session: AsyncSession, player_id: int, friend_player_id: int
) -> None:
    """
    Remove a friendship between two players.

    Deletes from friends table and cleans up any associated friend requests.

    Args:
        session: Database session
        player_id: Current player ID
        friend_player_id: Player ID to unfriend

    Raises:
        ValueError: If not currently friends
    """
    p1, p2 = sorted([player_id, friend_player_id])

    result = await session.execute(
        select(Friend).where(
            and_(Friend.player1_id == p1, Friend.player2_id == p2)
        )
    )
    friendship = result.scalar_one_or_none()

    if not friendship:
        raise ValueError("Not friends with this player")

    await session.delete(friendship)

    # Clean up associated friend requests
    await session.execute(
        delete(FriendRequest).where(
            or_(
                and_(
                    FriendRequest.sender_player_id == player_id,
                    FriendRequest.receiver_player_id == friend_player_id,
                ),
                and_(
                    FriendRequest.sender_player_id == friend_player_id,
                    FriendRequest.receiver_player_id == player_id,
                ),
            )
        )
    )
    await session.flush()


async def get_friends(
    session: AsyncSession, player_id: int, limit: int = 50, offset: int = 0
) -> Dict:
    """
    Get paginated list of friends for a player.

    Returns friend info with player details and mutual friend counts.

    Args:
        session: Database session
        player_id: Player to get friends for
        limit: Max results
        offset: Pagination offset

    Returns:
        Dict with items (list of friend dicts) and total_count
    """
    # Get friend IDs with friendship row IDs
    friend_id_col = case(
        (Friend.player1_id == player_id, Friend.player2_id),
        else_=Friend.player1_id,
    ).label("friend_player_id")

    base_query = select(Friend.id, friend_id_col).where(
        or_(Friend.player1_id == player_id, Friend.player2_id == player_id)
    )

    # Total count
    count_query = select(func.count()).select_from(base_query.subquery())
    count_result = await session.execute(count_query)
    total_count = count_result.scalar_one() or 0

    # Paginated friend IDs
    paginated = base_query.order_by(Friend.created_at.desc()).limit(limit).offset(offset)
    result = await session.execute(paginated)
    friend_rows = result.all()

    if not friend_rows:
        return {"items": [], "total_count": total_count}

    friend_ids = [row.friend_player_id for row in friend_rows]
    friendship_ids = {row.friend_player_id: row.id for row in friend_rows}

    # Get player details
    player_result = await session.execute(
        select(
            Player.id,
            Player.full_name,
            Player.avatar,
            Player.level,
            Location.name.label("location_name"),
        )
        .outerjoin(Location, Player.location_id == Location.id)
        .where(Player.id.in_(friend_ids))
    )
    player_map = {row.id: row for row in player_result.all()}

    # Build response
    items = []
    for fid in friend_ids:
        p = player_map.get(fid)
        if not p:
            continue
        items.append(
            {
                "id": friendship_ids[fid],
                "player_id": fid,
                "full_name": p.full_name,
                "avatar": p.avatar,
                "location_name": p.location_name,
                "level": p.level,
            }
        )

    return {"items": items, "total_count": total_count}


async def get_friend_requests(
    session: AsyncSession, player_id: int, direction: str = "both"
) -> List[Dict]:
    """
    Get pending friend requests for a player.

    Args:
        session: Database session
        player_id: Player to get requests for
        direction: "incoming", "outgoing", or "both"

    Returns:
        List of friend request dicts
    """
    query = select(FriendRequest).where(
        FriendRequest.status == FriendRequestStatus.PENDING.value
    )

    if direction == "incoming":
        query = query.where(FriendRequest.receiver_player_id == player_id)
    elif direction == "outgoing":
        query = query.where(FriendRequest.sender_player_id == player_id)
    else:
        query = query.where(
            or_(
                FriendRequest.sender_player_id == player_id,
                FriendRequest.receiver_player_id == player_id,
            )
        )

    query = query.order_by(FriendRequest.created_at.desc())
    result = await session.execute(query)
    requests = result.scalars().all()

    return await _format_friend_requests_batch(session, requests)


async def get_mutual_friends(
    session: AsyncSession, player_id: int, other_player_id: int
) -> List[Dict]:
    """
    Get the list of mutual friends between two players.

    Args:
        session: Database session
        player_id: First player
        other_player_id: Second player

    Returns:
        List of dicts with mutual friend player info
    """
    my_friends = await get_friend_ids(session, player_id)
    their_friends = await get_friend_ids(session, other_player_id)
    mutual_ids = my_friends & their_friends

    if not mutual_ids:
        return []

    result = await session.execute(
        select(Player.id, Player.full_name, Player.avatar).where(
            Player.id.in_(list(mutual_ids))
        )
    )
    return [
        {"player_id": row.id, "full_name": row.full_name, "avatar": row.avatar}
        for row in result.all()
    ]


async def get_mutual_friend_count(
    session: AsyncSession, player_id: int, other_player_id: int
) -> int:
    """
    Get count of mutual friends between two players.

    Args:
        session: Database session
        player_id: First player
        other_player_id: Second player

    Returns:
        Number of mutual friends
    """
    my_friends = await get_friend_ids(session, player_id)
    their_friends = await get_friend_ids(session, other_player_id)
    return len(my_friends & their_friends)


async def batch_friend_status(
    session: AsyncSession, player_id: int, target_player_ids: List[int]
) -> Dict:
    """
    Get friend status and mutual friend counts for multiple target players.

    Used by search results to annotate player cards with connection info.

    Args:
        session: Database session
        player_id: Current player
        target_player_ids: List of player IDs to check against

    Returns:
        Dict with 'statuses' and 'mutual_counts' keyed by player_id
    """
    if not target_player_ids:
        return {"statuses": {}, "mutual_counts": {}}

    # Get current player's friends
    my_friends = await get_friend_ids(session, player_id)

    # Get pending outgoing requests
    outgoing_result = await session.execute(
        select(FriendRequest.receiver_player_id).where(
            and_(
                FriendRequest.sender_player_id == player_id,
                FriendRequest.status == FriendRequestStatus.PENDING.value,
                FriendRequest.receiver_player_id.in_(target_player_ids),
            )
        )
    )
    outgoing_pending = set(outgoing_result.scalars().all())

    # Get pending incoming requests
    incoming_result = await session.execute(
        select(FriendRequest.sender_player_id).where(
            and_(
                FriendRequest.receiver_player_id == player_id,
                FriendRequest.status == FriendRequestStatus.PENDING.value,
                FriendRequest.sender_player_id.in_(target_player_ids),
            )
        )
    )
    incoming_pending = set(incoming_result.scalars().all())

    # Build statuses
    statuses = {}
    for tid in target_player_ids:
        if tid == player_id:
            statuses[str(tid)] = "self"
        elif tid in my_friends:
            statuses[str(tid)] = "friend"
        elif tid in outgoing_pending:
            statuses[str(tid)] = "pending_outgoing"
        elif tid in incoming_pending:
            statuses[str(tid)] = "pending_incoming"
        else:
            statuses[str(tid)] = "none"

    # Compute mutual friend counts in a single query instead of per-target
    mutual_counts = {str(tid): 0 for tid in target_player_ids}
    non_friend_ids = [
        tid for tid in target_player_ids
        if tid != player_id and tid not in my_friends
    ]
    if non_friend_ids and my_friends:
        # Find friends of each target that overlap with my_friends
        friend_id_col = case(
            (Friend.player1_id.in_(non_friend_ids), Friend.player2_id),
            else_=Friend.player1_id,
        )
        target_id_col = case(
            (Friend.player1_id.in_(non_friend_ids), Friend.player1_id),
            else_=Friend.player2_id,
        )
        mutual_query = (
            select(
                target_id_col.label("target_id"),
                func.count().label("cnt"),
            )
            .where(
                and_(
                    or_(
                        Friend.player1_id.in_(non_friend_ids),
                        Friend.player2_id.in_(non_friend_ids),
                    ),
                    friend_id_col.in_(list(my_friends)),
                )
            )
            .group_by(target_id_col)
        )
        mutual_result = await session.execute(mutual_query)
        for row in mutual_result.all():
            mutual_counts[str(row.target_id)] = row.cnt

    return {"statuses": statuses, "mutual_counts": mutual_counts}


async def get_friend_suggestions(
    session: AsyncSession, player_id: int, limit: int = 10
) -> List[Dict]:
    """
    Get friend suggestions based on shared league memberships.

    Returns league members who aren't friends with the player, ordered by
    number of shared leagues (descending).

    Args:
        session: Database session
        player_id: Current player
        limit: Max suggestions to return

    Returns:
        List of suggestion dicts with player info and shared_league_count
    """
    # Get current friends to exclude
    friend_ids = await get_friend_ids(session, player_id)
    exclude_ids = friend_ids | {player_id}

    # Get pending request IDs to exclude
    pending_result = await session.execute(
        select(FriendRequest.sender_player_id, FriendRequest.receiver_player_id).where(
            and_(
                FriendRequest.status == FriendRequestStatus.PENDING.value,
                or_(
                    FriendRequest.sender_player_id == player_id,
                    FriendRequest.receiver_player_id == player_id,
                ),
            )
        )
    )
    for row in pending_result.all():
        exclude_ids.add(row.sender_player_id)
        exclude_ids.add(row.receiver_player_id)

    # Get leagues the current player belongs to
    my_leagues_result = await session.execute(
        select(LeagueMember.league_id).where(LeagueMember.player_id == player_id)
    )
    my_league_ids = [row[0] for row in my_leagues_result.all()]

    if not my_league_ids:
        return []

    # Find other players in those leagues, count shared leagues
    OtherMember = aliased(LeagueMember)
    query = (
        select(
            OtherMember.player_id,
            func.count(OtherMember.league_id).label("shared_league_count"),
        )
        .where(
            and_(
                OtherMember.league_id.in_(my_league_ids),
                ~OtherMember.player_id.in_(list(exclude_ids)),
            )
        )
        .group_by(OtherMember.player_id)
        .order_by(func.count(OtherMember.league_id).desc())
        .limit(limit)
    )

    result = await session.execute(query)
    suggestion_rows = result.all()

    if not suggestion_rows:
        return []

    # Get player details
    suggestion_ids = [row.player_id for row in suggestion_rows]
    shared_counts = {row.player_id: row.shared_league_count for row in suggestion_rows}

    player_result = await session.execute(
        select(
            Player.id,
            Player.full_name,
            Player.avatar,
            Player.level,
            Player.user_id,
            Location.name.label("location_name"),
        )
        .outerjoin(Location, Player.location_id == Location.id)
        .where(and_(Player.id.in_(suggestion_ids), Player.user_id.isnot(None)))
    )
    player_map = {row.id: row for row in player_result.all()}

    suggestions = []
    for pid in suggestion_ids:
        p = player_map.get(pid)
        if not p:
            continue
        suggestions.append(
            {
                "player_id": p.id,
                "full_name": p.full_name,
                "avatar": p.avatar,
                "level": p.level,
                "location_name": p.location_name,
                "shared_league_count": shared_counts.get(pid, 0),
            }
        )

    return suggestions


async def _format_friend_requests_batch(
    session: AsyncSession, requests: List[FriendRequest]
) -> List[Dict]:
    """
    Batch-format FriendRequest ORM objects into response dicts with player names.

    Fetches all referenced player info in a single query instead of per-request.

    Args:
        session: Database session
        requests: List of FriendRequest ORM objects

    Returns:
        List of dicts matching FriendRequestResponse schema
    """
    if not requests:
        return []

    # Collect all unique player IDs
    player_ids = set()
    for req in requests:
        player_ids.add(req.sender_player_id)
        player_ids.add(req.receiver_player_id)

    # Single query for all player info
    result = await session.execute(
        select(Player.id, Player.full_name, Player.avatar).where(
            Player.id.in_(list(player_ids))
        )
    )
    player_map = {row.id: row for row in result.all()}

    formatted = []
    for req in requests:
        sender = player_map.get(req.sender_player_id)
        receiver = player_map.get(req.receiver_player_id)
        formatted.append({
            "id": req.id,
            "sender_player_id": req.sender_player_id,
            "sender_name": sender.full_name if sender else "Unknown",
            "sender_avatar": sender.avatar if sender else None,
            "receiver_player_id": req.receiver_player_id,
            "receiver_name": receiver.full_name if receiver else "Unknown",
            "receiver_avatar": receiver.avatar if receiver else None,
            "status": req.status,
            "created_at": req.created_at.isoformat() if req.created_at else None,
        })
    return formatted


async def _format_friend_request(
    session: AsyncSession, friend_request: FriendRequest
) -> Dict:
    """
    Format a single FriendRequest ORM object into a response dict.

    Delegates to _format_friend_requests_batch for a single item.

    Args:
        session: Database session
        friend_request: FriendRequest ORM object

    Returns:
        Dict matching FriendRequestResponse schema
    """
    results = await _format_friend_requests_batch(session, [friend_request])
    return results[0]
