"""
Unit tests for auth_dependencies helper functions.
"""

from datetime import datetime, timezone, timedelta
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from backend.api.auth_dependencies import _enforce_account_access, _is_deletion_expired


class TestIsDeletionExpired:
    """Tests for _is_deletion_expired helper."""

    def test_no_deletion_scheduled(self):
        """User with no deletion_scheduled_at should return False."""
        assert _is_deletion_expired({"id": 1}) is False
        assert _is_deletion_expired({"id": 1, "deletion_scheduled_at": None}) is False

    def test_deletion_in_future(self):
        """User with future deletion date should return False."""
        future = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        assert _is_deletion_expired({"id": 1, "deletion_scheduled_at": future}) is False

    def test_deletion_in_past(self):
        """User with past deletion date should return True."""
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        assert _is_deletion_expired({"id": 1, "deletion_scheduled_at": past}) is True

    def test_malformed_timestamp(self):
        """Malformed timestamp should return False (not block user)."""
        assert _is_deletion_expired({"id": 1, "deletion_scheduled_at": "not-a-date"}) is False

    def test_naive_timestamp_treated_as_utc(self):
        """Naive (no tz) timestamp should be treated as UTC."""
        past_naive = (datetime.now(timezone.utc) - timedelta(hours=1)).strftime(
            "%Y-%m-%dT%H:%M:%S"
        )
        assert _is_deletion_expired({"id": 1, "deletion_scheduled_at": past_naive}) is True


def _request(method: str, path: str) -> Request:
    return Request({"type": "http", "method": method, "path": path, "headers": []})


def test_suspended_account_can_only_use_account_management_routes():
    user = {"id": 7, "moderation_status": "suspended", "moderation_case_id": 12}

    allowed = _enforce_account_access(_request("GET", "/api/moderation/account-status"), user)
    assert allowed["moderation_status"] == "suspended"

    with pytest.raises(HTTPException) as exc_info:
        _enforce_account_access(_request("GET", "/api/leagues"), user)
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["code"] == "account_suspended"


def test_expired_suspension_restores_normal_access():
    user = {
        "id": 7,
        "moderation_status": "suspended",
        "moderation_expires_at": (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(),
    }
    resolved = _enforce_account_access(_request("POST", "/api/messages"), user)
    assert resolved["moderation_status"] == "active"


def test_banned_account_can_still_delete_itself():
    user = {"id": 7, "moderation_status": "banned", "moderation_case_id": 12}
    assert _enforce_account_access(_request("DELETE", "/api/users/me"), user)[
        "moderation_status"
    ] == "banned"
