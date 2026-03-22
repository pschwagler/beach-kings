"""Route-layer tests for locations.py endpoints.

Covers: POST create, GET regions, GET distances, GET autocomplete.
GET /api/locations and PUT/DELETE already tested in test_api_endpoints.py.
"""

from fastapi.testclient import TestClient
from backend.api.main import app
from backend.services import auth_service, user_service, data_service, location_service


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------


def _make_admin_client(monkeypatch, phone="+10000000000", user_id=1):
    """Return (client, headers) with system-admin auth."""

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


# ============================================================================
# POST /api/locations
# ============================================================================


class TestCreateLocation:
    """Tests for creating a location."""

    def test_create_location_success(self, monkeypatch):
        """Admin can create a location."""

        async def fake_create(session, location_id, name, city=None, state=None, country="USA"):
            return {
                "id": location_id,
                "name": name,
                "city": city,
                "state": state,
                "country": country,
            }

        monkeypatch.setattr(data_service, "create_location", fake_create, raising=True)

        client, headers = _make_admin_client(monkeypatch)
        response = client.post(
            "/api/locations",
            json={"id": "socal_sd", "name": "San Diego", "city": "San Diego", "state": "CA"},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "socal_sd"
        assert data["name"] == "San Diego"

    def test_create_location_missing_fields(self, monkeypatch):
        """Missing required fields return 400."""
        client, headers = _make_admin_client(monkeypatch)
        # Missing 'id' field
        response = client.post(
            "/api/locations",
            json={"name": "Test Location"},
            headers=headers,
        )
        assert response.status_code == 400
        assert "Missing required field" in response.json()["detail"]

    def test_create_location_requires_admin(self):
        """Non-admin gets 401/403."""
        client = TestClient(app)
        response = client.post(
            "/api/locations",
            json={"id": "test", "name": "Test"},
        )
        assert response.status_code in (401, 403)


# ============================================================================
# GET /api/regions
# ============================================================================


class TestListRegions:
    """Tests for listing regions."""

    def test_list_regions_success(self, monkeypatch):
        """Public endpoint returns regions list."""

        async def fake_list(session):
            return [
                {"id": "socal", "name": "Southern California"},
                {"id": "norcal", "name": "Northern California"},
            ]

        monkeypatch.setattr(data_service, "list_regions", fake_list, raising=True)

        client = TestClient(app)
        response = client.get("/api/regions")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["id"] == "socal"


# ============================================================================
# GET /api/locations/distances
# ============================================================================


class TestLocationDistances:
    """Tests for location distances endpoint."""

    def test_distances_success(self, monkeypatch):
        """Returns sorted distances from given coordinates."""

        async def fake_distances(session, lat, lon):
            return [
                {"id": "socal_sd", "name": "San Diego", "distance_miles": 5.2},
                {"id": "socal_la", "name": "Los Angeles", "distance_miles": 120.5},
            ]

        monkeypatch.setattr(
            location_service, "get_all_location_distances", fake_distances, raising=True
        )

        client = TestClient(app)
        response = client.get("/api/locations/distances?lat=32.7&lon=-117.1")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["distance_miles"] < data[1]["distance_miles"]

    def test_distances_missing_params(self):
        """Missing lat/lon returns 422."""
        client = TestClient(app)
        response = client.get("/api/locations/distances")
        assert response.status_code == 422


# ============================================================================
# GET /api/geocode/autocomplete
# ============================================================================


class TestGeocodeAutocomplete:
    """Tests for geocode autocomplete."""

    def test_autocomplete_success(self, monkeypatch):
        """Returns autocomplete results."""

        async def fake_autocomplete(text):
            return {"features": [{"properties": {"city": "San Diego", "state": "California"}}]}

        monkeypatch.setattr(location_service, "autocomplete", fake_autocomplete, raising=True)

        client = TestClient(app)
        response = client.get("/api/geocode/autocomplete?text=San+Die")
        assert response.status_code == 200
        data = response.json()
        assert "features" in data
        assert len(data["features"]) == 1

    def test_autocomplete_short_text(self, monkeypatch):
        """Short text returns empty features."""

        async def fake_autocomplete(text):
            return {"features": []}

        monkeypatch.setattr(location_service, "autocomplete", fake_autocomplete, raising=True)

        client = TestClient(app)
        response = client.get("/api/geocode/autocomplete?text=S")
        assert response.status_code == 200
        assert response.json()["features"] == []
