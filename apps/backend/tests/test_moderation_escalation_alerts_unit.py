from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.services import moderation_alerts, moderation_evidence_service, moderation_service
from backend.services import moderation_worker


def _result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def test_daily_digest_stays_at_nine_eastern_across_dst_boundaries():
    spring = moderation_alerts.next_digest_at(datetime(2026, 3, 8, 12, tzinfo=timezone.utc))
    fall = moderation_alerts.next_digest_at(datetime(2026, 11, 1, 12, tzinfo=timezone.utc))

    assert spring == datetime(2026, 3, 8, 13, tzinfo=timezone.utc)
    assert fall == datetime(2026, 11, 1, 14, tzinfo=timezone.utc)


@pytest.mark.parametrize(
    ("categories", "incident"),
    [
        ({"harassment/threatening": True}, "credible_threat"),
        ({"hate/threatening": True}, "credible_threat"),
        ({"sexual/minors": True}, "sexual_exploitation"),
        ({"self-harm/intent": True}, "self_harm"),
        ({"self-harm/instructions": True}, "self_harm"),
        ({"illicit/violent": True}, "other_urgent"),
        ({"harassment": True}, None),
    ],
)
def test_severe_provider_categories_map_deterministically(categories, incident):
    assert moderation_worker.provider_incident_type(categories) == incident


@pytest.mark.parametrize(
    ("categories", "scores", "expected_action"),
    [
        ({"sexual/minors": True}, {"sexual/minors": 0.99}, "account_ban"),
        (
            {"harassment/threatening": True},
            {"harassment/threatening": 0.98},
            "account_suspend",
        ),
        ({"self-harm/intent": True}, {"self-harm/intent": 1.0}, None),
        ({"hate/threatening": True}, {"hate/threatening": 0.80}, None),
    ],
)
def test_automatic_enforcement_is_limited_to_clear_severe_flags(
    monkeypatch, categories, scores, expected_action
):
    monkeypatch.setenv("MODERATION_AUTO_ENFORCE_SCORE", "0.95")
    decision = moderation_worker.automatic_enforcement_decision(categories, scores)
    assert (decision or {}).get("action") == expected_action
    if expected_action == "account_suspend":
        assert decision["lock_hours"] == 168


@pytest.mark.asyncio
async def test_automatic_enforcement_email_includes_action_and_categories_only():
    now = datetime.now(timezone.utc)
    case = SimpleNamespace(
        id=22,
        target_type="player",
        target_id=77,
        incident_type="credible_threat",
        created_at=now,
        due_at=now + timedelta(hours=4),
    )
    job = SimpleNamespace(
        alert_kind="automatic_enforcement",
        payload_json={
            "action": "account_suspend",
            "lock_hours": 168,
            "categories": ["harassment/threatening"],
        },
    )

    subject, body = await moderation_alerts._render_email(AsyncMock(), job, [case])

    assert "Automatic safety enforcement" in subject
    assert "account_suspend" in body
    assert "168 hours" in body
    assert "harassment/threatening" in body
    assert "admin-view?tab=moderation&case=22" in body


@pytest.mark.asyncio
async def test_urgent_jobs_are_scheduled_transactionally_and_idempotently(monkeypatch):
    monkeypatch.setenv("MODERATION_ALERTS_ENABLED", "true")
    anchor = datetime(2026, 8, 6, 12, tzinfo=timezone.utc)
    case = SimpleNamespace(
        id=9,
        severity="urgent",
        urgent_since_at=anchor,
        created_at=anchor,
        dispositioned_at=None,
        due_at=anchor + timedelta(hours=4),
    )
    session = AsyncMock()

    await moderation_alerts.schedule_case_alerts(session, case)
    await moderation_alerts.schedule_case_alerts(session, case)

    assert session.execute.await_count == 4
    statements = [str(call.args[0]) for call in session.execute.await_args_list]
    assert all("ON CONFLICT" in statement for statement in statements)
    first_cycle = [call.args[0].compile().params for call in session.execute.await_args_list[:2]]
    assert first_cycle[0]["available_at"] == anchor
    assert first_cycle[1]["available_at"] == anchor + timedelta(hours=8)
    assert first_cycle[1]["payload_json"]["sequence"] == 1


