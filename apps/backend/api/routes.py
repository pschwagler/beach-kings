"""
API route handlers for the Beach Volleyball ELO system.
"""

import asyncio
from fastapi import (
    APIRouter,
    HTTPException,
    Request,
    Depends,
    Query,
    WebSocket,
    WebSocketDisconnect,
    UploadFile,
    File,
    Form,
)
from fastapi.responses import Response, StreamingResponse
from slowapi import Limiter  # type: ignore
from slowapi.util import get_remote_address  # type: ignore
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update
from backend.database.db import get_db_session
from backend.database.models import (
    Season,
    Player,
    Session,
    SessionStatus,
    LeagueMember,
    Feedback,
    PhotoMatchJobStatus,
)
from backend.services import (
    data_service,
    auth_service,
    user_service,
    email_service,
    rate_limiting_service,
    settings_service,
    placeholder_service,
)
from backend.services import notification_service
from backend.services import friend_service
from backend.services import photo_match_service
from backend.services import avatar_service
from backend.services import s3_service
from backend.services import court_service
from backend.services import court_photo_service
from backend.services import geocoding_service
from backend.services.websocket_manager import get_websocket_manager
from backend.services import location_service
from backend.services.stats_queue import get_stats_queue
from backend.api.auth_dependencies import (
    get_current_user,
    get_current_user_optional,
    require_user,
    require_verified_player,
    require_system_admin,
    require_admin_phone,
    require_court_owner_or_admin,
    make_require_league_admin,
    make_require_league_member,
    make_require_league_admin_from_season,
    make_require_league_member_from_season,
    make_require_league_admin_from_schedule,
    make_require_league_admin_from_signup,
)
from backend.models.schemas import (
    SignupRequest,
    LoginRequest,
    SMSLoginRequest,
    VerifyPhoneRequest,
    CheckPhoneRequest,
    AuthResponse,
    CheckPhoneResponse,
    UserResponse,
    UserUpdate,
    RefreshTokenRequest,
    RefreshTokenResponse,
    ResetPasswordRequest,
    ResetPasswordVerifyRequest,
    ResetPasswordConfirmRequest,
    LeagueCreate,
    LeagueResponse,
    PlayerUpdate,
    CreatePlaceholderRequest,
    PlaceholderPlayerResponse,
    PlaceholderListResponse,
    DeletePlaceholderResponse,
    InviteDetailsResponse,
    ClaimInviteResponse,
    WeeklyScheduleCreate,
    WeeklyScheduleResponse,
    WeeklyScheduleUpdate,
    SignupCreate,
    SignupResponse,
    SignupUpdate,
    SignupWithPlayersResponse,
    FeedbackCreate,
    FeedbackResponse,
    CreateMatchRequest,
    UpdateMatchRequest,
    NotificationResponse,
    NotificationListResponse,
    UnreadCountResponse,
    CreateCourtRequest,
    UpdateCourtRequest,
    CreateReviewRequest,
    UpdateReviewRequest,
    ReviewActionResponse,
    CourtEditSuggestionRequest,
    CourtEditSuggestionResponse,
    FriendRequestCreate,
    FriendRequestResponse,
    FriendListResponse,
    FriendBatchStatusRequest,
    FriendBatchStatusResponse,
)
import httpx
import os
import logging
import traceback
import uuid
from enum import Enum
from typing import Optional, Dict, Any, List
from datetime import date, datetime, timedelta
from backend.utils.datetime_utils import utcnow

logger = logging.getLogger(__name__)


class SuggestionAction(str, Enum):
    """Allowed actions for resolving a court edit suggestion."""

    APPROVED = "approved"
    REJECTED = "rejected"


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

INVALID_CREDENTIALS_RESPONSE = HTTPException(
    status_code=401, detail="Username or password is incorrect"
)
INVALID_VERIFICATION_CODE_RESPONSE = HTTPException(
    status_code=401, detail="Invalid or expired verification code"
)


# Helper functions for session editing


async def get_league_id_from_session(session: AsyncSession, session_id: int) -> Optional[int]:
    """Get league_id from session_id via session -> season -> league."""
    result = await session.execute(select(Session).where(Session.id == session_id))
    session_obj = result.scalar_one_or_none()
    if not session_obj or not session_obj.season_id:
        return None

    result = await session.execute(select(Season).where(Season.id == session_obj.season_id))
    season = result.scalar_one_or_none()
    if not season:
        return None

    return season.league_id


async def is_user_admin_of_session_league(
    session: AsyncSession, user_id: int, session_id: int
) -> bool:
    """Check if user is admin of the league that the session belongs to."""
    league_id = await get_league_id_from_session(session, session_id)
    if not league_id:
        return False

    # Check if user is admin of this league
    query = (
        select(1)
        .select_from(
            LeagueMember.__table__.join(Player.__table__, LeagueMember.player_id == Player.id)
        )
        .where(
            LeagueMember.league_id == league_id,
            Player.user_id == user_id,
            LeagueMember.role == "admin",
        )
        .limit(1)
    )

    result = await session.execute(query)
    return result.scalar_one_or_none() is not None


# League endpoints


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


# Season endpoints


@router.post("/api/leagues/{league_id}/seasons")
async def create_season(
    league_id: int,
    request: Request,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Create a season in a league (league_admin or system_admin).
    Body: {
        name?: str,
        start_date: ISO,
        end_date: ISO,
        point_system?: str (legacy),
        scoring_system?: str ("points_system" or "season_rating"),
        points_per_win?: int (default 3, for Points System),
        points_per_loss?: int (default 1, for Points System, can be 0 or negative)
    }
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
            point_system=body.get("point_system"),  # Legacy support
            scoring_system=body.get("scoring_system"),
            points_per_win=body.get("points_per_win"),
            points_per_loss=body.get("points_per_loss"),
        )

        # Fire-and-forget notification (non-blocking)
        asyncio.create_task(
            notification_service.notify_members_about_season_activated(
                session=session,
                league_id=league_id,
                season_id=season["id"],
                season_name=season.get("name") or "New Season",
                start_date=season.get("start_date"),
                end_date=season.get("end_date"),
            )
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
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """List seasons for a league. Requires authentication only."""
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
async def get_matches(request: Request, session: AsyncSession = Depends(get_db_session)):
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
            raise HTTPException(
                status_code=400, detail="Either season_id or league_id is required"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading matches: {str(e)}")


@router.get("/api/seasons/{season_id}/matches")
async def get_season_matches(season_id: int, session: AsyncSession = Depends(get_db_session)):
    """Get all matches for a season with ELO changes (public). Deprecated: use POST /api/matches instead."""
    try:
        matches = await data_service.get_season_matches_with_elo(session, season_id)
        return matches
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading season matches: {str(e)}")


@router.post("/api/player-stats")
async def get_all_player_stats(request: Request, session: AsyncSession = Depends(get_db_session)):
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
            raise HTTPException(
                status_code=400, detail="Either season_id or league_id is required"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading player stats: {str(e)}")


@router.get("/api/seasons/{season_id}/player-stats")
async def get_season_player_stats(season_id: int, session: AsyncSession = Depends(get_db_session)):
    """Get all player season stats for a season (public). Deprecated: use POST /api/player-stats instead."""
    try:
        player_stats = await data_service.get_all_player_season_stats(session, season_id)
        return player_stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading player season stats: {str(e)}")


@router.post("/api/partnership-opponent-stats")
async def get_partnership_opponent_stats(
    request: Request, session: AsyncSession = Depends(get_db_session)
):
    """Get all partnership and opponent stats for all players in a season or league (public)."""
    try:
        body = await request.json()
        season_id = body.get("season_id")
        league_id = body.get("league_id")

        if season_id is not None:
            stats = await data_service.get_all_player_season_partnership_opponent_stats(
                session, season_id
            )
            return stats
        elif league_id is not None:
            stats = await data_service.get_all_player_league_partnership_opponent_stats(
                session, league_id
            )
            return stats
        else:
            raise HTTPException(
                status_code=400, detail="Either season_id or league_id is required"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error loading partnership/opponent stats: {str(e)}"
        )


@router.get("/api/seasons/{season_id}/partnership-opponent-stats")
async def get_season_partnership_opponent_stats(
    season_id: int, session: AsyncSession = Depends(get_db_session)
):
    """Get all partnership and opponent stats for all players in a season (public). Deprecated: use POST /api/partnership-opponent-stats instead."""
    try:
        stats = await data_service.get_all_player_season_partnership_opponent_stats(
            session, season_id
        )
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error loading partnership/opponent stats: {str(e)}"
        )


@router.get("/api/players/{player_id}/season/{season_id}/partnership-opponent-stats")
async def get_player_season_partnership_opponent_stats(
    player_id: int, season_id: int, session: AsyncSession = Depends(get_db_session)
):
    """Get partnership and opponent stats for a player in a season (public)."""
    try:
        stats = await data_service.get_player_season_partnership_opponent_stats(
            session, player_id, season_id
        )
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error loading partnership/opponent stats: {str(e)}"
        )


@router.get("/api/leagues/{league_id}/player-stats")
async def get_league_player_stats(league_id: int, session: AsyncSession = Depends(get_db_session)):
    """Get all player league stats for a league (public)."""
    try:
        player_stats = await data_service.get_all_player_league_stats(session, league_id)
        return player_stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading player league stats: {str(e)}")


@router.get("/api/leagues/{league_id}/partnership-opponent-stats")
async def get_league_partnership_opponent_stats(
    league_id: int, session: AsyncSession = Depends(get_db_session)
):
    """Get all partnership and opponent stats for all players in a league (public)."""
    try:
        stats = await data_service.get_all_player_league_partnership_opponent_stats(
            session, league_id
        )
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error loading partnership/opponent stats: {str(e)}"
        )


