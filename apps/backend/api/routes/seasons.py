"""Season and stats route handlers."""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.db import get_db_session
from backend.services import data_service, notification_service
from backend.api.auth_dependencies import (
    get_current_user,
    require_user,
    make_require_league_admin,
)

logger = logging.getLogger(__name__)
router = APIRouter()


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


# ---------------------------------------------------------------------------
# Stats endpoints
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Rankings
# ---------------------------------------------------------------------------


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
