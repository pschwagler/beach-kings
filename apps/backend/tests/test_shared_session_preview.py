"""Shared session codes permit display reads, without weakening ID access."""

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services import data_service


@pytest.mark.parametrize("league_id", [None, 7])
def test_anonymous_preview_for_pickup_and_league(monkeypatch, league_id):
    monkeypatch.setattr(
        data_service,
        "get_session_by_code",
        AsyncMock(
            return_value={
                "id": 23,
                "code": "SHARED",
                "name": "Evening games",
                "status": "ACTIVE",
                "league_id": league_id,
                "latitude": 34.1,
                "longitude": -118.2,
                "court_name": "Private home",
                "court_slug": "other-private-23",
            }
        ),
    )
    matches = AsyncMock(return_value=[{"id": 42, "team1_score": 21, "team2_score": 18}])
    monkeypatch.setattr(data_service, "get_session_matches", matches)
    monkeypatch.setattr(
        data_service,
        "get_session_participants",
        AsyncMock(
            return_value=[
                {
                    "player_id": 1,
                    "full_name": "Test Player",
                    "is_placeholder": False,
                    "email": "private@example.test",
                    "location_name": "Private location",
                }
            ]
        ),
    )

    response = TestClient(app).get("/api/sessions/by-code/SHARED/preview")

    assert response.status_code == 200
    data = response.json()
    assert data["session"]["league_id"] == league_id
    assert data["session"]["latitude"] is None
    assert data["session"]["longitude"] is None
    assert data["session"]["court_name"] is None
    assert data["session"]["court_slug"] is None
    assert data["matches"][0]["team1_score"] == 21
    assert data["participants"] == [
        {"player_id": 1, "full_name": "Test Player", "is_placeholder": False}
    ]
    matches.assert_awaited_once()


def test_unknown_shared_code_is_not_found(monkeypatch):
    monkeypatch.setattr(data_service, "get_session_by_code", AsyncMock(return_value=None))
    response = TestClient(app).get("/api/sessions/by-code/UNKNOWN/preview")
    assert response.status_code == 404


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("get", "/api/sessions/23/matches", None),
        ("get", "/api/sessions/23/participants", None),
        ("patch", "/api/sessions/23", {"name": "Changed"}),
        ("post", "/api/sessions/join", {"code": "SHARED"}),
        ("delete", "/api/sessions/23", None),
    ],
)
def test_anonymous_id_reads_and_writes_remain_protected(method, path, body):
    response = TestClient(app).request(method, path, json=body)
    assert response.status_code in (401, 403)
