"""
API route handlers for the Beach Volleyball ELO system.
"""

from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import Response
from slowapi import Limiter  # type: ignore
from slowapi.util import get_remote_address  # type: ignore
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
async def create_league(payload: LeagueCreate, user: dict = Depends(require_user)):
    """
    Create a new league. Any authenticated user can create.
    """
    try:
        league = data_service.create_league(
            name=payload.name,
            description=payload.description,
            location_id=payload.location_id,
            is_open=payload.is_open,
            whatsapp_group_id=payload.whatsapp_group_id,
            creator_user_id=user["id"]
        )
        return league
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating league: {str(e)}")


@router.get("/api/leagues")
async def list_leagues():
    """
    List leagues (public).
    """
    try:
        return data_service.list_leagues()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing leagues: {str(e)}")


@router.get("/api/leagues/{league_id}", response_model=LeagueResponse)
async def get_league(league_id: int):
    """
    Get a league by id (public).
    """
    try:
        league = data_service.get_league(league_id)
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
    user: dict = Depends(make_require_league_admin())
):
    """
    Update league profile fields (league_admin or system_admin).
    """
    try:
        league = data_service.update_league(
            league_id=league_id,
            name=payload.name,
            description=payload.description,
            location_id=payload.location_id,
            is_open=payload.is_open,
            whatsapp_group_id=payload.whatsapp_group_id
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
    user: dict = Depends(require_system_admin)
):
    """
    Archive/delete a league (system_admin).
    """
    try:
        success = data_service.delete_league(league_id)
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
    user: dict = Depends(make_require_league_admin())
):
    """
    Create a season in a league (league_admin or system_admin).
    Body: { name?: str, start_date: ISO, end_date: ISO, point_system?: str, is_active?: bool }
    """
    try:
        body = await request.json()
        season = data_service.create_season(
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
async def list_seasons(league_id: int, user: dict = Depends(make_require_league_member())):
    """List seasons for a league (league_member)."""
    try:
        return data_service.list_seasons(league_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing seasons: {str(e)}")


@router.get("/api/seasons/{season_id}")
async def get_season(season_id: int):
    """Get a season (public)."""
    try:
        season = data_service.get_season(season_id)
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
    user: dict = Depends(get_current_user)  # League admin check inside service based on season->league
):
    """
    Update a season (league_admin or system_admin).
    Body may include: name, start_date, end_date, point_system, is_active
    """
    try:
        body = await request.json()
        season = data_service.update_season(
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


@router.post("/api/leagues/{league_id}/seasons/{season_id}/activate")
async def activate_season(
    league_id: int,
    season_id: int,
    user: dict = Depends(make_require_league_admin())
):
    """Activate a season (league_admin or system_admin)."""
    try:
        success = data_service.activate_season(league_id, season_id)
        if not success:
            raise HTTPException(status_code=404, detail="League or season not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error activating season: {str(e)}")

@router.get("/api/leagues/{league_id}/members")
async def list_league_members(league_id: int, user: dict = Depends(make_require_league_member())):
    """List league members (league_member)."""
    try:
        return data_service.list_league_members(league_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing members: {str(e)}")


@router.post("/api/leagues/{league_id}/members")
async def add_league_member(
    league_id: int,
    request: Request,
    user: dict = Depends(make_require_league_admin())
):
    """Add player to league with role (league_admin)."""
    try:
        body = await request.json()
        player_id = body["player_id"]
        role = body.get("role", "member")
        member = data_service.add_league_member(league_id, player_id, role)
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
    user: dict = Depends(make_require_league_admin())
):
    """Update league member role (league_admin)."""
    try:
        body = await request.json()
        role = body.get("role")
        if role not in ("admin", "member"):
            raise HTTPException(status_code=400, detail="Invalid role")
        member = data_service.update_league_member(league_id, member_id, role)
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
    user: dict = Depends(make_require_league_admin())
):
    """Remove league member (league_admin)."""
    try:
        success = data_service.remove_league_member(league_id, member_id)
        if not success:
            raise HTTPException(status_code=404, detail="Member not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error removing member: {str(e)}")

# Location endpoints

@router.post("/api/locations")
async def create_location(request: Request, user: dict = Depends(require_system_admin)):
    """Create a location (system_admin)."""
    try:
        body = await request.json()
        location = data_service.create_location(
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
async def list_locations():
    """List locations (public)."""
    try:
        return data_service.list_locations()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing locations: {str(e)}")


@router.put("/api/locations/{location_id}")
async def update_location(location_id: int, request: Request, user: dict = Depends(require_system_admin)):
    """Update a location (system_admin)."""
    try:
        body = await request.json()
        location = data_service.update_location(
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
async def delete_location(location_id: int, user: dict = Depends(require_system_admin)):
    """Delete a location (system_admin)."""
    try:
        success = data_service.delete_location(location_id)
        if not success:
            raise HTTPException(status_code=404, detail="Location not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting location: {str(e)}")

# Court endpoints

@router.post("/api/courts")
async def create_court(request: Request, user: dict = Depends(require_system_admin)):
    """Create a court (system_admin)."""
    try:
        body = await request.json()
        court = data_service.create_court(
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
async def list_courts(location_id: Optional[int] = None):
    """List courts, optionally filtered by location (public)."""
    try:
        return data_service.list_courts(location_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing courts: {str(e)}")


@router.put("/api/courts/{court_id}")
async def update_court(court_id: int, request: Request, user: dict = Depends(require_system_admin)):
    """Update a court (system_admin)."""
    try:
        body = await request.json()
        court = data_service.update_court(
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
async def delete_court(court_id: int, user: dict = Depends(require_system_admin)):
    """Delete a court (system_admin)."""
    try:
        success = data_service.delete_court(court_id)
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
    Load matches from Google Sheets into database and calculate statistics.
    Creates one locked-in session per unique date from sheet data.
    
    Returns:
        dict: Status and summary of calculations
    """
    try:
        # Load matches from Google Sheets
        match_list = sheets_service.load_matches_from_sheets()
        
        # Flush and repopulate database, then calculate stats
        result = data_service.flush_and_repopulate(None, match_list)
        
        return {
            "status": "success",
            "message": "Statistics calculated and saved successfully",
            "player_count": result["player_count"],
            "match_count": result["match_count"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading sheets: {str(e)}")


@router.post("/api/calculate")
async def calculate_stats(current_user: dict = Depends(get_current_user)):
    """
    Recalculate statistics from existing database matches (locked-in sessions only).
    Does not load from Google Sheets - use /api/loadsheets for that.
    
    Returns:
        dict: Status and summary of calculations
    """
    try:
        result = data_service.calculate_stats()
        
        return {
            "status": "success",
            "message": "Statistics recalculated successfully",
            "player_count": result["player_count"],
            "match_count": result["match_count"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating stats: {str(e)}")


@router.get("/api/rankings")
async def get_rankings():
    """
    Get current player rankings.
    
    Returns:
        list: Array of player rankings with stats
    """
    try:
        rankings = data_service.get_rankings()
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
async def list_players():
    """
    Get list of all players.
    
    Returns:
        list: Array of player names
    """
    try:
        # Get all unique player names from database (not just from rankings)
        players = data_service.get_all_player_names()
        return [{"name": name} for name in players]
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error loading players: {str(e)}"
        )


@router.post("/api/players")
async def create_player(request: Request, current_user: dict = Depends(get_current_user)):
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
        
        player_id = data_service.get_or_create_player(name)
        
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
async def get_player_stats(player_name: str):
    """
    Get detailed statistics for a specific player.
    
    Args:
        player_name: Name of the player
        
    Returns:
        list: Array of player stats including partnerships and opponents
    """
    try:
        player_stats = data_service.get_player_stats(player_name)
        
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
async def get_elo_timeline():
    """
    Get ELO timeline data for all players.
    Useful for creating charts/graphs of ELO changes over time.
    
    Returns:
        list: Array of date/ELO data points for each player
    """
    try:
        timeline = data_service.get_elo_timeline()
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


@router.get("/api/matches")
async def get_matches():
    """
    Get all matches with results.
    
    Returns:
        list: Array of all matches sorted by date (most recent first)
    """
    try:
        matches = data_service.get_matches()
        if not matches:
            raise HTTPException(
                status_code=404,
                detail="Matches not found. Please run /api/calculate first."
            )
        return matches
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading matches: {str(e)}")

@router.post("/api/matches/query")
async def query_matches(request: Request, user: Optional[dict] = Depends(get_current_user_optional)):
    """
    Query matches with a request body (preferred over GET with query params).
    Body: MatchesQueryRequest
    """
    try:
        body = await request.json()
        results = data_service.query_matches(body, user)
        return results
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error querying matches: {str(e)}")

@router.get("/api/matches/export")
async def export_matches():
    """
    Export all matches to CSV format (Google Sheets compatible).
    
    Returns CSV file with headers: DATE, T1P1, T1P2, T2P1, T2P2, T1SCORE, T2SCORE
    """
    try:
        csv_content = data_service.export_matches_to_csv()
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
async def get_player_match_history(player_name: str):
    """
    Get match history for a specific player.
    
    Args:
        player_name: Name of the player
        
    Returns:
        list: Array of player's matches (most recent first, may be empty)
    """
    try:
        match_history = data_service.get_player_match_history(player_name)
        
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
async def health_check():
    """
    Health check endpoint.
    
    Returns:
        dict: Service status
    """
    try:
        data_available = not data_service.is_database_empty()
        
        return {
            "status": "healthy",
            "data_available": data_available,
            "message": "API is running" if data_available else "No data yet. Run /api/calculate to generate statistics."
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
async def get_whatsapp_config(current_user: dict = Depends(get_current_user)):
    """
    Get WhatsApp configuration (selected group for automated messages).
    
    Returns:
        dict: Configuration including group_id
    """
    try:
        group_id = data_service.get_setting('whatsapp_group_id')
        return {
            "success": True,
            "group_id": group_id,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading WhatsApp config: {str(e)}")


@router.post("/api/whatsapp/config")
async def set_whatsapp_config(request: Request, current_user: dict = Depends(get_current_user)):
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
        
        data_service.set_setting('whatsapp_group_id', group_id)
        
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
async def get_setting_value(key: str, user: dict = Depends(require_system_admin)):
    """Get a setting value (system_admin)."""
    try:
        value = data_service.get_setting(key)
        return {"key": key, "value": value}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting setting: {str(e)}")


@router.put("/api/settings/{key}")
async def set_setting_value(key: str, request: Request, user: dict = Depends(require_system_admin)):
    """Set a setting value (system_admin)."""
    try:
        body = await request.json()
        if "value" not in body:
            raise HTTPException(status_code=400, detail="value is required")
        data_service.set_setting(key, str(body["value"]))
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error setting value: {str(e)}")

# Session management endpoints

@router.get("/api/sessions")
async def get_sessions():
    """
    Get all sessions.
    
    Returns:
        list: Array of all sessions (most recent first)
    """
    try:
        sessions = data_service.get_sessions()
        return sessions
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading sessions: {str(e)}")


@router.get("/api/sessions/active")
async def get_active_session():
    """
    Get the currently active session, if any.
    
    Returns:
        dict: Active session or null
    """
    try:
        session = data_service.get_active_session()
        return session
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading active session: {str(e)}")


@router.post("/api/leagues/{league_id}/sessions")
async def create_league_session(league_id: int, request: Request, user: dict = Depends(make_require_league_admin())):
    """
    Create a new pending session for a league (league_admin).
    Body: { date?: 'MM/DD/YYYY', name?: string }
    """
    try:
        body = await request.json()
        date = body.get("date") or datetime.now().strftime('%-m/%-d/%Y')
        name = body.get("name")
        session = data_service.create_league_session(league_id=league_id, date=date, name=name)
        return {"status": "success", "message": "Session created", "session": session}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating league session: {str(e)}")

@router.post("/api/sessions")
async def create_session(request: Request, current_user: dict = Depends(get_current_user)):
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
        
        session = data_service.create_session(date)
        
        return {
            "status": "success",
            "message": "Session created successfully",
            "session": session
        }
    except ValueError as e:
        # Handle duplicate active session error
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating session: {str(e)}")


@router.post("/api/sessions/{session_id}/lockin")
async def lock_in_session_endpoint(session_id: int, current_user: dict = Depends(get_current_user)):
    """
    Lock in a session and recalculate all statistics.
    
    When a session is locked in:
    1. Session is marked as complete (is_pending = 0)
    2. All derived stats recalculated from database (locked-in sessions only)
    3. Newly locked matches now included in rankings, partnerships, opponents, ELO history
    
    Args:
        session_id: ID of session to lock in
    
    Returns:
        dict: Status message with calculation summary
    """
    try:
        success = data_service.lock_in_session(session_id)
        
        if not success:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
        
        # Auto-recalculate all stats from locked-in sessions
        result = data_service.calculate_stats()
        
        return {
            "status": "success",
            "message": f"Session submitted and stats recalculated",
            "player_count": result["player_count"],
            "match_count": result["match_count"]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error locking in session: {str(e)}")


@router.post("/api/sessions/{session_id}/end")
async def end_session(session_id: int, current_user: dict = Depends(get_current_user)):
    """
    Legacy endpoint - calls lockin for backwards compatibility.
    """
    return await lock_in_session_endpoint(session_id)


@router.delete("/api/sessions/{session_id}")
async def delete_session(session_id: int, current_user: dict = Depends(get_current_user)):
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
        success = data_service.delete_session(session_id)
        
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


@router.post("/api/matches/create")
async def create_match(request: Request, current_user: dict = Depends(get_current_user)):
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
        session = data_service.get_session(body['session_id'])
        if not session:
            raise HTTPException(status_code=404, detail=f"Session {body['session_id']} not found")
        
        if not session['is_active']:  # is_active still used in dict for API compatibility
            raise HTTPException(status_code=400, detail="Cannot add matches to a submitted session")
        
        # Create the match using the session's date
        match_id = data_service.create_match(
            session_id=body['session_id'],
            date=session['date'],
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
async def update_match(match_id: int, request: Request, current_user: dict = Depends(get_current_user)):
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
        match = data_service.get_match(match_id)
        if not match:
            raise HTTPException(status_code=404, detail=f"Match {match_id} not found")
        
        if match['session_active'] is False:
            raise HTTPException(status_code=400, detail="Cannot edit matches in a submitted session")
        
        # Update the match
        success = data_service.update_match(
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
async def delete_match(match_id: int, current_user: dict = Depends(get_current_user)):
    """
    Delete a match.
    
    Args:
        match_id: ID of match to delete
    
    Returns:
        dict: Delete status
    """
    try:
        # Get match to verify it exists and belongs to active session
        match = data_service.get_match(match_id)
        if not match:
            raise HTTPException(status_code=404, detail=f"Match {match_id} not found")
        
        if match['session_active'] is False:
            raise HTTPException(status_code=400, detail="Cannot delete matches in a submitted session")
        
        # Delete the match
        success = data_service.delete_match(match_id)
        
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
async def signup(request: SignupRequest):
    """
    Start signup process by storing signup data and sending verification code.
    Account is only created after phone verification.
    
    Request body:
        {
            "phone_number": "+15551234567",
            "password": "user_password",  // Required
            "name": "John Doe",  // Optional
            "email": "john@example.com"  // Optional
        }
    
    Returns:
        dict: Status message
    """
    try:
        # Normalize phone number
        phone_number = auth_service.normalize_phone_number(request.phone_number)
        
        # Check if user already exists
        if user_service.check_phone_exists(phone_number, verified_only=True):
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
        
        # Normalize email if provided
        email = None
        if request.email:
            email = auth_service.normalize_email(request.email)
        
        # Hash password (required)
        password_hash = auth_service.hash_password(request.password)
        
        # Generate verification code
        code = auth_service.generate_verification_code()
        
        # Store verification code with signup data (account not created yet)
        success = user_service.create_verification_code(
            phone_number=phone_number,
            code=code,
            password_hash=password_hash,
            name=request.name,
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
async def login(request: LoginRequest):
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
            user = user_service.get_verified_user_by_phone(phone_number)
        
        # Handle email login
        elif request.email:
            # Normalize and validate email
            email = auth_service.normalize_email(request.email)
            # Get verified user by email
            user = user_service.get_verified_user_by_email(email)
        
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
        user_service.create_refresh_token(user["id"], refresh_token, expires_at)
        
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
async def send_verification(request: Request, payload: CheckPhoneRequest):
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
        success = user_service.create_verification_code(phone_number, code)
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
async def verify_phone(request: Request, payload: VerifyPhoneRequest):
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
        signup_data = user_service.verify_and_mark_code_used(phone_number, payload.code)
        if not signup_data:
            # Check if user exists (for SMS login case)
            user = user_service.get_user_by_phone(phone_number, verified_only=True)
            if user:
                # Account is locked check for existing users
                if user_service.is_account_locked(user):
                    raise HTTPException(
                        status_code=423,
                        detail="Account is temporarily locked due to too many failed attempts. Please try again later."
                    )
                # Increment failed attempts for existing user (uses phone_number internally)
                user_service.increment_failed_attempts(phone_number)
            raise INVALID_VERIFICATION_CODE_RESPONSE
        
        # Check if this is a signup (has password_hash) or SMS login (no password_hash)
        is_signup = signup_data.get("password_hash") is not None
        
        if is_signup:
            # Create new user account from signup data
            try:
                user_id = user_service.create_user(
                    phone_number=phone_number,
                    password_hash=signup_data["password_hash"],
                    name=signup_data.get("name"),
                    email=signup_data.get("email")
                )
                # Automatically create a basic player profile for the new user
                # Do this after user creation to avoid database lock issues
                try:
                    data_service.create_player_for_user(user_id, full_name=' ')
                except Exception as e:
                    # Log error but don't fail user creation if player creation fails
                    logger.error(f"Failed to create player profile for user {user_id}: {str(e)}")
                
                # Get the newly created user
                user = user_service.get_user_by_id(user_id)
            except ValueError as e:
                # User already exists (race condition or duplicate signup)
                raise HTTPException(
                    status_code=400,
                    detail=str(e)
                )
        else:
            # SMS login - get existing user
            user = user_service.get_user_by_phone(phone_number, verified_only=True)
            if not user:
                raise INVALID_CREDENTIALS_RESPONSE
            # Check if account is locked
            if user_service.is_account_locked(user):
                raise HTTPException(
                    status_code=423,
                    detail="Account is temporarily locked due to too many failed attempts. Please try again later."
                )
        
        # Reset failed attempts on success
        user_service.reset_failed_attempts(user["id"])
        
        # Create access token
        token_data = {
            "user_id": user["id"],
            "phone_number": user["phone_number"]
        }
        access_token = auth_service.create_access_token(data=token_data)
        
        # Create refresh token
        refresh_token = auth_service.generate_refresh_token()
        expires_at = datetime.utcnow() + timedelta(days=auth_service.REFRESH_TOKEN_EXPIRATION_DAYS)
        user_service.create_refresh_token(user["id"], refresh_token, expires_at)
        
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
async def reset_password(request: Request, payload: ResetPasswordRequest):
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
        user = user_service.get_user_by_phone(phone_number, verified_only=True)
        if not user:
            # Don't reveal if phone exists for security
            return {
                "status": "success",
                "message": "If an account exists with this phone number, a verification code has been sent."
            }
        
        # Generate verification code
        code = auth_service.generate_verification_code()
        
        # Save code to database (without signup data, just for password reset)
        success = user_service.create_verification_code(phone_number, code)
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
async def reset_password_verify(request: Request, payload: ResetPasswordVerifyRequest):
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
        user = user_service.get_user_by_phone(phone_number, verified_only=True)
        if not user:
            raise INVALID_CREDENTIALS_RESPONSE
        
        # Check if account is locked
        if user_service.is_account_locked(user):
            raise HTTPException(
                status_code=423,
                detail="Account is temporarily locked due to too many failed attempts. Please try again later."
            )
        
        # Verify the code (for password reset, code won't have signup data, but function still returns dict if valid)
        code_result = user_service.verify_and_mark_code_used(phone_number, payload.code)
        if not code_result:
            # Increment failed attempts
            user_service.increment_failed_attempts(phone_number)
            raise INVALID_VERIFICATION_CODE_RESPONSE
        
        # Reset failed attempts on success
        user_service.reset_failed_attempts(user["id"])
        
        # Generate reset token
        reset_token = auth_service.generate_refresh_token()  # Reuse the same secure token generator
        expires_at = datetime.utcnow() + timedelta(hours=1)  # Token expires in 1 hour
        
        # Store reset token
        success = user_service.create_password_reset_token(user["id"], reset_token, expires_at)
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
async def reset_password_confirm(request: Request, payload: ResetPasswordConfirmRequest):
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
        user_id = user_service.verify_and_use_password_reset_token(payload.reset_token)
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired reset token"
            )
        
        # Get user to get phone number for token
        user = user_service.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=404,
                detail="User not found"
            )
        
        # Hash new password
        new_password_hash = auth_service.hash_password(payload.new_password)
        
        # Update password
        success = user_service.update_user_password(user_id, new_password_hash)
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
        user_service.create_refresh_token(user["id"], refresh_token, expires_at)
        
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
async def sms_login(request: Request, payload: SMSLoginRequest):
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
        
        # Get verified user
        user = user_service.get_verified_user_by_phone(phone_number)
        if not user:
            raise INVALID_CREDENTIALS_RESPONSE
        
        # Check if account is locked
        if user_service.is_account_locked(user):
            raise HTTPException(
                status_code=423,
                detail="Account is temporarily locked due to too many failed attempts. Please try again later."
            )
        
        # Atomically verify code and mark as used
        if not user_service.verify_and_mark_code_used(phone_number, payload.code):
            # Increment failed attempts
            user_service.increment_failed_attempts(phone_number)
            raise INVALID_VERIFICATION_CODE_RESPONSE
        
        # Reset failed attempts on success
        user_service.reset_failed_attempts(user["id"])
        
        # Create access token
        token_data = {
            "user_id": user["id"],
            "phone_number": user["phone_number"]
        }
        access_token = auth_service.create_access_token(data=token_data)
        
        # Create refresh token
        refresh_token = auth_service.generate_refresh_token()
        expires_at = datetime.utcnow() + timedelta(days=auth_service.REFRESH_TOKEN_EXPIRATION_DAYS)
        user_service.create_refresh_token(user["id"], refresh_token, expires_at)
        
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
async def check_phone(phone_number: str):
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
        
        # Check if verified user exists
        verified_user = user_service.get_verified_user_by_phone(normalized_phone)
        
        if verified_user:
            return CheckPhoneResponse(
                exists=True,
                is_verified=True
            )
        
        # Check if any user exists (including unverified)
        user = user_service.get_user_by_phone(normalized_phone, verified_only=False)
        
        return CheckPhoneResponse(
            exists=user is not None,
            is_verified=False
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking phone: {str(e)}")


@router.post("/api/auth/refresh", response_model=RefreshTokenResponse)
async def refresh_token(request: RefreshTokenRequest):
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
        refresh_token_record = user_service.get_refresh_token(request.refresh_token)
        if not refresh_token_record:
            raise HTTPException(
                status_code=401,
                detail="Invalid refresh token"
            )
        
        # Check if token is expired
        expires_at = datetime.fromisoformat(refresh_token_record["expires_at"])
        if datetime.utcnow() > expires_at:
            # Delete expired token
            user_service.delete_refresh_token(request.refresh_token)
            raise HTTPException(
                status_code=401,
                detail="Refresh token has expired"
            )
        
        # Get user
        user = user_service.get_user_by_id(refresh_token_record["user_id"])
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
async def get_current_user_player(current_user: dict = Depends(get_current_user)):
    """
    Get the current user's player profile.
    Requires authentication.
    
    Returns:
        Player profile with gender, level, etc., or null if user has no player profile
    """
    try:
        player = data_service.get_player_by_user_id(current_user["id"])
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
    current_user: dict = Depends(get_current_user)
):
    """
    Update the current user's player profile.
    Requires authentication.
    
    Request body:
        {
            "full_name": "John Doe",  // Optional
            "nickname": "Johnny",     // Optional
            "gender": "male",         // Optional
            "level": "beginner",      // Optional
            "default_location_id": 1  // Optional
        }
    
    Returns:
        Updated player profile
    """
    try:
        player = data_service.update_user_player(
            user_id=current_user["id"],
            full_name=payload.full_name,
            nickname=payload.nickname,
            gender=payload.gender,
            level=payload.level,
            default_location_id=payload.default_location_id
        )
        
        if not player:
            raise HTTPException(
                status_code=404,
                detail="Player profile not found. This should not happen after signup."
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
async def get_user_leagues(user: dict = Depends(get_current_user)):
    """
    Get all leagues that the current user is a member of.
    Requires authentication.
    """
    try:
        return data_service.get_user_leagues(user["id"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting user leagues: {str(e)}")

