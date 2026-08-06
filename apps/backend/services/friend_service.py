"""
Friend service for managing friend requests and friendships.

Handles sending/accepting/declining requests, listing friends,
mutual friend calculations, and multi-signal suggestions.
"""

from typing import List, Dict, Set, Optional

from backend.utils.slugify import slugify
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, case, literal, union_all
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import aliased
from backend.database.models import (
    Friend,
    FriendRequest,
    FriendRequestStatus,
    Match,
    Player,
    PlayerGlobalStats,
    Location,
    League,
    LeagueMember,
    Session as GameSession,
    SessionParticipant,
    NotificationType,
)
from backend.services import notification_service, interaction_policy
from backend.services.relationship_service import resolve_relationship, resolve_relationships
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
    result = await session.execute(select(Player.id).where(Player.user_id == user_id))
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


async def are_friends(session: AsyncSession, player_id: int, other_player_id: int) -> bool:
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
        select(Friend.id).where(and_(Friend.player1_id == p1, Friend.player2_id == p2))
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
        select(FriendRequest)
        .where(
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
        .order_by(FriendRequest.id)
        .limit(1)
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
    await interaction_policy.enforce_action(
        session,
        sender_player_id,
        receiver_player_id,
        interaction_policy.InteractionAction.FRIEND_REQUEST,
    )

    relationship = await resolve_relationship(session, sender_player_id, receiver_player_id)
    if relationship["status"] == "friend":
        raise ValueError("Already friends with this player")
    if relationship["status"] == "pending_outgoing":
        raise ValueError("Friend request already sent")
    if relationship["status"] == "pending_incoming":
        raise ValueError("This player already sent you a friend request. Accept it instead.")

    # Batch-fetch sender name and receiver user_id in one query
    player_result = await session.execute(
        select(Player.id, Player.full_name, Player.user_id, Player.is_placeholder).where(
            Player.id.in_([sender_player_id, receiver_player_id])
        )
    )
    player_map = {row.id: row for row in player_result.all()}
    sender_row = player_map.get(sender_player_id)
    receiver_row = player_map.get(receiver_player_id)

    if not receiver_row:
        raise ValueError("Player not found")
    if receiver_row.is_placeholder:
        raise ValueError("Cannot send a friend request to an unregistered player")

    sender_name = sender_row.full_name if sender_row else "Someone"
    receiver_user_id = receiver_row.user_id if receiver_row else None

    # Create the request
    friend_request = FriendRequest(
        sender_player_id=sender_player_id,
        receiver_player_id=receiver_player_id,
        status=FriendRequestStatus.PENDING.value,
    )
    try:
        # The database's unordered-pair partial index is the final arbiter for
        # concurrent same- or reverse-direction requests. The savepoint keeps
        # the caller's transaction usable when the constraint wins the race.
        async with session.begin_nested():
            session.add(friend_request)
            await session.flush()
    except IntegrityError:
        concurrent = await resolve_relationship(session, sender_player_id, receiver_player_id)
        if concurrent["status"] == "pending_incoming":
            raise ValueError("This player already sent you a friend request. Accept it instead.")
        if concurrent["status"] == "friend":
            raise ValueError("Already friends with this player")
        raise ValueError("Friend request already sent")
    await session.refresh(friend_request)

    # Send notification to receiver
    if receiver_user_id:
        try:
            # A declined request may have left historical notification rows.
            # Dismiss any presentation for this sender before creating the one
            # actionable notification for the new pending relationship.
            await notification_service.mark_friend_request_notifications_handled(
                session,
                receiver_user_id=receiver_user_id,
                request_id=friend_request.id,
                sender_player_id=sender_player_id,
            )
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
                dedup_key=f"friend_request:{friend_request.id}",
                actor_player_id=sender_player_id,
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
        select(FriendRequest).where(FriendRequest.id == request_id).with_for_update()
    )
    friend_request = result.scalar_one_or_none()

    if not friend_request:
        raise ValueError("Friend request not found")
    await interaction_policy.enforce_action(
        session,
        receiver_player_id,
        friend_request.sender_player_id,
        interaction_policy.InteractionAction.FRIEND_REQUEST,
    )
    if friend_request.receiver_player_id != receiver_player_id:
        raise ValueError("Not authorized to accept this request")
    if friend_request.status != FriendRequestStatus.PENDING.value:
        raise ValueError("Friend request is no longer pending")

    # Update request status
    friend_request.status = FriendRequestStatus.ACCEPTED.value
    friend_request.responded_at = utcnow()

    # Preserve any legacy duplicate pending rows as superseded history. New
    # duplicates are prevented by the unordered-pair partial unique index.
    pair_filter = or_(
        and_(
            FriendRequest.sender_player_id == friend_request.sender_player_id,
            FriendRequest.receiver_player_id == friend_request.receiver_player_id,
        ),
        and_(
            FriendRequest.sender_player_id == friend_request.receiver_player_id,
            FriendRequest.receiver_player_id == friend_request.sender_player_id,
        ),
    )
    superseded_result = await session.execute(
        select(FriendRequest)
        .where(
            and_(
                FriendRequest.id != request_id,
                FriendRequest.status == FriendRequestStatus.PENDING.value,
                pair_filter,
            )
        )
        .order_by(FriendRequest.id)
        .with_for_update()
    )
    superseded_requests = superseded_result.scalars().all()
    for superseded in superseded_requests:
        superseded.status = FriendRequestStatus.SUPERSEDED.value
        superseded.responded_at = friend_request.responded_at

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
    receiver_user_id = receiver_row.user_id if receiver_row else None
    sender_user_id = sender_row.user_id if sender_row else None

    if receiver_user_id:
        await notification_service.mark_friend_request_notifications_handled(
            session,
            receiver_user_id=receiver_user_id,
            request_id=request_id,
            sender_player_id=friend_request.sender_player_id,
        )

    for superseded in superseded_requests:
        superseded_receiver = player_map.get(superseded.receiver_player_id)
        if superseded_receiver and superseded_receiver.user_id:
            await notification_service.mark_friend_request_notifications_handled(
                session,
                receiver_user_id=superseded_receiver.user_id,
                request_id=superseded.id,
                sender_player_id=superseded.sender_player_id,
            )

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
                link_url=f"/player/{receiver_player_id}/{slugify(receiver_name)}",
                actor_player_id=receiver_player_id,
            )
        except Exception as e:
            logger.warning(f"Failed to send friend accepted notification: {e}")

    return await _format_friend_request(session, friend_request)


