"""League route handlers."""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel, field_validator
from sqlalchemy import select, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.db import get_db_session
from backend.database.models import Player, LeagueMember
from backend.services import (
    data_service,
    interaction_policy,
    league_games_service,
    message_write_policy,
    notification_service,
)
from backend.api.auth_dependencies import (
    get_current_user_optional,
    require_user,
    require_system_admin,
    make_require_league_admin,
    make_require_league_member,
    make_require_league_member_or_public,
)
from backend.models.schemas import (
    LeagueCreate,
    LeagueResponse,
    LeagueDetailResponse,
    LeagueMemberResponse,
    LeagueMemberDetailResponse,
    HomeCourtResponse,
    SuccessResponse,
    SuccessMessageResponse,
    BatchMemberResponse,
    JoinRequestsResponse,
    RequestJoinResponse,
    LeagueJoinResponse,
    LeagueStandingsResponse,
    LeagueGamesResponse,
    InvitablePlayerResponse,
    LeagueInviteItemResponse,
    InviteActionResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


async def _require_public_join_requests(session: AsyncSession, league_id: int) -> None:
    """Reject request-review actions when the league is invitation-only."""
    league = await data_service.get_league(session, league_id)
    if not league:
        raise HTTPException(status_code=404, detail="League not found")
    if not league.get("is_open"):
        raise HTTPException(
            status_code=400,
            detail="This league is invite-only. Membership requires an invitation.",
        )


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
        await interaction_policy.enforce_user_ugc_creation(session, user["id"])
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
    except interaction_policy.InteractionUnavailable:
        raise HTTPException(status_code=409, detail="Interaction unavailable")
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
        q?: string,       # text search on name / description
        is_open?: bool,   # true = open, false = invite-only
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
            q=body.get("q"),
            is_open=body.get("is_open"),
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


@router.get("/api/leagues/{league_id}", response_model=LeagueDetailResponse)
async def get_league(
    league_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: dict = Depends(require_user),
):
    """
    Get enriched league detail. Requires authentication.
    Returns league info plus membership context and current-season stats for the caller.
    Non-members receive null for all user_* fields.
    """
    try:
        league = await data_service.get_league_detail(session, league_id, user["id"])
        if not league:
            raise HTTPException(status_code=404, detail="League not found")
        return league
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to load league detail", extra={"league_id": league_id})
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
        await interaction_policy.enforce_user_ugc_creation(session, user["id"])
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
    except interaction_policy.InteractionUnavailable:
        raise HTTPException(status_code=409, detail="Interaction unavailable")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating league: {str(e)}")


@router.delete("/api/leagues/{league_id}", response_model=SuccessMessageResponse)
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


@router.get("/api/leagues/{league_id}/members", response_model=list[LeagueMemberDetailResponse])
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


@router.post("/api/leagues/{league_id}/members", response_model=BatchMemberResponse)
async def add_league_member(
    league_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session),
):
    """Add player to league with role (league_admin)."""
    try:
        body = await request.json()
        player_id = body["player_id"]
        role = body.get("role", "member")
        admin = await data_service.get_player_by_user_id(session, user["id"])
        if not admin:
            raise HTTPException(status_code=404, detail="Admin player profile not found")
        result = await data_service.admin_add_league_members(
            session,
            league_id,
            [{"player_id": player_id, "role": role}],
            admin["id"],
        )

        # Notify all league members about the new member (non-blocking)
        try:
            player_result = await session.execute(
                select(Player.user_id).where(Player.id == player_id)
            )
            player_user_id = player_result.scalar_one_or_none()

            if player_user_id and result.get("added"):
                await notification_service.notify_player_about_admin_addition(
                    session=session,
                    league_id=league_id,
                    player_user_id=player_user_id,
                    actor_player_id=admin["id"],
                )
                background_tasks.add_task(
                    notification_service.notify_members_about_new_member_background,
                    league_id=league_id,
                    new_member_user_id=player_user_id,
                )
            elif player_user_id and result.get("invited"):
                await notification_service.notify_player_about_league_invite(
                    session=session,
                    league_id=league_id,
                    player_user_id=player_user_id,
                    actor_player_id=admin["id"],
                )
        except Exception as e:
            # Don't fail the member addition if notification fails
            logger.warning(f"Failed to create notification for new league member: {e}")

        return result
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Missing required field: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding member: {str(e)}")


