"""Session management route handlers (league and non-league)."""

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.db import get_db_session
from backend.database.models import Season, Player, Session, SessionStatus, LeagueMember
from backend.services import data_service
from backend.api.auth_dependencies import (
    get_current_user,
    make_require_league_admin,
    make_require_league_member,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


async def get_league_id_from_session(session: AsyncSession, session_id: int) -> Optional[int]:
    """Get league_id from session_id via session -> season -> league."""
    result = await session.execute(select(Session).where(Session.id == session_id))
    session_obj = result.scalar_one_or_none()
    if not session_obj or not session_obj.season_id:
        return None

    result = await session.execute(select(Season).where(Season.id == session_obj.season_id))
    season = result.scalar_one_or_none()
    if not season:
        return None

    return season.league_id


async def is_user_admin_of_session_league(
    session: AsyncSession, user_id: int, session_id: int
) -> bool:
    """Check if user is admin of the league that the session belongs to."""
    league_id = await get_league_id_from_session(session, session_id)
    if not league_id:
        return False

    query = (
        select(1)
        .select_from(
            LeagueMember.__table__.join(Player.__table__, LeagueMember.player_id == Player.id)
        )
        .where(
            LeagueMember.league_id == league_id,
            Player.user_id == user_id,
            LeagueMember.role == "admin",
        )
        .limit(1)
    )

    result = await session.execute(query)
    return result.scalar_one_or_none() is not None


# ---------------------------------------------------------------------------
# League sessions
# ---------------------------------------------------------------------------


@router.get("/api/leagues/{league_id}/sessions")
async def get_league_sessions(
    league_id: int,
    active: Optional[bool] = None,
    user: dict = Depends(make_require_league_member()),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Get all sessions for a league, optionally filtered by active status.

    Args:
        league_id: ID of the league
        active: Optional query parameter. If True, only return active sessions.
                If not provided, return all sessions for the league.

    Returns:
        List of session objects for the league
    """
    try:
        query = (
            select(Session)
            .join(Season, Session.season_id == Season.id)
            .where(Season.league_id == league_id)
        )

        if active is True:
            query = query.where(Session.status == SessionStatus.ACTIVE)

        query = query.order_by(Session.date.desc(), Session.created_at.desc())

        result = await session.execute(query)
        sessions = result.scalars().all()

        session_list = []
        for sess in sessions:
            session_dict = {
                "id": sess.id,
                "date": sess.date,
                "name": sess.name,
                "status": sess.status.value if sess.status else None,
                "season_id": sess.season_id,
                "created_at": sess.created_at.isoformat() if sess.created_at else None,
                "updated_at": sess.updated_at.isoformat() if sess.updated_at else None,
                "created_by": sess.created_by,
                "updated_by": sess.updated_by,
            }
            session_list.append(session_dict)

        return session_list
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting league sessions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting league sessions: {str(e)}")


@router.post("/api/leagues/{league_id}/sessions")
async def create_league_session(
    league_id: int,
    request: Request,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Create a new pending session for a league (league_admin).
    Body: { date?: 'MM/DD/YYYY', name?: string }
    """
    try:
        body = await request.json()
        date = body.get("date") or datetime.now().strftime("%-m/%-d/%Y")
        name = body.get("name")

        player_id = None
        if user:
            player = await data_service.get_player_by_user_id(session, user["id"])
            if player:
                player_id = player["id"]

        new_session = await data_service.create_league_session(
            session=session, league_id=league_id, date=date, name=name, created_by=player_id
        )
        return {"status": "success", "message": "Session created", "session": new_session}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating league session: {str(e)}")


@router.patch("/api/leagues/{league_id}/sessions/{session_id}")
async def end_league_session(
    league_id: int,
    session_id: int,
    request: Request,
    user: dict = Depends(make_require_league_member()),
    session: AsyncSession = Depends(get_db_session),
):
    """
    End/lock in a league session by submitting it (any league member).

    Body: { "submit": true } to submit/lock in a session

    When a session is locked in:
    1. Session status is set to SUBMITTED (if ACTIVE) or EDITED (if already SUBMITTED/EDITED)
    2. All derived stats recalculated from database (locked-in sessions only)
    3. Newly locked matches now included in rankings, partnerships, opponents, ELO history
    """
    try:
        body = await request.json()
        submit = body.get("submit")

        if submit is not True:
            raise HTTPException(
                status_code=400, detail="submit field must be true to submit a session"
            )

        player_id = None
        if user:
            player = await data_service.get_player_by_user_id(session, user["id"])
            if player:
                player_id = player["id"]

        result = await data_service.lock_in_session(session, session_id, updated_by=player_id)

        if not result:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

        return {
            "status": "success",
            "message": "Session submitted and stats calculations queued",
            "global_job_id": result["global_job_id"],
            "league_job_id": result.get("league_job_id"),
            "season_id": result["season_id"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating league session: {str(e)}")


# ---------------------------------------------------------------------------
# Non-league sessions
# ---------------------------------------------------------------------------


@router.get("/api/sessions/open")
async def get_open_sessions(
    current_user: dict = Depends(get_current_user), session: AsyncSession = Depends(get_db_session)
):
    """
    Get all open (ACTIVE) sessions where the current user is creator, has a match, or is invited.
    Returns league and non-league sessions.
    """
    try:
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        if not player:
            return []
        return await data_service.get_open_sessions_for_user(session, player["id"])
    except Exception as e:
        logger.error(f"Error getting open sessions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting open sessions: {str(e)}")


@router.get("/api/sessions/by-code/{code}")
async def get_session_by_code(
    code: str,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Get a session by its shareable code. Returns session with league_id if league session."""
    sess = await data_service.get_session_by_code(session, code)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    return sess


@router.get("/api/sessions/{session_id}/matches")
async def get_session_matches(
    session_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Get all matches for a session."""
    sess = await data_service.get_session(session, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    matches = await data_service.get_session_matches(session, session_id)
    return matches


@router.get("/api/sessions/{session_id}/participants")
async def get_session_participants(
    session_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Get list of players in the session (participants + players who have matches)."""
    sess = await data_service.get_session(session, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    if not await data_service.can_user_add_match_to_session(
        session, session_id, sess, current_user["id"]
    ):
        raise HTTPException(
            status_code=403, detail="Only session participants can view the roster"
        )
    participants = await data_service.get_session_participants(session, session_id)
    return participants


@router.delete("/api/sessions/{session_id}/participants/{player_id}")
async def remove_session_participant(
    session_id: int,
    player_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Remove a player from session participants. Cannot remove a player who has matches in this session."""
    sess = await data_service.get_session(session, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    if sess.get("status") != "ACTIVE":
        raise HTTPException(status_code=400, detail="Can only modify roster of an active session")
    if sess.get("created_by") == player_id:
        raise HTTPException(
            status_code=403, detail="Session creator cannot remove themselves from the session"
        )
    if not await data_service.can_user_add_match_to_session(
        session, session_id, sess, current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Only session participants can remove players")
    removed = await data_service.remove_session_participant(session, session_id, player_id)
    if not removed:
        raise HTTPException(
            status_code=400,
            detail="Player not in roster or has games in this session and cannot be removed",
        )
    return {"status": "success", "message": "Player removed from session"}


@router.post("/api/sessions/join")
async def join_session_by_code(
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Join a session by code (adds current user's player to session participants)."""
    try:
        body = await request.json()
        code = body.get("code")
        if not code or not isinstance(code, str):
            raise HTTPException(status_code=400, detail="code is required")
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        if not player:
            raise HTTPException(status_code=400, detail="Player profile not found")
        sess = await data_service.join_session_by_code(session, code.strip().upper(), player["id"])
        if not sess:
            raise HTTPException(status_code=404, detail="Session not found or not active")
        return {"status": "success", "message": "Joined session", "session": sess}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error joining session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/sessions/{session_id}/invite")
async def invite_to_session(
    session_id: int,
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Invite a player to a session (add to participants). Caller must be creator or existing participant."""
    try:
        sess = await data_service.get_session(session, session_id)
        if not sess:
            raise HTTPException(status_code=404, detail="Session not found")
        if sess.get("status") != "ACTIVE":
            raise HTTPException(status_code=400, detail="Can only invite to an active session")
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        if not player:
            raise HTTPException(status_code=400, detail="Player profile not found")
        if not await data_service.can_user_add_match_to_session(
            session, session_id, sess, current_user["id"]
        ):
            raise HTTPException(
                status_code=403, detail="Only session participants can invite others"
            )
        body = await request.json()
        invited_player_id = body.get("player_id")
        if invited_player_id is None:
            raise HTTPException(status_code=400, detail="player_id is required")
        invited_player_id = int(invited_player_id)
        await data_service.add_session_participant(
            session, session_id, invited_player_id, invited_by=player["id"]
        )
        return {"status": "success", "message": "Player invited to session"}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error inviting to session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/sessions/{session_id}/invite_batch")
async def invite_to_session_batch(
    session_id: int,
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Invite multiple players to a session in one request. Same auth rules as single invite.
    Body: { "player_ids": number[] }. Returns { "added": number[], "failed": [{"player_id": number, "error": string}] }.
    """
    try:
        sess = await data_service.get_session(session, session_id)
        if not sess:
            raise HTTPException(status_code=404, detail="Session not found")
        if sess.get("status") != "ACTIVE":
            raise HTTPException(status_code=400, detail="Can only invite to an active session")
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        if not player:
            raise HTTPException(status_code=400, detail="Player profile not found")
        if not await data_service.can_user_add_match_to_session(
            session, session_id, sess, current_user["id"]
        ):
            raise HTTPException(
                status_code=403, detail="Only session participants can invite others"
            )
        body = await request.json()
        player_ids = body.get("player_ids")
        if not isinstance(player_ids, list):
            raise HTTPException(status_code=400, detail="player_ids must be an array")
        added = []
        failed = []
        for pid in player_ids:
            try:
                pid = int(pid)
            except (TypeError, ValueError):
                failed.append({"player_id": pid, "error": "Invalid player id"})
                continue
            try:
                await data_service.add_session_participant(
                    session, session_id, pid, invited_by=player["id"]
                )
                added.append(pid)
            except Exception as e:
                err_msg = str(e)
                if "foreign key" in err_msg.lower() or "not found" in err_msg.lower():
                    err_msg = "Player not found"
                failed.append({"player_id": pid, "error": err_msg})
        return {"added": added, "failed": failed}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error batch inviting to session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/sessions")
async def create_session(
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Create a new non-league session (with shareable code).
    Request body: { "date": "...", "name": "...", "court_id": ... } (all optional except date defaults to today).
    Returns created session info including code.
    """
    try:
        body = await request.json()
        if not isinstance(body, dict):
            body = {}
        date = body.get("date")
        if not date:
            date = datetime.now().strftime("%-m/%-d/%Y")
        name = body.get("name")
        court_id = body.get("court_id")
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        created_by = player["id"] if player else None
        new_session = await data_service.create_session(
            session, date, name=name, court_id=court_id, created_by=created_by
        )
        return {
            "status": "success",
            "message": "Session created successfully",
            "session": new_session,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating session: {str(e)}")


@router.patch("/api/sessions/{session_id}")
async def update_session(
    session_id: int,
    request: Request,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Update a session (e.g., submit by setting submit to true, or update name/date/season_id).

    Body options:
    - { "submit": true } to submit/lock in a session
    - { "name": <str> } to update the session's name
    - { "date": <str> } to update the session's date
    - { "season_id": <int> } to update the session's season (can be null to remove season)

    Multiple fields can be updated in a single request.

    When a session is locked in:
    1. Session status is set to SUBMITTED (if ACTIVE) or EDITED (if already SUBMITTED/EDITED)
    2. All derived stats recalculated from database (locked-in sessions only)
    3. Newly locked matches now included in rankings, partnerships, opponents, ELO history
    """
    try:
        body = await request.json()
        submit = body.get("submit")

        # Handle submit (original behavior) - this takes precedence
        if submit is True:
            player_id = None
            if current_user:
                player = await data_service.get_player_by_user_id(session, current_user["id"])
                if player:
                    player_id = player["id"]

            result = await data_service.lock_in_session(session, session_id, updated_by=player_id)

            if not result:
                raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

            return {
                "status": "success",
                "message": "Session submitted and stats calculations queued",
                "global_job_id": result["global_job_id"],
                "league_job_id": result.get("league_job_id"),
                "season_id": result["season_id"],
            }

        # Handle other field updates (name, date, season_id)
        name = body.get("name")
        date = body.get("date")
        season_id = body.get("season_id")

        has_updates = name is not None or date is not None or "season_id" in body

        if not has_updates:
            raise HTTPException(
                status_code=400,
                detail="At least one field must be provided: submit, name, date, or season_id",
            )

        processed_season_id = None
        update_season_id = False
        if "season_id" in body:
            update_season_id = True
            processed_season_id = None if season_id is None else int(season_id)

        result = await data_service.update_session(
            session,
            session_id,
            name=name,
            date=date,
            season_id=processed_season_id,
            update_season_id=update_season_id,
        )

        if not result:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

        return {"status": "success", "message": "Session updated successfully", "session": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating session: {str(e)}")


@router.delete("/api/sessions/{session_id}")
async def delete_session(
    session_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Delete an active session and all its matches.
    Only active (pending) sessions can be deleted.
    """
    try:
        success = await data_service.delete_session(session, session_id)

        if not success:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

        return {
            "status": "success",
            "message": "Session deleted successfully",
            "session_id": session_id,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting session: {str(e)}")
