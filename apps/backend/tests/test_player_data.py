"""
Unit tests for player_data module.

Tests cover pure/synchronous functions that require no database connection:
- generate_player_initials: initials generation from player names
- _normalize_list_str: list normalisation helper
- _filter_search (query-builder passthrough smoke test)
- _filter_location (query-builder passthrough smoke test)
- _filter_demographics (query-builder passthrough smoke test)

Re-export smoke tests verify the module exposes all expected symbols.
"""

import pytest
from unittest.mock import MagicMock

from backend.services.player_data import (
    generate_player_initials,
    _normalize_list_str,
    _filter_placeholders,
    _filter_search,
    _filter_location,
    _filter_demographics,
)
from backend.services import player_data


# ---------------------------------------------------------------------------
# Re-export smoke tests
# ---------------------------------------------------------------------------


def test_player_data_exports_public_functions():
    """player_data should expose all public CRUD and search helpers."""
    for name in [
        "generate_player_initials",
        "list_players_search",
        "get_all_player_names",
        "get_player_by_user_id",
        "get_player_by_user_id_with_stats",
        "upsert_user_player",
        "get_or_create_player",
        "get_player_by_id",
    ]:
        assert hasattr(player_data, name), f"player_data missing: {name}"


def test_player_data_exports_filter_helpers():
    """player_data should expose filter helper functions."""
    for name in [
        "_normalize_list_str",
        "_filter_placeholders",
        "_filter_search",
        "_filter_location",
        "_filter_league_membership",
        "_filter_demographics",
    ]:
        assert hasattr(player_data, name), f"player_data missing: {name}"


# ---------------------------------------------------------------------------
# generate_player_initials
# ---------------------------------------------------------------------------


def test_generate_player_initials_first_last():
    """First + last name should produce two uppercased initials."""
    assert generate_player_initials("Alice Johnson") == "AJ"


def test_generate_player_initials_uses_first_and_last_of_multi_word():
    """With three words, uses the first letter of the first and last word."""
    assert generate_player_initials("Mary Jane Watson") == "MW"


def test_generate_player_initials_single_word_two_chars():
    """Single word of 2+ chars returns the first two chars uppercased."""
    assert generate_player_initials("Alice") == "AL"


def test_generate_player_initials_single_word_one_char():
    """Single word of exactly 1 char returns that char uppercased."""
    assert generate_player_initials("A") == "A"


def test_generate_player_initials_empty_string():
    """Empty string returns empty string."""
    assert generate_player_initials("") == ""


def test_generate_player_initials_whitespace_only():
    """Whitespace-only string returns empty string."""
    assert generate_player_initials("   ") == ""


def test_generate_player_initials_case_insensitive_input():
    """Input casing doesn't matter — output is always uppercased."""
    assert generate_player_initials("alice johnson") == "AJ"
    assert generate_player_initials("ALICE JOHNSON") == "AJ"


def test_generate_player_initials_extra_spaces():
    """Extra whitespace between words is handled correctly."""
    result = generate_player_initials("  Bob   Smith  ")
    assert result == "BS"


# ---------------------------------------------------------------------------
# _normalize_list_str
# ---------------------------------------------------------------------------


def test_normalize_list_str_basic():
    """Should lowercase and strip all strings."""
    result = _normalize_list_str(["  Male ", "FEMALE"])
    assert result == ["male", "female"]


def test_normalize_list_str_filters_empty():
    """Empty strings and whitespace-only strings are filtered out."""
    result = _normalize_list_str(["", "  ", "A"])
    assert result == ["a"]


def test_normalize_list_str_filters_none_elements():
    """None elements inside the list are filtered out."""
    result = _normalize_list_str([None, "B", None])
    assert result == ["b"]


def test_normalize_list_str_empty_input():
    """Empty list returns empty list."""
    assert _normalize_list_str([]) == []


def test_normalize_list_str_none_input():
    """None input returns empty list."""
    assert _normalize_list_str(None) == []


# ---------------------------------------------------------------------------
# _filter_placeholders (SQLAlchemy stmt pass-through)
# ---------------------------------------------------------------------------


def test_filter_placeholders_include_true_returns_stmt_unchanged():
    """When include_placeholders=True the statement should be returned as-is."""
    stmt = MagicMock()
    result = _filter_placeholders(stmt, include_placeholders=True)
    assert result is stmt
    stmt.where.assert_not_called()


