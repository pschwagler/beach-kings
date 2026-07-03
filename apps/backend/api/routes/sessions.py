"""Session management route handlers (league and non-league)."""

import logging
import re
from datetime import datetime
from typing import Optional, Union

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.db import get_db_session
from backend.database.models import (
    Court,
    EloHistory,
    Season,
    Player,
    Session,
    SessionStatus,
    LeagueMember,
    League,
)
from backend.services import data_service
from backend.services.notification_service import notify_players_about_session_submitted
from backend.api.auth_dependencies import (
    _has_league_role,
    _is_system_admin,
    get_current_user,
    make_require_league_member,
)
from backend.models.schemas import (
    EndLeagueSessionRequest,
    JoinSessionRequest,
    InviteToSessionRequest,
    InviteBatchToSessionRequest,
    CreateNonLeagueSessionRequest,
    UpdateSessionRequest,
    BatchInviteResponse,
    DeleteSessionResponse,
    OpenSessionResponse,
    SessionDetailResponse,
    SessionListItemResponse,
    SessionMatchItemResponse,
    SessionParticipantItemResponse,
    SessionRosterDetailResponse,
    SessionWithStatusResponse,
    StatusResponse,
    SubmitSessionResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _parse_session_number(session_name: str) -> int:
    """
    Extract the session number from a session name.

    Session names follow the convention:
      - "M/D/YYYY"            → session #1 (first session of the day)
      - "M/D/YYYY Session #N" → session #N

    Returns 1 if no number suffix is found.
    """
    match = re.search(r"Session #(\d+)", session_name)
    return int(match.group(1)) if match else 1


def _build_games_and_user_stats(
    raw_games: list[dict],
    player_id: int | None,
    rating_by_match: dict[int, float] | None = None,
) -> tuple[list[dict], int, int, float | None]:
    """
    Build the ordered games list and compute user wins/losses/rating change.

    Games are numbered sequentially starting at 1 in insertion order
    (oldest first — raw_games comes in reverse-id order from
    get_session_matches, so we reverse it here).

    Args:
        raw_games: Raw match dicts from data_service.get_session_matches.
        player_id: The calling user's player id (for win/loss counting).
        rating_by_match: Map of match_id -> the calling player's global ELO
            change for that match (from EloHistory). When None, no rating
            data is available and per-game/session rating changes stay null.

    Returns:
        (games, user_wins, user_losses, user_rating_change)
        user_rating_change is the sum of the player's per-game ELO changes
        across the session, or None when no ELO history exists yet (e.g. an
        active/unranked session whose stats have not been calculated).
    """
    ratings = rating_by_match or {}
    ordered = list(reversed(raw_games))
    games: list[dict] = []
    user_wins = 0
    user_losses = 0
    rating_total = 0.0
    saw_rating = False

    for idx, g in enumerate(ordered, start=1):
        game_rating = ratings.get(g["id"])
        if game_rating is not None:
            saw_rating = True
            rating_total += game_rating
        games.append(
            {
                "id": g["id"],
                "game_number": idx,
                "team1_player1_id": g.get("team1_player1_id"),
                "team1_player2_id": g.get("team1_player2_id"),
                "team2_player1_id": g.get("team2_player1_id"),
                "team2_player2_id": g.get("team2_player2_id"),
                "team1_player1_name": g.get("team1_player1_name") or "",
                "team1_player2_name": g.get("team1_player2_name") or "",
                "team2_player1_name": g.get("team2_player1_name") or "",
                "team2_player2_name": g.get("team2_player2_name") or "",
                "team1_score": g.get("team1_score"),
                "team2_score": g.get("team2_score"),
                "winner": g.get("winner"),
                "rating_change": game_rating,
                "is_ranked": g.get("is_ranked"),
            }
        )

        if player_id is None or g.get("winner") is None:
            continue

        on_team1 = player_id in (
            g.get("team1_player1_id"),
            g.get("team1_player2_id"),
        )
        on_team2 = player_id in (
            g.get("team2_player1_id"),
            g.get("team2_player2_id"),
        )
        winner = g["winner"]
        if on_team1:
            if winner == 1:
                user_wins += 1
            else:
                user_losses += 1
        elif on_team2:
            if winner == 2:
                user_wins += 1
            else:
                user_losses += 1

    user_rating_change = round(rating_total, 1) if saw_rating else None
    return games, user_wins, user_losses, user_rating_change


async def _resolve_session_context(
    db_session: AsyncSession,
    session_id: int,
    league_id: int | None = None,
) -> tuple[str, int | None, str | None]:
    """
    Look up session name and league context before commit.

    Must be called while the transaction is still open so the data is
    consistent with what gets committed.

    Args:
        db_session: Database session (pre-commit)
        session_id: ID of the session
        league_id: League ID if already known (league submit route)

    Returns:
        Tuple of (session_name, league_id, league_name)
    """
    sess_result = await db_session.execute(
        select(Session.name, Session.season_id, Session.league_id).where(
            Session.id == session_id
        )
    )
    row = sess_result.first()
    session_name = (row[0] if row else None) or "a session"
    season_id = row[1] if row else None
    session_league_id = row[2] if row else None

    league_name = None

    # Prefer Session.league_id directly (set for both season sessions and gap
    # sessions).  Only fall back to the Season join for pre-migration rows where
    # Session.league_id may be NULL but a season link exists.
    if league_id is None:
        if session_league_id is not None:
            league_id = session_league_id
        elif season_id:
            season_result = await db_session.execute(
                select(Season.league_id).where(Season.id == season_id)
            )
            league_id = season_result.scalar_one_or_none()

    # Look up league name
    if league_id:
        league_name_result = await db_session.execute(
            select(League.name).where(League.id == league_id)
        )
        league_name = league_name_result.scalar_one_or_none()

    return session_name, league_id, league_name


async def _send_session_submit_notifications(
    db_session: AsyncSession,
    session_id: int,
    submitter_user_id: int,
    session_name: str,
    league_id: int | None = None,
    league_name: str | None = None,
) -> None:
    """
    Send best-effort notifications to players in a submitted session.

    Args:
        db_session: Database session
        session_id: ID of the submitted session
        submitter_user_id: User ID of the person who submitted
        session_name: Pre-resolved session name
        league_id: League ID (pre-resolved)
        league_name: League name (pre-resolved)
    """
    try:
        await notify_players_about_session_submitted(
            session=db_session,
            session_id=session_id,
            submitter_user_id=submitter_user_id,
            session_name=session_name,
            league_id=league_id,
            league_name=league_name,
        )
    except Exception as e:
        logger.warning("Failed to send session submitted notifications: %s", e)


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


async def is_user_admin_of_session_league(
    session: AsyncSession, user_id: int, session_id: int
) -> bool:
    """Check if user is admin of the league that the session belongs to.

    Uses a single joined query: LeagueMember -> Session (via Session.league_id)
    -> Player.  Derives the league directly from Session.league_id so that
    gap-game sessions (league_id set, season_id NULL) resolve correctly.

    Returns False for pickup sessions (league_id NULL) because the join on
    Session.league_id == LeagueMember.league_id matches nothing when league_id
    is NULL.  Returns False for nonexistent session_id without raising.
    """
    result = await session.execute(
        select(LeagueMember.role)
        .join(Session, Session.league_id == LeagueMember.league_id)
        .join(Player, Player.id == LeagueMember.player_id)
        .where(
            Session.id == session_id,
            Player.user_id == user_id,
            LeagueMember.role == "admin",
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


# ---------------------------------------------------------------------------
# League sessions
# ---------------------------------------------------------------------------


@router.get("/api/leagues/{league_id}/sessions", response_model=list[SessionListItemResponse])
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
        # Filter by Session.league_id directly so gap sessions (season_id=NULL,
        # league_id set) appear in the league's session list.  The previous
        # INNER join on Season silently excluded all gap sessions.
        query = (
            select(
                Session,
                Court.name.label("court_name"),
                Court.slug.label("court_slug"),
            )
            .outerjoin(Court, Session.court_id == Court.id)
            .where(Session.league_id == league_id)
        )

        if active is True:
            query = query.where(Session.status == SessionStatus.ACTIVE)

        query = query.order_by(Session.date.desc(), Session.created_at.desc())

        result = await session.execute(query)
        rows = result.all()

        session_list = []
        for sess, court_name, court_slug in rows:
            session_dict = {
                "id": sess.id,
                "date": sess.date,
                "name": sess.name,
                "status": sess.status.value if sess.status else None,
                "season_id": sess.season_id,
                "court_id": sess.court_id,
                "court_name": court_name,
                "court_slug": court_slug,
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
        logger.error("Error getting league sessions: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.patch(
    "/api/leagues/{league_id}/sessions/{session_id}", response_model=SubmitSessionResponse
)
async def end_league_session(
    league_id: int,
    session_id: int,
    body: EndLeagueSessionRequest,
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
        submit = body.submit

        if submit is not True:
            raise HTTPException(
                status_code=400, detail="submit field must be true to submit a session"
            )

        player_id = None
        if user:
            player = await data_service.get_player_by_user_id(session, user["id"])
            if player:
                player_id = player["id"]

        # SECURITY 1 FIX: verify the target session actually belongs to the
        # league in the URL path before doing anything destructive.  Respond
        # with 404 (not 403) to avoid leaking cross-league session existence.
        sess_check = await session.execute(
            select(Session.league_id).where(Session.id == session_id)
        )
        sess_row = sess_check.scalar_one_or_none()
        if sess_row is None:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
        if sess_row != league_id:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

        # Resolve context before lock_in_session commits the transaction
        session_name, resolved_league_id, league_name = await _resolve_session_context(
            session,
            session_id,
            league_id=league_id,
        )

        result = await data_service.lock_in_session(session, session_id, updated_by=player_id)

        if not result:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

        await _send_session_submit_notifications(
            session,
            session_id,
            user["id"],
            session_name,
            league_id=resolved_league_id,
            league_name=league_name,
        )

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
        logger.error("Error updating league session: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


# ---------------------------------------------------------------------------
# Non-league sessions
# ---------------------------------------------------------------------------


@router.get("/api/sessions/open", response_model=list[OpenSessionResponse])
async def get_open_sessions(
    include_all: bool = False,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Get sessions where the current user is creator, has a match, or is invited.
    By default returns only ACTIVE sessions. Pass include_all=true for all statuses.
    """
    try:
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        if not player:
            return []
        return await data_service.get_open_sessions_for_user(
            session, player["id"], active_only=not include_all
        )
    except Exception as e:
        logger.error("Error getting open sessions: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/sessions/by-code/{code}", response_model=SessionDetailResponse)
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


@router.get("/api/sessions/{session_id}", response_model=SessionRosterDetailResponse)
async def get_session_detail(
    session_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Get full session detail including roster, games, and user stats.

    Returns session metadata, all participants enriched with game counts,
    the list of games played with scores, and aggregate stats for the
    calling user. Only accessible to session participants and creators.
    """
    sess = await data_service.get_session(session, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    if not await data_service.can_user_add_match_to_session(
        session, session_id, sess, current_user["id"]
    ):
        raise HTTPException(
            status_code=403, detail="Only session participants can view session detail"
        )

    # Fetch session-type, court, and extended metadata in one query
    sess_row = await session.execute(
        select(
            Session.session_type,
            Session.court_id,
            Session.date,
            Session.start_time,
            Session.max_players,
            Session.notes,
            Session.is_ranked,
            Court.name.label("court_name"),
        )
        .outerjoin(Court, Session.court_id == Court.id)
        .where(Session.id == session_id)
    )
    sess_extra = sess_row.one_or_none()
    session_type: str | None = sess_extra.session_type if sess_extra else None
    court_id: int | None = sess_extra.court_id if sess_extra else None
    court_name: str | None = sess_extra.court_name if sess_extra else None
    session_date: str | None = sess_extra.date if sess_extra else None
    start_time: str | None = sess_extra.start_time if sess_extra else None
    max_players: int | None = sess_extra.max_players if sess_extra else None
    notes: str | None = sess_extra.notes if sess_extra else None
    is_ranked: bool = sess_extra.is_ranked if sess_extra is not None else True

    # Resolve league_id directly from the session (available for both season
    # sessions and gap sessions — season_id=NULL but league_id set).
    # Only fall back to a Season-based lookup if Session.league_id is absent,
    # which should not occur for sessions created after migration 052.
    league_id: int | None = sess.get("league_id")
    league_name: str | None = None
    if league_id is None:
        # Legacy fallback: derive from season (pre-migration sessions)
        season_id = sess.get("season_id")
        if season_id is not None:
            league_result = await session.execute(
                select(Season.league_id)
                .where(Season.id == season_id)
            )
            league_id = league_result.scalar_one_or_none()
    if league_id is not None:
        league_name_result = await session.execute(
            select(League.name).where(League.id == league_id)
        )
        league_name = league_name_result.scalar_one_or_none()

    # Parse session number from the session name (e.g. "3/19/2026 Session #3" → 3)
    session_number = _parse_session_number(sess.get("name") or "")

    # Fetch participants enriched with game counts
    players = await data_service.get_session_roster_with_game_counts(
        session, session_id
    )

    # Fetch matches and compute per-game numbers + user stats
    raw_games = await data_service.get_session_matches(session, session_id)
    player = await data_service.get_player_by_user_id(session, current_user["id"])
    player_id: int | None = player.get("id") if player else None

    # Load the calling player's global ELO change per match in this session so
    # the response can surface per-game and session-total rating deltas. Only
    # ranked, already-calculated matches have EloHistory rows; anything missing
    # stays null. Mirrors the source used by the "My Games" screen.
    rating_by_match: dict[int, float] = {}
    if player_id is not None and raw_games:
        match_ids = [g["id"] for g in raw_games]
        elo_rows = await session.execute(
            select(EloHistory.match_id, EloHistory.elo_change).where(
                EloHistory.player_id == player_id,
                EloHistory.match_id.in_(match_ids),
            )
        )
        rating_by_match = {row.match_id: row.elo_change for row in elo_rows.all()}

    games, user_wins, user_losses, user_rating_change = _build_games_and_user_stats(
        raw_games, player_id, rating_by_match
    )

    return {
        "id": sess["id"],
        "code": sess.get("code"),
        "court_name": court_name,
        "court_id": court_id,
        "session_type": session_type,
        "status": sess.get("status") or "ACTIVE",
        "league_id": league_id,
        "league_name": league_name,
        "date": session_date,
        "start_time": start_time,
        "session_number": session_number,
        "max_players": max_players,
        "notes": notes,
        "is_ranked": is_ranked,
        "players": players,
        "games": games,
        "user_wins": user_wins,
        "user_losses": user_losses,
        "user_rating_change": user_rating_change,
    }


@router.get("/api/sessions/{session_id}/matches", response_model=list[SessionMatchItemResponse])
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


@router.get(
    "/api/sessions/{session_id}/participants", response_model=list[SessionParticipantItemResponse]
)
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


@router.delete(
    "/api/sessions/{session_id}/participants/{player_id}", response_model=StatusResponse
)
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
    # SECURITY 4 FIX: for league sessions, require league membership rather than
    # relying on can_user_add_match_to_session (which short-circuits to True for
    # any league session, granting roster removal to every authenticated user).
    session_league_id = sess.get("league_id")
    if session_league_id is not None:
        if not await _has_league_role(session, current_user["id"], session_league_id, None):
            raise HTTPException(
                status_code=403, detail="League membership required to modify this session's roster"
            )
    elif not await data_service.can_user_add_match_to_session(
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


@router.post("/api/sessions/join", response_model=SessionWithStatusResponse)
async def join_session_by_code(
    body: JoinSessionRequest,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Join a session by code (adds current user's player to session participants)."""
    try:
        code = body.code
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
        logger.error("Error joining session: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/api/sessions/{session_id}/invite", response_model=StatusResponse)
async def invite_to_session(
    session_id: int,
    body: InviteToSessionRequest,
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
        invited_player_id = body.player_id
        if invited_player_id is None:
            raise HTTPException(status_code=400, detail="player_id is required")
        await data_service.add_session_participant(
            session, session_id, invited_player_id, invited_by=player["id"]
        )
        return {"status": "success", "message": "Player invited to session"}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Error inviting to session: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/api/sessions/{session_id}/invite_batch", response_model=BatchInviteResponse)
async def invite_to_session_batch(
    session_id: int,
    body: InviteBatchToSessionRequest,
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
        player_ids = body.player_ids
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
        logger.error("Error batch inviting to session: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/api/sessions", response_model=SessionWithStatusResponse)
async def create_session(
    body: CreateNonLeagueSessionRequest,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Create (or get-or-create for league context) a session.

    Pickup path (default): body without ``league_id`` creates a non-league
    session via ``data_service.create_session``.
    League path: body with ``league_id`` (and optional ``season_id``) routes
    through ``get_or_create_active_league_session`` so the score-screen
    "Manage Session" flow is idempotent — if an active session for the
    league/date/season already exists, it is returned instead of erroring.

    Request body: { "date": "...", "name": "...", "court_id": ...,
    "league_id": ..., "season_id": ... } (all optional except date defaults
    to today). Returns the session payload including its ``id`` and ``code``.
    """
    try:
        date = body.date or datetime.now().strftime("%-m/%-d/%Y")
        name = body.name
        court_id = body.court_id
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        created_by = player["id"] if player else None

        if body.league_id is not None:
            # SECURITY 2 FIX: require league membership before creating or
            # fetching a league session.  Any authenticated user could otherwise
            # bootstrap sessions for leagues they do not belong to.
            if not await _has_league_role(
                session, current_user["id"], body.league_id, None
            ):
                raise HTTPException(
                    status_code=403,
                    detail="League membership required to create a league session",
                )
            new_session = await data_service.get_or_create_active_league_session(
                session,
                league_id=body.league_id,
                session_date=date,
                name=name,
                created_by=created_by,
                season_id=body.season_id,
                latitude=body.latitude,
                longitude=body.longitude,
            )
        else:
            new_session = await data_service.create_session(
                session,
                date,
                name=name,
                court_id=court_id,
                created_by=created_by,
                latitude=body.latitude,
                longitude=body.longitude,
                start_time=body.start_time,
                session_type=body.session_type,
                max_players=body.max_players,
                notes=body.notes,
                is_ranked=body.is_ranked,
            )
        return {
            "status": "success",
            "message": "Session created successfully",
            "session": new_session,
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Error creating session: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.patch(
    "/api/sessions/{session_id}",
    response_model=Union[SubmitSessionResponse, SessionWithStatusResponse],
)
async def update_session(
    session_id: int,
    body: UpdateSessionRequest,
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
        submit = body.submit

        # Handle submit (original behavior) - this takes precedence
        if submit is True:
            player_id = None
            if current_user:
                player = await data_service.get_player_by_user_id(session, current_user["id"])
                if player:
                    player_id = player["id"]

            # Resolve context before lock_in_session commits the transaction
            session_name, resolved_league_id, league_name = await _resolve_session_context(
                session,
                session_id,
            )

            result = await data_service.lock_in_session(session, session_id, updated_by=player_id)

            if not result:
                raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

            await _send_session_submit_notifications(
                session,
                session_id,
                current_user["id"],
                session_name,
                league_id=resolved_league_id,
                league_name=league_name,
            )

            return {
                "status": "success",
                "message": "Session submitted and stats calculations queued",
                "global_job_id": result["global_job_id"],
                "league_job_id": result.get("league_job_id"),
                "season_id": result["season_id"],
            }

        # Handle other field updates (name, date, season_id, court_id).
        # Use model_fields_set to distinguish "field sent as null" from "field omitted".
        name = body.name
        date = body.date
        update_season_id = "season_id" in body.model_fields_set
        processed_season_id = None if body.season_id is None else int(body.season_id)
        update_court_id = "court_id" in body.model_fields_set
        processed_court_id = None if body.court_id is None else int(body.court_id)

        has_updates = name is not None or date is not None or update_season_id or update_court_id

        if not has_updates:
            raise HTTPException(
                status_code=400,
                detail="At least one field must be provided: submit, name, date, season_id, or court_id",
            )

        # Authorization check for field updates.
        #
        # Case 1 — PROMOTION: pickup→league (update_season_id=True with a non-NULL
        #   season_id value and the session has no current league_id).
        #   Require admin of the TARGET league (derived from the new season).
        #
        # Case 2 — EXISTING LEAGUE SESSION EDIT: session already has a league_id
        #   and no promotion is happening.
        #   Require admin of the session's CURRENT league.
        #
        # Case 3 — PICKUP EDIT (no promotion): league_id is NULL and no new
        #   season_id is being set.  No tightening; preserve existing behavior.
        current_session = await data_service.get_session(session, session_id)
        if not current_session:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

        is_promoting = update_season_id and processed_season_id is not None and (
            current_session.get("league_id") is None
        )

        # System admins bypass the per-league admin checks, matching every other
        # league-admin-protected route (see make_require_league_admin).
        is_sys_admin = await _is_system_admin(session, current_user)

        if is_promoting:
            # Resolve the target league from the new season_id.  If the season
            # is not found we still call _has_league_role with None — the check
            # will return False (deny by default) which is the safe outcome.
            season_row = await session.execute(
                select(Season.league_id).where(Season.id == processed_season_id)
            )
            target_league_id = season_row.scalar_one_or_none()

            if not is_sys_admin and not await _has_league_role(
                session, current_user["id"], target_league_id, "admin"
            ):
                raise HTTPException(
                    status_code=403,
                    detail="Only league admins can promote a session to a league session",
                )

        elif current_session.get("league_id") is not None:
            # Case 2: editing an existing league session (including a gap game,
            # league_id set + season_id NULL) requires league-admin role.
            if not is_sys_admin and not await is_user_admin_of_session_league(
                session, current_user["id"], session_id
            ):
                raise HTTPException(
                    status_code=403,
                    detail="Only league admins can edit a league session",
                )
        # else: pickup edit with no promotion — no authz required (Case 3)

        result = await data_service.update_session(
            session,
            session_id,
            name=name,
            date=date,
            season_id=processed_season_id,
            update_season_id=update_season_id,
            court_id=processed_court_id,
            update_court_id=update_court_id,
        )

        if not result:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

        return {"status": "success", "message": "Session updated successfully", "session": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error updating session: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/api/sessions/{session_id}", response_model=DeleteSessionResponse)
async def delete_session(
    session_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Delete a session and all its matches.
    Works for any session status (ACTIVE, SUBMITTED, EDITED).

    Authorization: session creator or league admin (for league sessions).
    """
    try:
        # Verify session exists
        session_obj = await data_service.get_session(session, session_id)
        if not session_obj:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

        # Authorization: must be session creator or league admin
        player = await data_service.get_player_by_user_id(session, current_user["id"])
        is_creator = player and session_obj.get("created_by") == player["id"]

        if not is_creator:
            # Check if user is a league admin for this session's league
            is_admin = await is_user_admin_of_session_league(
                session, current_user["id"], session_id
            )
            if not is_admin:
                raise HTTPException(
                    status_code=403,
                    detail="Only the session creator or a league admin can delete this session",
                )

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
        logger.error(f"Error deleting session {session_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An unexpected error occurred")
