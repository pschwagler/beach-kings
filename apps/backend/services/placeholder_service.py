"""
Placeholder player service layer.

Handles CRUD operations for placeholder players: creation, listing,
deletion (with match reassignment), placeholder detection for
is_ranked enforcement, invite details, and claim/merge flows.
"""

import os
import secrets
import logging
from typing import Optional, List

from sqlalchemy import select, and_, or_, func, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    Player,
    PlayerInvite,
    InviteStatus,
    LeagueMember,
    Match,
    League,
    SessionParticipant,
    NotificationType,
)
from backend.models.schemas import (
    PlaceholderPlayerResponse,
    PlaceholderListItem,
    PlaceholderListResponse,
    DeletePlaceholderResponse,
    InviteDetailsResponse,
    ClaimInviteResponse,
)

logger = logging.getLogger(__name__)

FRONTEND_BASE_URL = os.getenv("FRONTEND_URL", "https://beachkings.com")


async def create_placeholder(
    session: AsyncSession,
    name: str,
    created_by_player_id: int,
    phone_number: Optional[str] = None,
    league_id: Optional[int] = None,
) -> PlaceholderPlayerResponse:
    """
    Create a placeholder player with an associated invite link.

    Args:
        session: Database session
        name: Display name for the placeholder
        created_by_player_id: Player ID of the creator
        phone_number: Optional phone number for SMS invite
        league_id: Optional league to add the placeholder to as a member

    Returns:
        PlaceholderPlayerResponse with player_id, name, invite_token, invite_url
    """
    # Create the placeholder player record
    player = Player(
        full_name=name,
        is_placeholder=True,
        created_by_player_id=created_by_player_id,
        user_id=None,
    )
    session.add(player)
    await session.flush()

    # Generate unique invite token and create invite
    token = secrets.token_urlsafe(32)
    invite = PlayerInvite(
        player_id=player.id,
        invite_token=token,
        created_by_player_id=created_by_player_id,
        phone_number=phone_number,
        status=InviteStatus.PENDING.value,
    )
    session.add(invite)

    # If league_id provided, add placeholder as a league member
    if league_id is not None:
        league_member = LeagueMember(
            league_id=league_id,
            player_id=player.id,
            role="placeholder",
            created_by=created_by_player_id,
        )
        session.add(league_member)

    await session.commit()
    await session.refresh(player)

    invite_url = f"{FRONTEND_BASE_URL}/invite/{token}"
    logger.info(
        "Created placeholder player %d '%s' by player %d",
        player.id, name, created_by_player_id,
    )

    return PlaceholderPlayerResponse(
        player_id=player.id,
        name=name,
        invite_token=token,
        invite_url=invite_url,
    )


async def list_placeholders(
    session: AsyncSession,
    creator_player_id: int,
) -> PlaceholderListResponse:
    """
    List all placeholder players created by a given player.

    Each item includes the placeholder's match count (across all 4 player FK
    columns on the matches table).

    Args:
        session: Database session
        creator_player_id: Player ID of the creator

    Returns:
        PlaceholderListResponse with list of PlaceholderListItem
    """
    # Query placeholders with their invites
    stmt = (
        select(Player, PlayerInvite)
        .join(PlayerInvite, PlayerInvite.player_id == Player.id)
        .where(
            and_(
                Player.is_placeholder.is_(True),
                PlayerInvite.created_by_player_id == creator_player_id,
            )
        )
        .order_by(Player.created_at.desc())
    )
    result = await session.execute(stmt)
    rows = result.all()

    items = []
    for player, invite in rows:
        # Count matches involving this placeholder
        match_count = await _count_matches_for_player(session, player.id)

        invite_url = f"{FRONTEND_BASE_URL}/invite/{invite.invite_token}"
        items.append(
            PlaceholderListItem(
                player_id=player.id,
                name=player.full_name,
                phone_number=invite.phone_number,
                match_count=match_count,
                invite_token=invite.invite_token,
                invite_url=invite_url,
                status=invite.status,
                created_at=player.created_at.isoformat() if player.created_at else "",
            )
        )

    return PlaceholderListResponse(placeholders=items)