async def decline_friend_request(
    session: AsyncSession, request_id: int, receiver_player_id: int
) -> None:
    """
    Decline a pending friend request while preserving its history.

    Args:
        session: Database session
        request_id: Friend request ID
        receiver_player_id: Player ID of the receiver (current user)

    Raises:
        ValueError: If request not found, wrong receiver, or not pending
    """
    result = await session.execute(
        select(FriendRequest).where(FriendRequest.id == request_id).with_for_update()
    )
    friend_request = result.scalar_one_or_none()

    if not friend_request:
        raise ValueError("Friend request not found")
    if friend_request.receiver_player_id != receiver_player_id:
        raise ValueError("Not authorized to decline this request")
    if friend_request.status != FriendRequestStatus.PENDING.value:
        raise ValueError("Friend request is no longer pending")

    receiver_result = await session.execute(
        select(Player.user_id).where(Player.id == receiver_player_id)
    )
    receiver_user_id = receiver_result.scalar_one_or_none()

    friend_request.status = FriendRequestStatus.DECLINED.value
    friend_request.responded_at = utcnow()
    await session.flush()

    if receiver_user_id:
        await notification_service.mark_friend_request_notifications_handled(
            session,
            receiver_user_id=receiver_user_id,
            request_id=request_id,
            sender_player_id=friend_request.sender_player_id,
        )