@router.get("/api/players/{player_id}/league/{league_id}/stats")
async def get_player_league_stats(
    player_id: int, league_id: int, session: AsyncSession = Depends(get_db_session)
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
        league_stats = await data_service.get_player_league_stats(session, player_id, league_id)

        if league_stats is None:
            raise HTTPException(status_code=404, detail="Player or league not found.")

        return league_stats
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading player league stats: {str(e)}")


@router.get("/api/players/{player_id}/league/{league_id}/partnership-opponent-stats")
async def get_player_league_partnership_opponent_stats(
    player_id: int, league_id: int, session: AsyncSession = Depends(get_db_session)
):
    """Get partnership and opponent stats for a player in a league (public)."""
    try:
        stats = await data_service.get_player_league_partnership_opponent_stats(
            session, player_id, league_id
        )
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error loading partnership/opponent stats: {str(e)}"
        )


@router.put("/api/seasons/{season_id}")
async def update_season(
    season_id: int,
    request: Request,
    user: dict = Depends(
        get_current_user
    ),  # League admin check inside service based on season->league
    session: AsyncSession = Depends(get_db_session),
):
    """
    Update a season (league_admin or system_admin).
    Body may include:
        name, start_date, end_date, point_system (legacy),
        scoring_system ("points_system" or "season_rating"),
        points_per_win, points_per_loss (for Points System)
    When changing scoring system, stats will be recalculated.
    """
    try:
        body = await request.json()
        season = await data_service.update_season(session, season_id=season_id, **body)
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


# League Messages endpoints
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


# Location endpoints