async def delete_placeholder(
    session: AsyncSession,
    player_id: int,
    creator_player_id: int,
) -> DeletePlaceholderResponse:
    """
    Delete a placeholder player, reassigning its matches to "Unknown Player".

    Steps:
      1. Verify placeholder exists and belongs to the creator
      2. Find the system "Unknown Player" record
      3. Reassign all match FK columns referencing this placeholder
      4. Set affected matches is_ranked=false
      5. Delete LeagueMember rows for the placeholder
      6. Delete the placeholder Player (cascades to PlayerInvite)

    Args:
        session: Database session
        player_id: ID of the placeholder to delete
        creator_player_id: Player ID of the requesting user (must be creator)

    Returns:
        DeletePlaceholderResponse with affected_matches count

    Raises:
        ValueError: If player not found or not a placeholder
        PermissionError: If creator_player_id doesn't match
    """
    # Verify placeholder exists and is owned by the caller
    result = await session.execute(
        select(Player).where(
            and_(
                Player.id == player_id,
                Player.is_placeholder.is_(True),
            )
        )
    )
    placeholder = result.scalar_one_or_none()
    if placeholder is None:
        raise ValueError("Placeholder player not found")
    if placeholder.created_by_player_id != creator_player_id:
        raise PermissionError("You can only delete placeholders you created")

    # Find the system "Unknown Player" record
    unknown_result = await session.execute(
        select(Player).where(
            and_(
                Player.full_name == "Unknown Player",
                Player.status == "system",
            )
        )
    )
    unknown_player = unknown_result.scalar_one_or_none()
    if unknown_player is None:
        # Create the system record if it doesn't exist yet
        unknown_player = Player(
            full_name="Unknown Player",
            user_id=None,
            is_placeholder=False,
            status="system",
        )
        session.add(unknown_player)
        await session.flush()

    unknown_id = unknown_player.id

    # Find all matches referencing this placeholder (any of the 4 FK columns)
    match_condition = or_(
        Match.team1_player1_id == player_id,
        Match.team1_player2_id == player_id,
        Match.team2_player1_id == player_id,
        Match.team2_player2_id == player_id,
    )
    count_result = await session.execute(
        select(func.count(Match.id)).where(match_condition)
    )
    affected_count = count_result.scalar() or 0

    # Reassign each FK column and mark affected matches as unranked
    for col_name in [
        "team1_player1_id",
        "team1_player2_id",
        "team2_player1_id",
        "team2_player2_id",
    ]:
        await session.execute(
            update(Match)
            .where(getattr(Match, col_name) == player_id)
            .values(**{col_name: unknown_id, "is_ranked": False})
        )

    # Delete league memberships for the placeholder
    await session.execute(
        delete(LeagueMember).where(LeagueMember.player_id == player_id)
    )

    # Delete session participations for the placeholder
    await session.execute(
        delete(SessionParticipant).where(SessionParticipant.player_id == player_id)
    )

    # Delete the placeholder player (cascades to PlayerInvite)
    await session.execute(
        delete(Player).where(Player.id == player_id)
    )

    await session.commit()
    logger.info(
        "Deleted placeholder %d, reassigned %d matches to Unknown Player",
        player_id, affected_count,
    )

    return DeletePlaceholderResponse(affected_matches=affected_count)


async def check_match_has_placeholders(
    session: AsyncSession,
    player_ids: list[int],
) -> bool:
    """
    Check if any of the given player IDs are placeholder players.

    Args:
        session: Database session
        player_ids: List of player IDs to check

    Returns:
        True if any player is a placeholder, False otherwise
    """
    if not player_ids:
        return False

    result = await session.execute(
        select(func.count(Player.id)).where(
            and_(
                Player.id.in_(player_ids),
                Player.is_placeholder.is_(True),
            )
        )
    )
    count = result.scalar() or 0
    return count > 0


