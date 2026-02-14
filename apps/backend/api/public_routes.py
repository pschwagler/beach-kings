"""
Public API routes — no authentication required.

Provides read-only endpoints for SEO (sitemap, public pages).
All routes are prefixed with /api/public.
"""

from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.db import get_db_session
from backend.models.schemas import (
    PaginatedPublicLeaguesResponse,
    PaginatedPublicPlayersResponse,
    PublicLeagueDetailResponse,
    PublicLocationDetailResponse,
    PublicLocationDirectoryRegion,
    PublicPlayerResponse,
    SitemapLeagueItem,
    SitemapLocationItem,
    SitemapPlayerItem,
)
from backend.services import public_service


async def _cache_public(response: Response):
    """Set Cache-Control headers on all public API responses (5min TTL)."""
    response.headers["Cache-Control"] = "public, max-age=300, s-maxage=300"


public_router = APIRouter(
    prefix="/api/public", tags=["public"], dependencies=[Depends(_cache_public)]
)


@public_router.get("/sitemap/leagues", response_model=List[SitemapLeagueItem])
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


@public_router.get("/sitemap/players", response_model=List[SitemapPlayerItem])
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


@public_router.get("/sitemap/locations", response_model=List[SitemapLocationItem])
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


@public_router.get("/leagues", response_model=PaginatedPublicLeaguesResponse)
async def list_public_leagues(
    location_id: Optional[str] = Query(None, description="Filter by location ID"),
    region_id: Optional[str] = Query(None, description="Filter by region ID"),
    gender: Optional[Literal["male", "female", "mixed"]] = Query(
        None, description="Filter by gender"
    ),
    level: Optional[Literal["juniors", "beginner", "intermediate", "advanced", "AA", "Open"]] = Query(
        None, description="Filter by skill level"
    ),
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


@public_router.get("/leagues/{league_id}", response_model=PublicLeagueDetailResponse)
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


@public_router.get("/players", response_model=PaginatedPublicPlayersResponse)
async def list_public_players(
    search: Optional[str] = Query(None, description="Search by player name"),
    location_id: Optional[str] = Query(None, description="Filter by location ID"),
    gender: Optional[Literal["male", "female"]] = Query(
        None, description="Filter by gender"
    ),
    level: Optional[Literal["juniors", "beginner", "intermediate", "advanced", "AA", "Open"]] = Query(
        None, description="Filter by skill level"
    ),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(25, ge=1, le=100, description="Items per page"),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Search publicly visible players with optional filters.

    Returns paginated players with total_games >= 1. Supports filtering
    by name, location, gender, and level. No authentication required.
    """
    return await public_service.search_public_players(
        session,
        search=search,
        location_id=location_id,
        gender=gender,
        level=level,
        page=page,
        page_size=page_size,
    )


@public_router.get("/players/{player_id}", response_model=PublicPlayerResponse)
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


@public_router.get("/locations", response_model=List[PublicLocationDirectoryRegion])
async def list_public_locations(session: AsyncSession = Depends(get_db_session)):
    """
    Get all locations with slugs for the public directory.

    Returns locations grouped by region, each with basic stats
    (league count, player count). No authentication required.
    """
    return await public_service.get_public_locations(session)


@public_router.get("/locations/{slug}", response_model=PublicLocationDetailResponse)
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
