"""Verify every photo endpoint enforces the operational pause switch."""

import inspect
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from starlette.requests import Request
import pytest

from backend.api.routes import matches, feature_flags


def test_all_scoresheet_routes_have_the_flag_dependency():
    endpoints = (
        matches.upload_match_photo,
        matches.edit_photo_results,
        matches.stream_photo_job,
        matches.get_photo_job_status,
        matches.confirm_photo_matches,
        matches.cancel_photo_session,
    )
    for endpoint in endpoints:
        parameter = inspect.signature(endpoint).parameters["_scoresheet_flag"]
        dependency = parameter.default.dependency
        assert "scoresheet_parsing" in [cell.cell_contents for cell in dependency.__closure__]


@pytest.mark.asyncio
@pytest.mark.parametrize("enabled", [False, True])
async def test_flag_evaluates_current_platform_and_user(enabled):
    request = Request({"type": "http", "headers": [(b"x-client-platform", b"ios")]})
    resolver = AsyncMock(return_value=enabled)
    with patch.object(feature_flags, "resolve", resolver):
        call = feature_flags.require_feature("scoresheet_parsing")
        if enabled:
            await call(request, {"id": 7}, "test-session")
        else:
            with pytest.raises(HTTPException) as error:
                await call(request, {"id": 7}, "test-session")
            assert error.value.status_code == 403
        resolver.assert_awaited_once_with("test-session", "scoresheet_parsing", 7, "ios")