async def _count_matches_for_player(
    session: AsyncSession,
    player_id: int,
) -> int:
    """
    Count total matches where a player appears in any of the 4 FK columns.

    Args:
        session: Database session
        player_id: Player ID to count matches for

    Returns:
        Number of matches involving this player
    """
    result = await session.execute(
        select(func.count(Match.id)).where(
            or_(
                Match.team1_player1_id == player_id,
                Match.team1_player2_id == player_id,
                Match.team2_player1_id == player_id,
                Match.team2_player2_id == player_id,
            )
        )
    )
    return result.scalar() or 0


# ============================================================================
# Invite Details & Claim/Merge
# ============================================================================


async def get_invite_details(
    session: AsyncSession,
    token: str,
) -> InviteDetailsResponse:
    """
    Retrieve public-facing invite details for the landing page.

    Looks up the invite by token, resolves the placeholder name, inviter
    name, match count, and league names.

    Args:
        session: Database session
        token: The unique invite token from the URL

    Returns:
        InviteDetailsResponse with inviter_name, placeholder_name, match_count,
        league_names, and status

    Raises:
        ValueError: If token is not found
    """
    # Load invite with placeholder and creator players
    stmt = (
        select(PlayerInvite, Player)
        .join(Player, Player.id == PlayerInvite.player_id)
        .where(PlayerInvite.invite_token == token)
    )
    result = await session.execute(stmt)
    row = result.first()
    if row is None:
        raise ValueError("Invite not found")

    invite, placeholder = row

    # Resolve inviter name
    inviter_name = "Unknown"
    if invite.created_by_player_id:
        creator = await session.get(Player, invite.created_by_player_id)
        if creator:
            inviter_name = creator.full_name

    # Count matches for the placeholder
    match_count = await _count_matches_for_player(session, placeholder.id)

    # Get league names via LeagueMember → League
    league_stmt = (
        select(League.name)
        .join(LeagueMember, LeagueMember.league_id == League.id)
        .where(LeagueMember.player_id == placeholder.id)
    )
    league_result = await session.execute(league_stmt)
    league_names = [row[0] for row in league_result.all()]

    return InviteDetailsResponse(
        inviter_name=inviter_name,
        placeholder_name=placeholder.full_name,
        match_count=match_count,
        league_names=league_names,
        status=invite.status,
    )


