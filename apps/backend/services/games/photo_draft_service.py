"""Shared photo draft setup and serialization for league and pickup imports."""

import asyncio
import json
import logging

from fastapi import HTTPException

from backend.services import data_service, photo_match_service
from backend.services.players.player_data import search_players_with_relevance
from backend.utils.datetime_utils import utcnow

logger = logging.getLogger(__name__)
_tasks: set[asyncio.Task] = set()


async def context_members(session, user, league_id):
    if league_id is not None:
        return await data_service.list_league_members(session, league_id)
    player = await data_service.get_player_by_user_id(session, user["id"])
    items = await search_players_with_relevance(
        session, "", caller_player_id=player["id"] if player else None
    )
    return [
        {
            "player_id": item["id"],
            "player_name": item["full_name"],
            "player_nickname": item.get("nickname"),
        }
        for item in items
    ]


def spawn(coroutine):
    task = asyncio.create_task(coroutine)
    _tasks.add(task)

    def done(result):
        _tasks.discard(result)
        if not result.cancelled() and result.exception():
            logger.error("Scoresheet task failed", exc_info=result.exception())

    task.add_done_callback(done)


async def start_upload(session, user, file, league_id=None, season_id=None, prompt=None):
    content = await file.read()
    valid, error = photo_match_service.validate_image_file(
        content, file.content_type or "", file.filename or ""
    )
    if not valid:
        raise HTTPException(400, error)
    _, image = photo_match_service.preprocess_image(content)
    player = await data_service.get_player_by_user_id(session, user["id"])
    if not player:
        raise HTTPException(400, "Player profile required")
    members = await context_members(session, user, league_id)
    draft_id = photo_match_service.generate_session_id()
    data = {
        "league_id": league_id,
        "season_id": season_id,
        "user_id": user["id"],
        "player_id": player["id"],
        "user_prompt": prompt,
        "image_base64": image,
        "parsed_matches": [],
        "partial_matches": [],
        "raw_response": None,
        "status": "PENDING",
        "matches_created": False,
        "created_match_ids": None,
        "created_at": utcnow().isoformat(),
        "last_updated": utcnow().isoformat(),
    }
    if not await photo_match_service.store_session_data(draft_id, data):
        raise HTTPException(503, "Could not start scoresheet processing. Please try again.")
    job_id = await photo_match_service.create_photo_match_job(
        session, league_id, draft_id, user_id=user["id"]
    )
    spawn(photo_match_service.process_photo_job(job_id, league_id, draft_id, image, members))
    return {"job_id": job_id, "session_id": draft_id, "status": "PENDING"}


async def job_status(job):
    result = {
        "job_id": job.id,
        "status": job.status.value,
        "result": None,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }
    if job.status.value == "COMPLETED" and job.result_data:
        result["result"] = json.loads(job.result_data)
    elif job.status.value == "FAILED":
        result["result"] = {"status": "FAILED", "error_message": job.error_message}
    elif job.status.value == "RUNNING":
        data = await photo_match_service.get_session_data(job.session_id)
        if data and data.get("partial_matches"):
            result["partial_matches"] = data["partial_matches"]
    return result
