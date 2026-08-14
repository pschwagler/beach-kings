"""Focused behavior tests for durable authentication delivery."""

from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from backend.database.models import AuthDeliveryJob, VerificationCode
from backend.services import user_service
from backend.services.auth import auth_delivery_worker
from backend.utils.datetime_utils import utcnow


@pytest.mark.asyncio
async def test_noop_job_is_canceled_without_provider_call():
    job = AuthDeliveryJob(
        verification_code_id=None,
        channel="email",
        purpose="password_reset",
        idempotency_key="noop-test",
        status="processing",
        attempts=1,
    )

    result = await auth_delivery_worker.process_job(AsyncMock(), job)

    assert result == "canceled"
    assert job.status == "canceled"
    assert job.last_error_code == "no_delivery_required"


@pytest.mark.asyncio
async def test_email_job_uses_idempotency_key(monkeypatch):
    code = VerificationCode(
        email="person@example.com",
        code="123456",
        expires_at=(utcnow() + auth_delivery_worker.timedelta(minutes=10)).isoformat(),
        used=False,
    )
    session = AsyncMock()
    session.get.return_value = code
    send = AsyncMock(return_value=True)
    monkeypatch.setattr(auth_delivery_worker.email_service, "send_verification_code_email", send)
    job = AuthDeliveryJob(
        verification_code_id=10,
        channel="email",
        purpose="signup",
        idempotency_key="delivery-test",
        status="processing",
        attempts=1,
    )

    result = await auth_delivery_worker.process_job(session, job)

    assert result == "delivered"
    send.assert_awaited_once_with(
        "person@example.com",
        "123456",
        session=session,
        idempotency_key="delivery-test",
    )
    assert job.status == "delivered"


@pytest.mark.asyncio
async def test_provider_failure_retries_without_storing_detail(monkeypatch):
    code = VerificationCode(
        phone_number="+15551234567",
        code="654321",
        expires_at=(utcnow() + auth_delivery_worker.timedelta(minutes=10)).isoformat(),
        used=False,
    )
    session = AsyncMock()
    session.get.return_value = code
    monkeypatch.setattr(
        auth_delivery_worker.auth_service,
        "send_sms_verification",
        AsyncMock(return_value=False),
    )
    job = AuthDeliveryJob(
        verification_code_id=11,
        channel="sms",
        purpose="login",
        idempotency_key="sms-test",
        status="processing",
        attempts=1,
    )

    result = await auth_delivery_worker.process_job(session, job)

    assert result == "retried"
    assert job.status == "pending"
    assert job.last_error_code == "provider_unavailable"


@pytest.mark.asyncio
async def test_code_and_delivery_job_are_committed_together(db_session):
    created = await user_service.create_verification_code(
        session=db_session,
        email="person@example.com",
        code="123456",
        delivery_channel="email",
        delivery_purpose="signup",
    )

    assert created is True
    job = (await db_session.execute(select(AuthDeliveryJob))).scalar_one()
    code = await db_session.get(VerificationCode, job.verification_code_id)
    assert code is not None
    assert code.email == "person@example.com"
    assert job.channel == "email"
    assert job.purpose == "signup"
    assert await auth_delivery_worker.purge_old_data(db_session) == (0, 0)
