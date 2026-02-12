"""
Public API routes — no authentication required.

Provides read-only endpoints for SEO (sitemap, public pages).
All routes are prefixed with /api/public.
"""

from typing import List, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.db import get_db_session
from backend.services import public_service

public_router = APIRouter(prefix="/api/public", tags=["public"])


@public_router.get("/sitemap/leagues", response_model=List[Dict])
async def sitemap_leagues(session: AsyncSession = Depends(get_db_session)):
    """
    Get all public leagues for sitemap generation.

    Returns [{id, name, updated_at}] for leagues where is_public=True.
    No authentication required.
    """
    try:
        return await public_service.get_sitemap_leagues(session)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching sitemap leagues: {str(e)}")


@public_router.get("/sitemap/players", response_model=List[Dict])
async def sitemap_players(session: AsyncSession = Depends(get_db_session)):
    """
    Get all players with at least 1 game for sitemap generation.

    Returns [{id, full_name, updated_at}] for players with total_games >= 1.
    No authentication required.
    """
    try:
        return await public_service.get_sitemap_players(session)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching sitemap players: {str(e)}")


@public_router.get("/sitemap/locations", response_model=List[Dict])
async def sitemap_locations(session: AsyncSession = Depends(get_db_session)):
    """
    Get all locations with at least 1 league for sitemap generation.

    Returns [{slug, updated_at}] for locations with a slug and >=1 league.
    No authentication required.
    """
    try:
        return await public_service.get_sitemap_locations(session)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching sitemap locations: {str(e)}"
        )


@public_router.get("/leagues")
async def list_public_leagues(
    location_id: Optional[str] = Query(None, description="Filter by location ID"),
    region_id: Optional[str] = Query(None, description="Filter by region ID"),
    gender: Optional[str] = Query(None, description="Filter by gender (male, female, mixed)"),
    level: Optional[str] = Query(None, description="Filter by skill level"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(25, ge=1, le=100, description="Items per page"),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Get paginated list of public leagues with optional filters.

    Returns public leagues (is_public=True) with member count, games played,
    location info, and region info. Supports filtering by location, region,
    gender, and level. No authentication required.
    """
    return await public_service.get_public_leagues(
        session,
        location_id=location_id,
        region_id=region_id,
        gender=gender,
        level=level,
        page=page,
        page_size=page_size,
    )


@public_router.get("/leagues/{league_id}")
async def get_public_league(league_id: int, session: AsyncSession = Depends(get_db_session)):
    """
    Get public-facing league data.

    Public leagues: full info, member list, current season standings, last 20 matches.
    Private leagues: limited info (name, location, member count, creator, games played).
    Returns 404 if league not found.
    """
    result = await public_service.get_public_league(session, league_id)
    if result is None:
        raise HTTPException(status_code=404, detail="League not found")
    return result


@public_router.get("/players/{player_id}")
async def get_public_player(player_id: int, session: AsyncSession = Depends(get_db_session)):
    """
    Get public-facing player profile.

    Returns player info, stats, location, and public league memberships.
    Only players with at least 1 game are publicly visible.
    Returns 404 if player not found or has no games.
    """
    result = await public_service.get_public_player(session, player_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Player not found")
    return result


@public_router.get("/locations")
async def list_public_locations(session: AsyncSession = Depends(get_db_session)):
    """
    Get all locations with slugs for the public directory.

    Returns locations grouped by region, each with basic stats
    (league count, player count). No authentication required.
    """
    return await public_service.get_public_locations(session)


@public_router.get("/locations/{slug}")
async def get_public_location(slug: str, session: AsyncSession = Depends(get_db_session)):
    """
    Get public-facing location data by slug.

    Returns location info, public leagues, top 20 players by ELO,
    courts, and aggregate stats.
    Returns 404 if slug not found.
    """
    result = await public_service.get_public_location_by_slug(session, slug)
    if result is None:
        raise HTTPException(status_code=404, detail="Location not found")
    return result
