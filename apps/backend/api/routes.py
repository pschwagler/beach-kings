"""
API route handlers for the Beach Volleyball ELO system.
"""

from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import Response
from slowapi import Limiter  # type: ignore
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address  # type: ignore
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from backend.database.db import get_db_session
from backend.database.models import Season, Player, Session, SessionStatus, LeagueMember, Feedback, PlayerGlobalStats, Location
from backend.services import data_service, sheets_service, calculation_service, auth_service, user_service, email_service, rate_limiting_service, settings_service
from backend.services import location_service
from backend.services.stats_queue import get_stats_queue
from backend.api.auth_dependencies import (
    get_current_user,
    get_current_user_optional,
    require_user,
    require_system_admin,
    require_admin_phone,
    make_require_league_admin,
    make_require_league_member,
    make_require_league_member_with_403_auth,
    make_require_league_admin_from_season,
    make_require_league_member_from_season,
    make_require_league_admin_from_schedule,
    make_require_league_admin_from_signup,
)
from backend.models.schemas import (
    SignupRequest, LoginRequest, SMSLoginRequest, VerifyPhoneRequest,
    CheckPhoneRequest, AuthResponse, CheckPhoneResponse, UserResponse, UserUpdate,
    RefreshTokenRequest, RefreshTokenResponse, ResetPasswordRequest,
    ResetPasswordVerifyRequest, ResetPasswordConfirmRequest,
    LeagueCreate, LeagueResponse, PlayerUpdate,
    WeeklyScheduleCreate, WeeklyScheduleResponse, WeeklyScheduleUpdate,
    SignupCreate, SignupResponse, SignupUpdate, SignupWithPlayersResponse,
    FeedbackCreate, FeedbackResponse, CreateMatchRequest, UpdateMatchRequest
)
import httpx
import os
import logging
import traceback
from typing import Optional, Dict, Any, List
from datetime import date, datetime, timedelta
from backend.utils.datetime_utils import utcnow
from backend.utils.geo_utils import calculate_distance_miles

logger = logging.getLogger(__name__)

router = APIRouter()

# Rate limiter instance shared with FastAPI app
# In test environments, rate limiting is effectively disabled
IS_TEST_ENV = os.getenv("ENV", "").lower() == "test"
if IS_TEST_ENV:
    # In test mode, create a limiter and override its limit method to be a no-op
    # This allows the @limiter.limit() decorators to remain in the code
    # but they won't actually apply any rate limiting in test environments
    limiter = Limiter(key_func=get_remote_address)
    
    # Store the original limit method
    original_limit = limiter.limit
    
    # Create a no-op decorator that does nothing
    def no_op_limit(*args, **kwargs):
        """No-op decorator for test mode - doesn't apply any rate limiting."""
        def decorator(func):
            return func
        return decorator
    
    # Override the limit method to return a no-op decorator in test mode
    limiter.limit = lambda *args, **kwargs: no_op_limit()
else:
    limiter = Limiter(key_func=get_remote_address)

# WhatsApp service URL
WHATSAPP_SERVICE_URL = os.getenv("WHATSAPP_SERVICE_URL", "http://localhost:3001")

# Default timeout for WhatsApp service requests (in seconds)
WHATSAPP_REQUEST_TIMEOUT = 30.0

INVALID_CREDENTIALS_RESPONSE = HTTPException(status_code=401, detail="Username or password is incorrect")
INVALID_VERIFICATION_CODE_RESPONSE = HTTPException(status_code=401, detail="Invalid or expired verification code")


# Helper functions for session editing

async def get_league_id_from_session(session: AsyncSession, session_id: int) -> Optional[int]:
    """Get league_id from session_id via session -> season -> league."""
    result = await session.execute(
        select(Session).where(Session.id == session_id)
    )
    session_obj = result.scalar_one_or_none()
    if not session_obj or not session_obj.season_id:
        return None
    
    result = await session.execute(
        select(Season).where(Season.id == session_obj.season_id)
    )
    season = result.scalar_one_or_none()
    if not season:
        return None
    
    return season.league_id


async def is_user_admin_of_session_league(
    session: AsyncSession,
    user_id: int,
    session_id: int
) -> bool:
    """Check if user is admin of the league that the session belongs to."""
    league_id = await get_league_id_from_session(session, session_id)
    if not league_id:
        return False
    
    # Check if user is admin of this league
    query = select(1).select_from(
        LeagueMember.__table__.join(Player.__table__, LeagueMember.player_id == Player.id)
    ).where(
        LeagueMember.league_id == league_id,
        Player.user_id == user_id,
        LeagueMember.role == "admin"
    ).limit(1)
    
    result = await session.execute(query)
    return result.scalar_one_or_none() is not None


# League endpoints

@router.post("/api/leagues", response_model=LeagueResponse)
async def create_league(
    payload: LeagueCreate,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session)
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
            level=payload.level
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
    user: dict = Depends(make_require_league_member_with_403_auth()),
):
    """
    Get a league by id. Requires authentication and league membership.
    Returns 403 if user is not authenticated or not a league member.
    """
    try:
        # Check if league exists - return 403 instead of 404 to avoid leaking information
        league = await data_service.get_league(session, league_id)
        if not league:
            raise HTTPException(status_code=403, detail="Forbidden")
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
    session: AsyncSession = Depends(get_db_session)
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
            level=payload.level
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
    session: AsyncSession = Depends(get_db_session)
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


# Season endpoints

@router.post("/api/leagues/{league_id}/seasons")
async def create_season(
    league_id: int,
    request: Request,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Create a season in a league (league_admin or system_admin).
    Body: { name?: str, start_date: ISO, end_date: ISO, point_system?: str }
    Seasons are active based on date ranges (current_date >= start_date AND current_date <= end_date).
    """
    try:
        body = await request.json()
        season = await data_service.create_season(
            session=session,
            league_id=league_id,
            name=body.get("name"),
            start_date=body["start_date"],
            end_date=body["end_date"],
            point_system=body.get("point_system"),
        )
        return season
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Missing required field: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating season: {str(e)}")


@router.get("/api/leagues/{league_id}/seasons")
async def list_seasons(
    league_id: int,
    user: dict = Depends(make_require_league_member()),
    session: AsyncSession = Depends(get_db_session)
):
    """List seasons for a league (league_member)."""
    try:
        return await data_service.list_seasons(session, league_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing seasons: {str(e)}")


@router.get("/api/seasons/{season_id}")
async def get_season(season_id: int, session: AsyncSession = Depends(get_db_session)):
    """Get a season (public)."""
    try:
        season = await data_service.get_season(session, season_id)
        if not season:
            raise HTTPException(status_code=404, detail="Season not found")
        return season
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting season: {str(e)}")


@router.post("/api/matches/elo")
async def get_matches(
    request: Request,
    session: AsyncSession = Depends(get_db_session)
):
    """Get all matches for a season or league with ELO changes (public)."""
    try:
        body = await request.json()
        season_id = body.get("season_id")
        league_id = body.get("league_id")
        
        if season_id is not None:
            matches = await data_service.get_season_matches_with_elo(session, season_id)
            return matches
        elif league_id is not None:
            matches = await data_service.get_league_matches_with_elo(session, league_id)
            return matches
        else:
            raise HTTPException(status_code=400, detail="Either season_id or league_id is required")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading matches: {str(e)}")


@router.get("/api/seasons/{season_id}/matches")
async def get_season_matches(
    season_id: int,
    session: AsyncSession = Depends(get_db_session)
):
    """Get all matches for a season with ELO changes (public). Deprecated: use POST /api/matches instead."""
    try:
        matches = await data_service.get_season_matches_with_elo(session, season_id)
        return matches
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading season matches: {str(e)}")


@router.post("/api/player-stats")
async def get_player_stats(
    request: Request,
    session: AsyncSession = Depends(get_db_session)
):
    """Get all player stats for a season or league (public)."""
    try:
        body = await request.json()
        season_id = body.get("season_id")
        league_id = body.get("league_id")
        
        if season_id is not None:
            player_stats = await data_service.get_all_player_season_stats(session, season_id)
            return player_stats
        elif league_id is not None:
            player_stats = await data_service.get_all_player_league_stats(session, league_id)
            return player_stats
        else:
            raise HTTPException(status_code=400, detail="Either season_id or league_id is required")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading player stats: {str(e)}")


@router.get("/api/seasons/{season_id}/player-stats")
async def get_season_player_stats(
    season_id: int,
    session: AsyncSession = Depends(get_db_session)
):
    """Get all player season stats for a season (public). Deprecated: use POST /api/player-stats instead."""
    try:
        player_stats = await data_service.get_all_player_season_stats(session, season_id)
        return player_stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading player season stats: {str(e)}")


@router.post("/api/partnership-opponent-stats")
async def get_partnership_opponent_stats(
    request: Request,
    session: AsyncSession = Depends(get_db_session)
):
    """Get all partnership and opponent stats for all players in a season or league (public)."""
    try:
        body = await request.json()
        season_id = body.get("season_id")
        league_id = body.get("league_id")
        
        if season_id is not None:
            stats = await data_service.get_all_player_season_partnership_opponent_stats(session, season_id)
            return stats
        elif league_id is not None:
            stats = await data_service.get_all_player_league_partnership_opponent_stats(session, league_id)
            return stats
        else:
            raise HTTPException(status_code=400, detail="Either season_id or league_id is required")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading partnership/opponent stats: {str(e)}")


@router.get("/api/seasons/{season_id}/partnership-opponent-stats")
async def get_season_partnership_opponent_stats(
    season_id: int,
    session: AsyncSession = Depends(get_db_session)
):
    """Get all partnership and opponent stats for all players in a season (public). Deprecated: use POST /api/partnership-opponent-stats instead."""
    try:
        stats = await data_service.get_all_player_season_partnership_opponent_stats(session, season_id)
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading partnership/opponent stats: {str(e)}")


@router.get("/api/players/{player_id}/season/{season_id}/partnership-opponent-stats")
async def get_player_season_partnership_opponent_stats(
    player_id: int,
    season_id: int,
    session: AsyncSession = Depends(get_db_session)
):
    """Get partnership and opponent stats for a player in a season (public)."""
    try:
        stats = await data_service.get_player_season_partnership_opponent_stats(
            session, player_id, season_id
        )
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading partnership/opponent stats: {str(e)}")


@router.get("/api/leagues/{league_id}/player-stats")
async def get_league_player_stats(
    league_id: int,
    session: AsyncSession = Depends(get_db_session)
):
    """Get all player league stats for a league (public)."""
    try:
        player_stats = await data_service.get_all_player_league_stats(session, league_id)
        return player_stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading player league stats: {str(e)}")


@router.get("/api/leagues/{league_id}/partnership-opponent-stats")
async def get_league_partnership_opponent_stats(
    league_id: int,
    session: AsyncSession = Depends(get_db_session)
):
    """Get all partnership and opponent stats for all players in a league (public)."""
    try:
        stats = await data_service.get_all_player_league_partnership_opponent_stats(session, league_id)
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading partnership/opponent stats: {str(e)}")


@router.get("/api/players/{player_id}/league/{league_id}/stats")
async def get_player_league_stats(
    player_id: int,
    league_id: int,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Get player statistics for a specific league.
    
    Args:
        player_id: ID of the player
        league_id: ID of the league
        
    Returns:
        dict: Player league stats including ELO, games, wins, etc.
    """
    try:
        league_stats = await data_service.get_player_league_stats(
            session, player_id, league_id
        )
        
        if league_stats is None:
            raise HTTPException(
                status_code=404,
                detail=f"Player or league not found."
            )
        
        return league_stats
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading player league stats: {str(e)}")


@router.get("/api/players/{player_id}/league/{league_id}/partnership-opponent-stats")
async def get_player_league_partnership_opponent_stats(
    player_id: int,
    league_id: int,
    session: AsyncSession = Depends(get_db_session)
):
    """Get partnership and opponent stats for a player in a league (public)."""
    try:
        stats = await data_service.get_player_league_partnership_opponent_stats(
            session, player_id, league_id
        )
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading partnership/opponent stats: {str(e)}")


@router.put("/api/seasons/{season_id}")
async def update_season(
    season_id: int,
    request: Request,
    user: dict = Depends(get_current_user),  # League admin check inside service based on season->league
    session: AsyncSession = Depends(get_db_session)
):
    """
    Update a season (league_admin or system_admin).
    Body may include: name, start_date, end_date, point_system
    """
    try:
        body = await request.json()
        season = await data_service.update_season(
            session,
            season_id=season_id,
            **body
        )
        if not season:
            raise HTTPException(status_code=404, detail="Season not found")
        return season
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating season: {str(e)}")


@router.get("/api/leagues/{league_id}/members")
async def list_league_members(
    league_id: int,
    user: dict = Depends(make_require_league_member()),
    session: AsyncSession = Depends(get_db_session)
):
    """List league members (league_member)."""
    try:
        return await data_service.list_league_members(session, league_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing members: {str(e)}")


@router.post("/api/leagues/{league_id}/members")
async def add_league_member(
    league_id: int,
    request: Request,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session)
):
    """Add player to league with role (league_admin)."""
    try:
        body = await request.json()
        player_id = body["player_id"]
        role = body.get("role", "member")
        member = await data_service.add_league_member(session, league_id, player_id, role)
        return member
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Missing required field: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding member: {str(e)}")


@router.put("/api/leagues/{league_id}/members/{member_id}")
async def update_league_member(
    league_id: int,
    member_id: int,
    request: Request,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session)
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
    session: AsyncSession = Depends(get_db_session)
):
    """Remove league member (league_admin)."""
    try:
        success = await data_service.remove_league_member(session, league_id, member_id)
        if not success:
            raise HTTPException(status_code=404, detail="Member not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error removing member: {str(e)}")


