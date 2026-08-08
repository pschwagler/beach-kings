"""
Unit tests for backend.services.my_games_service helpers.

Focused on pure functions that can be exercised without a DB.
"""

from types import SimpleNamespace

import pytest

from backend.database.models import SessionStatus
from backend.services.my_games_service import _build_entry, _normalize_session_date


def _fake_row(session_status):
    """Build a minimal query-row stand-in for _build_entry.

    Only the fields _build_entry reads are populated. The player under test
    (id=1) is team1_player1; the rest are filler so the mapping runs cleanly.
    """
    return SimpleNamespace(
        match_id=100,
        session_id=25,
        session_status=session_status,
        session_date="2026-02-05",
        court_name="Court 1",
        league_name="QBK Open Men",
        league_id=1,
        winner=1,
        elo_change=12.4,
        team1_score=21,
        team2_score=19,
        team1_player1_id=1,
        team1_player2_id=2,
        team2_player1_id=3,
        team2_player2_id=4,
        team1_player1_name="Me",
        team1_player2_name="Partner",
        team2_player1_name="Opp A",
        team2_player2_name="Opp B",
    )


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


class TestSessionSubmittedFlag:
    """Tests for the session_submitted flag derived in _build_entry.

    Regression guard: EDITED sessions are locked/finalized and must report
    session_submitted=True, otherwise the mobile games list shows a phantom
    "LIVE" pill on every edited session.
    """

    @pytest.mark.parametrize(
        ("status", "expected_submitted"),
        [
            (SessionStatus.SUBMITTED, True),
            (SessionStatus.EDITED, True),
            (SessionStatus.ACTIVE, False),
            # Raw string statuses (some query paths surface the value, not the enum).
            ("SUBMITTED", True),
            ("EDITED", True),
            ("ACTIVE", False),
        ],
    )
    def test_only_active_is_unsubmitted(self, status, expected_submitted):
        """Everything except ACTIVE counts as submitted for display."""
        entry = _build_entry(_fake_row(status), player_id=1)
        assert entry["session_submitted"] is expected_submitted


def test_deleted_opponent_is_a_non_clickable_tombstone():
    row = _fake_row(SessionStatus.SUBMITTED)
    row.t2p1_deleted_at = "2026-08-06T00:00:00Z"

    entry = _build_entry(row, player_id=1)

    assert entry["opponent_names"] == ["Deleted Player", "Opp B"]
    assert entry["opponent_ids"] == [None, 4]
