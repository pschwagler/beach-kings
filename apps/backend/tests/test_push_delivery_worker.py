"""Exercise Expo delivery modes against the durable PostgreSQL queue."""

from datetime import timedelta
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.database.models import DeviceToken, NotificationType, PushDeliveryJob, User
from backend.services.notifications import notification_service, push_service, push_worker
from backend.utils.datetime_utils import utcnow


@pytest.mark.asyncio
@pytest.mark.parametrize("test_mode", [True, False])
async def test_worker_processes_recipient_scope(db_session, test_engine, monkeypatch, test_mode):
    test_user, other_user = User(), User()
    db_session.add_all([test_user, other_user])
    await db_session.flush()
    test_token, _ = await push_service.register_installation(
        db_session, test_user.id, "ExpoPushToken[test]", "ios", "test-installation"
    )
    other_token, _ = await push_service.register_installation(
        db_session, other_user.id, "ExpoPushToken[other]", "ios", "other-installation"
    )
    for user in (test_user, other_user):
        await notification_service.create_notification(
            db_session, user.id, NotificationType.FRIEND_REQUEST.value, "Friend request", "Test"
        )

    now = utcnow()
    if test_mode:
        db_session.add(
            PushDeliveryJob(
                user_id=test_user.id,
                device_token_id=other_token.id,
                idempotency_key="installation-moved-to-another-user",
                payload={"data": {"type": NotificationType.FRIEND_REQUEST.value}},
            )
        )
    for user, token in ((test_user, test_token), (other_user, other_token)):
        # In test mode the unrelated stale send points at an installation now
        # owned by the test account, as can happen after account switching.
        stale_send_token = test_token if test_mode and user is other_user else token
        db_session.add_all(
            [
                PushDeliveryJob(
                    user_id=user.id,
                    device_token_id=stale_send_token.id,
                    idempotency_key=f"stale-send-{user.id}",
                    payload={"data": {"type": NotificationType.FRIEND_REQUEST.value}},
                    status="processing",
                    claimed_at=now - timedelta(hours=1),
                ),
                PushDeliveryJob(
                    user_id=user.id,
                    device_token_id=token.id,
                    idempotency_key=f"stale-receipt-{user.id}",
                    payload={},
                    status="receipt_checking",
                    claimed_at=now - timedelta(hours=1),
                    expo_ticket_id=f"old-ticket-{user.id}",
                ),
                PushDeliveryJob(
                    user_id=user.id,
                    idempotency_key=f"old-terminal-{user.id}",
                    payload={},
                    status="delivered",
                    updated_at=now - timedelta(days=31),
                ),
            ]
        )
    await db_session.commit()

    unrelated = (
        select(PushDeliveryJob.__table__)
        .where(PushDeliveryJob.user_id == other_user.id)
        .order_by(PushDeliveryJob.id)
    )
    before = (await db_session.execute(unrelated)).all()

    send_number = 0

    async def send(messages, _access_token):
        nonlocal send_number
        tickets = []
        for _ in messages:
            send_number += 1
            tickets.append({"status": "ok", "id": f"new-ticket-{send_number}"})
        return tickets

    async def receipts(ticket_ids, _access_token):
        return {
            ticket: (
                {"status": "error", "details": {"error": "DeviceNotRegistered"}}
                if test_mode and ticket.startswith("old-ticket")
                else {"status": "ok"}
            )
            for ticket in ticket_ids
        }

    provider_send = AsyncMock(side_effect=send)
    provider_receipts = AsyncMock(side_effect=receipts)
    monkeypatch.setattr(push_worker, "send_expo_batch", provider_send)
    monkeypatch.setattr(push_worker, "get_expo_receipts", provider_receipts)
    monkeypatch.setenv("PUSH_DELIVERY_ENABLED", "false" if test_mode else "true")
    monkeypatch.setenv("PUSH_DELIVERY_TEST_USER_ID", str(test_user.id) if test_mode else "")
    monkeypatch.setenv("EXPO_ACCESS_TOKEN", "synthetic")
    clock = now + timedelta(seconds=1)

    async def advance_clock(_seconds):
        nonlocal clock
        if clock > now + timedelta(minutes=15):
            raise StopAsyncIteration
        clock += timedelta(minutes=16)

    monkeypatch.setattr(push_worker, "utcnow", lambda: clock)
    monkeypatch.setattr(push_worker.asyncio, "sleep", advance_clock)
    with pytest.raises(StopAsyncIteration):
        await push_worker.run_forever(async_sessionmaker(test_engine, expire_on_commit=False))

    provider_send.assert_awaited_once()
    messages, access_token = provider_send.await_args.args
    assert access_token == "synthetic"
    expected_tokens = {test_token.token} if test_mode else {test_token.token, other_token.token}
    assert {message["to"] for message in messages} == expected_tokens
    assert len(messages) == 2 * len(expected_tokens)
    assert sum(message["title"] == "Friend request" for message in messages) == len(
        expected_tokens
    )
    assert [set(call.args[0]) for call in provider_receipts.await_args_list] == [
        {f"old-ticket-{test_user.id}"}
        if test_mode
        else {f"old-ticket-{test_user.id}", f"old-ticket-{other_user.id}"},
        {f"new-ticket-{number}" for number in range(1, len(messages) + 1)},
    ]

    async with async_sessionmaker(test_engine)() as verify_session:
        statuses = (
            await verify_session.scalars(
                select(PushDeliveryJob.status).where(PushDeliveryJob.user_id == test_user.id)
            )
        ).all()
        if test_mode:
            assert sorted(statuses) == [
                "canceled",
                "delivered",
                "delivered",
                "delivered",
                "failed",
            ]
            assert (await verify_session.execute(unrelated)).all() == before
            assert await verify_session.get(DeviceToken, test_token.id) is not None
        else:
            assert statuses == ["delivered"] * 3
            assert [row.status for row in (await verify_session.execute(unrelated)).all()] == [
                "delivered"
            ] * 3