@router.post("/api/leagues/{league_id}/join")
async def join_league(
    league_id: int,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session)
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
            raise HTTPException(status_code=400, detail="This league is invite-only. Please request to join instead.")
        
        # Get user's player profile
        player = await data_service.get_player_by_user_id(session, user["id"])
        if not player:
            raise HTTPException(status_code=404, detail="Player profile not found. Please create a player profile first.")
        
        # Check if user is already a member
        is_member = await data_service.is_league_member(session, league_id, player["id"])
        if is_member:
            raise HTTPException(status_code=400, detail="You are already a member of this league")
        
        # Add member
        member = await data_service.add_league_member(session, league_id, player["id"], "member")
        return {"success": True, "message": "Successfully joined the league", "member": member}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error joining league: {str(e)}")


@router.post("/api/leagues/{league_id}/request-join")
async def request_to_join_league(
    league_id: int,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Request to join an invite-only league (authenticated user).
    Creates a join request that league admins can review.
    """
    try:
        # Get the league
        league = await data_service.get_league(session, league_id)
        if not league:
            raise HTTPException(status_code=404, detail="League not found")
        
        # Check if league is invite-only (not open)
        if league.get("is_open"):
            raise HTTPException(status_code=400, detail="This league is open. You can join directly instead.")
        
        # Get user's player profile
        player = await data_service.get_player_by_user_id(session, user["id"])
        if not player:
            raise HTTPException(status_code=404, detail="Player profile not found. Please create a player profile first.")
        
        # Check if user is already a member
        is_member = await data_service.is_league_member(session, league_id, player["id"])
        if is_member:
            raise HTTPException(status_code=400, detail="You are already a member of this league")
        
        # Create a join request record
        try:
            request = await data_service.create_league_request(session, league_id, player["id"])
            return {
                "success": True,
                "message": "Join request submitted. League admins will be notified.",
                "request_id": request["id"]
            }
        except ValueError as e:
            # Handle case where request already exists
            raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error requesting to join league: {str(e)}")


@router.post("/api/leagues/{league_id}/leave")
async def leave_league(
    league_id: int,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session)
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


# League Messages endpoints
@router.get("/api/leagues/{league_id}/messages")
async def get_league_messages(
    league_id: int,
    user: dict = Depends(make_require_league_member()),
    session: AsyncSession = Depends(get_db_session)
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
    session: AsyncSession = Depends(get_db_session)
):
    """Create a league message (league_member)."""
    try:
        body = await request.json()
        message_text = body.get("message", "").strip()
        if not message_text:
            raise HTTPException(status_code=400, detail="Message cannot be empty")
        
        user_id = user.get("id")
        return await data_service.create_league_message(session, league_id, user_id, message_text)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating message: {str(e)}")


# Location endpoints

@router.post("/api/locations")
async def create_location(
    request: Request,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session)
):
    """Create a location (system_admin)."""
    try:
        body = await request.json()
        location = await data_service.create_location(
            session=session,
            location_id=body["id"],  # id is the primary key (hub_id from CSV)
            name=body["name"],
            city=body.get("city"),
            state=body.get("state"),
            country=body.get("country", "USA"),
        )
        return location
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Missing required field: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating location: {str(e)}")


@router.get("/api/locations")
async def list_locations(session: AsyncSession = Depends(get_db_session)):
    """List locations (public)."""
    try:
        return await data_service.list_locations(session)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing locations: {str(e)}")


@router.get("/api/regions")
async def list_regions(session: AsyncSession = Depends(get_db_session)):
    """List regions (public)."""
    try:
        return await data_service.list_regions(session)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing regions: {str(e)}")


@router.get("/api/locations/distances")
async def get_location_distances(
    lat: float,
    lon: float,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Get all locations with distances from given coordinates, sorted by closest first.
    Public endpoint.
    
    Args:
        lat: Latitude
        lon: Longitude
    
    Returns:
        Array of objects: [{"id": str, "name": str, "distance_miles": float}, ...]
    """
    try:
        return await location_service.get_all_location_distances(session, lat, lon)
    except Exception as e:
        logger.error(f"Error getting location distances: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting location distances: {str(e)}")


@router.get("/api/geocode/autocomplete")
async def geocode_autocomplete(
    text: str,
    current_user: dict = Depends(get_current_user_optional)  # Optional auth for rate limiting
):
    """
    Proxy autocomplete requests to Geoapify API.
    Keeps API key secure on backend.
    
    Args:
        text: Search text for city autocomplete
    
    Returns:
        Geoapify autocomplete response
    """
    try:
        return await location_service.autocomplete(text)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Geoapify API error: {e.response.text}"
        )
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Geoapify API request error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching autocomplete: {str(e)}")


@router.put("/api/locations/{location_id}")
async def update_location(
    location_id: str,
    request: Request,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session)
):
    """Update a location (system_admin)."""
    try:
        body = await request.json()
        location = await data_service.update_location(
            session=session,
            location_id=location_id,
            name=body.get("name"),
            city=body.get("city"),
            state=body.get("state"),
            country=body.get("country"),
        )
        if not location:
            raise HTTPException(status_code=404, detail="Location not found")
        return location
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating location: {str(e)}")


@router.delete("/api/locations/{location_id}")
async def delete_location(
    location_id: str,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session)
):
    """Delete a location (system_admin)."""
    try:
        success = await data_service.delete_location(session, location_id)
        if not success:
            raise HTTPException(status_code=404, detail="Location not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting location: {str(e)}")

# Court endpoints

@router.post("/api/courts")
async def create_court(
    request: Request,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session)
):
    """Create a court (system_admin)."""
    try:
        body = await request.json()
        court = await data_service.create_court(
            session=session,
            name=body["name"],
            address=body.get("address"),
            location_id=body["location_id"],
            geoJson=body.get("geoJson"),
        )
        return court
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Missing required field: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating court: {str(e)}")


@router.get("/api/courts")
async def list_courts(
    location_id: Optional[str] = None,
    session: AsyncSession = Depends(get_db_session)
):
    """List courts, optionally filtered by location (public)."""
    try:
        return await data_service.list_courts(session, location_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing courts: {str(e)}")


@router.put("/api/courts/{court_id}")
async def update_court(
    court_id: int,
    request: Request,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session)
):
    """Update a court (system_admin)."""
    try:
        body = await request.json()
        court = await data_service.update_court(
            session=session,
            court_id=court_id,
            name=body.get("name"),
            address=body.get("address"),
            location_id=body.get("location_id"),
            geoJson=body.get("geoJson"),
        )
        if not court:
            raise HTTPException(status_code=404, detail="Court not found")
        return court
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating court: {str(e)}")


@router.delete("/api/courts/{court_id}")
async def delete_court(
    court_id: int,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session)
):
    """Delete a court (system_admin)."""
    try:
        success = await data_service.delete_court(session, court_id)
        if not success:
            raise HTTPException(status_code=404, detail="Court not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting court: {str(e)}")
async def proxy_whatsapp_request(
    method: str,
    path: str,
    body: Optional[Dict[Any, Any]] = None,
    timeout: float = WHATSAPP_REQUEST_TIMEOUT
) -> Dict[Any, Any]:
    """
    Proxy helper function for WhatsApp service requests.
    Handles common error cases and timeouts.
    
    Args:
        method: HTTP method (GET, POST, etc.)
        path: API path (e.g., "/api/whatsapp/status")
        body: Optional request body for POST requests
        timeout: Request timeout in seconds
        
    Returns:
        dict: JSON response from WhatsApp service
        
    Raises:
        HTTPException: With appropriate status code and message
    """
    url = f"{WHATSAPP_SERVICE_URL}{path}"
    
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if method.upper() == "GET":
                response = await client.get(url)
            elif method.upper() == "POST":
                response = await client.post(url, json=body)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")
            
            # Raise for 4xx/5xx status codes
            response.raise_for_status()
            
            return response.json()
            
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp service is not available. Make sure it's running on port 3001."
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail=f"WhatsApp service request timed out after {timeout} seconds."
        )
    except httpx.HTTPStatusError as e:
        # Forward the status code from the WhatsApp service
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"WhatsApp service error: {e.response.text}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error communicating with WhatsApp service: {str(e)}"
        )


@router.post("/api/loadsheets")
async def load_sheets(current_user: dict = Depends(get_current_user)):
    """
    DISABLED: This endpoint has been disabled.
    
    TODO: Re-implement to be season-specific and add proper validations.
    This endpoint should:
    - Accept a season_id parameter
    - Only load/import matches for the specified season
    - Add proper data validation
    - Handle errors gracefully
    """
    raise HTTPException(
        status_code=501,
        detail=(
            "This endpoint has been disabled. "
            "It needs to be re-implemented to be season-specific with proper validations. "
            "The function should only load matches for a specific season, not all data."
        )
    )


