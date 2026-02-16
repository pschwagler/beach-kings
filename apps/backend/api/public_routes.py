"""
Public API routes — no authentication required.

Provides read-only endpoints for SEO (sitemap, public pages).
All routes are prefixed with /api/public.
"""

import logging
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.routes import limiter
from backend.database.db import get_db_session

logger = logging.getLogger(__name__)
from backend.models.schemas import (
    CourtDetailResponse,
    CourtListItem,
    CourtNearbyItem,
    CourtTagResponse,
    PaginatedCourtsResponse,
    PaginatedPublicLeaguesResponse,
    PaginatedPublicPlayersResponse,
    PublicLeagueDetailResponse,
    PublicLocationDetailResponse,
    PublicLocationDirectoryRegion,
    PublicPlayerResponse,
    SitemapCourtItem,
    SitemapLeagueItem,
    SitemapLocationItem,
    SitemapPlayerItem,
)
from backend.services import court_service, public_service


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
    except Exception:
        logger.error("Error fetching sitemap leagues", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@public_router.get("/sitemap/players", response_model=List[SitemapPlayerItem])
async def sitemap_players(session: AsyncSession = Depends(get_db_session)):
    """
    Get all players with at least 1 game for sitemap generation.

    Returns [{id, full_name, updated_at}] for players with total_games >= 1.
    No authentication required.
    """
    try:
        return await public_service.get_sitemap_players(session)
    except Exception:
        logger.error("Error fetching sitemap players", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@public_router.get("/sitemap/locations", response_model=List[SitemapLocationItem])
async def sitemap_locations(session: AsyncSession = Depends(get_db_session)):
    """
    Get all locations with at least 1 league for sitemap generation.

    Returns [{slug, updated_at}] for locations with a slug and >=1 league.
    No authentication required.
    """
    try:
        return await public_service.get_sitemap_locations(session)
    except Exception:
        logger.error("Error fetching sitemap locations", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@public_router.get("/leagues", response_model=PaginatedPublicLeaguesResponse)
@limiter.limit("60/minute")
async def list_public_leagues(
    request: Request,
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
@limiter.limit("60/minute")
async def get_public_league(request: Request, league_id: int, session: AsyncSession = Depends(get_db_session)):
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
@limiter.limit("30/minute")
async def list_public_players(
    request: Request,
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
@limiter.limit("60/minute")
async def get_public_player(request: Request, player_id: int, session: AsyncSession = Depends(get_db_session)):
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
@limiter.limit("60/minute")
async def list_public_locations(request: Request, session: AsyncSession = Depends(get_db_session)):
    """
    Get all locations with slugs for the public directory.

    Returns locations grouped by region, each with basic stats
    (league count, player count). No authentication required.
    """
    return await public_service.get_public_locations(session)


@public_router.get("/locations/{slug}", response_model=PublicLocationDetailResponse)
@limiter.limit("60/minute")
async def get_public_location(request: Request, slug: str, session: AsyncSession = Depends(get_db_session)):
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


# ---------------------------------------------------------------------------
# Court Discovery (public)
# ---------------------------------------------------------------------------


@public_router.get("/courts/tags", response_model=List[CourtTagResponse])
@limiter.limit("60/minute")
async def list_court_tags(request: Request, session: AsyncSession = Depends(get_db_session)):
    """
    List all curated court review tags.

    Returns tags grouped by category (quality, vibe, facility) ordered by sort_order.
    """
    return await court_service.get_all_tags(session)


@public_router.get("/courts/nearby", response_model=List[CourtNearbyItem])
@limiter.limit("60/minute")
async def get_nearby_courts(
    request: Request,
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    radius: float = Query(25.0, ge=1, le=100, description="Radius in miles"),
    exclude: Optional[int] = Query(None, description="Court ID to exclude"),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Get approved courts near a lat/lng coordinate.

    Returns up to 10 courts within the given radius, sorted by distance.
    """
    return await court_service.get_nearby_courts(
        session, lat, lng, exclude_court_id=exclude, radius_miles=radius
    )


@public_router.get("/courts/{slug}", response_model=CourtDetailResponse)
@limiter.limit("60/minute")
async def get_public_court(request: Request, slug: str, session: AsyncSession = Depends(get_db_session)):
    """
    Get full court detail by slug.

    Returns court info, reviews with tags/photos/authors, and aggregated photos.
    Returns 404 if court not found.
    """
    result = await court_service.get_court_by_slug(session, slug)
    if result is None:
        raise HTTPException(status_code=404, detail="Court not found")
    return result


@public_router.get("/courts", response_model=PaginatedCourtsResponse)
@limiter.limit("60/minute")
async def list_public_courts(
    request: Request,
    location_id: Optional[str] = Query(None, description="Filter by location hub ID"),
    surface_type: Optional[str] = Query(None, description="Filter by surface type"),
    min_rating: Optional[float] = Query(None, ge=1, le=5, description="Minimum average rating"),
    is_free: Optional[bool] = Query(None, description="Filter free courts"),
    has_lights: Optional[bool] = Query(None, description="Filter courts with lights"),
    has_restrooms: Optional[bool] = Query(None, description="Filter courts with restrooms"),
    has_parking: Optional[bool] = Query(None, description="Filter courts with parking"),
    nets_provided: Optional[bool] = Query(None, description="Filter courts with nets"),
    search: Optional[str] = Query(None, description="Search by name or address"),
    user_lat: Optional[float] = Query(None, description="User latitude for distance sort"),
    user_lng: Optional[float] = Query(None, description="User longitude for distance sort"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=500, description="Items per page"),
    session: AsyncSession = Depends(get_db_session),
):
    """
    List approved courts with optional filters and pagination.

    Supports filtering by location, surface type, amenities, rating, and free/paid.
    When user_lat/user_lng are provided, results are sorted by distance and include
    distance_miles in each item.
    Returns court cards with average rating, top tags, and thumbnail photo.
    """
    return await court_service.list_courts_public(
        session,
        location_id=location_id,
        surface_type=surface_type,
        min_rating=min_rating,
        is_free=is_free,
        has_lights=has_lights,
        has_restrooms=has_restrooms,
        has_parking=has_parking,
        nets_provided=nets_provided,
        search=search,
        user_lat=user_lat,
        user_lng=user_lng,
        page=page,
        page_size=page_size,
    )


@public_router.get("/sitemap/courts", response_model=List[SitemapCourtItem])
async def sitemap_courts(session: AsyncSession = Depends(get_db_session)):
    """
    Get all approved courts with slugs for sitemap generation.

    Returns [{slug, updated_at}] for approved, active courts.
    """
    try:
        return await court_service.get_sitemap_courts(session)
    except Exception:
        logger.error("Error fetching sitemap courts", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")
