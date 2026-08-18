"""
Stats calculation queue system with deduplication.

Handles async stats calculation jobs with a database-backed queue that:
- Deduplicates concurrent requests
- Persists across server restarts
- Tracks job status
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Optional, Dict, Callable, Awaitable, Coroutine, Set
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from backend.utils.datetime_utils import utcnow
from sqlalchemy import select, update, and_, or_, func
from backend.database.models import StatsCalculationJob, StatsCalculationJobStatus
from backend.database import db

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ClaimedStatsJob:
    id: int
    claim_token: str
    calc_type: str
    league_id: Optional[int]


class StatsCalculationQueue:
    """Database-backed queue for stats calculation jobs."""

    def __init__(self, *, lease_seconds: float = 300, retry_seconds: float = 5):
        self._worker_task: Optional[asyncio.Task] = None
        self._running = False
        self._stop_event = asyncio.Event()
        # Strong references to in-flight calculation tasks. Keeping them prevents
        # the event loop from garbage-collecting a task mid-execution (see the
        # asyncio.create_task docs) and lets drain() await/cancel outstanding work
        # at shutdown — and, in tests, between cases so a detached calculation can
        # never hold a DB connection/lock into the next test.
        self._background_tasks: Set[asyncio.Task] = set()
        self._global_calc_callback: Optional[Callable[[AsyncSession], Awaitable[Dict]]] = None
        self._league_calc_callback: Optional[Callable[[AsyncSession, int], Awaitable[Dict]]] = None
        self._lease_seconds = lease_seconds
        self._retry_seconds = retry_seconds

    def _spawn(self, coro: Coroutine) -> asyncio.Task:
        """Spawn a tracked background task.

        Replaces bare ``asyncio.create_task``: the returned task is retained in
        ``_background_tasks`` until it completes, so it cannot be dropped mid-run
        and can be drained deterministically. The done-callback removes the task
        from the set once it finishes.
        """
        task = asyncio.create_task(coro)
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)
        return task

    async def enqueue_calculation(
        self, session: AsyncSession, calc_type: str, league_id: Optional[int] = None
    ) -> int:
        """
        Enqueue a stats calculation job.

        Deduplication logic:
        - If same (calc_type, league_id) already pending/running, return existing job_id
        - If a calculation is running, queue every distinct calculation target
        - Otherwise, start immediately or queue as pending

        Args:
            session: Database session
            calc_type: 'global' or 'league'
            league_id: Optional league ID for league calculations

        Returns:
            Job ID
        """
        # Check for existing pending/running job of same type
        existing = await self._find_existing_job(session, calc_type, league_id)
        if existing and existing.status in [
            StatsCalculationJobStatus.PENDING,
            StatsCalculationJobStatus.RUNNING,
        ]:
            return existing.id

        # Check if any calculation is currently running
        running_job = await self._get_running_job(session)
        if running_job:
            # A same-target pending job may not have been returned by
            # _find_existing_job if a newer terminal job exists, so retain this
            # explicit check before creating another pending job.
            queued = await self._find_queued_job(session, calc_type, league_id)
            if queued:
                return queued.id

            # Never alias a distinct request to an unrelated pending job. The
            # worker remains serial and will process each target in creation
            # order, while repeated requests for this target deduplicate above.
            return await self._create_pending_job(session, calc_type, league_id)
        else:
            # No calculation running, claim and start immediately.
            now = utcnow()
            claim_token = str(uuid4())
            job = StatsCalculationJob(
                calc_type=calc_type,
                league_id=league_id,
                status=StatsCalculationJobStatus.RUNNING,
                started_at=now,
                available_at=now,
                lease_expires_at=now + timedelta(seconds=self._lease_seconds),
                claim_token=claim_token,
                attempts=1,
            )
            session.add(job)
            await session.commit()
            await session.refresh(job)

            # Start async task to run calculation (tracked so it can be drained)
            self._spawn(self._run_calculation(job.id, claim_token))
            return job.id

    async def stage_calculation(
        self, session: AsyncSession, calc_type: str, league_id: Optional[int] = None
    ) -> int:
        """Persist a pending calculation inside the caller's transaction.

        This is the outbox-style path for destructive writes: the mutation and
        its required recalculation commit atomically. The background worker
        discovers the pending row after commit and retries polling across
        process restarts. A pending job for the same target is reused, while a
        running job gets a follow-up pending job so the new write is not lost.
        """
        await self._acquire_stage_lock(session, calc_type, league_id)
        queued = await self._find_queued_job(session, calc_type, league_id, for_update=True)
        if queued:
            return queued.id

        job = StatsCalculationJob(
            calc_type=calc_type,
            league_id=league_id,
            status=StatsCalculationJobStatus.PENDING,
        )
        session.add(job)
        await session.flush()
        return job.id

    @staticmethod
    async def _acquire_stage_lock(
        session: AsyncSession, calc_type: str, league_id: Optional[int]
    ) -> None:
        """Serialize transactional staging for one target in PostgreSQL.

        The advisory lock closes the no-existing-row race without adding a
        migration. SQLite ignores this production concurrency guard in tests.
        """
        if session.get_bind().dialect.name != "postgresql":
            return

        # Two-int advisory locks keep the queue namespace separate while using
        # target 0 for global and positive league IDs for league calculations.
        target = 0 if calc_type == "global" else league_id
        if target is None:
            raise ValueError("league_id required for league calculation")
        await session.execute(select(func.pg_advisory_xact_lock(1_397_907_796, target)))

    async def _find_existing_job(
        self, session: AsyncSession, calc_type: str, league_id: Optional[int]
    ) -> Optional[StatsCalculationJob]:
        """Find existing job with same calc_type and league_id."""
        conditions = [StatsCalculationJob.calc_type == calc_type]
        if league_id is None:
            conditions.append(StatsCalculationJob.league_id.is_(None))
        else:
            conditions.append(StatsCalculationJob.league_id == league_id)

        result = await session.execute(
            select(StatsCalculationJob)
            .where(and_(*conditions))
            .order_by(StatsCalculationJob.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_running_job(self, session: AsyncSession) -> Optional[StatsCalculationJob]:
        """Get currently running job if any."""
        result = await session.execute(
            select(StatsCalculationJob)
            .where(StatsCalculationJob.status == StatsCalculationJobStatus.RUNNING)
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _find_queued_job(
        self,
        session: AsyncSession,
        calc_type: str,
        league_id: Optional[int],
        *,
        for_update: bool = False,
    ) -> Optional[StatsCalculationJob]:
        """Find queued job with same calc_type and league_id."""
        conditions = [
            StatsCalculationJob.status == StatsCalculationJobStatus.PENDING,
            StatsCalculationJob.calc_type == calc_type,
        ]
        if league_id is None:
            conditions.append(StatsCalculationJob.league_id.is_(None))
        else:
            conditions.append(StatsCalculationJob.league_id == league_id)

        query = select(StatsCalculationJob).where(and_(*conditions)).limit(1)
        if for_update:
            # Holding this row lock through the caller's commit ensures a worker
            # cannot consume a reused pending job before the paired write lands.
            query = query.with_for_update()
        result = await session.execute(query)
        return result.scalar_one_or_none()

    async def _get_first_queued_job(self, session: AsyncSession) -> Optional[StatsCalculationJob]:
        """Get first pending job."""
        result = await session.execute(
            select(StatsCalculationJob)
            .where(StatsCalculationJob.status == StatsCalculationJobStatus.PENDING)
            .order_by(StatsCalculationJob.created_at.asc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _create_pending_job(
        self, session: AsyncSession, calc_type: str, league_id: Optional[int]
    ) -> int:
        """Create a pending job and return its ID."""
        job = StatsCalculationJob(
            calc_type=calc_type, league_id=league_id, status=StatsCalculationJobStatus.PENDING
        )
        session.add(job)
        await session.commit()
        await session.refresh(job)
        return job.id

    @staticmethod
    def _claimable(now):
        return or_(
            and_(
                StatsCalculationJob.status == StatsCalculationJobStatus.PENDING,
                StatsCalculationJob.available_at <= now,
            ),
            and_(
                StatsCalculationJob.status == StatsCalculationJobStatus.RUNNING,
                StatsCalculationJob.lease_expires_at.is_not(None),
                StatsCalculationJob.lease_expires_at <= now,
            ),
        )

    async def claim_next_job(
        self, session: AsyncSession, *, now=None
    ) -> Optional[ClaimedStatsJob]:
        """Exclusively claim one available or stale job.

        PostgreSQL workers skip rows locked by another claimant. The guarded
        update is a compare-and-swap fallback for databases where row-level
        ``FOR UPDATE`` is unavailable, so only one worker receives ownership.
        """
        claimed_at = now or utcnow()
        claimable = self._claimable(claimed_at)
        result = await session.execute(
            select(
                StatsCalculationJob.id,
                StatsCalculationJob.calc_type,
                StatsCalculationJob.league_id,
            )
            .where(claimable)
            .order_by(StatsCalculationJob.available_at.asc(), StatsCalculationJob.id.asc())
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        candidate = result.one_or_none()
        if candidate is None:
            await session.rollback()
            return None

        claim_token = str(uuid4())
        claimed = await session.execute(
            update(StatsCalculationJob)
            .where(StatsCalculationJob.id == candidate.id, self._claimable(claimed_at))
            .values(
                status=StatsCalculationJobStatus.RUNNING,
                started_at=claimed_at,
                completed_at=None,
                claim_token=claim_token,
                lease_expires_at=claimed_at + timedelta(seconds=self._lease_seconds),
                attempts=StatsCalculationJob.attempts + 1,
            )
        )
        if claimed.rowcount != 1:
            await session.rollback()
            return None
        await session.commit()
        return ClaimedStatsJob(
            id=candidate.id,
            claim_token=claim_token,
            calc_type=candidate.calc_type,
            league_id=candidate.league_id,
        )

    @staticmethod
    def _owned_claim(job_id: int, claim_token: Optional[str]):
        token_condition = (
            StatsCalculationJob.claim_token.is_(None)
            if claim_token is None
            else StatsCalculationJob.claim_token == claim_token
        )
        return and_(
            StatsCalculationJob.id == job_id,
            StatsCalculationJob.status == StatsCalculationJobStatus.RUNNING,
            token_condition,
        )

    async def _renew_lease(self, job_id: int, claim_token: str) -> None:
        interval = max(0.1, self._lease_seconds / 3)
        while True:
            await asyncio.sleep(interval)
            session = db.AsyncSessionLocal()
            try:
                try:
                    renewed = await session.execute(
                        update(StatsCalculationJob)
                        .where(self._owned_claim(job_id, claim_token))
                        .values(lease_expires_at=utcnow() + timedelta(seconds=self._lease_seconds))
                    )
                    await session.commit()
                    if renewed.rowcount != 1:
                        return
                except Exception:
                    await session.rollback()
                    logger.exception("Unable to renew stats job %s lease", job_id)
            finally:
                await session.close()

    async def _release_for_retry(
        self,
        session: AsyncSession,
        job_id: int,
        claim_token: Optional[str],
        error: BaseException,
        *,
        immediate: bool,
    ) -> None:
        retry_at = utcnow() + timedelta(seconds=0 if immediate else self._retry_seconds)
        await session.execute(
            update(StatsCalculationJob)
            .where(self._owned_claim(job_id, claim_token))
            .values(
                status=StatsCalculationJobStatus.PENDING,
                available_at=retry_at,
                claim_token=None,
                lease_expires_at=None,
                completed_at=None,
                error_message=str(error),
            )
        )
        await session.commit()

    def register_calculation_callbacks(
        self,
        global_calc_callback: Callable[[AsyncSession], Awaitable[Dict]],
        league_calc_callback: Callable[[AsyncSession, int], Awaitable[Dict]],
    ) -> None:
        """
        Register callbacks for stats calculation functions.

        This method must be called before any calculations can be executed.
        Typically called during application startup.

        Args:
            global_calc_callback: Async function that takes a session and calculates global stats
            league_calc_callback: Async function that takes a session and league_id and calculates league stats

        Raises:
            TypeError: If callbacks are not callable
        """
        if not callable(global_calc_callback):
            raise TypeError("global_calc_callback must be callable")
        if not callable(league_calc_callback):
            raise TypeError("league_calc_callback must be callable")

        # Allow re-registration (useful for testing), but log a warning
        if self._global_calc_callback is not None or self._league_calc_callback is not None:
            logger.warning(
                "Re-registering calculation callbacks (previous callbacks will be replaced)"
            )

        self._global_calc_callback = global_calc_callback
        self._league_calc_callback = league_calc_callback
        logger.info("Stats calculation callbacks registered successfully")

    async def _run_calculation(self, job_id: int, claim_token: Optional[str] = None) -> None:
        """Run an exclusively claimed calculation and retain retry ownership."""
        session = db.AsyncSessionLocal()
        heartbeat: Optional[asyncio.Task] = None
        try:
            result = await session.execute(
                select(StatsCalculationJob).where(StatsCalculationJob.id == job_id)
            )
            job = result.scalar_one_or_none()
            if not job:
                return
            effective_token = claim_token if claim_token is not None else job.claim_token
            if job.status != StatsCalculationJobStatus.RUNNING:
                return
            if claim_token is not None and job.claim_token != claim_token:
                return
            if effective_token is not None:
                heartbeat = asyncio.create_task(self._renew_lease(job_id, effective_token))

            try:
                if self._global_calc_callback is None or self._league_calc_callback is None:
                    raise RuntimeError(
                        "Calculation callbacks not registered. "
                        "Call register_calculation_callbacks() before starting the queue worker."
                    )
                if job.calc_type == "global":
                    await self._global_calc_callback(session)
                elif job.calc_type == "league":
                    if not job.league_id:
                        raise ValueError("league_id required for league calculation")
                    await self._league_calc_callback(session, job.league_id)
                else:
                    raise ValueError(f"Unknown calc_type: {job.calc_type}")

                await session.execute(
                    update(StatsCalculationJob)
                    .where(self._owned_claim(job_id, effective_token))
                    .values(
                        status=StatsCalculationJobStatus.COMPLETED,
                        completed_at=utcnow(),
                        claim_token=None,
                        lease_expires_at=None,
                        error_message=None,
                    )
                )
                await session.commit()
            except asyncio.CancelledError as error:
                await session.rollback()
                await self._release_for_retry(
                    session,
                    job_id,
                    effective_token,
                    error,
                    immediate=True,
                )
                raise
            except Exception as error:
                await session.rollback()
                await self._release_for_retry(
                    session,
                    job_id,
                    effective_token,
                    error,
                    immediate=False,
                )
                raise
        finally:
            if heartbeat is not None:
                heartbeat.cancel()
                try:
                    await heartbeat
                except asyncio.CancelledError:
                    pass
            await session.close()

    async def _process_queue_worker(self) -> None:
        """Background worker that processes pending jobs."""
        while not self._stop_event.is_set():
            try:
                session = db.AsyncSessionLocal()
                try:
                    claimed = await self.claim_next_job(session)
                    if claimed:
                        await session.close()
                        await self._run_calculation(claimed.id, claimed.claim_token)
                    else:
                        # No pending jobs, wait a bit
                        await session.close()
                        await asyncio.sleep(1)
                except Exception as e:
                    try:
                        await session.rollback()
                    except Exception:
                        pass
                    try:
                        await session.close()
                    except Exception:
                        pass
                    # Log error and continue (don't raise)
                    logger.error(f"Error in queue worker: {e}")
                    await asyncio.sleep(5)
            except Exception as e:
                # Log error and continue
                logger.error(f"Error in queue worker (outer): {e}")
                await asyncio.sleep(5)

    @staticmethod
    def _job_summary(job: StatsCalculationJob, **extra: object) -> Dict:
        """Build the shared id/calc_type/league_id fields for a queue-status entry.

        ``extra`` supplies the section-specific fields (e.g. ``started_at``,
        ``created_at``, ``completed_at``, ``error_message``) that differ
        between the running/pending/recent_completed/recent_failed sections
        of ``get_queue_status``, keeping the shared shape defined once.
        """
        return {
            "id": job.id,
            "calc_type": job.calc_type,
            "league_id": job.league_id,
            **extra,
        }

    async def get_queue_status(self, session: AsyncSession) -> Dict:
        """Get current queue status."""
        # Get running job
        running = await self._get_running_job(session)

        # Get pending jobs
        result = await session.execute(
            select(StatsCalculationJob)
            .where(StatsCalculationJob.status == StatsCalculationJobStatus.PENDING)
            .order_by(StatsCalculationJob.created_at.asc())
        )
        pending = result.scalars().all()

        # Get recent completed jobs (last 10)
        result = await session.execute(
            select(StatsCalculationJob)
            .where(StatsCalculationJob.status == StatsCalculationJobStatus.COMPLETED)
            .order_by(StatsCalculationJob.completed_at.desc())
            .limit(10)
        )
        recent_completed = result.scalars().all()

        # Get recent failed jobs (last 10)
        result = await session.execute(
            select(StatsCalculationJob)
            .where(StatsCalculationJob.status == StatsCalculationJobStatus.FAILED)
            .order_by(StatsCalculationJob.completed_at.desc())
            .limit(10)
        )
        recent_failed = result.scalars().all()

        return {
            "running": (
                self._job_summary(
                    running,
                    started_at=running.started_at.isoformat() if running.started_at else None,
                )
                if running
                else None
            ),
            "pending": [
                self._job_summary(j, created_at=j.created_at.isoformat() if j.created_at else None)
                for j in pending
            ],
            "recent_completed": [
                self._job_summary(
                    j, completed_at=j.completed_at.isoformat() if j.completed_at else None
                )
                for j in recent_completed
            ],
            "recent_failed": [
                self._job_summary(
                    j,
                    error_message=j.error_message,
                    completed_at=j.completed_at.isoformat() if j.completed_at else None,
                )
                for j in recent_failed
            ],
        }

    async def get_job_status(self, session: AsyncSession, job_id: int) -> Optional[Dict]:
        """Get status of a specific job."""
        result = await session.execute(
            select(StatsCalculationJob).where(StatsCalculationJob.id == job_id)
        )
        job = result.scalar_one_or_none()
        if not job:
            return None

        return {
            "id": job.id,
            "calc_type": job.calc_type,
            "league_id": job.league_id,
            "status": job.status.value,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
            "error_message": job.error_message,
        }

    def start_background_worker(self) -> None:
        """Start the background worker."""
        if self._worker_task is None or self._worker_task.done():
            self._stop_event.clear()
            self._worker_task = asyncio.create_task(self._process_queue_worker())

    def stop_background_worker(self) -> None:
        """Stop the background worker."""
        self._stop_event.set()
        if self._worker_task and not self._worker_task.done():
            self._worker_task.cancel()

    async def drain(self, *, cancel: bool = True) -> None:
        """Await (or cancel) all in-flight background work.

        Used for graceful shutdown and — critically — between tests: a detached
        calculation task that outlives its test would otherwise keep a DB
        connection open, holding a lock that deadlocks the next test's TRUNCATE.
        Draining here guarantees no background task crosses a test boundary.

        Args:
            cancel: When True (default), cancel outstanding tasks rather than
                waiting for them to finish naturally. Set False to let them run
                to completion (e.g. a real graceful shutdown).
        """
        # Stop the worker first so it cannot spawn new jobs while we drain.
        self.stop_background_worker()

        tasks = list(self._background_tasks)
        if self._worker_task is not None:
            tasks.append(self._worker_task)

        if cancel:
            for task in tasks:
                if not task.done():
                    task.cancel()

        for task in tasks:
            try:
                await task
            except (asyncio.CancelledError, Exception):
                # Draining must never raise: a failed or cancelled background job
                # must not break shutdown or leak into the next test's setup.
                pass

        self._background_tasks.clear()
        self._worker_task = None


# Global queue instance
_stats_queue = StatsCalculationQueue()


def get_stats_queue() -> StatsCalculationQueue:
    """Get the global stats queue instance."""
    return _stats_queue
