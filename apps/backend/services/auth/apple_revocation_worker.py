"""Durable worker for Sign in with Apple credential revocation."""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import AppleRevocationJob
from backend.services import apple_token_service
from backend.utils.datetime_utils import utcnow


async def recover_stale_claims(session: AsyncSession, stale_minutes: int = 10) -> int:
    jobs = list(
        (
            await session.execute(
                select(AppleRevocationJob)
                .where(
                    AppleRevocationJob.status == "processing",
                    AppleRevocationJob.claimed_at < utcnow() - timedelta(minutes=stale_minutes),
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


async def claim_batch(session: AsyncSession, limit: int = 100) -> list[AppleRevocationJob]:
    jobs = list(
        (
            await session.execute(
                select(AppleRevocationJob)
                .where(
                    AppleRevocationJob.status == "pending",
                    AppleRevocationJob.available_at <= utcnow(),
                )
                .order_by(AppleRevocationJob.created_at.asc())
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


def mark_retry(job: AppleRevocationJob, error: str) -> None:
    job.status = "pending"
    job.claimed_at = None
    job.last_error = error[:500]
    job.available_at = utcnow() + timedelta(
        seconds=min(24 * 60 * 60, 30 * (2 ** min(max(0, job.attempts - 1), 12)))
    )


async def process_job(session: AsyncSession, job: AppleRevocationJob) -> bool:
    try:
        refresh_token, client_id = apple_token_service.decrypt_refresh_credential(
            job.refresh_token_ciphertext
        )
        await apple_token_service.revoke_refresh_token(refresh_token, client_id)
    except Exception as exc:
        mark_retry(job, str(exc))
        await session.flush()
        return False

    job.status = "completed"
    job.claimed_at = None
    job.completed_at = utcnow()
    job.last_error = None
    job.refresh_token_ciphertext = "revoked"
    await session.flush()
    return True


async def process_pending_jobs(session_factory, limit: int = 100) -> tuple[int, int]:
    async with session_factory() as session:
        await recover_stale_claims(session)
        jobs = await claim_batch(session, limit)
        job_ids = [job.id for job in jobs]
        await session.commit()

    completed = 0
    retried = 0
    for job_id in job_ids:
        async with session_factory() as session:
            job = await session.get(AppleRevocationJob, job_id)
            if job is None or job.status != "processing":
                continue
            if await process_job(session, job):
                completed += 1
            else:
                retried += 1
            await session.commit()
    return completed, retried
