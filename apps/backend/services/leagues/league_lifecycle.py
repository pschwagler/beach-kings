"""Checks for operations that add activity to a league."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import League


class LeagueArchivedError(ValueError):
    def __init__(self):
        super().__init__("This league is archived.")


async def require_unarchived_league(session: AsyncSession, league_id: int) -> None:
    """Keep archive status stable until the caller commits its write."""
    archived = await session.scalar(
        select(League.is_archived).where(League.id == league_id).with_for_update(read=True)
    )
    if archived is True:
        raise LeagueArchivedError()