@pytest.mark.asyncio
async def test_ordinary_due_soon_is_scheduled_four_hours_before_deadline(monkeypatch):
    monkeypatch.setenv("MODERATION_ALERTS_ENABLED", "true")
    due = datetime.now(timezone.utc) + timedelta(hours=20)
    case = SimpleNamespace(
        id=11,
        severity="ordinary",
        urgent_since_at=None,
        created_at=due - timedelta(hours=4),
        dispositioned_at=None,
        due_at=due,
    )
    session = AsyncMock()

    await moderation_alerts.schedule_case_alerts(session, case)

    statement = session.execute.await_args.args[0]
    assert statement.compile().params["available_at"] == due - timedelta(hours=4)


@pytest.mark.asyncio
async def test_dispositioned_appeal_is_durably_routed_to_owner(monkeypatch):
    monkeypatch.setenv("MODERATION_ALERTS_ENABLED", "true")
    case = SimpleNamespace(id=17, dispositioned_at=datetime.now(timezone.utc))
    session = AsyncMock()

    await moderation_alerts.schedule_appeal_review_alert(session, case, appeal_id=6)

    statement = session.execute.await_args.args[0]
    params = statement.compile().params
    assert params["idempotency_key"] == "appeal_review_required:17:6"
    assert params["alert_kind"] == "appeal_review_required"
    assert params["payload_json"] == {"case_id": 17, "appeal_id": 6}

    job = SimpleNamespace(alert_kind="appeal_review_required", case_id=17)
    session.get.return_value = case
    assert await moderation_alerts._eligible_cases(session, job) == [case]


@pytest.mark.asyncio
async def test_alert_email_body_contains_only_safe_case_metadata():
    now = datetime.now(timezone.utc)
    case = SimpleNamespace(
        id=12,
        target_type="player",
        target_id=77,
        incident_type="credible_threat",
        created_at=now - timedelta(hours=2),
        due_at=now + timedelta(hours=2),
        reporter_name="Private Reporter",
        report_details="private report narrative",
    )
    job = SimpleNamespace(alert_kind="urgent_initial")

    subject, body = await moderation_alerts._render_email(AsyncMock(), job, [case])

    assert "Case 12" in body
    assert "credible_threat" in body
    assert "admin-view?tab=moderation&case=12" in body
    assert "Private Reporter" not in body
    assert "private report narrative" not in body
    assert "evidence" not in body.lower() or "excludes evidence" in body.lower()
    assert "Urgent moderation case" in subject


@pytest.mark.asyncio
async def test_acknowledged_urgent_case_cancels_repeat_delivery():
    case = SimpleNamespace(
        id=3,
        state="acknowledged",
        severity="urgent",
        acknowledged_at=datetime.now(timezone.utc),
        dispositioned_at=None,
    )
    job = SimpleNamespace(alert_kind="urgent_repeat", case_id=3)
    session = AsyncMock()
    session.get.return_value = case

    assert await moderation_alerts._eligible_cases(session, job) == []


@pytest.mark.asyncio
async def test_stale_alert_claims_are_recovered_for_retry():
    result = MagicMock()
    result.scalars.return_value.all.return_value = [4, 5]
    session = AsyncMock()
    session.execute.return_value = result

    recovered = await moderation_alerts.recover_stale_claims(session)

    assert recovered == 2
    statement = str(session.execute.await_args.args[0])
    assert "moderation_alert_jobs.status" in statement
    assert "moderation_alert_jobs.claimed_at" in statement


@pytest.mark.asyncio
async def test_transient_resend_failures_retry_with_bounded_backoff(monkeypatch):
    monkeypatch.setenv("MODERATION_ALERT_MAX_ATTEMPTS", "3")
    job = SimpleNamespace(
        attempts=1,
        status="processing",
        claimed_at=object(),
        last_error_code=None,
        last_error_detail=None,
        available_at=None,
    )
    error = moderation_alerts.AlertDeliveryError(
        "resend_503", "Resend request failed", transient=True
    )

    await moderation_alerts._retry_or_fail(job, error)

    assert job.status == "pending"
    assert job.claimed_at is None
    assert job.last_error_code == "resend_503"
    assert job.available_at > datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_permanent_resend_failure_does_not_retry(monkeypatch):
    monkeypatch.setenv("MODERATION_ALERT_MAX_ATTEMPTS", "5")
    job = SimpleNamespace(
        attempts=1,
        status="processing",
        claimed_at=object(),
        last_error_code=None,
        last_error_detail=None,
    )
    error = moderation_alerts.AlertDeliveryError(
        "resend_400", "Resend rejected the moderation alert", transient=False
    )

    await moderation_alerts._retry_or_fail(job, error)

    assert job.status == "failed"


