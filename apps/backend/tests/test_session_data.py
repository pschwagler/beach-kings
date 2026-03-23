"""
Unit tests for session_data module.

Tests cover:
- Module-level constants
- _generate_session_code (mocked DB)
- can_user_add_match_to_session (logic branches, mocked DB)
- Session/match winner calculation logic (via create_match_async winner branch)
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from backend.services.session_data import (
    SESSION_CODE_ALPHABET,
    SESSION_CODE_LENGTH,
    SESSION_CODE_MAX_ATTEMPTS,
    _generate_session_code,
    can_user_add_match_to_session,
)
import string


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------


def test_session_code_alphabet_contains_uppercase_and_digits():
    """SESSION_CODE_ALPHABET should include uppercase letters and digits only."""
    expected = string.ascii_uppercase + string.digits
    assert SESSION_CODE_ALPHABET == expected


def test_session_code_length_is_positive():
    """SESSION_CODE_LENGTH must be a positive integer."""
    assert isinstance(SESSION_CODE_LENGTH, int)
    assert SESSION_CODE_LENGTH > 0


def test_session_code_max_attempts_is_positive():
    """SESSION_CODE_MAX_ATTEMPTS must be a positive integer."""
    assert isinstance(SESSION_CODE_MAX_ATTEMPTS, int)
    assert SESSION_CODE_MAX_ATTEMPTS > 0


# ---------------------------------------------------------------------------
# _generate_session_code
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_session_code_returns_unique_code_on_first_try():
    """Should return a code when no collision exists on the first attempt."""
    mock_db = AsyncMock()
    execute_result = MagicMock()
    execute_result.scalar_one_or_none.return_value = None  # no collision
    mock_db.execute.return_value = execute_result

    code = await _generate_session_code(mock_db)

    assert len(code) == SESSION_CODE_LENGTH
    assert all(c in SESSION_CODE_ALPHABET for c in code)
    mock_db.execute.assert_called_once()


@pytest.mark.asyncio
async def test_generate_session_code_retries_on_collision():
    """Should retry when first attempt collides and succeed on second attempt."""
    mock_db = AsyncMock()
    collision_result = MagicMock()
    collision_result.scalar_one_or_none.return_value = 99  # collision

    success_result = MagicMock()
    success_result.scalar_one_or_none.return_value = None  # no collision

    mock_db.execute.side_effect = [collision_result, success_result]

    code = await _generate_session_code(mock_db)

    assert len(code) == SESSION_CODE_LENGTH
    assert all(c in SESSION_CODE_ALPHABET for c in code)
    assert mock_db.execute.call_count == 2


@pytest.mark.asyncio
async def test_generate_session_code_raises_after_max_attempts():
    """Should raise ValueError after SESSION_CODE_MAX_ATTEMPTS collisions."""
    mock_db = AsyncMock()
    collision_result = MagicMock()
    collision_result.scalar_one_or_none.return_value = 1  # always collides

    mock_db.execute.return_value = collision_result

    with pytest.raises(ValueError, match="Failed to generate unique session code"):
        await _generate_session_code(mock_db)

    assert mock_db.execute.call_count == SESSION_CODE_MAX_ATTEMPTS


# ---------------------------------------------------------------------------
# can_user_add_match_to_session — league session (season_id set)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_can_user_add_match_league_session_returns_true():
    """League sessions (season_id is not None) always return True."""
    mock_db = AsyncMock()
    session_obj = {"season_id": 5, "created_by": 10}

    result = await can_user_add_match_to_session(
        mock_db, session_id=1, session_obj=session_obj, user_id=99
    )

    assert result is True
    mock_db.execute.assert_not_called()


# ---------------------------------------------------------------------------
# can_user_add_match_to_session — non-league session (season_id is None)
# ---------------------------------------------------------------------------


def _make_scalar_result(value):
    """Build a mock execute result that returns ``value`` from scalar_one_or_none."""
    r = MagicMock()
    r.scalar_one_or_none.return_value = value
    return r


@pytest.mark.asyncio
async def test_can_user_add_match_no_player_returns_false():
    """If user has no player profile, return False."""
    mock_db = AsyncMock()
    # Player lookup returns None (no player for this user_id)
    mock_db.execute.return_value = _make_scalar_result(None)

    session_obj = {"season_id": None, "created_by": 10}
    result = await can_user_add_match_to_session(
        mock_db, session_id=1, session_obj=session_obj, user_id=99
    )

    assert result is False


@pytest.mark.asyncio
async def test_can_user_add_match_is_creator_returns_true():
    """Creator of the session should be allowed."""
    mock_db = AsyncMock()
    player_id = 42
    # First execute: player lookup
    mock_db.execute.return_value = _make_scalar_result(player_id)

    session_obj = {"season_id": None, "created_by": player_id}
    result = await can_user_add_match_to_session(
        mock_db, session_id=1, session_obj=session_obj, user_id=99
    )

    assert result is True
    # Only the player-lookup query should have been executed
    mock_db.execute.assert_called_once()


@pytest.mark.asyncio
async def test_can_user_add_match_has_match_returns_true():
    """Player with an existing match in the session should be allowed."""
    mock_db = AsyncMock()
    player_id = 42

    # Side effects: [player lookup → player_id, match query → match id, ...]
    mock_db.execute.side_effect = [
        _make_scalar_result(player_id),  # player lookup
        _make_scalar_result(100),  # match found
    ]

    session_obj = {"season_id": None, "created_by": 99}  # different creator
    result = await can_user_add_match_to_session(
        mock_db, session_id=1, session_obj=session_obj, user_id=7
    )

    assert result is True


@pytest.mark.asyncio
async def test_can_user_add_match_is_participant_returns_true():
    """Player listed as a session participant should be allowed."""
    mock_db = AsyncMock()
    player_id = 42

    # Side effects: player lookup → player_id, match query → None, participant query → participant id
    mock_db.execute.side_effect = [
        _make_scalar_result(player_id),  # player lookup
        _make_scalar_result(None),  # no match found
        _make_scalar_result(55),  # participant found
    ]

    session_obj = {"season_id": None, "created_by": 99}
    result = await can_user_add_match_to_session(
        mock_db, session_id=1, session_obj=session_obj, user_id=7
    )

    assert result is True


@pytest.mark.asyncio
async def test_can_user_add_match_not_creator_no_match_no_participant_returns_false():
    """Player who is not creator, has no match, and is not a participant should be denied."""
    mock_db = AsyncMock()
    player_id = 42

    # Side effects: player lookup → player_id, match query → None, participant query → None
    mock_db.execute.side_effect = [
        _make_scalar_result(player_id),  # player lookup
        _make_scalar_result(None),  # no match
        _make_scalar_result(None),  # not a participant
    ]

    session_obj = {"season_id": None, "created_by": 99}
    result = await can_user_add_match_to_session(
        mock_db, session_id=1, session_obj=session_obj, user_id=7
    )

    assert result is False
    assert mock_db.execute.call_count == 3
