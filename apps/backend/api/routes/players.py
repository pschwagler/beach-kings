"""Player list, create, data, placeholder, and invite route handlers."""

import logging
import traceback
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.routes import limiter
from backend.database.db import get_db_session
from backend.services import data_service, placeholder_service
from backend.api.auth_dependencies import get_current_user, get_current_user_optional
from backend.models.schemas import (
    CreatePlaceholderRequest,
    PlaceholderPlayerResponse,
    PlaceholderListResponse,
    DeletePlaceholderResponse,
    InviteDetailsResponse,
    ClaimInviteResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


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


# ---------------------------------------------------------------------------
# Player data / stats
# ---------------------------------------------------------------------------


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
