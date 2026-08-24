from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from backend.api.auth_dependencies import require_system_admin
from backend.api.routes.moderation import router
from backend.database.db import get_db_session
from backend.services import (
    moderation_admin_queries,
    moderation_evidence_service,
    moderation_service,
    moderation_worker,
)


def _result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _rows_result(rows):
    result = MagicMock()
    result.all.return_value = rows
    result.__iter__.return_value = iter(rows)
    return result


def _scalars_result(values):
    result = MagicMock()
    result.scalars.return_value.all.return_value = values
    return result


def test_admin_overview_denies_authenticated_non_system_admin():
    app = FastAPI()
    app.include_router(router)

    async def deny_admin():
        raise HTTPException(status_code=403, detail="Admin access required")

    async def unused_session():
        yield AsyncMock()

    app.dependency_overrides[require_system_admin] = deny_admin
    app.dependency_overrides[get_db_session] = unused_session
    response = TestClient(app).get("/api/admin-view/moderation/overview")
    assert response.status_code == 403
    assert response.json() == {"detail": "Admin access required"}


def test_admin_case_filters_accept_active_and_all_states():
    app = FastAPI()
    app.include_router(router)

    async def allow_admin():
        return {"id": 4}

    async def unused_session():
        yield AsyncMock()

    app.dependency_overrides[require_system_admin] = allow_admin
    app.dependency_overrides[get_db_session] = unused_session
    with patch.object(
        moderation_service,
        "search_cases",
        new=AsyncMock(return_value={"items": [], "total": 0}),
    ) as search:
        client = TestClient(app)
        assert client.get("/api/admin-view/moderation/cases?state=active").status_code == 200
        assert (
            client.get("/api/admin-view/moderation/cases?state=all&queue=urgent").status_code
            == 200
        )

    assert search.await_args_list[0].kwargs["state"] == "active"
    assert search.await_args_list[1].kwargs == {
        "queue": "urgent",
        "state": "all",
        "target_type": None,
        "search": None,
        "page": 1,
        "page_size": 30,
    }


@pytest.mark.asyncio
async def test_case_list_summary_is_triage_safe_and_identity_free():
    case = SimpleNamespace(
        id=7,
        target_type="direct_message",
        target_id=19,
        subject_player_id=22,
    )
    subject_rows = _rows_result([(22, "Case subject")])
    reason_rows = _rows_result([(7, "harassment"), (7, "spam")])
    target = SimpleNamespace(
        id=19,
        message_text="  A long-ish message\nwith safe triage context.  ",
    )
    target_result = MagicMock()
    target_result.scalars.return_value.all.return_value = [target]
    session = AsyncMock()
    session.execute.side_effect = [subject_rows, reason_rows, target_result]

    summaries = await moderation_service._case_list_summaries(session, [case], {7: 2})

    assert summaries == {
        7: {
            "subject_name": "Case subject",
            "target_title": "Direct Message",
            "target_snippet": "A long-ish message with safe triage context.",
            "target_media_type": None,
            "source": "member_report",
            "primary_reason": "harassment",
        }
    }
    serialized = repr(summaries)
    assert "reporter" not in serialized


@pytest.mark.asyncio
async def test_explicit_state_and_attention_filters_are_independent():
    count_result = MagicMock()
    count_result.scalar_one.return_value = 0
    session = AsyncMock()
    session.execute.side_effect = [count_result, _rows_result([])]

    with patch.object(
        moderation_admin_queries,
        "_queue_totals",
        new=AsyncMock(return_value={}),
    ):
        await moderation_admin_queries.search_cases(session, state="all", queue="urgent")

    compiled = str(session.execute.await_args_list[0].args[0])
    where_clause = compiled.split("WHERE", 1)[1]
    assert "moderation_cases.severity" in where_clause
    assert "moderation_cases.state" not in where_clause


