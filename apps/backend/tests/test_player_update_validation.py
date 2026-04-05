"""
Unit tests for PlayerUpdate schema validation.

Covers:
- full_name rejects empty strings
- full_name rejects whitespace-only strings
- full_name strips leading/trailing whitespace
- full_name accepts None (optional field)
- full_name accepts valid non-empty strings
"""

import pytest
from pydantic import ValidationError

from backend.models.schemas import PlayerUpdate


class TestPlayerUpdateFullNameValidation:
    """Validates that full_name rejects empty/whitespace values."""

    def test_rejects_empty_string(self) -> None:
        """Empty string should raise ValidationError."""
        with pytest.raises(ValidationError, match="full_name must not be empty"):
            PlayerUpdate(full_name="")

    def test_rejects_whitespace_only(self) -> None:
        """Whitespace-only string should raise ValidationError."""
        with pytest.raises(ValidationError, match="full_name must not be empty"):
            PlayerUpdate(full_name="   ")

    def test_rejects_tabs_and_newlines(self) -> None:
        """Tabs/newlines should raise ValidationError."""
        with pytest.raises(ValidationError, match="full_name must not be empty"):
            PlayerUpdate(full_name="\t\n  ")

    def test_allows_none(self) -> None:
        """None is valid (field is optional)."""
        player = PlayerUpdate(full_name=None)
        assert player.full_name is None

    def test_allows_omitted(self) -> None:
        """Omitting full_name defaults to None."""
        player = PlayerUpdate()
        assert player.full_name is None

    def test_allows_valid_name(self) -> None:
        """Non-empty string is accepted."""
        player = PlayerUpdate(full_name="Ken Fowser")
        assert player.full_name == "Ken Fowser"

    def test_strips_whitespace(self) -> None:
        """Leading/trailing whitespace is stripped."""
        player = PlayerUpdate(full_name="  Jane Doe  ")
        assert player.full_name == "Jane Doe"
