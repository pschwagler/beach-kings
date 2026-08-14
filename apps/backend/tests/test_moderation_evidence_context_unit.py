import json
from datetime import datetime, timezone
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.api.auth_dependencies import require_system_admin
from backend.api.routes.moderation import router
from backend.database.db import get_db_session
from backend.services import moderation_evidence_service


def _scalars_result(*values):
    result = MagicMock()
    result.scalars.return_value.first.return_value = values[0] if values else None
    result.scalars.return_value.all.return_value = list(values)
    return result


@pytest.mark.asyncio
async def test_direct_message_context_is_bounded_ordered_and_identity_safe():
    timestamp = datetime(2026, 8, 6, 12, tzinfo=timezone.utc)
    case = SimpleNamespace(
        id=8,
        target_type="direct_message",
        target_id=50,
        subject_player_id=10,
    )

    def message(message_id, sender, receiver, text):
        return SimpleNamespace(
            id=message_id,
            sender_player_id=sender,
            receiver_player_id=receiver,
            message_text=text,
            created_at=timestamp,
        )

    target = message(50, 10, 20, "reported")
    before = [message(49, 20, 10, "before 2"), message(48, 10, 20, "before 1")]
    after = [message(51, 20, 10, "after")]
    session = AsyncMock()
    session.execute.side_effect = [
        _scalars_result(),
        _scalars_result(*before),
        _scalars_result(*after),
    ]

    async def get(model, object_id):
        if object_id == 8:
            return case
        if object_id == 50:
            return target
        return None

    session.get.side_effect = get
    captured = SimpleNamespace(id=90)
    with patch.object(
        moderation_evidence_service,
        "capture",
        new=AsyncMock(return_value=captured),
    ) as capture:
        result = await moderation_evidence_service.capture_chat_context(session, 8)

    assert result is captured
    payload = json.loads(capture.await_args.args[2].decode("utf-8"))
    assert [item["id"] for item in payload["messages"]] == [48, 49, 50, 51]
    assert [item["speaker"] for item in payload["messages"]] == [
        "subject",
        "other",
        "subject",
        "other",
    ]
    assert [item["is_target"] for item in payload["messages"]] == [
        False,
        False,
        True,
        False,
    ]
    assert "reporter" not in capture.await_args.args[2].decode("utf-8")
    assert capture.await_args.args[3] == (moderation_evidence_service.CHAT_CONTEXT_CONTENT_TYPE)


@pytest.mark.asyncio
async def test_context_read_is_audited_and_returns_stable_shape():
    captured_at = datetime(2026, 8, 6, 12, tzinfo=timezone.utc)
    case = SimpleNamespace(id=8, target_type="league_message")
    evidence = SimpleNamespace(
        id=90,
        object_key="cases/8/context",
        captured_at=captured_at,
        purged_at=None,
    )
    messages = [
        {
            "id": 50,
            "created_at": captured_at.isoformat(),
            "speaker": "subject",
            "text": "reported",
            "is_target": True,
        }
    ]
    session = AsyncMock()
    session.get.return_value = case
    session.execute.return_value = _scalars_result(evidence)
    client = MagicMock()
    client.get_object.return_value = {
        "Body": BytesIO(json.dumps({"version": 1, "messages": messages}).encode())
    }

    with (
        patch.object(moderation_evidence_service, "_get_s3_client", return_value=client),
        patch.object(moderation_evidence_service, "_evidence_bucket", return_value="private"),
    ):
        result = await moderation_evidence_service.read_chat_context(session, 8, 4)

    assert result == {
        "available": True,
        "captured_at": captured_at,
        "messages": messages,
    }
    event = session.add.call_args.args[0]
    assert event.event_type == "evidence_accessed"
    assert event.actor_user_id == 4
    assert event.metadata_json["outcome"] == "available"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("target_type", "evidence", "reason"),
    [
        ("court_photo", None, "not_applicable"),
        ("direct_message", None, "not_captured"),
        (
            "direct_message",
            SimpleNamespace(id=90, purged_at=datetime.now(timezone.utc)),
            "purged",
        ),
    ],
)
async def test_context_read_handles_unavailable_states(target_type, evidence, reason):
    session = AsyncMock()
    session.get.return_value = SimpleNamespace(id=8, target_type=target_type)
    session.execute.return_value = _scalars_result(evidence) if evidence else _scalars_result()

    result = await moderation_evidence_service.read_chat_context(session, 8, 4)

    assert result == {"available": False, "reason": reason, "messages": []}
    assert session.add.call_args.args[0].metadata_json["outcome"] == reason


def test_context_endpoint_is_admin_only_and_no_store():
    app = FastAPI()
    app.include_router(router)

    async def allow_admin():
        return {"id": 4}

    async def session_override():
        yield AsyncMock()

    app.dependency_overrides[require_system_admin] = allow_admin
    app.dependency_overrides[get_db_session] = session_override
    payload = {"available": False, "reason": "not_captured", "messages": []}
    with patch.object(
        moderation_evidence_service,
        "read_chat_context",
        new=AsyncMock(return_value=payload),
    ) as read:
        response = TestClient(app).get("/api/admin-view/moderation/cases/8/context")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == payload
    read.assert_awaited_once()