@pytest.mark.asyncio
async def test_moderation_alert_uses_job_idempotency_key(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("MODERATION_ALERT_EMAIL", "owner@example.com")
    response = SimpleNamespace(status_code=200)

    with patch.object(
        moderation_alerts.email_service,
        "send_email_request",
        new=AsyncMock(return_value=response),
    ) as send:
        await moderation_alerts.send_alert_email(
            "Urgent moderation case",
            "Case 42",
            idempotency_key="urgent_initial:42:anchor",
        )

    send.assert_awaited_once_with(
        "owner@example.com",
        "Urgent moderation case",
        "Case 42",
        idempotency_key="urgent_initial:42:anchor",
    )


def test_production_alert_config_requires_resend_sender(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("MODERATION_ALERTS_ENABLED", "true")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("MODERATION_ALERT_EMAIL", "owner@example.com")
    monkeypatch.delenv("RESEND_FROM_EMAIL", raising=False)

    with pytest.raises(RuntimeError, match="RESEND_FROM_EMAIL"):
        moderation_alerts.validate_alert_config()


@pytest.mark.asyncio
async def test_urgent_report_elevates_existing_case_without_hiding_content():
    target = SimpleNamespace(message_text="review me", moderation_visibility="visible")
    case = SimpleNamespace(
        id=7,
        severity="ordinary",
        incident_type=None,
        urgent_since_at=None,
        due_at=datetime.now(timezone.utc) + timedelta(hours=20),
    )
    session = AsyncMock()
    session.execute.side_effect = [_result(None), _result(case)]

    with (
        patch.object(
            moderation_service, "_resolve_target", new=AsyncMock(return_value=(target, 22))
        ),
        patch.object(moderation_evidence_service, "capture_text", new=AsyncMock()),
        patch.object(moderation_evidence_service, "capture_chat_context", new=AsyncMock()),
        patch.object(moderation_alerts, "schedule_case_alerts", new=AsyncMock()) as schedule,
    ):
        await moderation_service.create_report(
            session,
            reporter_id=11,
            target_type="direct_message",
            target_id=50,
            reason="stalking_doxxing",
            details="Synthetic drill",
        )

    assert case.severity == "urgent"
    assert case.incident_type == "stalking_doxxing"
    assert case.urgent_since_at is not None
    assert target.moderation_visibility == "visible"
    schedule.assert_awaited_once_with(session, case)


@pytest.mark.asyncio
async def test_external_escalation_acknowledges_but_does_not_disposition():
    case = SimpleNamespace(
        id=4,
        severity="urgent",
        state="open",
        acknowledged_at=None,
        dispositioned_at=None,
    )
    session = AsyncMock()
    session.execute.return_value = _result(case)

    with patch.object(moderation_alerts, "cancel_urgent_repeats", new=AsyncMock()):
        await moderation_service.record_external_escalation(
            session,
            4,
            2,
            channel="specialist_consultation",
            jurisdiction="unknown",
            note="Reviewed synthetic context with the safety specialist.",
        )

    assert case.acknowledged_at is not None
    assert case.state == "acknowledged"
    assert case.dispositioned_at is None
    event = session.add.call_args.args[0]
    assert event.event_type == "external_escalation"
    assert event.metadata_json == {
        "channel": "specialist_consultation",
        "jurisdiction": "unknown",
        "external_reference": None,
    }


@pytest.mark.asyncio
async def test_rejected_human_action_does_not_acknowledge_case():
    case = SimpleNamespace(
        id=8,
        state="open",
        severity="urgent",
        acknowledged_at=None,
        dispositioned_at=None,
    )
    session = AsyncMock()
    session.execute.return_value = _result(case)

    with patch.object(
        moderation_service, "_target_visibility", new=AsyncMock(return_value="visible")
    ):
        with pytest.raises(ValueError, match="Only quarantined content"):
            await moderation_service.apply_action(
                session, 8, 2, "restore", "Synthetic invalid action", None
            )

    assert case.acknowledged_at is None
    assert case.dispositioned_at is None
    assert case.state == "open"
