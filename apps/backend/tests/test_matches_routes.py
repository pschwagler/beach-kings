"""
Tests for match route endpoints not covered by test_api_routes_comprehensive.py.

Covers:
- PUT /api/matches/{match_id}
- DELETE /api/matches/{match_id}
- POST /api/leagues/{league_id}/matches/upload-photo
- POST /api/leagues/{league_id}/matches/photo-sessions/{session_id}/edit
- POST /api/leagues/{league_id}/matches/photo-sessions/{session_id}/confirm
- DELETE /api/leagues/{league_id}/matches/photo-sessions/{session_id}
- GET /api/leagues/{league_id}/matches/photo-jobs/{job_id}
"""

import io
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services import (
    auth_service,
    data_service,
    photo_match_service,
    role_service,
    user_service,
)


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

_PHONE = "+10000000000"
_USER_ID = 1


def _make_admin_client(monkeypatch, phone: str = _PHONE, user_id: int = _USER_ID):
    """
    Return a TestClient and auth headers for a system-admin user.

    Uses monkeypatching to bypass real JWT verification and database lookups.
    The phone is registered as a system admin so league-scoped dependencies pass.
    """

    def fake_verify_token(token: str) -> dict:
        return {"user_id": user_id, "phone_number": phone}

    async def fake_get_user_by_id(session, uid: int) -> dict:
        return {
            "id": user_id,
            "phone_number": phone,
            "name": "Admin",
            "email": "admin@example.com",
            "is_verified": True,
            "created_at": "2020-01-01T00:00:00Z",
        }

    async def fake_get_setting(session, key: str):
        if key == "system_admin_phone_numbers":
            return phone
        if key == "system_admin_emails":
            return None
        return None

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
    monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)

    async def fake_is_system_admin(session, uid):
        return True

    monkeypatch.setattr(role_service, "is_system_admin", fake_is_system_admin, raising=True)

    async def fake_require_active_players(session, player_ids):
        return None

    monkeypatch.setattr(
        "backend.api.routes.matches.require_active_players",
        fake_require_active_players,
    )

    return TestClient(app), {"Authorization": "Bearer dummy"}


def _make_user_client(monkeypatch, phone: str = _PHONE, user_id: int = _USER_ID):
    """Return a non-system-admin client for negative authorization tests."""
    client, headers = _make_admin_client(monkeypatch, phone=phone, user_id=user_id)

    async def fake_is_system_admin(session, uid):
        return False

    monkeypatch.setattr(role_service, "is_system_admin", fake_is_system_admin, raising=True)
    return client, headers


# ---------------------------------------------------------------------------
# Shared match fixture values
# ---------------------------------------------------------------------------

_VALID_UPDATE_BODY = {
    "team1_player1_id": 1,
    "team1_player2_id": 2,
    "team2_player1_id": 3,
    "team2_player2_id": 4,
    "team1_score": 21,
    "team2_score": 15,
}

_ACTIVE_MATCH = {
    "id": 10,
    "session_id": 5,
    "session_status": "ACTIVE",
}

_VALID_CREATE_BODY = {
    **_VALID_UPDATE_BODY,
    "session_id": 5,
}


# ---------------------------------------------------------------------------
# POST /api/matches
# ---------------------------------------------------------------------------


class TestCreateMatchScoreValidation:
    """Score validation runs before session lookup or creation."""

    def test_create_match_rejects_tied_score_with_actionable_message(self, monkeypatch):
        client, headers = _make_user_client(monkeypatch)

        response = client.post(
            "/api/matches",
            json={**_VALID_CREATE_BODY, "team1_score": 21, "team2_score": 21},
            headers=headers,
        )

        assert response.status_code == 400
        assert response.json()["detail"] == (
            "Choose a winner by changing one score. Games cannot end in a tie."
        )


