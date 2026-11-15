"""Real PostgreSQL regressions for atomic, repeatable scoresheet imports."""

import asyncio
import inspect
from datetime import timedelta
from io import BytesIO
from unittest.mock import AsyncMock

import pytest
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker
from starlette.requests import Request

from backend.database.models import Match, PhotoMatchJob, PhotoMatchJobStatus, Player, Session
from backend.services import data_service, photo_match_service as photos
from backend.utils.datetime_utils import utcnow
from backend.models.schemas.sessions import ConfirmPhotoMatchesRequest, ReviewedPhotoMatch


async def setup_draft(db_session, monkeypatch):
    players = [Player(full_name=f"Import Test {i}") for i in range(4)]
    db_session.add_all(players)
    await db_session.flush()
    match = {
        **{
            f"team{t}_player{p}_id": players[(t - 1) * 2 + p - 1].id
            for t in (1, 2)
            for p in (1, 2)
        },
        "team1_score": 21,
        "team2_score": 19,
    }
    job = PhotoMatchJob(session_id="safety-draft", status=PhotoMatchJobStatus.COMPLETED)
    db_session.add(job)
    await db_session.commit()
    draft = {"league_id": None, "player_id": players[0].id, "parsed_matches": [match, match]}
    monkeypatch.setattr(photos, "get_session_data", AsyncMock(return_value=draft))
    monkeypatch.setattr(photos, "update_session_data", AsyncMock(return_value=False))
    return job.id


