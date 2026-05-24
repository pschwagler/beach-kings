"""
Unit tests for backend.services.my_games_service helpers.

Focused on pure functions that can be exercised without a DB.
"""

import pytest

from backend.services.my_games_service import _normalize_session_date


class TestNormalizeSessionDate:
    """Tests for _normalize_session_date."""

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("2025-11-04", "2025-11-04"),
            ("2026-01-20", "2026-01-20"),
            ("5/17/2026", "2026-05-17"),
            ("12/11/2025", "2025-12-11"),
            ("1/1/2025", "2025-01-01"),
            ("05/17/2026", "2026-05-17"),
        ],
    )
    def test_known_formats_normalize_to_iso(self, raw, expected):
        """Both ISO and US-style date strings normalize to YYYY-MM-DD."""
        assert _normalize_session_date(raw) == expected

    @pytest.mark.parametrize("raw", [None, "", "   "])
    def test_empty_inputs_return_none(self, raw):
        """None, empty, and whitespace-only strings return None."""
        assert _normalize_session_date(raw) is None

    @pytest.mark.parametrize(
        "raw",
        ["not-a-date", "2026/05/17", "17-05-2026", "2026-13-99"],
    )
    def test_unrecognized_formats_return_none(self, raw):
        """Unknown formats return None rather than raising."""
        assert _normalize_session_date(raw) is None
