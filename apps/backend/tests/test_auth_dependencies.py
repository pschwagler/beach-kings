"""
Unit tests for auth_dependencies helper functions.
"""

from datetime import datetime, timezone, timedelta
from backend.api.auth_dependencies import _is_deletion_expired


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
        past_naive = (datetime.now(timezone.utc) - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S")
        assert _is_deletion_expired({"id": 1, "deletion_scheduled_at": past_naive}) is True
