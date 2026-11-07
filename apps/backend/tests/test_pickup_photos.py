"""Pickup photo drafts are private and save all games in one owned session."""

import inspect
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from backend.api.routes import pickup_photos as routes
from backend.models.schemas import ConfirmPhotoMatchesRequest
from backend.services import data_service, photo_match_service


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "data", [None, {"user_id": 8, "league_id": None}, {"user_id": 7, "league_id": 1}]
)
async def test_drafts_are_visible_only_to_the_pickup_owner(monkeypatch, data):
    monkeypatch.setattr(photo_match_service, "get_session_data", AsyncMock(return_value=data))
    with pytest.raises(HTTPException) as error:
        await routes.owned_draft("draft", {"id": 7})
    assert error.value.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("owner,league", [(8, None), (7, 1)])
async def test_polling_rejects_other_owners_and_league_jobs(monkeypatch, owner, league):
    monkeypatch.setattr(
        photo_match_service,
        "get_photo_match_job",
        AsyncMock(return_value=SimpleNamespace(user_id=owner, league_id=league)),
    )
    with pytest.raises(HTTPException) as error:
        await inspect.unwrap(routes.pickup_photo_status)(
            1, Request({"type": "http"}), None, {"id": 7}
        )
    assert error.value.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("season,date", [(2, "2026-11-07"), (None, "invalid")])
async def test_confirm_validates_context_before_creating_games(monkeypatch, season, date):
    monkeypatch.setattr(
        photo_match_service,
        "get_session_data",
        AsyncMock(return_value={"user_id": 7, "league_id": None}),
    )
    create = AsyncMock()
    monkeypatch.setattr(photo_match_service, "create_matches_from_session", create)
    with pytest.raises(HTTPException):
        await inspect.unwrap(routes.confirm_pickup_photo)(
            "draft",
            Request({"type": "http"}),
            ConfirmPhotoMatchesRequest(season_id=season, match_date=date),
            None,
            {"id": 7},
        )
    create.assert_not_awaited()


@pytest.mark.asyncio
async def test_pickup_batch_uses_one_unranked_session_and_keeps_retry_identity(monkeypatch):
    match = {
        "team1_player1_id": 1,
        "team1_player2_id": 2,
        "team2_player1_id": 3,
        "team2_player2_id": 4,
        "team1_score": 21,
        "team2_score": 19,
    }
    draft = {"league_id": None, "player_id": 1, "parsed_matches": [match, match]}
    monkeypatch.setattr(photo_match_service, "get_session_data", AsyncMock(return_value=draft))
    monkeypatch.setattr(photo_match_service, "check_idempotency", AsyncMock(return_value=[]))
    update = AsyncMock()
    monkeypatch.setattr(photo_match_service, "update_session_data", update)
    create_session = AsyncMock(return_value={"id": 100})
    create_match = AsyncMock(side_effect=[201, 202])
    league_session = AsyncMock()
    monkeypatch.setattr(data_service, "create_session", create_session)
    monkeypatch.setattr(data_service, "create_match_async", create_match)
    monkeypatch.setattr(data_service, "get_or_create_active_league_session", league_session)
    success, ids, _ = await photo_match_service.create_matches_from_session(
        None, "draft", None, "2026-11-07"
    )
    assert success and ids == [201, 202]
    create_session.assert_awaited_once_with(None, date="2026-11-07", created_by=1, is_ranked=False)
    assert all(call.args[2] == 100 for call in create_match.await_args_list)
    league_session.assert_not_awaited()
    assert update.await_args.args[1]["created_session_id"] == 100
    monkeypatch.setattr(photo_match_service, "check_idempotency", AsyncMock(return_value=ids))
    assert (
        await photo_match_service.create_matches_from_session(None, "draft", None, "2026-11-07")
    )[1] == ids
    assert create_session.await_count == 1


def test_pickup_endpoints_all_require_the_scoresheet_flag():
    assert len(routes.router.routes) == 4
    for route in routes.router.routes:
        assert any(
            "scoresheet_parsing"
            in [cell.cell_contents for cell in (dependency.call.__closure__ or ())]
            for dependency in route.dependant.dependencies
        )