@pytest.mark.asyncio
async def test_active_scope_includes_open_and_acknowledged():
    count_result = MagicMock()
    count_result.scalar_one.return_value = 0
    session = AsyncMock()
    session.execute.side_effect = [count_result, _rows_result([])]

    with patch.object(
        moderation_admin_queries,
        "_queue_totals",
        new=AsyncMock(return_value={}),
    ):
        await moderation_admin_queries.search_cases(session, state="active")

    compiled = str(session.execute.await_args_list[0].args[0])
    assert "moderation_cases.state IN" in compiled


@pytest.mark.asyncio
async def test_report_context_capture_failure_does_not_block_reporting():
    target = SimpleNamespace(message_text="reported message")
    case = SimpleNamespace(id=7)
    session = AsyncMock()
    session.execute.side_effect = [_result(None), _result(case)]
    resolve_target = AsyncMock(return_value=(target, 22))
    capture_text = AsyncMock(side_effect=TimeoutError("storage unavailable"))
    capture_context = AsyncMock(return_value=SimpleNamespace(id=90))

    with (
        patch.object(moderation_service, "_resolve_target", new=resolve_target),
        patch.object(moderation_evidence_service, "capture_text", new=capture_text),
        patch.object(
            moderation_evidence_service,
            "capture_chat_context",
            new=capture_context,
        ),
    ):
        receipt = await moderation_service.create_report(
            session,
            reporter_id=11,
            target_type="direct_message",
            target_id=50,
            reason="harassment",
            details=None,
        )

    assert receipt["target_type"] == "direct_message"
    capture_context.assert_awaited_once_with(session, 7)
    failures = [
        call.args[0]
        for call in session.add.call_args_list
        if getattr(call.args[0], "event_type", None) == "evidence_capture_failed"
    ]
    assert len(failures) == 1


@pytest.mark.asyncio
async def test_closed_case_rejects_new_enforcement_actions():
    case = SimpleNamespace(id=7, state="closed")
    session = AsyncMock()
    session.execute.return_value = _result(case)

    with pytest.raises(ValueError, match="case is closed"):
        await moderation_service.apply_action(session, 7, 4, "warn", "Policy basis", None)

    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_restore_requires_quarantined_visibility():
    case = SimpleNamespace(id=7, state="open")
    session = AsyncMock()
    session.execute.return_value = _result(case)

    with patch.object(
        moderation_service, "_target_visibility", new=AsyncMock(return_value="visible")
    ):
        with pytest.raises(ValueError, match="Only quarantined content"):
            await moderation_service.apply_action(session, 7, 4, "restore", "Reviewed", None)


@pytest.mark.asyncio
async def test_failed_job_retry_resets_bounded_attempt_cycle_and_audits():
    job = SimpleNamespace(
        id=11,
        status="failed",
        attempts=5,
        available_at=None,
        claimed_at=object(),
        last_error="provider timeout",
        case_id=9,
    )
    session = AsyncMock()
    session.execute.return_value = _result(job)

    result = await moderation_service.retry_failed_job(session, 11, 4, "Provider is healthy again")

    assert result["status"] == "pending"
    assert job.attempts == 0
    assert job.claimed_at is None
    assert job.last_error is None
    event = session.add.call_args.args[0]
    assert event.case_id == 9
    assert event.actor_user_id == 4
    assert event.event_type == "job_retry_requested"
    assert event.metadata_json["attempt_cycle_reset"] is True


@pytest.mark.asyncio
async def test_allowed_actions_make_removed_content_terminal():
    case = SimpleNamespace(id=7, state="acknowledged", subject_player_id=22)
    session = AsyncMock()
    session.execute.return_value = _result(None)
    with (
        patch.object(
            moderation_service, "_target_visibility", new=AsyncMock(return_value="removed")
        ),
        patch.object(moderation_service, "_subject_user", new=AsyncMock(return_value=None)),
    ):
        actions = await moderation_service._allowed_actions(session, case)

    assert "remove" not in actions
    assert "restore" not in actions
    assert "quarantine" not in actions
    assert actions == ["legal_hold", "dismiss", "warn", "interaction_lock"]


