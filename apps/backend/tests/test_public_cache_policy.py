"""Public reads must separate catalog caching from viewer-dependent responses."""

from unittest.mock import AsyncMock

import pytest
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from backend.api.auth_dependencies import get_current_user_optional
from backend.api.main import app
from backend.database.db import get_db_session
from backend.services import court_service, public_service


@pytest.fixture
def client(monkeypatch):
    async def session():
        yield AsyncMock()

    async def viewer(request: Request):
        return {
            "Bearer owner": {"id": 11},
            "Bearer other": {"id": 12},
        }.get(request.headers.get("Authorization"))

    app.dependency_overrides[get_db_session] = session
    app.dependency_overrides[get_current_user_optional] = viewer
    monkeypatch.setattr(public_service, "get_sitemap_players", AsyncMock(return_value=[]))
    monkeypatch.setattr(court_service, "get_all_tags", AsyncMock(return_value=[]))
    yield TestClient(app)
    app.dependency_overrides.pop(get_db_session, None)
    app.dependency_overrides.pop(get_current_user_optional, None)


def assert_varies_by_viewer(response):
    vary = {value.strip().lower() for value in response.headers["Vary"].split(",")}
    assert {"authorization", "cookie"} <= vary


def test_profile_responses_remain_separate_between_owner_other_and_anonymous(client, monkeypatch):
    async def profile(session, player_id, viewer_user=None):
        owner = viewer_user is not None and viewer_user["id"] == 11
        return {
            "id": player_id,
            "full_name": "Synthetic Player",
            "stats": {"total_games": 3, "total_wins": 2 if owner else None},
            "game_history_visible": owner,
            "profile_is_private": True,
        }

    monkeypatch.setattr(public_service, "get_public_player", profile)
    responses = [
        client.get("/api/public/players/1", headers={"Authorization": "Bearer owner"}),
        client.get("/api/public/players/1", headers={"Authorization": "Bearer other"}),
        client.get("/api/public/players/1"),
    ]

    assert [response.json()["stats"]["total_wins"] for response in responses] == [2, None, None]
    for response in responses:
        assert response.status_code == 200
        assert response.headers["Cache-Control"] == "private, no-store"
        assert_varies_by_viewer(response)


def test_court_saved_state_is_private_and_anonymous_catalog_is_cacheable(client, monkeypatch):
    async def player_id(session, caller):
        return caller["id"] if caller else None

    async def courts(session, **filters):
        item = {
            "id": 1,
            "name": "Synthetic Court",
            "slug": "synthetic-court",
            "location_id": "synthetic",
        }
        if filters["player_id"] is not None:
            item["is_saved"] = filters["player_id"] == 11
        return {"items": [item], "total_count": 1, "page": 1, "page_size": 20}

    monkeypatch.setattr(court_service, "get_player_id_for_user", player_id)
    monkeypatch.setattr(court_service, "list_courts_public", courts)

    for credential, expected in (("Bearer owner", True), ("Bearer other", False)):
        response = client.get("/api/public/courts", headers={"Authorization": credential})
        assert response.status_code == 200
        assert response.json()["items"][0]["is_saved"] is expected
        assert response.headers["Cache-Control"] == "private, no-store"
        assert_varies_by_viewer(response)

    anonymous = client.get("/api/public/courts")
    assert anonymous.status_code == 200
    assert anonymous.json()["items"][0]["is_saved"] is None
    assert anonymous.headers["Cache-Control"] == "public, max-age=300, s-maxage=300"
    assert_varies_by_viewer(anonymous)


@pytest.mark.parametrize(
    "headers",
    [
        {"Authorization": "Bearer owner"},
        {"Authorization": "Bearer invalid"},
        {"Authorization": ""},
        {"Cookie": "synthetic_session=placeholder"},
    ],
)
def test_credential_bearing_catalog_requests_are_not_stored(client, headers):
    response = client.get("/api/public/sitemap/players", headers=headers)

    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "private, no-store"
    assert_varies_by_viewer(response)


@pytest.mark.parametrize("path", ["/api/public/sitemap/players", "/api/public/courts/tags"])
def test_anonymous_catalog_cache_is_preserved(client, path):
    response = client.get(path)

    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "public, max-age=300, s-maxage=300"
    assert_varies_by_viewer(response)


def test_cache_variation_preserves_cors_origin(client):
    response = client.get(
        "/api/public/sitemap/players", headers={"Origin": "http://localhost:3000"}
    )

    assert response.status_code == 200
    assert "origin" in {part.strip().lower() for part in response.headers["Vary"].split(",")}
    assert_varies_by_viewer(response)


@pytest.mark.parametrize(
    "cache_control",
    ["private, no-store", "no-cache", "max-age=0", "public, max-age=0, must-revalidate"],
)
def test_explicit_response_policy_and_existing_variation_are_preserved(
    client, monkeypatch, cache_control
):
    monkeypatch.setattr(
        public_service,
        "get_sitemap_players",
        AsyncMock(
            return_value=JSONResponse(
                [], headers={"Cache-Control": cache_control, "Vary": "Accept-Language"}
            )
        ),
    )
    response = client.get("/api/public/sitemap/players")

    assert response.status_code == 200
    assert response.headers["Cache-Control"] == cache_control
    assert "accept-language" in response.headers["Vary"].lower()
    assert_varies_by_viewer(response)


@pytest.mark.parametrize(
    "path, status",
    [
        ("/api/public/players/1", 404),
        ("/api/public/players/not-a-number", 422),
        ("/api/public/courts?north=41", 422),
        ("/api/public/unknown-route", 404),
    ],
)
def test_public_error_responses_are_not_stored(client, monkeypatch, path, status):
    monkeypatch.setattr(public_service, "get_public_player", AsyncMock(return_value=None))
    response = client.get(path)

    assert response.status_code == status
    assert response.headers["Cache-Control"] == "private, no-store"
    assert_varies_by_viewer(response)


def test_public_cache_policy_does_not_change_other_api_routes(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.headers.get("Cache-Control") != "public, max-age=300, s-maxage=300"
    assert "authorization" not in response.headers.get("Vary", "").lower()
