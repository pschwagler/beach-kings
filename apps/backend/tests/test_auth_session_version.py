"""Session-version enforcement for password reset and change boundaries."""

from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from backend.api import auth_dependencies
from backend.api.routes.auth import refresh_token
from backend.models.schemas import RefreshTokenRequest
from backend.services import auth_service
from backend.services import user_service


def _credentials(version: int | None) -> HTTPAuthorizationCredentials:
    payload = {"user_id": 42}
    if version is not None:
        payload["sv"] = version
    return HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials=auth_service.create_access_token(payload),
    )


@pytest.mark.asyncio
async def test_matching_session_version_authenticates(monkeypatch):
    user = {"id": 42, "session_version": 3, "deleted_at": None}
    monkeypatch.setattr(
        auth_dependencies.user_service,
        "get_user_by_id",
        AsyncMock(return_value=user),
    )

    assert await auth_dependencies.get_authenticated_user(AsyncMock(), _credentials(3)) == user


@pytest.mark.asyncio
async def test_old_access_token_is_rejected(monkeypatch):
    monkeypatch.setattr(
        auth_dependencies.user_service,
        "get_user_by_id",
        AsyncMock(return_value={"id": 42, "session_version": 4, "deleted_at": None}),
    )

    with pytest.raises(HTTPException) as error:
        await auth_dependencies.get_authenticated_user(AsyncMock(), _credentials(3))

    assert error.value.status_code == 401
    assert error.value.detail == "Session expired. Please sign in again."


@pytest.mark.asyncio
async def test_legacy_token_only_works_before_first_version_bump(monkeypatch):
    get_user = AsyncMock(return_value={"id": 42, "session_version": 0, "deleted_at": None})
    monkeypatch.setattr(auth_dependencies.user_service, "get_user_by_id", get_user)
    assert await auth_dependencies.get_authenticated_user(AsyncMock(), _credentials(None))

    get_user.return_value = {"id": 42, "session_version": 1, "deleted_at": None}
    with pytest.raises(HTTPException):
        await auth_dependencies.get_authenticated_user(AsyncMock(), _credentials(None))


@pytest.mark.asyncio
async def test_old_refresh_token_is_deleted_and_rejected(monkeypatch):
    session = AsyncMock()
    monkeypatch.setattr(
        user_service,
        "get_refresh_token",
        AsyncMock(
            return_value={
                "user_id": 42,
                "expires_at": "2099-01-01T00:00:00+00:00",
                "session_version": 2,
            }
        ),
    )
    monkeypatch.setattr(
        user_service,
        "get_user_by_id",
        AsyncMock(return_value={"id": 42, "session_version": 3}),
    )
    deleted = AsyncMock(return_value=True)
    monkeypatch.setattr(user_service, "delete_refresh_token", deleted)

    with pytest.raises(HTTPException) as error:
        await refresh_token(RefreshTokenRequest(refresh_token="old-token"), session)

    assert error.value.status_code == 401
    assert error.value.detail == "Session expired. Please sign in again."
    deleted.assert_awaited_once_with(session, "old-token")
    session.commit.assert_awaited_once()