async def merge_placeholder_into_player(
    session: AsyncSession,
    placeholder_id: int,
    target_player_id: int,
) -> dict:
    """
    Merge a placeholder player into an existing real player in a single transaction.

    Steps:
      1. Detect conflicting matches (both placeholder and target appear)
      2. Transfer non-conflicting match FKs to target
      3. Transfer match created_by references
      4. Transfer session_participants (skip duplicates)
      5. Transfer league memberships (skip duplicates)
      6. Delete placeholder if no conflicting matches remain

    Args:
        session: Database session
        placeholder_id: ID of the placeholder player being merged away
        target_player_id: ID of the real player absorbing the placeholder

    Returns:
        Dict with conflicting_match_ids (list[int]) and transferred_matches (int)
    """
    match_fk_cols = [
        "team1_player1_id",
        "team1_player2_id",
        "team2_player1_id",
        "team2_player2_id",
    ]

    # 1. Find conflicting matches: both placeholder and target appear
    placeholder_condition = or_(*(
        getattr(Match, col) == placeholder_id for col in match_fk_cols
    ))
    target_condition = or_(*(
        getattr(Match, col) == target_player_id for col in match_fk_cols
    ))
    conflict_stmt = select(Match.id).where(and_(placeholder_condition, target_condition))
    conflict_result = await session.execute(conflict_stmt)
    conflicting_match_ids = [row[0] for row in conflict_result.all()]

    # 2. Transfer non-conflicting match FKs
    transferred = 0
    for col_name in match_fk_cols:
        col = getattr(Match, col_name)
        stmt = (
            update(Match)
            .where(and_(
                col == placeholder_id,
                ~Match.id.in_(conflicting_match_ids) if conflicting_match_ids else True,
            ))
            .values(**{col_name: target_player_id})
        )
        result = await session.execute(stmt)
        transferred += result.rowcount

    # 3. Transfer match created_by
    await session.execute(
        update(Match)
        .where(Match.created_by == placeholder_id)
        .values(created_by=target_player_id)
    )

    # 4. Transfer session_participants (skip if target already in that session)
    sp_stmt = select(SessionParticipant).where(
        SessionParticipant.player_id == placeholder_id
    )
    sp_result = await session.execute(sp_stmt)
    placeholder_sps = sp_result.scalars().all()

    for sp in placeholder_sps:
        # Check if target already participates in this session
        existing = await session.execute(
            select(SessionParticipant.id).where(and_(
                SessionParticipant.session_id == sp.session_id,
                SessionParticipant.player_id == target_player_id,
            ))
        )
        if existing.scalar_one_or_none() is not None:
            # Duplicate — delete placeholder's row
            await session.execute(
                delete(SessionParticipant).where(SessionParticipant.id == sp.id)
            )
        else:
            # Transfer to target
            await session.execute(
                update(SessionParticipant)
                .where(SessionParticipant.id == sp.id)
                .values(player_id=target_player_id)
            )

    # 5. Transfer league memberships (skip if target already a member)
    lm_stmt = select(LeagueMember).where(
        LeagueMember.player_id == placeholder_id
    )
    lm_result = await session.execute(lm_stmt)
    placeholder_lms = lm_result.scalars().all()

    for lm in placeholder_lms:
        existing = await session.execute(
            select(LeagueMember.id).where(and_(
                LeagueMember.league_id == lm.league_id,
                LeagueMember.player_id == target_player_id,
            ))
        )
        if existing.scalar_one_or_none() is not None:
            # Target already in this league — delete placeholder's membership
            await session.execute(
                delete(LeagueMember).where(LeagueMember.id == lm.id)
            )
        else:
            # Transfer membership to target with role "member"
            await session.execute(
                update(LeagueMember)
                .where(LeagueMember.id == lm.id)
                .values(player_id=target_player_id, role="member")
            )

    # 6. Delete placeholder only if no conflicting matches
    if not conflicting_match_ids:
        await session.execute(
            delete(Player).where(Player.id == placeholder_id)
        )

    return {
        "conflicting_match_ids": conflicting_match_ids,
        "transferred_matches": transferred,
    }


async def flip_ranked_status_for_resolved_matches(
    session: AsyncSession,
    player_id: int,
) -> int:
    """
    Flip is_ranked to True for matches where all 4 players are now real.

    After a placeholder is claimed/merged, check every match involving
    the given player_id. If none of the 4 player FK columns reference
    a placeholder, set is_ranked=True.

    Args:
        session: Database session
        player_id: The player whose matches should be checked

    Returns:
        Count of matches flipped from unranked to ranked
    """
    # Find all unranked matches involving this player
    match_condition = or_(
        Match.team1_player1_id == player_id,
        Match.team1_player2_id == player_id,
        Match.team2_player1_id == player_id,
        Match.team2_player2_id == player_id,
    )
    stmt = select(Match).where(and_(match_condition, Match.is_ranked.is_(False)))
    result = await session.execute(stmt)
    matches = result.scalars().all()

    flipped = 0
    for match in matches:
        # Collect all 4 player IDs in this match
        all_player_ids = [
            match.team1_player1_id,
            match.team1_player2_id,
            match.team2_player1_id,
            match.team2_player2_id,
        ]
        # Check if any are still placeholders
        has_placeholder = await check_match_has_placeholders(session, all_player_ids)
        if not has_placeholder:
            await session.execute(
                update(Match)
                .where(Match.id == match.id)
                .values(is_ranked=True)
            )
            flipped += 1

    return flipped


