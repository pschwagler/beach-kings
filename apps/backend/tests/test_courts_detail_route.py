"""Route-layer tests for GET /api/courts/{id_or_slug}.

Pins the response shape to the contract that CourtDetailScreen.tsx consumes.
Service logic is tested elsewhere; these tests verify the HTTP layer only.
"""

from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services import court_service

# ---------------------------------------------------------------------------
# Required top-level keys that CourtDetailScreen reads
# ---------------------------------------------------------------------------

REQUIRED_KEYS = {
    "name",
    "city",
    "state",
    "average_rating",
    "review_count",
    "court_count",
    "surface_type",
    "hours",
    "address",
    "latitude",
    "longitude",
    "is_free",
    "has_lights",
    "has_restrooms",
    "has_parking",
    "nets_provided",
    "description",
    "court_photos",
    "all_photos",
    "reviews",
    "photo_count",
    "top_tags",
}

# ---------------------------------------------------------------------------
# Fake court detail returned by the service
# ---------------------------------------------------------------------------

FAKE_COURT_DETAIL = {
    "id": 1,
    "name": "Manhattan Beach Courts",
    "slug": "manhattan-beach",
    "city": "Manhattan Beach",
    "state": "CA",
    "address": "1 Manhattan Beach Blvd",
    "description": "Iconic South Bay destination.",
    "surface_type": "sand",
    "court_count": 8,
    "is_free": True,
    "has_lights": False,
    "has_restrooms": True,
    "has_parking": True,
    "nets_provided": False,
    "hours": "Dawn to dusk",
    "latitude": 33.8847,
    "longitude": -118.4109,
    "average_rating": 4.6,
    "review_count": 42,
    "phone": None,
    "website": None,
    "cost_info": None,
    "parking_info": None,
    "location_id": "socal_la",
    "location_name": "Southern California – Los Angeles",
    "location_slug": "socal_la",
    "status": "approved",
    "is_active": True,
    "created_by": None,
    "reviews": [],
    "court_photos": [],
    "all_photos": [
        {"id": 1, "url": "https://example.com/photo1.jpg", "sort_order": 0},
        {"id": 2, "url": "https://example.com/photo2.jpg", "sort_order": 1},
    ],
    "created_at": "2024-01-01T00:00:00",
    "updated_at": "2024-01-02T00:00:00",
}

FAKE_COURT_DETAIL_2 = {
    **FAKE_COURT_DETAIL,
    "id": 2,
    "name": "Venice Beach Courts",
    "slug": "venice-beach",
    "city": "Venice",
    "state": "CA",
    "address": "1800 Ocean Front Walk",
    "all_photos": [],
}


# ============================================================================
# Helper
# ============================================================================


def _monkeypatch_service(
    monkeypatch,
    court_detail: dict | None,
    top_tags: list[str] | None = None,
) -> None:
    """Patch court_service so the route returns controlled data."""

    async def fake_get_court_by_slug(session: object, slug: str) -> dict | None:
        return court_detail

    async def fake_batch_get_top_tags(
        session: object, court_ids: list[int], limit: int = 3
    ) -> dict[int, list[str]]:
        if court_detail is None or not court_ids:
            return {}
        return {court_ids[0]: top_tags or []}

    monkeypatch.setattr(court_service, "get_court_by_slug", fake_get_court_by_slug, raising=True)
    monkeypatch.setattr(
        court_service, "_batch_get_top_tags", fake_batch_get_top_tags, raising=True
    )


# ============================================================================
# Shape-contract test
# ============================================================================