class TestCreateMatchAuthorizationAndStats:
    """Authorization and finalized-session reconciliation for match creation."""

    def test_active_league_session_rejects_non_member(self, monkeypatch):
        client, headers = _make_user_client(monkeypatch)
        create_called = False

        async def fake_get_session(session, session_id):
            return {"id": session_id, "status": "ACTIVE", "league_id": 12}

        async def fake_has_league_role(session, user_id, league_id, required_role):
            assert league_id == 12
            assert required_role is None
            return False

        async def fake_create_match(session, match_request, session_id):
            nonlocal create_called
            create_called = True
            return 100

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(
            "backend.api.routes.sessions._has_league_role",
            fake_has_league_role,
        )
        monkeypatch.setattr(data_service, "create_match_async", fake_create_match, raising=True)

        response = client.post("/api/matches", json=_VALID_CREATE_BODY, headers=headers)

        assert response.status_code == 404
        assert create_called is False

    def test_submitted_session_create_returns_stats_jobs(self, monkeypatch):
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_session(session, session_id):
            return {
                "id": session_id,
                "status": "SUBMITTED",
                "league_id": None,
                "created_by": 99,
            }

        async def fake_can_add(session, session_id, session_obj, user_id):
            return True

        async def fake_create_match(session, match_request, session_id):
            return 100

        async def fake_enqueue(session, league_id):
            assert league_id is None
            return {"global_job_id": 73, "league_job_id": None}

        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(
            data_service, "can_user_add_match_to_session", fake_can_add, raising=True
        )
        monkeypatch.setattr(data_service, "create_match_async", fake_create_match, raising=True)
        monkeypatch.setattr(
            data_service, "enqueue_stats_recalculation", fake_enqueue, raising=True
        )

        response = client.post("/api/matches", json=_VALID_CREATE_BODY, headers=headers)

        assert response.status_code == 200
        assert response.json()["global_job_id"] == 73


# ---------------------------------------------------------------------------
# PUT /api/matches/{match_id}
# ---------------------------------------------------------------------------


class TestUpdateMatch:
    """Tests for PUT /api/matches/{match_id}."""

    def test_update_match_success(self, monkeypatch):
        """A valid update on an ACTIVE session returns 200 with success status."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_match(session, match_id):
            return _ACTIVE_MATCH.copy()

        async def fake_get_player_by_user_id(session, user_id):
            return {"id": 99}

        async def fake_get_session(session, session_id):
            return {
                "id": session_id,
                "status": "ACTIVE",
                "league_id": None,
                "created_by": 99,
            }

        async def fake_can_add(session, session_id, session_obj, user_id):
            return True

        async def fake_update_match(session, match_id, match_request, updated_by):
            return True

        monkeypatch.setattr(data_service, "get_match_async", fake_get_match, raising=True)
        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(
            data_service, "can_user_add_match_to_session", fake_can_add, raising=True
        )
        monkeypatch.setattr(
            data_service, "get_player_by_user_id", fake_get_player_by_user_id, raising=True
        )
        monkeypatch.setattr(data_service, "update_match_async", fake_update_match, raising=True)

        response = client.put("/api/matches/10", json=_VALID_UPDATE_BODY, headers=headers)

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "success"
        assert body["match_id"] == 10

    def test_active_pickup_match_rejects_non_participant(self, monkeypatch):
        client, headers = _make_user_client(monkeypatch)
        update_called = False

        async def fake_get_match(session, match_id):
            return _ACTIVE_MATCH.copy()

        async def fake_get_session(session, session_id):
            return {"id": session_id, "status": "ACTIVE", "league_id": None}

        async def fake_can_add(session, session_id, session_obj, user_id):
            return False

        async def fake_update(session, match_id, match_request, updated_by):
            nonlocal update_called
            update_called = True
            return True

        monkeypatch.setattr(data_service, "get_match_async", fake_get_match, raising=True)
        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(
            data_service, "can_user_add_match_to_session", fake_can_add, raising=True
        )
        monkeypatch.setattr(data_service, "update_match_async", fake_update, raising=True)

        response = client.put("/api/matches/10", json=_VALID_UPDATE_BODY, headers=headers)

        assert response.status_code == 404
        assert update_called is False

    def test_update_match_not_found(self, monkeypatch):
        """Returns 404 when the match does not exist."""
        client, headers = _make_user_client(monkeypatch)

        async def fake_get_match(session, match_id):
            return None

        monkeypatch.setattr(data_service, "get_match_async", fake_get_match, raising=True)

        response = client.put("/api/matches/999", json=_VALID_UPDATE_BODY, headers=headers)

        assert response.status_code == 404

    def test_submitted_match_update_returns_stats_jobs(self, monkeypatch):
        """Editing finalized results queues the rebuild the client will poll."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_match(session, match_id):
            return {**_ACTIVE_MATCH, "session_status": "SUBMITTED"}

        async def fake_get_session(session, session_id):
            return {
                "id": session_id,
                "status": "SUBMITTED",
                "league_id": None,
                "created_by": 99,
            }

        async def fake_get_player(session, user_id):
            return {"id": 99}

        async def fake_update(session, match_id, match_request, updated_by):
            return True

        async def fake_enqueue(session, league_id):
            assert league_id is None
            return {"global_job_id": 71, "league_job_id": None}

        monkeypatch.setattr(data_service, "get_match_async", fake_get_match, raising=True)
        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "get_player_by_user_id", fake_get_player, raising=True)
        monkeypatch.setattr(data_service, "update_match_async", fake_update, raising=True)
        monkeypatch.setattr(
            data_service,
            "enqueue_stats_recalculation",
            fake_enqueue,
            raising=True,
        )

        response = client.put("/api/matches/10", json=_VALID_UPDATE_BODY, headers=headers)

        assert response.status_code == 200
        assert response.json()["global_job_id"] == 71

    def test_update_match_duplicate_players(self, monkeypatch):
        """Returns 400 when the same player appears in multiple slots."""
        client, headers = _make_admin_client(monkeypatch)

        duplicate_body = {**_VALID_UPDATE_BODY, "team2_player1_id": 1}  # player 1 used twice

        response = client.put("/api/matches/10", json=duplicate_body, headers=headers)

        assert response.status_code == 400
        assert "distinct" in response.json()["detail"].lower()

    def test_update_match_rejects_tied_score_with_actionable_message(self, monkeypatch):
        client, headers = _make_admin_client(monkeypatch)

        response = client.put(
            "/api/matches/10",
            json={**_VALID_UPDATE_BODY, "team1_score": 21, "team2_score": 21},
            headers=headers,
        )

        assert response.status_code == 400
        assert response.json()["detail"] == (
            "Choose a winner by changing one score. Games cannot end in a tie."
        )


