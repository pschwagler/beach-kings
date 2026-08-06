import pytest
from pydantic import ValidationError

from backend.models.schemas import (
    InteractionCapabilityBatchRequest,
    ModerationActionRequest,
    ModerationAppealCreate,
    ModerationReportCreate,
    ModerationRetryRequest,
    UserResponse,
)
from backend.api.routes.auth import _build_user_response
from datetime import datetime, timezone


def test_report_details_are_capped_at_1000_characters():
    with pytest.raises(ValidationError):
        ModerationReportCreate(
            target_type="player",
            target_id=2,
            reason="harassment",
            details="x" * 1001,
        )


def test_report_reason_is_closed_enum():
    with pytest.raises(ValidationError):
        ModerationReportCreate(target_type="player", target_id=2, reason="dislike")


def test_interaction_lock_duration_is_bounded():
    with pytest.raises(ValidationError):
        ModerationActionRequest(action="interaction_lock", reason="Safety review", lock_hours=721)


def test_account_suspension_uses_the_same_bounded_duration():
    request = ModerationActionRequest(
        action="account_suspend", reason="Escalated safety review", lock_hours=168
    )
    assert request.lock_hours == 168


def test_appeal_requires_a_meaningful_statement():
    with pytest.raises(ValidationError):
        ModerationAppealCreate(case_id=4, statement="too short")
    with pytest.raises(ValidationError):
        ModerationAppealCreate(case_id=4, statement=" " * 12)


def test_legal_hold_requires_explicit_boolean_state():
    request = ModerationActionRequest(
        action="legal_hold", reason="Preservation request", legal_hold=True
    )
    assert request.legal_hold is True


def test_retry_reason_cannot_be_blank():
    with pytest.raises(ValidationError):
        ModerationRetryRequest(reason="")


def test_capability_batch_rejects_duplicates_and_more_than_100_players():
    with pytest.raises(ValidationError):
        InteractionCapabilityBatchRequest(player_ids=[2, 2])
    with pytest.raises(ValidationError):
        InteractionCapabilityBatchRequest(player_ids=list(range(1, 102)))


def test_auth_me_response_accepts_live_moderation_datetimes():
    expiry = datetime.now(timezone.utc)
    response = _build_user_response(
        {
            "id": 3,
            "phone_number": None,
            "email": "player@example.com",
            "is_verified": True,
            "auth_provider": "phone",
            "password_hash": "hash",
            "created_at": "2026-08-06T12:00:00+00:00",
        },
        {
            "account_status": "suspended",
            "account_expires_at": expiry,
            "account_case_id": 8,
            "interaction_restricted_until": expiry,
            "interaction_restriction_case_id": 9,
        },
    )

    assert isinstance(response, UserResponse)
    assert response.moderation_expires_at == expiry
    assert response.interaction_restricted_until == expiry
