"""Pure and provider-boundary tests for durable push delivery."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.services.push_delivery_service import (
    build_safe_payload,
    safe_domain_data,
    safe_internal_link_url,
)
from backend.services import push_service, push_worker


class _NestedTransaction:
    async def __aenter__(self):
        return None

    async def __aexit__(self, *_args):
        return False


def test_safe_domain_data_is_allowlist_only():
    safe = safe_domain_data(
        {
            "league_id": 8,
            "message_id": 10,
            "sender_player_id": 12,
            "sender_id": 999,
            "message_text": "private chat text",
            "action_url": "/api/admin/action",
            "credential": "secret",
        }
    )
    assert safe == {"league_id": 8, "message_id": 10, "sender_player_id": 12}


def test_safe_payload_uses_private_preview_overrides():
    notification = SimpleNamespace(
        id=41,
        type="direct_message",
        title="Rich in-app title",
        message="Alex: private text",
        link_url="/home?tab=messages",
    )
    payload = build_safe_payload(
        notification,
        {"message_id": 7, "message_text": "private text"},
        push_title="New message from Alex",
        push_body="A new message is available.",
    )
    assert payload == {
        "title": "New message from Alex",
        "body": "A new message is available.",
        "data": {
            "notificationId": 41,
            "type": "direct_message",
            "linkUrl": "/home?tab=messages",
            "data": {"message_id": 7},
        },
    }
    assert "private text" not in str(payload)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("/home?tab=messages", "/home?tab=messages"),
        (
            "https://beachleaguevb.com/league/7?tab=messages",
            "/league/7?tab=messages",
        ),
        ("https://example.com/home", None),
        ("http://beachleaguevb.com/home", None),
        ("//example.com/home", None),
        ("home?tab=messages", None),
    ],
)
def test_safe_internal_link_url_allows_only_production_internal_routes(value, expected):
    assert safe_internal_link_url(value) == expected


def test_safe_payload_drops_external_link_url():
    notification = SimpleNamespace(
        id=42,
        type="friend_request",
        title="Friend request",
        message="A player sent a request",
        link_url="https://example.com/phishing",
    )
    payload = build_safe_payload(notification, {"friend_request_id": 8})
    assert payload["data"]["linkUrl"] is None


def test_worker_requires_access_token_when_enabled(monkeypatch):
    monkeypatch.setenv("PUSH_DELIVERY_ENABLED", "true")
    monkeypatch.delenv("EXPO_ACCESS_TOKEN", raising=False)
    with pytest.raises(RuntimeError, match="requires EXPO_ACCESS_TOKEN"):
        push_worker.validate_worker_config()


def test_retry_is_bounded(monkeypatch):
    monkeypatch.setenv("PUSH_MAX_ATTEMPTS", "5")
    retryable = SimpleNamespace(attempts=1)
    push_worker._retry_or_fail(retryable, "expo_http_503", transient=True)
    assert retryable.status == "pending"
    assert retryable.last_error_code == "expo_http_503"

    exhausted = SimpleNamespace(attempts=5)
    push_worker._retry_or_fail(exhausted, "expo_http_503", transient=True)
    assert exhausted.status == "failed"


@pytest.mark.asyncio
async def test_installation_registration_transfers_owner_and_rotates_token():
    row = SimpleNamespace(
        id=20,
        user_id=1,
        token="ExponentPushToken[old]",
        platform="ios",
        installation_id="installation-uuid-0001",
        unregister_secret_hash="old-hash",
        last_registered_at=None,
    )
    installation_result = MagicMock()
    installation_result.scalar_one_or_none.return_value = row
    token_result = MagicMock()
    token_result.scalar_one_or_none.return_value = None
    session = SimpleNamespace(
        execute=AsyncMock(side_effect=[installation_result, token_result]),
        flush=AsyncMock(),
        refresh=AsyncMock(),
    )

    registered, secret = await push_service.register_installation(
        session,
        user_id=2,
        token="ExponentPushToken[new]",
        platform="ios",
        installation_id="installation-uuid-0001",
    )

    assert registered is row
    assert row.user_id == 2
    assert row.token == "ExponentPushToken[new]"
    assert isinstance(secret, str) and len(secret) >= 32
    assert row.unregister_secret_hash != "old-hash"


@pytest.mark.asyncio
async def test_device_not_registered_receipt_removes_token():
    token = SimpleNamespace(id=22)
    session = SimpleNamespace(
        get=AsyncMock(return_value=token),
        delete=AsyncMock(),
        flush=AsyncMock(),
    )
    job = SimpleNamespace(
        expo_ticket_id="ticket-1",
        device_token_id=22,
        attempts=1,
        status="receipt_checking",
        claimed_at=None,
        last_error_code=None,
        last_error_detail=None,
    )
    with patch.object(
        push_worker,
        "get_expo_receipts",
        new=AsyncMock(
            return_value={
                "ticket-1": {
                    "status": "error",
                    "details": {"error": "DeviceNotRegistered"},
                }
            }
        ),
    ):
        counts = await push_worker.process_receipt_batch(session, [job], "access-token")

    session.delete.assert_awaited_once_with(token)
    assert job.status == "failed"
    assert counts["failed"] == 1


@pytest.mark.asyncio
async def test_missing_receipt_retries_without_losing_ticket(monkeypatch):
    monkeypatch.setenv("PUSH_MAX_ATTEMPTS", "5")
    session = SimpleNamespace(flush=AsyncMock())
    job = SimpleNamespace(
        expo_ticket_id="ticket-pending",
        attempts=1,
        status="receipt_checking",
        claimed_at=None,
        available_at=None,
        last_error_code=None,
        last_error_detail=None,
    )
    with patch.object(
        push_worker,
        "get_expo_receipts",
        new=AsyncMock(return_value={}),
    ):
        counts = await push_worker.process_receipt_batch(session, [job], "access-token")

    assert job.status == "ticketed"
    assert job.expo_ticket_id == "ticket-pending"
    assert job.last_error_code == "receipt_not_ready"
    assert counts["receipt_retried"] == 1


@pytest.mark.asyncio
async def test_repeated_direct_messages_enqueue_distinct_push_events():
    from backend.services import direct_message_service
    from backend.services import push_delivery_service

    notification = SimpleNamespace(id=51)
    result = MagicMock()
    result.scalar_one_or_none.return_value = notification
    session = SimpleNamespace(
        execute=AsyncMock(return_value=result),
        begin_nested=MagicMock(return_value=_NestedTransaction()),
        flush=AsyncMock(),
        refresh=AsyncMock(),
    )
    enqueue = AsyncMock(return_value=1)

    with (
        patch.object(
            direct_message_service,
            "get_unread_count",
            new=AsyncMock(return_value=2),
        ),
        patch.object(direct_message_service, "notification_to_dict", return_value={}),
        patch.object(
            direct_message_service,
            "get_websocket_manager",
            return_value=SimpleNamespace(send_to_user=AsyncMock()),
        ),
        patch.object(push_delivery_service, "enqueue_notification_jobs", new=enqueue),
    ):
        await direct_message_service._upsert_dm_summary_notification(
            session, 7, 70, 80, "Alex", "First", 101
        )
        await direct_message_service._upsert_dm_summary_notification(
            session, 7, 70, 80, "Alex", "Second", 102
        )

    assert [call.kwargs["event_key"] for call in enqueue.await_args_list] == [
        "direct-message-101",
        "direct-message-102",
    ]
