"""Deletion removes verification metadata only for the account's identifiers."""

from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from backend.database.models import AuthDeliveryJob, User, VerificationCode
from backend.services import user_service
from backend.services.auth.account_deletion_service import AccountDeletionService
from backend.utils.datetime_utils import utcnow


async def verification_with_job(session, *, email=None, phone=None, used=False):
    code = VerificationCode(
        email=email,
        phone_number=phone,
        code="123456",
        name="Synthetic signup metadata",
        password_hash="synthetic-password-hash",
        used=used,
        expires_at=(utcnow() + timedelta(minutes=10)).isoformat(),
    )
    session.add(code)
    await session.flush()
    job = AuthDeliveryJob(
        verification_code_id=code.id,
        channel="sms" if phone else "email",
        purpose="signup",
        idempotency_key=f"deletion-verification-{uuid4().hex}",
        status="pending",
    )
    session.add(job)
    await session.flush()
    return code.id, job.id


async def remaining_ids(session, model, ids):
    return set((await session.execute(select(model.id).where(model.id.in_(ids)))).scalars())


@pytest.mark.asyncio
@pytest.mark.parametrize("identifiers", ["email_only", "phone_only", "both", "absent", "blank"])
async def test_delete_verification_metadata_and_jobs_for_only_owned_identifiers(
    db_session, identifiers
):
    normalized_email = f"delete-{uuid4().hex}@beachleague.test"
    phone = "+15551111111"
    owner = User(
        email=(
            f"  {normalized_email.upper()}  "
            if identifiers in {"email_only", "both"}
            else "   "
            if identifiers == "blank"
            else None
        ),
        phone_number=phone if identifiers in {"phone_only", "both"} else None,
        apple_id=f"synthetic-apple-{uuid4().hex}",
        is_verified=True,
    )
    db_session.add(owner)
    await db_session.flush()

    owned = []
    if identifiers in {"email_only", "both"}:
        owned.append(await verification_with_job(db_session, email=normalized_email, used=True))
    if identifiers in {"phone_only", "both"}:
        owned.append(await verification_with_job(db_session, phone=phone))
    neighbors = [
        await verification_with_job(db_session, email="neighbor@beachleague.test", used=True),
        await verification_with_job(db_session, phone="+15552222222"),
        await verification_with_job(db_session, email=""),
    ]
    await db_session.commit()

    assert await user_service.execute_account_deletion(db_session, owner.id) is True

    if owned:
        assert (
            await remaining_ids(db_session, VerificationCode, [row[0] for row in owned]) == set()
        )
        assert await remaining_ids(db_session, AuthDeliveryJob, [row[1] for row in owned]) == set()
    assert await remaining_ids(db_session, VerificationCode, [row[0] for row in neighbors]) == {
        row[0] for row in neighbors
    }
    assert await remaining_ids(db_session, AuthDeliveryJob, [row[1] for row in neighbors]) == {
        row[1] for row in neighbors
    }
    await db_session.refresh(owner)
    assert owner.deleted_at is not None
    assert owner.email is None
    assert owner.phone_number is None


@pytest.mark.asyncio
async def test_scheduled_deletion_also_clears_email_metadata_and_delivery_job(db_session):
    due = User(
        email="due@beachleague.test",
        is_verified=True,
        deletion_scheduled_at=utcnow() - timedelta(minutes=1),
    )
    later = User(
        email="later@beachleague.test",
        is_verified=True,
        deletion_scheduled_at=utcnow() + timedelta(days=1),
    )
    db_session.add_all([due, later])
    await db_session.flush()
    due_code, due_job = await verification_with_job(db_session, email=due.email, used=True)
    later_code, later_job = await verification_with_job(db_session, email=later.email)
    await db_session.commit()

    await AccountDeletionService()._process_expired_deletions()

    assert await remaining_ids(db_session, VerificationCode, [due_code]) == set()
    assert await remaining_ids(db_session, AuthDeliveryJob, [due_job]) == set()
    assert await remaining_ids(db_session, VerificationCode, [later_code]) == {later_code}
    assert await remaining_ids(db_session, AuthDeliveryJob, [later_job]) == {later_job}
    assert (await db_session.execute(select(func.count()).select_from(User))).scalar_one() == 2
