"""
Unit tests for gender_inference service.

Tests the infer_gender_from_name function, which calls Gemini Flash to
infer male/female from a first name. All error paths must return None
without raising.
"""

import json
from unittest.mock import MagicMock, patch, AsyncMock

import pytest

from backend.services import gender_inference


def _make_mock_client(text: str) -> MagicMock:
    """Build a mock Gemini client whose generate_content returns the given text."""
    client = MagicMock()
    response = MagicMock()
    response.candidates = [MagicMock()]
    response.candidates[0].content = MagicMock()
    response.candidates[0].content.parts = [MagicMock()]
    response.candidates[0].content.parts[0].text = text
    client.models.generate_content.return_value = response
    return client


class TestInferGenderFromName:
    """Tests for gender_inference.infer_gender_from_name."""

    async def test_returns_male(self):
        """Gemini returning male → function returns 'male'."""
        mock_client = _make_mock_client(json.dumps({"gender": "male"}))
        with (
            patch.object(gender_inference, "_get_client", return_value=mock_client),
            patch.dict("sys.modules", {"google": MagicMock(), "google.genai": MagicMock()}),
            patch.object(gender_inference, "_GEMINI_API_KEY", "fake-key"),
        ):
            result = await gender_inference.infer_gender_from_name("James")
        assert result == "male"

    async def test_returns_female(self):
        """Gemini returning female → function returns 'female'."""
        mock_client = _make_mock_client(json.dumps({"gender": "female"}))
        with (
            patch.object(gender_inference, "_get_client", return_value=mock_client),
            patch.dict("sys.modules", {"google": MagicMock(), "google.genai": MagicMock()}),
            patch.object(gender_inference, "_GEMINI_API_KEY", "fake-key"),
        ):
            result = await gender_inference.infer_gender_from_name("Maria")
        assert result == "female"

    async def test_unknown_returns_none(self):
        """Gemini returning 'unknown' → function returns None."""
        mock_client = _make_mock_client(json.dumps({"gender": "unknown"}))
        with (
            patch.object(gender_inference, "_get_client", return_value=mock_client),
            patch.dict("sys.modules", {"google": MagicMock(), "google.genai": MagicMock()}),
            patch.object(gender_inference, "_GEMINI_API_KEY", "fake-key"),
        ):
            result = await gender_inference.infer_gender_from_name("Jordan")
        assert result is None

    async def test_no_api_key_returns_none_without_calling_client(self):
        """When API key is absent, returns None and never calls the client."""
        mock_client = _make_mock_client(json.dumps({"gender": "male"}))
        with (
            patch.object(gender_inference, "_get_client", return_value=mock_client),
            patch.dict("sys.modules", {"google": MagicMock(), "google.genai": MagicMock()}),
            patch.object(gender_inference, "_GEMINI_API_KEY", ""),
        ):
            result = await gender_inference.infer_gender_from_name("Alex")
        assert result is None
        mock_client.models.generate_content.assert_not_called()

    async def test_empty_name_returns_none(self):
        """Empty / whitespace-only name returns None without calling Gemini."""
        mock_client = _make_mock_client(json.dumps({"gender": "male"}))
        with (
            patch.object(gender_inference, "_get_client", return_value=mock_client),
            patch.dict("sys.modules", {"google": MagicMock(), "google.genai": MagicMock()}),
            patch.object(gender_inference, "_GEMINI_API_KEY", "fake-key"),
        ):
            result = await gender_inference.infer_gender_from_name("   ")
        assert result is None
        mock_client.models.generate_content.assert_not_called()

    async def test_client_raises_exception_returns_none(self):
        """If the Gemini client raises any exception, returns None (no propagation)."""
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = RuntimeError("API unavailable")
        with (
            patch.object(gender_inference, "_get_client", return_value=mock_client),
            patch.dict("sys.modules", {"google": MagicMock(), "google.genai": MagicMock()}),
            patch.object(gender_inference, "_GEMINI_API_KEY", "fake-key"),
        ):
            result = await gender_inference.infer_gender_from_name("Chris")
        assert result is None

    async def test_malformed_json_returns_none(self):
        """If Gemini returns malformed JSON, returns None without raising."""
        mock_client = _make_mock_client("not valid json{{")
        with (
            patch.object(gender_inference, "_get_client", return_value=mock_client),
            patch.dict("sys.modules", {"google": MagicMock(), "google.genai": MagicMock()}),
            patch.object(gender_inference, "_GEMINI_API_KEY", "fake-key"),
        ):
            result = await gender_inference.infer_gender_from_name("Sam")
        assert result is None
