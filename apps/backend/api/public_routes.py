"""
Public API routes — no authentication required.

Provides read-only endpoints for SEO (sitemap, public pages).
All routes are prefixed with /api/public.
"""

from typing import List, Dict

from fastapi import APIRouter, Depends, HTTPException
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
