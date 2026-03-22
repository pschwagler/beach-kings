"""Route-layer tests for friends.py endpoints.

Service logic is thoroughly tested in test_friend_service.py.
These tests verify the HTTP layer: auth guards, status codes, response shapes.
"""

import pytest
from fastapi.testclient import TestClient
from backend.api.main import app
from backend.api.auth_dependencies import require_verified_player
from backend.services import friend_service


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
# POST /api/friends/request
# ============================================================================


class TestSendFriendRequest:
    """Tests for sending a friend request."""

    def test_send_request_success(self, client, headers, monkeypatch):
        """Happy path: send friend request."""

        async def fake_send(session, sender_id, receiver_id):
            return {
                "id": 1,
                "sender_player_id": sender_id,
                "sender_name": "Test User",
                "sender_avatar": None,
                "receiver_player_id": receiver_id,
                "receiver_name": "Other Player",
                "receiver_avatar": None,
                "status": "pending",
                "created_at": "2024-01-01T00:00:00Z",
            }

        monkeypatch.setattr(friend_service, "send_friend_request", fake_send, raising=True)

        response = client.post(
            "/api/friends/request",
            json={"receiver_player_id": 20},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["sender_player_id"] == 10
        assert data["receiver_player_id"] == 20
        assert data["status"] == "pending"

    def test_send_request_self(self, client, headers, monkeypatch):
        """Cannot send request to self."""

        async def fake_send(session, sender_id, receiver_id):
            raise ValueError("Cannot send friend request to yourself")

        monkeypatch.setattr(friend_service, "send_friend_request", fake_send, raising=True)

        response = client.post(
            "/api/friends/request",
            json={"receiver_player_id": 10},
            headers=headers,
        )
        assert response.status_code == 400

    def test_send_request_missing_body(self, client, headers):
        """Missing receiver_player_id returns 422."""
        response = client.post("/api/friends/request", json={}, headers=headers)
        assert response.status_code == 422

    def test_send_request_no_auth(self):
        """No auth returns 401/403."""
        app.dependency_overrides.pop(require_verified_player, None)
        client = TestClient(app)
        response = client.post(
            "/api/friends/request",
            json={"receiver_player_id": 20},
        )
        assert response.status_code in (401, 403)

        # Restore override for other tests
        async def _fake():
            return FAKE_USER

        app.dependency_overrides[require_verified_player] = _fake


# ============================================================================
# POST /api/friends/requests/{id}/accept
# ============================================================================


class TestAcceptFriendRequest:
    """Tests for accepting a friend request."""

    def test_accept_success(self, client, headers, monkeypatch):
        """Accept returns updated request."""

        async def fake_accept(session, request_id, player_id):
            return {
                "id": request_id,
                "sender_player_id": 20,
                "sender_name": "Other Player",
                "sender_avatar": None,
                "receiver_player_id": player_id,
                "receiver_name": "Test User",
                "receiver_avatar": None,
                "status": "accepted",
                "created_at": "2024-01-01T00:00:00Z",
            }

        monkeypatch.setattr(friend_service, "accept_friend_request", fake_accept, raising=True)

        response = client.post("/api/friends/requests/1/accept", headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "accepted"

    def test_accept_wrong_receiver(self, client, headers, monkeypatch):
        """Accepting request meant for another player returns 400."""

        async def fake_accept(session, request_id, player_id):
            raise ValueError("Not the receiver of this request")

        monkeypatch.setattr(friend_service, "accept_friend_request", fake_accept, raising=True)

        response = client.post("/api/friends/requests/1/accept", headers=headers)
        assert response.status_code == 400


# ============================================================================
# POST /api/friends/requests/{id}/decline
# ============================================================================


class TestDeclineFriendRequest:
    """Tests for declining a friend request."""

    def test_decline_success(self, client, headers, monkeypatch):
        """Decline returns 204."""

        async def fake_decline(session, request_id, player_id):
            pass

        monkeypatch.setattr(friend_service, "decline_friend_request", fake_decline, raising=True)

        response = client.post("/api/friends/requests/1/decline", headers=headers)
        assert response.status_code == 204

    def test_decline_wrong_receiver(self, client, headers, monkeypatch):
        """Declining request meant for another player returns 400."""

        async def fake_decline(session, request_id, player_id):
            raise ValueError("Not the receiver of this request")

        monkeypatch.setattr(friend_service, "decline_friend_request", fake_decline, raising=True)

        response = client.post("/api/friends/requests/1/decline", headers=headers)
        assert response.status_code == 400


# ============================================================================
# DELETE /api/friends/requests/{id}
# ============================================================================


class TestCancelFriendRequest:
    """Tests for cancelling an outgoing request."""

    def test_cancel_success(self, client, headers, monkeypatch):
        """Cancel returns success message."""

        async def fake_cancel(session, request_id, player_id):
            pass

        monkeypatch.setattr(friend_service, "cancel_friend_request", fake_cancel, raising=True)

        response = client.delete("/api/friends/requests/1", headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_cancel_wrong_sender(self, client, headers, monkeypatch):
        """Cancelling another user's request returns 400."""

        async def fake_cancel(session, request_id, player_id):
            raise ValueError("Not the sender of this request")

        monkeypatch.setattr(friend_service, "cancel_friend_request", fake_cancel, raising=True)

        response = client.delete("/api/friends/requests/1", headers=headers)
        assert response.status_code == 400


# ============================================================================
# DELETE /api/friends/{player_id}
# ============================================================================


class TestRemoveFriend:
    """Tests for unfriending a player."""

    def test_remove_success(self, client, headers, monkeypatch):
        """Remove friend returns success."""

        async def fake_remove(session, player_id, friend_id):
            pass

        monkeypatch.setattr(friend_service, "remove_friend", fake_remove, raising=True)

        response = client.delete("/api/friends/20", headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_remove_not_friends(self, client, headers, monkeypatch):
        """Removing non-friend returns 400."""

        async def fake_remove(session, player_id, friend_id):
            raise ValueError("Not friends with this player")

        monkeypatch.setattr(friend_service, "remove_friend", fake_remove, raising=True)

        response = client.delete("/api/friends/99", headers=headers)
        assert response.status_code == 400


# ============================================================================
# GET /api/friends
# ============================================================================


class TestGetFriends:
    """Tests for friends list."""

    def test_get_friends_success(self, client, headers, monkeypatch):
        """Returns paginated friends list."""

        async def fake_get(session, player_id, limit=50, offset=0):
            return {
                "items": [
                    {
                        "id": 1,
                        "player_id": 20,
                        "full_name": "Friend One",
                        "avatar": None,
                        "location_name": None,
                        "level": None,
                    }
                ],
                "total_count": 1,
            }

        monkeypatch.setattr(friend_service, "get_friends", fake_get, raising=True)

        response = client.get("/api/friends", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total_count"] == 1
        assert len(data["items"]) == 1

    def test_get_friends_pagination(self, client, headers, monkeypatch):
        """Pagination params are passed through."""
        captured = {}

        async def fake_get(session, player_id, limit=50, offset=0):
            captured["limit"] = limit
            captured["offset"] = offset
            return {"items": [], "total_count": 0}

        monkeypatch.setattr(friend_service, "get_friends", fake_get, raising=True)

        response = client.get("/api/friends?page=3&page_size=10", headers=headers)
        assert response.status_code == 200
        assert captured["limit"] == 10
        assert captured["offset"] == 20  # (3-1) * 10


# ============================================================================
# GET /api/friends/requests
# ============================================================================


class TestGetFriendRequests:
    """Tests for friend requests list."""

    def test_get_requests_default(self, client, headers, monkeypatch):
        """Default direction is 'both'."""
        captured = {}

        async def fake_get(session, player_id, direction="both"):
            captured["direction"] = direction
            return {"incoming": [], "outgoing": []}

        monkeypatch.setattr(friend_service, "get_friend_requests", fake_get, raising=True)

        response = client.get("/api/friends/requests", headers=headers)
        assert response.status_code == 200
        assert captured["direction"] == "both"

    def test_get_requests_incoming(self, client, headers, monkeypatch):
        """Filter by incoming."""

        async def fake_get(session, player_id, direction="both"):
            return {"incoming": [{"id": 1}], "outgoing": []}

        monkeypatch.setattr(friend_service, "get_friend_requests", fake_get, raising=True)

        response = client.get("/api/friends/requests?direction=incoming", headers=headers)
        assert response.status_code == 200

    def test_get_requests_invalid_direction(self, client, headers):
        """Invalid direction returns 422."""
        response = client.get("/api/friends/requests?direction=invalid", headers=headers)
        assert response.status_code == 422


# ============================================================================
# GET /api/friends/suggestions
# ============================================================================


class TestGetFriendSuggestions:
    """Tests for friend suggestions."""

    def test_suggestions_success(self, client, headers, monkeypatch):
        """Returns suggestions list."""

        async def fake_get(session, player_id, limit=10):
            return [{"player_id": 30, "full_name": "Suggested Player", "mutual_leagues": 2}]

        monkeypatch.setattr(friend_service, "get_friend_suggestions", fake_get, raising=True)

        response = client.get("/api/friends/suggestions", headers=headers)
        assert response.status_code == 200


# ============================================================================
# POST /api/friends/batch-status
# ============================================================================


class TestBatchFriendStatus:
    """Tests for batch friend status check."""

    def test_batch_status_success(self, client, headers, monkeypatch):
        """Returns statuses for given player IDs."""

        async def fake_batch(session, player_id, ids):
            return {
                "statuses": {str(pid): "none" for pid in ids},
                "mutual_counts": {str(pid): 0 for pid in ids},
            }

        monkeypatch.setattr(friend_service, "batch_friend_status", fake_batch, raising=True)

        response = client.post(
            "/api/friends/batch-status",
            json={"player_ids": [20, 30, 40]},
            headers=headers,
        )
        assert response.status_code == 200

    def test_batch_status_empty(self, client, headers, monkeypatch):
        """Empty list is valid."""

        async def fake_batch(session, player_id, ids):
            return {"statuses": {}, "mutual_counts": {}}

        monkeypatch.setattr(friend_service, "batch_friend_status", fake_batch, raising=True)

        response = client.post(
            "/api/friends/batch-status",
            json={"player_ids": []},
            headers=headers,
        )
        assert response.status_code == 200


# ============================================================================
# GET /api/friends/mutual/{other_player_id}
# ============================================================================


class TestGetMutualFriends:
    """Tests for mutual friends."""

    def test_mutual_friends_success(self, client, headers, monkeypatch):
        """Returns mutual friends list."""

        async def fake_mutual(session, player_id, other_id):
            return {
                "mutual_friends": [{"player_id": 50, "full_name": "Mutual Friend"}],
                "count": 1,
            }

        monkeypatch.setattr(friend_service, "get_mutual_friends", fake_mutual, raising=True)

        response = client.get("/api/friends/mutual/20", headers=headers)
        assert response.status_code == 200
