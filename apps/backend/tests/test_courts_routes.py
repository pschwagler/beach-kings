"""Route-layer tests for courts.py endpoints.

Service logic is tested in test_court_service.py.
These tests verify the HTTP layer: auth guards, status codes, response shapes.

Mocked services: data_service, court_service, court_photo_service, s3_service, geocoding_service.
"""

import io
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from backend.api.main import app
from backend.api.auth_dependencies import require_verified_player
from backend.services import (
    auth_service,
    data_service,
    court_service,
    court_photo_service,
    s3_service,
    geocoding_service,
    user_service,
)


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

_ADMIN_PHONE = "+10000000000"
_USER_PHONE = "+19999999999"
_ADMIN_PLAYER_ID = 1
_USER_PLAYER_ID = 10

FAKE_ADMIN_USER = {
    "id": 1,
    "phone_number": _ADMIN_PHONE,
    "name": "Admin",
    "email": "admin@example.com",
    "is_verified": True,
    "created_at": "2020-01-01T00:00:00Z",
    "player_id": _ADMIN_PLAYER_ID,
}

FAKE_REGULAR_USER = {
    "id": 2,
    "phone_number": _USER_PHONE,
    "name": "Regular User",
    "email": "user@example.com",
    "is_verified": True,
    "created_at": "2020-01-01T00:00:00Z",
    "player_id": _USER_PLAYER_ID,
}


def _make_system_admin_client(monkeypatch, phone=_ADMIN_PHONE, user_id=1, player_id=_ADMIN_PLAYER_ID):
    """Return (client, headers) with system-admin auth mocked."""

    def fake_verify_token(token):
        return {"user_id": user_id, "phone_number": phone}

    async def fake_get_user_by_id(session, uid):
        return {
            "id": user_id,
            "phone_number": phone,
            "name": "Admin",
            "email": "admin@example.com",
            "is_verified": True,
            "created_at": "2020-01-01T00:00:00Z",
        }

    async def fake_get_setting(session, key):
        if key == "system_admin_phone_numbers":
            return phone
        if key == "system_admin_emails":
            return None
        return None

    monkeypatch.setattr(auth_service, "verify_token", fake_verify_token, raising=True)
    monkeypatch.setattr(user_service, "get_user_by_id", fake_get_user_by_id, raising=True)
    monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)

    return TestClient(app), {"Authorization": "Bearer dummy"}


def _make_verified_player_client(monkeypatch):
    """Return (client, headers) with a verified player (non-admin) mocked."""

    async def _fake_verified_player():
        return FAKE_REGULAR_USER

    app.dependency_overrides[require_verified_player] = _fake_verified_player
    return TestClient(app), {"Authorization": "Bearer dummy"}


def _restore_verified_player(original=None):
    """Remove the dependency override for require_verified_player."""
    app.dependency_overrides.pop(require_verified_player, None)


# ---------------------------------------------------------------------------
# Fake return values
# ---------------------------------------------------------------------------

FAKE_COURT = {
    "id": 1,
    "name": "Mission Bay Courts",
    "address": "123 Beach Dr, San Diego, CA",
    "location_id": "socal_sd",
    "latitude": 32.7,
    "longitude": -117.2,
    "status": "approved",
}

FAKE_REVIEW = {
    "review_id": 1,
    "average_rating": 4.0,
    "review_count": 1,
}

FAKE_SUGGESTION = {
    "id": 1,
    "court_id": 1,
    "suggested_by_player_id": _USER_PLAYER_ID,
    "changes": {"name": "New Name"},
    "status": "pending",
    "created_at": "2024-01-01T00:00:00Z",
}


# ============================================================================
# GET /api/courts  — public list
# ============================================================================


