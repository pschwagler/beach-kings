"""
Stats calculation queue system with deduplication.

Handles async stats calculation jobs with a database-backed queue that:
- Deduplicates concurrent requests
- Persists across server restarts
- Tracks job status
"""

import asyncio
import logging
from typing import Optional, Dict, List, Callable, Awaitable
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from backend.utils.datetime_utils import utcnow
from sqlalchemy import select, update, and_, or_
from sqlalchemy.orm import selectinload
from backend.database.models import (
    StatsCalculationJob, StatsCalculationJobStatus, Season
)
from backend.database import db

logger = logging.getLogger(__name__)


class StatsCalculationQueue:
    """Database-backed queue for stats calculation jobs."""
    
    def __init__(self):
        self._worker_task: Optional[asyncio.Task] = None
        self._running = False
        self._stop_event = asyncio.Event()
        self._global_calc_callback: Optional[Callable[[AsyncSession], Awaitable[Dict]]] = None
        self._season_calc_callback: Optional[Callable[[AsyncSession, int], Awaitable[Dict]]] = None
    
    async def enqueue_calculation(
        self, 
        session: AsyncSession, 
        calc_type: str, 
        season_id: Optional[int] = None
    ) -> int:
        """
        Enqueue a stats calculation job.
        
        Deduplication logic:
        - If same (calc_type, season_id) already pending/running, return existing job_id
        - If calculation is running and more than 1 request comes in, only queue 1 additional
        - Otherwise, start immediately or queue as pending
        
        Args:
            session: Database session
            calc_type: 'global' or 'season'
            season_id: Optional season ID for season calculations
            
        Returns:
            Job ID
        """
        # Check for existing pending/running job of same type
        existing = await self._find_existing_job(session, calc_type, season_id)
        if existing and existing.status in [StatsCalculationJobStatus.PENDING, StatsCalculationJobStatus.RUNNING]:
            return existing.id
        
        # Check if any calculation is currently running
        running_job = await self._get_running_job(session)
        if running_job:
            # Check if same type already queued
            queued = await self._find_queued_job(session, calc_type, season_id)
            if queued:
                return queued.id
            
            # Check how many jobs are already queued
            queued_count = await self._count_queued_jobs(session)
            if queued_count == 0:
                # No jobs queued, add this one
                job = StatsCalculationJob(
                    calc_type=calc_type,
                    season_id=season_id,
                    status=StatsCalculationJobStatus.PENDING
                )
                session.add(job)
                await session.commit()
                await session.refresh(job)
                return job.id
            else:
                # Already have one queued, return the first one
                first_queued = await self._get_first_queued_job(session)
                return first_queued.id if first_queued else await self._create_pending_job(session, calc_type, season_id)
        else:
            # No calculation running, start immediately
            job = StatsCalculationJob(
                calc_type=calc_type,
                season_id=season_id,
                status=StatsCalculationJobStatus.RUNNING,
                started_at=utcnow()
            )
            session.add(job)
            await session.commit()
            await session.refresh(job)
            
            # Start async task to run calculation
            asyncio.create_task(self._run_calculation(job.id))
            return job.id
    
    async def _find_existing_job(
        self, 
        session: AsyncSession, 
        calc_type: str, 
        season_id: Optional[int]
    ) -> Optional[StatsCalculationJob]:
        """Find existing job with same calc_type and season_id."""
        conditions = [StatsCalculationJob.calc_type == calc_type]
        if season_id is None:
            conditions.append(StatsCalculationJob.season_id.is_(None))
        else:
            conditions.append(StatsCalculationJob.season_id == season_id)
        
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
        season_id: Optional[int]
    ) -> Optional[StatsCalculationJob]:
        """Find queued job with same calc_type and season_id."""
        conditions = [
            StatsCalculationJob.status == StatsCalculationJobStatus.PENDING,
            StatsCalculationJob.calc_type == calc_type
        ]
        if season_id is None:
            conditions.append(StatsCalculationJob.season_id.is_(None))
        else:
            conditions.append(StatsCalculationJob.season_id == season_id)
        
        result = await session.execute(
            select(StatsCalculationJob)
            .where(and_(*conditions))
            .limit(1)
        )
        return result.scalar_one_or_none()
    
    async def _count_queued_jobs(self, session: AsyncSession) -> int:
        """Count pending jobs."""
        result = await session.execute(
            select(StatsCalculationJob)
            .where(StatsCalculationJob.status == StatsCalculationJobStatus.PENDING)
        )
        jobs = result.scalars().all()
        return len(jobs)
    
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
        self, 
        session: AsyncSession, 
        calc_type: str, 
        season_id: Optional[int]
    ) -> int:
        """Create a pending job and return its ID."""
        job = StatsCalculationJob(
            calc_type=calc_type,
            season_id=season_id,
            status=StatsCalculationJobStatus.PENDING
        )
        session.add(job)
        await session.commit()
        await session.refresh(job)
        return job.id
    
    def register_calculation_callbacks(
        self,
        global_calc_callback: Callable[[AsyncSession], Awaitable[Dict]],
        season_calc_callback: Callable[[AsyncSession, int], Awaitable[Dict]]
    ) -> None:
        """
        Register callbacks for stats calculation functions.
        
        This method must be called before any calculations can be executed.
        Typically called during application startup.
        
        Args:
            global_calc_callback: Async function that takes a session and calculates global stats
            season_calc_callback: Async function that takes a session and season_id and calculates season stats
            
        Raises:
            TypeError: If callbacks are not callable
        """
        if not callable(global_calc_callback):
            raise TypeError("global_calc_callback must be callable")
        if not callable(season_calc_callback):
            raise TypeError("season_calc_callback must be callable")
        
        # Allow re-registration (useful for testing), but log a warning
        if self._global_calc_callback is not None or self._season_calc_callback is not None:
            logger.warning("Re-registering calculation callbacks (previous callbacks will be replaced)")
        
        self._global_calc_callback = global_calc_callback
        self._season_calc_callback = season_calc_callback
        logger.info("Stats calculation callbacks registered successfully")
    
    async def _run_calculation(self, job_id: int) -> None:
        """Run a calculation job."""
        session = db.AsyncSessionLocal()
        try:
            # Get job to verify it exists and get calc_type/season_id
            result = await session.execute(
                select(StatsCalculationJob).where(StatsCalculationJob.id == job_id)
            )
            job = result.scalar_one_or_none()
            if not job:
                return
            
            # Validate callbacks are registered
            if self._global_calc_callback is None or self._season_calc_callback is None:
                raise RuntimeError(
                    "Calculation callbacks not registered. "
                    "Call register_calculation_callbacks() before starting the queue worker."
                )
            
            # Run the calculation
            try:
                if job.calc_type == 'global':
                    await self._global_calc_callback(session)
                elif job.calc_type == 'season':
                    if not job.season_id:
                        raise ValueError("season_id required for season calculation")
                    await self._season_calc_callback(session, job.season_id)
                else:
                    raise ValueError(f"Unknown calc_type: {job.calc_type}")
                
                # Mark as completed
                await session.execute(
                    update(StatsCalculationJob)
                    .where(StatsCalculationJob.id == job_id)
                    .values(
                        status=StatsCalculationJobStatus.COMPLETED,
                        completed_at=utcnow()
                    )
                )
                await session.commit()
                
            except Exception as e:
                # Mark as failed
                await session.execute(
                    update(StatsCalculationJob)
                    .where(StatsCalculationJob.id == job_id)
                    .values(
                        status=StatsCalculationJobStatus.FAILED,
                        completed_at=utcnow(),
                        error_message=str(e)
                    )
                )
                await session.commit()
                raise
        finally:
            await session.close()
    
    async def _process_queue_worker(self) -> None:
        """Background worker that processes pending jobs."""
        while not self._stop_event.is_set():
            try:
                session = db.AsyncSessionLocal()
                try:
                    # Get first pending job
                    job = await self._get_first_queued_job(session)
                    if job:
                        # Mark as running
                        await session.execute(
                            update(StatsCalculationJob)
                            .where(StatsCalculationJob.id == job.id)
                            .values(
                                status=StatsCalculationJobStatus.RUNNING,
                                started_at=utcnow()
                            )
                        )
                        await session.commit()
                        await session.close()
                        
                        # Run calculation (it will create its own session)
                        await self._run_calculation(job.id)
                    else:
                        # No pending jobs, wait a bit
                        await session.close()
                        await asyncio.sleep(1)
                except Exception as e:
                    try:
                        await session.rollback()
                    except:
                        pass
                    try:
                        await session.close()
                    except:
                        pass
                    # Log error and continue (don't raise)
                    print(f"Error in queue worker: {e}")
                    await asyncio.sleep(5)
            except Exception as e:
                # Log error and continue
                print(f"Error in queue worker (outer): {e}")
                await asyncio.sleep(5)
    
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
            "running": {
                "id": running.id,
                "calc_type": running.calc_type,
                "season_id": running.season_id,
                "started_at": running.started_at.isoformat() if running.started_at else None
            } if running else None,
            "pending": [
                {
                    "id": j.id,
                    "calc_type": j.calc_type,
                    "season_id": j.season_id,
                    "created_at": j.created_at.isoformat() if j.created_at else None
                }
                for j in pending
            ],
            "recent_completed": [
                {
                    "id": j.id,
                    "calc_type": j.calc_type,
                    "season_id": j.season_id,
                    "completed_at": j.completed_at.isoformat() if j.completed_at else None
                }
                for j in recent_completed
            ],
            "recent_failed": [
                {
                    "id": j.id,
                    "calc_type": j.calc_type,
                    "season_id": j.season_id,
                    "error_message": j.error_message,
                    "completed_at": j.completed_at.isoformat() if j.completed_at else None
                }
                for j in recent_failed
            ]
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
            "season_id": job.season_id,
            "status": job.status.value,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
            "error_message": job.error_message
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


# Global queue instance
_stats_queue = StatsCalculationQueue()


def get_stats_queue() -> StatsCalculationQueue:
    """Get the global stats queue instance."""
    return _stats_queue