class TestGetCourtDetailShape:
    """Assert every key that CourtDetailScreen reads is present in the response."""

    def test_200_all_required_keys_present(self, monkeypatch: object) -> None:
        """Response includes all keys CourtDetailScreen.tsx consumes."""
        _monkeypatch_service(monkeypatch, FAKE_COURT_DETAIL, top_tags=["popular", "sand"])

        client = TestClient(app)
        response = client.get("/api/courts/manhattan-beach")

        assert response.status_code == 200
        data = response.json()
        missing = REQUIRED_KEYS - set(data.keys())
        assert not missing, f"Response is missing required keys: {missing}"

    def test_photo_count_is_len_all_photos(self, monkeypatch: object) -> None:
        """photo_count equals len(all_photos) from the service dict."""
        _monkeypatch_service(monkeypatch, FAKE_COURT_DETAIL, top_tags=[])

        client = TestClient(app)
        response = client.get("/api/courts/1")

        assert response.status_code == 200
        data = response.json()
        assert data["photo_count"] == len(FAKE_COURT_DETAIL["all_photos"])

    def test_top_tags_attached(self, monkeypatch: object) -> None:
        """top_tags returned by _batch_get_top_tags are included."""
        _monkeypatch_service(monkeypatch, FAKE_COURT_DETAIL, top_tags=["popular", "sand"])

        client = TestClient(app)
        response = client.get("/api/courts/manhattan-beach")

        assert response.status_code == 200
        assert response.json()["top_tags"] == ["popular", "sand"]

    def test_top_tags_empty_when_none(self, monkeypatch: object) -> None:
        """top_tags is an empty list when there are no tags."""
        _monkeypatch_service(monkeypatch, FAKE_COURT_DETAIL, top_tags=[])

        client = TestClient(app)
        response = client.get("/api/courts/manhattan-beach")

        assert response.status_code == 200
        assert response.json()["top_tags"] == []


# ============================================================================
# 404 cases
# ============================================================================


class TestGetCourtDetailNotFound:
    """Returns 404 for unknown id or slug."""

    def test_unknown_slug_returns_404(self, monkeypatch: object) -> None:
        """Service returning None → HTTP 404."""
        _monkeypatch_service(monkeypatch, None)

        client = TestClient(app)
        response = client.get("/api/courts/does-not-exist")

        assert response.status_code == 404

    def test_unknown_numeric_id_returns_404(self, monkeypatch: object) -> None:
        """Numeric id with no match → HTTP 404."""
        _monkeypatch_service(monkeypatch, None)

        client = TestClient(app)
        response = client.get("/api/courts/99999")

        assert response.status_code == 404

    def test_404_detail_message(self, monkeypatch: object) -> None:
        """404 response body contains a 'detail' key."""
        _monkeypatch_service(monkeypatch, None)

        client = TestClient(app)
        response = client.get("/api/courts/nonexistent")

        assert response.status_code == 404
        assert "detail" in response.json()


# ============================================================================
# Slug vs id parity
# ============================================================================


class TestGetCourtDetailParity:
    """GET /api/courts/123 and /api/courts/slug resolve identically."""

    def test_numeric_id_and_slug_return_same_record(self, monkeypatch: object) -> None:
        """Both forms are forwarded to get_court_by_slug; same mock → same data."""
        _monkeypatch_service(monkeypatch, FAKE_COURT_DETAIL, top_tags=["popular"])

        client = TestClient(app)
        by_id = client.get("/api/courts/1").json()
        by_slug = client.get("/api/courts/manhattan-beach").json()

        assert by_id["name"] == by_slug["name"]
        assert by_id["id"] == by_slug["id"]

    def test_service_receives_string_id_or_slug(self, monkeypatch: object) -> None:
        """The raw path segment (string) is forwarded unchanged to get_court_by_slug."""
        received: list[str] = []

        async def fake_get(session: object, slug: str) -> dict:
            received.append(slug)
            return FAKE_COURT_DETAIL

        async def fake_tags(
            session: object, court_ids: list[int], limit: int = 3
        ) -> dict[int, list[str]]:
            return {FAKE_COURT_DETAIL["id"]: []}

        monkeypatch.setattr(court_service, "get_court_by_slug", fake_get, raising=True)
        monkeypatch.setattr(
            court_service, "_batch_get_top_tags", fake_tags, raising=True
        )

        client = TestClient(app)
        client.get("/api/courts/42")
        client.get("/api/courts/manhattan-beach")

        assert received == ["42", "manhattan-beach"]


# ============================================================================
# Error handling
# ============================================================================


class TestGetCourtDetailErrors:
    """Unexpected exceptions surface as 500."""

    def test_service_exception_returns_500(self, monkeypatch: object) -> None:
        """Unhandled service exception → HTTP 500."""

        async def fake_get(session: object, slug: str) -> None:
            raise RuntimeError("DB connection lost")

        monkeypatch.setattr(court_service, "get_court_by_slug", fake_get, raising=True)

        client = TestClient(app)
        response = client.get("/api/courts/any-court")

        assert response.status_code == 500
