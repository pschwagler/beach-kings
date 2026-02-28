"""
Season finalization service — background worker that computes awards for ended seasons.

Polls every 6 hours for seasons whose end_date has passed but awards have not
been finalized. Acts as a safety net for the lazy-computation path.
"""

import asyncio
import logging
from datetime import date
from typing import Optional

from sqlalchemy import select, and_

from backend.database import db
from backend.database.models import Season

logger = logging.getLogger(__name__)

# How often the worker checks for unfinalized seasons (seconds)
POLL_INTERVAL_SECONDS = 6 * 60 * 60  # 6 hours


class SeasonFinalizationService:
    """Background service that finalizes awards for ended seasons."""

    def __init__(self):
        self._worker_task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()

    def start(self) -> None:
        """Start the background finalization worker."""
        if self._worker_task is None or self._worker_task.done():
            self._stop_event.clear()
            self._worker_task = asyncio.create_task(self._poll_loop())
            logger.info("Season finalization worker started")

    def stop(self) -> None:
        """Stop the background finalization worker."""
        self._stop_event.set()
        if self._worker_task and not self._worker_task.done():
            self._worker_task.cancel()
            logger.info("Season finalization worker stopped")

    async def _poll_loop(self) -> None:
        """Main loop: process unfinalized seasons, then sleep. Repeats until stopped."""
        while not self._stop_event.is_set():
            try:
                await self._process_unfinalized_seasons()
            except Exception as e:
                logger.error(
                    f"Error in season finalization worker: {e}", exc_info=True
                )

            # Wait for poll interval or until stop is signalled
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(), timeout=POLL_INTERVAL_SECONDS
                )
                break  # stop_event was set
            except asyncio.TimeoutError:
                pass  # interval elapsed, loop again

    async def _process_unfinalized_seasons(self) -> None:
        """Find and finalize all ended seasons without awards."""
        async with db.AsyncSessionLocal() as session:
            today = date.today()
            result = await session.execute(
                select(Season).where(
                    and_(
                        Season.end_date < today,
                        Season.awards_finalized_at.is_(None),
                    )
                )
            )
            unfinalized = result.scalars().all()

            if not unfinalized:
                return

            logger.info(
                f"Found {len(unfinalized)} unfinalized season(s) to process"
            )

            # Local import to avoid circular dependency at module level
            from backend.services.season_awards_service import compute_season_awards

            for season in unfinalized:
                try:
                    awards = await compute_season_awards(session, season.id)
                    logger.info(
                        f"Finalized season {season.id} with {len(awards)} award(s)"
                    )
                except Exception as e:
                    logger.error(
                        f"Error finalizing season {season.id}: {e}",
                        exc_info=True,
                    )
                    await session.rollback()


# Global singleton
_finalization_service = SeasonFinalizationService()


def get_season_finalization_service() -> SeasonFinalizationService:
    """Get the global season finalization service instance."""
    return _finalization_service
