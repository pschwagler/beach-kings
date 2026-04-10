"""
Integration tests for push token API routes.

Tests POST and DELETE /api/push-tokens endpoints.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services import auth_service, user_service, push_service


# ---------------------------------------------------------------------------
# Auth helper (Strategy A: monkeypatch auth_service + user_service)
# ---------------------------------------------------------------------------


def make_client_with_auth(monkeypatch, phone="+15551234567", user_id=1):
    """Create a test client with mocked authentication."""

    def fake_verify_token(token):
        return {"user_id": user_id, "phone_number": phone}

    async def fake_get_user_by_id(session, uid):
        return {
            "id": user_id,
            "phone_number": phone,
            "name": "Test User",
            "email": "test@example.com",
            "is_verified": True,
            "created_at": "2020-01-01T00:00:00Z",
        }

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)

    return TestClient(app), {"Authorization": "Bearer dummy"}


# ---------------------------------------------------------------------------
# POST /api/push-tokens
# ---------------------------------------------------------------------------


class TestRegisterPushToken:
    """Tests for POST /api/push-tokens."""

    def test_register_success(self, monkeypatch):
        """Valid token registration returns 200 with token details."""
        client, headers = make_client_with_auth(monkeypatch)

        mock_device_token = MagicMock()
        mock_device_token.id = 42
        mock_device_token.token = "ExponentPushToken[abc123]"
        mock_device_token.platform = "ios"
        mock_device_token.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)

        async def fake_register(session, user_id, token, platform):
            return mock_device_token

        monkeypatch.setattr(push_service, "register_token", fake_register, raising=True)

        response = client.post(
            "/api/push-tokens",
            json={"token": "ExponentPushToken[abc123]", "platform": "ios"},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == 42
        assert data["token"] == "ExponentPushToken[abc123]"
        assert data["platform"] == "ios"
        assert "created_at" in data

    def test_register_android_platform(self, monkeypatch):
        """Android platform is accepted."""
        client, headers = make_client_with_auth(monkeypatch)

        mock_device_token = MagicMock()
        mock_device_token.id = 43
        mock_device_token.token = "ExponentPushToken[droid1]"
        mock_device_token.platform = "android"
        mock_device_token.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)

        async def fake_register(session, user_id, token, platform):
            return mock_device_token

        monkeypatch.setattr(push_service, "register_token", fake_register, raising=True)

        response = client.post(
            "/api/push-tokens",
            json={"token": "ExponentPushToken[droid1]", "platform": "android"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["platform"] == "android"

    def test_register_invalid_platform(self, monkeypatch):
        """Invalid platform returns 422 validation error."""
        client, headers = make_client_with_auth(monkeypatch)

        response = client.post(
            "/api/push-tokens",
            json={"token": "ExponentPushToken[abc]", "platform": "windows"},
            headers=headers,
        )
        assert response.status_code == 422

    def test_register_invalid_token_format(self, monkeypatch):
        """Token not matching Expo format returns 422."""
        client, headers = make_client_with_auth(monkeypatch)

        response = client.post(
            "/api/push-tokens",
            json={"token": "not-an-expo-token", "platform": "ios"},
            headers=headers,
        )
        assert response.status_code == 422

    def test_register_empty_token(self, monkeypatch):
        """Empty token returns 422."""
        client, headers = make_client_with_auth(monkeypatch)

        response = client.post(
            "/api/push-tokens",
            json={"token": "   ", "platform": "ios"},
            headers=headers,
        )
        assert response.status_code == 422

    def test_register_unauthorized(self):
        """Request without auth returns 401."""
        client = TestClient(app)
        response = client.post(
            "/api/push-tokens",
            json={"token": "ExponentPushToken[abc]", "platform": "ios"},
        )
        assert response.status_code == 401

    def test_register_service_error(self, monkeypatch):
        """Service exception returns 500."""
        client, headers = make_client_with_auth(monkeypatch)

        async def fake_register(session, user_id, token, platform):
            raise RuntimeError("DB connection lost")

        monkeypatch.setattr(push_service, "register_token", fake_register, raising=True)

        response = client.post(
            "/api/push-tokens",
            json={"token": "ExponentPushToken[abc]", "platform": "ios"},
            headers=headers,
        )
        assert response.status_code == 500
        assert "Failed to register push token" in response.json()["detail"]


# ---------------------------------------------------------------------------
# DELETE /api/push-tokens
# ---------------------------------------------------------------------------


class TestUnregisterPushToken:
    """Tests for DELETE /api/push-tokens."""

    def test_unregister_success(self, monkeypatch):
        """Successful unregister returns 200 with success flag."""
        client, headers = make_client_with_auth(monkeypatch)

        async def fake_unregister(session, user_id, token):
            return True

        monkeypatch.setattr(push_service, "unregister_token", fake_unregister, raising=True)

        response = client.request(
            "DELETE",
            "/api/push-tokens",
            json={"token": "ExponentPushToken[abc123]", "platform": "ios"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_unregister_not_found(self, monkeypatch):
        """Token not found returns 404."""
        client, headers = make_client_with_auth(monkeypatch)

        async def fake_unregister(session, user_id, token):
            return False

        monkeypatch.setattr(push_service, "unregister_token", fake_unregister, raising=True)

        response = client.request(
            "DELETE",
            "/api/push-tokens",
            json={"token": "ExponentPushToken[missing]", "platform": "ios"},
            headers=headers,
        )
        assert response.status_code == 404

    def test_unregister_unauthorized(self):
        """Request without auth returns 401."""
        client = TestClient(app)
        response = client.request(
            "DELETE",
            "/api/push-tokens",
            json={"token": "ExponentPushToken[abc]", "platform": "ios"},
        )
        assert response.status_code == 401

    def test_unregister_invalid_platform(self, monkeypatch):
        """Invalid platform in DELETE body returns 422."""
        client, headers = make_client_with_auth(monkeypatch)

        response = client.request(
            "DELETE",
            "/api/push-tokens",
            json={"token": "ExponentPushToken[abc]", "platform": "web"},
            headers=headers,
        )
        assert response.status_code == 422

    def test_unregister_service_error(self, monkeypatch):
        """Service exception returns 500."""
        client, headers = make_client_with_auth(monkeypatch)

        async def fake_unregister(session, user_id, token):
            raise RuntimeError("DB connection lost")

        monkeypatch.setattr(push_service, "unregister_token", fake_unregister, raising=True)

        response = client.request(
            "DELETE",
            "/api/push-tokens",
            json={"token": "ExponentPushToken[abc]", "platform": "ios"},
            headers=headers,
        )
        assert response.status_code == 500
        assert "Failed to unregister push token" in response.json()["detail"]
