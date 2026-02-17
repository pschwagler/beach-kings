"""League route handlers."""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.db import get_db_session
from backend.database.models import Player, LeagueMember
from backend.services import data_service, notification_service
from backend.api.auth_dependencies import (
    get_current_user_optional,
    require_user,
    require_system_admin,
    make_require_league_admin,
    make_require_league_member,
)
from backend.models.schemas import LeagueCreate, LeagueResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/api/leagues", response_model=LeagueResponse)
async def create_league(
    payload: LeagueCreate,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Create a new league. Any authenticated user can create.
    """
    try:
        league = await data_service.create_league(
            session=session,
            name=payload.name,
            description=payload.description,
            location_id=payload.location_id,
            is_open=payload.is_open,
            whatsapp_group_id=payload.whatsapp_group_id,
            creator_user_id=user["id"],
            gender=payload.gender,
            level=payload.level,
        )
        return league
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating league: {str(e)}")


@router.get("/api/leagues")
async def list_leagues(session: AsyncSession = Depends(get_db_session)):
    """
    List leagues (public).
    """
    try:
        return await data_service.list_leagues(session)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing leagues: {str(e)}")


@router.post("/api/leagues/query")
async def query_leagues(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    """
    Query leagues with filters, ordering, and pagination.

    Body: {
        location_id?: string,
        region_id?: string,
        gender?: string,
        level?: string,
        order?: string,   # e.g., "name:asc", "created_at:desc", "member_count:desc"
        page?: number,    # 1-based page index, default 1
        page_size?: number  # page size, default 25
    }

    Returns:
        {
            "items": [...],
            "page": number,
            "page_size": number,
            "total_count": number
        }
    """
    try:
        body = await request.json()
        page = body.get("page") or 1
        page_size = body.get("page_size") or 25
        result = await data_service.query_leagues(
            session,
            location_id=body.get("location_id"),
            region_id=body.get("region_id"),
            gender=body.get("gender"),
            level=body.get("level"),
            order=body.get("order"),
            page=page,
            page_size=page_size,
            include_joined=body.get("include_joined") or False,
            user_id=user["id"] if user else None,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error querying leagues: {str(e)}")


@router.get("/api/leagues/{league_id}", response_model=LeagueResponse)
async def get_league(
    league_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: dict = Depends(require_user),
):
    """
    Get a league by id. Requires authentication.
    Returns basic league information for any authenticated user,
    allowing non-members to see the league and decide if they want to join.
    """
    try:
        # Check if league exists
        league = await data_service.get_league(session, league_id)
        if not league:
            raise HTTPException(status_code=404, detail="League not found")
        return league
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting league: {str(e)}")


@router.put("/api/leagues/{league_id}", response_model=LeagueResponse)
async def update_league(
    league_id: int,
    payload: LeagueCreate,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Update league profile fields (league_admin or system_admin).
    """
    try:
        league = await data_service.update_league(
            session=session,
            league_id=league_id,
            name=payload.name,
            description=payload.description,
            location_id=payload.location_id,
            is_open=payload.is_open,
            whatsapp_group_id=payload.whatsapp_group_id,
            gender=payload.gender,
            level=payload.level,
        )
        if not league:
            raise HTTPException(status_code=404, detail="League not found")
        return league
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating league: {str(e)}")


@router.delete("/api/leagues/{league_id}")
async def delete_league(
    league_id: int,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Archive/delete a league (system_admin).
    """
    try:
        success = await data_service.delete_league(session, league_id)
        if not success:
            raise HTTPException(status_code=404, detail="League not found")
        return {"success": True, "message": "League deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting league: {str(e)}")


# ---------------------------------------------------------------------------
# League members
# ---------------------------------------------------------------------------


@router.get("/api/leagues/{league_id}/members")
async def list_league_members(
    league_id: int,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """List league members (league_member). Requires authentication only (no league membership required)."""
    try:
        return await data_service.list_league_members(session, league_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing members: {str(e)}")


@router.post("/api/leagues/{league_id}/members")
async def add_league_member(
    league_id: int,
    request: Request,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session),
):
    """Add player to league with role (league_admin)."""
    try:
        body = await request.json()
        player_id = body["player_id"]
        role = body.get("role", "member")
        member = await data_service.add_league_member(session, league_id, player_id, role)

        # Notify all league members about the new member (non-blocking)
        try:
            # Get player user_id for notification
            player_result = await session.execute(
                select(Player.user_id).where(Player.id == player_id)
            )
            player_user_id = player_result.scalar_one_or_none()

            if player_user_id:
                asyncio.create_task(
                    notification_service.notify_members_about_new_member(
                        session=session, league_id=league_id, new_member_user_id=player_user_id
                    )
                )
        except Exception as e:
            # Don't fail the member addition if notification fails
            logger.warning(f"Failed to create notification for new league member: {e}")

        return member
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Missing required field: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding member: {str(e)}")


@router.post("/api/leagues/{league_id}/members_batch")
async def add_league_members_batch(
    league_id: int,
    request: Request,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session),
):
    """Add multiple players to a league in one request (league_admin).
    Body: { "members": [{ "player_id": number, "role": "member"|"admin" }] }.
    Returns: { "added": [...], "failed": [{"player_id": number, "error": string}] }.
    """
    try:
        body = await request.json()
        members = body.get("members")
        if not isinstance(members, list):
            raise HTTPException(status_code=400, detail="members must be an array")
        result = await data_service.add_league_members_batch(session, league_id, members)
        added = result.get("added", [])
        # Notify league members about each new member (non-blocking)
        for member in added:
            try:
                player_id = member.get("player_id")
                if not player_id:
                    continue
                player_result = await session.execute(
                    select(Player.user_id).where(Player.id == player_id)
                )
                player_user_id = player_result.scalar_one_or_none()
                if player_user_id:
                    asyncio.create_task(
                        notification_service.notify_members_about_new_member(
                            session=session,
                            league_id=league_id,
                            new_member_user_id=player_user_id,
                        )
                    )
            except Exception as e:
                logger.warning(f"Failed to create notification for new league member: {e}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error batch adding league members: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/leagues/{league_id}/members/{member_id}")
async def update_league_member(
    league_id: int,
    member_id: int,
    request: Request,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session),
):
    """Update league member role (league_admin)."""
    try:
        body = await request.json()
        role = body.get("role")
        if role not in ("admin", "member"):
            raise HTTPException(status_code=400, detail="Invalid role")
        member = await data_service.update_league_member(session, league_id, member_id, role)
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")
        return member
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating member: {str(e)}")


@router.delete("/api/leagues/{league_id}/members/{member_id}")
async def remove_league_member(
    league_id: int,
    member_id: int,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session),
):
    """Remove league member (league_admin)."""
    try:
        # Get member info before removing so we can notify them
        member_result = await session.execute(
            select(LeagueMember, Player.user_id)
            .join(Player, Player.id == LeagueMember.player_id)
            .where(and_(LeagueMember.id == member_id, LeagueMember.league_id == league_id))
        )
        member_data = member_result.first()

        if not member_data:
            raise HTTPException(status_code=404, detail="Member not found")

        member, player_user_id = member_data

        # Remove the member
        success = await data_service.remove_league_member(session, league_id, member_id)
        if not success:
            raise HTTPException(status_code=404, detail="Member not found")

        # Notify the removed player (non-blocking)
        if player_user_id:
            asyncio.create_task(
                notification_service.notify_player_about_removal_from_league(
                    session=session, league_id=league_id, removed_user_id=player_user_id
                )
            )

        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error removing member: {str(e)}")


# ---------------------------------------------------------------------------
# Join / Leave / Request
# ---------------------------------------------------------------------------


@router.post("/api/leagues/{league_id}/join")
async def join_league(
    league_id: int,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Join a public league (authenticated user).
    User can only join open leagues.
    """
    try:
        # Get the league
        league = await data_service.get_league(session, league_id)
        if not league:
            raise HTTPException(status_code=404, detail="League not found")

        # Check if league is open
        if not league.get("is_open"):
            raise HTTPException(
                status_code=400,
                detail="This league is invite-only. Please request to join instead.",
            )

        # Get user's player profile
        player = await data_service.get_player_by_user_id(session, user["id"])
        if not player:
            raise HTTPException(
                status_code=404,
                detail="Player profile not found. Please create a player profile first.",
            )

        # Check if user is already a member
        is_member = await data_service.is_league_member(session, league_id, player["id"])
        if is_member:
            raise HTTPException(status_code=400, detail="You are already a member of this league")

        # Add member
        member = await data_service.add_league_member(session, league_id, player["id"], "member")

        # Notify all league members about the new member (excluding the new member themselves)
        try:
            await notification_service.notify_members_about_new_member(
                session=session, league_id=league_id, new_member_user_id=user["id"]
            )
        except Exception as e:
            # Don't fail the join if notification fails
            logger.warning(f"Failed to create notification for new league member: {e}")

        return {"success": True, "message": "Successfully joined the league", "member": member}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error joining league: {str(e)}")


@router.post("/api/leagues/{league_id}/request-join")
async def request_to_join_league(
    league_id: int,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Request to join an invite-only league (authenticated user).
    Creates a join request that league admins can review via notification action buttons.

    Note: Admins receive notifications with approve/reject buttons. The approve/reject
    endpoints are defined below. See: LeagueRequest model for data structure.
    """
    try:
        # Get the league
        league = await data_service.get_league(session, league_id)
        if not league:
            raise HTTPException(status_code=404, detail="League not found")

        # Check if league is invite-only (not open)
        if league.get("is_open"):
            raise HTTPException(
                status_code=400, detail="This league is open. You can join directly instead."
            )

        # Get user's player profile
        player = await data_service.get_player_by_user_id(session, user["id"])
        if not player:
            raise HTTPException(
                status_code=404,
                detail="Player profile not found. Please create a player profile first.",
            )

        # Check if user is already a member
        is_member = await data_service.is_league_member(session, league_id, player["id"])
        if is_member:
            raise HTTPException(status_code=400, detail="You are already a member of this league")

        # Create a join request record
        try:
            request = await data_service.create_league_request(session, league_id, player["id"])

            # Notify league admins about the join request
            try:
                await notification_service.notify_admins_about_join_request(
                    session=session,
                    league_id=league_id,
                    request_id=request["id"],
                    player_id=player["id"],
                )
            except Exception as e:
                # Don't fail the request creation if notification fails
                logger.warning(f"Failed to create notifications for league join request: {e}")

            return {
                "success": True,
                "message": "Join request submitted. League admins will be notified.",
                "request_id": request["id"],
            }
        except ValueError as e:
            # Handle case where request already exists
            raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error requesting to join league: {str(e)}")


@router.post("/api/leagues/{league_id}/join-requests/{request_id}/approve")
async def approve_league_join_request(
    league_id: int,
    request_id: int,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Approve a join request and add the player to the league (league_admin).
    """
    try:
        from backend.database.models import LeagueRequest

        # Get the join request
        request_result = await session.execute(
            select(LeagueRequest).where(
                and_(
                    LeagueRequest.id == request_id,
                    LeagueRequest.league_id == league_id,
                    LeagueRequest.status == "pending",
                )
            )
        )
        join_request = request_result.scalar_one_or_none()

        if not join_request:
            raise HTTPException(
                status_code=404, detail="Join request not found or already processed"
            )

        # Add player to league
        player_id = join_request.player_id
        member = await data_service.add_league_member(session, league_id, player_id, "member")

        # Update request status to approved
        await session.execute(
            update(LeagueRequest).where(LeagueRequest.id == request_id).values(status="approved")
        )
        await session.flush()

        # Get player user_id for notification
        player_result = await session.execute(select(Player.user_id).where(Player.id == player_id))
        player_user_id = player_result.scalar_one_or_none()

        # Notify the player their request was approved (non-blocking)
        if player_user_id:
            asyncio.create_task(
                notification_service.notify_player_about_join_approval(
                    session=session, league_id=league_id, player_user_id=player_user_id
                )
            )

            # Notify other league members about the new member
            asyncio.create_task(
                notification_service.notify_members_about_new_member(
                    session=session, league_id=league_id, new_member_user_id=player_user_id
                )
            )

        return {"success": True, "message": "Join request approved", "member": member}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving join request: {e}")
        raise HTTPException(status_code=500, detail=f"Error approving join request: {str(e)}")


@router.post("/api/leagues/{league_id}/join-requests/{request_id}/reject")
async def reject_league_join_request(
    league_id: int,
    request_id: int,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Reject a join request (league_admin).
    """
    try:
        from backend.database.models import LeagueRequest

        # Get the join request
        request_result = await session.execute(
            select(LeagueRequest).where(
                and_(
                    LeagueRequest.id == request_id,
                    LeagueRequest.league_id == league_id,
                    LeagueRequest.status == "pending",
                )
            )
        )
        join_request = request_result.scalar_one_or_none()

        if not join_request:
            raise HTTPException(
                status_code=404, detail="Join request not found or already processed"
            )

        # Update request status to rejected
        await session.execute(
            update(LeagueRequest).where(LeagueRequest.id == request_id).values(status="rejected")
        )
        await session.commit()

        return {"success": True, "message": "Join request rejected"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting join request: {e}")
        raise HTTPException(status_code=500, detail=f"Error rejecting join request: {str(e)}")


@router.post("/api/leagues/{league_id}/leave")
async def leave_league(
    league_id: int,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Leave a league (authenticated user).
    User can only remove themselves.
    """
    try:
        # Get user's player profile
        player = await data_service.get_player_by_user_id(session, user["id"])
        if not player:
            raise HTTPException(status_code=404, detail="Player profile not found")

        # Check if user is a member of the league
        is_member = await data_service.is_league_member(session, league_id, player["id"])
        if not is_member:
            raise HTTPException(status_code=400, detail="You are not a member of this league")

        # Get the membership ID
        member = await data_service.get_league_member_by_player(session, league_id, player["id"])
        if not member:
            raise HTTPException(status_code=404, detail="Membership not found")

        # Remove member
        success = await data_service.remove_league_member(session, league_id, member["id"])
        if not success:
            raise HTTPException(status_code=500, detail="Failed to leave league")

        return {"success": True, "message": "Successfully left the league"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error leaving league: {str(e)}")


# ---------------------------------------------------------------------------
# League messages
# ---------------------------------------------------------------------------


@router.get("/api/leagues/{league_id}/messages")
async def get_league_messages(
    league_id: int,
    user: dict = Depends(make_require_league_member()),
    session: AsyncSession = Depends(get_db_session),
):
    """Get league messages (league_member)."""
    try:
        return await data_service.get_league_messages(session, league_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching messages: {str(e)}")


@router.post("/api/leagues/{league_id}/messages")
async def create_league_message(
    league_id: int,
    request: Request,
    user: dict = Depends(make_require_league_member()),
    session: AsyncSession = Depends(get_db_session),
):
    """Create a league message (league_member)."""
    try:
        body = await request.json()
        message_text = body.get("message", "").strip()
        if not message_text:
            raise HTTPException(status_code=400, detail="Message cannot be empty")

        user_id = user.get("id")
        message = await data_service.create_league_message(
            session, league_id, user_id, message_text
        )

        # Notify all league members except sender
        try:
            await notification_service.notify_league_members_about_message(
                session=session,
                league_id=league_id,
                message_id=message["id"],
                sender_user_id=user_id,
                message_text=message_text,
            )
        except Exception as e:
            # Don't fail the message creation if notification fails
            logger.warning(f"Failed to create notifications for league message: {e}")

        return message
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating message: {str(e)}")