@router.post("/api/leagues/{league_id}/members_batch", response_model=BatchMemberResponse)
async def add_league_members_batch(
    league_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
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
        admin = await data_service.get_player_by_user_id(session, user["id"])
        if not admin:
            raise HTTPException(status_code=404, detail="Admin player profile not found")
        result = await data_service.admin_add_league_members(
            session, league_id, members, admin["id"]
        )
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
                    await notification_service.notify_player_about_admin_addition(
                        session=session,
                        league_id=league_id,
                        player_user_id=player_user_id,
                        actor_player_id=admin["id"],
                    )
                    background_tasks.add_task(
                        notification_service.notify_members_about_new_member_background,
                        league_id=league_id,
                        new_member_user_id=player_user_id,
                    )
            except Exception as e:
                logger.warning(f"Failed to create notification for new league member: {e}")
        for player_id in result.get("invited", []):
            try:
                player_user_id = (
                    await session.execute(select(Player.user_id).where(Player.id == player_id))
                ).scalar_one_or_none()
                if player_user_id:
                    await notification_service.notify_player_about_league_invite(
                        session=session,
                        league_id=league_id,
                        player_user_id=player_user_id,
                        actor_player_id=admin["id"],
                    )
            except Exception as e:
                logger.warning(f"Failed to notify invited player: {e}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error batch adding league members: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/leagues/{league_id}/members/{member_id}", response_model=LeagueMemberResponse)
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


@router.delete("/api/leagues/{league_id}/members/{member_id}", response_model=SuccessResponse)
async def remove_league_member(
    league_id: int,
    member_id: int,
    background_tasks: BackgroundTasks,
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
            background_tasks.add_task(
                notification_service.notify_player_about_removal_from_league_background,
                league_id=league_id,
                removed_user_id=player_user_id,
            )

        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error removing member: {str(e)}")


# ---------------------------------------------------------------------------
# Join / Leave / Request
# ---------------------------------------------------------------------------


@router.post("/api/leagues/{league_id}/join", response_model=LeagueJoinResponse)
async def join_league(
    league_id: int,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Legacy join endpoint. Membership now requires approval or invitation.
    """
    try:
        # Get the league
        league = await data_service.get_league(session, league_id)
        if not league:
            raise HTTPException(status_code=404, detail="League not found")

        if league.get("is_open"):
            raise HTTPException(
                status_code=400,
                detail="Public leagues require an approved join request.",
            )
        raise HTTPException(
            status_code=400,
            detail="This league is invite-only. A league admin must invite you.",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error joining league: {str(e)}")


@router.post("/api/leagues/{league_id}/request-join", response_model=RequestJoinResponse)
async def request_to_join_league(
    league_id: int,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Request to join a public league (authenticated user).
    Creates a join request that league admins can review via notification action buttons.

    Note: Admins receive notifications with approve/reject buttons. The approve/reject
    endpoints are defined below. See: LeagueRequest model for data structure.
    """
    try:
        # Get the league
        league = await data_service.get_league(session, league_id)
        if not league:
            raise HTTPException(status_code=404, detail="League not found")

        # Invite-only means exactly that: only an admin invitation can add a
        # player. Public leagues use approval-backed join requests.
        if not league.get("is_open"):
            raise HTTPException(
                status_code=400,
                detail="This league is invite-only. A league admin must invite you.",
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


@router.delete("/api/leagues/{league_id}/join-request", response_model=SuccessMessageResponse)
async def cancel_league_join_request(
    league_id: int,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Cancel the current user's pending join request for a public league.
    Only the requesting player can cancel their own request.
    """
    try:
        player = await data_service.get_player_by_user_id(session, user["id"])
        if not player:
            raise HTTPException(status_code=404, detail="Player profile not found.")

        await data_service.cancel_league_request(session, league_id, player["id"])
        return {"success": True, "message": "Join request cancelled."}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling join request: {e}")
        raise HTTPException(status_code=500, detail=f"Error cancelling join request: {str(e)}")


@router.get("/api/leagues/{league_id}/join-requests", response_model=JoinRequestsResponse)
async def get_league_join_requests(
    league_id: int,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session),
):
    """
    List pending and rejected join requests for a league (league_admin only).
    Returns { "pending": [...], "rejected": [...] } for the details UI.
    """
    try:
        await _require_public_join_requests(session, league_id)
        pending = await data_service.list_league_join_requests(session, league_id)
        rejected = await data_service.list_league_join_requests_rejected(session, league_id)
        return {"pending": pending, "rejected": rejected}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing join requests: {e}")
        raise HTTPException(status_code=500, detail="Error listing join requests")


@router.post(
    "/api/leagues/{league_id}/join-requests/{request_id}/approve",
    response_model=LeagueJoinResponse,
)
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

        await _require_public_join_requests(session, league_id)

        # Rejected requests are terminal. A later admin action must send an
        # invitation, preserving the player's prior rejection/consent state.
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

        # Add player to league (idempotent if already member)
        player_id = join_request.player_id
        member = await data_service.add_league_member(session, league_id, player_id, "member")

        # Update request status to approved
        await session.execute(
            update(LeagueRequest).where(LeagueRequest.id == request_id).values(status="approved")
        )
        await session.commit()

        # Get player user_id for notification (re-use session for reads; notifications run before response)
        player_result = await session.execute(select(Player.user_id).where(Player.id == player_id))
        player_user_id = player_result.scalar_one_or_none()

        # Notify the player and league members (await so session is still valid)
        if player_user_id:
            try:
                await asyncio.gather(
                    notification_service.notify_player_about_join_approval(
                        session=session, league_id=league_id, player_user_id=player_user_id
                    ),
                    notification_service.notify_members_about_new_member(
                        session=session, league_id=league_id, new_member_user_id=player_user_id
                    ),
                )
            except Exception as e:
                logger.warning(f"Failed to send join-approval notifications: {e}")

        return {"success": True, "message": "Join request approved", "member": member}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving join request: {e}")
        raise HTTPException(status_code=500, detail=f"Error approving join request: {str(e)}")


@router.post(
    "/api/leagues/{league_id}/join-requests/{request_id}/reject",
    response_model=SuccessMessageResponse,
)
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

        await _require_public_join_requests(session, league_id)

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

        # Resolve player user_id for notification before updating
        player_result = await session.execute(
            select(Player.user_id).where(Player.id == join_request.player_id)
        )
        player_user_id = player_result.scalar_one_or_none()

        # Update request status to rejected
        await session.execute(
            update(LeagueRequest).where(LeagueRequest.id == request_id).values(status="rejected")
        )
        await session.commit()

        # Notify the player their request was rejected
        if player_user_id:
            try:
                await notification_service.notify_player_about_join_rejection(
                    session=session,
                    league_id=league_id,
                    player_user_id=player_user_id,
                )
            except Exception as e:
                logger.warning(f"Failed to notify player about join rejection: {e}")

        return {"success": True, "message": "Join request rejected"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting join request: {e}")
        raise HTTPException(status_code=500, detail=f"Error rejecting join request: {str(e)}")


@router.post("/api/leagues/{league_id}/leave", response_model=SuccessMessageResponse)
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
        success = await data_service.remove_league_member(
            session,
            league_id,
            member["id"],
            self_left_by_player_id=player["id"],
        )
        if not success:
            raise HTTPException(status_code=500, detail="Failed to leave league")

        return {"success": True, "message": "Successfully left the league"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error leaving league: {str(e)}")


# ---------------------------------------------------------------------------
# League home courts
# ---------------------------------------------------------------------------


@router.get("/api/leagues/{league_id}/home-courts", response_model=list[HomeCourtResponse])
async def list_league_home_courts(
    league_id: int,
    user: dict = Depends(make_require_league_member()),
    session: AsyncSession = Depends(get_db_session),
):
    """List home courts for a league (league_member)."""
    try:
        return await data_service.get_league_home_courts(session, league_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing home courts: {str(e)}")


@router.post("/api/leagues/{league_id}/home-courts", response_model=HomeCourtResponse)
async def add_league_home_court(
    league_id: int,
    request: Request,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session),
):
    """Add a home court to a league (league_admin)."""
    try:
        body = await request.json()
        court_id = body.get("court_id")
        if not court_id:
            raise HTTPException(status_code=400, detail="court_id is required")
        court = await data_service.add_league_home_court(session, league_id, court_id)
        return court
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        if "uq_league_home_courts_league_court" in str(e):
            raise HTTPException(status_code=409, detail="Court is already a home court")
        raise HTTPException(status_code=500, detail=f"Error adding home court: {str(e)}")


@router.delete("/api/leagues/{league_id}/home-courts/{court_id}", response_model=SuccessResponse)
async def remove_league_home_court(
    league_id: int,
    court_id: int,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session),
):
    """Remove a home court from a league (league_admin)."""
    try:
        success = await data_service.remove_league_home_court(session, league_id, court_id)
        if not success:
            raise HTTPException(status_code=404, detail="Home court not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error removing home court: {str(e)}")


@router.put("/api/leagues/{league_id}/home-courts", response_model=list[HomeCourtResponse])
async def set_league_home_courts(
    league_id: int,
    request: Request,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session),
):
    """Set all home courts for a league (league_admin). Accepts {court_ids: [1, 2, 3]}."""
    try:
        body = await request.json()
        court_ids = body.get("court_ids")
        if court_ids is None or not isinstance(court_ids, list):
            raise HTTPException(status_code=400, detail="court_ids array is required")
        courts = await data_service.set_league_home_courts(session, league_id, court_ids)
        return courts
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error setting home courts: {str(e)}")


@router.put("/api/leagues/{league_id}/home-courts/reorder", response_model=list[dict])
async def reorder_league_home_courts(
    league_id: int,
    request: Request,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session),
):
    """Reorder home courts for a league (league_admin). Accepts [{court_id, position}]."""
    try:
        body = await request.json()
        court_positions = body.get("court_positions")
        if not court_positions or not isinstance(court_positions, list):
            raise HTTPException(status_code=400, detail="court_positions array is required")
        courts = await data_service.reorder_league_home_courts(session, league_id, court_positions)
        return courts
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reordering home courts: {str(e)}")


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
        return await data_service.get_league_messages(
            session, league_id, current_user_id=user.get("id")
        )
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
        return await data_service.create_league_message(session, league_id, user_id, message_text)
    except message_write_policy.MessageWritesUnavailable:
        raise HTTPException(status_code=503, detail="Messaging is temporarily unavailable")
    except interaction_policy.InteractionUnavailable:
        raise HTTPException(status_code=409, detail="Interaction unavailable")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating message: {str(e)}")


@router.get("/api/leagues/{league_id}/standings", response_model=LeagueStandingsResponse)
async def get_league_standings(
    league_id: int,
    season_id: Optional[int] = None,
    user: dict = Depends(make_require_league_member_or_public()),
    session: AsyncSession = Depends(get_db_session),
):
    """Get league standings, optionally filtered by season.

    Readable by any authenticated user for public leagues (the standings are the
    public "shop window" shown to non-member visitors); private leagues require
    membership.
    """
    try:
        return await data_service.get_league_standings(session, league_id, season_id=season_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching standings: {str(e)}")


@router.get("/api/leagues/{league_id}/games", response_model=LeagueGamesResponse)
async def get_league_games(
    league_id: int,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: dict = Depends(make_require_league_member()),
    session: AsyncSession = Depends(get_db_session),
):
    """All matches in a league across every session (league_member)."""
    try:
        games, total = await league_games_service.get_league_games(
            session=session,
            league_id=league_id,
            limit=limit,
            offset=offset,
        )
        return {"games": games, "total": total}
    except Exception as e:
        logger.error(f"Error fetching league games for league {league_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch league games.")


# ---------------------------------------------------------------------------
# League Invites
# ---------------------------------------------------------------------------


@router.get(
    "/api/leagues/{league_id}/invitable-players",
    response_model=list[InvitablePlayerResponse],
)
async def get_invitable_players(
    league_id: int,
    q: Optional[str] = None,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Return players that can be invited to the league (league admin only).

    Grouped into sections: friends, recent_opponents, suggested.
    Each player carries an invite_status reflecting their current league relationship.
    """
    try:
        from backend.database.models import Player as PlayerModel

        result = await session.execute(
            select(PlayerModel).where(PlayerModel.user_id == user["id"])
        )
        admin_player = result.scalar_one_or_none()
        if not admin_player:
            raise HTTPException(status_code=404, detail="Player profile not found")

        players = await data_service.get_invitable_players(
            session, league_id, admin_player.id, query=q or None
        )
        return players
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching invitable players: {str(e)}")


class SendInvitesRequest(BaseModel):
    player_ids: list[int]


@router.post("/api/leagues/{league_id}/invites", response_model=SuccessResponse)
async def send_league_invites(
    league_id: int,
    body: SendInvitesRequest,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Send league invitations to selected players (league admin only).

    Skips players that already have a pending invite. Fires a notification to
    each invited player that has a user account; notification failure does not
    fail the request.
    """
    if not body.player_ids:
        raise HTTPException(status_code=400, detail="player_ids must not be empty")

    try:
        from backend.database.models import Player as PlayerModel

        result = await session.execute(
            select(PlayerModel).where(PlayerModel.user_id == user["id"])
        )
        admin_player = result.scalar_one_or_none()
        if not admin_player:
            raise HTTPException(status_code=404, detail="Player profile not found")

        league = await data_service.get_league(session, league_id)
        if not league:
            raise HTTPException(status_code=404, detail="League not found")

        await data_service.create_league_invites(
            session, league_id, body.player_ids, invited_by_player_id=admin_player.id
        )

        # Notify each invited player that has a user account (fire-and-forget).
        for pid in body.player_ids:
            try:
                player_result = await session.execute(
                    select(PlayerModel).where(
                        PlayerModel.id == pid, PlayerModel.user_id.isnot(None)
                    )
                )
                invited_player = player_result.scalar_one_or_none()
                if invited_player and invited_player.user_id:
                    await notification_service.notify_player_about_league_invite(
                        session=session,
                        league_id=league_id,
                        player_user_id=invited_player.user_id,
                        league_name=league.get("name"),
                        actor_player_id=admin_player.id,
                    )
            except Exception as e:
                logger.warning(f"Failed to notify player {pid} about league invite: {e}")

        return {"success": True, "message": "Invites sent"}
    except interaction_policy.InteractionUnavailable:
        raise HTTPException(status_code=409, detail="Interaction unavailable")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error sending invites: {str(e)}")


@router.get(
    "/api/leagues/{league_id}/invites",
    response_model=list[LeagueInviteItemResponse],
)
async def get_league_invites(
    league_id: int,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session),
):
    """List all invites for a league (league admin only)."""
    try:
        return await data_service.list_league_invites(session, league_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching league invites: {str(e)}")


class InviteRespondRequest(BaseModel):
    """Request body for the invitee accept/decline endpoint."""

    action: str

    @field_validator("action")
    @classmethod
    def action_must_be_valid(cls, v: str) -> str:
        """Ensure action is one of the two allowed values."""
        if v not in ("accept", "decline"):
            raise ValueError(f"action must be 'accept' or 'decline', got {v!r}")
        return v


@router.post(
    "/api/leagues/{league_id}/invites/respond",
    response_model=InviteActionResponse,
)
async def respond_to_league_invite(
    league_id: int,
    body: InviteRespondRequest,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Accept or decline a league invite (invitee only).

    Resolves the caller's player profile and looks up their pending invite for
    this league.  If found:
    - ``accept`` marks the invite accepted and adds the caller as a league member.
    - ``decline`` marks the invite declined; no membership change is made.

    Only the invitee themselves can act on their own invite.  A caller who has
    no pending invite for this league receives 404 (indistinguishable from an
    invite that belongs to a different player).
    """
    try:
        player = await data_service.get_player_by_user_id(session, user["id"])
        if not player:
            raise HTTPException(status_code=404, detail="Player profile not found.")

        result = await data_service.respond_to_league_invite(
            session=session,
            league_id=league_id,
            player_id=player["id"],
            action=body.action,
        )
        return result
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Error responding to league invite: {str(exc)}"
        )
