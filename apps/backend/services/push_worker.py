"""Durable Expo push worker with ticket and receipt processing."""

import asyncio
import logging
import os
from collections import Counter
from datetime import timedelta
from typing import Any

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import DeviceToken, PushDeliveryJob
from backend.services import interaction_policy, push_prefs_service
from backend.utils.datetime_utils import utcnow


logger = logging.getLogger(__name__)
EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send"
EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"
TERMINAL_STATUSES = frozenset({"delivered", "failed", "canceled"})
PERMANENT_EXPO_ERRORS = frozenset({"MessageTooBig", "InvalidCredentials"})


class ExpoRequestError(RuntimeError):
    def __init__(self, code: str, transient: bool):
        super().__init__(code)
        self.code = code
        self.transient = transient


def delivery_enabled() -> bool:
    return os.getenv("PUSH_DELIVERY_ENABLED", "false").lower() == "true"


def validate_worker_config() -> str:
    access_token = os.getenv("EXPO_ACCESS_TOKEN", "")
    if delivery_enabled() and not access_token:
        raise RuntimeError(
            "PUSH_DELIVERY_ENABLED=true requires EXPO_ACCESS_TOKEN for the push worker"
        )
    return access_token


def _headers(access_token: str) -> dict[str, str]:
    return {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {access_token}",
    }


async def send_expo_batch(
    messages: list[dict[str, Any]], access_token: str
) -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                EXPO_SEND_URL, json=messages, headers=_headers(access_token)
            )
    except (httpx.TimeoutException, httpx.NetworkError) as exc:
        raise ExpoRequestError("expo_network_error", transient=True) from exc
    if response.status_code != 200:
        transient = response.status_code in {408, 429} or response.status_code >= 500
        raise ExpoRequestError(f"expo_http_{response.status_code}", transient=transient)
    tickets = response.json().get("data")
    if not isinstance(tickets, list) or len(tickets) != len(messages):
        raise ExpoRequestError("expo_invalid_ticket_response", transient=True)
    return tickets


async def get_expo_receipts(ticket_ids: list[str], access_token: str) -> dict[str, dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                EXPO_RECEIPTS_URL,
                json={"ids": ticket_ids},
                headers=_headers(access_token),
            )
    except (httpx.TimeoutException, httpx.NetworkError) as exc:
        raise ExpoRequestError("expo_receipt_network_error", transient=True) from exc
    if response.status_code != 200:
        transient = response.status_code in {408, 429} or response.status_code >= 500
        raise ExpoRequestError(f"expo_receipt_http_{response.status_code}", transient=transient)
    receipts = response.json().get("data")
    if not isinstance(receipts, dict):
        raise ExpoRequestError("expo_invalid_receipt_response", transient=True)
    return receipts


async def recover_stale_claims(session: AsyncSession, stale_minutes: int = 10) -> int:
    jobs = list(
        (
            await session.execute(
                select(PushDeliveryJob)
                .where(
                    PushDeliveryJob.status.in_(["processing", "receipt_checking"]),
                    PushDeliveryJob.claimed_at < utcnow() - timedelta(minutes=stale_minutes),
                )
                .with_for_update(skip_locked=True)
            )
        ).scalars()
    )
    for job in jobs:
        job.status = "ticketed" if job.expo_ticket_id else "pending"
        job.claimed_at = None
        job.last_error_code = "stale_claim_recovered"
        job.last_error_detail = None
    await session.flush()
    return len(jobs)


