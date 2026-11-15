"""Corrections start from the user's current review, not the original photo read."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from backend.database.models import Player
from backend.models.schemas.sessions import EditPhotoResultsRequest
from backend.services import photo_match_service as service
from backend.services.games import scoresheet_review as review


def game(ids=(8, 2, 3, 4), scores=(21, 17)):
    match = {"team1_score": scores[0], "team2_score": scores[1]}
    for index, (field, pid) in enumerate(zip(review.FIELDS, ids)):
        match[field] = {"id": pid, "name": "Sam" if index == 0 else f"Player {pid}"}
        match[field + "_id"] = pid
        match[field + "_matched"] = f"Player {pid}"
    return match


@pytest.mark.asyncio
async def test_snapshot_retains_selected_players_outside_original_candidates(
    db_session, monkeypatch
):
    players = [Player(full_name=f"Player {i}") for i in range(4)]
    db_session.add_all(players)
    await db_session.flush()
    request = EditPhotoResultsRequest(
        edit_prompt="Change score",
        reviewed_matches=[
            {
                "players": [
                    {"id": p.id, "name": p.full_name, "rawName": "Sam" if i == 0 else p.full_name}
                    for i, p in enumerate(players)
                ],
                "scores": [21, 17],
            }
        ],
    )
    store = AsyncMock(return_value=True)
    monkeypatch.setattr(service, "update_session_data", store)
    candidates = [{"player_id": p.id, "player_name": p.full_name} for p in players[1:]]
    updated = await review.prepare_review(
        db_session, "draft", candidates, request.reviewed_matches, None
    )
    assert {item["player_id"] for item in updated} == {p.id for p in players}
    baseline = store.await_args.args[1]["parsed_matches"]
    assert baseline[0]["team1_player1_id"] == players[0].id
    assert baseline[0]["team1_player1"]["name"] == "Sam"
    assert baseline[0]["team2_score"] == 17
    assert store.await_args.args[1]["player_context"] == updated


@pytest.mark.asyncio
async def test_invalid_selected_ids_do_not_replace_saved_review(db_session, monkeypatch):
    request = EditPhotoResultsRequest(
        edit_prompt="Change score",
        reviewed_matches=[{"players": [{"id": 9999, "name": "Missing"}] * 4, "scores": [21, 17]}],
    )
    store = AsyncMock()
    monkeypatch.setattr(service, "update_session_data", store)
    with pytest.raises(HTTPException) as error:
        await review.prepare_review(db_session, "draft", [], request.reviewed_matches, None)
    assert error.value.status_code == 422
    store.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("fails", [False, True])
async def test_correction_uses_current_ids_and_preserves_review_on_failure(
    db_session, monkeypatch, fails
):
    current = game()
    draft = {
        "raw_response": '{"matches":[{"t1":["Sam",2],"t2":[3,4],"s":"21-19"}]}',
        "parsed_matches": [current],
    }
    monkeypatch.setattr(service, "get_session_data", AsyncMock(return_value=draft))
    store = AsyncMock(return_value=True)
    monkeypatch.setattr(service, "update_session_data", store)
    members = [{"player_id": pid, "player_name": f"Player {pid}"} for pid in (8, 2, 3, 4)]
    job_id = await service.create_photo_match_job(db_session, None, "draft")

    def respond(prompt, image=None):
        assert "Current reviewed games (source of truth)" in prompt
        assert '"id": 8' in prompt and '"scores": [21, 17]' in prompt
        assert "Do not turn a confirmed player ID back" in prompt
        if fails:
            raise ValueError("Provider unavailable")
        return '{"matches":[{"t1":[8,2],"t2":[3,4],"s":"21-18"}]}'

    with patch.object(service.scoresheet_ai, "generate", side_effect=respond):
        await service.process_clarification_job(
            job_id, None, "draft", members, "Game 1 finished 21-18"
        )
    job = await service.get_photo_match_job(db_session, job_id)
    result = json.loads(job.result_data)
    assert result["matches"][0]["team1_player1_id"] == 8
    if fails:
        assert result["matches"] == [current]
        assert "unchanged" in result["error_message"]
        store.assert_not_awaited()
    else:
        assert result["matches"][0]["team2_score"] == 18
        assert store.await_args.args[1]["parsed_matches"][0]["team1_player1_id"] == 8


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "league,court_exists,actual_court", [(None, True, 12), (1, True, 3), (None, False, None)]
)
async def test_batch_honors_selected_court_without_reassigning_existing_sessions(
    monkeypatch, league, court_exists, actual_court
):
    from backend.services import data_service

    db = AsyncMock()
    db.scalar.side_effect = [SimpleNamespace(import_result=None), 12 if court_exists else None]
    draft = {"league_id": league, "player_id": 1, "parsed_matches": [game(ids=(1, 2, 3, 4))]}
    monkeypatch.setattr(service, "get_session_data", AsyncMock(return_value=draft))
    monkeypatch.setattr(service, "check_idempotency", AsyncMock(return_value=[]))
    monkeypatch.setattr(service, "update_session_data", AsyncMock(return_value=True))
    create_session = AsyncMock(return_value={"id": 100, "court_id": actual_court})
    league_session = AsyncMock(return_value={"id": 100, "court_id": actual_court})
    create_match = AsyncMock(return_value=200)
    monkeypatch.setattr(data_service, "create_session", create_session)
    monkeypatch.setattr(data_service, "get_or_create_active_league_session", league_session)
    monkeypatch.setattr(data_service, "create_match_async", create_match)
    success, ids, message = await service.create_matches_from_session(
        db, "draft", None, "2026-11-08", court_id=12
    )
    if league is None and court_exists:
        assert success and ids == [200]
        assert create_session.await_args.kwargs["court_id"] == 12
    else:
        assert not success and ids == []
        create_match.assert_not_awaited()
        assert "court" in message.lower()
