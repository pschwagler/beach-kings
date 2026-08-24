"""Regression contract for placeholder versus owner demographics (TF-027)."""

from unittest.mock import AsyncMock, patch

import pytest
from pydantic import ValidationError

from backend.api.routes.auth import _check_profile_complete
from backend.models.schemas import CreatePlaceholderRequest, PlayerUpdate


def test_placeholder_request_keeps_gender_and_level_optional():
    request = CreatePlaceholderRequest(name="Guest Player")

    assert request.gender is None
    assert request.level is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "player",
    [
        {"gender": None, "level": "advanced"},
        {"gender": "female", "level": None},
        {"gender": "", "level": "advanced"},
        {"gender": "male", "level": ""},
        {"gender": "   ", "level": "advanced"},
        {"gender": "male", "level": "\t"},
    ],
)
async def test_owner_profile_is_incomplete_without_gender_or_level(player):
    with patch(
        "backend.api.routes.auth.data_service.get_player_by_user_id",
        new=AsyncMock(return_value=player),
    ):
        assert await _check_profile_complete(AsyncMock(), user_id=17) is False


@pytest.mark.asyncio
async def test_owner_profile_is_complete_with_gender_and_level():
    with patch(
        "backend.api.routes.auth.data_service.get_player_by_user_id",
        new=AsyncMock(return_value={"gender": "male", "level": "advanced"}),
    ):
        assert await _check_profile_complete(AsyncMock(), user_id=17) is True


@pytest.mark.parametrize("field", ["gender", "level"])
@pytest.mark.parametrize("blank", ["   ", "\t", "\n"])
def test_owner_profile_update_rejects_whitespace_demographics(field, blank):
    with pytest.raises(ValidationError):
        PlayerUpdate(**{field: blank})


def test_owner_profile_update_normalizes_demographic_whitespace():
    update = PlayerUpdate(gender="  female ", level=" advanced  ")

    assert update.gender == "female"
    assert update.level == "advanced"
