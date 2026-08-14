"""Durable, retrying deletion of S3 objects removed during account deletion."""

import asyncio
import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import MediaDeletionJob
from backend.utils.datetime_utils import utcnow


logger = logging.getLogger(__name__)


async def recover_stale_claims(session: AsyncSession, stale_minutes: int = 10) -> int:
    jobs = list(
        (
            await session.execute(
                select(MediaDeletionJob)
                .where(
                    MediaDeletionJob.status == "processing",
                    MediaDeletionJob.claimed_at < utcnow() - timedelta(minutes=stale_minutes),
                )
                .with_for_update(skip_locked=True)
            )
        ).scalars()
    )
    for job in jobs:
        job.status = "pending"
        job.claimed_at = None
        job.last_error = "stale claim recovered"
    await session.flush()
    return len(jobs)


async def claim_batch(session: AsyncSession, limit: int = 100) -> list[MediaDeletionJob]:
    jobs = list(
        (
            await session.execute(
                select(MediaDeletionJob)
                .where(
                    MediaDeletionJob.status == "pending",
                    MediaDeletionJob.available_at <= utcnow(),
                )
                .order_by(MediaDeletionJob.created_at.asc())
                .with_for_update(skip_locked=True)
                .limit(min(limit, 100))
            )
        ).scalars()
    )
    for job in jobs:
        job.status = "processing"
        job.claimed_at = utcnow()
        job.attempts += 1
    await session.flush()
    return jobs


def mark_retry(job: MediaDeletionJob, error: str) -> None:
    """Retry indefinitely; S3 deletion is idempotent and user media must not be orphaned."""
    job.status = "pending"
    job.claimed_at = None
    job.last_error = error[:500]
    job.available_at = utcnow() + timedelta(
        seconds=min(24 * 60 * 60, 30 * (2 ** min(max(0, job.attempts - 1), 12)))
    )


async def process_job(session: AsyncSession, job: MediaDeletionJob) -> bool:
    from backend.services import s3_service

    try:
        deleted = await asyncio.to_thread(s3_service.delete_file, job.object_key)
    except Exception as exc:
        mark_retry(job, str(exc))
        await session.flush()
        return False

    if not deleted:
        mark_retry(job, "S3 deletion did not succeed")
        await session.flush()
        return False

    job.status = "completed"
    job.claimed_at = None
    job.completed_at = utcnow()
    job.last_error = None
    await session.flush()
    return True


async def process_pending_jobs(session_factory, limit: int = 100) -> tuple[int, int]:
    """Claim a batch, then process each target in an isolated transaction."""
    async with session_factory() as session:
        await recover_stale_claims(session)
        jobs = await claim_batch(session, limit)
        job_ids = [job.id for job in jobs]
        await session.commit()

    completed = 0
    retried = 0
    for job_id in job_ids:
        async with session_factory() as session:
            job = await session.get(MediaDeletionJob, job_id)
            if job is None or job.status != "processing":
                continue
            if await process_job(session, job):
                completed += 1
            else:
                retried += 1
            await session.commit()
    return completed, retried