@pytest.mark.asyncio
async def test_account_suspend_sets_a_time_bound_full_account_state():
    case = SimpleNamespace(
        id=7,
        state="open",
        subject_player_id=22,
        current_action=None,
        closed_at=None,
        target_type="player",
        target_id=22,
        severity="ordinary",
        junior_involved=False,
        due_at=None,
        legal_hold=False,
        acknowledged_at=None,
        created_at=None,
        updated_at=None,
    )
    subject = SimpleNamespace(
        id=9,
        moderation_status="active",
        moderation_expires_at=None,
        moderation_case_id=None,
        moderation_updated_at=None,
    )
    session = AsyncMock()
    session.execute.side_effect = [_result(case), _result(None)]
    subject_lookup = AsyncMock(return_value=subject)

    with (
        patch.object(moderation_service, "_subject_user", new=subject_lookup),
        patch.object(
            moderation_service.notification_service, "create_notification", new=AsyncMock()
        ),
        patch.object(
            moderation_service.role_service,
            "ensure_can_become_inaccessible",
            new=AsyncMock(),
        ),
    ):
        await moderation_service.apply_action(
            session, 7, 4, "account_suspend", "Repeated safety violations", 72
        )

    assert subject.moderation_status == "suspended"
    assert subject.moderation_case_id == 7
    assert subject.moderation_expires_at > subject.moderation_updated_at
    assert case.current_action == "account_suspend"
    subject_lookup.assert_awaited_once_with(session, 22, for_update=True)


@pytest.mark.asyncio
async def test_account_restore_cannot_lift_another_cases_enforcement():
    case = SimpleNamespace(id=7, state="closed", subject_player_id=22)
    subject = SimpleNamespace(
        moderation_case_id=8,
        moderation_status="banned",
        moderation_expires_at=None,
    )
    session = AsyncMock()
    session.execute.return_value = _result(case)

    with patch.object(moderation_service, "_subject_user", new=AsyncMock(return_value=subject)):
        with pytest.raises(ValueError, match="not the active account enforcement"):
            await moderation_service.apply_action(
                session, 7, 4, "account_restore", "Reviewed by moderator", None
            )


@pytest.mark.asyncio
async def test_appeal_remains_eligible_when_a_later_case_action_replaced_the_label():
    case = SimpleNamespace(
        id=7,
        subject_player_id=22,
        current_action="warn",
        target_type="direct_message",
        target_id=31,
    )
    session = AsyncMock()
    session.get.return_value = case
    session.execute.side_effect = [_result(44), _result(None), _result(None)]

    result = await moderation_service.create_appeal(
        session, 22, 7, "Please review the full context for this restriction."
    )

    assert result["case_id"] == 7
    appeal = session.add.call_args_list[0].args[0]
    assert appeal.player_id == 22
    assert appeal.statement.startswith("Please review")
    flagship_job = session.add.call_args_list[2].args[0]
    assert flagship_job.idempotency_key.startswith("appeal:")
    assert flagship_job.case_id == 7


@pytest.mark.asyncio
async def test_case_allows_only_one_appeal_decision_cycle():
    case = SimpleNamespace(id=7, subject_player_id=22, current_action="account_suspend")
    session = AsyncMock()
    session.get.return_value = case
    session.execute.return_value = _result(SimpleNamespace(id=5, status="upheld"))

    with pytest.raises(ValueError, match="already exists"):
        await moderation_service.create_appeal(
            session, 22, 7, "Please reconsider this decision with the new context."
        )


