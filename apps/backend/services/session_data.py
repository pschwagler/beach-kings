"""
Session and match CRUD operations.

Extracted from data_service.py.  Provides read/write access to the
``sessions``, ``session_participants``, and ``matches`` tables, plus
session-code generation and participant management helpers.
"""

from typing import List, Dict, Optional, TYPE_CHECKING
from datetime import date
import secrets
import string
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func, and_, or_, cast, Integer
from sqlalchemy.orm import aliased

from backend.database.models import (
    League,
    LeagueHomeCourt,
    Season,
    Court,
    Player,
    Session,
    Match,
    SessionParticipant,
    EloHistory,
    SeasonRatingHistory,
    SessionStatus,
    Location,
)
from backend.utils.datetime_utils import format_session_date

if TYPE_CHECKING:
    from backend.models.schemas import CreateMatchRequest, UpdateMatchRequest

logger = logging.getLogger(__name__)

# Session code: alphanumeric (uppercase + digits), default length 8
SESSION_CODE_ALPHABET = string.ascii_uppercase + string.digits
SESSION_CODE_LENGTH = 8
SESSION_CODE_MAX_ATTEMPTS = 10


# ============================================================================
# Session read operations
# ============================================================================


async def get_sessions(session: AsyncSession) -> List[Dict]:
    """Get all sessions ordered by date."""
    result = await session.execute(
        select(Session).order_by(Session.date.desc(), Session.created_at.desc())
    )
    sessions = result.scalars().all()
    return [
        {
            "id": s.id,
            "date": s.date,
            "name": s.name,
            "status": s.status.value if s.status else None,
            "season_id": s.season_id,
            "court_id": s.court_id,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in sessions
    ]


async def get_session(session: AsyncSession, session_id: int) -> Optional[Dict]:
    """Get a session by ID."""
    result = await session.execute(select(Session).where(Session.id == session_id))
    s = result.scalar_one_or_none()
    if not s:
        return None
    return {
        "id": s.id,
        "date": s.date,
        "name": s.name,
        "status": s.status.value if s.status else None,
        "code": s.code,
        "season_id": s.season_id,
        "court_id": s.court_id,
        "created_by": s.created_by,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


async def get_session_for_routes(session: AsyncSession, session_id: int) -> Optional[Dict]:
    """Get a session by ID - alias for get_session."""
    return await get_session(session, session_id)


async def get_active_session(session: AsyncSession) -> Optional[Dict]:
    """Get the active session."""
    result = await session.execute(
        select(Session)
        .where(Session.status == SessionStatus.ACTIVE)
        .order_by(Session.created_at.desc())
        .limit(1)
    )
    s = result.scalar_one_or_none()
    if not s:
        return None
    return {
        "id": s.id,
        "date": s.date,
        "name": s.name,
        "status": s.status.value if s.status else None,
        "season_id": s.season_id,
        "court_id": s.court_id,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


async def get_session_by_code(db_session: AsyncSession, code: str) -> Optional[Dict]:
    """Return session by code, with league_id, court info, created_by_name, updated_at,
    updated_by_name; None if not found."""
    creator = aliased(Player)
    updater = aliased(Player)
    q = (
        select(
            Session,
            Season.league_id,
            creator.full_name,
            updater.full_name,
            Court.name.label("court_name"),
            Court.slug.label("court_slug"),
        )
        .outerjoin(Season, Session.season_id == Season.id)
        .outerjoin(creator, Session.created_by == creator.id)
        .outerjoin(updater, Session.updated_by == updater.id)
        .outerjoin(Court, Session.court_id == Court.id)
        .where(Session.code == code)
    )
    result = await db_session.execute(q)
    row = result.one_or_none()
    if not row:
        return None
    s, league_id, created_by_name, updated_by_name, court_name, court_slug = row
    return {
        "id": s.id,
        "code": s.code,
        "date": s.date,
        "name": s.name,
        "status": s.status.value if s.status else None,
        "season_id": s.season_id,
        "court_id": s.court_id,
        "court_name": court_name,
        "court_slug": court_slug,
        "league_id": league_id,
        "created_by": s.created_by,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "created_by_name": created_by_name,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        "updated_by": s.updated_by,
        "updated_by_name": updated_by_name,
    }


async def get_open_sessions_for_user(
    db_session: AsyncSession, player_id: int, *, active_only: bool = True
) -> List[Dict]:
    """
    Return sessions where the player is creator, has a match, or is invited.
    When active_only=True (default), only ACTIVE sessions are returned.
    Includes league and non-league sessions. Ordered by session date desc, then updated_at desc.
    """
    # Subquery: session IDs where player has at least one match
    match_sess = (
        select(Match.session_id)
        .where(
            and_(
                Match.session_id.isnot(None),
                or_(
                    Match.team1_player1_id == player_id,
                    Match.team1_player2_id == player_id,
                    Match.team2_player1_id == player_id,
                    Match.team2_player2_id == player_id,
                ),
            )
        )
        .distinct()
    )

    # Subquery: session IDs where player is in session_participants
    part_sess = select(SessionParticipant.session_id).where(
        SessionParticipant.player_id == player_id
    )

    creator_alias = aliased(Player)
    q = (
        select(
            Session.id,
            Session.code,
            Session.date,
            Session.name,
            Session.status,
            Session.season_id,
            Session.created_by,
            Session.updated_at,
            Session.court_id,
            Season.league_id,
            League.name.label("league_name"),
            creator_alias.full_name.label("created_by_name"),
            Court.name.label("court_name"),
            Court.slug.label("court_slug"),
        )
        .outerjoin(Season, Session.season_id == Season.id)
        .outerjoin(League, Season.league_id == League.id)
        .outerjoin(creator_alias, Session.created_by == creator_alias.id)
        .outerjoin(Court, Session.court_id == Court.id)
        .where(
            or_(
                Session.created_by == player_id,
                Session.id.in_(match_sess.scalar_subquery()),
                Session.id.in_(part_sess.scalar_subquery()),
            )
        )
        .order_by(Session.date.desc(), Session.updated_at.desc())
    )
    if active_only:
        q = q.where(Session.status == SessionStatus.ACTIVE)
    result = await db_session.execute(q)
    rows = result.all()

    session_ids = [r.id for r in rows]
    if not session_ids:
        return []

    # Match count per session
    count_q = (
        select(Match.session_id, func.count(Match.id).label("match_count"))
        .where(Match.session_id.in_(session_ids))
        .group_by(Match.session_id)
    )
    count_result = await db_session.execute(count_q)
    match_counts = {r.session_id: r.match_count for r in count_result.all()}

    # Match count per session for this specific player
    player_match_filter = or_(
        Match.team1_player1_id == player_id,
        Match.team1_player2_id == player_id,
        Match.team2_player1_id == player_id,
        Match.team2_player2_id == player_id,
    )
    user_count_q = (
        select(Match.session_id, func.count(Match.id).label("user_match_count"))
        .where(Match.session_id.in_(session_ids))
        .where(player_match_filter)
        .group_by(Match.session_id)
    )
    user_count_result = await db_session.execute(user_count_q)
    user_match_counts = {r.session_id: r.user_match_count for r in user_count_result.all()}

    # Session IDs where this player has at least one match
    match_sess_ids_q = (
        select(Match.session_id)
        .where(
            and_(
                Match.session_id.isnot(None),
                player_match_filter,
            )
        )
        .distinct()
    )
    match_sess_ids_result = await db_session.execute(match_sess_ids_q)
    session_ids_with_match = {row[0] for row in match_sess_ids_result.all()}

    out = []
    for r in rows:
        if r.created_by == player_id:
            participation = "creator"
        elif r.id in session_ids_with_match:
            participation = "player"
        else:
            participation = "invited"
        created_by_name = getattr(r, "created_by_name", None)
        out.append(
            {
                "id": r.id,
                "code": r.code,
                "date": r.date,
                "name": r.name,
                "status": r.status.value if r.status else None,
                "season_id": r.season_id,
                "league_id": r.league_id,
                "league_name": r.league_name,
                "court_id": r.court_id,
                "court_name": r.court_name,
                "court_slug": r.court_slug,
                "match_count": match_counts.get(r.id, 0),
                "user_match_count": user_match_counts.get(r.id, 0),
                "participation": participation,
                "created_by": r.created_by,
                "created_by_name": created_by_name,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
        )
    return out


async def get_user_leagues_for_routes(session: AsyncSession, user_id: int) -> List[Dict]:
    """Get user leagues - alias for get_user_leagues (defined in league_data)."""
    from backend.services.league_data import get_user_leagues

    return await get_user_leagues(session, user_id)


# ============================================================================
# Session write operations
# ============================================================================


async def _generate_session_code(db_session: AsyncSession) -> str:
    """
    Generate a unique short alphanumeric code for a session.
    Retries on collision up to SESSION_CODE_MAX_ATTEMPTS.
    """
    for _ in range(SESSION_CODE_MAX_ATTEMPTS):
        code = "".join(secrets.choice(SESSION_CODE_ALPHABET) for _ in range(SESSION_CODE_LENGTH))
        result = await db_session.execute(select(Session.id).where(Session.code == code))
        if result.scalar_one_or_none() is None:
            return code
    raise ValueError("Failed to generate unique session code")


async def get_or_create_active_league_session(
    session: AsyncSession,
    league_id: int,
    session_date: str,
    name: Optional[str] = None,
    created_by: Optional[int] = None,
    season_id: Optional[int] = None,
) -> Dict:
    """
    Get or create an active session for a league and date atomically.
    Uses SELECT FOR UPDATE to prevent race conditions.

    Args:
        session: Database session
        league_id: League ID
        session_date: Session date
        name: Optional session name
        created_by: Optional player ID who created the session
        season_id: Optional season ID - if provided, use this season instead of finding active season

    Returns:
        Dict with session info
    """
    # Verify league exists
    result = await session.execute(select(League).where(League.id == league_id))
    league = result.scalar_one_or_none()
    if not league:
        raise ValueError(f"League {league_id} not found")

    if season_id:
        season_result = await session.execute(
            select(Season).where(and_(Season.id == season_id, Season.league_id == league_id))
        )
        active_season = season_result.scalar_one_or_none()
        if not active_season:
            raise ValueError(
                f"Season {season_id} not found or does not belong to league {league_id}"
            )
    else:
        current_date = date.today()
        season_result = await session.execute(
            select(Season)
            .where(
                and_(
                    Season.league_id == league_id,
                    Season.start_date <= current_date,
                    Season.end_date >= current_date,
                )
            )
            .order_by(Season.created_at.desc())
            .limit(1)
        )
        active_season = season_result.scalar_one_or_none()

        if not active_season:
            raise ValueError(
                f"League {league_id} does not have an active season. Please create a season with dates that include today's date."
            )

    # Try to get existing active session for this date and season
    try:
        result = await session.execute(
            select(Session)
            .where(
                and_(
                    Session.date == session_date,
                    Session.season_id == active_season.id,
                    Session.status == SessionStatus.ACTIVE,
                )
            )
            .with_for_update()
        )
        existing_session = result.scalar_one_or_none()

        if existing_session:
            return {
                "id": existing_session.id,
                "date": existing_session.date,
                "name": existing_session.name,
                "status": existing_session.status.value if existing_session.status else None,
                "season_id": existing_session.season_id,
            }
    except Exception:
        result = await session.execute(
            select(Session).where(
                and_(
                    Session.date == session_date,
                    Session.season_id == active_season.id,
                    Session.status == SessionStatus.ACTIVE,
                )
            )
        )
        existing_session = result.scalar_one_or_none()
        if existing_session:
            return {
                "id": existing_session.id,
                "date": existing_session.date,
                "name": existing_session.name,
                "status": existing_session.status.value if existing_session.status else None,
                "season_id": existing_session.season_id,
            }

    # No existing session found, create a new one
    count_result = await session.execute(
        select(func.count(Session.id)).where(
            and_(Session.date == session_date, Session.season_id == active_season.id)
        )
    )
    session_count = count_result.scalar() or 0

    formatted_date = format_session_date(session_date)
    if name:
        session_name = name
    elif session_count == 0:
        session_name = formatted_date
    else:
        session_name = f"{formatted_date} Session #{session_count + 1}"

    # Default court_id to league's primary home court (position=0)
    home_court_result = await session.execute(
        select(LeagueHomeCourt.court_id)
        .where(LeagueHomeCourt.league_id == league_id)
        .order_by(LeagueHomeCourt.position.asc())
        .limit(1)
    )
    default_court_id = home_court_result.scalar_one_or_none()

    new_session = Session(
        date=session_date,
        name=session_name,
        status=SessionStatus.ACTIVE,
        season_id=active_season.id,
        created_by=created_by,
        court_id=default_court_id,
    )
    session.add(new_session)
    await session.flush()
    await session.refresh(new_session)
    return {
        "id": new_session.id,
        "date": new_session.date,
        "name": new_session.name,
        "status": new_session.status.value if new_session.status else None,
        "season_id": new_session.season_id,
        "court_id": new_session.court_id,
    }


async def create_league_session(
    session: AsyncSession,
    league_id: int,
    date: str,
    name: Optional[str],
    created_by: Optional[int] = None,
    court_id: Optional[int] = None,
) -> Dict:
    """
    Create a league session. Automatically uses the league's most recent active season.
    Defaults court_id to the league's primary home court (position=0) if not provided.
    Includes duplicate prevention - will raise ValueError if active session already exists.
    """
    from datetime import date as date_type

    result = await session.execute(select(League).where(League.id == league_id))
    league = result.scalar_one_or_none()
    if not league:
        raise ValueError(f"League {league_id} not found")

    current_date = date_type.today()
    season_result = await session.execute(
        select(Season)
        .where(
            and_(
                Season.league_id == league_id,
                Season.start_date <= current_date,
                Season.end_date >= current_date,
            )
        )
        .order_by(Season.created_at.desc())
        .limit(1)
    )
    active_season = season_result.scalar_one_or_none()

    if not active_season:
        raise ValueError(
            f"League {league_id} does not have an active season. Please create a season with dates that include today's date."
        )

    # Check if active session already exists for this date and season
    result = await session.execute(
        select(Session).where(
            and_(
                Session.date == date,
                Session.season_id == active_season.id,
                Session.status == SessionStatus.ACTIVE,
            )
        )
    )
    existing_session = result.scalar_one_or_none()
    if existing_session:
        raise ValueError(
            f"An active session '{existing_session.name}' already exists for this date. Please submit the current session before creating a new one."
        )

    count_result = await session.execute(
        select(func.count(Session.id)).where(
            and_(Session.date == date, Session.season_id == active_season.id)
        )
    )
    session_count = count_result.scalar() or 0

    formatted_date = format_session_date(date)
    if name:
        session_name = name
    elif session_count == 0:
        session_name = formatted_date
    else:
        session_name = f"{formatted_date} Session #{session_count + 1}"

    if court_id is None:
        home_court_result = await session.execute(
            select(LeagueHomeCourt.court_id)
            .where(LeagueHomeCourt.league_id == league_id)
            .order_by(LeagueHomeCourt.position.asc())
            .limit(1)
        )
        court_id = home_court_result.scalar_one_or_none()

    new_session = Session(
        date=date,
        name=session_name,
        status=SessionStatus.ACTIVE,
        season_id=active_season.id,
        created_by=created_by,
        court_id=court_id,
    )
    session.add(new_session)
    await session.commit()
    await session.refresh(new_session)
    return {
        "id": new_session.id,
        "date": new_session.date,
        "name": new_session.name,
        "status": new_session.status.value if new_session.status else None,
        "season_id": new_session.season_id,
        "court_id": new_session.court_id,
    }


async def create_session(
    session: AsyncSession,
    date: str,
    name: Optional[str] = None,
    court_id: Optional[int] = None,
    created_by: Optional[int] = None,
) -> Dict:
    """
    Create a new non-league session (no season_id).
    Generates a unique shareable code and optionally adds creator to participants.

    Args:
        session: Database session
        date: Date string (e.g., '11/7/2025')
        name: Optional session name (defaults to date-based name)
        court_id: Optional court ID
        created_by: Optional player ID who created the session

    Returns:
        Dict with session info including code

    Raises:
        ValueError: If code generation fails after retries
    """
    result = await session.execute(
        select(func.count(Session.id)).where(
            and_(Session.date == date, Session.season_id.is_(None))
        )
    )
    count = result.scalar() or 0

    formatted_date = format_session_date(date)
    session_name = (
        name
        if name
        else (formatted_date if count == 0 else f"{formatted_date} Session #{count + 1}")
    )

    code = await _generate_session_code(session)

    new_session = Session(
        date=date,
        name=session_name,
        status=SessionStatus.ACTIVE,
        code=code,
        season_id=None,
        court_id=court_id,
        created_by=created_by,
    )
    session.add(new_session)
    await session.flush()

    if created_by is not None:
        participant = SessionParticipant(
            session_id=new_session.id, player_id=created_by, invited_by=None
        )
        session.add(participant)
    await session.commit()
    await session.refresh(new_session)

    return {
        "id": new_session.id,
        "date": new_session.date,
        "name": new_session.name,
        "status": new_session.status.value if new_session.status else None,
        "code": new_session.code,
        "season_id": new_session.season_id,
        "court_id": new_session.court_id,
        "created_at": new_session.created_at.isoformat() if new_session.created_at else "",
    }


async def lock_in_session(
    session: AsyncSession, session_id: int, updated_by: Optional[int] = None
) -> Optional[Dict]:
    """
    Lock in a session - sets status to SUBMITTED if ACTIVE, or EDITED if already SUBMITTED/EDITED.
    Also enqueues stats calculations (both global and season-specific).

    Returns:
        Dict with success status, season_id, and job IDs, or None if session not found
    """
    result = await session.execute(select(Session).where(Session.id == session_id))
    session_obj = result.scalar_one_or_none()

    if not session_obj:
        return None

    season_id = session_obj.season_id

    if session_obj.status == SessionStatus.ACTIVE:
        new_status = SessionStatus.SUBMITTED
    else:
        new_status = SessionStatus.EDITED

    result = await session.execute(
        update(Session)
        .where(Session.id == session_id)
        .values(status=new_status, updated_by=updated_by, updated_at=func.now())
    )
    await session.commit()

    if result.rowcount == 0:
        return None

    # Lazy import to avoid circular dependency
    from backend.services.stats_queue import get_stats_queue

    queue = get_stats_queue()

    global_job_id = await queue.enqueue_calculation(session, "global", None)

    league_job_id = None
    if season_id:
        season_result = await session.execute(select(Season).where(Season.id == season_id))
        season_obj = season_result.scalar_one_or_none()
        if season_obj:
            league_job_id = await queue.enqueue_calculation(
                session, "league", season_obj.league_id
            )

    return {
        "success": True,
        "season_id": season_id,
        "global_job_id": global_job_id,
        "league_job_id": league_job_id,
    }


async def update_session(
    session: AsyncSession,
    session_id: int,
    name: Optional[str] = None,
    date: Optional[str] = None,
    season_id: Optional[int] = None,
    update_season_id: bool = False,
    court_id: Optional[int] = None,
    update_court_id: bool = False,
) -> Optional[Dict]:
    """
    Update a session's fields (name, date, season_id, court_id).

    Args:
        session: Database session
        session_id: ID of session to update
        name: New session name (optional)
        date: New session date (optional)
        season_id: New season_id (optional, can be None to remove season)
        update_season_id: If True, update season_id even if it's None (to allow removing season)
        court_id: New court_id (optional, can be None to remove court)
        update_court_id: If True, update court_id even if it's None (to allow removing court)

    Returns:
        Dict with updated session info, or None if session not found

    Raises:
        ValueError: If season_id is provided but season doesn't exist
    """
    result = await session.execute(select(Session).where(Session.id == session_id))
    session_obj = result.scalar_one_or_none()

    if not session_obj:
        return None

    update_values = {}
    if name is not None:
        update_values["name"] = name
    if date is not None:
        update_values["date"] = date
    if update_season_id or season_id is not None:
        if season_id is not None:
            season_result = await session.execute(select(Season).where(Season.id == season_id))
            season_obj = season_result.scalar_one_or_none()
            if not season_obj:
                raise ValueError(f"Season {season_id} not found")
        update_values["season_id"] = season_id

    if update_court_id or court_id is not None:
        if court_id is not None:
            court_result = await session.execute(select(Court).where(Court.id == court_id))
            court_obj = court_result.scalar_one_or_none()
            if not court_obj:
                raise ValueError(f"Court {court_id} not found")
        update_values["court_id"] = court_id

    if not update_values:
        return {
            "id": session_obj.id,
            "season_id": session_obj.season_id,
            "court_id": session_obj.court_id,
            "status": session_obj.status.value if session_obj.status else None,
            "name": session_obj.name,
            "date": session_obj.date,
        }

    update_values["updated_at"] = func.now()
    await session.execute(update(Session).where(Session.id == session_id).values(**update_values))
    await session.commit()

    result = await session.execute(
        select(Session, Court.name.label("court_name"), Court.slug.label("court_slug"))
        .outerjoin(Court, Session.court_id == Court.id)
        .where(Session.id == session_id)
    )
    row = result.one_or_none()

    if not row:
        return None

    updated_session, court_name, court_slug = row

    return {
        "id": updated_session.id,
        "season_id": updated_session.season_id,
        "court_id": updated_session.court_id,
        "court_name": court_name,
        "court_slug": court_slug,
        "status": updated_session.status.value if updated_session.status else None,
        "name": updated_session.name,
        "date": updated_session.date,
    }


async def delete_session(session: AsyncSession, session_id: int) -> bool:
    """
    Delete a session and all its matches, regardless of status.

    For submitted/edited sessions, also cleans up rating history and
    enqueues stats recalculation so totals stay accurate.

    Returns:
        True if successful, False if session not found
    """
    result = await session.execute(select(Session).where(Session.id == session_id))
    session_obj = result.scalar_one_or_none()

    if not session_obj:
        return False

    was_submitted = session_obj.status != SessionStatus.ACTIVE
    season_id = session_obj.season_id

    match_ids_result = await session.execute(
        select(Match.id).where(Match.session_id == session_id)
    )
    match_ids = [row[0] for row in match_ids_result.fetchall()]

    if match_ids:
        await session.execute(delete(EloHistory).where(EloHistory.match_id.in_(match_ids)))
        await session.execute(
            delete(SeasonRatingHistory).where(SeasonRatingHistory.match_id.in_(match_ids))
        )
        await session.execute(delete(Match).where(Match.session_id == session_id))

    # Fetch league_id before commit (session expires objects post-commit)
    league_id = None
    if was_submitted and season_id:
        season_result = await session.execute(
            select(Season.league_id).where(Season.id == season_id)
        )
        league_id = season_result.scalar_one_or_none()

    await session.execute(delete(Session).where(Session.id == session_id))
    await session.commit()

    if was_submitted and match_ids:
        from backend.services.stats_queue import get_stats_queue

        queue = get_stats_queue()
        await queue.enqueue_calculation(session, "global", None)

        if league_id:
            await queue.enqueue_calculation(session, "league", league_id)

    return True


# ============================================================================
# Match read operations
# ============================================================================


async def get_matches(session: AsyncSession, limit: Optional[int] = None) -> List[Dict]:
    """Get all matches, optionally limited."""
    p1 = aliased(Player)
    p2 = aliased(Player)
    p3 = aliased(Player)
    p4 = aliased(Player)

    query = (
        select(
            Match.id,
            Match.date,
            Match.session_id,
            Session.name.label("session_name"),
            Session.status.label("session_status"),
            p1.full_name.label("team1_player1_name"),
            p2.full_name.label("team1_player2_name"),
            p3.full_name.label("team2_player1_name"),
            p4.full_name.label("team2_player2_name"),
            Match.team1_score,
            Match.team2_score,
            Match.winner,
            Match.is_ranked,
            cast(0, Integer).label("team1_elo_change"),
            cast(0, Integer).label("team2_elo_change"),
        )
        .select_from(Match)
        .outerjoin(Session, Match.session_id == Session.id)
        .outerjoin(p1, Match.team1_player1_id == p1.id)
        .outerjoin(p2, Match.team1_player2_id == p2.id)
        .outerjoin(p3, Match.team2_player1_id == p3.id)
        .outerjoin(p4, Match.team2_player2_id == p4.id)
        .order_by(func.coalesce(Session.id, 999999).desc(), Match.id.desc())
    )

    if limit:
        query = query.limit(limit)

    result = await session.execute(query)
    rows = result.all()

    return [
        {
            "id": row.id,
            "date": row.date,
            "session_id": row.session_id,
            "session_name": row.session_name,
            "session_status": row.session_status.value if row.session_status else None,
            "team1_player1_name": row.team1_player1_name,
            "team1_player2_name": row.team1_player2_name,
            "team2_player1_name": row.team2_player1_name,
            "team2_player2_name": row.team2_player2_name,
            "team1_score": row.team1_score,
            "team2_score": row.team2_score,
            "winner": row.winner,
            "is_ranked": row.is_ranked,
            "team1_elo_change": row.team1_elo_change,
            "team2_elo_change": row.team2_elo_change,
        }
        for row in rows
    ]


async def get_session_matches(db_session: AsyncSession, session_id: int) -> List[Dict]:
    """
    Get all matches for a session with player names and scores.
    Returns list of match dicts (id, date, team names, scores, winner, session_name, session_status).
    """
    p1 = aliased(Player)
    p2 = aliased(Player)
    p3 = aliased(Player)
    p4 = aliased(Player)
    q = (
        select(
            Match.id,
            Match.date,
            Match.session_id,
            Session.name.label("session_name"),
            Session.status.label("session_status"),
            Match.team1_player1_id,
            Match.team1_player2_id,
            Match.team2_player1_id,
            Match.team2_player2_id,
            p1.full_name.label("team1_player1_name"),
            p2.full_name.label("team1_player2_name"),
            p3.full_name.label("team2_player1_name"),
            p4.full_name.label("team2_player2_name"),
            Match.team1_score,
            Match.team2_score,
            Match.winner,
            Match.is_ranked,
            Match.ranked_intent,
        )
        .select_from(Match)
        .outerjoin(Session, Match.session_id == Session.id)
        .outerjoin(p1, Match.team1_player1_id == p1.id)
        .outerjoin(p2, Match.team1_player2_id == p2.id)
        .outerjoin(p3, Match.team2_player1_id == p3.id)
        .outerjoin(p4, Match.team2_player2_id == p4.id)
        .where(Match.session_id == session_id)
        .order_by(Match.id.desc())
    )
    result = await db_session.execute(q)
    rows = result.all()
    return [
        {
            "id": r.id,
            "date": r.date,
            "session_id": r.session_id,
            "session_name": r.session_name,
            "session_status": r.session_status.value if r.session_status else None,
            "team1_player1_id": r.team1_player1_id,
            "team1_player1_name": r.team1_player1_name or "",
            "team1_player2_id": r.team1_player2_id,
            "team1_player2_name": r.team1_player2_name or "",
            "team2_player1_id": r.team2_player1_id,
            "team2_player1_name": r.team2_player1_name or "",
            "team2_player2_id": r.team2_player2_id,
            "team2_player2_name": r.team2_player2_name or "",
            "team1_score": r.team1_score,
            "team2_score": r.team2_score,
            "winner": r.winner,
            "is_ranked": r.is_ranked,
            "ranked_intent": r.ranked_intent,
        }
        for r in rows
    ]


async def get_match_async(session: AsyncSession, match_id: int) -> Optional[Dict]:
    """
    Get a specific match by ID - async version.

    Args:
        session: Database session
        match_id: Match ID

    Returns:
        Match dict or None if not found
    """
    result = await session.execute(
        select(Match, Session.status.label("session_status"))
        .outerjoin(Session, Match.session_id == Session.id)
        .where(Match.id == match_id)
    )
    row = result.first()

    if not row:
        return None

    match, session_status = row

    team1_p1 = await session.get(Player, match.team1_player1_id)
    team1_p2 = await session.get(Player, match.team1_player2_id)
    team2_p1 = await session.get(Player, match.team2_player1_id)
    team2_p2 = await session.get(Player, match.team2_player2_id)

    return {
        "id": match.id,
        "session_id": match.session_id,
        "date": match.date,
        "team1_player1": team1_p1.full_name if team1_p1 else None,
        "team1_player2": team1_p2.full_name if team1_p2 else None,
        "team2_player1": team2_p1.full_name if team2_p1 else None,
        "team2_player2": team2_p2.full_name if team2_p2 else None,
        "team1_score": match.team1_score,
        "team2_score": match.team2_score,
        "session_status": session_status.value if session_status else None,
    }


# ============================================================================
# Match write operations
# ============================================================================


async def create_match_async(
    session: AsyncSession, match_request: "CreateMatchRequest", session_id: int, date: str
) -> int:
    """
    Create a new match in a session - async version.

    Args:
        session: Database session
        match_request: CreateMatchRequest schema with player IDs
        session_id: Session ID
        date: Match date

    Returns:
        Match ID
    """
    if match_request.team1_score > match_request.team2_score:
        winner = 1
    elif match_request.team2_score > match_request.team1_score:
        winner = 2
    else:
        winner = -1  # Tie

    # Lazy import to avoid circular dependency
    from backend.services import placeholder_service

    ranked_intent = match_request.is_ranked if match_request.is_ranked is not None else True
    has_placeholders = await placeholder_service.check_match_has_placeholders(
        session,
        [
            match_request.team1_player1_id,
            match_request.team1_player2_id,
            match_request.team2_player1_id,
            match_request.team2_player2_id,
        ],
    )
    is_ranked = ranked_intent and not has_placeholders

    new_match = Match(
        session_id=session_id,
        date=date,
        team1_player1_id=match_request.team1_player1_id,
        team1_player2_id=match_request.team1_player2_id,
        team2_player1_id=match_request.team2_player1_id,
        team2_player2_id=match_request.team2_player2_id,
        team1_score=match_request.team1_score,
        team2_score=match_request.team2_score,
        winner=winner,
        is_public=match_request.is_public if match_request.is_public is not None else True,
        ranked_intent=ranked_intent,
        is_ranked=is_ranked,
    )
    session.add(new_match)
    await session.flush()

    # Bump session.updated_at so auto-cleanup tracks last activity
    if session_id:
        await session.execute(
            update(Session).where(Session.id == session_id).values(updated_at=func.now())
        )

    await session.commit()
    await session.refresh(new_match)

    return new_match.id


async def update_match_async(
    session: AsyncSession,
    match_id: int,
    match_request: "UpdateMatchRequest",
    updated_by: Optional[int] = None,
) -> bool:
    """
    Update an existing match - async version.

    Args:
        session: Database session
        match_id: Match ID to update
        match_request: UpdateMatchRequest schema with player IDs
        updated_by: Player ID who updated the match (optional)

    Returns:
        True if successful, False if match not found
    """
    result = await session.execute(select(Match).where(Match.id == match_id))
    match = result.scalar_one_or_none()
    if not match:
        return False

    if match_request.team1_score > match_request.team2_score:
        winner = 1
    elif match_request.team2_score > match_request.team1_score:
        winner = 2
    else:
        winner = -1  # Tie

    match.team1_player1_id = match_request.team1_player1_id
    match.team1_player2_id = match_request.team1_player2_id
    match.team2_player1_id = match_request.team2_player1_id
    match.team2_player2_id = match_request.team2_player2_id
    match.team1_score = match_request.team1_score
    match.team2_score = match_request.team2_score
    match.winner = winner
    if match_request.is_public is not None:
        match.is_public = match_request.is_public

    if match_request.is_ranked is not None:
        from backend.services import placeholder_service

        match.ranked_intent = match_request.is_ranked
        has_placeholders = await placeholder_service.check_match_has_placeholders(
            session,
            [
                match.team1_player1_id,
                match.team1_player2_id,
                match.team2_player1_id,
                match.team2_player2_id,
            ],
        )
        match.is_ranked = match.ranked_intent and not has_placeholders

    if updated_by is not None:
        match.updated_by = updated_by

    if match.session_id and updated_by is not None:
        await session.execute(
            update(Session)
            .where(Session.id == match.session_id)
            .values(updated_by=updated_by, updated_at=func.now())
        )

    await session.commit()
    return True


async def delete_match_async(session: AsyncSession, match_id: int) -> bool:
    """
    Delete a match from the database - async version.
    Also deletes associated elo_history records to avoid foreign key constraint violations.

    Args:
        session: Database session
        match_id: ID of the match to delete

    Returns:
        True if successful, False if match not found
    """
    match_result = await session.execute(select(Match.session_id).where(Match.id == match_id))
    match_session_id = match_result.scalar_one_or_none()

    await session.execute(delete(EloHistory).where(EloHistory.match_id == match_id))

    result = await session.execute(delete(Match).where(Match.id == match_id))

    if match_session_id:
        await session.execute(
            update(Session).where(Session.id == match_session_id).values(updated_at=func.now())
        )

    await session.commit()
    return result.rowcount > 0


# ============================================================================
# Session participant operations
# ============================================================================


async def get_session_participants(db_session: AsyncSession, session_id: int) -> List[Dict]:
    """
    Return list of players in the session: session_participants plus any player
    who appears in a match in this session (deduped by player_id).
    Returns list of dicts with player_id, full_name.
    """
    part_q = select(SessionParticipant.player_id).where(
        SessionParticipant.session_id == session_id
    )
    part_result = await db_session.execute(part_q)
    part_player_ids = {row[0] for row in part_result.all()}

    match_q = select(
        Match.team1_player1_id,
        Match.team1_player2_id,
        Match.team2_player1_id,
        Match.team2_player2_id,
    ).where(Match.session_id == session_id)
    match_result = await db_session.execute(match_q)
    for row in match_result.all():
        for pid in (
            row.team1_player1_id,
            row.team1_player2_id,
            row.team2_player1_id,
            row.team2_player2_id,
        ):
            if pid is not None:
                part_player_ids.add(pid)

    if not part_player_ids:
        return []

    players_q = (
        select(
            Player.id,
            Player.full_name,
            Player.nickname,
            Player.level,
            Player.gender,
            Player.is_placeholder,
            Location.name.label("location_name"),
        )
        .outerjoin(Location, Location.id == Player.location_id)
        .where(Player.id.in_(part_player_ids))
    )
    players_result = await db_session.execute(players_q)
    rows = players_result.all()

    return [
        {
            "player_id": r.id,
            "full_name": r.full_name or r.nickname or f"Player {r.id}",
            "level": r.level,
            "gender": r.gender,
            "location_name": r.location_name,
            "is_placeholder": bool(r.is_placeholder),
        }
        for r in rows
    ]


async def remove_session_participant(
    db_session: AsyncSession,
    session_id: int,
    player_id: int,
) -> bool:
    """
    Remove a player from session participants. Returns True if removed.
    Returns False if player was not in participants or has matches in this session
    (cannot remove a player who has played in the session).
    """
    match_check = await db_session.execute(
        select(Match.id)
        .where(
            and_(
                Match.session_id == session_id,
                or_(
                    Match.team1_player1_id == player_id,
                    Match.team1_player2_id == player_id,
                    Match.team2_player1_id == player_id,
                    Match.team2_player2_id == player_id,
                ),
            )
        )
        .limit(1)
    )
    if match_check.scalar_one_or_none() is not None:
        return False

    result = await db_session.execute(
        delete(SessionParticipant).where(
            and_(
                SessionParticipant.session_id == session_id,
                SessionParticipant.player_id == player_id,
            )
        )
    )
    await db_session.commit()
    return result.rowcount > 0


async def add_session_participant(
    db_session: AsyncSession,
    session_id: int,
    player_id: int,
    invited_by: Optional[int] = None,
) -> bool:
    """Add a player to session participants (idempotent). Returns True if added or already present."""
    existing = await db_session.execute(
        select(SessionParticipant.id).where(
            and_(
                SessionParticipant.session_id == session_id,
                SessionParticipant.player_id == player_id,
            )
        )
    )
    if existing.scalar_one_or_none() is not None:
        return True
    rec = SessionParticipant(session_id=session_id, player_id=player_id, invited_by=invited_by)
    db_session.add(rec)
    await db_session.commit()
    return True


async def join_session_by_code(
    db_session: AsyncSession, code: str, player_id: int
) -> Optional[Dict]:
    """
    Resolve session by code; if ACTIVE, add player to participants and return session summary.
    Returns None if session not found or not ACTIVE.
    """
    sess = await get_session_by_code(db_session, code)
    if not sess or sess.get("status") != "ACTIVE":
        return None
    await add_session_participant(db_session, sess["id"], player_id, invited_by=None)
    return sess


async def can_user_add_match_to_session(
    db_session: AsyncSession, session_id: int, session_obj: Dict, user_id: int
) -> bool:
    """
    For non-league sessions (season_id is None), return True iff user's player is
    creator, has a match in the session, or is in session_participants.
    """
    if session_obj.get("season_id") is not None:
        return True  # League session: caller uses league-admin check
    player_result = await db_session.execute(select(Player.id).where(Player.user_id == user_id))
    player_id = player_result.scalar_one_or_none()
    if player_id is None:
        return False
    if session_obj.get("created_by") == player_id:
        return True
    match_q = (
        select(Match.id)
        .where(
            and_(
                Match.session_id == session_id,
                or_(
                    Match.team1_player1_id == player_id,
                    Match.team1_player2_id == player_id,
                    Match.team2_player1_id == player_id,
                    Match.team2_player2_id == player_id,
                ),
            )
        )
        .limit(1)
    )
    match_result = await db_session.execute(match_q)
    if match_result.scalar_one_or_none() is not None:
        return True
    part_result = await db_session.execute(
        select(SessionParticipant.id).where(
            and_(
                SessionParticipant.session_id == session_id,
                SessionParticipant.player_id == player_id,
            )
        )
    )
    return part_result.scalar_one_or_none() is not None


# ============================================================================
# Notification-related reads (session-scoped)
# ============================================================================


async def get_session_match_player_user_ids(
    session: AsyncSession, session_id: int, exclude_user_id: Optional[int] = None
) -> List[int]:
    """
    Get distinct user IDs for all players in matches of a session.

    Collects player IDs from all four match positions (team1_player1, team1_player2,
    team2_player1, team2_player2), resolves to user IDs via Player, and filters out
    placeholder players (NULL user_id).

    Args:
        session: Database session
        session_id: ID of the session
        exclude_user_id: Optional user ID to exclude (e.g. the submitter)

    Returns:
        List of distinct user IDs
    """
    player_cols = [
        Match.team1_player1_id,
        Match.team1_player2_id,
        Match.team2_player1_id,
        Match.team2_player2_id,
    ]
    subqueries = [
        select(col.label("player_id")).where(Match.session_id == session_id) for col in player_cols
    ]
    all_players = subqueries[0].union(*subqueries[1:]).subquery()

    query = (
        select(Player.user_id)
        .join(all_players, Player.id == all_players.c.player_id)
        .where(Player.user_id.isnot(None))
    )

    if exclude_user_id is not None:
        query = query.where(Player.user_id != exclude_user_id)

    query = query.distinct()
    result = await session.execute(query)
    return [row[0] for row in result.all()]
