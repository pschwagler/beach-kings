"""Route-layer tests for messages.py (DM) endpoints.

Service logic is thoroughly tested in test_direct_message_service.py.
These tests verify the HTTP layer: auth guards, status codes, response shapes.
"""

import pytest
from fastapi.testclient import TestClient
from backend.api.main import app
from backend.api.auth_dependencies import require_verified_player
from backend.services import direct_message_service


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

FAKE_USER = {
    "id": 1,
    "phone_number": "+10000000000",
    "name": "Test User",
    "email": "test@example.com",
    "is_verified": True,
    "created_at": "2020-01-01T00:00:00Z",
    "player_id": 10,
}


@pytest.fixture(autouse=True)
def _override_auth():
    """Override require_verified_player for all tests in this module."""

    async def _fake():
        return FAKE_USER

    app.dependency_overrides[require_verified_player] = _fake
    yield
    app.dependency_overrides.pop(require_verified_player, None)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def headers():
    return {"Authorization": "Bearer dummy"}


# ============================================================================
# GET /api/messages/conversations
# ============================================================================


class TestGetConversations:
    """Tests for listing conversations."""

    def test_conversations_success(self, client, headers, monkeypatch):
        """Returns conversation list."""

        async def fake_get(session, player_id, limit=50, offset=0):
            return {
                "conversations": [
                    {
                        "player_id": 20,
                        "full_name": "Friend",
                        "avatar": None,
                        "last_message_text": "Hey!",
                        "last_message_at": "2024-01-01T00:00:00Z",
                        "last_message_sender_id": 10,
                        "unread_count": 1,
                        "is_friend": True,
                    }
                ],
                "total_count": 1,
            }

        monkeypatch.setattr(direct_message_service, "get_conversations", fake_get, raising=True)

        response = client.get("/api/messages/conversations", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total_count"] == 1
        assert len(data["conversations"]) == 1

    def test_conversations_pagination(self, client, headers, monkeypatch):
        """Pagination params are passed through."""
        captured = {}

        async def fake_get(session, player_id, limit=50, offset=0):
            captured["limit"] = limit
            captured["offset"] = offset
            return {"conversations": [], "total_count": 0}

        monkeypatch.setattr(direct_message_service, "get_conversations", fake_get, raising=True)

        response = client.get("/api/messages/conversations?page=2&page_size=10", headers=headers)
        assert response.status_code == 200
        assert captured["limit"] == 10
        assert captured["offset"] == 10  # (2-1) * 10

    def test_conversations_no_auth(self):
        """No auth returns 401/403."""
        app.dependency_overrides.pop(require_verified_player, None)
        client = TestClient(app)
        response = client.get("/api/messages/conversations")
        assert response.status_code in (401, 403)

        # Restore
        async def _fake():
            return FAKE_USER

        app.dependency_overrides[require_verified_player] = _fake


# ============================================================================
# GET /api/messages/conversations/{player_id}
# ============================================================================


class TestGetThread:
    """Tests for getting a message thread."""

    def test_thread_success(self, client, headers, monkeypatch):
        """Returns thread messages."""

        async def fake_get(session, player_id, other_id, limit=50, offset=0):
            return {
                "messages": [
                    {
                        "id": 1,
                        "sender_player_id": 10,
                        "receiver_player_id": 20,
                        "message_text": "Hello!",
                        "created_at": "2024-01-01T00:00:00Z",
                        "is_read": False,
                    }
                ],
                "total_count": 1,
                "has_more": False,
            }

        monkeypatch.setattr(direct_message_service, "get_thread", fake_get, raising=True)

        response = client.get("/api/messages/conversations/20", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total_count"] == 1
        assert len(data["messages"]) == 1
        assert data["messages"][0]["sender_player_id"] == 10


# ============================================================================
# POST /api/messages/send
# ============================================================================


class TestSendMessage:
    """Tests for sending a direct message."""

    def test_send_success(self, client, headers, monkeypatch):
        """Send message returns created message."""

        async def fake_send(session, sender_id, receiver_id, text):
            return {
                "id": 1,
                "sender_player_id": sender_id,
                "receiver_player_id": receiver_id,
                "message_text": text,
                "created_at": "2024-01-01T00:00:00Z",
                "is_read": False,
            }

        monkeypatch.setattr(direct_message_service, "send_message", fake_send, raising=True)

        response = client.post(
            "/api/messages/send",
            json={"receiver_player_id": 20, "message_text": "Hello friend!"},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["sender_player_id"] == 10
        assert data["message_text"] == "Hello friend!"

    def test_send_not_friends(self, client, headers, monkeypatch):
        """Sending to non-friend returns 400."""

        async def fake_send(session, sender_id, receiver_id, text):
            raise ValueError("Cannot send messages to non-friends")

        monkeypatch.setattr(direct_message_service, "send_message", fake_send, raising=True)

        response = client.post(
            "/api/messages/send",
            json={"receiver_player_id": 99, "message_text": "Hi"},
            headers=headers,
        )
        assert response.status_code == 400

    def test_send_missing_fields(self, client, headers):
        """Missing required fields returns 422."""
        response = client.post(
            "/api/messages/send",
            json={"receiver_player_id": 20},
            headers=headers,
        )
        assert response.status_code == 422


# ============================================================================
# PUT /api/messages/conversations/{player_id}/read
# ============================================================================


class TestMarkThreadRead:
    """Tests for marking a thread as read."""

    def test_mark_read_success(self, client, headers, monkeypatch):
        """Mark read returns count of marked messages."""

        async def fake_mark(session, player_id, other_id):
            return 3

        monkeypatch.setattr(direct_message_service, "mark_thread_read", fake_mark, raising=True)

        response = client.put("/api/messages/conversations/20/read", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["marked_count"] == 3

    def test_mark_read_zero(self, client, headers, monkeypatch):
        """No unread messages returns 0 count."""

        async def fake_mark(session, player_id, other_id):
            return 0

        monkeypatch.setattr(direct_message_service, "mark_thread_read", fake_mark, raising=True)

        response = client.put("/api/messages/conversations/20/read", headers=headers)
        assert response.status_code == 200
        assert response.json()["marked_count"] == 0


# ============================================================================
# GET /api/messages/unread-count
# ============================================================================


class TestUnreadCount:
    """Tests for unread message count."""

    def test_unread_count_success(self, client, headers, monkeypatch):
        """Returns total unread count."""

        async def fake_count(session, player_id):
            return 5

        monkeypatch.setattr(direct_message_service, "get_unread_count", fake_count, raising=True)

        response = client.get("/api/messages/unread-count", headers=headers)
        assert response.status_code == 200
        assert response.json()["count"] == 5

    def test_unread_count_zero(self, client, headers, monkeypatch):
        """Zero unread returns 0."""

        async def fake_count(session, player_id):
            return 0

        monkeypatch.setattr(direct_message_service, "get_unread_count", fake_count, raising=True)

        response = client.get("/api/messages/unread-count", headers=headers)
        assert response.status_code == 200
        assert response.json()["count"] == 0
