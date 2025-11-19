"""
API route handlers for the Beach Volleyball ELO system.
"""

from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import Response
from slowapi import Limiter  # type: ignore
from slowapi.util import get_remote_address  # type: ignore
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.database.db import get_db_session
from backend.database.models import Season, Player
from backend.services import data_service, sheets_service, calculation_service, auth_service, user_service
from backend.api.auth_dependencies import (
    get_current_user,
    get_current_user_optional,
    require_user,
    require_system_admin,
    make_require_league_admin,
    make_require_league_member,
)
from backend.models.schemas import (
    SignupRequest, LoginRequest, SMSLoginRequest, VerifyPhoneRequest,
    CheckPhoneRequest, AuthResponse, CheckPhoneResponse, UserResponse,
    RefreshTokenRequest, RefreshTokenResponse, ResetPasswordRequest,
    ResetPasswordVerifyRequest, ResetPasswordConfirmRequest,
    LeagueCreate, LeagueResponse, PlayerUpdate
)
import httpx
import os
import logging
import traceback
from typing import Optional, Dict, Any
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

router = APIRouter()

# Rate limiter instance shared with FastAPI app
limiter = Limiter(key_func=get_remote_address)

# WhatsApp service URL
WHATSAPP_SERVICE_URL = os.getenv("WHATSAPP_SERVICE_URL", "http://localhost:3001")

# Default timeout for WhatsApp service requests (in seconds)
WHATSAPP_REQUEST_TIMEOUT = 30.0

INVALID_CREDENTIALS_RESPONSE = HTTPException(status_code=401, detail="Username or password is incorrect")
INVALID_VERIFICATION_CODE_RESPONSE = HTTPException(status_code=401, detail="Invalid or expired verification code")


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


@router.get("/api/leagues/{league_id}", response_model=LeagueResponse)
async def get_league(league_id: int, session: AsyncSession = Depends(get_db_session)):
    """
    Get a league by id (public).
    """
    try:
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
    Body: { name?: str, start_date: ISO, end_date: ISO, point_system?: str, is_active?: bool }
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
            is_active=body.get("is_active", True),
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


@router.put("/api/seasons/{season_id}")
async def update_season(
    season_id: int,
    request: Request,
    user: dict = Depends(get_current_user),  # League admin check inside service based on season->league
    session: AsyncSession = Depends(get_db_session)
):
    """
    Update a season (league_admin or system_admin).
    Body may include: name, start_date, end_date, point_system, is_active
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


@router.patch("/api/seasons/{season_id}")
async def update_season(
    season_id: int,
    request: Request,
    user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Update a season (e.g., activate by setting is_active to true).
    
    Body: { "is_active": true } to activate a season
    
    Requires league_admin or system_admin permissions.
    """
    try:
        body = await request.json()
        is_active = body.get("is_active")
        
        if is_active is None:
            raise HTTPException(status_code=400, detail="is_active field is required")
        
        # Get season to check league_id for permission check
        result = await session.execute(
            select(Season).where(Season.id == season_id)
        )
        season = result.scalar_one_or_none()
        if not season:
            raise HTTPException(status_code=404, detail="Season not found")
        
        # Check permissions (league_admin or system_admin)
        try:
            # Try system admin first
            await require_system_admin(user, session)
        except HTTPException:
            # If not system admin, check league admin
            league_admin_check = make_require_league_admin()
            await league_admin_check(season.league_id, user, session)
        
        success = await data_service.activate_season(session, season.league_id, season_id) if is_active else False
        
        if not success:
            raise HTTPException(status_code=404, detail="League or season not found")
        return {"success": True}
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