class TestListCourts:
    """Tests for GET /api/courts."""

    def test_list_courts_no_filter(self, monkeypatch):
        """Returns all courts when no location_id specified."""

        async def fake_list_courts(session, location_id):
            return [FAKE_COURT]

        monkeypatch.setattr(data_service, "list_courts", fake_list_courts, raising=True)

        client = TestClient(app)
        response = client.get("/api/courts")
        assert response.status_code == 200
        assert len(response.json()) == 1
        assert response.json()[0]["name"] == "Mission Bay Courts"

    def test_list_courts_with_location_filter(self, monkeypatch):
        """location_id filter is forwarded to service."""
        captured = {}

        async def fake_list_courts(session, location_id):
            captured["location_id"] = location_id
            return []

        monkeypatch.setattr(data_service, "list_courts", fake_list_courts, raising=True)

        client = TestClient(app)
        response = client.get("/api/courts?location_id=socal_sd")
        assert response.status_code == 200
        assert captured["location_id"] == "socal_sd"

    def test_list_courts_service_error_returns_500(self, monkeypatch):
        """Service exception surfaces as HTTP 500."""

        async def fake_list_courts(session, location_id):
            raise RuntimeError("DB down")

        monkeypatch.setattr(data_service, "list_courts", fake_list_courts, raising=True)

        client = TestClient(app)
        response = client.get("/api/courts")
        assert response.status_code == 500


# ============================================================================
# POST /api/courts  — admin create
# ============================================================================


