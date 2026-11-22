"""Real database coverage for the rotating 120-day sign-in window."""

from datetime import timedelta

import pytest
from fastapi import HTTPException

from backend.api.routes import auth
from backend.database.models import User
from backend.models.schemas import RefreshTokenRequest
from backend.services import user_service
from backend.utils.datetime_utils import utcnow


@pytest.mark.asyncio
@pytest.mark.parametrize("elapsed_days", [119, 121])
async def test_refresh_session_window(db_session, monkeypatch, elapsed_days):
    user = User(phone_number="+15550000901", password_hash="hash", is_verified=True)
    db_session.add(user)
    await db_session.commit()
    issued_at = utcnow()
    monkeypatch.setattr(auth.auth_service, "REFRESH_TOKEN_EXPIRATION_DAYS", 120)
    monkeypatch.setattr(auth, "utcnow", lambda: issued_at)
    _, original = await auth._issue_tokens(db_session, {"id": user.id})
    now = issued_at + timedelta(days=elapsed_days)
    monkeypatch.setattr(auth, "utcnow", lambda: now)

    if elapsed_days > 120:
        with pytest.raises(HTTPException) as error:
            await auth.refresh_token(RefreshTokenRequest(refresh_token=original), db_session)
        assert error.value.status_code == 401
        return

    response = await auth.refresh_token(RefreshTokenRequest(refresh_token=original), db_session)
    assert response.refresh_token != original
    assert await user_service.get_refresh_token(db_session, original) is None
    replacement = await user_service.get_refresh_token(db_session, response.refresh_token)
    assert replacement["expires_at"] == (now + timedelta(days=120)).isoformat()

    # Continued use renews the window; the replacement remains usable well
    # beyond 120 days after the original login, without lengthening access JWTs.
    monkeypatch.setattr(auth, "utcnow", lambda: now + timedelta(days=119))
    next_response = await auth.refresh_token(
        RefreshTokenRequest(refresh_token=response.refresh_token), db_session
    )
    assert next_response.access_token
    assert next_response.refresh_token != response.refresh_token
