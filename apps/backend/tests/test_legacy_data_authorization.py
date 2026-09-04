"""Launch-gate authorization tests for raw legacy stats and match datasets."""

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.api import auth_dependencies
from backend.api.auth_dependencies import (
    make_require_league_member_or_public,
    require_verified_player,
)
from backend.api.main import app
from backend.services import auth_service, role_service, user_service


@pytest.mark.parametrize(
    ("method", "path", "json_body"),
    [
        ("get", "/api/leagues/1/seasons", None),
        ("get", "/api/seasons/1", None),
        ("post", "/api/matches/elo", {"league_id": 1}),
        ("get", "/api/seasons/1/matches", None),
        ("post", "/api/player-stats", {"league_id": 1}),
        ("get", "/api/seasons/1/player-stats", None),
        ("post", "/api/partnership-opponent-stats", {"league_id": 1}),
        ("get", "/api/leagues/1/player-stats", None),
        ("post", "/api/rankings", {"league_id": 1}),
        ("get", "/api/seasons/1/awards", None),
        ("get", "/api/leagues/1/awards", None),
        ("get", "/api/players/1/awards", None),
        ("get", "/api/players/1/matches", None),
        ("get", "/api/players/1/stats", None),
        ("get", "/api/elo-timeline", None),
        ("post", "/api/matches/search", {"league_id": 1}),
        ("get", "/api/matches/export", None),
    ],
)
def test_raw_legacy_data_rejects_anonymous_callers(method, path, json_body):
    response = TestClient(app).request(method, path, json=json_body)
    assert response.status_code == 401


def _make_non_member_client(monkeypatch):
    monkeypatch.setattr(auth_service, "verify_token", lambda token: {"user_id": 9})

    async def fake_user(session, user_id):
        return {"id": user_id, "is_verified": True, "session_version": 0}

    async def not_admin(session, user_id):
        return False

    async def not_member(session, user_id, league_id, required_role):
        return False

    monkeypatch.setattr(user_service, "get_user_by_id", fake_user)
    monkeypatch.setattr(role_service, "is_system_admin", not_admin)
    monkeypatch.setattr(auth_dependencies, "_has_league_role", not_member)
    return TestClient(app), {"Authorization": "Bearer dummy"}


def test_raw_league_data_rejects_authenticated_non_member(monkeypatch):
    client, headers = _make_non_member_client(monkeypatch)
    response = client.get("/api/leagues/1/player-stats", headers=headers)
    assert response.status_code == 403


def test_photo_job_route_rejects_authenticated_non_member(monkeypatch):
    """The dependency factory must be invoked, not returned as a route value."""
    client, headers = _make_non_member_client(monkeypatch)
    response = client.get("/api/leagues/1/matches/photo-jobs/1", headers=headers)
    assert response.status_code == 403


class _PublicLeagueResult:
    def __init__(self, is_public):
        self.is_public = is_public

    def scalar_one_or_none(self):
        return self.is_public


class _LeagueVisibilitySession:
    def __init__(self, is_public):
        self.is_public = is_public

    async def execute(self, statement):
        return _PublicLeagueResult(self.is_public)


@pytest.mark.asyncio
async def test_public_league_metadata_allows_authenticated_non_member(monkeypatch):
    async def not_admin(session, user):
        return False

    async def not_member(session, user_id, league_id, required_role):
        return False

    monkeypatch.setattr(auth_dependencies, "_is_system_admin", not_admin)
    monkeypatch.setattr(auth_dependencies, "_has_league_role", not_member)
    dependency = make_require_league_member_or_public()

    user = {"id": 9}
    assert await dependency(1, user, _LeagueVisibilitySession(True)) is user


@pytest.mark.asyncio
async def test_private_league_metadata_rejects_authenticated_non_member(monkeypatch):
    async def not_admin(session, user):
        return False

    async def not_member(session, user_id, league_id, required_role):
        return False

    monkeypatch.setattr(auth_dependencies, "_is_system_admin", not_admin)
    monkeypatch.setattr(auth_dependencies, "_has_league_role", not_member)
    dependency = make_require_league_member_or_public()

    with pytest.raises(HTTPException) as exc_info:
        await dependency(1, {"id": 9}, _LeagueVisibilitySession(False))
    assert exc_info.value.status_code == 403


@pytest.mark.parametrize(
    "path", ["/api/players/2/matches", "/api/players/2/stats", "/api/players/2/awards"]
)
def test_player_wide_data_is_self_only(path):
    app.dependency_overrides[require_verified_player] = lambda: {"id": 1, "player_id": 1}
    try:
        response = TestClient(app).get(path)
    finally:
        app.dependency_overrides.pop(require_verified_player, None)
    assert response.status_code == 403