class TestCreateCourt:
    """Tests for POST /api/courts (system_admin)."""

    def test_create_court_success(self, monkeypatch):
        """Admin can create a court."""

        async def fake_create_court(session, name, address, location_id, geoJson):
            return FAKE_COURT

        monkeypatch.setattr(data_service, "create_court", fake_create_court, raising=True)

        client, headers = _make_system_admin_client(monkeypatch)
        response = client.post(
            "/api/courts",
            json={"name": "Mission Bay Courts", "location_id": "socal_sd"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Mission Bay Courts"

    def test_create_court_missing_name_returns_400(self, monkeypatch):
        """Missing name returns 400 (KeyError caught in route)."""
        client, headers = _make_system_admin_client(monkeypatch)
        response = client.post(
            "/api/courts",
            json={"location_id": "socal_sd"},
            headers=headers,
        )
        assert response.status_code == 400
        assert "name" in response.json()["detail"].lower()

    def test_create_court_missing_location_id_returns_400(self, monkeypatch):
        """Missing location_id returns 400."""
        client, headers = _make_system_admin_client(monkeypatch)
        response = client.post(
            "/api/courts",
            json={"name": "Test Court"},
            headers=headers,
        )
        assert response.status_code == 400

    def test_create_court_non_admin_returns_403(self, monkeypatch):
        """Non-system-admin cannot create courts."""
        client, headers = _make_system_admin_client(
            monkeypatch, phone=_USER_PHONE, user_id=2, player_id=_USER_PLAYER_ID
        )
        # Override the admin check to return non-admin phone
        async def fake_get_setting(session, key):
            if key == "system_admin_phone_numbers":
                return _ADMIN_PHONE  # not the user's phone
            return None

        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)

        response = client.post(
            "/api/courts",
            json={"name": "Test", "location_id": "socal_sd"},
            headers=headers,
        )
        assert response.status_code == 403

    def test_create_court_no_auth_returns_403(self):
        """Unauthenticated request returns 401/403."""
        client = TestClient(app)
        response = client.post(
            "/api/courts",
            json={"name": "Test", "location_id": "socal_sd"},
        )
        assert response.status_code in (401, 403)


# ============================================================================
# PUT /api/courts/{court_id}  — admin update
# ============================================================================


class TestUpdateCourt:
    """Tests for PUT /api/courts/{court_id} (system_admin)."""

    def test_update_court_success(self, monkeypatch):
        """Admin can update a court."""

        async def fake_update(session, court_id, name, address, location_id, geoJson):
            return {**FAKE_COURT, "name": name}

        monkeypatch.setattr(data_service, "update_court", fake_update, raising=True)

        client, headers = _make_system_admin_client(monkeypatch)
        response = client.put(
            "/api/courts/1",
            json={"name": "Updated Court Name"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Updated Court Name"

    def test_update_court_not_found_returns_404(self, monkeypatch):
        """Service returning None triggers 404."""

        async def fake_update(session, court_id, name, address, location_id, geoJson):
            return None

        monkeypatch.setattr(data_service, "update_court", fake_update, raising=True)

        client, headers = _make_system_admin_client(monkeypatch)
        response = client.put(
            "/api/courts/999",
            json={"name": "X"},
            headers=headers,
        )
        assert response.status_code == 404

    def test_update_court_non_admin_returns_403(self, monkeypatch):
        """Non-admin cannot update courts via admin endpoint."""
        client, headers = _make_system_admin_client(
            monkeypatch, phone=_USER_PHONE, user_id=2, player_id=_USER_PLAYER_ID
        )

        async def fake_get_setting(session, key):
            if key == "system_admin_phone_numbers":
                return _ADMIN_PHONE
            return None

        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)

        response = client.put("/api/courts/1", json={"name": "X"}, headers=headers)
        assert response.status_code == 403


# ============================================================================
# DELETE /api/courts/{court_id}  — admin delete
# ============================================================================


class TestDeleteCourt:
    """Tests for DELETE /api/courts/{court_id} (system_admin)."""

    def test_delete_court_success(self, monkeypatch):
        """Admin can delete a court."""

        async def fake_delete(session, court_id):
            return True

        monkeypatch.setattr(data_service, "delete_court", fake_delete, raising=True)

        client, headers = _make_system_admin_client(monkeypatch)
        response = client.delete("/api/courts/1", headers=headers)
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_delete_court_not_found_returns_404(self, monkeypatch):
        """Service returning False triggers 404."""

        async def fake_delete(session, court_id):
            return False

        monkeypatch.setattr(data_service, "delete_court", fake_delete, raising=True)

        client, headers = _make_system_admin_client(monkeypatch)
        response = client.delete("/api/courts/999", headers=headers)
        assert response.status_code == 404

    def test_delete_court_non_admin_returns_403(self, monkeypatch):
        """Non-admin gets 403."""
        client, headers = _make_system_admin_client(
            monkeypatch, phone=_USER_PHONE, user_id=2, player_id=_USER_PLAYER_ID
        )

        async def fake_get_setting(session, key):
            if key == "system_admin_phone_numbers":
                return _ADMIN_PHONE
            return None

        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)
        response = client.delete("/api/courts/1", headers=headers)
        assert response.status_code == 403


# ============================================================================
# GET /api/courts/placeholder
# ============================================================================


class TestGetPlaceholderCourt:
    """Tests for GET /api/courts/placeholder (public)."""

    def test_get_placeholder_success(self, monkeypatch):
        """Returns placeholder court when found."""

        async def fake_get_placeholder(session, location_id):
            return {"id": 99, "name": "Other / Private Court", "location_id": location_id}

        monkeypatch.setattr(court_service, "get_placeholder_court", fake_get_placeholder, raising=True)

        client = TestClient(app)
        response = client.get("/api/courts/placeholder?location_id=socal_sd")
        assert response.status_code == 200
        assert response.json()["name"] == "Other / Private Court"

    def test_get_placeholder_not_found_returns_404(self, monkeypatch):
        """Missing placeholder court returns 404."""

        async def fake_get_placeholder(session, location_id):
            return None

        monkeypatch.setattr(court_service, "get_placeholder_court", fake_get_placeholder, raising=True)

        client = TestClient(app)
        response = client.get("/api/courts/placeholder?location_id=unknown")
        assert response.status_code == 404

    def test_get_placeholder_missing_location_id_returns_422(self):
        """Missing location_id query param returns 422."""
        client = TestClient(app)
        response = client.get("/api/courts/placeholder")
        assert response.status_code == 422


# ============================================================================
# POST /api/courts/submit  — player submit court
# ============================================================================


class TestSubmitCourt:
    """Tests for POST /api/courts/submit (verified player)."""

    _SUBMIT_BODY = {
        "name": "New Beach Court",
        "address": "456 Ocean Blvd, San Diego, CA 92101",
        "location_id": "socal_sd",
        "latitude": 32.7,
        "longitude": -117.2,
    }

    def test_submit_court_success(self, monkeypatch):
        """Verified player can submit a new court."""

        async def fake_create_court(session, **kwargs):
            return {**FAKE_COURT, "status": "pending"}

        monkeypatch.setattr(court_service, "create_court", fake_create_court, raising=True)

        client, headers = _make_verified_player_client(monkeypatch)
        response = client.post("/api/courts/submit", json=self._SUBMIT_BODY, headers=headers)
        _restore_verified_player()

        assert response.status_code == 200
        assert response.json()["status"] == "pending"

    def test_submit_court_geocodes_when_no_lat_lng(self, monkeypatch):
        """If lat/lng are absent, geocoding service is called."""
        geocode_called = []

        async def fake_geocode(address):
            geocode_called.append(address)
            return (32.7, -117.2)

        async def fake_create_court(session, **kwargs):
            return FAKE_COURT

        monkeypatch.setattr(geocoding_service, "geocode_address", fake_geocode, raising=True)
        monkeypatch.setattr(court_service, "create_court", fake_create_court, raising=True)

        body_no_coords = {k: v for k, v in self._SUBMIT_BODY.items() if k not in ("latitude", "longitude")}
        client, headers = _make_verified_player_client(monkeypatch)
        response = client.post("/api/courts/submit", json=body_no_coords, headers=headers)
        _restore_verified_player()

        assert response.status_code == 200
        assert len(geocode_called) == 1

    def test_submit_court_no_auth_returns_403(self):
        """Unauthenticated request returns 401/403."""
        _restore_verified_player()
        client = TestClient(app)
        response = client.post("/api/courts/submit", json=self._SUBMIT_BODY)
        assert response.status_code in (401, 403)

    def test_submit_court_service_error_returns_500(self, monkeypatch):
        """Unexpected exception returns 500."""

        async def fake_geocode(address):
            return (32.7, -117.2)

        async def fake_create_court(session, **kwargs):
            raise RuntimeError("DB down")

        monkeypatch.setattr(geocoding_service, "geocode_address", fake_geocode, raising=True)
        monkeypatch.setattr(court_service, "create_court", fake_create_court, raising=True)

        client, headers = _make_verified_player_client(monkeypatch)
        response = client.post("/api/courts/submit", json=self._SUBMIT_BODY, headers=headers)
        _restore_verified_player()

        assert response.status_code == 500


# ============================================================================
# POST /api/courts/{court_id}/reviews  — create review
# ============================================================================


class TestCreateCourtReview:
    """Tests for POST /api/courts/{court_id}/reviews (verified player)."""

    def test_create_review_success(self, monkeypatch):
        """Verified player can review a court."""

        async def fake_create_review(session, court_id, player_id, rating, review_text, tag_ids):
            return FAKE_REVIEW

        monkeypatch.setattr(court_service, "create_review", fake_create_review, raising=True)

        client, headers = _make_verified_player_client(monkeypatch)
        response = client.post(
            "/api/courts/1/reviews",
            json={"rating": 4, "review_text": "Great courts!"},
            headers=headers,
        )
        _restore_verified_player()

        assert response.status_code == 200
        assert response.json()["review_id"] == 1

    def test_create_review_duplicate_returns_409(self, monkeypatch):
        """Duplicate review raises ValueError -> 409."""

        async def fake_create_review(session, court_id, player_id, rating, review_text, tag_ids):
            raise ValueError("Already reviewed this court")

        monkeypatch.setattr(court_service, "create_review", fake_create_review, raising=True)

        client, headers = _make_verified_player_client(monkeypatch)
        response = client.post(
            "/api/courts/1/reviews",
            json={"rating": 4},
            headers=headers,
        )
        _restore_verified_player()

        assert response.status_code == 409

    def test_create_review_missing_rating_returns_422(self, monkeypatch):
        """Missing rating field returns 422."""
        client, headers = _make_verified_player_client(monkeypatch)
        response = client.post(
            "/api/courts/1/reviews",
            json={"review_text": "Nice"},
            headers=headers,
        )
        _restore_verified_player()
        assert response.status_code == 422

    def test_create_review_no_auth_returns_403(self):
        """Unauthenticated request returns 401/403."""
        _restore_verified_player()
        client = TestClient(app)
        response = client.post("/api/courts/1/reviews", json={"rating": 5})
        assert response.status_code in (401, 403)


# ============================================================================
# PUT /api/courts/{court_id}/reviews/{review_id}  — update review
# ============================================================================


class TestUpdateCourtReview:
    """Tests for PUT /api/courts/{court_id}/reviews/{review_id}."""

    def test_update_review_success(self, monkeypatch):
        """Author can update their review."""

        async def fake_update(session, review_id, player_id, rating, review_text, tag_ids):
            return FAKE_REVIEW

        monkeypatch.setattr(court_service, "update_review", fake_update, raising=True)

        client, headers = _make_verified_player_client(monkeypatch)
        response = client.put(
            "/api/courts/1/reviews/1",
            json={"rating": 5, "review_text": "Even better!"},
            headers=headers,
        )
        _restore_verified_player()

        assert response.status_code == 200
        assert response.json()["review_id"] == 1

    def test_update_review_not_found_returns_404(self, monkeypatch):
        """Service returning None triggers 404."""

        async def fake_update(session, review_id, player_id, rating, review_text, tag_ids):
            return None

        monkeypatch.setattr(court_service, "update_review", fake_update, raising=True)

        client, headers = _make_verified_player_client(monkeypatch)
        response = client.put(
            "/api/courts/1/reviews/999",
            json={"rating": 3},
            headers=headers,
        )
        _restore_verified_player()

        assert response.status_code == 404


# ============================================================================
# DELETE /api/courts/{court_id}/reviews/{review_id}
# ============================================================================


class TestDeleteCourtReview:
    """Tests for DELETE /api/courts/{court_id}/reviews/{review_id}."""

    def test_delete_review_success(self, monkeypatch):
        """Author can delete their review. S3 cleanup happens if photos exist."""

        async def fake_delete(session, review_id, player_id):
            return {**FAKE_REVIEW, "photo_s3_keys": []}

        monkeypatch.setattr(court_service, "delete_review", fake_delete, raising=True)

        client, headers = _make_verified_player_client(monkeypatch)
        response = client.delete("/api/courts/1/reviews/1", headers=headers)
        _restore_verified_player()

        assert response.status_code == 200

    def test_delete_review_not_found_returns_404(self, monkeypatch):
        """Service returning None triggers 404."""

        async def fake_delete(session, review_id, player_id):
            return None

        monkeypatch.setattr(court_service, "delete_review", fake_delete, raising=True)

        client, headers = _make_verified_player_client(monkeypatch)
        response = client.delete("/api/courts/1/reviews/999", headers=headers)
        _restore_verified_player()

        assert response.status_code == 404

    def test_delete_review_triggers_s3_cleanup(self, monkeypatch):
        """S3 delete is called for each photo key when deleting a review with photos."""
        deleted_keys = []

        async def fake_delete(session, review_id, player_id):
            return {**FAKE_REVIEW, "photo_s3_keys": ["key1.jpg", "key2.jpg"]}

        def fake_s3_delete(key):
            deleted_keys.append(key)

        monkeypatch.setattr(court_service, "delete_review", fake_delete, raising=True)
        monkeypatch.setattr(s3_service, "delete_file", fake_s3_delete, raising=True)

        client, headers = _make_verified_player_client(monkeypatch)
        response = client.delete("/api/courts/1/reviews/1", headers=headers)
        _restore_verified_player()

        assert response.status_code == 200
        assert "key1.jpg" in deleted_keys
        assert "key2.jpg" in deleted_keys

    def test_delete_review_no_auth_returns_403(self):
        """Unauthenticated request returns 401/403."""
        _restore_verified_player()
        client = TestClient(app)
        response = client.delete("/api/courts/1/reviews/1")
        assert response.status_code in (401, 403)


# ============================================================================
# POST /api/courts/{court_id}/reviews/{review_id}/photos  — upload review photo
# ============================================================================


class TestUploadReviewPhoto:
    """Tests for POST /api/courts/{court_id}/reviews/{review_id}/photos."""

    def test_upload_review_photo_success(self, monkeypatch):
        """Author can upload a photo to their review."""

        async def fake_process(file):
            return b"processed_image_data"

        def fake_upload(data, key, content_type):
            return "https://s3.example.com/photo.jpg"

        async def fake_add_photo(session, review_id, player_id, s3_key, url):
            return {"id": 1, "url": url, "s3_key": s3_key}

        monkeypatch.setattr(court_photo_service, "process_court_photo", fake_process, raising=True)
        monkeypatch.setattr(s3_service, "upload_file", fake_upload, raising=True)
        monkeypatch.setattr(court_service, "add_review_photo", fake_add_photo, raising=True)

        client, headers = _make_verified_player_client(monkeypatch)
        fake_file = io.BytesIO(b"fake image data")
        response = client.post(
            "/api/courts/1/reviews/1/photos",
            files={"file": ("photo.jpg", fake_file, "image/jpeg")},
            headers=headers,
        )
        _restore_verified_player()

        assert response.status_code == 200
        assert "url" in response.json()

    def test_upload_review_photo_review_not_found_returns_404(self, monkeypatch):
        """Service returning None triggers 404; S3 object is cleaned up."""
        cleanup_called = []

        async def fake_process(file):
            return b"data"

        def fake_upload(data, key, content_type):
            return "https://s3.example.com/photo.jpg"

        async def fake_add_photo(session, review_id, player_id, s3_key, url):
            return None

        def fake_delete(key):
            cleanup_called.append(key)

        monkeypatch.setattr(court_photo_service, "process_court_photo", fake_process, raising=True)
        monkeypatch.setattr(s3_service, "upload_file", fake_upload, raising=True)
        monkeypatch.setattr(court_service, "add_review_photo", fake_add_photo, raising=True)
        monkeypatch.setattr(s3_service, "delete_file", fake_delete, raising=True)

        client, headers = _make_verified_player_client(monkeypatch)
        fake_file = io.BytesIO(b"data")
        response = client.post(
            "/api/courts/1/reviews/999/photos",
            files={"file": ("photo.jpg", fake_file, "image/jpeg")},
            headers=headers,
        )
        _restore_verified_player()

        assert response.status_code == 404
        # S3 cleanup should be triggered
        assert len(cleanup_called) == 1

    def test_upload_review_photo_no_auth_returns_403(self):
        """Unauthenticated request returns 401/403."""
        _restore_verified_player()
        client = TestClient(app)
        fake_file = io.BytesIO(b"data")
        response = client.post(
            "/api/courts/1/reviews/1/photos",
            files={"file": ("photo.jpg", fake_file, "image/jpeg")},
        )
        assert response.status_code in (401, 403)


# ============================================================================
# POST /api/courts/{court_id}/suggest-edit
# ============================================================================


class TestSuggestCourtEdit:
    """Tests for POST /api/courts/{court_id}/suggest-edit."""

    def test_suggest_edit_success(self, monkeypatch):
        """Verified player can suggest an edit."""

        async def fake_create_suggestion(session, court_id, suggested_by_player_id, changes):
            return FAKE_SUGGESTION

        monkeypatch.setattr(
            court_service, "create_edit_suggestion", fake_create_suggestion, raising=True
        )

        client, headers = _make_verified_player_client(monkeypatch)
        response = client.post(
            "/api/courts/1/suggest-edit",
            json={"changes": {"name": "Better Name"}},
            headers=headers,
        )
        _restore_verified_player()

        assert response.status_code == 200
        assert response.json()["status"] == "pending"

    def test_suggest_edit_no_auth_returns_403(self):
        """Unauthenticated request returns 401/403."""
        _restore_verified_player()
        client = TestClient(app)
        response = client.post(
            "/api/courts/1/suggest-edit",
            json={"changes": {"name": "X"}},
        )
        assert response.status_code in (401, 403)

    def test_suggest_edit_missing_changes_returns_422(self, monkeypatch):
        """Missing changes field returns 422."""
        client, headers = _make_verified_player_client(monkeypatch)
        response = client.post(
            "/api/courts/1/suggest-edit",
            json={},
            headers=headers,
        )
        _restore_verified_player()
        assert response.status_code == 422


# ============================================================================
# GET /api/admin-view/courts/pending  — admin only
# ============================================================================


class TestListPendingCourts:
    """Tests for GET /api/admin-view/courts/pending."""

    def test_list_pending_courts_admin_success(self, monkeypatch):
        """Admin can list pending courts."""

        async def fake_list_pending(session):
            return [{"id": 5, "name": "Pending Court", "status": "pending"}]

        monkeypatch.setattr(court_service, "list_pending_courts", fake_list_pending, raising=True)

        client, headers = _make_system_admin_client(monkeypatch)
        response = client.get("/api/admin-view/courts/pending", headers=headers)
        assert response.status_code == 200
        assert len(response.json()) == 1

    def test_list_pending_courts_non_admin_returns_403(self, monkeypatch):
        """Non-admin gets 403."""
        client, headers = _make_system_admin_client(
            monkeypatch, phone=_USER_PHONE, user_id=2, player_id=_USER_PLAYER_ID
        )

        async def fake_get_setting(session, key):
            if key == "system_admin_phone_numbers":
                return _ADMIN_PHONE
            return None

        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)
        response = client.get("/api/admin-view/courts/pending", headers=headers)
        assert response.status_code == 403

    def test_list_pending_courts_no_auth_returns_403(self):
        """Unauthenticated request returns 401/403."""
        client = TestClient(app)
        response = client.get("/api/admin-view/courts/pending")
        assert response.status_code in (401, 403)