def test_filter_placeholders_include_false_adds_where():
    """When include_placeholders=False a .where() filter must be applied."""
    stmt = MagicMock()
    filtered = MagicMock()
    stmt.where.return_value = filtered

    result = _filter_placeholders(stmt, include_placeholders=False)

    stmt.where.assert_called_once()
    assert result is filtered


# ---------------------------------------------------------------------------
# _filter_search (SQLAlchemy stmt pass-through)
# ---------------------------------------------------------------------------


def test_filter_search_with_query_adds_where():
    """A non-empty query string must add a .where() clause."""
    stmt = MagicMock()
    filtered = MagicMock()
    stmt.where.return_value = filtered

    result = _filter_search(stmt, q="alice")

    stmt.where.assert_called_once()
    assert result is filtered


def test_filter_search_empty_string_returns_stmt_unchanged():
    """An empty query string should not modify the statement."""
    stmt = MagicMock()
    result = _filter_search(stmt, q="")
    assert result is stmt
    stmt.where.assert_not_called()


def test_filter_search_none_returns_stmt_unchanged():
    """None query should not modify the statement."""
    stmt = MagicMock()
    result = _filter_search(stmt, q=None)
    assert result is stmt
    stmt.where.assert_not_called()


def test_filter_search_whitespace_only_returns_stmt_unchanged():
    """Whitespace-only query should not modify the statement."""
    stmt = MagicMock()
    result = _filter_search(stmt, q="   ")
    assert result is stmt
    stmt.where.assert_not_called()


# ---------------------------------------------------------------------------
# _filter_location (SQLAlchemy stmt pass-through)
# ---------------------------------------------------------------------------


def test_filter_location_with_ids_adds_where():
    """Non-empty location_ids list must add a .where() clause."""
    stmt = MagicMock()
    filtered = MagicMock()
    stmt.where.return_value = filtered

    result = _filter_location(stmt, location_ids=["socal_sd", "socal_la"])

    stmt.where.assert_called_once()
    assert result is filtered


def test_filter_location_empty_list_returns_stmt_unchanged():
    """Empty list should not modify the statement."""
    stmt = MagicMock()
    result = _filter_location(stmt, location_ids=[])
    assert result is stmt
    stmt.where.assert_not_called()


def test_filter_location_none_returns_stmt_unchanged():
    """None location_ids should not modify the statement."""
    stmt = MagicMock()
    result = _filter_location(stmt, location_ids=None)
    assert result is stmt
    stmt.where.assert_not_called()


# ---------------------------------------------------------------------------
# _filter_demographics (SQLAlchemy stmt pass-through)
# ---------------------------------------------------------------------------


def test_filter_demographics_gender_filter_adds_where():
    """A non-empty genders list must add a .where() clause."""
    stmt = MagicMock()
    filtered = MagicMock()
    stmt.where.return_value = filtered

    result = _filter_demographics(stmt, genders=["male"], levels=None)

    stmt.where.assert_called_once()
    assert result is filtered


def test_filter_demographics_level_filter_adds_where():
    """A non-empty levels list must add a .where() clause."""
    stmt = MagicMock()
    # First where call (from levels) returns a chained mock
    after_first = MagicMock()
    stmt.where.return_value = after_first

    _filter_demographics(stmt, genders=None, levels=["A", "B"])

    stmt.where.assert_called_once()


def test_filter_demographics_both_filters_chain():
    """Both genders and levels provided should result in two .where() calls chained."""
    stmt = MagicMock()
    after_gender = MagicMock()
    after_level = MagicMock()
    stmt.where.return_value = after_gender
    after_gender.where.return_value = after_level

    result = _filter_demographics(stmt, genders=["female"], levels=["A"])

    stmt.where.assert_called_once()
    after_gender.where.assert_called_once()
    assert result is after_level


def test_filter_demographics_none_inputs_return_stmt_unchanged():
    """None for both genders and levels should not modify the statement."""
    stmt = MagicMock()
    result = _filter_demographics(stmt, genders=None, levels=None)
    assert result is stmt
    stmt.where.assert_not_called()


def test_filter_demographics_empty_lists_return_stmt_unchanged():
    """Empty lists for both genders and levels should not modify the statement."""
    stmt = MagicMock()
    result = _filter_demographics(stmt, genders=[], levels=[])
    assert result is stmt
    stmt.where.assert_not_called()
