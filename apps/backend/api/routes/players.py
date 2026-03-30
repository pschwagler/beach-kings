"""Player list, create, data, placeholder, and invite route handlers."""

import logging
from typing import Any, Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.routes import limiter
from backend.database.db import get_db_session
from backend.services import data_service, placeholder_service
from backend.api.auth_dependencies import (
    get_current_user,
    get_current_user_optional,
    require_verified_player,
)
from backend.models.schemas import (
    ClaimInviteResponse,
    CreatePlaceholderRequest,
    CreatePlayerRequest,
    CreatePlayerResponse,
    AddPlayerHomeCourt,
    DeletePlaceholderResponse,
    InviteDetailsResponse,
    InviteUrlResponse,
    PaginatedPlayersResponse,
    PlaceholderListResponse,
    PlaceholderPlayerResponse,
    PlayerHomeCourtResponse,
    SetPlayerHomeCourts,
    ReorderPlayerHomeCourts,
    MatchesQueryRequest,
    SuccessResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/players", response_model=PaginatedPlayersResponse)
@limiter.limit("60/minute")
async def list_players(
    request: Request,
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
    Get list of players with optional search and filters. Always returns { items, total_count }.

    Query params: q (search name), location_id (repeatable), league_id (repeatable),
    gender (repeatable), level (repeatable), limit (default 50), offset (default 0),
    include_placeholders (bool, requires auth), session_id (int, for placeholder scoping).
    """
    try:
        items, total = await data_service.list_players_search(
            session,
            q=q,
            location_ids=location_id,
            league_ids=league_id,
            genders=gender,
            levels=level,
            limit=limit,
            offset=offset,
            include_placeholders=include_placeholders,
            session_id=session_id,
        )
        return {"items": items, "total_count": total}
    except Exception as e:
        logger.error("Error loading players: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


# --- Placeholder Player endpoints ---


@router.post("/api/players/placeholder", response_model=PlaceholderPlayerResponse)
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
        logger.error("Error creating placeholder: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/players/placeholder", response_model=PlaceholderListResponse)
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
        logger.error("Error listing placeholders: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/api/players/placeholder/{player_id}", response_model=DeletePlaceholderResponse)
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
        logger.error("Error deleting placeholder: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/players/{player_id}/invite-url", response_model=InviteUrlResponse)
async def get_player_invite_url(
    player_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Get the invite URL for a placeholder player by player ID.

    Authorization: only the user who created the placeholder can retrieve its invite URL.

    Returns:
        InviteUrlResponse with invite_url
    """
    try:
        # Verify the current user created this placeholder
        placeholder = await data_service.get_player_by_id(session, player_id)
        if not placeholder:
            raise HTTPException(status_code=404, detail="Player not found")
        if not placeholder.get("is_placeholder"):
            raise HTTPException(status_code=400, detail="Player is not a placeholder")

        caller_player = await data_service.get_player_by_user_id(session, current_user["id"])
        if not caller_player or placeholder.get("created_by_player_id") != caller_player["id"]:
            raise HTTPException(
                status_code=403,
                detail="You can only retrieve invite URLs for placeholders you created",
            )

        result = await placeholder_service.get_invite_url_by_player_id(session, player_id)
        return result
    except placeholder_service.InviteNotFoundError:
        raise HTTPException(status_code=404, detail="No pending invite found for this player")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error retrieving invite URL for player %s: %s", player_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="An unexpected error occurred")


# --- Invite Claim endpoints ---


@router.get("/api/invites/{token}", response_model=InviteDetailsResponse)
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
        logger.error("Error retrieving invite: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/api/invites/{token}/claim", response_model=ClaimInviteResponse)
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
    except (
        placeholder_service.InviteNotFoundError,
        placeholder_service.PlaceholderNotFoundError,
    ) as e:
        raise HTTPException(status_code=404, detail=str(e))
    except placeholder_service.InviteAlreadyClaimedError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except placeholder_service.MergeConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Error claiming invite: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/api/players", response_model=CreatePlayerResponse)
async def create_player(
    body: CreatePlayerRequest,
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
        name = body.name.strip()

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
        logger.error("Error creating player: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


# ---------------------------------------------------------------------------
# Player data / stats
# ---------------------------------------------------------------------------


@router.get("/api/players/{player_id}/matches", response_model=List[Any])
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
        logger.error("Error loading match history: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/api/players/{player_id}/season/{season_id}/stats",
    response_model=dict,
)
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
        logger.error("Error loading player season stats: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/elo-timeline", response_model=List[Any])
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
        logger.error("Error loading ELO timeline: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/api/matches/search", response_model=List[Any])
async def search_matches(
    body: MatchesQueryRequest,
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
        results = await data_service.query_matches(session, body.model_dump(), user)
        return results
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error searching matches: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


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
        logger.error("Error exporting matches: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/players/{player_id}/stats", response_model=dict)
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
        logger.error("Error loading player stats: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


# ---------------------------------------------------------------------------
# Player Home Courts
# ---------------------------------------------------------------------------


@router.get("/api/players/{player_id}/home-courts", response_model=List[PlayerHomeCourtResponse])
async def list_player_home_courts(
    player_id: int,
    session: AsyncSession = Depends(get_db_session),
):
    """List home courts for a player (public)."""
    try:
        return await data_service.get_player_home_courts(session, player_id)
    except Exception as e:
        logger.error("Error listing home courts: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/api/players/{player_id}/home-courts", response_model=PlayerHomeCourtResponse)
async def add_player_home_court(
    player_id: int,
    body: AddPlayerHomeCourt,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Add a home court to a player (self only)."""
    if user["player_id"] != player_id:
        raise HTTPException(status_code=403, detail="You can only manage your own home courts")
    try:
        court_id = body.court_id
        if not court_id:
            raise HTTPException(status_code=400, detail="court_id is required")
        court = await data_service.add_player_home_court(session, player_id, court_id)
        return court
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        from sqlalchemy.exc import IntegrityError

        if isinstance(e, IntegrityError):
            raise HTTPException(status_code=409, detail="Court is already a home court")
        logger.error("Error adding home court for player %s: %s", player_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="An unexpected error occurred")


@router.delete("/api/players/{player_id}/home-courts/{court_id}", response_model=SuccessResponse)
async def remove_player_home_court(
    player_id: int,
    court_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Remove a home court from a player (self only)."""
    if user["player_id"] != player_id:
        raise HTTPException(status_code=403, detail="You can only manage your own home courts")
    try:
        success = await data_service.remove_player_home_court(session, player_id, court_id)
        if not success:
            raise HTTPException(status_code=404, detail="Home court not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error removing home court: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/api/players/{player_id}/home-courts", response_model=List[PlayerHomeCourtResponse])
async def set_player_home_courts(
    player_id: int,
    body: SetPlayerHomeCourts,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Set all home courts for a player (self only). Accepts {court_ids: [1, 2, 3]}."""
    if user["player_id"] != player_id:
        raise HTTPException(status_code=403, detail="You can only manage your own home courts")
    try:
        court_ids = body.court_ids
        if court_ids is None or not isinstance(court_ids, list):
            raise HTTPException(status_code=400, detail="court_ids array is required")
        courts = await data_service.set_player_home_courts(session, player_id, court_ids)
        return courts
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error setting home courts: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put(
    "/api/players/{player_id}/home-courts/reorder",
    response_model=List[PlayerHomeCourtResponse],
)
async def reorder_player_home_courts(
    player_id: int,
    body: ReorderPlayerHomeCourts,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Reorder home courts for a player (self only). Accepts [{court_id, position}]."""
    if user["player_id"] != player_id:
        raise HTTPException(status_code=403, detail="You can only manage your own home courts")
    try:
        court_positions = body.court_positions
        if not court_positions or not isinstance(court_positions, list):
            raise HTTPException(status_code=400, detail="court_positions array is required")
        court_positions_dicts = [cp.model_dump() for cp in court_positions]
        courts = await data_service.reorder_player_home_courts(
            session, player_id, court_positions_dicts
        )
        return courts
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error reordering home courts: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")