# ============================================================================
# PUT /api/admin-view/courts/{court_id}/approve
# ============================================================================


class TestApproveCourt:
    """Tests for PUT /api/admin-view/courts/{court_id}/approve."""

    def test_approve_court_success(self, monkeypatch):
        """Admin can approve a pending court."""

        async def fake_approve(session, court_id):
            return {**FAKE_COURT, "status": "approved"}

        monkeypatch.setattr(court_service, "approve_court", fake_approve, raising=True)

        client, headers = _make_system_admin_client(monkeypatch)
        response = client.put("/api/admin-view/courts/1/approve", headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "approved"

    def test_approve_court_not_found_returns_404(self, monkeypatch):
        """Service returning None triggers 404."""

        async def fake_approve(session, court_id):
            return None

        monkeypatch.setattr(court_service, "approve_court", fake_approve, raising=True)

        client, headers = _make_system_admin_client(monkeypatch)
        response = client.put("/api/admin-view/courts/999/approve", headers=headers)
        assert response.status_code == 404

    def test_approve_court_non_admin_returns_403(self, monkeypatch):
        """Non-admin gets 403."""
        client, headers = _make_system_admin_client(
            monkeypatch, phone=_USER_PHONE, user_id=2, player_id=_USER_PLAYER_ID
        )

        async def fake_get_setting(session, key):
            if key == "system_admin_phone_numbers":
                return _ADMIN_PHONE
            return None

        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)
        response = client.put("/api/admin-view/courts/1/approve", headers=headers)
        assert response.status_code == 403


