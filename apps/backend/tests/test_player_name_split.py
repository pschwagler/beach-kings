"""
Unit tests for first_name/last_name split logic.

Tests cover:
- resolve_name_fields helper: computing first/last from full_name and vice versa
- SignupRequest model validator: accepts first+last OR full_name
- PlayerUpdate model validator: recomputes full_name when first/last provided
"""

import pytest

from backend.services.player_data import resolve_name_fields


# ---------------------------------------------------------------------------
# resolve_name_fields — first+last → full_name
# ---------------------------------------------------------------------------


class TestResolveNameFieldsFromFirstLast:
    """When first_name and last_name are provided, compute full_name."""

    def test_basic_first_last(self):
        result = resolve_name_fields(first_name="Patrick", last_name="Schwagler")
        assert result == {
            "first_name": "Patrick",
            "last_name": "Schwagler",
            "full_name": "Patrick Schwagler",
        }

    def test_strips_whitespace(self):
        result = resolve_name_fields(first_name="  Patrick  ", last_name="  Schwagler  ")
        assert result["first_name"] == "Patrick"
        assert result["last_name"] == "Schwagler"
        assert result["full_name"] == "Patrick Schwagler"

    def test_empty_last_name(self):
        """Single-word name: first_name only, empty last_name."""
        result = resolve_name_fields(first_name="Pelé", last_name="")
        assert result == {
            "first_name": "Pelé",
            "last_name": "",
            "full_name": "Pelé",
        }

    def test_first_last_override_full_name(self):
        """When all three provided, first+last take precedence."""
        result = resolve_name_fields(
            first_name="Patrick", last_name="Schwagler", full_name="Old Name"
        )
        assert result["full_name"] == "Patrick Schwagler"


# ---------------------------------------------------------------------------
# resolve_name_fields — full_name → first+last
# ---------------------------------------------------------------------------


class TestResolveNameFieldsFromFullName:
    """When only full_name is provided, split into first_name/last_name."""

    def test_two_word_name(self):
        result = resolve_name_fields(full_name="Patrick Schwagler")
        assert result == {
            "first_name": "Patrick",
            "last_name": "Schwagler",
            "full_name": "Patrick Schwagler",
        }

    def test_multi_word_last_name(self):
        """Everything after the first space goes to last_name."""
        result = resolve_name_fields(full_name="Mary Jane Watson")
        assert result == {
            "first_name": "Mary",
            "last_name": "Jane Watson",
            "full_name": "Mary Jane Watson",
        }

    def test_single_word_name(self):
        result = resolve_name_fields(full_name="Pelé")
        assert result == {
            "first_name": "Pelé",
            "last_name": "",
            "full_name": "Pelé",
        }

    def test_strips_full_name(self):
        result = resolve_name_fields(full_name="  Patrick  Schwagler  ")
        assert result["first_name"] == "Patrick"
        assert result["last_name"] == "Schwagler"
        assert result["full_name"] == "Patrick Schwagler"


# ---------------------------------------------------------------------------
# resolve_name_fields — edge cases
# ---------------------------------------------------------------------------


class TestResolveNameFieldsEdgeCases:
    """Edge cases for name resolution."""

    def test_all_none_returns_none(self):
        """When nothing is provided, return None."""
        result = resolve_name_fields()
        assert result is None

    def test_only_first_name_no_last(self):
        """Only first_name provided, no last_name."""
        result = resolve_name_fields(first_name="Patrick")
        assert result == {
            "first_name": "Patrick",
            "last_name": "",
            "full_name": "Patrick",
        }

    def test_only_last_name_no_first(self):
        """Only last_name provided, no first_name."""
        result = resolve_name_fields(last_name="Schwagler")
        assert result == {
            "first_name": "",
            "last_name": "Schwagler",
            "full_name": "Schwagler",
        }

    def test_deleted_player_name(self):
        result = resolve_name_fields(full_name="Deleted Player")
        assert result == {
            "first_name": "Deleted",
            "last_name": "Player",
            "full_name": "Deleted Player",
        }



# ---------------------------------------------------------------------------
# SignupRequest schema validation
# ---------------------------------------------------------------------------


class TestSignupRequestNameValidation:
    """Test SignupRequest accepts first+last OR full_name."""

    def test_first_last_computes_full_name(self):
        from backend.models.schemas import SignupRequest

        req = SignupRequest(
            phone_number="+1234567890",
            password="secret123",
            first_name="Patrick",
            last_name="Schwagler",
        )
        assert req.full_name == "Patrick Schwagler"
        assert req.first_name == "Patrick"
        assert req.last_name == "Schwagler"

    def test_full_name_splits_into_first_last(self):
        from backend.models.schemas import SignupRequest

        req = SignupRequest(
            phone_number="+1234567890",
            password="secret123",
            full_name="Patrick Schwagler",
        )
        assert req.first_name == "Patrick"
        assert req.last_name == "Schwagler"
        assert req.full_name == "Patrick Schwagler"

    def test_no_name_at_all_raises(self):
        from backend.models.schemas import SignupRequest

        with pytest.raises(Exception):
            SignupRequest(
                phone_number="+1234567890",
                password="secret123",
            )

    def test_first_last_takes_precedence_over_full_name(self):
        from backend.models.schemas import SignupRequest

        req = SignupRequest(
            phone_number="+1234567890",
            password="secret123",
            first_name="Patrick",
            last_name="Schwagler",
            full_name="Old Name",
        )
        assert req.full_name == "Patrick Schwagler"


# ---------------------------------------------------------------------------
# PlayerUpdate schema validation
# ---------------------------------------------------------------------------


class TestPlayerUpdateNameValidation:
    """Test PlayerUpdate recomputes full_name when first/last provided."""

    def test_first_last_recomputes_full_name(self):
        from backend.models.schemas import PlayerUpdate

        update = PlayerUpdate(first_name="Patrick", last_name="Schwagler")
        assert update.full_name == "Patrick Schwagler"

    def test_full_name_only_still_works(self):
        from backend.models.schemas import PlayerUpdate

        update = PlayerUpdate(full_name="Patrick Schwagler")
        assert update.full_name == "Patrick Schwagler"
        assert update.first_name == "Patrick"
        assert update.last_name == "Schwagler"

    def test_no_name_fields_is_valid(self):
        """PlayerUpdate with no name fields is valid (only updating other fields)."""
        from backend.models.schemas import PlayerUpdate

        update = PlayerUpdate(gender="M")
        assert update.full_name is None
        assert update.first_name is None
        assert update.last_name is None