async def claim_send_batch(session: AsyncSession, limit: int = 100) -> list[PushDeliveryJob]:
    jobs = list(
        (
            await session.execute(
                select(PushDeliveryJob)
                .where(
                    PushDeliveryJob.status == "pending",
                    PushDeliveryJob.available_at <= utcnow(),
                )
                .order_by(PushDeliveryJob.created_at.asc())
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


async def claim_receipt_batch(session: AsyncSession, limit: int = 100) -> list[PushDeliveryJob]:
    jobs = list(
        (
            await session.execute(
                select(PushDeliveryJob)
                .where(
                    PushDeliveryJob.status == "ticketed",
                    PushDeliveryJob.available_at <= utcnow(),
                    PushDeliveryJob.expo_ticket_id.is_not(None),
                )
                .order_by(PushDeliveryJob.available_at.asc())
                .with_for_update(skip_locked=True)
                .limit(min(limit, 100))
            )
        ).scalars()
    )
    for job in jobs:
        job.status = "receipt_checking"
        job.claimed_at = utcnow()
        job.attempts += 1
    await session.flush()
    return jobs


def _expo_error_code(item: dict[str, Any]) -> str:
    details = item.get("details")
    if isinstance(details, dict) and isinstance(details.get("error"), str):
        return details["error"][:100]
    return "expo_unknown_error"


async def _remove_invalid_token(session: AsyncSession, job: PushDeliveryJob) -> None:
    if job.device_token_id is None:
        return
    token = await session.get(DeviceToken, job.device_token_id)
    if token is not None:
        await session.delete(token)


def _retry_or_fail(job: PushDeliveryJob, code: str, *, transient: bool) -> None:
    max_attempts = int(os.getenv("PUSH_MAX_ATTEMPTS", "5"))
    job.claimed_at = None
    job.expo_ticket_id = None
    job.last_error_code = code[:100]
    job.last_error_detail = "provider request failed"
    if transient and job.attempts < max_attempts:
        job.status = "pending"
        job.available_at = utcnow() + timedelta(
            seconds=min(3600, 30 * (2 ** max(0, job.attempts - 1)))
        )
    else:
        job.status = "failed"


async def process_send_batch(
    session: AsyncSession, jobs: list[PushDeliveryJob], access_token: str
) -> Counter:
    counts: Counter = Counter()
    eligible: list[tuple[PushDeliveryJob, DeviceToken, dict[str, Any]]] = []
    prefs_by_user: dict[int, dict[str, bool]] = {}
    badge_by_user: dict[int, int] = {}
    restricted_user_ids = await interaction_policy.account_restricted_user_ids(
        session, [job.user_id for job in jobs]
    )

    for job in jobs:
        token = (
            await session.get(DeviceToken, job.device_token_id) if job.device_token_id else None
        )
        payload = job.payload if isinstance(job.payload, dict) else {}
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        notification_type = data.get("type")
        if token is None or token.user_id != job.user_id:
            job.status = "canceled"
            job.claimed_at = None
            job.last_error_code = "installation_changed"
            job.last_error_detail = None
            counts["canceled"] += 1
            continue
        if job.user_id in restricted_user_ids and notification_type != "moderation_update":
            job.status = "canceled"
            job.claimed_at = None
            job.last_error_code = "account_restricted"
            job.last_error_detail = None
            counts["canceled"] += 1
            continue
        prefs = prefs_by_user.get(job.user_id)
        if prefs is None:
            prefs = await push_prefs_service.get_prefs(session, job.user_id)
            prefs_by_user[job.user_id] = prefs
        if not isinstance(notification_type, str) or not push_prefs_service.should_send_push(
            prefs, notification_type
        ):
            job.status = "canceled"
            job.claimed_at = None
            job.last_error_code = "preference_disabled"
            job.last_error_detail = None
            counts["canceled"] += 1
            continue
        if job.user_id not in badge_by_user:
            from backend.services.notification_service import get_unread_count

            badge_by_user[job.user_id] = await get_unread_count(session, job.user_id)
        eligible.append(
            (
                job,
                token,
                {
                    "to": token.token,
                    "sound": "default",
                    "title": str(payload.get("title") or "Beach League")[:255],
                    "body": str(payload.get("body") or "You have a new notification")[:500],
                    "data": data,
                    "badge": badge_by_user[job.user_id],
                },
            )
        )

    if not eligible:
        await session.flush()
        return counts

    try:
        tickets = await send_expo_batch([message for _, _, message in eligible], access_token)
    except ExpoRequestError as exc:
        for job, _, _ in eligible:
            _retry_or_fail(job, exc.code, transient=exc.transient)
            counts["retried" if job.status == "pending" else "failed"] += 1
        await session.flush()
        return counts

    for (job, _, _), ticket in zip(eligible, tickets):
        if ticket.get("status") == "ok" and isinstance(ticket.get("id"), str):
            job.status = "ticketed"
            job.claimed_at = None
            job.expo_ticket_id = ticket["id"][:255]
            job.available_at = utcnow() + timedelta(minutes=15)
            job.last_error_code = None
            job.last_error_detail = None
            counts["accepted"] += 1
            continue
        code = _expo_error_code(ticket)
        if code == "DeviceNotRegistered":
            await _remove_invalid_token(session, job)
        _retry_or_fail(
            job,
            code,
            transient=code not in PERMANENT_EXPO_ERRORS and code != "DeviceNotRegistered",
        )
        counts["retried" if job.status == "pending" else "failed"] += 1
    await session.flush()
    return counts


async def process_receipt_batch(
    session: AsyncSession, jobs: list[PushDeliveryJob], access_token: str
) -> Counter:
    counts: Counter = Counter()
    if not jobs:
        return counts
    ids = [job.expo_ticket_id for job in jobs if job.expo_ticket_id]
    try:
        receipts = await get_expo_receipts(ids, access_token)
    except ExpoRequestError as exc:
        max_attempts = int(os.getenv("PUSH_MAX_ATTEMPTS", "5"))
        for job in jobs:
            retry = exc.transient and job.attempts < max_attempts
            job.status = "ticketed" if retry else "failed"
            job.claimed_at = None
            job.available_at = utcnow() + timedelta(minutes=5)
            job.last_error_code = exc.code
            job.last_error_detail = "receipt request failed"
            counts["receipt_retried" if retry else "failed"] += 1
        await session.flush()
        return counts

    for job in jobs:
        receipt = receipts.get(job.expo_ticket_id or "")
        if receipt is None:
            max_attempts = int(os.getenv("PUSH_MAX_ATTEMPTS", "5"))
            retry = job.attempts < max_attempts
            job.status = "ticketed" if retry else "failed"
            job.claimed_at = None
            job.available_at = utcnow() + timedelta(minutes=5)
            job.last_error_code = "receipt_not_ready"
            job.last_error_detail = None
            counts["receipt_retried" if retry else "failed"] += 1
        elif receipt.get("status") == "ok":
            job.status = "delivered"
            job.claimed_at = None
            job.last_error_code = None
            job.last_error_detail = None
            counts["delivered"] += 1
        else:
            code = _expo_error_code(receipt)
            if code == "DeviceNotRegistered":
                await _remove_invalid_token(session, job)
            _retry_or_fail(
                job,
                code,
                transient=code not in PERMANENT_EXPO_ERRORS and code != "DeviceNotRegistered",
            )
            counts["retried" if job.status == "pending" else "failed"] += 1
    await session.flush()
    return counts


async def purge_terminal_jobs(session: AsyncSession, retention_days: int = 30) -> int:
    result = await session.execute(
        delete(PushDeliveryJob).where(
            PushDeliveryJob.status.in_(TERMINAL_STATUSES),
            PushDeliveryJob.updated_at < utcnow() - timedelta(days=retention_days),
        )
    )
    return result.rowcount


async def run_once(session: AsyncSession, access_token: str) -> Counter:
    counts: Counter = Counter()
    counts["stale_recovered"] = await recover_stale_claims(session)
    counts["purged"] = await purge_terminal_jobs(session)
    send_jobs = await claim_send_batch(session)
    counts.update(await process_send_batch(session, send_jobs, access_token))
    receipt_jobs = await claim_receipt_batch(session)
    counts.update(await process_receipt_batch(session, receipt_jobs, access_token))
    return counts


async def run_forever(session_factory) -> None:
    access_token = validate_worker_config()
    if not delivery_enabled():
        logger.info("Push delivery worker disabled")
    while True:
        if not delivery_enabled():
            await asyncio.sleep(10)
            continue
        counts: Counter = Counter()
        async with session_factory() as session:
            try:
                counts = await run_once(session, access_token)
                await session.commit()
                if sum(counts.values()):
                    logger.info(
                        "Push worker batch accepted=%d delivered=%d retried=%d failed=%d canceled=%d stale_recovered=%d purged=%d",
                        counts["accepted"],
                        counts["delivered"],
                        counts["retried"] + counts["receipt_retried"],
                        counts["failed"],
                        counts["canceled"],
                        counts["stale_recovered"],
                        counts["purged"],
                    )
            except Exception as exc:
                await session.rollback()
                logger.error("push_worker_batch_failed error_code=%s", type(exc).__name__)
        await asyncio.sleep(0.25 if sum(counts.values()) else 2)