async def cancel_friend_request(
    session: AsyncSession, request_id: int, sender_player_id: int
) -> None:
    """
    Cancel an outgoing friend request while preserving its history.

    Args:
        session: Database session
        request_id: Friend request ID
        sender_player_id: Player ID of the sender (current user)

    Raises:
        ValueError: If request not found, wrong sender, or not pending
    """
    result = await session.execute(
        select(FriendRequest).where(FriendRequest.id == request_id).with_for_update()
    )
    friend_request = result.scalar_one_or_none()

    if not friend_request:
        raise ValueError("Friend request not found")
    if friend_request.sender_player_id != sender_player_id:
        raise ValueError("Not authorized to cancel this request")
    if friend_request.status != FriendRequestStatus.PENDING.value:
        raise ValueError("Friend request is no longer pending")

    receiver_result = await session.execute(
        select(Player.user_id).where(Player.id == friend_request.receiver_player_id)
    )
    receiver_user_id = receiver_result.scalar_one_or_none()

    friend_request.status = FriendRequestStatus.CANCELLED.value
    friend_request.responded_at = utcnow()
    await session.flush()

    if receiver_user_id:
        await notification_service.mark_friend_request_notifications_handled(
            session,
            receiver_user_id=receiver_user_id,
            request_id=request_id,
            sender_player_id=sender_player_id,
        )


