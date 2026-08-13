from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from backend.services import moderation_worker


def test_moderation_mode_defaults_off(monkeypatch):
    monkeypatch.delenv("ENV", raising=False)
    monkeypatch.delenv("MODERATION_MODE", raising=False)
    assert moderation_worker.moderation_mode() == "off"
    assert moderation_worker.initial_visibility() == "visible"


def test_enforce_mode_starts_content_pending(monkeypatch):
    monkeypatch.setenv("MODERATION_MODE", "enforce")
    assert moderation_worker.initial_visibility() == "pending"


def test_unknown_mode_is_off_in_local_development(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("MODERATION_MODE", "automatic")
    assert moderation_worker.moderation_mode() == "off"


@pytest.mark.parametrize("environment", ["production", "prod", "staging"])
def test_deployed_environments_always_fail_closed(monkeypatch, environment):
    monkeypatch.setenv("ENV", environment)
    monkeypatch.setenv("MODERATION_MODE", "off")
    assert moderation_worker.moderation_mode() == "enforce"
    assert moderation_worker.initial_visibility() == "pending"


def test_enabled_worker_requires_provider_credential(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        moderation_worker.validate_worker_config()


def test_provider_content_excludes_identity_fields():
    target = SimpleNamespace(message_text="a message", sender_player_id=42, receiver_player_id=84)
    assert moderation_worker._provider_content("direct_message", target) == {"input": "a message"}


def test_photo_caption_and_image_are_screened_together():
    target = SimpleNamespace(caption="busy tonight", url="https://example.test/photo.jpg")
    assert moderation_worker._provider_content("court_photo", target) == {
        "input": [
            {"type": "text", "text": "busy tonight"},
            {
                "type": "image_url",
                "image_url": {"url": "https://example.test/photo.jpg"},
            },
        ]
    }


def test_reported_profile_screens_only_public_profile_content():
    target = SimpleNamespace(
        id=12,
        full_name="Public Name",
        nickname="Nickname",
        profile_picture_url="https://example.test/avatar.jpg",
        user_id=99,
    )
    assert moderation_worker._provider_content("player", target) == {
        "input": [
            {"type": "text", "text": "Public Name\nNickname"},
            {
                "type": "image_url",
                "image_url": {"url": "https://example.test/avatar.jpg"},
            },
        ]
    }


def test_edited_review_supersedes_stale_job():
    job = SimpleNamespace(
        target_type="court_review",
        idempotency_key=f"content:court_review:7:{moderation_worker.content_revision('old')}",
    )
    target = SimpleNamespace(review_text="new")
    assert moderation_worker._job_is_superseded(job, target) is True


def test_report_job_is_not_treated_as_a_stale_edit_job():
    job = SimpleNamespace(
        target_type="court_review",
        idempotency_key="report:4:v1",
    )
    assert (
        moderation_worker._job_is_superseded(job, SimpleNamespace(review_text="current text"))
        is False
    )


@pytest.mark.asyncio
async def test_image_screening_fails_closed_on_provider_error(monkeypatch):
    monkeypatch.setenv("ENV", "production")

    async def unavailable(*_args, **_kwargs):
        raise TimeoutError("provider timeout")

    monkeypatch.setattr(moderation_worker, "classify", unavailable)
    with pytest.raises(moderation_worker.ModerationUnavailable):
        await moderation_worker.screen_image_url("https://example.test/photo.jpg", "avatar_7")


@pytest.mark.asyncio
async def test_image_screening_rejects_flagged_image(monkeypatch):
    monkeypatch.setenv("ENV", "production")

    async def flagged(*_args, **_kwargs):
        return {"flagged": True}

    monkeypatch.setattr(moderation_worker, "classify", flagged)
    with pytest.raises(moderation_worker.ContentRejected):
        await moderation_worker.screen_image_url("https://example.test/photo.jpg", "avatar_7")


@pytest.mark.asyncio
async def test_profile_text_uses_same_fail_closed_screen(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    classify = AsyncMock(return_value={"flagged": False})
    monkeypatch.setattr(moderation_worker, "classify", classify)

    await moderation_worker.screen_text("Public name\nNickname", "profile_7")

    classify.assert_awaited_once_with({"input": "Public name\nNickname"}, "profile_7")


@pytest.mark.asyncio
async def test_retry_is_bounded(monkeypatch):
    monkeypatch.setenv("MODERATION_MAX_ATTEMPTS", "2")
    job = SimpleNamespace(attempts=2, status="processing", claimed_at=object(), last_error=None)
    await moderation_worker._retry_or_fail(None, job, "provider timeout")
    assert job.status == "failed"
    assert job.claimed_at is None
    assert job.last_error == "provider timeout"


@pytest.mark.asyncio
async def test_clean_direct_message_is_published_only_after_completion(monkeypatch):
    monkeypatch.setenv("MODERATION_MODE", "enforce")
    monkeypatch.setenv("ENV", "development")
    target = SimpleNamespace(moderation_visibility="pending")
    job = SimpleNamespace(
        target_type="direct_message",
        target_id=7,
        idempotency_key="content:direct_message:7:v1",
        case_id=None,
        status="processing",
        last_error=None,
    )
    session = SimpleNamespace(get=AsyncMock(return_value=target), flush=AsyncMock())
    publish = AsyncMock()
    monkeypatch.setattr(
        "backend.services.social.direct_message_service.publish_approved_message", publish
    )

    await moderation_worker._complete(session, job, False, {}, {"model": "test"})

    assert target.moderation_visibility == "visible"
    publish.assert_awaited_once_with(session, target)
    assert job.status == "completed"


@pytest.mark.asyncio
async def test_provider_failure_keeps_target_pending(monkeypatch):
    monkeypatch.setenv("MODERATION_MODE", "enforce")
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("MODERATION_MAX_ATTEMPTS", "3")
    target = SimpleNamespace(message_text="hold me", moderation_visibility="pending")
    job = SimpleNamespace(
        target_type="direct_message",
        target_id=9,
        attempts=1,
        status="processing",
        claimed_at=object(),
        available_at=None,
        last_error=None,
    )
    session = SimpleNamespace(get=AsyncMock(return_value=target))

    async def unavailable(*_args, **_kwargs):
        raise TimeoutError("provider timeout")

    monkeypatch.setattr(moderation_worker, "classify", unavailable)

    await moderation_worker.process_job(session, job)

    assert target.moderation_visibility == "pending"
    assert job.status == "pending"
    assert job.last_error == "provider timeout"


@pytest.mark.asyncio
async def test_blocked_direct_message_is_not_delivered(monkeypatch):
    from backend.services import direct_message_service, interaction_policy

    decision = SimpleNamespace()

    async def blocked(*_args, **_kwargs):
        raise interaction_policy.InteractionUnavailable(decision)

    websocket = Mock()
    monkeypatch.setattr(interaction_policy, "enforce_action", blocked)
    monkeypatch.setattr(direct_message_service, "get_websocket_manager", websocket)
    dm = SimpleNamespace(sender_player_id=1, receiver_player_id=2)

    published = await direct_message_service.publish_approved_message(Mock(), dm)

    assert published is False
    websocket.assert_not_called()


@pytest.mark.asyncio
async def test_flagged_job_passes_repeat_context_to_triage_and_audit(monkeypatch):
    target = SimpleNamespace(message_text="reported text")
    job = SimpleNamespace(
        target_type="direct_message",
        target_id=9,
        case_id=None,
        idempotency_key="content:direct_message:9:v1",
    )
    session = SimpleNamespace(get=AsyncMock(return_value=target))
    repeat_context = {
        "prior_case_count": 3,
        "prior_urgent_case_count": 1,
        "window_days": 365,
    }
    monkeypatch.setattr(
        moderation_worker,
        "classify",
        AsyncMock(return_value={"flagged": True, "categories": {"harassment": True}}),
    )
    monkeypatch.setattr(moderation_worker, "_subject_player_id", AsyncMock(return_value=12))
    monkeypatch.setattr(
        moderation_worker,
        "_repeat_behavior_context",
        AsyncMock(return_value=repeat_context),
    )
    monkeypatch.setattr(
        moderation_worker,
        "_report_reasons",
        AsyncMock(return_value=[]),
    )
    triage = AsyncMock(return_value={"severity": "urgent"})
    complete = AsyncMock()
    monkeypatch.setattr(moderation_worker, "triage_recommendation", triage)
    monkeypatch.setattr(moderation_worker, "_complete", complete)

    await moderation_worker.process_job(session, job)

    assert triage.await_args.kwargs["repeat_context"] == repeat_context
    assert triage.await_args.kwargs["report_reasons"] == []
    provider_payload = complete.await_args.args[4]
    assert provider_payload["subject_player_id"] == 12
    assert provider_payload["repeat_context"] == repeat_context
    assert provider_payload["triage"] == {"severity": "urgent"}


@pytest.mark.asyncio
async def test_urgent_triage_updates_case_queue_priority(monkeypatch):
    from backend.database.models import ModerationCase

    monkeypatch.setenv("MODERATION_MODE", "enforce")
    monkeypatch.setenv("ENV", "development")
    case = SimpleNamespace(
        id=4,
        subject_player_id=12,
        severity="ordinary",
        due_at=None,
    )
    target = SimpleNamespace(moderation_visibility="pending")
    job = SimpleNamespace(
        target_type="direct_message",
        target_id=9,
        case_id=4,
        idempotency_key="report:3:v1",
        status="processing",
        last_error=None,
    )

    async def get(model, _target_id):
        return case if model is ModerationCase else target

    session = SimpleNamespace(get=get, add=Mock(), flush=AsyncMock())
    monkeypatch.setattr(moderation_worker, "_capture_flagged_evidence", AsyncMock())

    await moderation_worker._complete(
        session,
        job,
        True,
        {"violence": True},
        {"model": "test", "triage": {"severity": "urgent"}},
    )

    assert case.severity == "urgent"
    assert case.due_at is not None
    assert target.moderation_visibility == "quarantined"


@pytest.mark.asyncio
async def test_clear_severe_flag_applies_account_action_and_schedules_email(monkeypatch):
    from backend.database.models import ModerationCase
    from backend.services import moderation_alerts, moderation_service

    monkeypatch.setenv("MODERATION_MODE", "enforce")
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("MODERATION_AUTO_ENFORCE_SCORE", "0.95")
    case = SimpleNamespace(
        id=14,
        subject_player_id=12,
        severity="ordinary",
        due_at=None,
    )
    target = SimpleNamespace(moderation_visibility="pending")
    job = SimpleNamespace(
        target_type="direct_message",
        target_id=9,
        case_id=14,
        idempotency_key="content:direct_message:9:v1",
        status="processing",
        last_error=None,
    )

    async def get(model, _target_id):
        return case if model is ModerationCase else target

    session = SimpleNamespace(get=get, add=Mock(), flush=AsyncMock())
    apply_action = AsyncMock()
    auto_alert = AsyncMock()
    case_alert = AsyncMock()
    monkeypatch.setattr(moderation_worker, "_capture_flagged_evidence", AsyncMock())
    monkeypatch.setattr(moderation_service, "apply_action", apply_action)
    monkeypatch.setattr(
        moderation_alerts, "schedule_automatic_enforcement_alert", auto_alert
    )
    monkeypatch.setattr(moderation_alerts, "schedule_case_alerts", case_alert)

    await moderation_worker._complete(
        session,
        job,
        True,
        {"sexual/minors": True},
        {
            "model": "test",
            "category_scores": {"sexual/minors": 0.99},
        },
    )

    apply_action.assert_awaited_once()
    assert apply_action.await_args.args[2] is None
    assert apply_action.await_args.args[3] == "account_ban"
    auto_alert.assert_awaited_once()
    case_alert.assert_awaited_once_with(session, case)


@pytest.mark.asyncio
async def test_reported_clean_content_still_receives_policy_triage(monkeypatch):
    target = SimpleNamespace(message_text="reported text", sender_player_id=12)
    job = SimpleNamespace(
        target_type="direct_message",
        target_id=9,
        case_id=4,
        idempotency_key="report:3:v1",
    )
    session = SimpleNamespace(get=AsyncMock(return_value=target))
    monkeypatch.setattr(
        moderation_worker,
        "classify",
        AsyncMock(return_value={"flagged": False, "categories": {}}),
    )
    monkeypatch.setattr(
        moderation_worker,
        "_repeat_behavior_context",
        AsyncMock(
            return_value={
                "prior_case_count": 1,
                "prior_urgent_case_count": 0,
                "window_days": 365,
            }
        ),
    )
    monkeypatch.setattr(
        moderation_worker,
        "_report_reasons",
        AsyncMock(return_value=["harassment"]),
    )
    triage = AsyncMock(return_value={"severity": "ordinary"})
    complete = AsyncMock()
    monkeypatch.setattr(moderation_worker, "triage_recommendation", triage)
    monkeypatch.setattr(moderation_worker, "_complete", complete)

    await moderation_worker.process_job(session, job)

    assert triage.await_args.kwargs["report_reasons"] == ["harassment"]
    assert complete.await_args.args[2] is False
    assert complete.await_args.args[4]["triage"] == {"severity": "ordinary"}


@pytest.mark.asyncio
async def test_clean_report_job_does_not_redeliver_existing_message(monkeypatch):
    from backend.database.models import ModerationCase

    monkeypatch.setenv("MODERATION_MODE", "enforce")
    monkeypatch.setenv("ENV", "development")
    case = SimpleNamespace(id=4, subject_player_id=12, severity="ordinary", due_at=None)
    target = SimpleNamespace(moderation_visibility="visible")
    job = SimpleNamespace(
        target_type="direct_message",
        target_id=9,
        case_id=4,
        idempotency_key="report:3:v1",
        status="processing",
        last_error=None,
    )

    async def get(model, _target_id):
        return case if model is ModerationCase else target

    session = SimpleNamespace(get=get, add=Mock(), flush=AsyncMock())
    publish = AsyncMock()
    monkeypatch.setattr(
        "backend.services.social.direct_message_service.publish_approved_message", publish
    )

    await moderation_worker._complete(
        session,
        job,
        False,
        {},
        {"model": "test", "triage": {"severity": "ordinary"}},
    )

    publish.assert_not_awaited()
    assert target.moderation_visibility == "visible"


@pytest.mark.asyncio
async def test_flagged_message_captures_text_and_bounded_context(monkeypatch):
    from backend.services import moderation_evidence_service

    capture_text = AsyncMock()
    capture_context = AsyncMock()
    monkeypatch.setattr(moderation_evidence_service, "capture_text", capture_text)
    monkeypatch.setattr(moderation_evidence_service, "capture_chat_context", capture_context)
    session = SimpleNamespace(add=Mock())
    target = SimpleNamespace(message_text="reported text")

    await moderation_worker._capture_flagged_evidence(session, 8, "league_message", target)

    capture_text.assert_awaited_once_with(session, 8, "reported text")
    capture_context.assert_awaited_once_with(session, 8)