@pytest.mark.asyncio
async def test_case_search_uses_stable_due_order_and_exact_id_search():
    count_result = MagicMock()
    count_result.scalar_one.return_value = 61
    session = AsyncMock()
    session.execute.side_effect = [count_result, _rows_result([])]

    with patch.object(
        moderation_admin_queries,
        "_queue_totals",
        new=AsyncMock(return_value={}),
    ):
        result = await moderation_admin_queries.search_cases(
            session, search="#17", page=3, page_size=30
        )

    count_sql = str(session.execute.await_args_list[0].args[0])
    page_sql = str(session.execute.await_args_list[1].args[0])
    assert "CAST" not in count_sql
    assert "moderation_cases.id =" in count_sql
    assert "moderation_cases.target_id =" in count_sql
    assert "moderation_cases.due_at ASC NULLS LAST" in page_sql
    assert "moderation_cases.created_at ASC" in page_sql
    assert "moderation_cases.id ASC" in page_sql
    assert result["page"] == 3
    assert result["total_pages"] == 3


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("target_type", "objects", "expected_title", "expected_text"),
    [
        (
            "direct_message",
            [
                SimpleNamespace(
                    message_text="Direct text", created_at=None, moderation_visibility="visible"
                )
            ],
            "Direct Message",
            "Direct text",
        ),
        (
            "league_message",
            [
                SimpleNamespace(
                    message_text="League text",
                    league_id=8,
                    created_at=None,
                    moderation_visibility="visible",
                )
            ],
            "League Message",
            "League text",
        ),
        (
            "court_review",
            [
                SimpleNamespace(
                    review_text="Court text",
                    court_id=3,
                    rating=4,
                    created_at=None,
                    moderation_visibility="visible",
                ),
                SimpleNamespace(name="Harbor Courts"),
            ],
            "Review of Harbor Courts",
            "Court text",
        ),
        (
            "court_photo",
            [
                SimpleNamespace(
                    caption="Photo text",
                    court_id=3,
                    created_at=None,
                    moderation_visibility="visible",
                ),
                SimpleNamespace(name="Harbor Courts"),
            ],
            "Photo at Harbor Courts",
            "Photo text",
        ),
        (
            "court_review_photo",
            [
                SimpleNamespace(review_id=6, created_at=None, moderation_visibility="visible"),
                SimpleNamespace(court_id=3),
                SimpleNamespace(name="Harbor Courts"),
            ],
            "Review photo at Harbor Courts",
            None,
        ),
    ],
)
async def test_target_context_renders_every_content_type(
    target_type, objects, expected_title, expected_text
):
    session = AsyncMock()
    session.get.side_effect = objects
    case = SimpleNamespace(target_type=target_type, target_id=19)

    context = await moderation_admin_queries._target_context(session, case)

    assert context["available"] is True
    assert context["title"] == expected_title
    assert context["text"] == expected_text
    assert context["visibility"] == "visible"


@pytest.mark.asyncio
async def test_case_detail_serializes_provider_review_without_reporter_identity():
    created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    case = SimpleNamespace(
        id=7,
        target_type="player",
        target_id=22,
        subject_player_id=None,
        state="open",
        severity="ordinary",
        incident_type=None,
        junior_involved=False,
        due_at=None,
        urgent_since_at=None,
        legal_hold=False,
        current_action=None,
        acknowledged_at=None,
        dispositioned_at=None,
        closed_at=None,
        created_at=created_at,
        updated_at=created_at,
    )
    provider_event = SimpleNamespace(
        id=1,
        event_type="provider_classification",
        actor_user_id=None,
        reason=None,
        metadata_json={
            "flagged": True,
            "categories": {"harassment": True},
            "model": "provider-model",
            "triage": {"recommendation": "owner_review", "rationale": "Context"},
        },
        created_at=created_at,
    )
    report = SimpleNamespace(
        id=3,
        reason="harassment",
        details="Repeated conduct",
        reporter_player_id=999,
        created_at=created_at,
    )
    session = AsyncMock()
    session.get.side_effect = [case, SimpleNamespace(id=22, full_name="Subject", nickname=None)]
    session.execute.side_effect = [
        _scalars_result([provider_event]),
        _scalars_result([report]),
        _scalars_result([]),
        _scalars_result([]),
        _scalars_result([]),
    ]

    detail = await moderation_admin_queries.get_case(session, 7)

    assert detail["provider_reviews"][0]["categories"] == {"harassment": True}
    assert detail["provider_reviews"][0]["recommendation"]["rationale"] == "Context"
    assert detail["reports"] == [
        {
            "id": 3,
            "reason": "harassment",
            "details": "Repeated conduct",
            "created_at": created_at,
        }
    ]
    assert "reporter" not in repr(detail)