async def claim_invite(
    session: AsyncSession,
    token: str,
    claiming_user_id: int,
) -> ClaimInviteResponse:
    """
    Orchestrate the full invite claim flow.

    Handles two paths:
      - **No existing player**: The placeholder becomes the claiming user's player
        (user_id set, is_placeholder flipped to False).
      - **Has existing player (merge)**: All match/session/league references are
        transferred from the placeholder to the existing player.

    After either path: flip ranked status on affected matches, update invite
    status, enqueue stats recalc, and create a notification for the invite
    creator.

    Args:
        session: Database session
        token: The unique invite token
        claiming_user_id: The authenticated user's ID

    Returns:
        ClaimInviteResponse with success, message, player_id, warnings,
        redirect_url

    Raises:
        ValueError: If token not found or invite already claimed
    """
    from backend.services import data_service, notification_service
    from backend.services.stats_queue import get_stats_queue
    from backend.utils.datetime_utils import utcnow

    # 1. Look up invite by token
    invite_result = await session.execute(
        select(PlayerInvite).where(PlayerInvite.invite_token == token)
    )
    invite = invite_result.scalar_one_or_none()
    if invite is None:
        raise ValueError("Invite not found")
    if invite.status == InviteStatus.CLAIMED.value:
        raise ValueError("Invite has already been claimed")

    placeholder_id = invite.player_id

    # Load the placeholder player
    placeholder = await session.get(Player, placeholder_id)
    if placeholder is None:
        raise ValueError("Placeholder player not found")

    # 2. Check if claiming user already has a player profile
    existing_player = await data_service.get_player_by_user_id(session, claiming_user_id)

    warnings: List[str] = []
    target_player_id: int

    if existing_player is None:
        # --- No existing player path ---
        # Convert the placeholder into the user's real player
        await session.execute(
            update(Player)
            .where(Player.id == placeholder_id)
            .values(user_id=claiming_user_id, is_placeholder=False)
        )
        target_player_id = placeholder_id
    else:
        # --- Merge path ---
        target_player_id = existing_player["id"]
        merge_result = await merge_placeholder_into_player(
            session, placeholder_id, target_player_id
        )
        if merge_result["conflicting_match_ids"]:
            warnings.append(
                f"{len(merge_result['conflicting_match_ids'])} match(es) already "
                f"include you and the placeholder — these were skipped during merge."
            )

    # 3. Flip ranked status on affected matches
    flipped = await flip_ranked_status_for_resolved_matches(session, target_player_id)
    if flipped:
        logger.info("Flipped %d match(es) to ranked after claim", flipped)

    # 4. Update invite record
    await session.execute(
        update(PlayerInvite)
        .where(PlayerInvite.id == invite.id)
        .values(
            status=InviteStatus.CLAIMED.value,
            claimed_by_user_id=claiming_user_id,
            claimed_at=utcnow(),
        )
    )

    # 5. Collect affected league IDs for stats recalc
    league_stmt = select(LeagueMember.league_id).where(
        LeagueMember.player_id == target_player_id
    )
    league_result = await session.execute(league_stmt)
    affected_league_ids = [row[0] for row in league_result.all()]

    await session.commit()

    # 6. Enqueue stats recalculation (global + per league)
    try:
        queue = get_stats_queue()
        await queue.enqueue_calculation(session, "global", None)
        for league_id in affected_league_ids:
            await queue.enqueue_calculation(session, "league", league_id)
    except Exception:
        logger.warning("Failed to enqueue stats recalc after claim", exc_info=True)

    # 7. Notify the invite creator
    if invite.created_by_player_id:
        creator = await session.get(Player, invite.created_by_player_id)
        if creator and creator.user_id:
            try:
                await notification_service.create_notification(
                    session=session,
                    user_id=creator.user_id,
                    type=NotificationType.PLACEHOLDER_CLAIMED.value,
                    title="Invite Claimed",
                    message=f"{placeholder.full_name} has claimed their invite and joined Beach Kings.",
                    data={"placeholder_id": placeholder_id, "claimed_by_user_id": claiming_user_id},
                    link_url=f"/players/{target_player_id}",
                )
                await session.commit()
            except Exception:
                logger.warning("Failed to create claim notification", exc_info=True)

    redirect_url = f"/leagues" if affected_league_ids else f"/dashboard"

    return ClaimInviteResponse(
        success=True,
        message="Invite claimed successfully.",
        player_id=target_player_id,
        warnings=warnings if warnings else None,
        redirect_url=redirect_url,
    )
