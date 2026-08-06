"""Validation contract for court conditions and moderated pin corrections."""

import pytest
from pydantic import ValidationError

from backend.models.schemas import (
    CourtEditSuggestionRequest,
    CreateCourtRequest,
    UpdateCourtRequest,
)


def test_condition_values_and_lengths_are_validated():
    with pytest.raises(ValidationError):
        CreateCourtRequest(
            name="Court",
            address="Beach",
            location_id="test",
            wind_exposure="gusty",
        )

    with pytest.raises(ValidationError):
        UpdateCourtRequest(sand_notes="x" * 141)


def test_create_and_update_coordinates_require_a_pair():
    with pytest.raises(ValidationError, match="provided together"):
        CreateCourtRequest(
            name="Court",
            address="Beach",
            location_id="test",
            latitude=40.0,
        )

    with pytest.raises(ValidationError, match="provided together"):
        UpdateCourtRequest(longitude=-74.0)


def test_suggestion_changes_are_strict_and_require_paired_coordinates():
    valid = CourtEditSuggestionRequest.model_validate(
        {
            "changes": {
                "wind_exposure": "sheltered",
                "latitude": 40.0,
                "longitude": -74.0,
            },
            "note": "Pin belongs beside the sand courts.",
        }
    )
    assert valid.changes.model_dump(exclude_unset=True)["longitude"] == -74.0

    with pytest.raises(ValidationError, match="proposed together"):
        CourtEditSuggestionRequest.model_validate({"changes": {"latitude": 40.0}})

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        CourtEditSuggestionRequest.model_validate({"changes": {"status": "approved"}})


def test_suggestion_requires_a_change_and_limits_notes():
    with pytest.raises(ValidationError, match="at least one"):
        CourtEditSuggestionRequest.model_validate({"changes": {}})

    with pytest.raises(ValidationError):
        CourtEditSuggestionRequest.model_validate(
            {"changes": {"sand_depth": "deep"}, "note": "x" * 281}
        )


@pytest.mark.parametrize("website", ["javascript:alert(1)", "sms:+15551234567", "/book"])
@pytest.mark.parametrize("schema", [CreateCourtRequest, UpdateCourtRequest])
def test_court_requests_reject_unsafe_or_relative_websites(schema, website):
    payload = {"website": website}
    if schema is CreateCourtRequest:
        payload.update(name="Court", address="Beach", location_id="test")
    with pytest.raises(ValidationError, match="absolute http"):
        schema.model_validate(payload)

    with pytest.raises(ValidationError, match="absolute http"):
        CourtEditSuggestionRequest.model_validate({"changes": {"website": website}})


@pytest.mark.parametrize("website", ["http://example.com/courts", "https://booking.example.org"])
def test_court_requests_accept_http_websites(website):
    created = CreateCourtRequest(
        name="Court", address="Beach", location_id="test", website=website
    )
    suggested = CourtEditSuggestionRequest.model_validate(
        {"changes": {"website": website}}
    )
    assert created.website == website
    assert suggested.changes.website == website


def test_blank_court_website_normalizes_to_null():
    update = UpdateCourtRequest(website="   ")
    suggestion = CourtEditSuggestionRequest.model_validate(
        {"changes": {"website": "  "}}
    )
    assert update.website is None
    assert suggestion.changes.model_dump(exclude_unset=True) == {"website": None}