@pytest.mark.asyncio
async def test_legal_hold_transition_requires_a_change_and_records_history():
    case = SimpleNamespace(
        id=7,
        state="open",
        legal_hold=False,
        acknowledged_at=None,
        severity="ordinary",
        dispositioned_at=None,
        closed_at=None,
        target_type="player",
        target_id=22,
        subject_player_id=None,
        current_action=None,
        junior_involved=False,
        due_at=None,
        urgent_since_at=None,
        created_at=None,
        updated_at=None,
    )
    session = AsyncMock()
    session.execute.return_value = _result(case)

    await moderation_service.apply_action(
        session, 7, 4, "legal_hold", "Preserve for legal review", None, True
    )

    assert case.legal_hold is True
    event = session.add.call_args.args[0]
    assert event.event_type == "human_legal_hold"
    assert event.metadata_json["enabled"] is True

    session.reset_mock()
    session.execute.return_value = _result(case)
    with pytest.raises(ValueError, match="already in the requested state"):
        await moderation_service.apply_action(
            session, 7, 4, "legal_hold", "Duplicate request", None, True
        )


@pytest.mark.asyncio
async def test_closing_case_closes_open_reports():
    case = SimpleNamespace(
        id=7,
        state="open",
        legal_hold=False,
        acknowledged_at=None,
        severity="ordinary",
        dispositioned_at=None,
        closed_at=None,
        target_type="player",
        target_id=22,
        subject_player_id=None,
        current_action=None,
        junior_involved=False,
        due_at=None,
        urgent_since_at=None,
        created_at=None,
        updated_at=None,
    )
    session = AsyncMock()
    session.execute.side_effect = [_result(case), MagicMock()]

    with patch.object(moderation_evidence_service, "schedule_case_purge", new=AsyncMock()):
        await moderation_service.apply_action(
            session, 7, 4, "dismiss", "No policy violation", None
        )

    update_sql = str(session.execute.await_args_list[1].args[0])
    assert case.state == "dismissed"
    assert "UPDATE moderation_reports" in update_sql
    assert "moderation_reports.status" in update_sql


@pytest.mark.asyncio
async def test_media_removal_enqueues_durable_deletion_job():
    target = SimpleNamespace(moderation_visibility="visible", s3_key="courts/photo.jpg")
    case = SimpleNamespace(target_type="court_photo", target_id=19)
    session = AsyncMock()
    session.get.return_value = target

    await moderation_service._set_visibility(session, case, "removed")

    assert target.moderation_visibility == "removed"
    statement = session.execute.await_args.args[0]
    sql = str(statement)
    assert "INSERT INTO media_deletion_jobs" in sql
    assert "ON CONFLICT (object_key) DO NOTHING" in sql
    assert statement.compile().params["object_key"] == "courts/photo.jpg"


@pytest.mark.asyncio
async def test_overview_uses_aggregate_worker_and_alert_counts():
    created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    job_result = MagicMock()
    job_result.one.return_value = SimpleNamespace(
        pending=4,
        processing=2,
        failed=1,
        stale=1,
        oldest_pending_at=created_at,
        latest_completion_at=created_at,
    )
    alert_result = MagicMock()
    alert_result.one.return_value = SimpleNamespace(
        pending=3, failed=1, latest_delivery_at=created_at
    )
    urgent_result = MagicMock()
    urgent_result.one.return_value = SimpleNamespace(unacknowledged_urgent=2, ordinary_due_soon=4)
    session = AsyncMock()
    session.execute.side_effect = [job_result, alert_result, urgent_result]
    queues = {"due": 5, "overdue": 2}

    with (
        patch.object(
            moderation_admin_queries,
            "_queue_totals",
            new=AsyncMock(return_value=queues),
        ),
        patch.object(moderation_worker, "moderation_mode", return_value="shadow"),
    ):
        result = await moderation_admin_queries.overview(session)

    assert session.execute.await_count == 3
    assert result["jobs"]["pending"] == 4
    assert result["alerts"]["failed"] == 1
    assert result["sla"] == {
        "unacknowledged_urgent": 2,
        "ordinary_due_soon": 4,
        "overdue": 2,
    }
