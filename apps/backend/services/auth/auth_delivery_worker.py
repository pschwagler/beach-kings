"""Durable email/SMS verification-code delivery worker."""

from __future__ import annotations

import asyncio
import logging
import os
from collections import Counter
from datetime import datetime, timedelta

from sqlalchemy import delete, exists, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import AuthDeliveryJob, VerificationCode
from backend.services import auth_service, email_service
from backend.services.auth import auth_delivery_service
from backend.utils.datetime_utils import utcnow


logger = logging.getLogger(__name__)
TERMINAL_STATUSES = frozenset({"delivered", "failed", "canceled"})
RETRY_DELAYS_SECONDS = (5, 20, 60, 180)


async def recover_stale_claims(session: AsyncSession, stale_minutes: int = 2) -> int:
    result = await session.execute(
        update(AuthDeliveryJob)
        .where(
            AuthDeliveryJob.status == "processing",
            AuthDeliveryJob.claimed_at < utcnow() - timedelta(minutes=stale_minutes),
        )
        .values(
            status="pending",
            claimed_at=None,
            available_at=utcnow(),
            last_error_code="stale_claim_recovered",
        )
        .returning(AuthDeliveryJob.id)
    )
    return len(result.scalars().all())


async def claim_jobs(session: AsyncSession, limit: int = 25) -> list[AuthDeliveryJob]:
    jobs = list(
        (
            await session.execute(
                select(AuthDeliveryJob)
                .where(
                    AuthDeliveryJob.status == "pending",
                    AuthDeliveryJob.available_at <= utcnow(),
                )
                .order_by(AuthDeliveryJob.created_at.asc())
                .with_for_update(skip_locked=True)
                .limit(limit)
            )
        ).scalars()
    )
    for job in jobs:
        job.status = "processing"
        job.claimed_at = utcnow()
        job.attempts += 1
    await session.flush()
    return jobs


def _expired(code: VerificationCode) -> bool:
    try:
        return datetime.fromisoformat(code.expires_at) <= utcnow()
    except (TypeError, ValueError):
        return True


def _finish(job: AuthDeliveryJob, status: str, error_code: str | None = None) -> None:
    job.status = status
    job.claimed_at = None
    job.completed_at = utcnow() if status in TERMINAL_STATUSES else None
    job.last_error_code = error_code


def _retry_or_fail(job: AuthDeliveryJob) -> None:
    max_attempts = max(1, int(os.getenv("AUTH_DELIVERY_MAX_ATTEMPTS", "5")))
    if job.attempts >= max_attempts:
        _finish(job, "failed", "provider_unavailable")
        return
    job.status = "pending"
    job.claimed_at = None
    job.last_error_code = "provider_unavailable"
    delay_index = min(job.attempts - 1, len(RETRY_DELAYS_SECONDS) - 1)
    job.available_at = utcnow() + timedelta(seconds=RETRY_DELAYS_SECONDS[delay_index])


async def process_job(session: AsyncSession, job: AuthDeliveryJob) -> str:
    if job.verification_code_id is None:
        _finish(job, "canceled", "no_delivery_required")
        return "canceled"
    code = await session.get(VerificationCode, job.verification_code_id)
    if code is None:
        _finish(job, "canceled", "code_missing")
        return "canceled"
    if code.used or _expired(code):
        _finish(job, "canceled", "code_unavailable")
        return "canceled"

    sent = False
    try:
        if job.channel == "sms" and code.phone_number:
            sent = await auth_service.send_sms_verification(session, code.phone_number, code.code)
        elif job.channel == "email" and code.email:
            sender = (
                email_service.send_password_reset_code_email
                if job.purpose == "password_reset"
                else email_service.send_verification_code_email
            )
            sent = await sender(
                code.email,
                code.code,
                session=session,
                idempotency_key=job.idempotency_key,
            )
        else:
            _finish(job, "canceled", "invalid_delivery_target")
            return "canceled"
    except Exception:
        logger.warning(
            "auth_delivery_provider_failed channel=%s purpose=%s error_code=provider_exception",
            job.channel,
            job.purpose,
        )
    if sent:
        _finish(job, "delivered")
        return "delivered"
    _retry_or_fail(job)
    return "retried" if job.status == "pending" else "failed"


async def purge_old_data(session: AsyncSession) -> tuple[int, int]:
    now = utcnow()
    jobs = await session.execute(
        delete(AuthDeliveryJob).where(
            or_(
                AuthDeliveryJob.status.in_(["delivered", "canceled"])
                & (AuthDeliveryJob.updated_at < now - timedelta(days=1)),
                (AuthDeliveryJob.status == "failed")
                & (AuthDeliveryJob.updated_at < now - timedelta(days=7)),
            )
        )
    )
    codes = await session.execute(
        delete(VerificationCode).where(
            VerificationCode.expires_at < now.isoformat(),
            ~exists().where(AuthDeliveryJob.verification_code_id == VerificationCode.id),
        )
    )
    return jobs.rowcount, codes.rowcount


async def run_once(session: AsyncSession) -> Counter:
    counts: Counter = Counter()
    counts["stale_recovered"] = await recover_stale_claims(session)
    purged_jobs, purged_codes = await purge_old_data(session)
    counts["purged"] = purged_jobs + purged_codes
    for job in await claim_jobs(session):
        counts[await process_job(session, job)] += 1
    return counts


async def run_forever(session_factory) -> None:
    while True:
        if not auth_delivery_service.delivery_enabled():
            await asyncio.sleep(10)
            continue
        counts: Counter = Counter()
        async with session_factory() as session:
            try:
                counts = await run_once(session)
                await session.commit()
                await auth_delivery_service.publish_heartbeat()
            except Exception as exc:
                await session.rollback()
                logger.error("auth_delivery_batch_failed error_code=%s", type(exc).__name__)
        await asyncio.sleep(0.25 if sum(counts.values()) else 1)