# ============================================================================
# PUT /api/admin-view/courts/{court_id}/reject
# ============================================================================


class TestRejectCourt:
    """Tests for PUT /api/admin-view/courts/{court_id}/reject."""

    def test_reject_court_success(self, monkeypatch):
        """Admin can reject a pending court."""

        async def fake_reject(session, court_id):
            return {**FAKE_COURT, "status": "rejected"}

        monkeypatch.setattr(court_service, "reject_court", fake_reject, raising=True)

        client, headers = _make_system_admin_client(monkeypatch)
        response = client.put("/api/admin-view/courts/1/reject", headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "rejected"

    def test_reject_court_not_found_returns_404(self, monkeypatch):
        """Service returning None triggers 404."""

        async def fake_reject(session, court_id):
            return None

        monkeypatch.setattr(court_service, "reject_court", fake_reject, raising=True)

        client, headers = _make_system_admin_client(monkeypatch)
        response = client.put("/api/admin-view/courts/999/reject", headers=headers)
        assert response.status_code == 404


# ============================================================================
# GET /api/admin-view/courts/suggestions
# ============================================================================


class TestListAllSuggestionsAdmin:
    """Tests for GET /api/admin-view/courts/suggestions."""

    def test_list_suggestions_admin_success(self, monkeypatch):
        """Admin can list all suggestions with pagination."""

        async def fake_list_suggestions(session, status, page, page_size):
            return {
                "items": [FAKE_SUGGESTION],
                "total": 1,
                "page": 1,
                "page_size": 25,
            }

        monkeypatch.setattr(
            court_service, "list_all_suggestions_admin", fake_list_suggestions, raising=True
        )

        client, headers = _make_system_admin_client(monkeypatch)
        response = client.get("/api/admin-view/courts/suggestions", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1

    def test_list_suggestions_with_status_filter(self, monkeypatch):
        """Status filter is passed to service."""
        captured = {}

        async def fake_list_suggestions(session, status, page, page_size):
            captured["status"] = status
            return {"items": [], "total": 0, "page": 1, "page_size": 25}

        monkeypatch.setattr(
            court_service, "list_all_suggestions_admin", fake_list_suggestions, raising=True
        )

        client, headers = _make_system_admin_client(monkeypatch)
        response = client.get("/api/admin-view/courts/suggestions?status=approved", headers=headers)
        assert response.status_code == 200
        assert captured["status"] == "approved"

    def test_list_suggestions_non_admin_returns_403(self, monkeypatch):
        """Non-admin gets 403."""
        client, headers = _make_system_admin_client(
            monkeypatch, phone=_USER_PHONE, user_id=2, player_id=_USER_PLAYER_ID
        )

        async def fake_get_setting(session, key):
            if key == "system_admin_phone_numbers":
                return _ADMIN_PHONE
            return None

        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)
        response = client.get("/api/admin-view/courts/suggestions", headers=headers)
        assert response.status_code == 403


# ============================================================================
# DELETE /api/admin-view/courts/photos/{photo_id}
# ============================================================================


class TestAdminDeleteCourtPhoto:
    """Tests for DELETE /api/admin-view/courts/photos/{photo_id}."""

    def test_admin_delete_photo_success(self, monkeypatch):
        """Admin can delete a court photo; S3 cleanup is triggered."""
        s3_deleted = []

        async def fake_admin_delete(session, photo_id):
            return "court-photos/1/photo.jpg"

        def fake_s3_delete(key):
            s3_deleted.append(key)

        monkeypatch.setattr(
            court_service, "admin_delete_court_photo", fake_admin_delete, raising=True
        )
        monkeypatch.setattr(s3_service, "delete_file", fake_s3_delete, raising=True)

        client, headers = _make_system_admin_client(monkeypatch)
        response = client.delete("/api/admin-view/courts/photos/1", headers=headers)
        assert response.status_code == 200
        assert response.json()["deleted"] is True
        assert "court-photos/1/photo.jpg" in s3_deleted

    def test_admin_delete_photo_not_found_returns_404(self, monkeypatch):
        """Service returning None triggers 404."""

        async def fake_admin_delete(session, photo_id):
            return None

        monkeypatch.setattr(
            court_service, "admin_delete_court_photo", fake_admin_delete, raising=True
        )

        client, headers = _make_system_admin_client(monkeypatch)
        response = client.delete("/api/admin-view/courts/photos/999", headers=headers)
        assert response.status_code == 404

    def test_admin_delete_photo_non_admin_returns_403(self, monkeypatch):
        """Non-admin gets 403."""
        client, headers = _make_system_admin_client(
            monkeypatch, phone=_USER_PHONE, user_id=2, player_id=_USER_PLAYER_ID
        )

        async def fake_get_setting(session, key):
            if key == "system_admin_phone_numbers":
                return _ADMIN_PHONE
            return None

        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)
        response = client.delete("/api/admin-view/courts/photos/1", headers=headers)
        assert response.status_code == 403