async def remove_friend(session: AsyncSession, player_id: int, friend_player_id: int) -> None:
    """
    Remove a friendship between two players.

    Deletes from friends table. Historical friend requests remain intact.

    Args:
        session: Database session
        player_id: Current player ID
        friend_player_id: Player ID to unfriend

    Raises:
        ValueError: If not currently friends
    """
    p1, p2 = sorted([player_id, friend_player_id])

    result = await session.execute(
        select(Friend).where(and_(Friend.player1_id == p1, Friend.player2_id == p2))
    )
    friendship = result.scalar_one_or_none()

    if not friendship:
        raise ValueError("Not friends with this player")

    await session.delete(friendship)

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
    base_query = interaction_policy.exclude_blocked_players(base_query, player_id, friend_id_col)

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
            Player.profile_picture_url,
            Player.level,
            Location.name.label("location_name"),
        )
        .outerjoin(Location, Player.location_id == Location.id)
        .where(Player.id.in_(friend_ids))
    )
    player_map = {row.id: row for row in player_result.all()}

    # One shared-league name per friend (batched; misses mean none shared)
    shared_leagues = await batch_shared_league_names(session, player_id, friend_ids)

    # Latest match activity per friend (batched; misses mean no matches)
    last_actives = await batch_last_active(session, friend_ids)

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
                "avatar": p.profile_picture_url or p.avatar,
                "location_name": p.location_name,
                "level": p.level,
                "shared_league_name": shared_leagues.get(fid),
                "last_active": (last_actives[fid].isoformat() if fid in last_actives else None),
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
    query = select(FriendRequest).where(FriendRequest.status == FriendRequestStatus.PENDING.value)

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

    counterpart_id = case(
        (FriendRequest.sender_player_id == player_id, FriendRequest.receiver_player_id),
        else_=FriendRequest.sender_player_id,
    )
    query = interaction_policy.exclude_blocked_players(query, player_id, counterpart_id)

    query = query.order_by(FriendRequest.created_at.desc())
    result = await session.execute(query)
    requests = result.scalars().all()

    return await _format_friend_requests_batch(session, requests, viewer_player_id=player_id)


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
    mutual_ids -= await interaction_policy.blocked_player_ids(session, player_id)

    if not mutual_ids:
        return []

    result = await session.execute(
        select(
            Player.id,
            Player.full_name,
            Player.avatar,
            Player.profile_picture_url,
        ).where(Player.id.in_(list(mutual_ids)))
    )
    return [
        {
            "player_id": row.id,
            "full_name": row.full_name,
            "avatar": row.profile_picture_url or row.avatar,
        }
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
    mutual_ids = my_friends & their_friends
    mutual_ids -= await interaction_policy.blocked_player_ids(session, player_id)
    return len(mutual_ids)


async def batch_last_active(session: AsyncSession, target_player_ids: List[int]) -> Dict:
    """
    Resolve each player's most recent match activity in a single query.

    "Last active" is defined as the ``created_at`` of the newest session
    containing a match the player appears in (any of the four seats) —
    derived from played games, deliberately not from app logins.

    Args:
        session: Database session
        target_player_ids: Player IDs to resolve activity for

    Returns:
        Dict mapping player id -> datetime of latest match session (players
        with no recorded matches are absent)
    """
    if not target_player_ids:
        return {}

    seat_cols = [
        Match.team1_player1_id,
        Match.team1_player2_id,
        Match.team2_player1_id,
        Match.team2_player2_id,
    ]
    seat_selects = [
        select(col.label("pid"), GameSession.created_at.label("at"))
        .join(GameSession, Match.session_id == GameSession.id)
        .where(col.in_(target_player_ids))
        for col in seat_cols
    ]
    seats = union_all(*seat_selects).subquery()
    rows = await session.execute(select(seats.c.pid, func.max(seats.c.at)).group_by(seats.c.pid))
    return {row[0]: row[1] for row in rows.all()}


async def batch_shared_league_names(
    session: AsyncSession, player_id: int, target_player_ids: List[int]
) -> Dict[int, str]:
    """
    Resolve one shared-league name per target in a single query.

    For each target sharing >=1 league with ``player_id``, maps the target to
    the alphabetically first shared league's name (deterministic when several
    are shared). Targets sharing no league are absent from the result.

    Args:
        session: Database session
        player_id: The viewer whose league memberships define "shared"
        target_player_ids: Player IDs to resolve shared leagues for

    Returns:
        Dict mapping target id -> shared league name (misses mean none shared)
    """
    if not target_player_ids:
        return {}

    my_league_ids = select(LeagueMember.league_id).where(LeagueMember.player_id == player_id)
    OtherMember = aliased(LeagueMember)
    rows = await session.execute(
        select(OtherMember.player_id, League.name)
        .join(League, OtherMember.league_id == League.id)
        .where(
            and_(
                OtherMember.player_id.in_(target_player_ids),
                OtherMember.league_id.in_(my_league_ids),
            )
        )
        .order_by(League.name.asc())
    )
    names: Dict[int, str] = {}
    for row in rows.all():
        names.setdefault(row.player_id, row.name)
    return names


async def batch_mutual_friend_counts(
    session: AsyncSession,
    player_id: int,
    target_player_ids: List[int],
    my_friends: Optional[Set[int]] = None,
) -> Dict[int, int]:
    """
    Count mutual friends between ``player_id`` and each target in one query.

    Args:
        session: Database session
        player_id: The viewer whose friend set the counts are relative to
        target_player_ids: Player IDs to count mutual friends against
        my_friends: The viewer's friend ids, if the caller already fetched
            them (skips the extra lookup)

    Returns:
        Dict mapping every target id to its mutual-friend count. The viewer
        itself and players already friended by the viewer map to 0 (callers
        annotating those rows don't surface a count for them).
    """
    counts: Dict[int, int] = {tid: 0 for tid in target_player_ids}
    if not target_player_ids:
        return counts

    if my_friends is None:
        my_friends = await get_friend_ids(session, player_id)
    non_friend_ids = [
        tid for tid in target_player_ids if tid != player_id and tid not in my_friends
    ]
    if not non_friend_ids or not my_friends:
        return counts

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
        counts[row.target_id] = row.cnt
    return counts


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
        return {"statuses": {}, "relationships": {}, "mutual_counts": {}}

    # Get current player's friends
    my_friends = await get_friend_ids(session, player_id)

    relationships = await resolve_relationships(session, player_id, target_player_ids)
    statuses = {
        target_id: relationship["status"] for target_id, relationship in relationships.items()
    }

    # Compute mutual friend counts in a single query instead of per-target
    counts = await batch_mutual_friend_counts(
        session, player_id, target_player_ids, my_friends=my_friends
    )
    mutual_counts = {str(tid): cnt for tid, cnt in counts.items()}

    return {
        "statuses": statuses,
        "relationships": relationships,
        "mutual_counts": mutual_counts,
    }


async def discover_players(
    session: AsyncSession,
    caller_player_id: int,
    search: Optional[str] = None,
    location_id: Optional[str] = None,
    gender: Optional[str] = None,
    level: Optional[str] = None,
    sort_by: Optional[str] = "mutuals",
    sort_dir: Optional[str] = "desc",
    min_games: Optional[int] = None,
    same_league: bool = False,
    has_mutuals: bool = False,
    page: int = 1,
    page_size: int = 25,
) -> Dict:
    """
    Discover players with mutual friend counts and friend status.

    Returns paginated results sorted by mutual friend count (default),
    games, name, or rating. Each item includes mutual_friend_count and
    friend_status for the caller.

    Args:
        session: Database session
        caller_player_id: Authenticated player's ID (excluded from results)
        search: Optional name search filter
        location_id: Optional location filter
        gender: Optional gender filter
        level: Optional level filter
        sort_by: Sort column — mutuals, games, name, rating
        sort_dir: Sort direction — asc or desc
        min_games: Minimum total_games threshold
        same_league: Only players sharing >=1 league with the caller
        has_mutuals: Only players sharing >=1 friend with the caller
        page: Page number (1-indexed)
        page_size: Results per page

    Returns:
        Dict with items, total_count, page, page_size
    """
    my_friends = await get_friend_ids(session, caller_player_id)

    # Build mutual friend count subquery
    if my_friends:
        # Correlated scalar subquery: count friends of each candidate that
        # are also in the caller's friend set.
        FriendAlias = aliased(Friend)
        friend_of_candidate = case(
            (FriendAlias.player1_id == Player.id, FriendAlias.player2_id),
            else_=FriendAlias.player1_id,
        )
        mutual_subq = (
            select(func.count())
            .select_from(FriendAlias)
            .where(
                and_(
                    or_(
                        FriendAlias.player1_id == Player.id,
                        FriendAlias.player2_id == Player.id,
                    ),
                    friend_of_candidate.in_(list(my_friends)),
                )
            )
            .correlate(Player)
            .scalar_subquery()
            .label("mutual_friend_count")
        )
    else:
        mutual_subq = literal(0).label("mutual_friend_count")

    # Base query: Player + stats + location. Stats are a LEFT JOIN with
    # coalesced defaults so brand-new players (no PlayerGlobalStats row, or
    # zero games) are still discoverable by authenticated users.
    total_games_col = func.coalesce(PlayerGlobalStats.total_games, 0)
    current_rating_col = func.coalesce(PlayerGlobalStats.current_rating, 1200.0)
    base_query = (
        select(
            Player.id,
            Player.full_name,
            Player.avatar,
            Player.profile_picture_url,
            Player.gender,
            Player.level,
            Player.is_placeholder,
            Location.name.label("location_name"),
            total_games_col.label("total_games"),
            current_rating_col.label("current_rating"),
            mutual_subq,
        )
        .outerjoin(PlayerGlobalStats, PlayerGlobalStats.player_id == Player.id)
        .outerjoin(Location, Player.location_id == Location.id)
        .where(
            and_(
                Player.id != caller_player_id,
                Player.is_placeholder == False,  # noqa: E712
            )
        )
    )
    base_query = interaction_policy.exclude_blocked_players(
        base_query, caller_player_id, Player.id
    )

    # Apply filters
    if search:
        base_query = base_query.where(Player.full_name.ilike(f"%{search}%"))
    if location_id:
        base_query = base_query.where(Player.location_id == location_id)
    if gender:
        base_query = base_query.where(Player.gender == gender)
    if level:
        base_query = base_query.where(Player.level == level)
    if min_games:
        base_query = base_query.where(total_games_col >= min_games)
    if same_league:
        # Candidates with >=1 league membership in any of the caller's leagues.
        my_league_ids = select(LeagueMember.league_id).where(
            LeagueMember.player_id == caller_player_id
        )
        SameLeagueMember = aliased(LeagueMember)
        base_query = base_query.where(
            Player.id.in_(
                select(SameLeagueMember.player_id).where(
                    SameLeagueMember.league_id.in_(my_league_ids)
                )
            )
        )
    if has_mutuals:
        base_query = base_query.where(mutual_subq > 0)

    # Total count
    count_query = select(func.count()).select_from(base_query.subquery())
    count_result = await session.execute(count_query)
    total_count = count_result.scalar_one() or 0

    # Sort
    descending = sort_dir != "asc"
    sort_columns = {
        "mutuals": mutual_subq,
        "games": total_games_col,
        "name": Player.full_name,
        "rating": current_rating_col,
    }
    primary_col = sort_columns.get(sort_by or "mutuals", mutual_subq)

    if descending:
        base_query = base_query.order_by(primary_col.desc(), Player.full_name.asc())
    else:
        base_query = base_query.order_by(primary_col.asc(), Player.full_name.asc())

    # Paginate
    offset = (page - 1) * page_size
    base_query = base_query.offset(offset).limit(page_size)

    result = await session.execute(base_query)
    rows = result.all()

    if not rows:
        return {
            "items": [],
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
        }

    # Post-fetch: annotate with friend_status
    result_ids = [row.id for row in rows]
    batch_status = await batch_friend_status(session, caller_player_id, result_ids)
    statuses = batch_status["statuses"]
    relationships = batch_status["relationships"]

    items = [
        {
            "id": row.id,
            "full_name": row.full_name,
            "avatar": row.profile_picture_url or row.avatar,
            "gender": row.gender,
            "level": row.level,
            "location_name": row.location_name,
            "total_games": row.total_games,
            "current_rating": row.current_rating,
            "is_placeholder": row.is_placeholder,
            "mutual_friend_count": row.mutual_friend_count,
            "friend_status": statuses.get(str(row.id), "none"),
            "friend_request_id": relationships.get(str(row.id), {}).get("request_id"),
        }
        for row in rows
    ]

    return {
        "items": items,
        "total_count": total_count,
        "page": page,
        "page_size": page_size,
    }


_WEIGHT_MUTUAL = 5
_WEIGHT_SESSION = 2
_WEIGHT_LEAGUE = 1


async def get_friend_suggestions(
    session: AsyncSession, player_id: int, limit: int = 10
) -> List[Dict]:
    """Get friend suggestions based on mutual friends, shared sessions, and shared leagues.

    Computes a composite score per candidate:
        score = mutual_friend_count * 5 + shared_session_count * 2 + shared_league_count * 1

    Args:
        session: Database session
        player_id: Current player
        limit: Max suggestions to return

    Returns:
        List of suggestion dicts with player info, signal counts, and reason string
    """
    # --- 1. Build exclusion set ---
    my_friends = await get_friend_ids(session, player_id)
    exclude_ids = (
        my_friends | {player_id} | await interaction_policy.blocked_player_ids(session, player_id)
    )

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

    exclude_list = list(exclude_ids)

    # --- 2. Signal A: shared leagues ---
    my_leagues_result = await session.execute(
        select(LeagueMember.league_id).where(LeagueMember.player_id == player_id)
    )
    my_league_ids = [row[0] for row in my_leagues_result.all()]

    league_counts: Dict[int, int] = {}
    if my_league_ids:
        OtherMember = aliased(LeagueMember)
        league_result = await session.execute(
            select(
                OtherMember.player_id,
                func.count(OtherMember.league_id).label("cnt"),
            )
            .where(
                and_(
                    OtherMember.league_id.in_(my_league_ids),
                    ~OtherMember.player_id.in_(exclude_list),
                )
            )
            .group_by(OtherMember.player_id)
        )
        league_counts = {row.player_id: row.cnt for row in league_result.all()}

    # --- 3. Signal B: shared sessions ---
    SP1 = aliased(SessionParticipant)
    SP2 = aliased(SessionParticipant)
    session_result = await session.execute(
        select(
            SP2.player_id,
            func.count(func.distinct(SP1.session_id)).label("cnt"),
        )
        .join(SP2, and_(SP1.session_id == SP2.session_id, SP2.player_id != player_id))
        .where(
            and_(
                SP1.player_id == player_id,
                ~SP2.player_id.in_(exclude_list),
            )
        )
        .group_by(SP2.player_id)
    )
    session_counts: Dict[int, int] = {row.player_id: row.cnt for row in session_result.all()}

    # --- 4. Union candidate IDs from league + session signals ---
    candidate_ids = (set(league_counts.keys()) | set(session_counts.keys())) - exclude_ids
    if not candidate_ids and not my_friends:
        return []

    # --- 5. Signal C: mutual friends (batch, reusing batch_friend_status pattern) ---
    mutual_counts: Dict[int, int] = {}
    # Also check friends-of-friends who might not be in league/session signals
    if my_friends:
        # Find all players who are friends with any of my_friends (potential candidates)
        friend_of_friend_col = case(
            (Friend.player1_id.in_(list(my_friends)), Friend.player2_id),
            else_=Friend.player1_id,
        )
        fof_result = await session.execute(
            select(
                friend_of_friend_col.label("candidate_id"),
                func.count().label("cnt"),
            )
            .where(
                and_(
                    or_(
                        Friend.player1_id.in_(list(my_friends)),
                        Friend.player2_id.in_(list(my_friends)),
                    ),
                    ~friend_of_friend_col.in_(exclude_list),
                )
            )
            .group_by(friend_of_friend_col)
        )
        mutual_counts = {row.candidate_id: row.cnt for row in fof_result.all()}

    # Expand candidate set with mutual-friend-based candidates
    candidate_ids = candidate_ids | set(mutual_counts.keys())
    if not candidate_ids:
        return []

    # --- 6. Score and rank ---
    scored = []
    for cid in candidate_ids:
        m = mutual_counts.get(cid, 0)
        s = session_counts.get(cid, 0)
        lg = league_counts.get(cid, 0)
        score = m * _WEIGHT_MUTUAL + s * _WEIGHT_SESSION + lg * _WEIGHT_LEAGUE
        scored.append((cid, score, m, s, lg))

    scored.sort(key=lambda x: x[1], reverse=True)
    top = scored[:limit]

    if not top:
        return []

    # --- 7. Hydrate player details ---
    top_ids = [t[0] for t in top]
    player_result = await session.execute(
        select(
            Player.id,
            Player.full_name,
            Player.avatar,
            Player.profile_picture_url,
            Player.level,
            Player.user_id,
            Location.name.label("location_name"),
        )
        .outerjoin(Location, Player.location_id == Location.id)
        .where(and_(Player.id.in_(top_ids), Player.user_id.isnot(None)))
    )
    player_map = {row.id: row for row in player_result.all()}

    # --- 8. Build reason strings ---
    # For league-only reasons, fetch league names for candidates with league_cnt == 1
    league_name_map = await _resolve_shared_league_names(
        session, player_id, my_league_ids, top, player_map
    )

    suggestions = []
    for cid, _score, m, s, lg in top:
        p = player_map.get(cid)
        if not p:
            continue
        reason = _build_reason(cid, m, s, lg, league_name_map)
        suggestions.append(
            {
                "player_id": p.id,
                "full_name": p.full_name,
                "avatar": p.profile_picture_url or p.avatar,
                "level": p.level,
                "location_name": p.location_name,
                "shared_league_count": lg,
                "mutual_friend_count": m,
                "shared_session_count": s,
                "reason": reason,
            }
        )

    return suggestions


async def _resolve_shared_league_names(
    session: AsyncSession,
    player_id: int,
    my_league_ids: List[int],
    top: List[tuple],
    player_map: Dict,
) -> Dict[int, str]:
    """For candidates whose primary reason is leagues, fetch the shared league name.

    Only fetches names for candidates where mutual_cnt == 0, session_cnt == 0,
    and league_cnt == 1 (single shared league — we show its name).

    Returns:
        Dict mapping candidate_id -> league name.
    """
    single_league_cids = [
        cid for cid, _, m, s, lg in top if m == 0 and s == 0 and lg == 1 and cid in player_map
    ]
    if not single_league_cids or not my_league_ids:
        return {}

    OtherMember = aliased(LeagueMember)
    rows = await session.execute(
        select(OtherMember.player_id, League.name)
        .join(League, OtherMember.league_id == League.id)
        .where(
            and_(
                OtherMember.player_id.in_(single_league_cids),
                OtherMember.league_id.in_(my_league_ids),
            )
        )
    )
    return {row.player_id: row.name for row in rows.all()}


def _build_reason(
    candidate_id: int,
    mutual_cnt: int,
    session_cnt: int,
    league_cnt: int,
    league_name_map: Dict[int, str],
) -> str:
    """Build a human-readable reason string for a suggestion.

    Priority: mutuals > sessions > leagues.
    """
    if mutual_cnt >= 1:
        noun = "mutual friend" if mutual_cnt == 1 else "mutual friends"
        return f"{mutual_cnt} {noun}"
    if session_cnt >= 1:
        if session_cnt == 1:
            return "Played together once"
        return f"Played together {session_cnt} times"
    if league_cnt == 1:
        name = league_name_map.get(candidate_id)
        if name:
            return f"In {name}"
        return "1 shared league"
    if league_cnt > 1:
        return f"{league_cnt} shared leagues"
    return ""


async def _format_friend_requests_batch(
    session: AsyncSession,
    requests: List[FriendRequest],
    viewer_player_id: Optional[int] = None,
) -> List[Dict]:
    """
    Batch-format FriendRequest ORM objects into response dicts with player names.

    Fetches all referenced player info in a single query instead of per-request.

    Args:
        session: Database session
        requests: List of FriendRequest ORM objects
        viewer_player_id: When set, each dict also carries
            ``mutual_friends_count`` and ``shared_league_name`` — the
            viewer's mutual friends with, and one league shared with, the
            request's counterpart (sender for incoming, receiver for
            outgoing) — each computed in one batched query.

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
        select(
            Player.id,
            Player.full_name,
            Player.avatar,
            Player.profile_picture_url,
        ).where(Player.id.in_(list(player_ids)))
    )
    player_map = {row.id: row for row in result.all()}

    mutual_counts: Dict[int, int] = {}
    shared_leagues: Dict[int, str] = {}
    if viewer_player_id is not None:
        counterpart_ids = list(
            {
                req.sender_player_id
                if req.sender_player_id != viewer_player_id
                else req.receiver_player_id
                for req in requests
            }
        )
        mutual_counts = await batch_mutual_friend_counts(
            session, viewer_player_id, counterpart_ids
        )
        shared_leagues = await batch_shared_league_names(
            session, viewer_player_id, counterpart_ids
        )

    formatted = []
    for req in requests:
        sender = player_map.get(req.sender_player_id)
        receiver = player_map.get(req.receiver_player_id)
        counterpart_id = (
            req.sender_player_id
            if req.sender_player_id != viewer_player_id
            else req.receiver_player_id
        )
        formatted.append(
            {
                "id": req.id,
                "sender_player_id": req.sender_player_id,
                "sender_name": sender.full_name if sender else "Unknown",
                "sender_avatar": (sender.profile_picture_url or sender.avatar if sender else None),
                "receiver_player_id": req.receiver_player_id,
                "receiver_name": receiver.full_name if receiver else "Unknown",
                "receiver_avatar": (
                    receiver.profile_picture_url or receiver.avatar if receiver else None
                ),
                "status": req.status,
                "created_at": req.created_at.isoformat() if req.created_at else None,
                "mutual_friends_count": mutual_counts.get(counterpart_id, 0),
                "shared_league_name": shared_leagues.get(counterpart_id),
            }
        )
    return formatted


async def _format_friend_request(session: AsyncSession, friend_request: FriendRequest) -> Dict:
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