@pytest.mark.asyncio
async def test_second_game_failure_rolls_back_session_and_all_games(db_session, monkeypatch):
    job_id = await setup_draft(db_session, monkeypatch)
    original = data_service.create_match_async
    calls = 0

    async def fail_second(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("Interrupted import")
        return await original(*args, **kwargs)

    monkeypatch.setattr(data_service, "create_match_async", fail_second)
    success, ids, _ = await photos.create_matches_from_session(
        db_session, "safety-draft", None, "2026-11-07"
    )
    assert not success and ids == []
    assert await db_session.scalar(select(func.count(Match.id))) == 0
    assert await db_session.scalar(select(func.count(Session.id))) == 0
    assert (await db_session.get(PhotoMatchJob, job_id)).import_result is None
    monkeypatch.setattr(data_service, "create_match_async", original)
    assert (
        await photos.create_matches_from_session(db_session, "safety-draft", None, "2026-11-07")
    )[0]
    assert await db_session.scalar(select(func.count(Match.id))) == 2


@pytest.mark.asyncio
async def test_concurrent_retries_share_durable_receipt_without_redis(
    db_session, test_engine, monkeypatch
):
    job_id = await setup_draft(db_session, monkeypatch)
    sessions = async_sessionmaker(test_engine, expire_on_commit=False)

    async def confirm():
        async with sessions() as session:
            return await photos.create_matches_from_session(
                session, "safety-draft", None, "2026-11-07"
            )

    first, second = await asyncio.gather(confirm(), confirm())
    assert first[0] and second[0] and first[1] == second[1]
    assert await db_session.scalar(select(func.count(Match.id))) == 2
    assert await db_session.scalar(select(func.count(Session.id))) == 1
    receipt = (await db_session.get(PhotoMatchJob, job_id)).import_result
    assert receipt["match_ids"] == first[1]
    monkeypatch.setattr(photos, "get_session_data", AsyncMock(return_value=None))
    assert (await confirm())[1] == first[1]


@pytest.mark.asyncio
async def test_legacy_completion_marker_is_adopted_without_saving_again(db_session, monkeypatch):
    job_id = await setup_draft(db_session, monkeypatch)
    monkeypatch.setattr(
        photos,
        "get_session_data",
        AsyncMock(
            return_value={
                "matches_created": True,
                "created_match_ids": [17, 18],
                "created_session_id": 9,
            }
        ),
    )
    create = AsyncMock(side_effect=AssertionError("must not create a new game"))
    monkeypatch.setattr(data_service, "create_match_async", create)
    success, ids, _ = await photos.create_matches_from_session(
        db_session, "safety-draft", None, "2026-11-07"
    )
    assert success and ids == [17, 18]
    assert (await db_session.get(PhotoMatchJob, job_id)).import_result == {
        "match_ids": ids,
        "session_id": 9,
    }


@pytest.mark.asyncio
async def test_confirm_uses_request_review_without_mutating_shared_draft(db_session, monkeypatch):
    await setup_draft(db_session, monkeypatch)
    game = ReviewedPhotoMatch(
        number=1,
        scores=[22, 20],
        players=[{"id": i, "name": f"Import Test {i}", "rawName": ""} for i in range(1, 5)],
    )
    success, ids, _ = await photos.create_matches_from_session(
        db_session, "safety-draft", None, "2026-11-07", reviewed_matches=[game]
    )
    assert success and len(ids) == 1
    saved = await db_session.get(Match, ids[0])
    assert (saved.team1_score, saved.team2_score) == (22, 20)
    assert photos.update_session_data.await_args.args[1].get("parsed_matches") is None


@pytest.mark.asyncio
@pytest.mark.parametrize("league", [False, True])
async def test_confirmation_routes_return_authorized_receipt_without_redis(
    db_session, monkeypatch, league
):
    from backend.api.routes import matches, pickup_photos
    from backend.database.models import League, User
    from backend.services.games.scoresheet_import_receipts import confirmed_import

    user = User(email="receipt-test@example.test")
    league_obj = League(name="Receipt test") if league else None
    db_session.add(user)
    if league_obj:
        db_session.add(league_obj)
    await db_session.flush()
    league_id = league_obj.id if league_obj else None
    db_session.add(
        PhotoMatchJob(
            session_id="saved",
            user_id=user.id,
            league_id=league_id,
            status=PhotoMatchJobStatus.COMPLETED,
            import_result={"match_ids": [31, 32], "session_id": 17},
        )
    )
    await db_session.commit()
    monkeypatch.setattr(
        photos, "get_session_data", AsyncMock(side_effect=AssertionError("Redis must not be read"))
    )
    body = ConfirmPhotoMatchesRequest(match_date="2026-11-07")
    request = Request({"type": "http"})
    if league:
        response = await inspect.unwrap(matches.confirm_photo_matches)(
            league_id, "saved", request, body, db_session, {"id": user.id}
        )
        assert await confirmed_import(db_session, "saved", league_id=league_id + 1) is None
    else:
        response = await inspect.unwrap(pickup_photos.confirm_pickup_photo)(
            "saved", request, body, db_session, {"id": user.id}
        )
        assert await confirmed_import(db_session, "saved", user_id=user.id + 1) is None
    assert response["match_ids"] == [31, 32] and response["session_id"] == 17


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [PhotoMatchJobStatus.PENDING, PhotoMatchJobStatus.RUNNING])
async def test_abandoned_jobs_fail_and_late_worker_cannot_revive_them(db_session, status):
    job = PhotoMatchJob(
        session_id="abandoned",
        status=status,
        created_at=utcnow() - timedelta(minutes=6),
        started_at=utcnow() - timedelta(minutes=6)
        if status == PhotoMatchJobStatus.RUNNING
        else None,
    )
    db_session.add(job)
    await db_session.commit()
    job = await photos.get_photo_match_job(db_session, job.id)
    assert job.status == PhotoMatchJobStatus.FAILED
    assert "retry" in job.error_message.lower()
    await photos.update_job_status(db_session, job.id, PhotoMatchJobStatus.COMPLETED)
    await db_session.refresh(job)
    assert job.status == PhotoMatchJobStatus.FAILED


@pytest.mark.asyncio
async def test_fresh_job_keeps_running(db_session):
    job = PhotoMatchJob(
        session_id="fresh", status=PhotoMatchJobStatus.RUNNING, started_at=utcnow()
    )
    db_session.add(job)
    await db_session.commit()
    assert (
        await photos.get_photo_match_job(db_session, job.id)
    ).status == PhotoMatchJobStatus.RUNNING


def test_actual_heic_bytes_validate_and_convert_to_jpeg():
    encoded = BytesIO()
    Image.new("RGB", (32, 32), "white").save(encoded, format="HEIF")
    content = encoded.getvalue()
    assert photos.validate_image_file(content, "image/heic", "scores.heic") == (True, "")
    jpeg, _ = photos.preprocess_image(content)
    assert Image.open(BytesIO(jpeg)).format == "JPEG"
