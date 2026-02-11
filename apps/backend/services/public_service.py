"""
Public service functions — no authentication required.

Provides read-only data access for SEO (sitemap, public pages).
"""

from typing import List, Dict

from sqlalchemy import select, exists
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import League, Location, Player, PlayerGlobalStats


async def get_sitemap_leagues(session: AsyncSession) -> List[Dict]:
    """
    Get all public leagues for sitemap generation.

    Returns:
        List of dicts with id, name, updated_at for leagues where is_public=True.
    """
    result = await session.execute(
        select(League.id, League.name, League.updated_at).where(League.is_public == True)  # noqa: E712
    )
    return [
        {
            "id": row.id,
            "name": row.name,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        for row in result.all()
    ]


async def get_sitemap_players(session: AsyncSession) -> List[Dict]:
    """
    Get all players with at least 1 game for sitemap generation.

    Returns:
        List of dicts with id, full_name, updated_at for players with total_games >= 1.
    """
    result = await session.execute(
        select(Player.id, Player.full_name, Player.updated_at)
        .join(PlayerGlobalStats, PlayerGlobalStats.player_id == Player.id)
        .where(PlayerGlobalStats.total_games >= 1)
    )
    return [
        {
            "id": row.id,
            "full_name": row.full_name,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        for row in result.all()
    ]


async def get_sitemap_locations(session: AsyncSession) -> List[Dict]:
    """
    Get all locations that have a slug and at least 1 league for sitemap generation.

    Returns:
        List of dicts with slug, updated_at for locations with >=1 league.
    """
    result = await session.execute(
        select(Location.slug, Location.updated_at).where(
            Location.slug.isnot(None),
            exists(select(League.id).where(League.location_id == Location.id)),
        )
    )
    return [
        {
            "slug": row.slug,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        for row in result.all()
    ]