@router.post("/api/locations")
async def create_location(
    request: Request,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
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
    lat: float, lon: float, session: AsyncSession = Depends(get_db_session)
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
    current_user: dict = Depends(get_current_user_optional),  # Optional auth for rate limiting
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
            status_code=e.response.status_code, detail=f"Geoapify API error: {e.response.text}"
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
    session: AsyncSession = Depends(get_db_session),
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
    session: AsyncSession = Depends(get_db_session),
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
    session: AsyncSession = Depends(get_db_session),
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
    location_id: Optional[str] = None, session: AsyncSession = Depends(get_db_session)
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
    session: AsyncSession = Depends(get_db_session),
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
    session: AsyncSession = Depends(get_db_session),
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


# ---------------------------------------------------------------------------
# Court Discovery — authenticated endpoints
# ---------------------------------------------------------------------------


@router.post("/api/courts/submit", response_model=dict)
@limiter.limit("10/minute")
async def submit_court(
    request: Request,
    payload: CreateCourtRequest,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Submit a new court for admin approval (verified player).

    Court is created with status='pending'. Geocodes address if no lat/lng provided.
    """
    try:
        lat, lng = payload.latitude, payload.longitude
        if lat is None or lng is None:
            lat, lng = await geocoding_service.geocode_address(payload.address)

        result = await court_service.create_court(
            session,
            name=payload.name,
            address=payload.address,
            location_id=payload.location_id,
            created_by_player_id=user["player_id"],
            status="pending",
            description=payload.description,
            court_count=payload.court_count,
            surface_type=payload.surface_type,
            is_free=payload.is_free,
            cost_info=payload.cost_info,
            has_lights=payload.has_lights,
            has_restrooms=payload.has_restrooms,
            has_parking=payload.has_parking,
            parking_info=payload.parking_info,
            nets_provided=payload.nets_provided,
            hours=payload.hours,
            phone=payload.phone,
            website=payload.website,
            latitude=lat,
            longitude=lng,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error submitting court: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error submitting court")


@router.put("/api/courts/{court_id}/update", response_model=dict)
async def update_court_discovery(
    court_id: int,
    payload: UpdateCourtRequest,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Update court info (creator or system admin).

    Only the court creator or a system admin can update court fields.
    """
    try:
        await require_court_owner_or_admin(session, court_id, user)

        result = await court_service.update_court_fields(
            session,
            court_id,
            updater_player_id=user["player_id"],
            **payload.model_dump(exclude_unset=True),
        )
        if not result:
            raise HTTPException(status_code=404, detail="Court not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error updating court: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error updating court")


# --- Reviews ---


@router.post("/api/courts/{court_id}/reviews", response_model=ReviewActionResponse)
@limiter.limit("10/minute")
async def create_court_review(
    request: Request,
    court_id: int,
    payload: CreateReviewRequest,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Create a review for a court (verified player, one per court).

    Star rating 1-5 required. Text and tags are optional.
    """
    try:
        result = await court_service.create_review(
            session,
            court_id=court_id,
            player_id=user["player_id"],
            rating=payload.rating,
            review_text=payload.review_text,
            tag_ids=payload.tag_ids or [],
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error creating review: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error creating review")


@router.put("/api/courts/{court_id}/reviews/{review_id}", response_model=ReviewActionResponse)
async def update_court_review(
    court_id: int,
    review_id: int,
    payload: UpdateReviewRequest,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Update an existing review (author only)."""
    try:
        result = await court_service.update_review(
            session,
            review_id=review_id,
            player_id=user["player_id"],
            rating=payload.rating,
            review_text=payload.review_text,
            tag_ids=payload.tag_ids,
        )
        if not result:
            raise HTTPException(status_code=404, detail="Review not found or not authorized")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error updating review: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error updating review")


@router.delete("/api/courts/{court_id}/reviews/{review_id}", response_model=ReviewActionResponse)
async def delete_court_review(
    court_id: int,
    review_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Delete a review (author only).

    Triggers async S3 photo cleanup if photos were attached.
    """
    try:
        result = await court_service.delete_review(
            session,
            review_id=review_id,
            player_id=user["player_id"],
        )
        if not result:
            raise HTTPException(status_code=404, detail="Review not found or not authorized")

        # Concurrent S3 photo cleanup
        photo_keys = result.pop("photo_s3_keys", [])
        if photo_keys:
            delete_tasks = [asyncio.to_thread(s3_service.delete_file, key) for key in photo_keys]
            results = await asyncio.gather(*delete_tasks, return_exceptions=True)
            for key, res in zip(photo_keys, results):
                if isinstance(res, Exception):
                    logger.error("Failed to delete S3 photo: %s — %s", key, res, exc_info=True)

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error deleting review: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error deleting review")


@router.post("/api/courts/{court_id}/reviews/{review_id}/photos", response_model=dict)
@limiter.limit("20/minute")
async def upload_review_photo(
    request: Request,
    court_id: int,
    review_id: int,
    file: UploadFile = File(...),
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Upload a photo to a review (author only, max 3 per review).

    Photos are resized to max 1200px and converted to JPEG 85%.
    Two-step: create review first, then upload photos separately.
    """
    try:
        # Process and upload
        processed = await court_photo_service.process_court_photo(file)
        s3_key = f"court-photos/{court_id}/{review_id}/{uuid.uuid4()}.jpg"
        url = await asyncio.to_thread(s3_service.upload_file, processed, s3_key, "image/jpeg")

        result = await court_service.add_review_photo(
            session,
            review_id=review_id,
            player_id=user["player_id"],
            s3_key=s3_key,
            url=url,
        )
        if not result:
            raise HTTPException(status_code=404, detail="Review not found or not authorized")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error uploading review photo: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error uploading photo")


# --- Edit suggestions ---


@router.post("/api/courts/{court_id}/suggest-edit", response_model=dict)
@limiter.limit("10/minute")
async def suggest_court_edit(
    request: Request,
    court_id: int,
    payload: CourtEditSuggestionRequest,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Submit an edit suggestion for a court (verified player)."""
    try:
        result = await court_service.create_edit_suggestion(
            session,
            court_id=court_id,
            suggested_by_player_id=user["player_id"],
            changes=payload.changes,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error creating edit suggestion: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error creating suggestion")


@router.get("/api/courts/{court_id}/suggestions", response_model=List[CourtEditSuggestionResponse])
async def list_court_edit_suggestions(
    court_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """List edit suggestions for a court (creator or admin)."""
    try:
        await require_court_owner_or_admin(session, court_id, user)
        return await court_service.list_edit_suggestions(session, court_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error listing suggestions: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error listing suggestions")


@router.put("/api/courts/suggestions/{suggestion_id}", response_model=dict)
async def resolve_court_edit_suggestion(
    suggestion_id: int,
    action: SuggestionAction = Query(...),
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Approve or reject an edit suggestion (court creator or admin)."""
    try:
        # Look up the suggestion to find its court, then verify ownership
        from sqlalchemy import select as sa_select
        from backend.database.models import CourtEditSuggestion

        suggestion_result = await session.execute(
            sa_select(CourtEditSuggestion.court_id).where(
                CourtEditSuggestion.id == suggestion_id
            )
        )
        court_id = suggestion_result.scalar_one_or_none()
        if court_id is None:
            raise HTTPException(status_code=404, detail="Suggestion not found")

        await require_court_owner_or_admin(session, court_id, user)

        result = await court_service.resolve_edit_suggestion(
            session,
            suggestion_id=suggestion_id,
            action=action.value,
            reviewer_player_id=user["player_id"],
        )
        if not result:
            raise HTTPException(status_code=404, detail="Suggestion not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error resolving suggestion: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error resolving suggestion")


# --- Admin court management ---


@router.get("/api/admin/courts/pending", response_model=list)
async def list_pending_courts(
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """List all pending court submissions for admin review."""
    return await court_service.list_pending_courts(session)


@router.put("/api/admin/courts/{court_id}/approve", response_model=dict)
async def approve_court(
    court_id: int,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Approve a pending court submission (system admin)."""
    result = await court_service.approve_court(session, court_id)
    if not result:
        raise HTTPException(status_code=404, detail="Court not found")
    return result


@router.put("/api/admin/courts/{court_id}/reject", response_model=dict)
async def reject_court(
    court_id: int,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Reject a pending court submission (system admin)."""
    result = await court_service.reject_court(session, court_id)
    if not result:
        raise HTTPException(status_code=404, detail="Court not found")
    return result


async def proxy_whatsapp_request(
    method: str,
    path: str,
    body: Optional[Dict[Any, Any]] = None,
    timeout: float = WHATSAPP_REQUEST_TIMEOUT,
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
            detail="WhatsApp service is not available. Make sure it's running on port 3001.",
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504, detail=f"WhatsApp service request timed out after {timeout} seconds."
        )
    except httpx.HTTPStatusError as e:
        # Forward the status code from the WhatsApp service
        raise HTTPException(
            status_code=e.response.status_code, detail=f"WhatsApp service error: {e.response.text}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error communicating with WhatsApp service: {str(e)}"
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
        ),
    )


@router.post("/api/calculate")
@router.post("/api/calculate-stats")
async def calculate_stats(
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
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
        except Exception:
            body = {}

        league_id = body.get("league_id") if body else None
        season_id = body.get("season_id") if body else None  # Backward compatibility

        # If season_id provided but not league_id, get league_id from season (backward compatibility)
        if season_id and not league_id:
            season_result = await session.execute(select(Season).where(Season.id == season_id))
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
            "season_id": season_id,  # Deprecated, kept for backward compatibility
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error queueing stats calculation: {str(e)}")


@router.get("/api/calculate-stats/status")
async def get_calculation_status(
    current_user: dict = Depends(get_current_user), session: AsyncSession = Depends(get_db_session)
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
    session: AsyncSession = Depends(get_db_session),
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
async def query_rankings(request: Request, session: AsyncSession = Depends(get_db_session)):
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
async def list_players(
    q: Optional[str] = None,
    location_id: Optional[List[str]] = Query(None),
    league_id: Optional[List[int]] = Query(None),
    gender: Optional[List[str]] = Query(None),
    level: Optional[List[str]] = Query(None),
    limit: int = 50,
    offset: int = 0,
    include_placeholders: bool = False,
    session_id: Optional[int] = None,
    current_user: Optional[dict] = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Get list of players with optional search and filters. Always returns { items, total }.

    Query params: q (search name), location_id (repeatable), league_id (repeatable),
    gender (repeatable), level (repeatable), limit (default 50), offset (default 0),
    include_placeholders (bool, requires auth), session_id (int, for placeholder scoping).
    """
    try:
        # Resolve placeholder scoping — requires auth
        include_placeholders_for_player_id = None
        if include_placeholders and current_user:
            player = await data_service.get_player_by_user_id(session, current_user["id"])
            if player:
                include_placeholders_for_player_id = player["id"]

        items, total = await data_service.list_players_search(
            session,
            q=q,
            location_ids=location_id,
            league_ids=league_id,
            genders=gender,
            levels=level,
            limit=limit,
            offset=offset,
            include_placeholders_for_player_id=include_placeholders_for_player_id,
            session_id=session_id,
        )
        return {"items": items, "total": total}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading players: {str(e)}")


# --- Placeholder Player endpoints ---


@router.post("/api/players/placeholder")
async def create_placeholder_player(
    request: CreatePlaceholderRequest,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Create a placeholder player with an invite link.

    Request body:
        {
            "name": "John Smith",
            "phone_number": "+15551234567",  // optional
            "league_id": 1                    // optional
        }

    Returns:
        PlaceholderPlayerResponse
    """
    try:
        if not request.name or not request.name.strip():
            raise HTTPException(status_code=400, detail="Name is required")

        player = await data_service.get_player_by_user_id(session, current_user["id"])
        if not player:
            raise HTTPException(status_code=404, detail="Player profile not found")

        # Validate league exists if provided
        if request.league_id is not None:
            from backend.database.models import League

            league_result = await session.execute(
                select(League).where(League.id == request.league_id)
            )
            if league_result.scalar_one_or_none() is None:
                raise HTTPException(status_code=404, detail="League not found")

        result = await placeholder_service.create_placeholder(
            session=session,
            name=request.name.strip(),
            created_by_player_id=player["id"],
            phone_number=request.phone_number,
            league_id=request.league_id,
            gender=request.gender,
            level=request.level,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating placeholder: {str(e)}")


@router.get("/api/players/placeholder")
async def list_placeholder_players(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    List all placeholder players created by the current user.

    Returns:
        PlaceholderListResponse
    """
    try:
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        if not player:
            raise HTTPException(status_code=404, detail="Player profile not found")

        result = await placeholder_service.list_placeholders(session, player["id"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing placeholders: {str(e)}")


@router.delete("/api/players/placeholder/{player_id}")
async def delete_placeholder_player(
    player_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Delete a placeholder player and reassign its matches to "Unknown Player".

    Returns:
        DeletePlaceholderResponse
    """
    try:
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        if not player:
            raise HTTPException(status_code=404, detail="Player profile not found")

        result = await placeholder_service.delete_placeholder(
            session=session,
            player_id=player_id,
            creator_player_id=player["id"],
        )
        return result
    except HTTPException:
        raise
    except ValueError:
        raise HTTPException(status_code=404, detail="Placeholder player not found")
    except PermissionError:
        raise HTTPException(status_code=403, detail="You can only delete placeholders you created")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting placeholder: {str(e)}")


# --- Invite Claim endpoints ---


@router.get("/api/invites/{token}")
@limiter.limit("30/minute")
async def get_invite_details(
    request: Request,
    token: str,
    session: AsyncSession = Depends(get_db_session),
):
    """
    Get public-facing invite details for the landing page.

    No authentication required. Returns inviter name, placeholder name,
    match count, league names, and current invite status.

    Returns:
        InviteDetailsResponse
    """
    try:
        result = await placeholder_service.get_invite_details(session, token)
        return result
    except placeholder_service.InviteNotFoundError:
        raise HTTPException(status_code=404, detail="Invite not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving invite: {str(e)}")


@router.post("/api/invites/{token}/claim")
async def claim_invite(
    token: str,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Claim an invite, linking the placeholder's matches to the authenticated user.

    If the user has no player profile, the placeholder becomes their profile.
    If the user already has a player profile, the placeholder's data is merged.

    Returns:
        ClaimInviteResponse
    """
    try:
        result = await placeholder_service.claim_invite(
            session=session,
            token=token,
            claiming_user_id=current_user["id"],
        )
        return result
    except (placeholder_service.InviteNotFoundError, placeholder_service.PlaceholderNotFoundError) as e:
        raise HTTPException(status_code=404, detail=str(e))
    except placeholder_service.InviteAlreadyClaimedError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except placeholder_service.MergeConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error claiming invite: {str(e)}")


@router.post("/api/players")
async def create_player(
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
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
        name = body.get("name", "").strip()

        if not name:
            raise HTTPException(status_code=400, detail="Player name is required")

        player_id = await data_service.get_or_create_player(session, name)

        return {
            "status": "success",
            "message": f"Player '{name}' created successfully",
            "player_id": player_id,
            "name": name,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating player: {str(e)}")


@router.get("/api/players/{player_id}/matches")
async def get_player_match_history(
    player_id: int, session: AsyncSession = Depends(get_db_session)
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
            raise HTTPException(status_code=404, detail=f"Player with ID {player_id} not found.")

        # Return empty array if player exists but has no matches
        return match_history
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading match history: {str(e)}")


@router.get("/api/players/{player_id}/season/{season_id}/stats")
async def get_player_season_stats(
    player_id: int, season_id: int, session: AsyncSession = Depends(get_db_session)
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
        season_stats = await data_service.get_player_season_stats(session, player_id, season_id)

        if season_stats is None:
            raise HTTPException(status_code=404, detail="Player or season not found.")

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
                status_code=404, detail="ELO timeline not found. Please run /api/calculate first."
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
    session: AsyncSession = Depends(get_db_session),
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
            headers={"Content-Disposition": "attachment; filename=matches_export.csv"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error exporting matches: {str(e)}")


@router.get("/api/players/{player_id}/stats")
async def get_player_stats(player_id: int, session: AsyncSession = Depends(get_db_session)):
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
            raise HTTPException(status_code=404, detail=f"Player with ID {player_id} not found.")

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
        return {"status": "healthy", "message": "API is running"}
    except Exception as e:
        return {"status": "unhealthy", "data_available": False, "message": f"Error: {str(e)}"}


# WhatsApp proxy endpoints (optional - frontend can also call the service directly)

# Weekly Schedule endpoints


@router.post("/api/seasons/{season_id}/weekly-schedules", response_model=WeeklyScheduleResponse)
async def create_weekly_schedule(
    season_id: int,
    payload: WeeklyScheduleCreate,
    user: dict = Depends(make_require_league_admin_from_season()),
    session: AsyncSession = Depends(get_db_session),
):
    """Create a weekly schedule (admin only)."""
    try:
        # Get user's player_id
        result = await session.execute(select(Player).where(Player.user_id == user["id"]))
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
            creator_player_id=player.id,
        )
        return schedule
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating weekly schedule: {str(e)}")


@router.get(
    "/api/seasons/{season_id}/weekly-schedules", response_model=List[WeeklyScheduleResponse]
)
async def list_weekly_schedules(
    season_id: int,
    user: dict = Depends(make_require_league_member_from_season()),
    session: AsyncSession = Depends(get_db_session),
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
    session: AsyncSession = Depends(get_db_session),
):
    """Update a weekly schedule (admin only)."""
    try:
        # Get user's player_id
        result = await session.execute(select(Player).where(Player.user_id == user["id"]))
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
            updater_player_id=player.id,
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
    session: AsyncSession = Depends(get_db_session),
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
    session: AsyncSession = Depends(get_db_session),
):
    """Create an ad-hoc signup (league member)."""
    try:
        # Get user's player_id
        result = await session.execute(select(Player).where(Player.user_id == user["id"]))
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
            creator_player_id=player.id,
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
    session: AsyncSession = Depends(get_db_session),
):
    """List signups for a season. Public endpoint."""
    try:
        return await data_service.get_signups(
            session,
            season_id,
            upcoming_only=upcoming_only,
            past_only=past_only,
            include_players=include_players,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing signups: {str(e)}")


@router.get("/api/signups/{signup_id}", response_model=SignupWithPlayersResponse)
async def get_signup(
    signup_id: int,
    user: dict = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_db_session),
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
    session: AsyncSession = Depends(get_db_session),
):
    """Update a signup (admin only)."""
    try:
        # Get user's player_id
        result = await session.execute(select(Player).where(Player.user_id == user["id"]))
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
            updater_player_id=player.id,
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
    session: AsyncSession = Depends(get_db_session),
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
    session: AsyncSession = Depends(get_db_session),
):
    """Player signs up for a signup."""
    try:
        # Get user's player_id
        result = await session.execute(select(Player).where(Player.user_id == user["id"]))
        player = result.scalar_one_or_none()
        if not player:
            raise HTTPException(status_code=404, detail="Player not found for user")

        success = await data_service.signup_player(
            session=session, signup_id=signup_id, player_id=player.id, creator_player_id=player.id
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
    session: AsyncSession = Depends(get_db_session),
):
    """Player drops out of a signup."""
    try:
        # Get user's player_id
        result = await session.execute(select(Player).where(Player.user_id == user["id"]))
        player = result.scalar_one_or_none()
        if not player:
            raise HTTPException(status_code=404, detail="Player not found for user")

        success = await data_service.dropout_player(
            session=session, signup_id=signup_id, player_id=player.id, creator_player_id=player.id
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
    session: AsyncSession = Depends(get_db_session),
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
    session: AsyncSession = Depends(get_db_session),
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
    current_user: dict = Depends(get_current_user), session: AsyncSession = Depends(get_db_session)
):
    """
    Get WhatsApp configuration (selected group for automated messages).

    Returns:
        dict: Configuration including group_id
    """
    try:
        group_id = await data_service.get_setting(session, "whatsapp_group_id")
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
    session: AsyncSession = Depends(get_db_session),
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
        group_id = body.get("group_id")

        if not group_id:
            raise HTTPException(status_code=400, detail="group_id is required")

        await data_service.set_setting(session, "whatsapp_group_id", group_id)

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
    session: AsyncSession = Depends(get_db_session),
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
    session: AsyncSession = Depends(get_db_session),
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
    session: AsyncSession = Depends(get_db_session),
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
        query = (
            select(Session)
            .join(Season, Session.season_id == Season.id)
            .where(Season.league_id == league_id)
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
    session: AsyncSession = Depends(get_db_session),
):
    """
    Create a new pending session for a league (league_admin).
    Body: { date?: 'MM/DD/YYYY', name?: string }
    """
    try:
        body = await request.json()
        date = body.get("date") or datetime.now().strftime("%-m/%-d/%Y")
        name = body.get("name")

        # Get player_id from user
        player_id = None
        if user:
            player = await data_service.get_player_by_user_id(session, user["id"])
            if player:
                player_id = player["id"]

        new_session = await data_service.create_league_session(
            session=session, league_id=league_id, date=date, name=name, created_by=player_id
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
    user: dict = Depends(make_require_league_member()),
    session: AsyncSession = Depends(get_db_session),
):
    """
    End/lock in a league session by submitting it (any league member).

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
            raise HTTPException(
                status_code=400, detail="submit field must be true to submit a session"
            )

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
            "message": "Session submitted and stats calculations queued",
            "global_job_id": result["global_job_id"],
            "league_job_id": result.get("league_job_id"),
            "season_id": result["season_id"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating league session: {str(e)}")


@router.get("/api/sessions/open")
async def get_open_sessions(
    current_user: dict = Depends(get_current_user), session: AsyncSession = Depends(get_db_session)
):
    """
    Get all open (ACTIVE) sessions where the current user is creator, has a match, or is invited.
    Returns league and non-league sessions.
    """
    try:
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        if not player:
            return []
        return await data_service.get_open_sessions_for_user(session, player["id"])
    except Exception as e:
        logger.error(f"Error getting open sessions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting open sessions: {str(e)}")


@router.get("/api/sessions/by-code/{code}")
async def get_session_by_code(
    code: str,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Get a session by its shareable code. Returns session with league_id if league session."""
    sess = await data_service.get_session_by_code(session, code)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    return sess


@router.get("/api/sessions/{session_id}/matches")
async def get_session_matches(
    session_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Get all matches for a session."""
    sess = await data_service.get_session(session, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    matches = await data_service.get_session_matches(session, session_id)
    return matches


@router.get("/api/sessions/{session_id}/participants")
async def get_session_participants(
    session_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Get list of players in the session (participants + players who have matches)."""
    sess = await data_service.get_session(session, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    if not await data_service.can_user_add_match_to_session(
        session, session_id, sess, current_user["id"]
    ):
        raise HTTPException(
            status_code=403, detail="Only session participants can view the roster"
        )
    participants = await data_service.get_session_participants(session, session_id)
    return participants


@router.delete("/api/sessions/{session_id}/participants/{player_id}")
async def remove_session_participant(
    session_id: int,
    player_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Remove a player from session participants. Cannot remove a player who has matches in this session."""
    sess = await data_service.get_session(session, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    if sess.get("status") != "ACTIVE":
        raise HTTPException(status_code=400, detail="Can only modify roster of an active session")
    if sess.get("created_by") == player_id:
        raise HTTPException(
            status_code=403, detail="Session creator cannot remove themselves from the session"
        )
    if not await data_service.can_user_add_match_to_session(
        session, session_id, sess, current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Only session participants can remove players")
    removed = await data_service.remove_session_participant(session, session_id, player_id)
    if not removed:
        raise HTTPException(
            status_code=400,
            detail="Player not in roster or has games in this session and cannot be removed",
        )
    return {"status": "success", "message": "Player removed from session"}


@router.post("/api/sessions/join")
async def join_session_by_code(
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Join a session by code (adds current user's player to session participants)."""
    try:
        body = await request.json()
        code = body.get("code")
        if not code or not isinstance(code, str):
            raise HTTPException(status_code=400, detail="code is required")
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        if not player:
            raise HTTPException(status_code=400, detail="Player profile not found")
        sess = await data_service.join_session_by_code(session, code.strip().upper(), player["id"])
        if not sess:
            raise HTTPException(status_code=404, detail="Session not found or not active")
        return {"status": "success", "message": "Joined session", "session": sess}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error joining session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/sessions/{session_id}/invite")
async def invite_to_session(
    session_id: int,
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Invite a player to a session (add to participants). Caller must be creator or existing participant."""
    try:
        sess = await data_service.get_session(session, session_id)
        if not sess:
            raise HTTPException(status_code=404, detail="Session not found")
        if sess.get("status") != "ACTIVE":
            raise HTTPException(status_code=400, detail="Can only invite to an active session")
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        if not player:
            raise HTTPException(status_code=400, detail="Player profile not found")
        if not await data_service.can_user_add_match_to_session(
            session, session_id, sess, current_user["id"]
        ):
            raise HTTPException(
                status_code=403, detail="Only session participants can invite others"
            )
        body = await request.json()
        invited_player_id = body.get("player_id")
        if invited_player_id is None:
            raise HTTPException(status_code=400, detail="player_id is required")
        invited_player_id = int(invited_player_id)
        await data_service.add_session_participant(
            session, session_id, invited_player_id, invited_by=player["id"]
        )
        return {"status": "success", "message": "Player invited to session"}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error inviting to session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/sessions/{session_id}/invite_batch")
async def invite_to_session_batch(
    session_id: int,
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Invite multiple players to a session in one request. Same auth rules as single invite.
    Body: { "player_ids": number[] }. Returns { "added": number[], "failed": [{"player_id": number, "error": string}] }.
    """
    try:
        sess = await data_service.get_session(session, session_id)
        if not sess:
            raise HTTPException(status_code=404, detail="Session not found")
        if sess.get("status") != "ACTIVE":
            raise HTTPException(status_code=400, detail="Can only invite to an active session")
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        if not player:
            raise HTTPException(status_code=400, detail="Player profile not found")
        if not await data_service.can_user_add_match_to_session(
            session, session_id, sess, current_user["id"]
        ):
            raise HTTPException(
                status_code=403, detail="Only session participants can invite others"
            )
        body = await request.json()
        player_ids = body.get("player_ids")
        if not isinstance(player_ids, list):
            raise HTTPException(status_code=400, detail="player_ids must be an array")
        added = []
        failed = []
        for pid in player_ids:
            try:
                pid = int(pid)
            except (TypeError, ValueError):
                failed.append({"player_id": pid, "error": "Invalid player id"})
                continue
            try:
                await data_service.add_session_participant(
                    session, session_id, pid, invited_by=player["id"]
                )
                added.append(pid)
            except Exception as e:
                err_msg = str(e)
                if "foreign key" in err_msg.lower() or "not found" in err_msg.lower():
                    err_msg = "Player not found"
                failed.append({"player_id": pid, "error": err_msg})
        return {"added": added, "failed": failed}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error batch inviting to session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/sessions")
async def create_session(
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Create a new non-league session (with shareable code).
    Request body: { "date": "...", "name": "...", "court_id": ... } (all optional except date defaults to today).
    Returns created session info including code.
    """
    try:
        body = await request.json()
        if not isinstance(body, dict):
            body = {}
        date = body.get("date")
        if not date:
            date = datetime.now().strftime("%-m/%-d/%Y")
        name = body.get("name")
        court_id = body.get("court_id")
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        created_by = player["id"] if player else None
        new_session = await data_service.create_session(
            session, date, name=name, court_id=court_id, created_by=created_by
        )
        return {
            "status": "success",
            "message": "Session created successfully",
            "session": new_session,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating session: {str(e)}")


@router.patch("/api/sessions/{session_id}")
async def update_session(
    session_id: int,
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
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
                "message": "Session submitted and stats calculations queued",
                "global_job_id": result["global_job_id"],
                "league_job_id": result.get("league_job_id"),
                "season_id": result["season_id"],
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
                detail="At least one field must be provided: submit, name, date, or season_id",
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
            update_season_id=update_season_id,
        )

        if not result:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

        return {"status": "success", "message": "Session updated successfully", "session": result}
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
    session: AsyncSession = Depends(get_db_session),
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
            "session_id": session_id,
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
    session: AsyncSession = Depends(get_db_session),
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
            match_request.team2_player2_id,
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

            session_status = session_obj.get("status")
            # Allow match creation if session is ACTIVE, or if session is SUBMITTED/EDITED and user is allowed
            if session_status != "ACTIVE":
                if session_status not in ("SUBMITTED", "EDITED"):
                    raise HTTPException(
                        status_code=400, detail="Cannot add matches to a session with this status"
                    )
                # Non-league: only creator/participants can add to submitted sessions
                if session_obj.get("season_id") is None:
                    if not await data_service.can_user_add_match_to_session(
                        session, session_id, session_obj, current_user["id"]
                    ):
                        raise HTTPException(
                            status_code=403,
                            detail="Only session participants can add matches to this session",
                        )
                else:
                    if not await is_user_admin_of_session_league(
                        session, current_user["id"], session_id
                    ):
                        raise HTTPException(
                            status_code=403,
                            detail="Only league admins can add matches to submitted sessions",
                        )
            else:
                # ACTIVE: for non-league, require participant
                if session_obj.get("season_id") is None:
                    if not await data_service.can_user_add_match_to_session(
                        session, session_id, session_obj, current_user["id"]
                    ):
                        raise HTTPException(
                            status_code=403,
                            detail="Only session participants can add matches to this session",
                        )
        else:
            # No session_id: either league_id (find/create league session) or neither (create non-league session)
            league_id = match_request.league_id
            match_date = match_request.date
            if not match_date:
                today = datetime.now()
                match_date = f"{today.month}/{today.day}/{today.year}"

            player_id = None
            player = await data_service.get_player_by_user_id(session, current_user["id"])
            if player:
                player_id = player["id"]

            if league_id is None:
                # Create non-league session and add match to it
                new_session = await data_service.create_session(
                    session=session,
                    date=match_date,
                    created_by=player_id,
                )
                session_obj = new_session
                session_id = new_session["id"]
            else:
                # league_id provided - find/create league session (existing behavior)
                season_id = match_request.season_id
                selected_season = None

                if season_id:
                    season_result = await session.execute(
                        select(Season).where(
                            and_(Season.id == season_id, Season.league_id == league_id)
                        )
                    )
                    selected_season = season_result.scalar_one_or_none()
                    if not selected_season:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Season {season_id} not found or does not belong to league {league_id}",
                        )
                else:
                    current_date = date.today()
                    season_result = await session.execute(
                        select(Season)
                        .where(
                            and_(
                                Season.league_id == league_id,
                                Season.start_date <= current_date,
                                Season.end_date >= current_date,
                            )
                        )
                        .order_by(Season.created_at.desc())
                        .limit(1)
                    )
                    selected_season = season_result.scalar_one_or_none()
                    if not selected_season:
                        raise HTTPException(
                            status_code=400,
                            detail=f"League {league_id} does not have an active season. Please provide a season_id or create a season with dates that include today's date.",
                        )

                result = await session.execute(
                    select(Session)
                    .where(
                        and_(
                            Session.date == match_date,
                            Session.season_id == selected_season.id,
                            Session.status == SessionStatus.ACTIVE,
                        )
                    )
                    .with_for_update()
                )
                session_orm = result.scalar_one_or_none()
                if session_orm:
                    session_obj = {
                        "id": session_orm.id,
                        "date": session_orm.date,
                        "name": session_orm.name,
                        "status": session_orm.status.value if session_orm.status else None,
                        "season_id": session_orm.season_id,
                    }
                else:
                    session_obj = None
                if not session_obj:
                    session_obj = await data_service.get_or_create_active_league_session(
                        session=session,
                        league_id=league_id,
                        session_date=match_date,
                        created_by=player_id,
                        season_id=selected_season.id,
                    )
                session_id = session_obj["id"]

        # Create the match using the session's date
        match_id = await data_service.create_match_async(
            session=session,
            match_request=match_request,
            session_id=session_id,
            date=session_obj["date"],
        )

        return {
            "status": "success",
            "message": "Match created successfully",
            "match_id": match_id,
            "session_id": session_id,
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
    session: AsyncSession = Depends(get_db_session),
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
            match_request.team2_player2_id,
        ]
        if len(player_ids) != len(set(player_ids)):
            raise HTTPException(status_code=400, detail="All four players must be distinct")

        # Get match to verify it exists and belongs to active session
        match = await data_service.get_match_async(session, match_id)
        if not match:
            raise HTTPException(status_code=404, detail=f"Match {match_id} not found")

        session_status = match.get("session_status")
        # Allow match editing if session is ACTIVE, or if session is SUBMITTED/EDITED and user is league admin or non-league creator
        if session_status != "ACTIVE":
            if session_status not in ("SUBMITTED", "EDITED"):
                raise HTTPException(
                    status_code=400, detail="Cannot edit matches in a session with this status"
                )
            session_id = match.get("session_id")
            if not session_id:
                raise HTTPException(status_code=400, detail="Match does not belong to a session")
            session_obj = await data_service.get_session(session, session_id)
            if not session_obj:
                raise HTTPException(status_code=404, detail="Session not found")
            # Non-league: allow session creator to edit
            if session_obj.get("season_id") is None:
                player = await data_service.get_player_by_user_id(session, current_user["id"])
                if not player or session_obj.get("created_by") != player["id"]:
                    raise HTTPException(
                        status_code=403,
                        detail="Only the session creator can edit matches in this session",
                    )
            else:
                if not await is_user_admin_of_session_league(
                    session, current_user["id"], session_id
                ):
                    raise HTTPException(
                        status_code=403,
                        detail="Only league admins can edit matches in submitted sessions",
                    )

        # Get player_id for updated_by
        player_id = None
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        if player:
            player_id = player["id"]

        # Update the match
        success = await data_service.update_match_async(
            session=session, match_id=match_id, match_request=match_request, updated_by=player_id
        )

        if not success:
            raise HTTPException(status_code=404, detail=f"Match {match_id} not found")

        return {"status": "success", "message": "Match updated successfully", "match_id": match_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating match: {str(e)}")


@router.delete("/api/matches/{match_id}")
async def delete_match(
    match_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
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

        session_status = match.get("session_status")
        # Allow match deletion if session is ACTIVE, or if session is SUBMITTED/EDITED and user is league admin or non-league creator
        if session_status != "ACTIVE":
            if session_status not in ("SUBMITTED", "EDITED"):
                raise HTTPException(
                    status_code=400, detail="Cannot delete matches in a session with this status"
                )
            session_id = match.get("session_id")
            if not session_id:
                raise HTTPException(status_code=400, detail="Match does not belong to a session")
            session_obj = await data_service.get_session(session, session_id)
            if not session_obj:
                raise HTTPException(status_code=404, detail="Session not found")
            # Non-league: allow session creator to delete
            if session_obj.get("season_id") is None:
                player = await data_service.get_player_by_user_id(session, current_user["id"])
                if not player or session_obj.get("created_by") != player["id"]:
                    raise HTTPException(
                        status_code=403,
                        detail="Only the session creator can delete matches in this session",
                    )
            else:
                if not await is_user_admin_of_session_league(
                    session, current_user["id"], session_id
                ):
                    raise HTTPException(
                        status_code=403,
                        detail="Only league admins can delete matches in submitted sessions",
                    )

        # Delete the match
        success = await data_service.delete_match_async(session, match_id)

        if not success:
            raise HTTPException(status_code=404, detail=f"Match {match_id} not found")

        return {"status": "success", "message": "Match deleted successfully", "match_id": match_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting match: {str(e)}")


# ============================================================================
# Photo Match Upload Endpoints
# ============================================================================


@router.post("/api/leagues/{league_id}/matches/upload-photo")
@limiter.limit("10/minute")
async def upload_match_photo(
    league_id: int,
    request: Request,
    file: UploadFile = File(...),
    user_prompt: Optional[str] = Form(None),
    season_id: Optional[int] = Form(None),
    session: AsyncSession = Depends(get_db_session),
    current_user: dict = Depends(require_user),
    _league_member=Depends(make_require_league_member),
):
    """
    Upload a photo of game scores for AI processing.

    Validates the file, preprocesses the image (convert to JPEG, downscale to 400px height),
    creates a processing job, and returns job_id for polling.

    Args:
        league_id: League ID
        file: Image file (JPEG, PNG, HEIC)
        user_prompt: Optional context/instructions for the AI
        season_id: Optional season ID (required for confirmation)

    Returns:
        dict with job_id, session_id, status
    """
    try:
        # Read file content
        file_content = await file.read()

        # Validate image
        is_valid, error_msg = photo_match_service.validate_image_file(
            file_content, file.content_type or "", file.filename or ""
        )
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)

        # Preprocess image (convert to JPEG, downscale)
        _, image_base64 = photo_match_service.preprocess_image(file_content)

        # Generate session ID
        session_id = photo_match_service.generate_session_id()

        # Get league members for player matching
        members = await data_service.list_league_members(session, league_id)

        # Get user's player_id
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        player_id = player["id"] if player else None

        # Store session data in Redis (omit image_base64; process_photo_job receives it in-memory)
        session_data = {
            "league_id": league_id,
            "season_id": season_id,
            "user_id": current_user["id"],
            "player_id": player_id,
            "user_prompt": user_prompt,
            "parsed_matches": [],
            "partial_matches": [],  # Streamed matches while job is running
            "raw_response": None,  # Will be populated after AI processing
            "status": "PENDING",
            "matches_created": False,
            "created_match_ids": None,
            "created_at": utcnow().isoformat(),
            "last_updated": utcnow().isoformat(),
        }

        stored = await photo_match_service.store_session_data(session_id, session_data)
        if not stored:
            raise HTTPException(status_code=500, detail="Failed to initialize photo session")

        # Create job in database
        job_id = await photo_match_service.create_photo_match_job(session, league_id, session_id)

        # Start async processing task
        import asyncio

        asyncio.create_task(
            photo_match_service.process_photo_job(
                job_id=job_id,
                league_id=league_id,
                session_id=session_id,
                image_base64=image_base64,
                league_members=members,
            )
        )

        return {"job_id": job_id, "session_id": session_id, "status": "PENDING"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading match photo: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing photo upload: {str(e)}")


@router.post("/api/leagues/{league_id}/matches/photo-sessions/{session_id}/edit")
@limiter.limit("20/minute")
async def edit_photo_results(
    league_id: int,
    session_id: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    current_user: dict = Depends(require_user),
    _league_member=Depends(make_require_league_member),
):
    """
    Send edit prompt for conversation refinement.

    Retrieves conversation history from Redis, creates new processing job with edit prompt.

    Args:
        league_id: League ID
        session_id: Photo session ID

    Request body:
        {
            "edit_prompt": "The second player should be John Smith, not John Doe"
        }

    Returns:
        dict with job_id, session_id, status
    """
    try:
        body = await request.json()
        edit_prompt = body.get("edit_prompt")

        if not edit_prompt:
            raise HTTPException(status_code=400, detail="edit_prompt is required")

        # Get existing session data
        session_data = await photo_match_service.get_session_data(session_id)
        if not session_data:
            raise HTTPException(status_code=404, detail="Session not found or expired")

        # Verify league matches
        if session_data.get("league_id") != league_id:
            raise HTTPException(status_code=403, detail="Session does not belong to this league")

        # Get league members
        members = await data_service.list_league_members(session, league_id)

        # Create new job for the edit
        job_id = await photo_match_service.create_photo_match_job(session, league_id, session_id)

        # Start async clarification task (text-only, faster/cheaper than re-processing image)
        import asyncio

        asyncio.create_task(
            photo_match_service.process_clarification_job(
                job_id=job_id,
                league_id=league_id,
                session_id=session_id,
                league_members=members,
                user_prompt=edit_prompt,
            )
        )

        return {"job_id": job_id, "session_id": session_id, "status": "PENDING"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error editing photo results: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing edit: {str(e)}")


def _format_sse(event: str, data: dict) -> str:
    """Format event and data as a single SSE message (event + data lines + blank line)."""
    import json

    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@router.get("/api/leagues/{league_id}/matches/photo-jobs/{job_id}/stream")
@limiter.limit("60/minute")
async def stream_photo_job(
    league_id: int,
    job_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    current_user: dict = Depends(require_user),
    _league_member=Depends(make_require_league_member),
):
    """
    Stream photo job progress via Server-Sent Events.

    Intended for one client per job. Emits: partial (partial_matches),
    done (status + result), or error (message). Clients should close the
    stream after receiving done or error.
    """
    try:
        job = await photo_match_service.get_photo_match_job(session, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.league_id != league_id:
            raise HTTPException(status_code=403, detail="Job does not belong to this league")

        async def event_generator():
            try:
                async for event_name, data in photo_match_service.stream_photo_job_events(
                    job_id=job_id,
                    league_id=league_id,
                    session_id=job.session_id,
                ):
                    yield _format_sse(event_name, data)
            except Exception as e:
                logger.exception("Error streaming photo job %s: %s", job_id, e)
                yield _format_sse("error", {"message": "Stream error"})

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error starting photo job stream: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error starting stream")


@router.get("/api/leagues/{league_id}/matches/photo-jobs/{job_id}")
@limiter.limit("60/minute")
async def get_photo_job_status(
    league_id: int,
    job_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    current_user: dict = Depends(require_user),
    _league_member=Depends(make_require_league_member),
):
    """
    Get status of a photo processing job.

    Args:
        league_id: League ID
        job_id: Job ID

    Returns:
        dict with job status and result
    """
    try:
        # Get job from database
        job = await photo_match_service.get_photo_match_job(session, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        # Verify league matches
        if job.league_id != league_id:
            raise HTTPException(status_code=403, detail="Job does not belong to this league")

        response = {
            "job_id": job.id,
            "status": job.status.value,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
            "result": None,
        }

        # Include result if completed
        if job.status == PhotoMatchJobStatus.COMPLETED and job.result_data:
            import json

            response["result"] = json.loads(job.result_data)
        elif job.status == PhotoMatchJobStatus.FAILED:
            response["result"] = {"status": "FAILED", "error_message": job.error_message}
        # Include partial_matches while job is running (streaming)
        if job.status == PhotoMatchJobStatus.RUNNING:
            session_data = await photo_match_service.get_session_data(job.session_id)
            if session_data and session_data.get("partial_matches"):
                response["partial_matches"] = session_data["partial_matches"]

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting job status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error getting job status: {str(e)}")


@router.post("/api/leagues/{league_id}/matches/photo-sessions/{session_id}/confirm")
@limiter.limit("10/minute")
async def confirm_photo_matches(
    league_id: int,
    session_id: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    current_user: dict = Depends(require_user),
    _league_member=Depends(make_require_league_member),
):
    """
    Confirm parsed matches and create them in the database.

    This endpoint is idempotent - if matches have already been created for this session,
    it returns the existing match IDs.

    Args:
        league_id: League ID
        session_id: Photo session ID

    Request body:
        {
            "season_id": 123,
            "match_date": "2026-01-20"
        }

    Returns:
        dict with status, matches_created count, match_ids
    """
    try:
        body = await request.json()
        season_id = body.get("season_id")
        match_date = body.get("match_date")

        if not season_id:
            raise HTTPException(status_code=400, detail="season_id is required")
        if not match_date:
            raise HTTPException(status_code=400, detail="match_date is required")

        # Get session data
        session_data = await photo_match_service.get_session_data(session_id)
        if not session_data:
            raise HTTPException(status_code=404, detail="Session not found or expired")

        # Verify league matches
        if session_data.get("league_id") != league_id:
            raise HTTPException(status_code=403, detail="Session does not belong to this league")

        # Verify season belongs to league
        from sqlalchemy import select, and_
        from backend.database.models import Season

        season_result = await session.execute(
            select(Season).where(and_(Season.id == season_id, Season.league_id == league_id))
        )
        if not season_result.scalar_one_or_none():
            raise HTTPException(
                status_code=400, detail="Season not found or does not belong to this league"
            )

        # Create matches
        success, match_ids, message = await photo_match_service.create_matches_from_session(
            session, session_id, season_id, match_date
        )

        if not success:
            raise HTTPException(status_code=400, detail=message)

        # Clean up session data after successful creation (optional - keep for audit)
        # await photo_match_service.cleanup_session(session_id)

        return {
            "status": "success",
            "message": message,
            "matches_created": len(match_ids),
            "match_ids": match_ids,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error confirming matches: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error creating matches: {str(e)}")


@router.delete("/api/leagues/{league_id}/matches/photo-sessions/{session_id}")
async def cancel_photo_session(
    league_id: int,
    session_id: str,
    session: AsyncSession = Depends(get_db_session),
    current_user: dict = Depends(require_user),
    _league_member=Depends(make_require_league_member),
):
    """
    Cancel session and cleanup Redis data.

    Args:
        league_id: League ID
        session_id: Photo session ID

    Returns:
        dict with status
    """
    try:
        # Get session data to verify ownership
        session_data = await photo_match_service.get_session_data(session_id)
        if session_data and session_data.get("league_id") != league_id:
            raise HTTPException(status_code=403, detail="Session does not belong to this league")

        # Clean up Redis
        await photo_match_service.cleanup_session(session_id)

        return {"status": "cancelled"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error cancelling session: {str(e)}")


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
            raise HTTPException(status_code=400, detail="Phone number is already registered")

        # Validate password strength
        if len(request.password) < 8:
            raise HTTPException(
                status_code=400, detail="Password must be at least 8 characters long"
            )
        if not any(char.isdigit() for char in request.password):
            raise HTTPException(
                status_code=400, detail="Password must include at least one number"
            )

        # Validate full_name (required)
        if not request.full_name or not request.full_name.strip():
            raise HTTPException(status_code=400, detail="Full name is required")

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
            email=email,
        )
        if not success:
            raise HTTPException(status_code=500, detail="Failed to create verification code")

        # Send SMS
        sms_sent = await auth_service.send_sms_verification(session, phone_number, code)
        if not sms_sent:
            raise HTTPException(
                status_code=500, detail="Failed to send SMS. Please check Twilio configuration."
            )

        return {
            "status": "success",
            "message": "Verification code sent. Please verify your phone number to complete signup.",
            "phone_number": phone_number,
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
                status_code=401, detail="Please contact support for help - NO_PASSWORD"
            )

        # Verify password
        if not auth_service.verify_password(request.password, user["password_hash"]):
            raise INVALID_CREDENTIALS_RESPONSE

        # Create access token
        token_data = {"user_id": user["id"], "phone_number": user["phone_number"]}
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
            is_verified=user["is_verified"],
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
async def send_verification(
    request: Request, payload: CheckPhoneRequest, session: AsyncSession = Depends(get_db_session)
):
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
            session=session, phone_number=phone_number, code=code
        )
        if not success:
            raise HTTPException(status_code=500, detail="Failed to create verification code")

        # Send SMS
        sms_sent = await auth_service.send_sms_verification(session, phone_number, code)
        if not sms_sent:
            raise HTTPException(
                status_code=500, detail="Failed to send SMS. Please check Twilio configuration."
            )

        return {"status": "success", "message": "Verification code sent successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error sending verification: {str(e)}")


@router.post("/api/auth/verify-phone", response_model=AuthResponse)
@limiter.limit("10/minute")
async def verify_phone(
    request: Request, payload: VerifyPhoneRequest, session: AsyncSession = Depends(get_db_session)
):
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
        signup_data = await user_service.verify_and_mark_code_used(
            session, phone_number, payload.code
        )
        if not signup_data:
            # Check if user exists (for SMS login case)
            user = await user_service.get_user_by_phone(session, phone_number)
            if user:
                # Account is locked check for existing users
                if user_service.is_account_locked(user):
                    raise HTTPException(
                        status_code=423,
                        detail="Account is temporarily locked due to too many failed attempts. Please try again later.",
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
                    email=signup_data.get("email"),
                )

                # Create player profile with full_name from signup
                full_name = signup_data.get("name")  # full_name stored here
                if full_name:
                    player = await data_service.upsert_user_player(
                        session=session, user_id=user_id, full_name=full_name
                    )
                    if not player:
                        logger.error(f"Failed to create player profile for user {user_id}")

                # Get the newly created user
                user = await user_service.get_user_by_id(session, user_id)
            except ValueError as e:
                # User already exists (race condition or duplicate signup)
                raise HTTPException(status_code=400, detail=str(e))
        else:
            # SMS login - get existing user
            user = await user_service.get_user_by_phone(session, phone_number)
            if not user:
                raise INVALID_CREDENTIALS_RESPONSE
            # Check if account is locked
            if user_service.is_account_locked(user):
                raise HTTPException(
                    status_code=423,
                    detail="Account is temporarily locked due to too many failed attempts. Please try again later.",
                )

        # Reset failed attempts on success
        await user_service.reset_failed_attempts(session, user["id"])

        # Create access token
        token_data = {"user_id": user["id"], "phone_number": user["phone_number"]}
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
            profile_complete=profile_complete,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error verifying phone: {str(e)}")


@router.post("/api/auth/reset-password", response_model=Dict[str, Any])
async def reset_password(
    request: Request,
    payload: ResetPasswordRequest,
    session: AsyncSession = Depends(get_db_session),
):
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
                "message": "If an account exists with this phone number, a verification code has been sent.",
            }

        # Generate verification code
        code = auth_service.generate_verification_code()

        # Save code to database (without signup data, just for password reset)
        success = await user_service.create_verification_code(
            session=session, phone_number=phone_number, code=code
        )
        if not success:
            raise HTTPException(status_code=500, detail="Failed to create verification code")

        # Send SMS
        sms_sent = await auth_service.send_sms_verification(session, phone_number, code)
        if not sms_sent:
            raise HTTPException(
                status_code=500, detail="Failed to send SMS. Please check Twilio configuration."
            )

        return {
            "status": "success",
            "message": "If an account exists with this phone number, a verification code has been sent.",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error initiating password reset: {str(e)}")


@router.post("/api/auth/reset-password-verify", response_model=Dict[str, Any])
async def reset_password_verify(
    request: Request,
    payload: ResetPasswordVerifyRequest,
    session: AsyncSession = Depends(get_db_session),
):
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
                detail="Account is temporarily locked due to too many failed attempts. Please try again later.",
            )

        # Verify the code (for password reset, code won't have signup data, but function still returns dict if valid)
        code_result = await user_service.verify_and_mark_code_used(
            session, phone_number, payload.code
        )
        if not code_result:
            # Increment failed attempts
            await user_service.increment_failed_attempts(session, phone_number)
            raise INVALID_VERIFICATION_CODE_RESPONSE

        # Reset failed attempts on success
        await user_service.reset_failed_attempts(session, user["id"])

        # Generate reset token
        reset_token = (
            auth_service.generate_refresh_token()
        )  # Reuse the same secure token generator
        expires_at = utcnow() + timedelta(hours=1)  # Token expires in 1 hour

        # Store reset token
        success = await user_service.create_password_reset_token(
            session, user["id"], reset_token, expires_at
        )
        if not success:
            raise HTTPException(status_code=500, detail="Failed to create reset token")

        return {
            "status": "success",
            "reset_token": reset_token,
            "message": "Verification code verified. You can now set your new password.",
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
    session: AsyncSession = Depends(get_db_session),
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
                status_code=400, detail="Password must be at least 8 characters long"
            )
        if not any(char.isdigit() for char in payload.new_password):
            raise HTTPException(
                status_code=400, detail="Password must include at least one number"
            )

        # Verify and use the reset token
        user_id = await user_service.verify_and_use_password_reset_token(
            session, payload.reset_token
        )
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid or expired reset token")

        # Get user to get phone number for token
        user = await user_service.get_user_by_id(session, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Hash new password
        new_password_hash = auth_service.hash_password(payload.new_password)

        # Update password
        success = await user_service.update_user_password(session, user_id, new_password_hash)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to update password")

        # Create access token (automatically log them in)
        token_data = {"user_id": user["id"], "phone_number": user["phone_number"]}
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
            is_verified=user["is_verified"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error resetting password: {str(e)}")


@router.post("/api/auth/sms-login", response_model=AuthResponse)
@limiter.limit("10/minute")
async def sms_login(
    request: Request, payload: SMSLoginRequest, session: AsyncSession = Depends(get_db_session)
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
                detail="Account is temporarily locked due to too many failed attempts. Please try again later.",
            )

        # Atomically verify code and mark as used
        if not await user_service.verify_and_mark_code_used(session, phone_number, payload.code):
            # Increment failed attempts
            await user_service.increment_failed_attempts(session, phone_number)
            raise INVALID_VERIFICATION_CODE_RESPONSE

        # Reset failed attempts on success
        await user_service.reset_failed_attempts(session, user["id"])

        # Create access token
        token_data = {"user_id": user["id"], "phone_number": user["phone_number"]}
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
            is_verified=user["is_verified"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during SMS login: {str(e)}")


@router.get("/api/auth/check-phone", response_model=CheckPhoneResponse)
async def check_phone(phone_number: str, session: AsyncSession = Depends(get_db_session)):
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
            exists=user is not None, is_verified=user.get("is_verified", False)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking phone: {str(e)}")


@router.post("/api/auth/refresh", response_model=RefreshTokenResponse)
async def refresh_token(
    request: RefreshTokenRequest, session: AsyncSession = Depends(get_db_session)
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
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        # Check if token is expired
        expires_at = datetime.fromisoformat(refresh_token_record["expires_at"])
        if utcnow() > expires_at:
            # Delete expired token
            await user_service.delete_refresh_token(session, request.refresh_token)
            raise HTTPException(status_code=401, detail="Refresh token has expired")

        # Get user
        user = await user_service.get_user_by_id(session, refresh_token_record["user_id"])
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        # Create new access token
        token_data = {"user_id": user["id"], "phone_number": user["phone_number"]}
        access_token = auth_service.create_access_token(data=token_data)

        return RefreshTokenResponse(access_token=access_token, token_type="bearer")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error refreshing token: {str(e)}")


@router.post("/api/auth/logout")
async def logout(
    current_user: dict = Depends(get_current_user), session: AsyncSession = Depends(get_db_session)
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
        created_at=current_user["created_at"],
    )


@router.put("/api/users/me", response_model=UserResponse)
async def update_current_user(
    payload: UserUpdate,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
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
            session=session, user_id=current_user["id"], email=payload.email
        )

        if not success:
            raise HTTPException(status_code=400, detail="No fields provided to update")

        # Fetch updated user to return
        updated_user = await user_service.get_user_by_id(session, current_user["id"])
        if not updated_user:
            raise HTTPException(status_code=404, detail="User not found")

        return UserResponse(
            id=updated_user["id"],
            phone_number=updated_user["phone_number"],
            email=updated_user["email"],
            is_verified=updated_user["is_verified"],
            created_at=updated_user["created_at"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating user profile: {str(e)}")


@router.get("/api/users/me/player")
async def get_current_user_player(
    current_user: dict = Depends(get_current_user), session: AsyncSession = Depends(get_db_session)
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
    session: AsyncSession = Depends(get_db_session),
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
            distance_to_location=payload.distance_to_location,
        )

        if not player:
            raise HTTPException(
                status_code=400,
                detail="Failed to create/update player profile. full_name is required.",
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


@router.post("/api/users/me/avatar")
@limiter.limit("10/minute")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Upload or replace the current user's avatar image.

    Accepts JPEG, PNG, WebP, or HEIC images up to 5MB.
    The image is processed (converted to RGB, center-cropped to square,
    resized to 512x512, compressed as JPEG) and uploaded to S3.

    Returns:
        { "profile_picture_url": "<s3_url>" }
    """
    try:
        # Get the player for this user
        player = await data_service.get_player_by_user_id_with_stats(session, current_user["id"])
        if not player:
            raise HTTPException(status_code=404, detail="Player profile not found")

        # Read and validate the file
        file_bytes = await file.read()
        is_valid, error_msg = avatar_service.validate_avatar(file_bytes, file.content_type)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)

        # Process the image (crop, resize, compress) — CPU-bound, run off event loop
        loop = asyncio.get_event_loop()
        processed_bytes = await loop.run_in_executor(
            None, avatar_service.process_avatar, file_bytes
        )

        # Save old URL for cleanup after successful DB update
        old_url = player.get("profile_picture_url")

        # Upload new avatar to S3 first — blocking I/O, run off event loop
        new_url = await loop.run_in_executor(
            None, s3_service.upload_avatar, player["id"], processed_bytes
        )

        # Update player record in DB
        result = await session.execute(
            select(Player).where(Player.id == player["id"])
        )
        player_obj = result.scalar_one_or_none()
        if player_obj:
            player_obj.profile_picture_url = new_url
            player_obj.avatar = new_url
            await session.commit()

        # Delete old avatar from S3 only after DB commit succeeds (best-effort)
        if old_url:
            await loop.run_in_executor(None, s3_service.delete_avatar, old_url)

        return {"profile_picture_url": new_url}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading avatar: {e}")
        raise HTTPException(status_code=500, detail="Error uploading avatar")


@router.delete("/api/users/me/avatar")
async def delete_avatar(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Remove the current user's avatar, reverting to initials.

    Deletes the image from S3 and clears profile_picture_url and avatar columns.

    Returns:
        { "message": "Avatar removed" }
    """
    try:
        player = await data_service.get_player_by_user_id_with_stats(session, current_user["id"])
        if not player:
            raise HTTPException(status_code=404, detail="Player profile not found")

        # Delete from S3 if exists — blocking I/O, run off event loop
        loop = asyncio.get_event_loop()
        old_url = player.get("profile_picture_url")
        if old_url:
            await loop.run_in_executor(None, s3_service.delete_avatar, old_url)

        # Clear avatar columns — revert to initials
        result = await session.execute(
            select(Player).where(Player.id == player["id"])
        )
        player_obj = result.scalar_one_or_none()
        if player_obj:
            initials = data_service.generate_player_initials(player_obj.full_name or "")
            player_obj.profile_picture_url = None
            player_obj.avatar = initials or None
            await session.commit()

        return {"message": "Avatar removed"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting avatar: {e}")
        raise HTTPException(status_code=500, detail="Error deleting avatar")


@router.get("/api/users/me/leagues")
async def get_user_leagues(
    user: dict = Depends(get_current_user), session: AsyncSession = Depends(get_db_session)
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
    current_user: Optional[dict] = Depends(get_current_user_optional),
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
            is_resolved=False,
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
                session=session,
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
            "user_name": user_name if current_user else None,
        }

        return response_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting feedback: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error submitting feedback: {str(e)}")


@router.get("/api/admin-view/feedback", response_model=List[FeedbackResponse])
async def get_all_feedback(
    user: dict = Depends(require_admin_phone), session: AsyncSession = Depends(get_db_session)
):
    """
    Get all feedback submissions.
    Only accessible to user with phone number +17167831211.

    Returns:
        List[FeedbackResponse]: List of all feedback records, ordered by created_at descending
    """
    try:
        # Get all feedback, ordered by most recent first
        result = await session.execute(select(Feedback).order_by(Feedback.created_at.desc()))
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

            response_data.append(
                {
                    "id": feedback.id,
                    "user_id": feedback.user_id,
                    "feedback_text": feedback.feedback_text,
                    "email": feedback.email,
                    "is_resolved": feedback.is_resolved,
                    "created_at": feedback.created_at.isoformat(),
                    "user_name": user_name,
                }
            )

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
    session: AsyncSession = Depends(get_db_session),
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
        result = await session.execute(select(Feedback).where(Feedback.id == feedback_id))
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
            "user_name": user_name,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating feedback resolution: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating feedback resolution: {str(e)}"
        )


# Admin view endpoints


@router.get("/api/admin-view/config")
async def get_admin_config(
    user: dict = Depends(require_admin_phone), session: AsyncSession = Depends(get_db_session)
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
            "log_level": log_level_name,
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
    session: AsyncSession = Depends(get_db_session),
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
            await data_service.set_setting(
                session, "enable_sms", "true" if enable_sms else "false"
            )
            # Invalidate cache
            await settings_service.invalidate_settings_cache()

        # Update enable_email if provided
        if "enable_email" in body:
            enable_email = bool(body["enable_email"])
            await data_service.set_setting(
                session, "enable_email", "true" if enable_email else "false"
            )
            # Invalidate cache
            await settings_service.invalidate_settings_cache()

        # Update log_level if provided (applies immediately at runtime)
        if "log_level" in body:
            log_level = str(body["log_level"]).upper()
            valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR"]
            if log_level not in valid_levels:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid log_level. Must be one of: {', '.join(valid_levels)}",
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
                    detail=f"Failed to apply log level change at runtime: {str(e)}",
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
            "log_level": log_level_name,
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid input: {str(e)}")
    except Exception as e:
        logger.error(f"Error updating admin config: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating admin config: {str(e)}")


# ============================================================================
# Friend endpoints
# ============================================================================


@router.post("/api/friends/request", response_model=FriendRequestResponse)
async def send_friend_request(
    payload: FriendRequestCreate,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Send a friend request to another player."""
    try:
        result = await friend_service.send_friend_request(
            session, user["player_id"], payload.receiver_player_id
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error sending friend request: {e}")
        raise HTTPException(status_code=500, detail="Error sending friend request")


@router.post("/api/friends/requests/{request_id}/accept", response_model=FriendRequestResponse)
async def accept_friend_request(
    request_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Accept a pending friend request."""
    try:
        result = await friend_service.accept_friend_request(session, request_id, user["player_id"])
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error accepting friend request: {e}")
        raise HTTPException(status_code=500, detail="Error accepting friend request")


@router.post("/api/friends/requests/{request_id}/decline", status_code=204)
async def decline_friend_request(
    request_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Decline a pending friend request (deletes the row so sender can re-request)."""
    try:
        await friend_service.decline_friend_request(session, request_id, user["player_id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error declining friend request: {e}")
        raise HTTPException(status_code=500, detail="Error declining friend request")


@router.delete("/api/friends/requests/{request_id}")
async def cancel_friend_request(
    request_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Cancel an outgoing friend request."""
    try:
        await friend_service.cancel_friend_request(session, request_id, user["player_id"])
        return {"status": "ok", "message": "Friend request cancelled"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error cancelling friend request: {e}")
        raise HTTPException(status_code=500, detail="Error cancelling friend request")


@router.delete("/api/friends/{player_id}")
async def remove_friend(
    player_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Remove a friend (unfriend)."""
    try:
        await friend_service.remove_friend(session, user["player_id"], player_id)
        return {"status": "ok", "message": "Friend removed"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error removing friend: {e}")
        raise HTTPException(status_code=500, detail="Error removing friend")


@router.get("/api/friends", response_model=FriendListResponse)
async def get_friends(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Get current user's friends list (paginated)."""
    try:
        offset = (page - 1) * page_size
        result = await friend_service.get_friends(session, user["player_id"], limit=page_size, offset=offset)
        return result
    except Exception as e:
        logger.error(f"Error fetching friends: {e}")
        raise HTTPException(status_code=500, detail="Error fetching friends")


@router.get("/api/friends/requests")
async def get_friend_requests(
    direction: str = Query("both", regex="^(incoming|outgoing|both)$"),
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Get pending friend requests."""
    try:
        requests = await friend_service.get_friend_requests(session, user["player_id"], direction=direction)
        return requests
    except Exception as e:
        logger.error(f"Error fetching friend requests: {e}")
        raise HTTPException(status_code=500, detail="Error fetching friend requests")


@router.get("/api/friends/suggestions")
async def get_friend_suggestions(
    limit: int = Query(10, ge=1, le=50),
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Get friend suggestions based on shared leagues."""
    try:
        suggestions = await friend_service.get_friend_suggestions(session, user["player_id"], limit=limit)
        return suggestions
    except Exception as e:
        logger.error(f"Error fetching friend suggestions: {e}")
        raise HTTPException(status_code=500, detail="Error fetching friend suggestions")


@router.post("/api/friends/batch-status", response_model=FriendBatchStatusResponse)
async def batch_friend_status(
    payload: FriendBatchStatusRequest,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Get friend status for multiple player IDs (for search results)."""
    try:
        result = await friend_service.batch_friend_status(
            session, user["player_id"], payload.player_ids
        )
        return result
    except Exception as e:
        logger.error(f"Error fetching batch friend status: {e}")
        raise HTTPException(status_code=500, detail="Error fetching friend statuses")


@router.get("/api/friends/mutual/{other_player_id}")
async def get_mutual_friends(
    other_player_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Get mutual friends between the current user and another player."""
    try:
        mutual = await friend_service.get_mutual_friends(session, user["player_id"], other_player_id)
        return mutual
    except Exception as e:
        logger.error(f"Error fetching mutual friends: {e}")
        raise HTTPException(status_code=500, detail="Error fetching mutual friends")


# Notification endpoints
@router.get("/api/notifications", response_model=NotificationListResponse)
async def get_notifications(
    limit: int = 50,
    offset: int = 0,
    unread_only: bool = False,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Get user notifications with pagination."""
    try:
        user_id = user.get("id")
        result = await notification_service.get_user_notifications(
            session, user_id, limit=limit, offset=offset, unread_only=unread_only
        )
        return result
    except Exception as e:
        logger.error(f"Error fetching notifications: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching notifications: {str(e)}")


@router.get("/api/notifications/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    user: dict = Depends(require_user), session: AsyncSession = Depends(get_db_session)
):
    """Get unread notification count for user."""
    try:
        user_id = user.get("id")
        count = await notification_service.get_unread_count(session, user_id)
        return {"count": count}
    except Exception as e:
        logger.error(f"Error fetching unread count: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching unread count: {str(e)}")


@router.put("/api/notifications/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_as_read(
    notification_id: int,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Mark a single notification as read."""
    try:
        user_id = user.get("id")
        notification = await notification_service.mark_as_read(session, notification_id, user_id)
        return notification
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error marking notification as read: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error marking notification as read: {str(e)}"
        )


@router.put("/api/notifications/mark-all-read")
async def mark_all_notifications_as_read(
    user: dict = Depends(require_user), session: AsyncSession = Depends(get_db_session)
):
    """Mark all user notifications as read."""
    try:
        user_id = user.get("id")
        count = await notification_service.mark_all_as_read(session, user_id)
        return {"success": True, "count": count}
    except Exception as e:
        logger.error(f"Error marking all notifications as read: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error marking all notifications as read: {str(e)}"
        )


@router.websocket("/api/ws/notifications")
async def websocket_notifications(websocket: WebSocket):
    """
    WebSocket endpoint for real-time notification delivery.

    Requires JWT token in query parameter: ?token=<jwt_token>
    """
    await websocket.accept()

    # Get token from query parameters
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008, reason="Missing authentication token")
        return

    # Verify token
    payload = auth_service.verify_token(token)
    if payload is None:
        await websocket.close(code=1008, reason="Invalid authentication token")
        return

    # Get user_id from token
    user_id = payload.get("user_id")
    if user_id is None:
        await websocket.close(code=1008, reason="Invalid token payload")
        return

    # Register connection
    manager = get_websocket_manager()
    await manager.connect(user_id, websocket)

    try:
        # Keep connection alive and handle ping/pong with timeout
        import asyncio

        timeout_seconds = 30  # 30 seconds timeout
        last_activity = datetime.utcnow()

        while True:
            try:
                # Wait for client message with timeout
                data = await asyncio.wait_for(websocket.receive_text(), timeout=timeout_seconds)

                # Update activity timestamp
                last_activity = datetime.utcnow()
                await manager.update_activity(websocket)

                # Handle ping messages (client sends "ping", server responds "pong")
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                # Check if connection has been inactive too long
                if datetime.utcnow() - last_activity > timedelta(seconds=timeout_seconds):
                    logger.info(f"WebSocket timeout for user {user_id}, closing connection")
                    await websocket.close(code=1000, reason="Connection timeout")
                    break
                # Send ping to check if connection is still alive
                try:
                    await websocket.send_text("ping")
                except Exception:
                    # Connection is dead, break loop
                    break
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for user {user_id}")
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
    finally:
        # Clean up connection
        await manager.disconnect(user_id, websocket)