# ============================================================================
# GET /api/admin-view/courts  — admin list all
# ============================================================================


class TestListAllCourtsAdmin:
    """Tests for GET /api/admin-view/courts."""

    def test_list_all_courts_admin_success(self, monkeypatch):
        """Admin can list all courts."""

        async def fake_list_admin(session, **kwargs):
            return {"items": [FAKE_COURT], "total": 1, "page": 1, "page_size": 25}

        monkeypatch.setattr(court_service, "list_all_courts_admin", fake_list_admin, raising=True)

        client, headers = _make_system_admin_client(monkeypatch)
        response = client.get("/api/admin-view/courts", headers=headers)
        assert response.status_code == 200
        assert response.json()["total"] == 1

    def test_list_all_courts_with_search(self, monkeypatch):
        """search and filter params are forwarded to service."""
        captured = {}

        async def fake_list_admin(session, **kwargs):
            captured.update(kwargs)
            return {"items": [], "total": 0, "page": 1, "page_size": 25}

        monkeypatch.setattr(court_service, "list_all_courts_admin", fake_list_admin, raising=True)

        client, headers = _make_system_admin_client(monkeypatch)
        response = client.get(
            "/api/admin-view/courts?search=mission&region_id=socal&page=2",
            headers=headers,
        )
        assert response.status_code == 200
        assert captured["search"] == "mission"
        assert captured["region_id"] == "socal"
        assert captured["page"] == 2

    def test_list_all_courts_non_admin_returns_403(self, monkeypatch):
        """Non-admin gets 403."""
        client, headers = _make_system_admin_client(
            monkeypatch, phone=_USER_PHONE, user_id=2, player_id=_USER_PLAYER_ID
        )

        async def fake_get_setting(session, key):
            if key == "system_admin_phone_numbers":
                return _ADMIN_PHONE
            return None

        monkeypatch.setattr(data_service, "get_setting", fake_get_setting, raising=True)
        response = client.get("/api/admin-view/courts", headers=headers)
        assert response.status_code == 403