# ---------------------------------------------------------------------------
# DELETE /api/matches/{match_id}
# ---------------------------------------------------------------------------


class TestDeleteMatch:
    """Tests for DELETE /api/matches/{match_id}."""

    def test_delete_match_success(self, monkeypatch):
        """Deleting an existing ACTIVE-session match returns 200."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_match(session, match_id):
            return _ACTIVE_MATCH.copy()

        async def fake_delete_match(session, match_id):
            return True

        async def fake_get_session(session, session_id):
            return {"id": session_id, "status": "ACTIVE", "league_id": None}

        async def fake_can_add(session, session_id, session_obj, user_id):
            return True

        monkeypatch.setattr(data_service, "get_match_async", fake_get_match, raising=True)
        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(
            data_service, "can_user_add_match_to_session", fake_can_add, raising=True
        )
        monkeypatch.setattr(data_service, "delete_match_async", fake_delete_match, raising=True)

        response = client.delete("/api/matches/10", headers=headers)

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "success"
        assert body["match_id"] == 10

    def test_active_league_match_rejects_non_member(self, monkeypatch):
        client, headers = _make_user_client(monkeypatch)
        delete_called = False

        async def fake_get_match(session, match_id):
            return _ACTIVE_MATCH.copy()

        async def fake_get_session(session, session_id):
            return {"id": session_id, "status": "ACTIVE", "league_id": 12}

        async def fake_has_league_role(session, user_id, league_id, required_role):
            return False

        async def fake_delete(session, match_id):
            nonlocal delete_called
            delete_called = True
            return True

        monkeypatch.setattr(data_service, "get_match_async", fake_get_match, raising=True)
        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(
            "backend.api.routes.sessions._has_league_role",
            fake_has_league_role,
        )
        monkeypatch.setattr(data_service, "delete_match_async", fake_delete, raising=True)

        response = client.delete("/api/matches/10", headers=headers)

        assert response.status_code == 404
        assert delete_called is False

    def test_delete_match_not_found(self, monkeypatch):
        """Returns 404 when the match does not exist."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_match(session, match_id):
            return None

        monkeypatch.setattr(data_service, "get_match_async", fake_get_match, raising=True)

        response = client.delete("/api/matches/999", headers=headers)

        assert response.status_code == 404

    def test_submitted_match_delete_returns_stats_jobs(self, monkeypatch):
        """Deleting finalized results queues and exposes the stats rebuild."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_match(session, match_id):
            return {**_ACTIVE_MATCH, "session_status": "EDITED"}

        async def fake_get_session(session, session_id):
            return {
                "id": session_id,
                "status": "EDITED",
                "league_id": None,
                "created_by": 99,
            }

        async def fake_get_player(session, user_id):
            return {"id": 99}

        async def fake_delete(session, match_id):
            return True

        async def fake_enqueue(session, league_id):
            return {"global_job_id": 72, "league_job_id": None}

        monkeypatch.setattr(data_service, "get_match_async", fake_get_match, raising=True)
        monkeypatch.setattr(data_service, "get_session", fake_get_session, raising=True)
        monkeypatch.setattr(data_service, "get_player_by_user_id", fake_get_player, raising=True)
        monkeypatch.setattr(data_service, "delete_match_async", fake_delete, raising=True)
        monkeypatch.setattr(
            data_service,
            "enqueue_stats_recalculation",
            fake_enqueue,
            raising=True,
        )

        response = client.delete("/api/matches/10", headers=headers)

        assert response.status_code == 200
        assert response.json()["global_job_id"] == 72


# ---------------------------------------------------------------------------
# Photo upload + session endpoints
# ---------------------------------------------------------------------------


class TestPhotoEndpointsRequireAuth:
    """Verify that all photo endpoints reject unauthenticated requests."""

    def test_upload_photo_requires_auth(self):
        """POST upload-photo without a token returns 401 or 403."""
        client = TestClient(app)
        fake_file = io.BytesIO(b"not a real image")
        response = client.post(
            "/api/leagues/1/matches/upload-photo",
            files={"file": ("test.jpg", fake_file, "image/jpeg")},
        )
        assert response.status_code in (401, 403)

    def test_edit_photo_session_requires_auth(self):
        """POST photo-sessions/{id}/edit without a token returns 401 or 403."""
        client = TestClient(app)
        response = client.post(
            "/api/leagues/1/matches/photo-sessions/abc123/edit",
            json={"edit_prompt": "change something"},
        )
        assert response.status_code in (401, 403)

    def test_confirm_photo_session_requires_auth(self):
        """POST photo-sessions/{id}/confirm without a token returns 401 or 403."""
        client = TestClient(app)
        response = client.post(
            "/api/leagues/1/matches/photo-sessions/abc123/confirm",
            json={"season_id": 1, "match_date": "3/20/2026"},
        )
        assert response.status_code in (401, 403)

    def test_cancel_photo_session_requires_auth(self):
        """DELETE photo-sessions/{id} without a token returns 401 or 403."""
        client = TestClient(app)
        response = client.delete("/api/leagues/1/matches/photo-sessions/abc123")
        assert response.status_code in (401, 403)

    def test_get_photo_job_requires_auth(self):
        """GET photo-jobs/{id} without a token returns 401 or 403."""
        client = TestClient(app)
        response = client.get("/api/leagues/1/matches/photo-jobs/42")
        assert response.status_code in (401, 403)


class TestConfirmPhotoSession:
    """Functional tests for POST photo-sessions/{id}/confirm."""

    def test_confirm_missing_season_id_is_valid_gap_game(self, monkeypatch):
        """Omitting season_id is valid for gap games (Bug #3 fix).

        After the fix ``season_id`` is Optional[int]; a request without it
        proceeds to the Redis session lookup.  With no Redis data available
        the route returns 404 rather than 400/422.
        """
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_session_data(session_id: str):
            return None  # Redis has no data for this session

        monkeypatch.setattr(
            photo_match_service, "get_session_data", fake_get_session_data, raising=True
        )

        response = client.post(
            "/api/leagues/1/matches/photo-sessions/abc123/confirm",
            json={"match_date": "3/20/2026"},
            headers=headers,
        )
        # Gap game request (no season_id) must NOT be rejected with 400/422.
        # It reaches the session lookup → 404 because Redis has no data.
        assert response.status_code == 404, (
            f"Omitting season_id should produce 404 (session not found) for a gap game, "
            f"not 400/422.  Got {response.status_code}: {response.text}."
        )

    def test_confirm_session_not_found_returns_404(self, monkeypatch):
        """Returns 404 when Redis session data does not exist."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_session_data(session_id: str):
            return None

        monkeypatch.setattr(
            photo_match_service, "get_session_data", fake_get_session_data, raising=True
        )

        response = client.post(
            "/api/leagues/1/matches/photo-sessions/abc123/confirm",
            json={"season_id": 1, "match_date": "3/20/2026"},
            headers=headers,
        )
        assert response.status_code == 404


class TestGetPhotoJob:
    """Functional tests for GET photo-jobs/{job_id}."""

    def test_get_photo_job_not_found_returns_404(self, monkeypatch):
        """Returns 404 when the job does not exist."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_photo_match_job(session, job_id: int):
            return None

        monkeypatch.setattr(
            photo_match_service, "get_photo_match_job", fake_get_photo_match_job, raising=True
        )

        response = client.get("/api/leagues/1/matches/photo-jobs/999", headers=headers)
        assert response.status_code == 404

    def test_get_photo_job_wrong_league_returns_403(self, monkeypatch):
        """Returns 403 when the job belongs to a different league."""
        client, headers = _make_admin_client(monkeypatch)

        fake_job = MagicMock()
        fake_job.id = 42
        fake_job.league_id = 99  # different from request league_id=1
        fake_job.status = MagicMock()
        fake_job.status.value = "PENDING"
        fake_job.created_at = None
        fake_job.started_at = None
        fake_job.completed_at = None
        fake_job.result_data = None
        fake_job.error_message = None

        async def fake_get_photo_match_job(session, job_id: int):
            return fake_job

        monkeypatch.setattr(
            photo_match_service, "get_photo_match_job", fake_get_photo_match_job, raising=True
        )

        response = client.get("/api/leagues/1/matches/photo-jobs/42", headers=headers)
        assert response.status_code == 403


# ---------------------------------------------------------------------------
# Photo upload authenticated happy paths
# ---------------------------------------------------------------------------


class TestUploadMatchPhoto:
    """Functional tests for POST /api/leagues/{league_id}/matches/upload-photo."""

    def test_upload_photo_success(self, monkeypatch):
        """Happy path: valid image upload returns job_id and session_id."""
        client, headers = _make_admin_client(monkeypatch)

        def fake_validate(file_content, content_type, filename):
            return True, None

        def fake_preprocess(file_content):
            return None, "base64encodedimage"

        def fake_generate_session_id():
            return "sess_abc123"

        async def fake_list_members(session, league_id):
            return [{"id": 1, "full_name": "Player One"}]

        async def fake_get_player(session, user_id):
            return {"id": 5}

        async def fake_store_session(session_id, data):
            return True

        async def fake_create_job(session, league_id, session_id):
            return 42

        async def fake_process_photo_job(**kwargs):
            pass

        monkeypatch.setattr(photo_match_service, "validate_image_file", fake_validate)
        monkeypatch.setattr(photo_match_service, "preprocess_image", fake_preprocess)
        monkeypatch.setattr(photo_match_service, "generate_session_id", fake_generate_session_id)
        monkeypatch.setattr(data_service, "list_league_members", fake_list_members, raising=True)
        monkeypatch.setattr(data_service, "get_player_by_user_id", fake_get_player, raising=True)
        monkeypatch.setattr(photo_match_service, "store_session_data", fake_store_session)
        monkeypatch.setattr(photo_match_service, "create_photo_match_job", fake_create_job)
        monkeypatch.setattr(photo_match_service, "process_photo_job", fake_process_photo_job)

        import io

        fake_file = io.BytesIO(b"fake image content")
        response = client.post(
            "/api/leagues/1/matches/upload-photo",
            files={"file": ("test.jpg", fake_file, "image/jpeg")},
            headers=headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert body["job_id"] == 42
        assert body["session_id"] == "sess_abc123"
        assert body["status"] == "PENDING"

    def test_upload_photo_invalid_file_returns_400(self, monkeypatch):
        """Invalid image file returns 400 with error message."""
        client, headers = _make_admin_client(monkeypatch)

        def fake_validate(file_content, content_type, filename):
            return False, "File type not supported"

        monkeypatch.setattr(photo_match_service, "validate_image_file", fake_validate)

        import io

        fake_file = io.BytesIO(b"not an image")
        response = client.post(
            "/api/leagues/1/matches/upload-photo",
            files={"file": ("test.txt", fake_file, "text/plain")},
            headers=headers,
        )

        assert response.status_code == 400
        assert "File type not supported" in response.json()["detail"]

    def test_upload_photo_session_store_failure_returns_500(self, monkeypatch):
        """Failure to store session data surfaces as 500."""
        client, headers = _make_admin_client(monkeypatch)

        def fake_validate(file_content, content_type, filename):
            return True, None

        def fake_preprocess(file_content):
            return None, "base64encodedimage"

        def fake_generate_session_id():
            return "sess_fail"

        async def fake_list_members(session, league_id):
            return []

        async def fake_get_player(session, user_id):
            return None

        async def fake_store_session(session_id, data):
            return False  # storage failure

        monkeypatch.setattr(photo_match_service, "validate_image_file", fake_validate)
        monkeypatch.setattr(photo_match_service, "preprocess_image", fake_preprocess)
        monkeypatch.setattr(photo_match_service, "generate_session_id", fake_generate_session_id)
        monkeypatch.setattr(data_service, "list_league_members", fake_list_members, raising=True)
        monkeypatch.setattr(data_service, "get_player_by_user_id", fake_get_player, raising=True)
        monkeypatch.setattr(photo_match_service, "store_session_data", fake_store_session)

        import io

        fake_file = io.BytesIO(b"fake image content")
        response = client.post(
            "/api/leagues/1/matches/upload-photo",
            files={"file": ("test.jpg", fake_file, "image/jpeg")},
            headers=headers,
        )

        assert response.status_code == 500


# ---------------------------------------------------------------------------
# Edit photo session
# ---------------------------------------------------------------------------


class TestEditPhotoSession:
    """Functional tests for POST /api/leagues/{league_id}/matches/photo-sessions/{id}/edit."""

    def test_edit_session_success(self, monkeypatch):
        """Happy path: edit prompt triggers a new clarification job."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_session_data(session_id: str):
            return {"league_id": 1, "status": "PENDING"}

        async def fake_list_members(session, league_id):
            return []

        async def fake_create_job(session, league_id, session_id):
            return 55

        async def fake_process_clarification(**kwargs):
            pass

        monkeypatch.setattr(photo_match_service, "get_session_data", fake_get_session_data)
        monkeypatch.setattr(data_service, "list_league_members", fake_list_members, raising=True)
        monkeypatch.setattr(photo_match_service, "create_photo_match_job", fake_create_job)
        monkeypatch.setattr(
            photo_match_service, "process_clarification_job", fake_process_clarification
        )

        response = client.post(
            "/api/leagues/1/matches/photo-sessions/sess_abc/edit",
            json={"edit_prompt": "Player 1 is actually Alice"},
            headers=headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert body["job_id"] == 55
        assert body["session_id"] == "sess_abc"
        assert body["status"] == "PENDING"

    def test_edit_session_not_found_returns_404(self, monkeypatch):
        """Session not found in Redis returns 404."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_session_data(session_id: str):
            return None

        monkeypatch.setattr(photo_match_service, "get_session_data", fake_get_session_data)

        response = client.post(
            "/api/leagues/1/matches/photo-sessions/nonexistent/edit",
            json={"edit_prompt": "fix this"},
            headers=headers,
        )

        assert response.status_code == 404

    def test_edit_session_wrong_league_returns_403(self, monkeypatch):
        """Session belonging to a different league returns 403."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_session_data(session_id: str):
            return {"league_id": 99, "status": "PENDING"}  # different league

        monkeypatch.setattr(photo_match_service, "get_session_data", fake_get_session_data)

        response = client.post(
            "/api/leagues/1/matches/photo-sessions/sess_xyz/edit",
            json={"edit_prompt": "fix this"},
            headers=headers,
        )

        assert response.status_code == 403

    def test_edit_session_missing_prompt_returns_400(self, monkeypatch):
        """Missing edit_prompt in body returns 400 or 422."""
        client, headers = _make_admin_client(monkeypatch)

        response = client.post(
            "/api/leagues/1/matches/photo-sessions/sess_abc/edit",
            json={},
            headers=headers,
        )

        assert response.status_code in (400, 422)


# ---------------------------------------------------------------------------
# Cancel photo session
# ---------------------------------------------------------------------------


class TestCancelPhotoSession:
    """Functional tests for DELETE /api/leagues/{league_id}/matches/photo-sessions/{id}."""

    def test_cancel_session_success(self, monkeypatch):
        """Happy path: session is cleaned up and returns cancelled status."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_session_data(session_id: str):
            return {"league_id": 1, "status": "PENDING"}

        async def fake_cleanup(session_id: str):
            pass

        monkeypatch.setattr(photo_match_service, "get_session_data", fake_get_session_data)
        monkeypatch.setattr(photo_match_service, "cleanup_session", fake_cleanup)

        response = client.delete(
            "/api/leagues/1/matches/photo-sessions/sess_abc",
            headers=headers,
        )

        assert response.status_code == 200
        assert response.json()["status"] == "cancelled"

    def test_cancel_session_wrong_league_returns_403(self, monkeypatch):
        """Session belonging to a different league cannot be cancelled."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_session_data(session_id: str):
            return {"league_id": 99}  # different league

        monkeypatch.setattr(photo_match_service, "get_session_data", fake_get_session_data)

        response = client.delete(
            "/api/leagues/1/matches/photo-sessions/sess_xyz",
            headers=headers,
        )

        assert response.status_code == 403

    def test_cancel_nonexistent_session_still_succeeds(self, monkeypatch):
        """Cancel on an already-expired session returns cancelled (no-op)."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_session_data(session_id: str):
            return None  # session already gone

        async def fake_cleanup(session_id: str):
            pass

        monkeypatch.setattr(photo_match_service, "get_session_data", fake_get_session_data)
        monkeypatch.setattr(photo_match_service, "cleanup_session", fake_cleanup)

        response = client.delete(
            "/api/leagues/1/matches/photo-sessions/already_gone",
            headers=headers,
        )

        assert response.status_code == 200
        assert response.json()["status"] == "cancelled"


# ---------------------------------------------------------------------------
# SSE stream endpoint
# ---------------------------------------------------------------------------


class TestStreamPhotoJob:
    """Functional tests for GET /api/leagues/{league_id}/matches/photo-jobs/{job_id}/stream."""

    def test_stream_job_requires_auth(self):
        """Unauthenticated request is rejected."""
        client = TestClient(app)
        response = client.get("/api/leagues/1/matches/photo-jobs/1/stream")
        assert response.status_code in (401, 403)

    def test_stream_job_not_found_returns_404(self, monkeypatch):
        """Non-existent job returns 404 before stream starts."""
        client, headers = _make_admin_client(monkeypatch)

        async def fake_get_photo_match_job(session, job_id: int):
            return None

        monkeypatch.setattr(
            photo_match_service, "get_photo_match_job", fake_get_photo_match_job, raising=True
        )

        response = client.get("/api/leagues/1/matches/photo-jobs/999/stream", headers=headers)
        assert response.status_code == 404

    def test_stream_job_wrong_league_returns_403(self, monkeypatch):
        """Job belonging to a different league returns 403."""
        client, headers = _make_admin_client(monkeypatch)

        fake_job = MagicMock()
        fake_job.id = 77
        fake_job.league_id = 50  # different from request league_id=1
        fake_job.session_id = "sess_abc"

        async def fake_get_photo_match_job(session, job_id: int):
            return fake_job

        monkeypatch.setattr(
            photo_match_service, "get_photo_match_job", fake_get_photo_match_job, raising=True
        )

        response = client.get("/api/leagues/1/matches/photo-jobs/77/stream", headers=headers)
        assert response.status_code == 403

    def test_stream_job_returns_event_stream_content_type(self, monkeypatch):
        """Successful stream returns text/event-stream content type."""
        client, headers = _make_admin_client(monkeypatch)

        fake_job = MagicMock()
        fake_job.id = 1
        fake_job.league_id = 1
        fake_job.session_id = "sess_abc"

        async def fake_get_photo_match_job(session, job_id: int):
            return fake_job

        async def fake_stream_events(job_id, league_id, session_id):
            yield "done", {"status": "COMPLETED", "matches": []}

        monkeypatch.setattr(
            photo_match_service, "get_photo_match_job", fake_get_photo_match_job, raising=True
        )
        monkeypatch.setattr(photo_match_service, "stream_photo_job_events", fake_stream_events)

        response = client.get("/api/leagues/1/matches/photo-jobs/1/stream", headers=headers)
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]
