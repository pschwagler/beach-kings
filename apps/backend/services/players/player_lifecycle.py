"""Internal lifecycle helpers for permanently deleted player tombstones."""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import Player


DELETED_PLAYER_NAME = "Deleted Player"


def historical_name(name: str | None, deleted_at: object | None) -> str:
    """Return the only name ordinary APIs may expose for a deleted player."""
    return DELETED_PLAYER_NAME if deleted_at is not None else (name or "")


def historical_id(player_id: int | None, deleted_at: object | None) -> int | None:
    """Remove the navigable identity while retaining the database FK internally."""
    return None if deleted_at is not None else player_id


async def active_player_ids(session: AsyncSession, player_ids: Sequence[int]) -> set[int]:
    """Return the requested player IDs that exist and are not permanently deleted."""
    unique_ids = tuple(dict.fromkeys(int(player_id) for player_id in player_ids))
    if not unique_ids:
        return set()
    result = await session.execute(
        select(Player.id).where(Player.id.in_(unique_ids), Player.deleted_at.is_(None))
    )
    return set(result.scalars().all())


async def require_active_players(session: AsyncSession, player_ids: Sequence[int]) -> None:
    """Reject missing or deleted IDs at mutation/interaction boundaries."""
    unique_ids = set(int(player_id) for player_id in player_ids)
    if await active_player_ids(session, tuple(unique_ids)) != unique_ids:
        raise ValueError("Player not found")