@router.post("/api/calculate")
@router.post("/api/calculate-stats")
async def calculate_stats(
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Queue a stats calculation job.
    
    Request body (optional):
        {
            "league_id": 123  // If provided, calculates league-specific stats (includes all seasons). If omitted, calculates global stats.
            "season_id": 456  // Deprecated: if provided, will get league_id from season and calculate league stats
        }
    
    Returns:
        dict: Job ID and status
    """
    try:
        # Try to get body, default to empty dict if not present
        try:
            body = await request.json()
        except:
            body = {}
        
        league_id = body.get("league_id") if body else None
        season_id = body.get("season_id") if body else None  # Backward compatibility
        
        # If season_id provided but not league_id, get league_id from season (backward compatibility)
        if season_id and not league_id:
            season_result = await session.execute(
                select(Season).where(Season.id == season_id)
            )
            season = season_result.scalar_one_or_none()
            if season:
                league_id = season.league_id
        
        calc_type = "league" if league_id else "global"
        
        queue = get_stats_queue()
        job_id = await queue.enqueue_calculation(session, calc_type, league_id)
        
        return {
            "job_id": job_id,
            "status": "queued",
            "calc_type": calc_type,
            "league_id": league_id,
            "season_id": season_id  # Deprecated, kept for backward compatibility
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error queueing stats calculation: {str(e)}")


@router.get("/api/calculate-stats/status")
async def get_calculation_status(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Get current queue status and recent jobs.
    
    Returns:
        dict: Queue status with running, pending, and recent jobs
    """
    try:
        queue = get_stats_queue()
        status = await queue.get_queue_status(session)
        
        return status
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting queue status: {str(e)}")


@router.get("/api/calculate-stats/status/{job_id}")
async def get_job_status(
    job_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Get status of a specific calculation job.
    
    Args:
        job_id: Job ID
        
    Returns:
        dict: Job status
    """
    try:
        queue = get_stats_queue()
        job_status = await queue.get_job_status(session, job_id)
        
        if not job_status:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        
        return job_status
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting job status: {str(e)}")


@router.post("/api/rankings")
async def query_rankings(
    request: Request,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Query rankings with filters (e.g., by season_id).
    Body: RankingsQueryRequest
    
    Returns:
        list: Array of player rankings with stats
    """
    try:
        body = await request.json()
        rankings = await data_service.get_rankings(session, body)
        # Return empty array with 200 status if no rankings (e.g., season with no matches)
        # This is more appropriate than 404, as the resource exists but has no data
        return rankings or []
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading rankings: {str(e)}")


@router.get("/api/players")
async def list_players(session: AsyncSession = Depends(get_db_session)):
    """
    Get list of all players.
    
    Returns:
        list: Array of player objects with id, full_name, nickname, etc.
    """
    try:
        # Get all players from database
        result = await session.execute(select(Player))
        players = result.scalars().all()
        return [
            {
                "id": player.id,
                "full_name": player.full_name,
                "nickname": player.nickname,
                "name": player.nickname or player.full_name,
                "gender": player.gender,
                "level": player.level,
                "user_id": player.user_id,
            }
            for player in players
        ]
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error loading players: {str(e)}"
        )


@router.post("/api/players")
async def create_player(
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Create a new player.
    
    Request body:
        {
            "name": "Player Name"
        }
    
    Returns:
        dict: Created player info
    """
    try:
        body = await request.json()
        name = body.get('name', '').strip()
        
        if not name:
            raise HTTPException(status_code=400, detail="Player name is required")
        
        player_id = await data_service.get_or_create_player(session, name)
        
        return {
            "status": "success",
            "message": f"Player '{name}' created successfully",
            "player_id": player_id,
            "name": name
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating player: {str(e)}")


@router.get("/api/players/{player_id}/matches")
async def get_player_match_history(
    player_id: int,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Get match history for a specific player.
    
    Args:
        player_id: ID of the player
        
    Returns:
        list: Array of player's matches (most recent first, may be empty)
    """
    try:
        match_history = await data_service.get_player_match_history_by_id(session, player_id)
        
        if match_history is None:
            raise HTTPException(
                status_code=404,
                detail=f"Player with ID {player_id} not found."
            )
        
        # Return empty array if player exists but has no matches
        return match_history
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading match history: {str(e)}")


@router.get("/api/players/{player_id}/season/{season_id}/stats")
async def get_player_season_stats(
    player_id: int,
    season_id: int,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Get player statistics for a specific season.
    
    Args:
        player_id: ID of the player
        season_id: ID of the season
        
    Returns:
        dict: Player season stats including ELO, games, wins, etc.
    """
    try:
        season_stats = await data_service.get_player_season_stats(
            session, player_id, season_id
        )
        
        if season_stats is None:
            raise HTTPException(
                status_code=404,
                detail=f"Player or season not found."
            )
        
        return season_stats
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading player season stats: {str(e)}")


@router.get("/api/elo-timeline")
async def get_elo_timeline(session: AsyncSession = Depends(get_db_session)):
    """
    Get ELO timeline data for all players.
    Useful for creating charts/graphs of ELO changes over time.
    
    Returns:
        list: Array of date/ELO data points for each player
    """
    try:
        timeline = await data_service.get_elo_timeline(session)
        if not timeline:
            raise HTTPException(
                status_code=404,
                detail="ELO timeline not found. Please run /api/calculate first."
            )
        return timeline
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading ELO timeline: {str(e)}")


@router.post("/api/matches/search")
async def search_matches(
    request: Request,
    user: Optional[dict] = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Search matches with filters.
    Body: MatchesQueryRequest
    
    Returns:
        list: Array of matches matching the query criteria
    """
    try:
        body = await request.json()
        results = await data_service.query_matches(session, body, user)
        return results
    except HTTPException:
        raise
    except Exception as e:
        error_detail = f"Error searching matches: {str(e)}\n{traceback.format_exc()}"
        raise HTTPException(status_code=500, detail=error_detail)

@router.get("/api/matches/export")
async def export_matches(session: AsyncSession = Depends(get_db_session)):
    """
    Export all matches to CSV format (Google Sheets compatible).
    
    Returns CSV file with headers: DATE, T1P1, T1P2, T2P1, T2P2, T1SCORE, T2SCORE
    """
    try:
        csv_content = await data_service.export_matches_to_csv(session)
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={
                "Content-Disposition": "attachment; filename=matches_export.csv"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error exporting matches: {str(e)}")


@router.get("/api/players/{player_id}/stats")
async def get_player_stats(
    player_id: int,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Get detailed statistics for a specific player.
    
    Args:
        player_id: ID of the player
        
    Returns:
        dict: Player stats including partnerships and opponents
    """
    try:
        player_stats = await data_service.get_player_stats_by_id(session, player_id)
        
        if player_stats is None:
            raise HTTPException(
                status_code=404,
                detail=f"Player with ID {player_id} not found."
            )
        
        return player_stats
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading player stats: {str(e)}")


@router.get("/api/health")
async def health_check(session: AsyncSession = Depends(get_db_session)):
    """
    Health check endpoint.
    
    Returns:
        dict: Service status
    """
    try:
        return {
            "status": "healthy",
            "message": "API is running"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "data_available": False,
            "message": f"Error: {str(e)}"
        }


# WhatsApp proxy endpoints (optional - frontend can also call the service directly)

# Weekly Schedule endpoints

@router.post("/api/seasons/{season_id}/weekly-schedules", response_model=WeeklyScheduleResponse)
async def create_weekly_schedule(
    season_id: int,
    payload: WeeklyScheduleCreate,
    user: dict = Depends(make_require_league_admin_from_season()),
    session: AsyncSession = Depends(get_db_session)
):
    """Create a weekly schedule (admin only)."""
    try:
        # Get user's player_id
        result = await session.execute(
            select(Player).where(Player.user_id == user["id"])
        )
        player = result.scalar_one_or_none()
        if not player:
            raise HTTPException(status_code=404, detail="Player not found for user")
        
        schedule = await data_service.create_weekly_schedule(
            session=session,
            season_id=season_id,
            day_of_week=payload.day_of_week,
            start_time=payload.start_time,
            duration_hours=payload.duration_hours,
            court_id=payload.court_id,
            open_signups_mode=payload.open_signups_mode,
            open_signups_day_of_week=payload.open_signups_day_of_week,
            open_signups_time=payload.open_signups_time,
            start_date=payload.start_date,
            end_date=payload.end_date,
            creator_player_id=player.id
        )
        return schedule
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating weekly schedule: {str(e)}")


@router.get("/api/seasons/{season_id}/weekly-schedules", response_model=List[WeeklyScheduleResponse])
async def list_weekly_schedules(
    season_id: int,
    user: dict = Depends(make_require_league_member_from_season()),
    session: AsyncSession = Depends(get_db_session)
):
    """List weekly schedules for a season."""
    try:
        return await data_service.get_weekly_schedules(session, season_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing weekly schedules: {str(e)}")


@router.put("/api/weekly-schedules/{schedule_id}", response_model=WeeklyScheduleResponse)
async def update_weekly_schedule(
    schedule_id: int,
    payload: WeeklyScheduleUpdate,
    user: dict = Depends(make_require_league_admin_from_schedule()),
    session: AsyncSession = Depends(get_db_session)
):
    """Update a weekly schedule (admin only)."""
    try:
        # Get user's player_id
        result = await session.execute(
            select(Player).where(Player.user_id == user["id"])
        )
        player = result.scalar_one_or_none()
        if not player:
            raise HTTPException(status_code=404, detail="Player not found for user")
        
        schedule = await data_service.update_weekly_schedule(
            session=session,
            schedule_id=schedule_id,
            day_of_week=payload.day_of_week,
            start_time=payload.start_time,
            duration_hours=payload.duration_hours,
            court_id=payload.court_id,
            open_signups_mode=payload.open_signups_mode,
            open_signups_day_of_week=payload.open_signups_day_of_week,
            open_signups_time=payload.open_signups_time,
            start_date=payload.start_date,
            end_date=payload.end_date,
            updater_player_id=player.id
        )
        if not schedule:
            raise HTTPException(status_code=404, detail="Weekly schedule not found")
        return schedule
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating weekly schedule: {str(e)}")


@router.delete("/api/weekly-schedules/{schedule_id}")
async def delete_weekly_schedule(
    schedule_id: int,
    user: dict = Depends(make_require_league_admin_from_schedule()),
    session: AsyncSession = Depends(get_db_session)
):
    """Delete a weekly schedule (admin only)."""
    try:
        success = await data_service.delete_weekly_schedule(session, schedule_id)
        if not success:
            raise HTTPException(status_code=404, detail="Weekly schedule not found")
        return {"status": "success", "message": "Weekly schedule deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting weekly schedule: {str(e)}")


# Signup endpoints

@router.post("/api/seasons/{season_id}/signups", response_model=SignupResponse)
async def create_signup(
    season_id: int,
    payload: SignupCreate,
    user: dict = Depends(make_require_league_member_from_season()),
    session: AsyncSession = Depends(get_db_session)
):
    """Create an ad-hoc signup (league member)."""
    try:
        # Get user's player_id
        result = await session.execute(
            select(Player).where(Player.user_id == user["id"])
        )
        player = result.scalar_one_or_none()
        if not player:
            raise HTTPException(status_code=404, detail="Player not found for user")
        
        signup = await data_service.create_signup(
            session=session,
            season_id=season_id,
            scheduled_datetime=payload.scheduled_datetime,
            duration_hours=payload.duration_hours,
            court_id=payload.court_id,
            open_signups_at=payload.open_signups_at,
            creator_player_id=player.id
        )
        return signup
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating signup: {str(e)}")


@router.get("/api/seasons/{season_id}/signups", response_model=List[SignupResponse])
async def list_signups(
    season_id: int,
    upcoming_only: bool = False,
    past_only: bool = False,
    include_players: bool = False,
    user: Optional[dict] = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_db_session)
):
    """List signups for a season. Public endpoint."""
    try:
        return await data_service.get_signups(
            session, season_id, upcoming_only=upcoming_only, past_only=past_only, include_players=include_players
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing signups: {str(e)}")


@router.get("/api/signups/{signup_id}", response_model=SignupWithPlayersResponse)
async def get_signup(
    signup_id: int,
    user: dict = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_db_session)
):
    """Get a signup by ID with players list. Public endpoint."""
    try:
        signup = await data_service.get_signup(session, signup_id, include_players=True)
        if not signup:
            raise HTTPException(status_code=404, detail="Signup not found")
        return signup
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting signup: {str(e)}")


@router.put("/api/signups/{signup_id}", response_model=SignupResponse)
async def update_signup(
    signup_id: int,
    payload: SignupUpdate,
    user: dict = Depends(make_require_league_admin_from_signup()),
    session: AsyncSession = Depends(get_db_session)
):
    """Update a signup (admin only)."""
    try:
        # Get user's player_id
        result = await session.execute(
            select(Player).where(Player.user_id == user["id"])
        )
        player = result.scalar_one_or_none()
        if not player:
            raise HTTPException(status_code=404, detail="Player not found for user")
        
        signup = await data_service.update_signup(
            session=session,
            signup_id=signup_id,
            scheduled_datetime=payload.scheduled_datetime,
            duration_hours=payload.duration_hours,
            court_id=payload.court_id,
            open_signups_at=payload.open_signups_at,
            updater_player_id=player.id
        )
        if not signup:
            raise HTTPException(status_code=404, detail="Signup not found")
        return signup
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating signup: {str(e)}")


@router.delete("/api/signups/{signup_id}")
async def delete_signup(
    signup_id: int,
    user: dict = Depends(make_require_league_admin_from_signup()),
    session: AsyncSession = Depends(get_db_session)
):
    """Delete a signup (admin only)."""
    try:
        success = await data_service.delete_signup(session, signup_id)
        if not success:
            raise HTTPException(status_code=404, detail="Signup not found")
        return {"status": "success", "message": "Signup deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting signup: {str(e)}")


@router.post("/api/signups/{signup_id}/signup")
async def signup_player_endpoint(
    signup_id: int,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session)
):
    """Player signs up for a signup."""
    try:
        # Get user's player_id
        result = await session.execute(
            select(Player).where(Player.user_id == user["id"])
        )
        player = result.scalar_one_or_none()
        if not player:
            raise HTTPException(status_code=404, detail="Player not found for user")
        
        success = await data_service.signup_player(
            session=session,
            signup_id=signup_id,
            player_id=player.id,
            creator_player_id=player.id
        )
        if not success:
            return {"status": "already_signed_up", "message": "Already signed up"}
        return {"status": "success", "message": "Signed up successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error signing up: {str(e)}")


@router.post("/api/signups/{signup_id}/dropout")
async def dropout_player_endpoint(
    signup_id: int,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session)
):
    """Player drops out of a signup."""
    try:
        # Get user's player_id
        result = await session.execute(
            select(Player).where(Player.user_id == user["id"])
        )
        player = result.scalar_one_or_none()
        if not player:
            raise HTTPException(status_code=404, detail="Player not found for user")
        
        success = await data_service.dropout_player(
            session=session,
            signup_id=signup_id,
            player_id=player.id,
            creator_player_id=player.id
        )
        if not success:
            return {"status": "not_signed_up", "message": "Not signed up"}
        return {"status": "success", "message": "Dropped out successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error dropping out: {str(e)}")


@router.get("/api/signups/{signup_id}/players")
async def get_signup_players_endpoint(
    signup_id: int,
    user: dict = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_db_session)
):
    """Get all players signed up for a signup. Public endpoint."""
    try:
        return await data_service.get_signup_players(session, signup_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting signup players: {str(e)}")


@router.get("/api/signups/{signup_id}/events")
async def get_signup_events_endpoint(
    signup_id: int,
    user: dict = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_db_session)
):
    """Get event log for a signup. Public endpoint."""
    try:
        return await data_service.get_signup_events(session, signup_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting signup events: {str(e)}")


@router.get("/api/whatsapp/qr")
async def whatsapp_qr(current_user: dict = Depends(get_current_user)):
    """
    Proxy endpoint for WhatsApp QR code.
    
    Returns:
        dict: QR code data and authentication status
    """
    return await proxy_whatsapp_request("GET", "/api/whatsapp/qr")


@router.get("/api/whatsapp/status")
async def whatsapp_status(current_user: dict = Depends(get_current_user)):
    """
    Proxy endpoint for WhatsApp authentication status.
    
    Returns:
        dict: Authentication status
    """
    return await proxy_whatsapp_request("GET", "/api/whatsapp/status")


@router.post("/api/whatsapp/initialize")
async def whatsapp_initialize(current_user: dict = Depends(get_current_user)):
    """
    Proxy endpoint for initializing WhatsApp client.
    
    Returns:
        dict: Initialization status
    """
    return await proxy_whatsapp_request("POST", "/api/whatsapp/initialize")


@router.post("/api/whatsapp/logout")
async def whatsapp_logout(current_user: dict = Depends(get_current_user)):
    """
    Proxy endpoint for logging out of WhatsApp.
    
    Returns:
        dict: Logout status
    """
    return await proxy_whatsapp_request("POST", "/api/whatsapp/logout")


@router.get("/api/whatsapp/groups")
async def whatsapp_groups(current_user: dict = Depends(get_current_user)):
    """
    Proxy endpoint for fetching WhatsApp group chats.
    
    Returns:
        dict: List of group chats
    """
    return await proxy_whatsapp_request("GET", "/api/whatsapp/groups")


@router.post("/api/whatsapp/send")
async def whatsapp_send(request: Request, current_user: dict = Depends(get_current_user)):
    """
    Proxy endpoint for sending WhatsApp messages.
    
    Request body:
        {
            "phoneNumber": "15551234567",  // Optional, for individual messages
            "chatId": "123456789@g.us",    // Optional, for group messages
            "message": "Your message"
        }
    
    Returns:
        dict: Send status
    """
    body = await request.json()
    return await proxy_whatsapp_request("POST", "/api/whatsapp/send", body=body)


@router.get("/api/whatsapp/config")
async def get_whatsapp_config(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Get WhatsApp configuration (selected group for automated messages).
    
    Returns:
        dict: Configuration including group_id
    """
    try:
        group_id = await data_service.get_setting(session, 'whatsapp_group_id')
        return {
            "success": True,
            "group_id": group_id,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading WhatsApp config: {str(e)}")


@router.post("/api/whatsapp/config")
async def set_whatsapp_config(
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Set WhatsApp configuration (selected group for automated messages).
    
    Request body:
        {
            "group_id": "123456789@g.us"
        }
    
    Returns:
        dict: Success status
    """
    try:
        body = await request.json()
        group_id = body.get('group_id')
        
        if not group_id:
            raise HTTPException(status_code=400, detail="group_id is required")
        
        await data_service.set_setting(session, 'whatsapp_group_id', group_id)
        
        return {
            "success": True,
            "message": "WhatsApp group configuration saved",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving WhatsApp config: {str(e)}")


# Settings endpoints (scoped keys)

@router.get("/api/settings/{key}")
async def get_setting_value(
    key: str,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session)
):
    """Get a setting value (system_admin)."""
    try:
        value = await data_service.get_setting(session, key)
        return {"key": key, "value": value}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting setting: {str(e)}")


@router.put("/api/settings/{key}")
async def set_setting_value(
    key: str,
    request: Request,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session)
):
    """Set a setting value (system_admin)."""
    try:
        body = await request.json()
        if "value" not in body:
            raise HTTPException(status_code=400, detail="value is required")
        await data_service.set_setting(session, key, str(body["value"]))
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error setting value: {str(e)}")

# Session management endpoints

@router.get("/api/leagues/{league_id}/sessions")
async def get_league_sessions(
    league_id: int,
    active: Optional[bool] = None,
    user: dict = Depends(make_require_league_member()),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Get all sessions for a league, optionally filtered by active status.
    
    Args:
        league_id: ID of the league
        active: Optional query parameter. If True, only return active sessions.
                If not provided, return all sessions for the league.
    
    Returns:
        List of session objects for the league
    """
    try:
        # Query sessions for this league by joining Session -> Season -> League
        query = select(Session).join(Season, Session.season_id == Season.id).where(
            Season.league_id == league_id
        )
        
        # Filter by active status if requested
        if active is True:
            query = query.where(Session.status == SessionStatus.ACTIVE)
        
        # Order by date descending (newest first)
        query = query.order_by(Session.date.desc(), Session.created_at.desc())
        
        result = await session.execute(query)
        sessions = result.scalars().all()
        
        # Convert to dict format
        session_list = []
        for sess in sessions:
            session_dict = {
                "id": sess.id,
                "date": sess.date,
                "name": sess.name,
                "status": sess.status.value if sess.status else None,
                "season_id": sess.season_id,
                "created_at": sess.created_at.isoformat() if sess.created_at else None,
                "updated_at": sess.updated_at.isoformat() if sess.updated_at else None,
                "created_by": sess.created_by,
                "updated_by": sess.updated_by,
            }
            session_list.append(session_dict)
        
        return session_list
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting league sessions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting league sessions: {str(e)}")


@router.post("/api/leagues/{league_id}/sessions")
async def create_league_session(
    league_id: int,
    request: Request,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Create a new pending session for a league (league_admin).
    Body: { date?: 'MM/DD/YYYY', name?: string }
    """
    try:
        body = await request.json()
        date = body.get("date") or datetime.now().strftime('%-m/%-d/%Y')
        name = body.get("name")
        
        # Get player_id from user
        player_id = None
        if user:
            player = await data_service.get_player_by_user_id(session, user["id"])
            if player:
                player_id = player["id"]
        
        new_session = await data_service.create_league_session(
            session=session,
            league_id=league_id,
            date=date,
            name=name,
            created_by=player_id
        )
        return {"status": "success", "message": "Session created", "session": new_session}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating league session: {str(e)}")

@router.patch("/api/leagues/{league_id}/sessions/{session_id}")
async def end_league_session(
    league_id: int,
    session_id: int,
    request: Request,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session)
):
    """
    End/lock in a league session by submitting it (league_admin).
    
    Body: { "submit": true } to submit/lock in a session
    
    When a session is locked in:
    1. Session status is set to SUBMITTED (if ACTIVE) or EDITED (if already SUBMITTED/EDITED)
    2. All derived stats recalculated from database (locked-in sessions only)
    3. Newly locked matches now included in rankings, partnerships, opponents, ELO history
    """
    try:
        body = await request.json()
        submit = body.get("submit")
        
        if submit is not True:
            raise HTTPException(status_code=400, detail="submit field must be true to submit a session")
        
        # Get player_id from user
        player_id = None
        if user:
            player = await data_service.get_player_by_user_id(session, user["id"])
            if player:
                player_id = player["id"]
        
        result = await data_service.lock_in_session(session, session_id, updated_by=player_id)
        
        if not result:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
        
        return {
            "status": "success",
            "message": f"Session submitted and stats calculations queued",
            "global_job_id": result["global_job_id"],
            "league_job_id": result.get("league_job_id"),
            "season_id": result["season_id"]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating league session: {str(e)}")

@router.post("/api/sessions")
async def create_session(
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Create a new session.
    
    Request body:
        {
            "date": "11/7/2025"  // Optional, defaults to current date
        }
    
    Returns:
        dict: Created session info
    """
    try:
        body = await request.json()
        date = body.get('date')
        
        # If no date provided, use current date
        if not date:
            date = datetime.now().strftime('%-m/%-d/%Y')
        
        new_session = await data_service.create_session(session, date)
        
        return {
            "status": "success",
            "message": "Session created successfully",
            "session": new_session
        }
    except ValueError as e:
        # Handle duplicate active session error
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating session: {str(e)}")


@router.patch("/api/sessions/{session_id}")
async def update_session(
    session_id: int,
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Update a session (e.g., submit by setting submit to true, or update name/date/season_id).
    
    Body options:
    - { "submit": true } to submit/lock in a session
    - { "name": <str> } to update the session's name
    - { "date": <str> } to update the session's date
    - { "season_id": <int> } to update the session's season (can be null to remove season)
    
    Multiple fields can be updated in a single request.
    
    When a session is locked in:
    1. Session status is set to SUBMITTED (if ACTIVE) or EDITED (if already SUBMITTED/EDITED)
    2. All derived stats recalculated from database (locked-in sessions only)
    3. Newly locked matches now included in rankings, partnerships, opponents, ELO history
    
    Args:
        session_id: ID of session to update
    
    Returns:
        dict: Status message with calculation summary (for submit) or updated session info (for other updates)
    """
    try:
        body = await request.json()
        submit = body.get("submit")
        
        # Handle submit (original behavior) - this takes precedence
        if submit is True:
            # Get player_id from user
            player_id = None
            if current_user:
                player = await data_service.get_player_by_user_id(session, current_user["id"])
                if player:
                    player_id = player["id"]
            
            result = await data_service.lock_in_session(session, session_id, updated_by=player_id)
            
            if not result:
                raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
            
            return {
                "status": "success",
                "message": f"Session submitted and stats calculations queued",
                "global_job_id": result["global_job_id"],
                "league_job_id": result.get("league_job_id"),
                "season_id": result["season_id"]
            }
        
        # Handle other field updates (name, date, season_id)
        name = body.get("name")
        date = body.get("date")
        season_id = body.get("season_id")
        
        # Check if any update fields are provided
        has_updates = name is not None or date is not None or "season_id" in body
        
        if not has_updates:
            raise HTTPException(
                status_code=400, 
                detail="At least one field must be provided: submit, name, date, or season_id"
            )
        
        # Process season_id - can be None to remove it, or an integer to set it
        processed_season_id = None
        update_season_id = False
        if "season_id" in body:
            update_season_id = True
            processed_season_id = None if season_id is None else int(season_id)
        
        result = await data_service.update_session(
            session, 
            session_id, 
            name=name,
            date=date,
            season_id=processed_season_id,
            update_season_id=update_season_id
        )
        
        if not result:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
        
        return {
            "status": "success",
            "message": "Session updated successfully",
            "session": result
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating session: {str(e)}")


@router.delete("/api/sessions/{session_id}")
async def delete_session(
    session_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Delete an active session and all its matches.
    Only active (pending) sessions can be deleted.
    
    Args:
        session_id: ID of session to delete
    
    Returns:
        dict: Delete status
    """
    try:
        # Delete the session (and all its matches)
        success = await data_service.delete_session(session, session_id)
        
        if not success:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
        
        return {
            "status": "success",
            "message": "Session deleted successfully",
            "session_id": session_id
        }
    except ValueError as e:
        # Session is not active (already submitted)
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting session: {str(e)}")


@router.post("/api/matches")
async def create_match(
    match_request: CreateMatchRequest,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Create a new match in a session.
    
    Request body:
        {
            "league_id": 1,   // Optional (required if session_id not provided)
            "session_id": 1,   // Optional - if provided, use this specific session
            "season_id": 1,    // Optional - if provided, use this specific season (must belong to league_id)
            "date": "11/7/2025",  // Optional - defaults to today's date (only used if session_id not provided)
            "team1_player1_id": 1,
            "team1_player2_id": 2,
            "team2_player1_id": 3,
            "team2_player2_id": 4,
            "team1_score": 21,
            "team2_score": 19,
            "is_public": true,  // Optional, defaults to true
            "is_ranked": true   // Optional, defaults to true
        }
    
    Returns:
        dict: Created match info
    """
    try:
        # Validate all players are distinct
        player_ids = [
            match_request.team1_player1_id,
            match_request.team1_player2_id,
            match_request.team2_player1_id,
            match_request.team2_player2_id
        ]
        if len(player_ids) != len(set(player_ids)):
            raise HTTPException(status_code=400, detail="All four players must be distinct")
        
        session_id = match_request.session_id
        session_obj = None
        
        # If session_id is provided, use that specific session (for editing mode)
        if session_id:
            session_obj = await data_service.get_session(session, session_id)
            if not session_obj:
                raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
            
            session_status = session_obj.get('status')
            # Allow match creation if session is ACTIVE, or if session is SUBMITTED/EDITED and user is league admin
            if session_status != 'ACTIVE':
                if session_status not in ('SUBMITTED', 'EDITED'):
                    raise HTTPException(status_code=400, detail="Cannot add matches to a session with this status")
                # Check if user is league admin
                if not await is_user_admin_of_session_league(session, current_user["id"], session_id):
                    raise HTTPException(status_code=403, detail="Only league admins can add matches to submitted sessions")
        else:
            # No session_id provided - need league_id to find/create session
            league_id = match_request.league_id
            if not league_id:
                raise HTTPException(status_code=400, detail="Either session_id or league_id is required")
            
            # Default to today's date if not provided
            match_date = match_request.date
            if not match_date:
                # Format today's date as MM/DD/YYYY
                today = datetime.now()
                match_date = f"{today.month}/{today.day}/{today.year}"
            
            # Get player_id for created_by
            player_id = None
            player = await data_service.get_player_by_user_id(session, current_user["id"])
            if player:
                player_id = player["id"]
            
            # Get season_id from request, or find the most recent active season
            season_id = match_request.season_id
            selected_season = None
            
            if season_id:
                # Validate that the season belongs to the league
                season_result = await session.execute(
                    select(Season).where(
                        and_(Season.id == season_id, Season.league_id == league_id)
                    )
                )
                selected_season = season_result.scalar_one_or_none()
                if not selected_season:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Season {season_id} not found or does not belong to league {league_id}"
                    )
            else:
                # Find the most recent active season for this league (based on date range)
                current_date = date.today()
                season_result = await session.execute(
                    select(Season)
                    .where(
                        and_(
                            Season.league_id == league_id,
                            Season.start_date <= current_date,
                            Season.end_date >= current_date
                        )
                    )
                    .order_by(Season.created_at.desc())
                    .limit(1)
                )
                selected_season = season_result.scalar_one_or_none()
                
                if not selected_season:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"League {league_id} does not have an active season. Please provide a season_id or create a season with dates that include today's date."
                    )
            
            # Try to find an existing session (ACTIVE first, then SUBMITTED/EDITED if user is admin)
            result = await session.execute(
                select(Session)
                .where(
                    and_(
                        Session.date == match_date,
                        Session.season_id == selected_season.id,
                        Session.status == SessionStatus.ACTIVE
                    )
                )
                .with_for_update()  # Lock to prevent race conditions
            )
            session_orm = result.scalar_one_or_none()
            
            # Convert ORM object to dict if found
            if session_orm:
                session_obj = {
                    "id": session_orm.id,
                    "date": session_orm.date,
                    "name": session_orm.name,
                    "status": session_orm.status.value if session_orm.status else None,
                    "season_id": session_orm.season_id,
                }
            
            # If no active session found, create a new active one atomically
            # Note: We do NOT reuse SUBMITTED/EDITED sessions here - those should only be used
            # when explicitly editing a session (when session_id is provided in the request)
            if not session_obj:
                # Use the selected season to create the session
                session_obj = await data_service.get_or_create_active_league_session(
                    session=session,
                    league_id=league_id,
                    date=match_date,
                    created_by=player_id,
                    season_id=selected_season.id
                )
            
            session_id = session_obj["id"]
        
        # Create the match using the session's date
        match_id = await data_service.create_match_async(
            session=session,
            match_request=match_request,
            session_id=session_id,
            date=session_obj['date']
        )
        
        return {
            "status": "success",
            "message": "Match created successfully",
            "match_id": match_id,
            "session_id": session_id
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating match: {str(e)}")


@router.put("/api/matches/{match_id}")
async def update_match(
    match_id: int,
    match_request: UpdateMatchRequest,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Update an existing match.
    
    Args:
        match_id: ID of match to update
    
    Request body:
        {
            "team1_player1_id": 1,
            "team1_player2_id": 2,
            "team2_player1_id": 3,
            "team2_player2_id": 4,
            "team1_score": 21,
            "team2_score": 19,
            "is_public": true,  // Optional
            "is_ranked": true   // Optional
        }
    
    Returns:
        dict: Update status
    """
    try:
        # Validate all players are distinct
        player_ids = [
            match_request.team1_player1_id,
            match_request.team1_player2_id,
            match_request.team2_player1_id,
            match_request.team2_player2_id
        ]
        if len(player_ids) != len(set(player_ids)):
            raise HTTPException(status_code=400, detail="All four players must be distinct")
        
        # Get match to verify it exists and belongs to active session
        match = await data_service.get_match_async(session, match_id)
        if not match:
            raise HTTPException(status_code=404, detail=f"Match {match_id} not found")
        
        session_status = match.get('session_status')
        # Allow match editing if session is ACTIVE, or if session is SUBMITTED/EDITED and user is league admin
        if session_status != 'ACTIVE':
            if session_status not in ('SUBMITTED', 'EDITED'):
                raise HTTPException(status_code=400, detail="Cannot edit matches in a session with this status")
            # Check if user is league admin
            session_id = match.get('session_id')
            if not session_id:
                raise HTTPException(status_code=400, detail="Match does not belong to a session")
            if not await is_user_admin_of_session_league(session, current_user["id"], session_id):
                raise HTTPException(status_code=403, detail="Only league admins can edit matches in submitted sessions")
        
        # Get player_id for updated_by
        player_id = None
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        if player:
            player_id = player["id"]
        
        # Update the match
        success = await data_service.update_match_async(
            session=session,
            match_id=match_id,
            match_request=match_request,
            updated_by=player_id
        )
        
        if not success:
            raise HTTPException(status_code=404, detail=f"Match {match_id} not found")
        
        return {
            "status": "success",
            "message": "Match updated successfully",
            "match_id": match_id
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating match: {str(e)}")


@router.delete("/api/matches/{match_id}")
async def delete_match(
    match_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Delete a match.
    
    Args:
        match_id: ID of match to delete
    
    Returns:
        dict: Delete status
    """
    try:
        # Get match to verify it exists and belongs to active session
        match = await data_service.get_match_async(session, match_id)
        if not match:
            raise HTTPException(status_code=404, detail=f"Match {match_id} not found")
        
        session_status = match.get('session_status')
        # Allow match deletion if session is ACTIVE, or if session is SUBMITTED/EDITED and user is league admin
        if session_status != 'ACTIVE':
            if session_status not in ('SUBMITTED', 'EDITED'):
                raise HTTPException(status_code=400, detail="Cannot delete matches in a session with this status")
            # Check if user is league admin
            session_id = match.get('session_id')
            if not session_id:
                raise HTTPException(status_code=400, detail="Match does not belong to a session")
            if not await is_user_admin_of_session_league(session, current_user["id"], session_id):
                raise HTTPException(status_code=403, detail="Only league admins can delete matches in submitted sessions")
        
        # Delete the match
        success = await data_service.delete_match_async(session, match_id)
        
        if not success:
            raise HTTPException(status_code=404, detail=f"Match {match_id} not found")
        
        return {
            "status": "success",
            "message": "Match deleted successfully",
            "match_id": match_id
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting match: {str(e)}")


# Authentication endpoints

@router.post("/api/auth/signup", response_model=Dict[str, Any])
async def signup(request: SignupRequest, session: AsyncSession = Depends(get_db_session)):
    """
    Start signup process by storing signup data and sending verification code.
    Account is only created after phone verification.
    
    Request body:
        {
            "phone_number": "+15551234567",
            "password": "user_password",  // Required
            "full_name": "John Doe",  // Required - used for player profile
            "email": "john@example.com"  // Optional
        }
    
    Returns:
        dict: Status message
    """
    try:
        # Normalize phone number
        phone_number = auth_service.normalize_phone_number(request.phone_number)
        
        # Check if user already exists
        if await user_service.check_phone_exists(session, phone_number):
            raise HTTPException(
                status_code=400,
                detail="Phone number is already registered"
            )
        
        # Validate password strength
        if len(request.password) < 8:
            raise HTTPException(
                status_code=400,
                detail="Password must be at least 8 characters long"
            )
        if not any(char.isdigit() for char in request.password):
            raise HTTPException(
                status_code=400,
                detail="Password must include at least one number"
            )
        
        # Validate full_name (required)
        if not request.full_name or not request.full_name.strip():
            raise HTTPException(
                status_code=400,
                detail="Full name is required"
            )
        
        # Normalize email if provided
        email = None
        if request.email:
            email = auth_service.normalize_email(request.email)
        
        # Hash password (required)
        password_hash = auth_service.hash_password(request.password)
        
        # Generate verification code
        code = auth_service.generate_verification_code()
        
        # Store verification code with signup data (account not created yet)
        # Store full_name in the 'name' field of VerificationCode for player creation
        success = await user_service.create_verification_code(
            session=session,
            phone_number=phone_number,
            code=code,
            password_hash=password_hash,
            name=request.full_name.strip(),  # Store full_name in name field temporarily
            email=email
        )
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to create verification code"
            )
        
        # Send SMS
        sms_sent = await auth_service.send_sms_verification(session, phone_number, code)
        if not sms_sent:
            raise HTTPException(
                status_code=500,
                detail="Failed to send SMS. Please check Twilio configuration."
            )
        
        return {
            "status": "success",
            "message": "Verification code sent. Please verify your phone number to complete signup.",
            "phone_number": phone_number
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during signup: {str(e)}")


@router.post("/api/auth/login", response_model=AuthResponse)
async def login(request: LoginRequest, session: AsyncSession = Depends(get_db_session)):
    """
    Login with phone number or email and password.
    
    Request body (either phone_number OR email):
        {
            "phone_number": "+15551234567",
            "password": "user_password"
        }
        OR
        {
            "email": "user@example.com",
            "password": "user_password"
        }
    
    Returns:
        AuthResponse: JWT token and user info
    """
    try:
        user = None
        
        # Handle phone number login
        if request.phone_number:
            # Normalize phone number
            phone_number = auth_service.normalize_phone_number(request.phone_number)
            # Get verified user by phone
            user = await user_service.get_user_by_phone(session, phone_number)
        
        # Handle email login
        elif request.email:
            # Normalize and validate email
            email = auth_service.normalize_email(request.email)
            # Get verified user by email
            user = await user_service.get_user_by_email(session, email)
        
        # If user not found, return generic error (don't reveal if phone/email exists)
        if not user:
            raise INVALID_CREDENTIALS_RESPONSE
        
        # Verify password (all accounts now require passwords)
        if not user.get("password_hash"):
            raise HTTPException(
                status_code=401,
                detail="Please contact support for help - NO_PASSWORD"
            )
        
        # Verify password
        if not auth_service.verify_password(request.password, user["password_hash"]):
            raise INVALID_CREDENTIALS_RESPONSE
        
        # Create access token
        token_data = {
            "user_id": user["id"],
            "phone_number": user["phone_number"]
        }
        access_token = auth_service.create_access_token(data=token_data)
        
        # Create refresh token
        refresh_token = auth_service.generate_refresh_token()
        expires_at = utcnow() + timedelta(days=auth_service.REFRESH_TOKEN_EXPIRATION_DAYS)
        await user_service.create_refresh_token(session, user["id"], refresh_token, expires_at)
        
        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user_id=user["id"],
            phone_number=user["phone_number"],
            is_verified=user["is_verified"]
        )
    except HTTPException:
        raise
    except ValueError as e:
        # Handle validation errors (invalid phone/email format)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during login: {str(e)}")


@router.post("/api/auth/send-verification", response_model=Dict[str, Any])
@limiter.limit("10/minute")
async def send_verification(request: Request, payload: CheckPhoneRequest, session: AsyncSession = Depends(get_db_session)):
    """
    Send SMS verification code to phone number.
    
    Request body:
        {
            "phone_number": "+15551234567"
        }
    
    Returns:
        dict: Status message
    """
    try:
        # Normalize phone number
        phone_number = auth_service.normalize_phone_number(payload.phone_number)
        
        # Generate verification code
        code = auth_service.generate_verification_code()
        
        # Save code to database
        success = await user_service.create_verification_code(
            session=session,
            phone_number=phone_number,
            code=code
        )
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to create verification code"
            )
        
        # Send SMS
        sms_sent = await auth_service.send_sms_verification(session, phone_number, code)
        if not sms_sent:
            raise HTTPException(
                status_code=500,
                detail="Failed to send SMS. Please check Twilio configuration."
            )
        
        return {
            "status": "success",
            "message": "Verification code sent successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error sending verification: {str(e)}")


@router.post("/api/auth/verify-phone", response_model=AuthResponse)
@limiter.limit("10/minute")
async def verify_phone(request: Request, payload: VerifyPhoneRequest, session: AsyncSession = Depends(get_db_session)):
    """
    Verify phone number with code (for signup).
    
    Request body:
        {
            "phone_number": "+15551234567",
            "code": "123456"
        }
    
    Returns:
        AuthResponse: JWT token and user info
    """
    try:
        # Normalize phone number
        phone_number = auth_service.normalize_phone_number(payload.phone_number)
        
        # Verify the code and get signup data if present
        signup_data = await user_service.verify_and_mark_code_used(session, phone_number, payload.code)
        if not signup_data:
            # Check if user exists (for SMS login case)
            user = await user_service.get_user_by_phone(session, phone_number)
            if user:
                # Account is locked check for existing users
                if user_service.is_account_locked(user):
                    raise HTTPException(
                        status_code=423,
                        detail="Account is temporarily locked due to too many failed attempts. Please try again later."
                    )
                # Increment failed attempts for existing user (uses phone_number internally)
                await user_service.increment_failed_attempts(session, phone_number)
            raise INVALID_VERIFICATION_CODE_RESPONSE
        
        # Check if this is a signup (has password_hash) or SMS login (no password_hash)
        is_signup = signup_data.get("password_hash") is not None
        
        if is_signup:
            # Create new user account and player profile from signup data
            # full_name is stored in signup_data["name"] (from SignupRequest.full_name)
            try:
                user_id = await user_service.create_user(
                    session=session,
                    phone_number=phone_number,
                    password_hash=signup_data["password_hash"],
                    email=signup_data.get("email")
                )
                
                # Create player profile with full_name from signup
                full_name = signup_data.get("name")  # full_name stored here
                if full_name:
                    player = await data_service.upsert_user_player(
                        session=session,
                        user_id=user_id,
                        full_name=full_name
                    )
                    if not player:
                        logger.error(f"Failed to create player profile for user {user_id}")
                
                # Get the newly created user
                user = await user_service.get_user_by_id(session, user_id)
            except ValueError as e:
                # User already exists (race condition or duplicate signup)
                raise HTTPException(
                    status_code=400,
                    detail=str(e)
                )
        else:
            # SMS login - get existing user
            user = await user_service.get_user_by_phone(session, phone_number)
            if not user:
                raise INVALID_CREDENTIALS_RESPONSE
            # Check if account is locked
            if user_service.is_account_locked(user):
                raise HTTPException(
                    status_code=423,
                    detail="Account is temporarily locked due to too many failed attempts. Please try again later."
                )
        
        # Reset failed attempts on success
        await user_service.reset_failed_attempts(session, user["id"])
        
        # Create access token
        token_data = {
            "user_id": user["id"],
            "phone_number": user["phone_number"]
        }
        access_token = auth_service.create_access_token(data=token_data)
        
        # Create refresh token
        refresh_token = auth_service.generate_refresh_token()
        expires_at = utcnow() + timedelta(days=auth_service.REFRESH_TOKEN_EXPIRATION_DAYS)
        await user_service.create_refresh_token(session, user["id"], refresh_token, expires_at)
        
        # Check if player profile is complete (has gender and level)
        profile_complete = True
        player = await data_service.get_player_by_user_id(session, user["id"])
        if not player or not player.get("gender") or not player.get("level"):
            profile_complete = False
        
        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user_id=user["id"],
            phone_number=user["phone_number"],
            is_verified=user["is_verified"],
            profile_complete=profile_complete
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error verifying phone: {str(e)}")


@router.post("/api/auth/reset-password", response_model=Dict[str, Any])
async def reset_password(request: Request, payload: ResetPasswordRequest, session: AsyncSession = Depends(get_db_session)):
    """
    Initiate password reset by sending verification code.
    
    Request body:
        {
            "phone_number": "+15551234567"
        }
    
    Returns:
        dict: Status message
    """
    try:
        # Normalize phone number
        phone_number = auth_service.normalize_phone_number(payload.phone_number)
        
        # Check rate limit per phone number
        await rate_limiting_service.check_phone_rate_limit(request, phone_number)
        
        # Check if user exists
        user = await user_service.get_user_by_phone(session, phone_number)
        if not user:
            # Don't reveal if phone exists for security
            return {
                "status": "success",
                "message": "If an account exists with this phone number, a verification code has been sent."
            }
        
        # Generate verification code
        code = auth_service.generate_verification_code()
        
        # Save code to database (without signup data, just for password reset)
        success = await user_service.create_verification_code(
            session=session,
            phone_number=phone_number,
            code=code
        )
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to create verification code"
            )
        
        # Send SMS
        sms_sent = await auth_service.send_sms_verification(session, phone_number, code)
        if not sms_sent:
            raise HTTPException(
                status_code=500,
                detail="Failed to send SMS. Please check Twilio configuration."
            )
        
        return {
            "status": "success",
            "message": "If an account exists with this phone number, a verification code has been sent."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error initiating password reset: {str(e)}")


@router.post("/api/auth/reset-password-verify", response_model=Dict[str, Any])
async def reset_password_verify(request: Request, payload: ResetPasswordVerifyRequest, session: AsyncSession = Depends(get_db_session)):
    """
    Verify code for password reset and return a reset token.
    
    Request body:
        {
            "phone_number": "+15551234567",
            "code": "123456"
        }
    
    Returns:
        dict: Reset token
    """
    try:
        # Normalize phone number
        phone_number = auth_service.normalize_phone_number(payload.phone_number)
        
        # Check rate limit per phone number
        await rate_limiting_service.check_phone_rate_limit(request, phone_number)
        
        # Get user
        user = await user_service.get_user_by_phone(session, phone_number)
        if not user:
            raise INVALID_CREDENTIALS_RESPONSE
        
        # Check if account is locked
        if user_service.is_account_locked(user):
            raise HTTPException(
                status_code=423,
                detail="Account is temporarily locked due to too many failed attempts. Please try again later."
            )
        
        # Verify the code (for password reset, code won't have signup data, but function still returns dict if valid)
        code_result = await user_service.verify_and_mark_code_used(session, phone_number, payload.code)
        if not code_result:
            # Increment failed attempts
            await user_service.increment_failed_attempts(session, phone_number)
            raise INVALID_VERIFICATION_CODE_RESPONSE
        
        # Reset failed attempts on success
        await user_service.reset_failed_attempts(session, user["id"])
        
        # Generate reset token
        reset_token = auth_service.generate_refresh_token()  # Reuse the same secure token generator
        expires_at = utcnow() + timedelta(hours=1)  # Token expires in 1 hour
        
        # Store reset token
        success = await user_service.create_password_reset_token(session, user["id"], reset_token, expires_at)
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to create reset token"
            )
        
        return {
            "status": "success",
            "reset_token": reset_token,
            "message": "Verification code verified. You can now set your new password."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error verifying reset code: {str(e)}")


@router.post("/api/auth/reset-password-confirm", response_model=AuthResponse)
@limiter.limit("10/minute")
async def reset_password_confirm(
    request: Request,
    payload: ResetPasswordConfirmRequest,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Confirm password reset with token and set new password.
    Automatically logs the user in after successful reset.
    
    Request body:
        {
            "reset_token": "token_from_verify_endpoint",
            "new_password": "new_secure_password"
        }
    
    Returns:
        AuthResponse: JWT tokens and user info (user is automatically logged in)
    """
    try:
        # Validate password strength
        if len(payload.new_password) < 8:
            raise HTTPException(
                status_code=400,
                detail="Password must be at least 8 characters long"
            )
        if not any(char.isdigit() for char in payload.new_password):
            raise HTTPException(
                status_code=400,
                detail="Password must include at least one number"
            )
        
        # Verify and use the reset token
        user_id = await user_service.verify_and_use_password_reset_token(session, payload.reset_token)
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired reset token"
            )
        
        # Get user to get phone number for token
        user = await user_service.get_user_by_id(session, user_id)
        if not user:
            raise HTTPException(
                status_code=404,
                detail="User not found"
            )
        
        # Hash new password
        new_password_hash = auth_service.hash_password(payload.new_password)
        
        # Update password
        success = await user_service.update_user_password(session, user_id, new_password_hash)
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to update password"
            )
        
        # Create access token (automatically log them in)
        token_data = {
            "user_id": user["id"],
            "phone_number": user["phone_number"]
        }
        access_token = auth_service.create_access_token(data=token_data)
        
        # Create refresh token
        refresh_token = auth_service.generate_refresh_token()
        expires_at = utcnow() + timedelta(days=auth_service.REFRESH_TOKEN_EXPIRATION_DAYS)
        await user_service.create_refresh_token(session, user["id"], refresh_token, expires_at)
        
        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user_id=user["id"],
            phone_number=user["phone_number"],
            is_verified=user["is_verified"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error resetting password: {str(e)}")


@router.post("/api/auth/sms-login", response_model=AuthResponse)
@limiter.limit("10/minute")
async def sms_login(
    request: Request,
    payload: SMSLoginRequest,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Passwordless login with SMS verification code.
    
    Request body:
        {
            "phone_number": "+15551234567",
            "code": "123456"
        }
    
    Returns:
        AuthResponse: JWT token and user info
    """
    try:
        # Normalize phone number
        phone_number = auth_service.normalize_phone_number(payload.phone_number)
        user = await user_service.get_user_by_phone(session, phone_number)
        if not user:
            raise INVALID_CREDENTIALS_RESPONSE
        
        # Check if account is locked
        if user_service.is_account_locked(user):
            raise HTTPException(
                status_code=423,
                detail="Account is temporarily locked due to too many failed attempts. Please try again later."
            )
        
        # Atomically verify code and mark as used
        if not await user_service.verify_and_mark_code_used(session, phone_number, payload.code):
            # Increment failed attempts
            await user_service.increment_failed_attempts(session, phone_number)
            raise INVALID_VERIFICATION_CODE_RESPONSE
        
        # Reset failed attempts on success
        await user_service.reset_failed_attempts(session, user["id"])
        
        # Create access token
        token_data = {
            "user_id": user["id"],
            "phone_number": user["phone_number"]
        }
        access_token = auth_service.create_access_token(data=token_data)
        
        # Create refresh token
        refresh_token = auth_service.generate_refresh_token()
        expires_at = utcnow() + timedelta(days=auth_service.REFRESH_TOKEN_EXPIRATION_DAYS)
        await user_service.create_refresh_token(session, user["id"], refresh_token, expires_at)
        
        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user_id=user["id"],
            phone_number=user["phone_number"],
            is_verified=user["is_verified"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during SMS login: {str(e)}")


@router.get("/api/auth/check-phone", response_model=CheckPhoneResponse)
async def check_phone(
    phone_number: str,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Check if phone number exists in the system.
    
    Query parameter:
        phone_number: Phone number to check
    
    Returns:
        CheckPhoneResponse: exists and is_verified status
    """
    try:
        # Normalize phone number
        normalized_phone = auth_service.normalize_phone_number(phone_number)

        # Check if any user exists (including unverified)
        user = await user_service.get_user_by_phone(session, normalized_phone)
        
        return CheckPhoneResponse(
            exists=user is not None,
            is_verified=user.get("is_verified", False)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking phone: {str(e)}")


@router.post("/api/auth/refresh", response_model=RefreshTokenResponse)
async def refresh_token(
    request: RefreshTokenRequest,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Refresh access token using refresh token.
    
    Request body:
        {
            "refresh_token": "refresh_token_string"
        }
    
    Returns:
        RefreshTokenResponse: New access token
    """
    try:
        # Get refresh token from database
        refresh_token_record = await user_service.get_refresh_token(session, request.refresh_token)
        if not refresh_token_record:
            raise HTTPException(
                status_code=401,
                detail="Invalid refresh token"
            )
        
        # Check if token is expired
        expires_at = datetime.fromisoformat(refresh_token_record["expires_at"])
        if utcnow() > expires_at:
            # Delete expired token
            await user_service.delete_refresh_token(session, request.refresh_token)
            raise HTTPException(
                status_code=401,
                detail="Refresh token has expired"
            )
        
        # Get user
        user = await user_service.get_user_by_id(session, refresh_token_record["user_id"])
        if not user:
            raise HTTPException(
                status_code=401,
                detail="User not found"
            )
        
        # Create new access token
        token_data = {
            "user_id": user["id"],
            "phone_number": user["phone_number"]
        }
        access_token = auth_service.create_access_token(data=token_data)
        
        return RefreshTokenResponse(
            access_token=access_token,
            token_type="bearer"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error refreshing token: {str(e)}")


@router.post("/api/auth/logout")
async def logout(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Logout the current user by invalidating all refresh tokens.
    
    Requires authentication via Bearer token.
    
    Returns:
        dict: Success message
    """
    try:
        # Delete all refresh tokens for this user
        await user_service.delete_user_refresh_tokens(session, current_user["id"])
        return {"status": "success", "message": "Logged out successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during logout: {str(e)}")


@router.get("/api/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """
    Get current authenticated user information.
    
    Requires authentication via Bearer token.
    
    Returns:
        UserResponse: Current user information
    """
    return UserResponse(
        id=current_user["id"],
        phone_number=current_user["phone_number"],
        email=current_user["email"],
        is_verified=current_user["is_verified"],
        created_at=current_user["created_at"]
    )


@router.put("/api/users/me", response_model=UserResponse)
async def update_current_user(
    payload: UserUpdate,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Update the current user's account information (email).
    Phone number cannot be changed.
    Requires authentication.
    
    Request body:
        {
            "email": "john@example.com"  // Optional
        }
    
    Returns:
        Updated user information
    """
    try:
        # Update user info
        success = await user_service.update_user(
            session=session,
            user_id=current_user["id"],
            email=payload.email
        )
        
        if not success:
            raise HTTPException(
                status_code=400,
                detail="No fields provided to update"
            )
        
        # Fetch updated user to return
        updated_user = await user_service.get_user_by_id(session, current_user["id"])
        if not updated_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return UserResponse(
            id=updated_user["id"],
            phone_number=updated_user["phone_number"],
            email=updated_user["email"],
            is_verified=updated_user["is_verified"],
            created_at=updated_user["created_at"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating user profile: {str(e)}")


@router.get("/api/users/me/player")
async def get_current_user_player(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Get the current user's player profile.
    Requires authentication.
    
    Returns:
        Player profile with gender, level, global stats, etc., or null if user has no player profile
    """
    try:
        player = await data_service.get_player_by_user_id_with_stats(session, current_user["id"])
        return player
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user player: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting user player: {str(e)}")


@router.put("/api/users/me/player")
async def update_current_user_player(
    payload: PlayerUpdate,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Update the current user's player profile.
    Creates user and player if they don't exist (for signup flow).
    Requires authentication.
    
    Location values (location_id, distance_to_location, city_latitude, city_longitude)
    are handled by the client and passed through directly.
    
    Request body:
        {
            "full_name": "John Doe",  // Optional (already set from signup)
            "nickname": "Johnny",     // Optional
            "gender": "male",         // Required for profile completion
            "level": "beginner",      // Required for profile completion
            "date_of_birth": "1990-01-15",  // Optional (ISO date string)
            "height": "6'0\"",        // Optional
            "preferred_side": "left", // Optional: 'left', 'right', or 'none'
            "city": "Los Angeles",    // Optional
            "state": "CA",            // Optional
            "city_latitude": 34.0522, // Optional (from autocomplete selection)
            "city_longitude": -118.2437, // Optional (from autocomplete selection)
            "location_id": "socal_la",  // Optional (string, e.g., "socal_la")
            "distance_to_location": 2.5  // Optional (pre-calculated by client)
        }
    
    Returns:
        Updated player profile
    """
    try:
        # Check if user exists, if not create it from verification code
        user = await user_service.get_user_by_id(session, current_user["id"])
        if not user:
            # This shouldn't happen if auth is working, but handle it
            raise HTTPException(status_code=404, detail="User not found")
        
        # Update or create player profile
        # Location values are handled by the client and passed through directly
        player = await data_service.upsert_user_player(
            session=session,
            user_id=current_user["id"],
            full_name=payload.full_name,
            nickname=payload.nickname,
            gender=payload.gender,
            level=payload.level,
            date_of_birth=payload.date_of_birth,
            height=payload.height,
            preferred_side=payload.preferred_side,
            location_id=payload.location_id,
            city=payload.city,
            state=payload.state,
            city_latitude=payload.city_latitude,
            city_longitude=payload.city_longitude,
            distance_to_location=payload.distance_to_location
        )
        
        if not player:
            raise HTTPException(
                status_code=400,
                detail="Failed to create/update player profile. full_name is required."
            )
        
        # Return formatted response
        player_name = player.get("full_name") or player.get("name") or ""
        return {
            "id": player["id"],
            "full_name": player_name,
            "gender": player.get("gender"),
            "level": player.get("level"),
            "nickname": player.get("nickname"),
            "date_of_birth": player.get("date_of_birth"),
            "height": player.get("height"),
            "preferred_side": player.get("preferred_side"),
            "location_id": player.get("location_id"),
            "city": player.get("city"),
            "state": player.get("state"),
            "city_latitude": player.get("city_latitude"),
            "city_longitude": player.get("city_longitude"),
            "distance_to_location": player.get("distance_to_location"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating player profile: {str(e)}")


@router.get("/api/users/me/leagues")
async def get_user_leagues(
    user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Get all leagues that the current user is a member of.
    Requires authentication.
    """
    try:
        return await data_service.get_user_leagues(session, user["id"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting user leagues: {str(e)}")


@router.post("/api/feedback", response_model=FeedbackResponse)
async def submit_feedback(
    payload: FeedbackCreate,
    session: AsyncSession = Depends(get_db_session),
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Submit user feedback. Can be submitted by authenticated or anonymous users.
    If authenticated, the user_id will be associated with the feedback.
    
    Request body:
        {
            "feedback_text": "Your feedback here",
            "email": "optional@email.com"  (optional)
        }
    
    Returns:
        FeedbackResponse: The created feedback record
    """
    try:
        # Create feedback record
        feedback = Feedback(
            user_id=current_user["id"] if current_user else None,
            feedback_text=payload.feedback_text,
            email=payload.email,
            is_resolved=False
        )
        
        session.add(feedback)
        await session.commit()
        await session.refresh(feedback)
        
        # Send email notification (non-blocking - don't fail if email fails)
        try:
            user_name = None
            user_phone = None
            
            if current_user:
                # Get user's full name from their player profile
                player_result = await session.execute(
                    select(Player).where(Player.user_id == current_user["id"])
                )
                player = player_result.scalar_one_or_none()
                if player:
                    user_name = player.full_name
                user_phone = current_user.get("phone_number")
            
            await email_service.send_feedback_email(
                feedback_text=payload.feedback_text,
                contact_email=payload.email,
                user_name=user_name,
                user_phone=user_phone,
                timestamp=feedback.created_at,
                session=session
            )
        except Exception as email_error:
            logger.error(f"Failed to send feedback email: {str(email_error)}")
            # Don't fail the request if email fails
        
        # Build response
        response_data = {
            "id": feedback.id,
            "user_id": feedback.user_id,
            "feedback_text": feedback.feedback_text,
            "email": feedback.email,
            "is_resolved": feedback.is_resolved,
            "created_at": feedback.created_at.isoformat(),
            "user_name": user_name if current_user else None
        }
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting feedback: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error submitting feedback: {str(e)}")


@router.get("/api/admin-view/feedback", response_model=List[FeedbackResponse])
async def get_all_feedback(
    user: dict = Depends(require_admin_phone),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Get all feedback submissions.
    Only accessible to user with phone number +17167831211.
    
    Returns:
        List[FeedbackResponse]: List of all feedback records, ordered by created_at descending
    """
    try:
        # Get all feedback, ordered by most recent first
        result = await session.execute(
            select(Feedback).order_by(Feedback.created_at.desc())
        )
        feedback_list = result.scalars().all()
        
        # Build response with user names
        response_data = []
        for feedback in feedback_list:
            user_name = None
            if feedback.user_id:
                # Get user's full name from their player profile
                player_result = await session.execute(
                    select(Player).where(Player.user_id == feedback.user_id)
                )
                player = player_result.scalar_one_or_none()
                if player:
                    user_name = player.full_name
            
            response_data.append({
                "id": feedback.id,
                "user_id": feedback.user_id,
                "feedback_text": feedback.feedback_text,
                "email": feedback.email,
                "is_resolved": feedback.is_resolved,
                "created_at": feedback.created_at.isoformat(),
                "user_name": user_name
            })
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting feedback: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting feedback: {str(e)}")


@router.patch("/api/admin-view/feedback/{feedback_id}/resolve")
async def update_feedback_resolution(
    feedback_id: int,
    request: Request,
    user: dict = Depends(require_admin_phone),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Update feedback resolution status.
    Only accessible to user with phone number +17167831211.
    
    Body: { "is_resolved": true } to mark feedback as resolved
    
    Args:
        feedback_id: ID of the feedback to update
        
    Returns:
        FeedbackResponse: Updated feedback record
    """
    try:
        body = await request.json()
        is_resolved = body.get("is_resolved", False)
        
        # Get feedback record
        result = await session.execute(
            select(Feedback).where(Feedback.id == feedback_id)
        )
        feedback = result.scalar_one_or_none()
        
        if not feedback:
            raise HTTPException(status_code=404, detail="Feedback not found")
        
        # Update resolution status
        feedback.is_resolved = is_resolved
        await session.commit()
        await session.refresh(feedback)
        
        # Get user name if available
        user_name = None
        if feedback.user_id:
            player_result = await session.execute(
                select(Player).where(Player.user_id == feedback.user_id)
            )
            player = player_result.scalar_one_or_none()
            if player:
                user_name = player.full_name
        
        return {
            "id": feedback.id,
            "user_id": feedback.user_id,
            "feedback_text": feedback.feedback_text,
            "email": feedback.email,
            "is_resolved": feedback.is_resolved,
            "created_at": feedback.created_at.isoformat(),
            "user_name": user_name
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating feedback resolution: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating feedback resolution: {str(e)}")


# Admin view endpoints

@router.get("/api/admin-view/config")
async def get_admin_config(
    user: dict = Depends(require_admin_phone),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Get admin configuration settings.
    Only accessible to user with phone number +17167831211.
    
    Returns:
        dict: Current configuration including enable_sms, enable_email, log_level
    """
    try:
        # Get settings from database first, then fall back to env vars
        enable_sms = await settings_service.get_bool_setting(
            session, "enable_sms", env_var="ENABLE_SMS", default=True
        )
        enable_email = await settings_service.get_bool_setting(
            session, "enable_email", env_var="ENABLE_EMAIL", default=True
        )
        
        # Get current log level (from database setting first, then root logger)
        log_level_setting = await data_service.get_setting(session, "log_level")
        if log_level_setting:
            log_level_name = log_level_setting.upper()
        else:
            root_logger = logging.getLogger()
            log_level_name = logging.getLevelName(root_logger.level)
        
        return {
            "enable_sms": enable_sms,
            "enable_email": enable_email,
            "log_level": log_level_name
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting admin config: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting admin config: {str(e)}")


@router.put("/api/admin-view/config")
async def update_admin_config(
    request: Request,
    user: dict = Depends(require_admin_phone),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Update admin configuration settings.
    Only accessible to user with phone number +17167831211.
    
    Request body (all optional):
        {
            "enable_sms": bool,
            "enable_email": bool,
            "log_level": str  # One of: DEBUG, INFO, WARNING, ERROR
        }
    
    Returns:
        dict: Updated configuration
    """
    try:
        body = await request.json()
        
        # Update enable_sms if provided
        if "enable_sms" in body:
            enable_sms = bool(body["enable_sms"])
            await data_service.set_setting(session, "enable_sms", "true" if enable_sms else "false")
            # Invalidate cache
            await settings_service.invalidate_settings_cache()
        
        # Update enable_email if provided
        if "enable_email" in body:
            enable_email = bool(body["enable_email"])
            await data_service.set_setting(session, "enable_email", "true" if enable_email else "false")
            # Invalidate cache
            await settings_service.invalidate_settings_cache()
        
        # Update log_level if provided (applies immediately at runtime)
        if "log_level" in body:
            log_level = str(body["log_level"]).upper()
            valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR"]
            if log_level not in valid_levels:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Invalid log_level. Must be one of: {', '.join(valid_levels)}"
                )
            
            # Apply log level change immediately at runtime BEFORE updating DB
            # This ensures if the runtime update fails, DB won't be in inconsistent state
            try:
                numeric_level = getattr(logging, log_level, logging.INFO)
                root_logger = logging.getLogger()
                root_logger.setLevel(numeric_level)
                # Also update all existing loggers to ensure consistency
                for logger_name in logging.Logger.manager.loggerDict:
                    existing_logger = logging.getLogger(logger_name)
                    existing_logger.setLevel(numeric_level)
                logger.info(f"Log level changed to {log_level} at runtime")
            except Exception as e:
                # If runtime update fails, don't update DB
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to apply log level change at runtime: {str(e)}"
                )
            
            # Only update DB after successful runtime application
            await data_service.set_setting(session, "log_level", log_level)
            # Invalidate cache
            await settings_service.invalidate_settings_cache()
        
        # Return updated configuration
        enable_sms = await settings_service.get_bool_setting(
            session, "enable_sms", env_var="ENABLE_SMS", default=True
        )
        enable_email = await settings_service.get_bool_setting(
            session, "enable_email", env_var="ENABLE_EMAIL", default=True
        )
        
        # Get current log level (from database setting or root logger)
        log_level_setting = await data_service.get_setting(session, "log_level")
        if log_level_setting:
            log_level_name = log_level_setting
        else:
            root_logger = logging.getLogger()
            log_level_name = logging.getLevelName(root_logger.level)
        
        return {
            "enable_sms": enable_sms,
            "enable_email": enable_email,
            "log_level": log_level_name
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid input: {str(e)}")
    except Exception as e:
        logger.error(f"Error updating admin config: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating admin config: {str(e)}")
