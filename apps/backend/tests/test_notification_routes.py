"""
Unit tests for notification API routes.
Tests GET, PUT endpoints for notifications.
"""
import pytest
import json
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch
from backend.api.main import app
from backend.services import auth_service, user_service, notification_service
from backend.database.models import NotificationType


@pytest.fixture
def client():
    """Create a test client."""
    return TestClient(app)


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
            "created_at": "2020-01-01T00:00:00Z"
        }
    
    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
    
    return TestClient(app), {"Authorization": "Bearer dummy"}


@pytest.mark.asyncio
async def test_get_notifications(monkeypatch):
    """Test getting user notifications."""
    client, headers = make_client_with_auth(monkeypatch, user_id=1)
    
    # Mock notification service
    mock_notifications = {
        "notifications": [
            {
                "id": 1,
                "user_id": 1,
                "type": NotificationType.LEAGUE_MESSAGE.value,
                "title": "Test Notification",
                "message": "Test message",
                "data": None,
                "is_read": False,
                "read_at": None,
                "link_url": None,
                "created_at": "2024-01-01T00:00:00Z"
            }
        ],
        "total_count": 1,
        "has_more": False
    }
    
    async def fake_get_user_notifications(session, user_id, limit=50, offset=0, unread_only=False):
        return mock_notifications
    
    monkeypatch.setattr(
        notification_service,
        "get_user_notifications",
        fake_get_user_notifications,
        raising=True
    )
    
    response = client.get("/api/notifications", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total_count"] == 1
    assert len(data["notifications"]) == 1
    assert data["notifications"][0]["title"] == "Test Notification"


@pytest.mark.asyncio
async def test_get_notifications_with_params(monkeypatch):
    """Test getting notifications with query parameters."""
    client, headers = make_client_with_auth(monkeypatch, user_id=1)
    
    async def fake_get_user_notifications(session, user_id, limit=50, offset=0, unread_only=False):
        return {
            "notifications": [],
            "total_count": 0,
            "has_more": False
        }
    
    monkeypatch.setattr(
        notification_service,
        "get_user_notifications",
        fake_get_user_notifications,
        raising=True
    )
    
    # Test with limit and offset
    response = client.get("/api/notifications?limit=10&offset=5", headers=headers)
    assert response.status_code == 200
    
    # Test with unread_only
    response = client.get("/api/notifications?unread_only=true", headers=headers)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_notifications_unauthorized(monkeypatch):
    """Test getting notifications without authentication."""
    client = TestClient(app)
    
    response = client.get("/api/notifications")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_unread_count(monkeypatch):
    """Test getting unread notification count."""
    client, headers = make_client_with_auth(monkeypatch, user_id=1)
    
    async def fake_get_unread_count(session, user_id):
        return 5
    
    monkeypatch.setattr(
        notification_service,
        "get_unread_count",
        fake_get_unread_count,
        raising=True
    )
    
    response = client.get("/api/notifications/unread-count", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 5


@pytest.mark.asyncio
async def test_get_unread_count_unauthorized(monkeypatch):
    """Test getting unread count without authentication."""
    client = TestClient(app)
    
    response = client.get("/api/notifications/unread-count")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_mark_notification_as_read(monkeypatch):
    """Test marking a notification as read."""
    client, headers = make_client_with_auth(monkeypatch, user_id=1)
    
    mock_notification = {
        "id": 1,
        "user_id": 1,
        "type": NotificationType.LEAGUE_MESSAGE.value,
        "title": "Test",
        "message": "Test message",
        "data": None,
        "is_read": True,
        "read_at": "2024-01-01T00:00:00Z",
        "link_url": None,
        "created_at": "2024-01-01T00:00:00Z"
    }
    
    async def fake_mark_as_read(session, notification_id, user_id):
        return mock_notification
    
    monkeypatch.setattr(
        notification_service,
        "mark_as_read",
        fake_mark_as_read,
        raising=True
    )
    
    response = client.put("/api/notifications/1/read", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == 1
    assert data["is_read"] is True
    assert data["read_at"] is not None


@pytest.mark.asyncio
async def test_mark_notification_as_read_unauthorized(monkeypatch):
    """Test marking notification as read without authentication."""
    client = TestClient(app)
    
    response = client.put("/api/notifications/1/read")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_mark_notification_as_read_not_found(monkeypatch):
    """Test marking a nonexistent notification as read."""
    client, headers = make_client_with_auth(monkeypatch, user_id=1)
    
    async def fake_mark_as_read(session, notification_id, user_id):
        raise ValueError("Notification not found or access denied")
    
    monkeypatch.setattr(
        notification_service,
        "mark_as_read",
        fake_mark_as_read,
        raising=True
    )
    
    response = client.put("/api/notifications/999/read", headers=headers)
    # The service raises ValueError, which should be handled by the route
    # Check if it returns 400 or 500
    assert response.status_code in [400, 500]


@pytest.mark.asyncio
async def test_mark_all_notifications_as_read(monkeypatch):
    """Test marking all notifications as read."""
    client, headers = make_client_with_auth(monkeypatch, user_id=1)
    
    async def fake_mark_all_as_read(session, user_id):
        return 3  # 3 notifications marked as read
    
    monkeypatch.setattr(
        notification_service,
        "mark_all_as_read",
        fake_mark_all_as_read,
        raising=True
    )
    
    response = client.put("/api/notifications/mark-all-read", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["count"] == 3


@pytest.mark.asyncio
async def test_mark_all_notifications_as_read_unauthorized(monkeypatch):
    """Test marking all notifications as read without authentication."""
    client = TestClient(app)
    
    response = client.put("/api/notifications/mark-all-read")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_mark_all_notifications_as_read_no_notifications(monkeypatch):
    """Test marking all as read when there are no notifications."""
    client, headers = make_client_with_auth(monkeypatch, user_id=1)
    
    async def fake_mark_all_as_read(session, user_id):
        return 0
    
    monkeypatch.setattr(
        notification_service,
        "mark_all_as_read",
        fake_mark_all_as_read,
        raising=True
    )
    
    response = client.put("/api/notifications/mark-all-read", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["count"] == 0


@pytest.mark.asyncio
async def test_get_notifications_error_handling(monkeypatch):
    """Test error handling in get notifications endpoint."""
    client, headers = make_client_with_auth(monkeypatch, user_id=1)
    
    async def fake_get_user_notifications(session, user_id, limit=50, offset=0, unread_only=False):
        raise Exception("Database error")
    
    monkeypatch.setattr(
        notification_service,
        "get_user_notifications",
        fake_get_user_notifications,
        raising=True
    )
    
    response = client.get("/api/notifications", headers=headers)
    assert response.status_code == 500
    assert "Error fetching notifications" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_unread_count_error_handling(monkeypatch):
    """Test error handling in get unread count endpoint."""
    client, headers = make_client_with_auth(monkeypatch, user_id=1)
    
    async def fake_get_unread_count(session, user_id):
        raise Exception("Database error")
    
    monkeypatch.setattr(
        notification_service,
        "get_unread_count",
        fake_get_unread_count,
        raising=True
    )
    
    response = client.get("/api/notifications/unread-count", headers=headers)
    assert response.status_code == 500

