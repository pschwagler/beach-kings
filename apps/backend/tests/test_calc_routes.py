"""Route-layer tests for calc.py endpoints.

Covers: loadsheets 501, calculate-stats status, job status.
POST /api/calculate and GET /api/health already tested in test_api_routes_comprehensive.py.
"""

from unittest.mock import AsyncMock, MagicMock
from fastapi.testclient import TestClient
from backend.api.main import app
from backend.services import auth_service, user_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_authed_client(monkeypatch, phone="+10000000000", user_id=1):
    """Return (client, headers) with basic auth mocked."""

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


# ============================================================================
# POST /api/loadsheets
# ============================================================================


class TestLoadSheets:
    """Tests for the disabled loadsheets endpoint."""

    def test_loadsheets_returns_501(self, monkeypatch):
        """Loadsheets endpoint is disabled and returns 501."""
        client, headers = _make_authed_client(monkeypatch)
        response = client.post("/api/loadsheets", headers=headers)
        assert response.status_code == 501
        assert "disabled" in response.json()["detail"].lower()

    def test_loadsheets_requires_auth(self):
        """Unauthenticated request returns 401/403."""
        client = TestClient(app)
        response = client.post("/api/loadsheets")
        assert response.status_code in (401, 403)


# ============================================================================
# GET /api/calculate-stats/status
# ============================================================================


class TestCalculateStatsStatus:
    """Tests for queue status endpoint."""

    def test_queue_status_success(self, monkeypatch):
        """Returns queue status."""
        mock_queue = MagicMock()
        mock_queue.get_queue_status = AsyncMock(
            return_value={
                "running": [],
                "pending": [],
                "recent": [],
                "queue_size": 0,
            }
        )
        monkeypatch.setattr("backend.api.routes.calc.get_stats_queue", lambda: mock_queue)

        client, headers = _make_authed_client(monkeypatch)

        response = client.get("/api/calculate-stats/status", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "queue_size" in data

    def test_queue_status_requires_auth(self):
        """Unauthenticated request returns 401/403."""
        client = TestClient(app)
        response = client.get("/api/calculate-stats/status")
        assert response.status_code in (401, 403)


# ============================================================================
# GET /api/calculate-stats/status/{job_id}
# ============================================================================


class TestJobStatus:
    """Tests for individual job status endpoint."""

    def test_job_status_success(self, monkeypatch):
        """Returns status for a specific job."""
        mock_queue = MagicMock()
        mock_queue.get_job_status = AsyncMock(
            return_value={
                "id": 1,
                "status": "completed",
                "calc_type": "league",
                "league_id": 1,
            }
        )
        monkeypatch.setattr("backend.api.routes.calc.get_stats_queue", lambda: mock_queue)

        client, headers = _make_authed_client(monkeypatch)

        response = client.get("/api/calculate-stats/status/1", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == 1
        assert data["status"] == "completed"

    def test_job_status_not_found(self, monkeypatch):
        """Unknown job ID returns 404."""
        mock_queue = MagicMock()
        mock_queue.get_job_status = AsyncMock(return_value=None)
        monkeypatch.setattr("backend.api.routes.calc.get_stats_queue", lambda: mock_queue)

        client, headers = _make_authed_client(monkeypatch)

        response = client.get("/api/calculate-stats/status/999", headers=headers)
        assert response.status_code == 404

    def test_job_status_requires_auth(self):
        """Unauthenticated request returns 401/403."""
        client = TestClient(app)
        response = client.get("/api/calculate-stats/status/1")
        assert response.status_code in (401, 403)
