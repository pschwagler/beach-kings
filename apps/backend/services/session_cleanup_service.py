"""
Session cleanup service — auto-submits or deletes stale ACTIVE sessions.

Background worker that polls every 5 minutes. Sessions inactive for 12+ hours
are auto-submitted (if they have matches) or auto-deleted (if empty).
The session creator is notified in either case.
"""

import asyncio
import logging
from datetime import timedelta
from typing import Optional

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import db
from backend.database.models import (
    Session,
    SessionStatus,
    Match,
    Player,
    NotificationType,
    Season,
)
from backend.utils.datetime_utils import utcnow

logger = logging.getLogger(__name__)

# Stale threshold: sessions inactive longer than this are cleaned up
STALE_THRESHOLD_HOURS = 12

# How often the worker checks for stale sessions (seconds)
POLL_INTERVAL_SECONDS = 300  # 5 minutes


class SessionCleanupService:
    """Background service that cleans up stale ACTIVE sessions."""

    def __init__(self):
        self._worker_task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()

    def start(self) -> None:
        """Start the background cleanup worker."""
        if self._worker_task is None or self._worker_task.done():
            self._stop_event.clear()
            self._worker_task = asyncio.create_task(self._poll_loop())
            logger.info("Session cleanup worker started")

    def stop(self) -> None:
        """Stop the background cleanup worker."""
        self._stop_event.set()
        if self._worker_task and not self._worker_task.done():
            self._worker_task.cancel()
            logger.info("Session cleanup worker stopped")

    async def _poll_loop(self) -> None:
        """Main loop: sleep, then process stale sessions. Repeats until stopped."""
        while not self._stop_event.is_set():
            try:
                await self._process_stale_sessions()
            except Exception as e:
                logger.error(f"Error in session cleanup worker: {e}", exc_info=True)

            # Wait for poll interval or until stop is signalled
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(), timeout=POLL_INTERVAL_SECONDS
                )
                # If wait_for returns normally, stop_event was set → exit
                break
            except asyncio.TimeoutError:
                # Timeout means interval elapsed, loop again
                pass

    async def _process_stale_sessions(self) -> None:
        """Find and process all stale ACTIVE sessions."""
        async with db.AsyncSessionLocal() as session:
            cutoff = utcnow() - timedelta(hours=STALE_THRESHOLD_HOURS)

            result = await session.execute(
                select(Session).where(
                    and_(
                        Session.status == SessionStatus.ACTIVE,
                        Session.updated_at < cutoff,
                    )
                )
            )
            stale_sessions = result.scalars().all()

            if not stale_sessions:
                return

            logger.info(f"Found {len(stale_sessions)} stale session(s) to clean up")

            for stale in stale_sessions:
                try:
                    await self._handle_stale_session(session, stale)
                except Exception as e:
                    logger.error(
                        f"Error cleaning up session {stale.id}: {e}", exc_info=True
                    )
                    await session.rollback()

    async def _handle_stale_session(
        self, session: AsyncSession, stale_session: Session
    ) -> None:
        """
        Auto-submit or auto-delete a single stale session, then notify the creator.

        Args:
            session: Database session
            stale_session: The stale Session ORM object
        """
        session_id = stale_session.id
        created_by = stale_session.created_by
        session_name = stale_session.name
        season_id = stale_session.season_id

        # Count matches in this session
        match_count_result = await session.execute(
            select(func.count()).select_from(Match).where(Match.session_id == session_id)
        )
        match_count = match_count_result.scalar() or 0

        # Resolve league_id for notification links
        league_id = None
        if season_id:
            season_result = await session.execute(
                select(Season.league_id).where(Season.id == season_id)
            )
            league_id = season_result.scalar_one_or_none()

        if match_count > 0:
            await self._auto_submit(session, session_id, session_name, match_count)
            await self._notify_creator(
                session,
                created_by=created_by,
                session_name=session_name,
                action="submitted",
                league_id=league_id,
                match_count=match_count,
            )
        else:
            await self._auto_delete(session, session_id, session_name)
            await self._notify_creator(
                session,
                created_by=created_by,
                session_name=session_name,
                action="deleted",
                league_id=league_id,
                match_count=0,
            )

        # Commit notification (create_notification only flushes)
        await session.commit()

    async def _auto_submit(
        self,
        session: AsyncSession,
        session_id: int,
        session_name: str,
        match_count: int,
    ) -> None:
        """Auto-submit a stale session that has matches."""
        from backend.services.data_service import lock_in_session

        result = await lock_in_session(session, session_id, updated_by=None)
        if result:
            logger.info(
                f"Auto-submitted session {session_id} ({session_name!r}) "
                f"with {match_count} match(es)"
            )
        else:
            logger.warning(f"Failed to auto-submit session {session_id}")

    async def _auto_delete(
        self, session: AsyncSession, session_id: int, session_name: str
    ) -> None:
        """Auto-delete a stale session that has no matches."""
        from backend.services.data_service import delete_session

        deleted = await delete_session(session, session_id)
        if deleted:
            logger.info(
                f"Auto-deleted empty session {session_id} ({session_name!r})"
            )
        else:
            logger.warning(f"Failed to auto-delete session {session_id}")

    async def _notify_creator(
        self,
        session: AsyncSession,
        created_by: Optional[int],
        session_name: str,
        action: str,
        league_id: Optional[int],
        match_count: int,
    ) -> None:
        """
        Send a notification to the session creator about the auto-action.

        Args:
            session: Database session
            created_by: Player ID of the session creator (may be None)
            session_name: Name of the session
            action: "submitted" or "deleted"
            league_id: League ID if this was a league session (for link)
            match_count: Number of matches in the session
        """
        if not created_by:
            return

        # Look up the creator's user_id from their player record
        user_result = await session.execute(
            select(Player.user_id).where(Player.id == created_by)
        )
        user_id = user_result.scalar_one_or_none()
        if not user_id:
            return

        from backend.services.notification_service import create_notification

        if action == "submitted":
            notif_type = NotificationType.SESSION_AUTO_SUBMITTED.value
            title = "Session auto-submitted"
            message = (
                f'Your session "{session_name}" was automatically submitted '
                f"after 12 hours of inactivity ({match_count} match{'es' if match_count != 1 else ''} recorded)."
            )
            link_url = (
                f"/league/{league_id}?tab=games" if league_id else "/home"
            )
        else:
            notif_type = NotificationType.SESSION_AUTO_DELETED.value
            title = "Session auto-deleted"
            message = (
                f'Your empty session "{session_name}" was automatically deleted '
                f"after 12 hours of inactivity."
            )
            link_url = "/home"

        try:
            await create_notification(
                session=session,
                user_id=user_id,
                type=notif_type,
                title=title,
                message=message,
                data={"league_id": league_id} if league_id else None,
                link_url=link_url,
            )
        except Exception as e:
            logger.warning(
                f"Failed to notify creator (player {created_by}) about "
                f"session auto-{action}: {e}"
            )


# Global singleton
_cleanup_service = SessionCleanupService()


def get_session_cleanup_service() -> SessionCleanupService:
    """Get the global session cleanup service instance."""
    return _cleanup_service
