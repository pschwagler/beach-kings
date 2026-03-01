"""
Account deletion service — executes deferred account deletions.

Background worker that polls every hour. Users whose deletion_scheduled_at
has passed are permanently anonymized via user_service.execute_account_deletion.
"""

import asyncio
import logging
from typing import Optional

from sqlalchemy import select

from backend.database import db
from backend.database.models import User
from backend.utils.datetime_utils import utcnow

logger = logging.getLogger(__name__)

# How often the worker checks for expired accounts (seconds)
POLL_INTERVAL_SECONDS = 3600  # 1 hour


class AccountDeletionService:
    """Background service that executes expired account deletions."""

    def __init__(self):
        self._worker_task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()

    def start(self) -> None:
        """Start the background deletion worker."""
        if self._worker_task is None or self._worker_task.done():
            self._stop_event.clear()
            self._worker_task = asyncio.create_task(self._poll_loop())
            logger.info("Account deletion worker started")

    def stop(self) -> None:
        """Stop the background deletion worker."""
        self._stop_event.set()
        if self._worker_task and not self._worker_task.done():
            self._worker_task.cancel()
            logger.info("Account deletion worker stopped")

    async def _poll_loop(self) -> None:
        """Main loop: sleep, then process expired deletions. Repeats until stopped."""
        while not self._stop_event.is_set():
            try:
                await self._process_expired_deletions()
            except Exception as e:
                logger.error(f"Error in account deletion worker: {e}", exc_info=True)

            # Wait for poll interval or until stop is signalled
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=POLL_INTERVAL_SECONDS)
                break  # stop_event was set
            except asyncio.TimeoutError:
                pass  # interval elapsed, loop again

    async def _process_expired_deletions(self) -> None:
        """Find and execute all expired account deletions.

        Uses a separate session per user to ensure proper transaction isolation —
        a failure deleting one account does not affect others.
        """
        from backend.services import user_service

        # Query phase: find all expired user IDs
        async with db.AsyncSessionLocal() as session:
            now = utcnow()
            result = await session.execute(
                select(User.id).where(
                    User.deletion_scheduled_at.isnot(None),
                    User.deletion_scheduled_at <= now,
                )
            )
            user_ids = [row[0] for row in result.all()]

        if not user_ids:
            return

        logger.info(f"Found {len(user_ids)} account(s) to delete")

        # Deletion phase: one session per user for clean isolation
        for uid in user_ids:
            try:
                async with db.AsyncSessionLocal() as session:
                    await user_service.execute_account_deletion(session, uid)
            except Exception as e:
                logger.error(f"Error deleting account {uid}: {e}", exc_info=True)


# Global singleton
_deletion_service = AccountDeletionService()


def get_account_deletion_service() -> AccountDeletionService:
    """Get the global account deletion service instance."""
    return _deletion_service