@router.put("/api/locations/{location_id}")
async def update_location(
    location_id: int,
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
    location_id: int,
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
    location_id: Optional[int] = None,
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
async def calculate_stats(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Recalculate all statistics from existing database matches (finalized sessions only).
    
    Returns:
        dict: Status and summary of calculations
    """
    try:
        result = await data_service.recalculate_all_stats(session)
        
        return {
            "status": "success",
            "message": "Statistics recalculated successfully",
            "player_count": result["player_count"],
            "match_count": result["match_count"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating stats: {str(e)}")


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
        if not rankings:
            raise HTTPException(
                status_code=404,
                detail="Rankings not found. Please run /api/calculate first."
            )
        return rankings
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
                "name": player.nickname or player.full_name,  # For backward compatibility
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


@router.get("/api/players/{player_name}")
async def get_player_stats(
    player_name: str,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Get detailed statistics for a specific player.
    
    Args:
        player_name: Name of the player
        
    Returns:
        list: Array of player stats including partnerships and opponents
    """
    try:
        player_stats = await data_service.get_player_stats(session, player_name)
        
        if player_stats is None:
            raise HTTPException(
                status_code=404,
                detail=f"Player '{player_name}' not found. Please check the name and try again."
            )
        
        return player_stats
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading player stats: {str(e)}")


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


@router.get("/api/players/{player_name}/matches")
async def get_player_match_history(
    player_name: str,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Get match history for a specific player.
    
    Args:
        player_name: Name of the player
        
    Returns:
        list: Array of player's matches (most recent first, may be empty)
    """
    try:
        match_history = await data_service.get_player_match_history(session, player_name)
        
        if match_history is None:
            raise HTTPException(
                status_code=404,
                detail=f"Player '{player_name}' not found. Please check the name and try again."
            )
        
        # Return empty array if player exists but has no matches
        return match_history
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading match history: {str(e)}")


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

@router.get("/api/sessions")
async def get_sessions(
    active: Optional[bool] = None,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Get sessions.
    
    Query params:
        active: If true, returns only the active session. If false or omitted, returns all sessions.
    
    Returns:
        list or dict: Array of sessions (most recent first) or active session dict if active=true
    """
    try:
        if active is True:
            # Return active session (single object or null)
            active_session = await data_service.get_active_session(session)
            return active_session
        else:
            # Return all sessions
            sessions = await data_service.get_sessions(session)
            return sessions
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading sessions: {str(e)}")


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
    End/lock in a league session by setting is_pending to false (league_admin).
    
    Body: { "is_pending": false } to lock in a session
    
    When a session is locked in:
    1. Session is marked as complete (is_pending = false)
    2. All derived stats recalculated from database (locked-in sessions only)
    3. Newly locked matches now included in rankings, partnerships, opponents, ELO history
    """
    try:
        body = await request.json()
        is_pending = body.get("is_pending")
        
        if is_pending is None:
            raise HTTPException(status_code=400, detail="is_pending field is required")
        
        # If locking in the session (is_pending = false)
        if is_pending is False:
            # Get player_id from user
            player_id = None
            if user:
                player = await data_service.get_player_by_user_id(session, user["id"])
                if player:
                    player_id = player["id"]
            
            success = await data_service.lock_in_session(session, session_id, updated_by=player_id)
            
            if not success:
                raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
            
            # Auto-recalculate all stats from locked-in sessions
            result = await data_service.recalculate_all_stats(session)
            
            return {
                "status": "success",
                "message": f"Session submitted and stats recalculated",
                "player_count": result["player_count"],
                "match_count": result["match_count"]
            }
        else:
            raise HTTPException(status_code=400, detail="Only setting is_pending to false is currently supported")
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
    Update a session (e.g., lock in by setting is_pending to false).
    
    Body: { "is_pending": false } to lock in a session
    
    When a session is locked in:
    1. Session is marked as complete (is_pending = false)
    2. All derived stats recalculated from database (locked-in sessions only)
    3. Newly locked matches now included in rankings, partnerships, opponents, ELO history
    
    Args:
        session_id: ID of session to update
    
    Returns:
        dict: Status message with calculation summary
    """
    try:
        body = await request.json()
        is_pending = body.get("is_pending")
        
        if is_pending is None:
            raise HTTPException(status_code=400, detail="is_pending field is required")
        
        # If locking in the session (is_pending = false)
        if is_pending is False:
            # Get player_id from user
            player_id = None
            if current_user:
                player = await data_service.get_player_by_user_id(session, current_user["id"])
                if player:
                    player_id = player["id"]
            
            success = await data_service.lock_in_session(session, session_id, updated_by=player_id)
            
            if not success:
                raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
            
            # Auto-recalculate all stats from locked-in sessions
            result = await data_service.recalculate_all_stats(session)
            
            return {
                "status": "success",
                "message": f"Session submitted and stats recalculated",
                "player_count": result["player_count"],
                "match_count": result["match_count"]
            }
        else:
            raise HTTPException(status_code=400, detail="Only setting is_pending to false is currently supported")
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
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Create a new match in a session.
    
    Request body:
        {
            "session_id": 1,
            "team1_player1": "Alice",
            "team1_player2": "Bob",
            "team2_player1": "Charlie",
            "team2_player2": "Dave",
            "team1_score": 21,
            "team2_score": 19
        }
    
    Returns:
        dict: Created match info
    """
    try:
        body = await request.json()
        
        # Validate required fields
        required_fields = [
            'session_id', 'team1_player1', 'team1_player2',
            'team2_player1', 'team2_player2', 'team1_score', 'team2_score'
        ]
        for field in required_fields:
            if field not in body:
                raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
        
        # Validate all players are distinct
        players = [
            body['team1_player1'], body['team1_player2'],
            body['team2_player1'], body['team2_player2']
        ]
        if len(players) != len(set(players)):
            raise HTTPException(status_code=400, detail="All four players must be distinct")
        
        # Get session to verify it exists and is pending
        session_obj = await data_service.get_session(session, body['session_id'])
        if not session_obj:
            raise HTTPException(status_code=404, detail=f"Session {body['session_id']} not found")
        
        if not session_obj.get('is_pending', True):  # Check if session is pending
            raise HTTPException(status_code=400, detail="Cannot add matches to a submitted session")
        
        # Create the match using the session's date
        match_id = await data_service.create_match_async(
            session=session,
            session_id=body['session_id'],
            date=session_obj['date'],
            team1_player1=body['team1_player1'],
            team1_player2=body['team1_player2'],
            team2_player1=body['team2_player1'],
            team2_player2=body['team2_player2'],
            team1_score=body['team1_score'],
            team2_score=body['team2_score'],
            is_public=body.get('is_public', True)
        )
        
        return {
            "status": "success",
            "message": "Match created successfully",
            "match_id": match_id,
            "session_id": body['session_id']
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating match: {str(e)}")


@router.put("/api/matches/{match_id}")
async def update_match(
    match_id: int,
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Update an existing match.
    
    Args:
        match_id: ID of match to update
    
    Request body:
        {
            "team1_player1": "Alice",
            "team1_player2": "Bob",
            "team2_player1": "Charlie",
            "team2_player2": "Dave",
            "team1_score": 21,
            "team2_score": 19
        }
    
    Returns:
        dict: Update status
    """
    try:
        body = await request.json()
        
        # Validate required fields
        required_fields = [
            'team1_player1', 'team1_player2',
            'team2_player1', 'team2_player2', 'team1_score', 'team2_score'
        ]
        for field in required_fields:
            if field not in body:
                raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
        
        # Validate all players are distinct
        players = [
            body['team1_player1'], body['team1_player2'],
            body['team2_player1'], body['team2_player2']
        ]
        if len(players) != len(set(players)):
            raise HTTPException(status_code=400, detail="All four players must be distinct")
        
        # Get match to verify it exists and belongs to active session
        match = await data_service.get_match_async(session, match_id)
        if not match:
            raise HTTPException(status_code=404, detail=f"Match {match_id} not found")
        
        if match.get('session_active') is False:
            raise HTTPException(status_code=400, detail="Cannot edit matches in a submitted session")
        
        # Update the match
        success = await data_service.update_match_async(
            session=session,
            match_id=match_id,
            team1_player1=body['team1_player1'],
            team1_player2=body['team1_player2'],
            team2_player1=body['team2_player1'],
            team2_player2=body['team2_player2'],
            team1_score=body['team1_score'],
            team2_score=body['team2_score'],
            is_public=body.get('is_public')
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
        
        if match.get('session_active') is False:
            raise HTTPException(status_code=400, detail="Cannot delete matches in a submitted session")
        
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
            "name": "John",  // Optional - user display name
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
            name=request.full_name.strip(),  # Store full_name in name field
            email=email
        )
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to create verification code"
            )
        
        # Send SMS
        # DISABLED FOR NOW
        # sms_sent = auth_service.send_sms_verification(phone_number, code)
        # if not sms_sent:
        #     raise HTTPException(
        #         status_code=500,
        #         detail="Failed to send SMS. Please check Twilio configuration."
        #     )
        
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
        expires_at = datetime.utcnow() + timedelta(days=auth_service.REFRESH_TOKEN_EXPIRATION_DAYS)
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
@limiter.limit("3/hour")
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
        # DISABLED FOR NOW
        # sms_sent = auth_service.send_sms_verification(phone_number, code)
        # if not sms_sent:
        #     raise HTTPException(
        #         status_code=500,
        #         detail="Failed to send SMS. Please check Twilio configuration."
        #     )
        
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
                    name=None,  # User display name is optional
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
        expires_at = datetime.utcnow() + timedelta(days=auth_service.REFRESH_TOKEN_EXPIRATION_DAYS)
        await user_service.create_refresh_token(session, user["id"], refresh_token, expires_at)
        
        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user_id=user["id"],
            phone_number=user["phone_number"],
            is_verified=user["is_verified"]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error verifying phone: {str(e)}")


@router.post("/api/auth/reset-password", response_model=Dict[str, Any])
@limiter.limit("3/hour")
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
        # DISABLED FOR NOW
        # sms_sent = auth_service.send_sms_verification(phone_number, code)
        # if not sms_sent:
        #     raise HTTPException(
        #         status_code=500,
        #         detail="Failed to send SMS. Please check Twilio configuration."
        #     )
        
        return {
            "status": "success",
            "message": "If an account exists with this phone number, a verification code has been sent."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error initiating password reset: {str(e)}")


@router.post("/api/auth/reset-password-verify", response_model=Dict[str, Any])
@limiter.limit("10/minute")
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
        expires_at = datetime.utcnow() + timedelta(hours=1)  # Token expires in 1 hour
        
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
        expires_at = datetime.utcnow() + timedelta(days=auth_service.REFRESH_TOKEN_EXPIRATION_DAYS)
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
        expires_at = datetime.utcnow() + timedelta(days=auth_service.REFRESH_TOKEN_EXPIRATION_DAYS)
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
        if datetime.utcnow() > expires_at:
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
        name=current_user["name"],
        email=current_user["email"],
        is_verified=current_user["is_verified"],
        created_at=current_user["created_at"]
    )


@router.get("/api/users/me/player")
async def get_current_user_player(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Get the current user's player profile.
    Requires authentication.
    
    Returns:
        Player profile with gender, level, etc., or null if user has no player profile
    """
    try:
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        if not player:
            return None
        # Return only the fields we need for the frontend
        # Handle both 'name' and 'full_name' column names for compatibility
        player_name = player.get("full_name") or player.get("name") or ""
        return {
            "id": player["id"],
            "full_name": player_name,
            "gender": player.get("gender"),
            "level": player.get("level"),
            "nickname": player.get("nickname"),
            "age": player.get("age"),
            "height": player.get("height"),
            "preferred_side": player.get("preferred_side"),
            "default_location_id": player.get("default_location_id"),
        }
    except Exception as e:
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
    
    Request body:
        {
            "full_name": "John Doe",  // Required for creating new player
            "nickname": "Johnny",     // Optional
            "gender": "male",         // Optional
            "level": "beginner",      // Optional
            "default_location_id": 1  // Optional
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
        player = await data_service.upsert_user_player(
            session=session,
            user_id=current_user["id"],
            full_name=payload.full_name,
            nickname=payload.nickname,
            gender=payload.gender,
            level=payload.level,
            default_location_id=payload.default_location_id
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
            "age": player.get("age"),
            "height": player.get("height"),
            "preferred_side": player.get("preferred_side"),
            "default_location_id": player.get("default_location_id"),
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

