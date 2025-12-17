"""
Data service layer for database operations.
Handles all CRUD operations for the ELO system.
"""

from typing import List, Dict, Optional, Tuple, TYPE_CHECKING
from datetime import datetime, date, time, timedelta
from collections import defaultdict
import pytz
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from backend.models.schemas import CreateMatchRequest, UpdateMatchRequest
from sqlalchemy import select, update, delete, func, and_, or_, text, cast, Integer
from sqlalchemy.orm import selectinload, aliased
from sqlalchemy.dialects.postgresql import insert, insert as pg_insert
from sqlalchemy.sql import func as sql_func
from backend.database import db
from backend.database.models import (
    League, LeagueMember, LeagueMessage, LeagueConfig, LeagueRequest, Season, Location, Court, Player, User,
    Session, Match, Setting, PartnershipStats, OpponentStats, 
    EloHistory, PlayerSeasonStats, SessionStatus, PlayerGlobalStats,
    WeeklySchedule, Signup, SignupPlayer, SignupEvent,
    OpenSignupsMode, SignupEventType,
    PartnershipStatsSeason, OpponentStatsSeason, 
    PlayerLeagueStats, PartnershipStatsLeague, OpponentStatsLeague,
    StatsCalculationJob, StatsCalculationJobStatus,
    Region
)
# MatchData removed - now using Match ORM model directly
from backend.services import calculation_service
# Lazy import to avoid circular dependency with stats_queue
from backend.utils.constants import INITIAL_ELO
from backend.utils.datetime_utils import utcnow
import csv
import io

#
# Helper functions
#

def generate_player_initials(name: str) -> str:
    """
    Generate initials from player name.
    Returns first letter of first name + first letter of last name.
    If only one name, returns first two letters.
    """
    if not name or not name.strip():
        return ""
    
    name_parts = name.strip().split()
    
    if len(name_parts) == 0:
        return ""
    elif len(name_parts) == 1:
        # Single name - return first two letters (if available)
        single_name = name_parts[0]
        if len(single_name) >= 2:
            return single_name[0:2].upper()
        else:
            return single_name[0].upper()
    else:
        # Multiple names - return first letter of first name + first letter of last name
        return (name_parts[0][0] + name_parts[-1][0]).upper()


#
# Async versions of data service functions
# These use SQLAlchemy ORM with async sessions
#

async def create_league(
    session: AsyncSession,
    name: str,
    description: Optional[str],
    location_id: Optional[str],
    is_open: bool,
    whatsapp_group_id: Optional[str],
    creator_user_id: int,
    gender: Optional[str] = None,
    level: Optional[str] = None
) -> Dict:
    """Create a new league."""
    league = League(
        name=name,
        description=description,
        location_id=location_id,
        is_open=is_open,
        whatsapp_group_id=whatsapp_group_id,
        gender=gender,
        level=level
    )
    session.add(league)
    await session.flush()  # Get the league ID
    
    # Get creator's player_id
    result = await session.execute(
        select(Player).where(Player.user_id == creator_user_id)
    )
    player = result.scalar_one_or_none()
    if not player:
        raise ValueError("Player not found for user_id")
    
    # Add creator as admin member
    member = LeagueMember(
        league_id=league.id,
        player_id=player.id,
        role="admin"
    )
    session.add(member)
    await session.commit()
    await session.refresh(league)
    
    return {
        "id": league.id,
        "name": league.name,
        "description": league.description,
        "location_id": league.location_id,
        "is_open": league.is_open,
        "whatsapp_group_id": league.whatsapp_group_id,
        "gender": league.gender,
        "level": league.level,
        "created_at": league.created_at.isoformat() if league.created_at else None,
        "updated_at": league.updated_at.isoformat() if league.updated_at else None,
    }


async def list_leagues(
    session: AsyncSession,
    location_id: Optional[str] = None,
    region_id: Optional[str] = None,
    gender: Optional[str] = None,
    level: Optional[str] = None,
    order: Optional[str] = None,
    limit: Optional[int] = None
) -> List[Dict]:
    """
    List all leagues with optional filters, ordering, and limit.

    This is a legacy helper that returns the full list (optionally limited).
    For paginated access with total counts, prefer query_leagues.
    """
    # Subquery to count members for each league
    member_count_subq = (
        select(
            LeagueMember.league_id,
            func.count(LeagueMember.id).label("member_count")
        )
        .group_by(LeagueMember.league_id)
        .subquery()
    )
    
    # Build the base query with joins
    query = (
        select(
            League,
            func.coalesce(member_count_subq.c.member_count, 0).label("member_count"),
            Location.name.label("location_name"),
            Location.region_id.label("region_id"),
            Region.name.label("region_name")
        )
        .outerjoin(member_count_subq, member_count_subq.c.league_id == League.id)
        .outerjoin(Location, Location.id == League.location_id)
        .outerjoin(Region, Region.id == Location.region_id)
    )
    
    # Apply filters
    conditions = []
    if location_id is not None:
        conditions.append(League.location_id == location_id)
    if region_id is not None:
        conditions.append(Location.region_id == region_id)
    if gender is not None:
        conditions.append(League.gender == gender)
    if level is not None:
        conditions.append(League.level == level)
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # Apply ordering
    if order:
        # Parse order string (e.g., "created_at:desc" or "name:asc")
        order_parts = order.split(":")
        order_field = order_parts[0]
        order_direction = order_parts[1].lower() if len(order_parts) > 1 else "asc"
        
        if order_field == "name":
            order_column = League.name
        elif order_field == "created_at":
            order_column = League.created_at
        elif order_field == "member_count":
            order_column = func.coalesce(member_count_subq.c.member_count, 0)
        else:
            order_column = League.created_at  # default
        
        if order_direction == "desc":
            query = query.order_by(order_column.desc())
        else:
            query = query.order_by(order_column.asc())
    else:
        # Default ordering by created_at desc
        query = query.order_by(League.created_at.desc())
    
    # Apply limit
    if limit is not None and limit > 0:
        query = query.limit(limit)
    
    result = await session.execute(query)
    rows = result.all()
    
    return [
        {
            "id": league.id,
            "name": league.name,
            "description": league.description,
            "location_id": league.location_id,
            "location_name": location_name,
            "region_id": league_region_id,
            "region_name": league_region_name,
            "is_open": league.is_open,
            "whatsapp_group_id": league.whatsapp_group_id,
            "gender": league.gender,
            "level": league.level,
            "member_count": int(member_count) if member_count is not None else 0,
            "created_at": league.created_at.isoformat() if league.created_at else None,
            "updated_at": league.updated_at.isoformat() if league.updated_at else None,
        }
        for league, member_count, location_name, league_region_id, league_region_name in rows
    ]


async def query_leagues(
    session: AsyncSession,
    location_id: Optional[str] = None,
    region_id: Optional[str] = None,
    gender: Optional[str] = None,
    level: Optional[str] = None,
    order: Optional[str] = None,
    page: int = 1,
    page_size: int = 25,
    include_joined: Optional[bool] = None,
    user_id: Optional[int] = None,
) -> Dict:
    """
    Query leagues with filters, ordering, and pagination.

    Returns a paginated structure:
    {
        "items": [...],
        "page": page,
        "page_size": page_size,
        "total_count": total_count
    }
    """
    if page < 1:
        page = 1
    if page_size <= 0:
        page_size = 25
    
    # Optionally include or exclude leagues the current user has joined.
    # When include_joined is False and a user_id is provided, we'll exclude their joined leagues.
    # When include_joined is True or None, we don't filter by membership.
    player_id: Optional[int] = None
    if user_id is not None:
        player_result = await session.execute(
            select(Player.id).where(Player.user_id == user_id)
        )
        player_id = player_result.scalar_one_or_none()

    # Subquery to count members for each league
    member_count_subq = (
        select(
            LeagueMember.league_id,
            func.count(LeagueMember.id).label("member_count")
        )
        .group_by(LeagueMember.league_id)
        .subquery()
    )
    
    # Base query for items
    base_query = (
        select(
            League,
            func.coalesce(member_count_subq.c.member_count, 0).label("member_count"),
            Location.name.label("location_name"),
            Location.region_id.label("region_id"),
            Region.name.label("region_name")
        )
        .outerjoin(member_count_subq, member_count_subq.c.league_id == League.id)
        .outerjoin(Location, Location.id == League.location_id)
        .outerjoin(Region, Region.id == Location.region_id)
    )
    
    # Build filter conditions (shared between count and items)
    conditions = []
    if location_id is not None:
        conditions.append(League.location_id == location_id)
    if region_id is not None:
        conditions.append(Location.region_id == region_id)
    if gender is not None:
        conditions.append(League.gender == gender)
    if level is not None:
        conditions.append(League.level == level)

    # Optionally filter by membership: when include_joined is explicitly False, exclude joined leagues.
    if include_joined is False and player_id is not None:
        conditions.append(
            League.id.not_in(
                select(LeagueMember.league_id).where(
                    LeagueMember.player_id == player_id
                )
            )
        )
    
    if conditions:
        base_query = base_query.where(and_(*conditions))
    
    # Total count query (no member_count / region_name needed)
    count_query = select(func.count(League.id)).select_from(League).outerjoin(
        Location, Location.id == League.location_id
    )
    if conditions:
        count_query = count_query.where(and_(*conditions))
    count_result = await session.execute(count_query)
    total_count = count_result.scalar() or 0
    
    # Apply ordering to items query
    if order:
        order_parts = order.split(":")
        order_field = order_parts[0]
        order_direction = order_parts[1].lower() if len(order_parts) > 1 else "asc"
        
        if order_field == "name":
            order_column = League.name
        elif order_field == "created_at":
            order_column = League.created_at
        elif order_field == "member_count":
            order_column = func.coalesce(member_count_subq.c.member_count, 0)
        else:
            order_column = League.created_at  # default
        
        if order_direction == "desc":
            base_query = base_query.order_by(order_column.desc())
        else:
            base_query = base_query.order_by(order_column.asc())
    else:
        base_query = base_query.order_by(League.created_at.desc())
    
    offset = (page - 1) * page_size
    items_query = base_query.offset(offset).limit(page_size)
    
    result = await session.execute(items_query)
    rows = result.all()
    
    items = [
        {
            "id": league.id,
            "name": league.name,
            "description": league.description,
            "location_id": league.location_id,
            "location_name": location_name,
            "region_id": league_region_id,
            "region_name": league_region_name,
            "is_open": league.is_open,
            "whatsapp_group_id": league.whatsapp_group_id,
            "gender": league.gender,
            "level": league.level,
            "member_count": int(member_count) if member_count is not None else 0,
            "created_at": league.created_at.isoformat() if league.created_at else None,
            "updated_at": league.updated_at.isoformat() if league.updated_at else None,
        }
        for league, member_count, location_name, league_region_id, league_region_name in rows
    ]
    
    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total_count": total_count,
    }


async def get_league(session: AsyncSession, league_id: int) -> Optional[Dict]:
    """Get a league by ID."""
    result = await session.execute(
        select(League).where(League.id == league_id)
    )
    league = result.scalar_one_or_none()
    if not league:
        return None
    return {
        "id": league.id,
        "name": league.name,
        "description": league.description,
        "location_id": league.location_id,
        "is_open": league.is_open,
        "whatsapp_group_id": league.whatsapp_group_id,
        "gender": league.gender,
        "level": league.level,
        "created_at": league.created_at.isoformat() if league.created_at else None,
        "updated_at": league.updated_at.isoformat() if league.updated_at else None,
    }


async def get_user_leagues(session: AsyncSession, user_id: int) -> List[Dict]:
    """Get all leagues a user is a member of."""
    # Subquery to count members for each league
    member_count_subq = (
        select(
            LeagueMember.league_id,
            func.count(LeagueMember.id).label("member_count")
        )
        .group_by(LeagueMember.league_id)
        .subquery()
    )
    
    result = await session.execute(
        select(
            League,
            LeagueMember.role.label("membership_role"),
            func.coalesce(member_count_subq.c.member_count, 0).label("member_count"),
            Location.name.label("location_name")
        )
        .join(LeagueMember, LeagueMember.league_id == League.id)
        .join(Player, Player.id == LeagueMember.player_id)
        .outerjoin(member_count_subq, member_count_subq.c.league_id == League.id)
        .outerjoin(Location, Location.id == League.location_id)
        .where(Player.user_id == user_id)
        .distinct()
        .order_by(League.created_at.desc())
    )
    rows = result.all()
    return [
        {
            "id": league.id,
            "name": league.name,
            "description": league.description,
            "location_id": league.location_id,
            "location_name": location_name,
            "is_open": league.is_open,
            "whatsapp_group_id": league.whatsapp_group_id,
            "gender": league.gender,
            "level": league.level,
            "membership_role": role,
            "member_count": int(member_count) if member_count is not None else 0,
            "created_at": league.created_at.isoformat() if league.created_at else None,
            "updated_at": league.updated_at.isoformat() if league.updated_at else None,
        }
        for league, role, member_count, location_name in rows
    ]


async def update_league(
    session: AsyncSession,
    league_id: int,
    name: str,
    description: Optional[str],
    location_id: Optional[str],
    is_open: bool,
    whatsapp_group_id: Optional[str],
    gender: Optional[str] = None,
    level: Optional[str] = None
) -> Optional[Dict]:
    """Update a league."""
    update_values = {
        "name": name,
        "description": description,
        "location_id": location_id,
        "is_open": is_open,
        "whatsapp_group_id": whatsapp_group_id
    }
    if gender is not None:
        update_values["gender"] = gender
    if level is not None:
        update_values["level"] = level
    
    await session.execute(
        update(League)
        .where(League.id == league_id)
        .values(**update_values)
    )
    await session.commit()
    return await get_league(session, league_id)


async def delete_league(session: AsyncSession, league_id: int) -> bool:
    """Delete a league.
    
    Deletes all related records first to avoid foreign key constraint violations:
    - LeagueMember records
    - LeagueMessage records
    - LeagueConfig records
    - Season records (and their related data)
    - Then the League itself
    """
    # Delete related records first
    await session.execute(
        delete(LeagueMember).where(LeagueMember.league_id == league_id)
    )
    await session.execute(
        delete(LeagueMessage).where(LeagueMessage.league_id == league_id)
    )
    await session.execute(
        delete(LeagueConfig).where(LeagueConfig.league_id == league_id)
    )
    await session.execute(
        delete(Season).where(Season.league_id == league_id)
    )
    
    # Now delete the league
    result = await session.execute(
        delete(League).where(League.id == league_id)
    )
    await session.commit()
    return result.rowcount > 0


async def is_database_empty(session: AsyncSession) -> bool:
    """Check if database is empty."""
    result = await session.execute(select(func.count(Player.id)))
    count = result.scalar() or 0
    return count == 0


def _is_season_active(season: Season, current_date: Optional[date] = None) -> bool:
    """Check if a season is active based on date range."""
    if current_date is None:
        current_date = date.today()
    return season.start_date <= current_date <= season.end_date


async def create_season(
    session: AsyncSession,
    league_id: int,
    name: Optional[str],
    start_date: str,
    end_date: str,
    point_system: Optional[str],
) -> Dict:
    """Create a season."""
    season = Season(
        league_id=league_id,
        name=name,
        start_date=datetime.fromisoformat(start_date).date() if isinstance(start_date, str) else start_date,
        end_date=datetime.fromisoformat(end_date).date() if isinstance(end_date, str) else end_date,
        point_system=point_system,
    )
    session.add(season)
    await session.commit()
    await session.refresh(season)
    current_date = date.today()
    return {
        "id": season.id,
        "league_id": season.league_id,
        "name": season.name,
        "start_date": season.start_date.isoformat() if season.start_date else None,
        "end_date": season.end_date.isoformat() if season.end_date else None,
        "point_system": season.point_system,
        "created_at": season.created_at.isoformat() if season.created_at else None,
        "updated_at": season.updated_at.isoformat() if season.updated_at else None,
    }


async def list_seasons(session: AsyncSession, league_id: int) -> List[Dict]:
    """List seasons for a league."""
    result = await session.execute(
        select(Season)
        .where(Season.league_id == league_id)
        .order_by(Season.start_date.desc())
    )
    seasons = result.scalars().all()
    current_date = date.today()
    return [
        {
            "id": s.id,
            "league_id": s.league_id,
            "name": s.name,
            "start_date": s.start_date.isoformat() if s.start_date else None,
            "end_date": s.end_date.isoformat() if s.end_date else None,
            "point_system": s.point_system,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        }
        for s in seasons
    ]


async def get_season(session: AsyncSession, season_id: int) -> Optional[Dict]:
    """Get a season by ID."""
    result = await session.execute(
        select(Season).where(Season.id == season_id)
    )
    season = result.scalar_one_or_none()
    if not season:
        return None
    return {
        "id": season.id,
        "league_id": season.league_id,
        "name": season.name,
        "start_date": season.start_date.isoformat() if season.start_date else None,
        "end_date": season.end_date.isoformat() if season.end_date else None,
        "point_system": season.point_system,
        "created_at": season.created_at.isoformat() if season.created_at else None,
        "updated_at": season.updated_at.isoformat() if season.updated_at else None,
    }


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
    result = await session.execute(
        select(Session).where(Session.id == session_id)
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


async def get_or_create_active_league_session(
    session: AsyncSession,
    league_id: int,
    date: str,
    name: Optional[str] = None,
    created_by: Optional[int] = None,
    season_id: Optional[int] = None
) -> Dict:
    """
    Get or create an active session for a league and date atomically.
    Uses SELECT FOR UPDATE to prevent race conditions.
    
    Args:
        session: Database session
        league_id: League ID
        date: Session date
        name: Optional session name
        created_by: Optional player ID who created the session
        season_id: Optional season ID - if provided, use this season instead of finding active season
        
    Returns:
        Dict with session info
    """
    # Verify league exists
    result = await session.execute(
        select(League).where(League.id == league_id)
    )
    league = result.scalar_one_or_none()
    if not league:
        raise ValueError(f"League {league_id} not found")
    
    # Use provided season_id, or find the most recent active season for this league
    if season_id:
        season_result = await session.execute(
            select(Season).where(
                and_(Season.id == season_id, Season.league_id == league_id)
            )
        )
        active_season = season_result.scalar_one_or_none()
        if not active_season:
            raise ValueError(f"Season {season_id} not found or does not belong to league {league_id}")
    else:
        # Find the most recent active season for this league (based on date range)
        current_date = date.today()
        season_result = await session.execute(
            select(Season)
            .where(
                and_(
                    Season.league_id == league_id,
                    Season.start_date <= current_date,
                    Season.end_date >= current_date
                )
            )
            .order_by(Season.created_at.desc())
            .limit(1)
        )
        active_season = season_result.scalar_one_or_none()
        
        if not active_season:
            raise ValueError(f"League {league_id} does not have an active season. Please create a season with dates that include today's date.")
    
    # Try to get existing active session for this date and season
    # Use SELECT FOR UPDATE to lock the row and prevent race conditions
    # We'll try without nowait first, then retry if needed
    try:
        result = await session.execute(
            select(Session)
            .where(
                and_(
                    Session.date == date,
                    Session.season_id == active_season.id,
                    Session.status == SessionStatus.ACTIVE
                )
            )
            .with_for_update()  # Lock matching rows (waits if locked by another transaction)
        )
        existing_session = result.scalar_one_or_none()
        
        if existing_session:
            # Return existing session
            return {
                "id": existing_session.id,
                "date": existing_session.date,
                "name": existing_session.name,
                "status": existing_session.status.value if existing_session.status else None,
                "season_id": existing_session.season_id,
            }
    except Exception:
        # If SELECT FOR UPDATE fails, retry without lock (another transaction may have created it)
        result = await session.execute(
            select(Session)
            .where(
                and_(
                    Session.date == date,
                    Session.season_id == active_season.id,
                    Session.status == SessionStatus.ACTIVE
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
    # Count existing sessions for this date and season to generate proper session name
    count_result = await session.execute(
        select(func.count(Session.id)).where(
            and_(
                Session.date == date,
                Session.season_id == active_season.id
            )
        )
    )
    session_count = count_result.scalar() or 0
    
    # Generate session name with numbering
    if name:
        session_name = name
    elif session_count == 0:
        session_name = date
    else:
        session_name = f"{date} Session #{session_count + 1}"
    
    new_session = Session(
        date=date,
        name=session_name,
        status=SessionStatus.ACTIVE,
        season_id=active_season.id,
        created_by=created_by
    )
    session.add(new_session)
    await session.flush()  # Flush to get the ID
    await session.refresh(new_session)
    return {
        "id": new_session.id,
        "date": new_session.date,
        "name": new_session.name,
        "status": new_session.status.value if new_session.status else None,
        "season_id": new_session.season_id,
    }


async def create_league_session(
    session: AsyncSession,
    league_id: int,
    date: str,
    name: Optional[str],
    created_by: Optional[int] = None
) -> Dict:
    """
    Create a league session. Automatically uses the league's most recent active season.
    Now includes duplicate prevention - will raise ValueError if active session already exists.
    """
    # Verify league exists
    result = await session.execute(
        select(League).where(League.id == league_id)
    )
    league = result.scalar_one_or_none()
    if not league:
        raise ValueError(f"League {league_id} not found")
    
    # Find the most recent active season for this league (based on date range)
    current_date = date.today()
    season_result = await session.execute(
        select(Season)
        .where(
            and_(
                Season.league_id == league_id,
                Season.start_date <= current_date,
                Season.end_date >= current_date
            )
        )
        .order_by(Season.created_at.desc())
        .limit(1)
    )
    active_season = season_result.scalar_one_or_none()
    
    if not active_season:
        raise ValueError(f"League {league_id} does not have an active season. Please create a season with dates that include today's date.")
    
    # Check if active session already exists for this date and season
    result = await session.execute(
        select(Session).where(
            and_(
                Session.date == date,
                Session.season_id == active_season.id,
                Session.status == SessionStatus.ACTIVE
            )
        )
    )
    existing_session = result.scalar_one_or_none()
    if existing_session:
        raise ValueError(f"An active session '{existing_session.name}' already exists for this date. Please submit the current session before creating a new one.")
    
    # Count existing sessions for this date and season to generate proper session name
    count_result = await session.execute(
        select(func.count(Session.id)).where(
            and_(
                Session.date == date,
                Session.season_id == active_season.id
            )
        )
    )
    session_count = count_result.scalar() or 0
    
    # Generate session name with numbering
    if name:
        session_name = name
    elif session_count == 0:
        session_name = date
    else:
        session_name = f"{date} Session #{session_count + 1}"
    
    new_session = Session(
        date=date,
        name=session_name,
        status=SessionStatus.ACTIVE,
        season_id=active_season.id,
        created_by=created_by
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
    }


async def list_league_members(session: AsyncSession, league_id: int) -> List[Dict]:
    """List league members."""
    result = await session.execute(
        select(
            LeagueMember,
            Player.full_name.label("player_name"),
            Player.level.label("player_level"),
            Player.avatar.label("player_avatar")
        )
        .join(Player, Player.id == LeagueMember.player_id)
        .where(LeagueMember.league_id == league_id)
        .order_by(Player.full_name.asc())
    )
    rows = result.all()
    return [
        {
            "id": member.id,
            "league_id": member.league_id,
            "player_id": member.player_id,
            "role": member.role,
            "player_name": player_name,
            "player_level": player_level,
            # Use stored avatar if present, otherwise fallback to initials from full name
            "player_avatar": player_avatar or generate_player_initials(player_name),
            "joined_at": member.created_at.isoformat() if member.created_at else None,
        }
        for member, player_name, player_level, player_avatar in rows
    ]


async def create_location(
    session: AsyncSession,
    name: str,
    city: Optional[str],
    state: Optional[str],
    country: str = "USA",
    location_id: Optional[str] = None
) -> Dict:
    """Create a location."""
    if not location_id:
        raise ValueError("location_id is required when creating a location")
    
    location = Location(
        id=location_id,
        name=name,
        city=city,
        state=state,
        country=country
    )
    session.add(location)
    await session.commit()
    await session.refresh(location)
    return {
        "id": location.id,
        "location_id": location.id,  # Keep for backward compatibility in API responses
        "name": location.name,
        "city": location.city,
        "state": location.state,
        "country": location.country,
        "created_at": location.created_at.isoformat() if location.created_at else None,
        "updated_at": location.updated_at.isoformat() if location.updated_at else None,
    }


async def list_locations(session: AsyncSession) -> List[Dict]:
    """List all locations."""
    # Join regions so each location carries its region metadata
    result = await session.execute(
        select(Location, Region)
        .outerjoin(Region, Region.id == Location.region_id)
        .order_by(Location.name.asc())
    )
    rows = result.all()
    return [
        {
            "id": location.id,
            "location_id": location.id,  # Keep for backward compatibility in API responses
            "name": location.name,
            "city": location.city,
            "state": location.state,
            "country": location.country,
            "latitude": location.latitude,
            "longitude": location.longitude,
            "region_id": region.id if region else None,
            "region_name": region.name if region else None,
            "created_at": location.created_at.isoformat() if location.created_at else None,
            "updated_at": location.updated_at.isoformat() if location.updated_at else None,
        }
        for location, region in rows
    ]


async def list_regions(session: AsyncSession) -> List[Dict]:
    """List all regions."""
    result = await session.execute(select(Region).order_by(Region.name.asc()))
    regions = result.scalars().all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "country": getattr(r, "country", None),
        }
        for r in regions
    ]


async def update_location(
    session: AsyncSession,
    location_id: str,
    name: Optional[str],
    city: Optional[str],
    state: Optional[str],
    country: Optional[str]
) -> Optional[Dict]:
    """Update a location."""
    update_values = {}
    if name is not None:
        update_values["name"] = name
    if city is not None:
        update_values["city"] = city
    if state is not None:
        update_values["state"] = state
    if country is not None:
        update_values["country"] = country
    
    if update_values:
        await session.execute(
            update(Location)
            .where(Location.id == location_id)
            .values(**update_values)
        )
        await session.commit()
    
    result = await session.execute(
        select(Location).where(Location.id == location_id)
    )
    location = result.scalar_one_or_none()
    if not location:
        return None
    return {
        "id": location.id,
        "location_id": location.id,  # Keep for backward compatibility in API responses
        "name": location.name,
        "city": location.city,
        "state": location.state,
        "country": location.country,
        "created_at": location.created_at.isoformat() if location.created_at else None,
        "updated_at": location.updated_at.isoformat() if location.updated_at else None,
    }


async def delete_location(session: AsyncSession, location_id: str) -> bool:
    """Delete a location."""
    result = await session.execute(
        delete(Location).where(Location.id == location_id)
    )
    await session.commit()
    return result.rowcount > 0


async def create_court(
    session: AsyncSession,
    name: str,
    address: Optional[str],
    location_id: str,
    geoJson: Optional[str]
) -> Dict:
    """Create a court."""
    court = Court(
        name=name,
        address=address,
        location_id=location_id,
        geoJson=geoJson
    )
    session.add(court)
    await session.commit()
    await session.refresh(court)
    return {
        "id": court.id,
        "name": court.name,
        "address": court.address,
        "location_id": court.location_id,
        "geoJson": court.geoJson,
        "created_at": court.created_at.isoformat() if court.created_at else None,
        "updated_at": court.updated_at.isoformat() if court.updated_at else None,
    }


async def list_courts(session: AsyncSession, location_id: Optional[str] = None) -> List[Dict]:
    """List courts, optionally filtered by location."""
    query = select(Court).order_by(Court.name.asc())
    if location_id is not None:
        query = query.where(Court.location_id == location_id)
    
    result = await session.execute(query)
    courts = result.scalars().all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "address": c.address,
            "location_id": c.location_id,
            "geoJson": c.geoJson,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }
        for c in courts
    ]


async def update_court(
    session: AsyncSession,
    court_id: int,
    name: Optional[str],
    address: Optional[str],
    location_id: Optional[str],
    geoJson: Optional[str]
) -> Optional[Dict]:
    """Update a court."""
    update_values = {}
    if name is not None:
        update_values["name"] = name
    if address is not None:
        update_values["address"] = address
    if location_id is not None:
        update_values["location_id"] = location_id
    if geoJson is not None:
        update_values["geoJson"] = geoJson
    
    if update_values:
        await session.execute(
            update(Court)
            .where(Court.id == court_id)
            .values(**update_values)
        )
        await session.commit()
    
    result = await session.execute(
        select(Court).where(Court.id == court_id)
    )
    court = result.scalar_one_or_none()
    if not court:
        return None
    return {
        "id": court.id,
        "name": court.name,
        "address": court.address,
        "location_id": court.location_id,
        "geoJson": court.geoJson,
        "created_at": court.created_at.isoformat() if court.created_at else None,
        "updated_at": court.updated_at.isoformat() if court.updated_at else None,
    }


async def delete_court(session: AsyncSession, court_id: int) -> bool:
    """Delete a court."""
    result = await session.execute(
        delete(Court).where(Court.id == court_id)
    )
    await session.commit()
    return result.rowcount > 0


async def add_league_member(
    session: AsyncSession,
    league_id: int,
    player_id: int,
    role: str = "member"
) -> Dict:
    """Add a league member."""
    member = LeagueMember(
        league_id=league_id,
        player_id=player_id,
        role=role
    )
    session.add(member)
    await session.commit()
    await session.refresh(member)
    return {
        "id": member.id,
        "league_id": member.league_id,
        "player_id": member.player_id,
        "role": member.role,
    }


async def is_league_member(
    session: AsyncSession,
    league_id: int,
    player_id: int
) -> bool:
    """Check if a player is a member of a league."""
    result = await session.execute(
        select(LeagueMember)
        .where(and_(LeagueMember.league_id == league_id, LeagueMember.player_id == player_id))
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def get_league_member_by_player(
    session: AsyncSession,
    league_id: int,
    player_id: int
) -> Optional[Dict]:
    """Get league member by player_id."""
    result = await session.execute(
        select(LeagueMember)
        .where(and_(LeagueMember.league_id == league_id, LeagueMember.player_id == player_id))
    )
    member = result.scalar_one_or_none()
    if not member:
        return None
    return {
        "id": member.id,
        "league_id": member.league_id,
        "player_id": member.player_id,
        "role": member.role,
    }


async def update_league_member(
    session: AsyncSession,
    league_id: int,
    member_id: int,
    role: str
) -> Optional[Dict]:
    """Update a league member."""
    await session.execute(
        update(LeagueMember)
        .where(and_(LeagueMember.id == member_id, LeagueMember.league_id == league_id))
        .values(role=role)
    )
    await session.commit()
    
    result = await session.execute(
        select(LeagueMember)
        .where(and_(LeagueMember.id == member_id, LeagueMember.league_id == league_id))
    )
    member = result.scalar_one_or_none()
    if not member:
        return None
    return {
        "id": member.id,
        "league_id": member.league_id,
        "player_id": member.player_id,
        "role": member.role,
    }


async def remove_league_member(
    session: AsyncSession,
    league_id: int,
    member_id: int
) -> bool:
    """Remove a league member."""
    result = await session.execute(
        delete(LeagueMember)
        .where(and_(LeagueMember.id == member_id, LeagueMember.league_id == league_id))
    )
    await session.commit()
    return result.rowcount > 0


async def create_league_request(
    session: AsyncSession,
    league_id: int,
    player_id: int
) -> Dict:
    """Create a join request for an invite-only league."""
    # Check if a pending request already exists
    existing_request = await session.execute(
        select(LeagueRequest)
        .where(
            and_(
                LeagueRequest.league_id == league_id,
                LeagueRequest.player_id == player_id,
                LeagueRequest.status == "pending"
            )
        )
    )
    if existing_request.scalar_one_or_none():
        raise ValueError("A pending join request already exists for this league")
    
    # Create new request
    request = LeagueRequest(
        league_id=league_id,
        player_id=player_id,
        status="pending"
    )
    session.add(request)
    await session.commit()
    await session.refresh(request)
    
    return {
        "id": request.id,
        "league_id": request.league_id,
        "player_id": request.player_id,
        "status": request.status,
        "created_at": request.created_at.isoformat() if request.created_at else None,
        "updated_at": request.updated_at.isoformat() if request.updated_at else None,
    }


async def get_all_player_names(session: AsyncSession) -> List[str]:
    """Get all unique player names."""
    result = await session.execute(
        select(Player.full_name).order_by(Player.full_name.asc())
    )
    return [row[0] for row in result.all()]


async def get_player_by_user_id(session: AsyncSession, user_id: int) -> Optional[Dict]:
    """Get player profile by user_id."""
    result = await session.execute(
        select(Player).where(Player.user_id == user_id)
    )
    player = result.scalar_one_or_none()
    if not player:
        return None
    return {
        "id": player.id,
        "full_name": player.full_name,
        "user_id": player.user_id,
        "nickname": player.nickname,
        "gender": player.gender,
        "level": player.level,
        "date_of_birth": player.date_of_birth.isoformat() if player.date_of_birth else None,
        "height": player.height,
        "preferred_side": player.preferred_side,
        "location_id": player.location_id,
        "city": player.city,
        "state": player.state,
        "city_latitude": player.city_latitude,
        "city_longitude": player.city_longitude,
        "distance_to_location": player.distance_to_location,
        "avatar": player.avatar,
        "profile_picture_url": player.profile_picture_url,
        "avp_playerProfileId": player.avp_playerProfileId,
        "status": player.status,
        "created_at": player.created_at.isoformat() if player.created_at else None,
        "updated_at": player.updated_at.isoformat() if player.updated_at else None,
    }


async def get_player_by_user_id_with_stats(session: AsyncSession, user_id: int) -> Optional[Dict]:
    """Get player profile by user_id with global stats."""
    result = await session.execute(
        select(Player, PlayerGlobalStats)
        .outerjoin(PlayerGlobalStats, Player.id == PlayerGlobalStats.player_id)
        .where(Player.user_id == user_id)
    )
    row = result.first()
    
    if not row:
        return None
    
    player, global_stats = row
    
    return {
        "id": player.id,
        "full_name": player.full_name,
        "gender": player.gender,
        "level": player.level,
        "nickname": player.nickname,
        "date_of_birth": player.date_of_birth.isoformat() if player.date_of_birth else None,
        "height": player.height,
        "preferred_side": player.preferred_side,
        "location_id": player.location_id,
        "city": player.city,
        "state": player.state,
        "city_latitude": player.city_latitude,
        "city_longitude": player.city_longitude,
        "distance_to_location": player.distance_to_location,
        "avatar": player.avatar,
        "profile_picture_url": player.profile_picture_url,
        "stats": {
            "current_rating": global_stats.current_rating if global_stats else 1200.0,
            "total_games": global_stats.total_games if global_stats else 0,
            "total_wins": global_stats.total_wins if global_stats else 0,
        }
    }


async def upsert_user_player(
    session: AsyncSession,
    user_id: int,
    full_name: Optional[str] = None,
    nickname: Optional[str] = None,
    gender: Optional[str] = None,
    level: Optional[str] = None,
    date_of_birth: Optional[str] = None,  # ISO date string (YYYY-MM-DD)
    height: Optional[str] = None,
    preferred_side: Optional[str] = None,
    location_id: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    city_latitude: Optional[float] = None,
    city_longitude: Optional[float] = None,
    distance_to_location: Optional[float] = None
) -> Optional[Dict]:
    """
    Upsert (create or update) player profile linked to a user.
    Creates player if it doesn't exist, updates if it does.
    
    Args:
        session: Database session
        user_id: User ID
        full_name: Full name (required for creation, optional for update)
        nickname: Nickname (optional)
        gender: Gender (optional)
        level: Skill level (optional)
        date_of_birth: Date of birth as ISO date string YYYY-MM-DD (optional)
        height: Height (optional)
        preferred_side: Preferred side (optional)
        location_id: Location ID (optional)
        city: City name (optional)
        state: State name or abbreviation (optional)
        city_latitude: City latitude coordinate (optional)
        city_longitude: City longitude coordinate (optional)
        distance_to_location: Distance to default location in miles (optional)
        
    Returns:
        Player dict, or None if error (e.g., creation without full_name)
    """
    # Parse date_of_birth if provided
    date_of_birth_obj = None
    if date_of_birth:
        try:
            date_of_birth_obj = date.fromisoformat(date_of_birth)
        except ValueError:
            # Invalid date format, ignore
            pass
    
    # Check if player exists
    result = await session.execute(
        select(Player).where(Player.user_id == user_id)
    )
    player = result.scalar_one_or_none()
    
    if not player:
        # Create player if it doesn't exist
        if full_name is None:
            return None  # Need at least a name to create
        player = Player(
            user_id=user_id,
            full_name=full_name,
            nickname=nickname,
            gender=gender,
            level=level,
            date_of_birth=date_of_birth_obj,
            height=height,
            preferred_side=preferred_side,
            location_id=location_id,
            city=city,
            state=state,
            city_latitude=city_latitude,
            city_longitude=city_longitude,
            distance_to_location=distance_to_location
        )
        session.add(player)
        await session.commit()
        await session.refresh(player)
    else:
        # Update existing player
        update_values = {
            k: v for k, v in {
                "full_name": full_name,
                "nickname": nickname,
                "gender": gender,
                "level": level,
                "date_of_birth": date_of_birth_obj,
                "height": height,
                "preferred_side": preferred_side,
                "location_id": location_id,
                "city": city,
                "state": state,
                "city_latitude": city_latitude,
                "city_longitude": city_longitude,
                "distance_to_location": distance_to_location
            }.items() if v is not None
        }
        
        if update_values:
            await session.execute(
                update(Player)
                .where(Player.user_id == user_id)
                .values(**update_values)
            )
            await session.commit()
            await session.refresh(player)
    
    return {
        "id": player.id,
        "full_name": player.full_name,
        "user_id": player.user_id,
        "nickname": player.nickname,
        "gender": player.gender,
        "level": player.level,
        "date_of_birth": player.date_of_birth.isoformat() if player.date_of_birth else None,
        "height": player.height,
        "preferred_side": player.preferred_side,
        "location_id": player.location_id,
        "city": player.city,
        "state": player.state,
        "city_latitude": player.city_latitude,
        "city_longitude": player.city_longitude,
        "distance_to_location": player.distance_to_location,
        "profile_picture_url": player.profile_picture_url,
        "avp_playerProfileId": player.avp_playerProfileId,
        "status": player.status,
        "created_at": player.created_at.isoformat() if player.created_at else None,
        "updated_at": player.updated_at.isoformat() if player.updated_at else None,
    }


async def get_or_create_player(session: AsyncSession, name: str) -> int:
    """Get player ID by name, or create if doesn't exist."""
    # Try to get existing player
    result = await session.execute(
        select(Player.id).where(Player.full_name == name)
    )
    # Use first() instead of scalar_one_or_none() to handle duplicate names gracefully
    player_id = result.scalars().first()
    
    if player_id:
        return player_id
    
    # Create new player
    player = Player(full_name=name)
    session.add(player)
    await session.commit()
    await session.refresh(player)
    return player.id


def _sort_rankings_all_seasons(rankings: List[Dict]) -> List[Dict]:
    """
    Sort rankings for "All Seasons" view.
    Sort by: Wins (desc) → Win Rate (desc) → Avg Pt Diff (desc) → ELO (desc)
    """
    return sorted(
        rankings,
        key=lambda p: (
            -(p.get("Wins") or 0),  # Negative for descending
            -(p.get("Win Rate") or 0.0),
            -(p.get("Avg Pt Diff") or 0.0),
            -(p.get("ELO") or 0)
        )
    )


def _sort_rankings_single_season(rankings: List[Dict]) -> List[Dict]:
    """
    Sort rankings for single season view.
    Sort by: Points (desc) → Avg Pt Diff (desc) → Win Rate (desc) → ELO (desc)
    """
    return sorted(
        rankings,
        key=lambda p: (
            -(p.get("Points") or 0),  # Negative for descending
            -(p.get("Avg Pt Diff") or 0.0),
            -(p.get("Win Rate") or 0.0),
            -(p.get("ELO") or 0)
        )
    )


async def get_rankings(session: AsyncSession, body: Optional[Dict] = None) -> List[Dict]:
    """
    Get current player rankings ordered by points.
    
    Args:
        session: Database session
        body: Optional query parameters dict with:
            - season_id: Optional[int] - filter by season (if not provided, gets latest stats across all seasons)
            - league_id: Optional[int] - filter by league (when season_id is not provided, gets stats across all seasons in the league)
    
    Returns:
        List of player rankings with stats
    """
    if body is None:
        body = {}
    
    season_id = body.get("season_id")
    league_id = body.get("league_id")
    
    try:
        # If league_id is provided (and season_id is not), use PlayerLeagueStats
        if league_id is not None and season_id is None:
            # Query PlayerLeagueStats directly for league-level stats
            stats_subq = select(
                PlayerLeagueStats.player_id,
                PlayerLeagueStats.points,
                PlayerLeagueStats.games,
                PlayerLeagueStats.wins,
                PlayerLeagueStats.win_rate,
                PlayerLeagueStats.avg_point_diff
            ).where(
                PlayerLeagueStats.league_id == int(league_id)
            ).subquery()
        else:
            # Use PlayerSeasonStats (existing logic for season_id or default)
            # Create subqueries for latest stats per player
            # Get the most recent stats for each player (by updated_at, then by id as tiebreaker)
            
            # Subquery to get the latest stat row ID for each player
            # Using ROW_NUMBER equivalent: get max updated_at, then max id as tiebreaker
            latest_stats_subq = select(
                PlayerSeasonStats.player_id,
                func.max(PlayerSeasonStats.updated_at).label("max_updated_at")
            )
            
            # Filter by season if provided
            if season_id is not None:
                latest_stats_subq = latest_stats_subq.where(
                    PlayerSeasonStats.season_id == int(season_id)
                )
            
            latest_stats_subq = latest_stats_subq.group_by(
                PlayerSeasonStats.player_id
            ).subquery()
            
            # Get the max id for each player with max updated_at (to handle ties)
            latest_id_subq = select(
                PlayerSeasonStats.player_id,
                func.max(PlayerSeasonStats.id).label("max_id")
            ).join(
                latest_stats_subq,
                and_(
                    PlayerSeasonStats.player_id == latest_stats_subq.c.player_id,
                    PlayerSeasonStats.updated_at == latest_stats_subq.c.max_updated_at
                )
            )
            
            # Apply season filter to the join if provided
            if season_id is not None:
                latest_id_subq = latest_id_subq.where(
                    PlayerSeasonStats.season_id == int(season_id)
                )
            
            latest_id_subq = latest_id_subq.group_by(
                PlayerSeasonStats.player_id
            ).subquery()
            
            # Join with actual stats using both player_id and id
            stats_subq = select(
                PlayerSeasonStats.player_id,
                PlayerSeasonStats.points,
                PlayerSeasonStats.games,
                PlayerSeasonStats.wins,
                PlayerSeasonStats.win_rate,
                PlayerSeasonStats.avg_point_diff
            ).join(
                latest_id_subq,
                and_(
                    PlayerSeasonStats.player_id == latest_id_subq.c.player_id,
                    PlayerSeasonStats.id == latest_id_subq.c.max_id
                )
            )
            
            # Apply season filter if provided
            if season_id is not None:
                stats_subq = stats_subq.where(
                    PlayerSeasonStats.season_id == int(season_id)
                )
            
            stats_subq = stats_subq.subquery()
        
        # Main query with COALESCE for defaults
        # Join with PlayerGlobalStats to get current ELO rating (league/season agnostic)
        query = select(
            Player.id.label("player_id"),
            Player.full_name.label("name"),
            Player.avatar.label("avatar"),
            Player.profile_picture_url.label("profile_picture_url"),
            func.coalesce(stats_subq.c.points, 0).label("points"),
            func.coalesce(stats_subq.c.games, 0).label("games"),
            func.coalesce(stats_subq.c.wins, 0).label("wins"),
            func.coalesce(stats_subq.c.win_rate, 0.0).label("win_rate"),
            func.coalesce(stats_subq.c.avg_point_diff, 0.0).label("avg_point_diff"),
            func.coalesce(PlayerGlobalStats.current_rating, INITIAL_ELO).label("current_elo")
        ).select_from(
            Player
        ).outerjoin(
            stats_subq, Player.id == stats_subq.c.player_id
        ).outerjoin(
            PlayerGlobalStats, Player.id == PlayerGlobalStats.player_id
        ).order_by(
            func.coalesce(stats_subq.c.points, 0).desc(),
            Player.full_name.asc()
        )
        
        result = await session.execute(query)
        rows = result.all()
        
        # Build rankings list with all stats
        rankings = [
            {
                "player_id": row.player_id,
                "Name": row.name,
                "avatar": row.avatar if row.avatar else generate_player_initials(row.name),
                "Points": row.points or 0,
                "Games": row.games or 0,
                "Win Rate": row.win_rate or 0.0,
                "Wins": row.wins or 0,
                "Losses": (row.games or 0) - (row.wins or 0),
                "Avg Pt Diff": row.avg_point_diff or 0.0,
                "ELO": round(row.current_elo or 1200)
            }
            for row in rows if row.points > 0 or row.games > 0  # Only return players with stats
        ]
        
        # Sort by different logic depending on whether filtering by season or league
        if league_id is not None and season_id is None:
            # "All Seasons" selected: Wins → Win Rate → Avg Pt Diff → ELO (all descending)
            rankings_sorted = _sort_rankings_all_seasons(rankings)
        else:
            # Single season: Points → Avg Pt Diff → Win Rate → ELO (all descending)
            rankings_sorted = _sort_rankings_single_season(rankings)
        
        # Add season_rank (1-indexed) based on default sorting
        for idx, player in enumerate(rankings_sorted):
            player["season_rank"] = idx + 1
        
        return rankings_sorted
    except Exception:
        # If query fails, return empty list (stats haven't been calculated yet)
        return []


async def get_session_for_routes(session: AsyncSession, session_id: int) -> Optional[Dict]:
    """Get a session by ID - alias for get_session."""
    return await get_session(session, session_id)


async def get_user_leagues_for_routes(session: AsyncSession, user_id: int) -> List[Dict]:
    """Get user leagues - alias for get_user_leagues."""
    return await get_user_leagues(session, user_id)


async def get_matches(session: AsyncSession, limit: Optional[int] = None) -> List[Dict]:
    """Get all matches, optionally limited."""
    # Create aliases for players
    p1 = aliased(Player)
    p2 = aliased(Player)
    p3 = aliased(Player)
    p4 = aliased(Player)
    
    # Build the query with joins
    query = select(
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
        cast(0, Integer).label("team1_elo_change"),
        cast(0, Integer).label("team2_elo_change")
    ).select_from(
        Match
    ).outerjoin(
        Session, Match.session_id == Session.id
    ).outerjoin(
        p1, Match.team1_player1_id == p1.id
    ).outerjoin(
        p2, Match.team1_player2_id == p2.id
    ).outerjoin(
        p3, Match.team2_player1_id == p3.id
    ).outerjoin(
        p4, Match.team2_player2_id == p4.id
    ).order_by(
        func.coalesce(Session.id, 999999).desc(),
        Match.id.desc()
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
            "team1_elo_change": row.team1_elo_change,
            "team2_elo_change": row.team2_elo_change,
        }
        for row in rows
    ]


async def lock_in_session(session: AsyncSession, session_id: int, updated_by: Optional[int] = None) -> Optional[Dict]:
    """
    Lock in a session - sets status to SUBMITTED if ACTIVE, or EDITED if already SUBMITTED/EDITED.
    Also enqueues stats calculations (both global and season-specific).
    
    Returns:
        Dict with success status, season_id, and job IDs, or None if session not found
    """
    # Get current session to check its status and get season_id
    result = await session.execute(
        select(Session).where(Session.id == session_id)
    )
    session_obj = result.scalar_one_or_none()
    
    if not session_obj:
        return None
    
    season_id = session_obj.season_id
    
    # Determine new status: SUBMITTED if currently ACTIVE, EDITED if already SUBMITTED/EDITED
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
    
    # Enqueue both global and league stats calculations
    # Lazy import to avoid circular dependency
    from backend.services.stats_queue import get_stats_queue
    queue = get_stats_queue()
    
    # Enqueue global stats calculation
    global_job_id = await queue.enqueue_calculation(session, "global", None)
    
    # Enqueue league stats calculation if session has a season (get league_id from season)
    league_job_id = None
    if season_id:
        # Get league_id from season
        season_result = await session.execute(
            select(Season).where(Season.id == season_id)
        )
        season_obj = season_result.scalar_one_or_none()
        if season_obj:
            league_job_id = await queue.enqueue_calculation(session, "league", season_obj.league_id)
    
    return {
        "success": True,
        "season_id": season_id,
        "global_job_id": global_job_id,
        "league_job_id": league_job_id
    }


async def update_session(
    session: AsyncSession, 
    session_id: int, 
    name: Optional[str] = None,
    date: Optional[str] = None,
    season_id: Optional[int] = None,
    update_season_id: bool = False
) -> Optional[Dict]:
    """
    Update a session's fields (name, date, season_id).
    
    Args:
        session: Database session
        session_id: ID of session to update
        name: New session name (optional)
        date: New session date (optional)
        season_id: New season_id (optional, can be None to remove season)
        update_season_id: If True, update season_id even if it's None (to allow removing season)
    
    Returns:
        Dict with updated session info, or None if session not found
    
    Raises:
        ValueError: If season_id is provided but season doesn't exist
    """
    # Get current session to verify it exists
    result = await session.execute(
        select(Session).where(Session.id == session_id)
    )
    session_obj = result.scalar_one_or_none()
    
    if not session_obj:
        return None
    
    # Build update values dict (only include fields that are provided)
    update_values = {}
    if name is not None:
        update_values["name"] = name
    if date is not None:
        update_values["date"] = date
    if update_season_id or season_id is not None:
        # Verify season exists if season_id is provided (not None)
        if season_id is not None:
            season_result = await session.execute(
                select(Season).where(Season.id == season_id)
            )
            season_obj = season_result.scalar_one_or_none()
            if not season_obj:
                raise ValueError(f"Season {season_id} not found")
        update_values["season_id"] = season_id
    
    # If no fields to update, return current session
    if not update_values:
        return {
            "id": session_obj.id,
            "season_id": session_obj.season_id,
            "status": session_obj.status.value if session_obj.status else None,
            "name": session_obj.name,
            "date": session_obj.date
        }
    
    # Update the session
    update_values["updated_at"] = func.now()
    await session.execute(
        update(Session)
        .where(Session.id == session_id)
        .values(**update_values)
    )
    await session.commit()
    
    # Return updated session info
    result = await session.execute(
        select(Session).where(Session.id == session_id)
    )
    updated_session = result.scalar_one_or_none()
    
    if not updated_session:
        return None
    
    return {
        "id": updated_session.id,
        "season_id": updated_session.season_id,
        "status": updated_session.status.value if updated_session.status else None,
        "name": updated_session.name,
        "date": updated_session.date
    }


async def delete_session(session: AsyncSession, session_id: int) -> bool:
    """
    Delete an active session and all its matches - async version.
    Only ACTIVE sessions can be deleted.
    
    Returns:
        True if successful, False if session not found or not active
        
    Raises:
        ValueError: If session is not active (already submitted/edited)
    """
    # Check if session exists and is active
    result = await session.execute(
        select(Session).where(Session.id == session_id)
    )
    session_obj = result.scalar_one_or_none()
    
    if not session_obj:
        return False
    
    if session_obj.status != SessionStatus.ACTIVE:
        raise ValueError("Cannot delete a session that has already been submitted")
    
    # Delete matches first (foreign key constraint)
    await session.execute(
        delete(Match).where(Match.session_id == session_id)
    )
    
    # Delete the session
    await session.execute(
        delete(Session).where(Session.id == session_id)
    )
    await session.commit()
    return True


async def update_season(
    session: AsyncSession,
    season_id: int,
    **fields
) -> Optional[Dict]:
    """Update a season - async version."""
    allowed = {"name", "start_date", "end_date", "point_system"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    
    if not updates:
        return await get_season(session, season_id)
    
    # Convert date strings to date objects if needed
    if "start_date" in updates and isinstance(updates["start_date"], str):
        updates["start_date"] = datetime.fromisoformat(updates["start_date"]).date()
    if "end_date" in updates and isinstance(updates["end_date"], str):
        updates["end_date"] = datetime.fromisoformat(updates["end_date"]).date()
    
    await session.execute(
        update(Season)
        .where(Season.id == season_id)
        .values(**updates)
    )
    await session.commit()
    
    return await get_season(session, season_id)


async def get_elo_timeline(session: AsyncSession) -> List[Dict]:
    """Get ELO timeline data for all players - async version."""
    # Get all unique dates
    result = await session.execute(
        select(EloHistory.date).distinct().order_by(EloHistory.date.asc())
    )
    dates = [row[0] for row in result.all()]
    
    if not dates:
        return []
    
    # Get all players
    result = await session.execute(
        select(Player.full_name).order_by(Player.full_name.asc())
    )
    player_names = [row[0] for row in result.all()]
    
    # Build timeline data
    timeline = []
    for date in dates:
        row_data = {"Date": date}
        
        for player_name in player_names:
            # Get the ELO at this date for this player
            result = await session.execute(
                select(EloHistory.elo_after)
                .join(Player, EloHistory.player_id == Player.id)
                .where(
                    and_(
                        Player.full_name == player_name,
                        EloHistory.date <= date
                    )
                )
                .order_by(EloHistory.date.desc(), EloHistory.id.desc())
                .limit(1)
            )
            elo_result = result.scalar_one_or_none()
            
            if elo_result:
                row_data[player_name] = elo_result
            else:
                # Player hasn't played yet at this date, use initial ELO
                row_data[player_name] = INITIAL_ELO
        
        timeline.append(row_data)
    
    return timeline


async def get_setting(session: AsyncSession, key: str) -> Optional[str]:
    """
    Get a setting value - async version.
    
    Args:
        session: Database session
        key: Setting key
        
    Returns:
        Setting value or None if not found
    """
    result = await session.execute(
        select(Setting).where(Setting.key == key)
    )
    setting = result.scalar_one_or_none()
    return setting.value if setting else None


async def set_setting(session: AsyncSession, key: str, value: str) -> None:
    """
    Set a setting value (upsert) - async version.
    
    Args:
        session: Database session
        key: Setting key
        value: Setting value
    """
    stmt = insert(Setting).values(key=key, value=value)
    stmt = stmt.on_conflict_do_update(
        index_elements=['key'],
        set_=dict(value=stmt.excluded.value, updated_at=sql_func.now())
    )
    await session.execute(stmt)
    await session.commit()


async def get_season_matches_with_elo(
    session: AsyncSession,
    season_id: int
) -> List[Dict]:
    """
    Get all matches for a season with ELO changes per player.
    
    Args:
        session: Database session
        season_id: Season ID to filter matches
        
    Returns:
        List of match dictionaries with ELO changes per player
    """
    # Create aliases for players
    p1 = aliased(Player)
    p2 = aliased(Player)
    p3 = aliased(Player)
    p4 = aliased(Player)
    
    # Build the query for matches
    query = select(
        Match.id,
        Match.date,
        Match.session_id,
        Session.name.label("session_name"),
        Session.status.label("session_status"),
        Session.season_id.label("session_season_id"),
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
        Match.winner
    ).select_from(
        Match
    ).outerjoin(
        Session, Match.session_id == Session.id
    ).outerjoin(
        p1, Match.team1_player1_id == p1.id
    ).outerjoin(
        p2, Match.team1_player2_id == p2.id
    ).outerjoin(
        p3, Match.team2_player1_id == p3.id
    ).outerjoin(
        p4, Match.team2_player2_id == p4.id
    ).where(
        Session.season_id == season_id
        # Include all session statuses (SUBMITTED, EDITED, ACTIVE)
        # Active sessions won't have ELO history yet, which is fine - elo_by_match will be empty for them
    ).order_by(
        Match.id.desc()
    )
    
    # Execute query
    result = await session.execute(query)
    match_rows = result.all()
    
    # Get all match IDs
    match_ids = [row.id for row in match_rows]
    
    # Query ELO history for all matches
    elo_history_query = select(
        EloHistory.match_id,
        EloHistory.player_id,
        EloHistory.elo_after,
        EloHistory.elo_change
    ).where(
        EloHistory.match_id.in_(match_ids)
    )
    
    elo_result = await session.execute(elo_history_query)
    elo_rows = elo_result.all()
    
    # Group ELO changes by match_id
    elo_by_match = {}
    for elo_row in elo_rows:
        match_id = elo_row.match_id
        if match_id not in elo_by_match:
            elo_by_match[match_id] = {}
        # Calculate elo_before from elo_after - elo_change
        elo_before = elo_row.elo_after - elo_row.elo_change
        elo_by_match[match_id][elo_row.player_id] = {
            "elo_before": round(elo_before, 1),
            "elo_after": round(elo_row.elo_after, 1),
            "elo_change": round(elo_row.elo_change, 1)
        }
    
    # Build result list
    matches = []
    for row in match_rows:
        match_data = {
            "id": row.id,
            "date": row.date,
            "session_id": row.session_id,
            "session_name": row.session_name,
            "session_status": row.session_status.value if row.session_status else None,
            "session_season_id": row.session_season_id,
            "team1_player1_id": row.team1_player1_id,
            "team1_player1_name": row.team1_player1_name,
            "team1_player2_id": row.team1_player2_id,
            "team1_player2_name": row.team1_player2_name,
            "team2_player1_id": row.team2_player1_id,
            "team2_player1_name": row.team2_player1_name,
            "team2_player2_id": row.team2_player2_id,
            "team2_player2_name": row.team2_player2_name,
            "team1_score": row.team1_score,
            "team2_score": row.team2_score,
            "winner": row.winner,
            "elo_changes": elo_by_match.get(row.id, {})
        }
        matches.append(match_data)
    
    return matches


async def get_league_matches_with_elo(
    session: AsyncSession,
    league_id: int
) -> List[Dict]:
    """
    Get all matches for a league (across all seasons) with ELO changes per player.
    
    Args:
        session: Database session
        league_id: League ID to filter matches
        
    Returns:
        List of match dictionaries with ELO changes per player
    """
    # Create aliases for players
    p1 = aliased(Player)
    p2 = aliased(Player)
    p3 = aliased(Player)
    p4 = aliased(Player)
    
    # Build the query for matches - filter by league through Season
    query = select(
        Match.id,
        Match.date,
        Match.session_id,
        Session.name.label("session_name"),
        Session.status.label("session_status"),
        Session.season_id.label("session_season_id"),
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
        Match.winner
    ).select_from(
        Match
    ).outerjoin(
        Session, Match.session_id == Session.id
    ).outerjoin(
        Season, Session.season_id == Season.id
    ).outerjoin(
        p1, Match.team1_player1_id == p1.id
    ).outerjoin(
        p2, Match.team1_player2_id == p2.id
    ).outerjoin(
        p3, Match.team2_player1_id == p3.id
    ).outerjoin(
        p4, Match.team2_player2_id == p4.id
    ).where(
        Season.league_id == league_id
        # Include all session statuses (SUBMITTED, EDITED, ACTIVE)
    ).order_by(
        Match.id.desc()
    )
    
    # Execute query
    result = await session.execute(query)
    match_rows = result.all()
    
    # Get all match IDs
    match_ids = [row.id for row in match_rows]
    
    # Query ELO history for all matches
    elo_history_query = select(
        EloHistory.match_id,
        EloHistory.player_id,
        EloHistory.elo_after,
        EloHistory.elo_change
    ).where(
        EloHistory.match_id.in_(match_ids)
    )
    
    elo_result = await session.execute(elo_history_query)
    elo_rows = elo_result.all()
    
    # Group ELO changes by match_id
    elo_by_match = {}
    for elo_row in elo_rows:
        match_id = elo_row.match_id
        if match_id not in elo_by_match:
            elo_by_match[match_id] = {}
        # Calculate elo_before from elo_after - elo_change
        elo_before = elo_row.elo_after - elo_row.elo_change
        elo_by_match[match_id][elo_row.player_id] = {
            "elo_before": round(elo_before, 1),
            "elo_after": round(elo_row.elo_after, 1),
            "elo_change": round(elo_row.elo_change, 1)
        }
    
    # Build result list
    matches = []
    for row in match_rows:
        match_data = {
            "id": row.id,
            "date": row.date,
            "session_id": row.session_id,
            "session_name": row.session_name,
            "session_status": row.session_status.value if row.session_status else None,
            "session_season_id": row.session_season_id,
            "team1_player1_id": row.team1_player1_id,
            "team1_player1_name": row.team1_player1_name,
            "team1_player2_id": row.team1_player2_id,
            "team1_player2_name": row.team1_player2_name,
            "team2_player1_id": row.team2_player1_id,
            "team2_player1_name": row.team2_player1_name,
            "team2_player2_id": row.team2_player2_id,
            "team2_player2_name": row.team2_player2_name,
            "team1_score": row.team1_score,
            "team2_score": row.team2_score,
            "winner": row.winner,
            "elo_changes": elo_by_match.get(row.id, {})
        }
        matches.append(match_data)
    
    return matches


async def query_matches(
    session: AsyncSession,
    body: Dict,
    user: Optional[Dict] = None
) -> List[Dict]:
    """
    Query matches with filtering - async version.
    
    Args:
        session: Database session
        body: Query parameters dict with:
            - limit: int (default 50, max 500)
            - offset: int (default 0)
            - league_id: Optional[int] - filter by league
            - season_id: Optional[int] - filter by season
            - submitted_only: bool (default True) - only show matches from submitted sessions
            - include_non_public: bool (default False) - include non-public matches
            - sort_by: str (default 'id') - 'date' or 'id'
            - sort_dir: str (default 'desc') - 'asc' or 'desc'
        user: Optional user dict for permission checks
    
    Returns:
        List of match dictionaries
    """
    limit = min(max(int(body.get("limit", 50)), 1), 500)
    offset = max(int(body.get("offset", 0)), 0)
    submitted_only = body.get("submitted_only", True)
    include_non_public = body.get("include_non_public", False)
    league_id = body.get("league_id")
    season_id = body.get("season_id")
    sort_by = body.get("sort_by", "id")
    sort_dir = body.get("sort_dir", "desc")
    
    # Validate sort_by and sort_dir
    if sort_by not in ["id", "date"]:
        sort_by = "id"
    if sort_dir not in ["asc", "desc"]:
        sort_dir = "desc"
    
    # Create aliases for players
    p1 = aliased(Player)
    p2 = aliased(Player)
    p3 = aliased(Player)
    p4 = aliased(Player)
    creator = aliased(Player)
    updater = aliased(Player)
    
    # Build the query with joins
    query = select(
        Match.id,
        Match.date,
        Match.session_id,
        Session.name.label("session_name"),
        Session.status.label("session_status"),
        Session.created_at.label("session_created_at"),
        Session.updated_at.label("session_updated_at"),
        Session.created_by.label("session_created_by"),
        Session.updated_by.label("session_updated_by"),
        p1.full_name.label("team1_player1_name"),
        p2.full_name.label("team1_player2_name"),
        p3.full_name.label("team2_player1_name"),
        p4.full_name.label("team2_player2_name"),
        creator.full_name.label("session_created_by_name"),
        updater.full_name.label("session_updated_by_name"),
        Match.team1_score,
        Match.team2_score,
        Match.winner,
        Match.is_public,
        cast(0, Integer).label("team1_elo_change"),
        cast(0, Integer).label("team2_elo_change")
    ).select_from(
        Match
    ).outerjoin(
        Session, Match.session_id == Session.id
    ).outerjoin(
        Season, Session.season_id == Season.id
    ).outerjoin(
        p1, Match.team1_player1_id == p1.id
    ).outerjoin(
        p2, Match.team1_player2_id == p2.id
    ).outerjoin(
        p3, Match.team2_player1_id == p3.id
    ).outerjoin(
        p4, Match.team2_player2_id == p4.id
    ).outerjoin(
        creator, Session.created_by == creator.id
    ).outerjoin(
        updater, Session.updated_by == updater.id
    )
    
    # Build WHERE conditions
    conditions = []
    
    if submitted_only:
        # Only show matches from submitted/edited sessions, or matches without sessions
        conditions.append(
            or_(
                Match.session_id.is_(None),
                Session.status.in_([SessionStatus.SUBMITTED, SessionStatus.EDITED])
            )
        )
    # If submitted_only is False, we include all matches (no filter)
    
    if not include_non_public:
        conditions.append(Match.is_public == True)
    
    # Filter by league_id (through sessions -> seasons)
    # Only include matches that have a session with a season in the specified league
    if league_id is not None:
        conditions.append(
            and_(
                Session.season_id.isnot(None),
                Season.league_id == int(league_id)
            )
        )
    
    # Filter by season_id
    if season_id is not None:
        conditions.append(Session.season_id == int(season_id))
    
    # Apply WHERE conditions
    if conditions:
        query = query.where(and_(*conditions))
    
    # Apply ORDER BY
    if sort_by == "date":
        order_column = Match.date
    else:
        order_column = Match.id
    
    if sort_dir.lower() == "asc":
        query = query.order_by(order_column.asc())
    else:
        query = query.order_by(order_column.desc())
    
    # Apply limit and offset
    query = query.limit(limit).offset(offset)
    
    # Execute query
    result = await session.execute(query)
    rows = result.all()
    
    # Convert to dict format matching the old API
    return [
        {
            "id": row.id,
            "date": row.date,
            "session_id": row.session_id,
            "session_name": row.session_name,
            "session_status": row.session_status.value if row.session_status else None,
            "session_created_at": row.session_created_at.isoformat() if row.session_created_at else None,
            "session_updated_at": row.session_updated_at.isoformat() if row.session_updated_at else None,
            "session_created_by": row.session_created_by,
            "session_updated_by": row.session_updated_by,
            "session_created_by_name": row.session_created_by_name,
            "session_updated_by_name": row.session_updated_by_name,
            "team1_player1_name": row.team1_player1_name,
            "team1_player2_name": row.team1_player2_name,
            "team2_player1_name": row.team2_player1_name,
            "team2_player2_name": row.team2_player2_name,
            "team1_score": row.team1_score,
            "team2_score": row.team2_score,
            "winner": row.winner,
            "is_public": row.is_public,
            "team1_elo_change": row.team1_elo_change,
            "team2_elo_change": row.team2_elo_change,
        }
        for row in rows
    ]


async def get_player_stats_by_id(session: AsyncSession, player_id: int) -> Optional[Dict]:
    """
    Get detailed stats for a player by ID including partnerships and opponents - async version.
    
    Returns dict with structure:
    {
        "name": str,
        "current_elo": float,
        "games": int,
        "wins": int,
        "losses": int,
        "win_rate": float,
        "points": int,
        "avg_point_diff": float,
        "rank": int,
        "partnerships": [...],
        "opponents": [...],
        "match_history": [...]
    }
    """
    # Get player basic stats
    result = await session.execute(
        select(Player).where(Player.id == player_id)
    )
    player = result.scalar_one_or_none()
    
    if not player:
        return None
    
    player_name = player.full_name or player.nickname or f"Player {player_id}"
    
    # Get global ELO rating (league/season agnostic)
    result = await session.execute(
        select(PlayerGlobalStats)
        .where(PlayerGlobalStats.player_id == player.id)
    )
    global_stats = result.scalar_one_or_none()
    current_elo = global_stats.current_rating if global_stats else INITIAL_ELO
    
    # Get latest season stats for games, wins, points, etc. (season-specific)
    games = 0
    wins = 0
    points = 0
    win_rate = 0.0
    avg_point_diff = 0.0
    
    # Try to get from player_season_stats (latest)
    result = await session.execute(
        select(PlayerSeasonStats)
        .where(PlayerSeasonStats.player_id == player.id)
        .order_by(PlayerSeasonStats.updated_at.desc())
        .limit(1)
    )
    season_stats = result.scalar_one_or_none()
    if season_stats:
        games = season_stats.games
        wins = season_stats.wins
        points = season_stats.points
        win_rate = season_stats.win_rate
        avg_point_diff = season_stats.avg_point_diff
    
    # Get partnerships
    PartnerPlayer = aliased(Player)
    
    result = await session.execute(
        select(PartnershipStats, PartnerPlayer.full_name.label("partner_name"))
        .join(PartnerPlayer, PartnershipStats.partner_id == PartnerPlayer.id)
        .where(PartnershipStats.player_id == player_id)
        .order_by(PartnershipStats.points.desc(), PartnershipStats.win_rate.desc())
    )
    partnerships = []
    for row in result.all():
        partnership, partner_name = row
        partnerships.append({
            "Partner/Opponent": partner_name,
            "Points": partnership.points,
            "Games": partnership.games,
            "Wins": partnership.wins,
            "Losses": partnership.games - partnership.wins,
            "Win Rate": partnership.win_rate,
            "Avg Pt Diff": partnership.avg_point_diff
        })
    
    # Get opponents
    OpponentPlayer = aliased(Player)
    
    result = await session.execute(
        select(OpponentStats, OpponentPlayer.full_name.label("opponent_name"))
        .join(OpponentPlayer, OpponentStats.opponent_id == OpponentPlayer.id)
        .where(OpponentStats.player_id == player_id)
        .order_by(OpponentStats.points.desc(), OpponentStats.win_rate.desc())
    )
    opponents = []
    for row in result.all():
        opponent_stat, opponent_name = row
        opponents.append({
            "Partner/Opponent": opponent_name,
            "Points": opponent_stat.points,
            "Games": opponent_stat.games,
            "Wins": opponent_stat.wins,
            "Losses": opponent_stat.games - opponent_stat.wins,
            "Win Rate": opponent_stat.win_rate,
            "Avg Pt Diff": opponent_stat.avg_point_diff
        })
    
    # Get match history (simplified - would need to join with players table)
    # For now, return empty list - this can be enhanced later
    match_history = []
    
    # Calculate rank (simplified - would need full rankings)
    rank = None
    
    return {
        "name": player_name,
        "current_elo": round(current_elo),
        "games": games,
        "wins": wins,
        "losses": games - wins,
        "win_rate": win_rate,
        "points": points,
        "avg_point_diff": avg_point_diff,
        "rank": rank,
        "partnerships": partnerships,
        "opponents": opponents,
        "match_history": match_history
    }


async def get_player_season_partnership_opponent_stats(
    session: AsyncSession,
    player_id: int,
    season_id: int
) -> Dict:
    """
    Get partnership and opponent stats for a player in a season.
    
    Args:
        session: Database session
        player_id: Player ID
        season_id: Season ID
        
    Returns:
        Dict with 'partnerships' and 'opponents' lists
    """
    # Get partnerships
    PartnerPlayer = aliased(Player)
    
    result = await session.execute(
        select(
            PartnershipStatsSeason,
            PartnerPlayer.full_name.label("partner_name")
        )
        .join(PartnerPlayer, PartnershipStatsSeason.partner_id == PartnerPlayer.id)
        .where(
            and_(
                PartnershipStatsSeason.player_id == player_id,
                PartnershipStatsSeason.season_id == season_id
            )
        )
        .order_by(PartnershipStatsSeason.points.desc(), PartnershipStatsSeason.win_rate.desc())
    )
    
    partnerships = []
    for row in result.all():
        partnership, partner_name = row
        partnerships.append({
            "Partner/Opponent": partner_name,
            "Points": partnership.points,
            "Games": partnership.games,
            "Wins": partnership.wins,
            "Losses": partnership.games - partnership.wins,
            "Win Rate": partnership.win_rate,
            "Avg Pt Diff": partnership.avg_point_diff
        })
    
    # Get opponents
    OpponentPlayer = aliased(Player)
    
    result = await session.execute(
        select(
            OpponentStatsSeason,
            OpponentPlayer.full_name.label("opponent_name")
        )
        .join(OpponentPlayer, OpponentStatsSeason.opponent_id == OpponentPlayer.id)
        .where(
            and_(
                OpponentStatsSeason.player_id == player_id,
                OpponentStatsSeason.season_id == season_id
            )
        )
        .order_by(OpponentStatsSeason.points.desc(), OpponentStatsSeason.win_rate.desc())
    )
    
    opponents = []
    for row in result.all():
        opponent_stat, opponent_name = row
        opponents.append({
            "Partner/Opponent": opponent_name,
            "Points": opponent_stat.points,
            "Games": opponent_stat.games,
            "Wins": opponent_stat.wins,
            "Losses": opponent_stat.games - opponent_stat.wins,
            "Win Rate": opponent_stat.win_rate,
            "Avg Pt Diff": opponent_stat.avg_point_diff
        })
    
    return {
        "partnerships": partnerships,
        "opponents": opponents
    }


async def get_all_player_season_stats(
    session: AsyncSession,
    season_id: int
) -> Dict[int, Dict]:
    """
    Get all player season stats for a specific season.
    
    Args:
        session: Database session
        season_id: Season ID
        
    Returns:
        Dict mapping player_id to season stats
    """
    # Get all player season stats for this season
    result = await session.execute(
        select(
            PlayerSeasonStats,
            Player.full_name.label("player_name")
        )
        .join(Player, PlayerSeasonStats.player_id == Player.id)
        .where(PlayerSeasonStats.season_id == season_id)
    )
    rows = result.all()
    
    # Get rankings to calculate rank
    rankings = await get_rankings(session, {"season_id": season_id})
    
    # Create a map of player_id to rank
    player_rank_map = {}
    for idx, ranking in enumerate(rankings):
        if "player_id" in ranking:
            player_rank_map[ranking["player_id"]] = idx + 1
    
    # Get global ELO ratings for all players (league/season agnostic)
    player_ids = [row[0].player_id for row in rows]
    global_elo_map = {}
    if player_ids:
        result = await session.execute(
            select(PlayerGlobalStats)
            .where(PlayerGlobalStats.player_id.in_(player_ids))
        )
        for global_stat in result.scalars().all():
            global_elo_map[global_stat.player_id] = global_stat.current_rating
    
    # Build result dict
    player_stats = {}
    for row in rows:
        season_stats, player_name = row
        # Use global ELO rating (league/season agnostic)
        current_elo = global_elo_map.get(season_stats.player_id, INITIAL_ELO)
        player_stats[season_stats.player_id] = {
            "player_id": season_stats.player_id,
            "player_name": player_name,
            "season_id": season_id,
            "current_elo": round(current_elo),
            "games": season_stats.games,
            "wins": season_stats.wins,
            "losses": season_stats.games - season_stats.wins,
            "win_rate": season_stats.win_rate,
            "points": season_stats.points,
            "avg_point_diff": season_stats.avg_point_diff,
            "rank": player_rank_map.get(season_stats.player_id)
        }
    
    return player_stats


async def get_all_player_season_partnership_opponent_stats(
    session: AsyncSession,
    season_id: int
) -> Dict[int, Dict]:
    """
    Get all partnership and opponent stats for all players in a season.
    
    Args:
        session: Database session
        season_id: Season ID
        
    Returns:
        Dict mapping player_id to dict with 'partnerships' and 'opponents' lists
    """
    # Get all partnerships for this season
    PartnerPlayer = aliased(Player)
    
    partnership_result = await session.execute(
        select(
            PartnershipStatsSeason,
            PartnerPlayer.full_name.label("partner_name")
        )
        .join(PartnerPlayer, PartnershipStatsSeason.partner_id == PartnerPlayer.id)
        .where(PartnershipStatsSeason.season_id == season_id)
        .order_by(PartnershipStatsSeason.points.desc(), PartnershipStatsSeason.win_rate.desc())
    )
    
    # Group partnerships by player_id
    partnerships_by_player = {}
    for row in partnership_result.all():
        partnership, partner_name = row
        player_id = partnership.player_id
        
        if player_id not in partnerships_by_player:
            partnerships_by_player[player_id] = []
        
        partnerships_by_player[player_id].append({
            "Partner/Opponent": partner_name,
            "Points": partnership.points,
            "Games": partnership.games,
            "Wins": partnership.wins,
            "Losses": partnership.games - partnership.wins,
            "Win Rate": partnership.win_rate,
            "Avg Pt Diff": partnership.avg_point_diff
        })
    
    # Get all opponents for this season
    OpponentPlayer = aliased(Player)
    
    opponent_result = await session.execute(
        select(
            OpponentStatsSeason,
            OpponentPlayer.full_name.label("opponent_name")
        )
        .join(OpponentPlayer, OpponentStatsSeason.opponent_id == OpponentPlayer.id)
        .where(OpponentStatsSeason.season_id == season_id)
        .order_by(OpponentStatsSeason.points.desc(), OpponentStatsSeason.win_rate.desc())
    )
    
    # Group opponents by player_id
    opponents_by_player = {}
    for row in opponent_result.all():
        opponent_stat, opponent_name = row
        player_id = opponent_stat.player_id
        
        if player_id not in opponents_by_player:
            opponents_by_player[player_id] = []
        
        opponents_by_player[player_id].append({
            "Partner/Opponent": opponent_name,
            "Points": opponent_stat.points,
            "Games": opponent_stat.games,
            "Wins": opponent_stat.wins,
            "Losses": opponent_stat.games - opponent_stat.wins,
            "Win Rate": opponent_stat.win_rate,
            "Avg Pt Diff": opponent_stat.avg_point_diff
        })
    
    # Combine into result dict
    result = {}
    all_player_ids = set(list(partnerships_by_player.keys()) + list(opponents_by_player.keys()))
    
    for player_id in all_player_ids:
        result[player_id] = {
            "partnerships": partnerships_by_player.get(player_id, []),
            "opponents": opponents_by_player.get(player_id, [])
        }
    
    return result


async def get_player_season_stats(
    session: AsyncSession, 
    player_id: int, 
    season_id: int
) -> Optional[Dict]:
    """
    Get player stats for a specific season - async version.
    
    Returns dict with structure:
    {
        "player_id": int,
        "player_name": str,
        "season_id": int,
        "current_elo": float,
        "games": int,
        "wins": int,
        "losses": int,
        "win_rate": float,
        "points": int,
        "avg_point_diff": float,
        "rank": int (optional)
    }
    """
    # Get player
    result = await session.execute(
        select(Player).where(Player.id == player_id)
    )
    player = result.scalar_one_or_none()
    
    if not player:
        return None
    
    # Get season stats
    result = await session.execute(
        select(PlayerSeasonStats)
        .where(
            and_(
                PlayerSeasonStats.player_id == player_id,
                PlayerSeasonStats.season_id == season_id
            )
        )
        .order_by(PlayerSeasonStats.updated_at.desc())
        .limit(1)
    )
    season_stats = result.scalar_one_or_none()
    
    if not season_stats:
        # Return default values if no stats found
        return {
            "player_id": player_id,
            "player_name": player.full_name,
            "season_id": season_id,
            "current_elo": INITIAL_ELO,
            "games": 0,
            "wins": 0,
            "losses": 0,
            "win_rate": 0.0,
            "points": 0,
            "avg_point_diff": 0.0,
            "rank": None
        }
    
    # Calculate rank by getting position in rankings for this season
    rankings = await get_rankings(session, {"season_id": season_id})
    rank = None
    for idx, ranking in enumerate(rankings):
        if ranking.get("player_id") == player_id:
            rank = idx + 1
            break
    
    # Get global ELO rating (league/season agnostic)
    result = await session.execute(
        select(PlayerGlobalStats).where(PlayerGlobalStats.player_id == player_id)
    )
    global_stat = result.scalar_one_or_none()
    current_elo = global_stat.current_rating if global_stat else INITIAL_ELO
    
    return {
        "player_id": player_id,
        "player_name": player.full_name,
        "season_id": season_id,
        "current_elo": round(current_elo),
        "games": season_stats.games,
        "wins": season_stats.wins,
        "losses": season_stats.games - season_stats.wins,
        "win_rate": season_stats.win_rate,
        "points": season_stats.points,
        "avg_point_diff": season_stats.avg_point_diff,
        "rank": rank
    }


async def get_player_league_stats(
    session: AsyncSession, 
    player_id: int, 
    league_id: int
) -> Optional[Dict]:
    """
    Get player stats for a specific league - async version.
    
    Returns dict with structure:
    {
        "player_id": int,
        "player_name": str,
        "league_id": int,
        "current_elo": float,
        "games": int,
        "wins": int,
        "losses": int,
        "win_rate": float,
        "points": int,
        "avg_point_diff": float,
        "rank": int (optional)
    }
    """
    # Get player
    result = await session.execute(
        select(Player).where(Player.id == player_id)
    )
    player = result.scalar_one_or_none()
    
    if not player:
        return None
    
    # Get league stats
    result = await session.execute(
        select(PlayerLeagueStats)
        .where(
            and_(
                PlayerLeagueStats.player_id == player_id,
                PlayerLeagueStats.league_id == league_id
            )
        )
        .order_by(PlayerLeagueStats.updated_at.desc())
        .limit(1)
    )
    league_stats = result.scalar_one_or_none()
    
    if not league_stats:
        # Return default values if no stats found
        return {
            "player_id": player_id,
            "player_name": player.full_name,
            "league_id": league_id,
            "current_elo": INITIAL_ELO,
            "games": 0,
            "wins": 0,
            "losses": 0,
            "win_rate": 0.0,
            "points": 0,
            "avg_point_diff": 0.0,
            "rank": None
        }
    
    # Get global ELO rating (league/season agnostic)
    result = await session.execute(
        select(PlayerGlobalStats).where(PlayerGlobalStats.player_id == player_id)
    )
    global_stat = result.scalar_one_or_none()
    current_elo = global_stat.current_rating if global_stat else INITIAL_ELO
    
    # Calculate rank by getting position in rankings for this league
    rankings = await get_rankings(session, {"league_id": league_id})
    rank = None
    for idx, ranking in enumerate(rankings):
        if ranking.get("player_id") == player_id:
            rank = idx + 1
            break
    
    return {
        "player_id": player_id,
        "player_name": player.full_name,
        "league_id": league_id,
        "current_elo": round(current_elo),
        "games": league_stats.games,
        "wins": league_stats.wins,
        "losses": league_stats.games - league_stats.wins,
        "win_rate": league_stats.win_rate,
        "points": league_stats.points,
        "avg_point_diff": league_stats.avg_point_diff,
        "rank": rank
    }


async def get_all_player_league_stats(
    session: AsyncSession,
    league_id: int
) -> Dict[int, Dict]:
    """
    Get all player league stats for a specific league.
    
    Args:
        session: Database session
        league_id: League ID
        
    Returns:
        Dict mapping player_id to league stats
    """
    # Get all player league stats for this league
    result = await session.execute(
        select(
            PlayerLeagueStats,
            Player.full_name.label("player_name")
        )
        .join(Player, PlayerLeagueStats.player_id == Player.id)
        .where(PlayerLeagueStats.league_id == league_id)
    )
    rows = result.all()
    
    # Get rankings to calculate rank
    rankings = await get_rankings(session, {"league_id": league_id})
    
    # Create a map of player_id to rank
    player_rank_map = {}
    for idx, ranking in enumerate(rankings):
        if "player_id" in ranking:
            player_rank_map[ranking["player_id"]] = idx + 1
    
    # Get global ELO ratings for all players (league/season agnostic)
    player_ids = [row[0].player_id for row in rows]
    global_elo_map = {}
    if player_ids:
        result = await session.execute(
            select(PlayerGlobalStats)
            .where(PlayerGlobalStats.player_id.in_(player_ids))
        )
        for global_stat in result.scalars().all():
            global_elo_map[global_stat.player_id] = global_stat.current_rating
    
    # Build result dict
    player_stats = {}
    for row in rows:
        league_stats, player_name = row
        # Use global ELO rating (league/season agnostic)
        current_elo = global_elo_map.get(league_stats.player_id, INITIAL_ELO)
        player_stats[league_stats.player_id] = {
            "player_id": league_stats.player_id,
            "player_name": player_name,
            "league_id": league_id,
            "current_elo": round(current_elo),
            "games": league_stats.games,
            "wins": league_stats.wins,
            "losses": league_stats.games - league_stats.wins,
            "win_rate": league_stats.win_rate,
            "points": league_stats.points,
            "avg_point_diff": league_stats.avg_point_diff,
            "rank": player_rank_map.get(league_stats.player_id)
        }
    
    return player_stats


async def get_player_league_partnership_opponent_stats(
    session: AsyncSession,
    player_id: int,
    league_id: int
) -> Dict:
    """
    Get partnership and opponent stats for a player in a league.
    
    Args:
        session: Database session
        player_id: Player ID
        league_id: League ID
        
    Returns:
        Dict with partnership_stats and opponent_stats
    """
    # Get partnership stats
    result = await session.execute(
        select(PartnershipStatsLeague)
        .where(PartnershipStatsLeague.player_id == player_id)
        .where(PartnershipStatsLeague.league_id == league_id)
    )
    partnership_rows = result.scalars().all()
    
    # Get opponent stats
    result = await session.execute(
        select(OpponentStatsLeague)
        .where(OpponentStatsLeague.player_id == player_id)
        .where(OpponentStatsLeague.league_id == league_id)
    )
    opponent_rows = result.scalars().all()
    
    # Get player names for partnerships
    partner_ids = [ps.partner_id for ps in partnership_rows]
    opponent_ids = [os.opponent_id for os in opponent_rows]
    all_player_ids = list(set(partner_ids + opponent_ids))
    
    player_name_map = {}
    if all_player_ids:
        result = await session.execute(
            select(Player).where(Player.id.in_(all_player_ids))
        )
        for player in result.scalars().all():
            player_name_map[player.id] = player.full_name
    
    partnership_stats = []
    for ps in partnership_rows:
        partnership_stats.append({
            "partner_id": ps.partner_id,
            "partner_name": player_name_map.get(ps.partner_id, f"Player {ps.partner_id}"),
            "games": ps.games,
            "wins": ps.wins,
            "points": ps.points,
            "win_rate": ps.win_rate,
            "avg_point_diff": ps.avg_point_diff
        })
    
    opponent_stats = []
    for os in opponent_rows:
        opponent_stats.append({
            "opponent_id": os.opponent_id,
            "opponent_name": player_name_map.get(os.opponent_id, f"Player {os.opponent_id}"),
            "games": os.games,
            "wins": os.wins,
            "points": os.points,
            "win_rate": os.win_rate,
            "avg_point_diff": os.avg_point_diff
        })
    
    return {
        "partnership_stats": partnership_stats,
        "opponent_stats": opponent_stats
    }


async def get_all_player_league_partnership_opponent_stats(
    session: AsyncSession,
    league_id: int
) -> Dict[int, Dict]:
    """
    Get all partnership and opponent stats for all players in a league.
    
    Args:
        session: Database session
        league_id: League ID
        
    Returns:
        Dict mapping player_id to partnership and opponent stats
    """
    # Get all partnership stats for this league
    result = await session.execute(
        select(PartnershipStatsLeague)
        .where(PartnershipStatsLeague.league_id == league_id)
    )
    partnership_rows = result.scalars().all()
    
    # Get all opponent stats for this league
    result = await session.execute(
        select(OpponentStatsLeague)
        .where(OpponentStatsLeague.league_id == league_id)
    )
    opponent_rows = result.scalars().all()
    
    # Get all player IDs and names
    player_ids = set()
    for ps in partnership_rows:
        player_ids.add(ps.player_id)
        player_ids.add(ps.partner_id)
    for os in opponent_rows:
        player_ids.add(os.player_id)
        player_ids.add(os.opponent_id)
    
    player_name_map = {}
    if player_ids:
        result = await session.execute(
            select(Player).where(Player.id.in_(player_ids))
        )
        for player in result.scalars().all():
            player_name_map[player.id] = player.full_name
    
    # Group by player_id - match format of season stats
    result_dict = {}
    
    for ps in partnership_rows:
        if ps.player_id not in result_dict:
            result_dict[ps.player_id] = {"partnerships": [], "opponents": []}
        result_dict[ps.player_id]["partnerships"].append({
            "Partner/Opponent": player_name_map.get(ps.partner_id, f"Player {ps.partner_id}"),
            "Points": ps.points,
            "Games": ps.games,
            "Wins": ps.wins,
            "Losses": ps.games - ps.wins,
            "Win Rate": ps.win_rate,
            "Avg Pt Diff": ps.avg_point_diff
        })
    
    for os in opponent_rows:
        if os.player_id not in result_dict:
            result_dict[os.player_id] = {"partnerships": [], "opponents": []}
        result_dict[os.player_id]["opponents"].append({
            "Partner/Opponent": player_name_map.get(os.opponent_id, f"Player {os.opponent_id}"),
            "Points": os.points,
            "Games": os.games,
            "Wins": os.wins,
            "Losses": os.games - os.wins,
            "Win Rate": os.win_rate,
            "Avg Pt Diff": os.avg_point_diff
        })
    
    return result_dict


async def export_matches_to_csv(session: AsyncSession) -> str:
    """
    Export all matches (locked-in sessions only) to CSV format matching Google Sheets import format.
    
    Format: DATE, T1P1, T1P2, T2P1, T2P2, T1SCORE, T2SCORE
    
    Args:
        session: Database session
    
    Returns:
        str: CSV formatted string with header and all matches
    """
    # Create aliases for players
    p1 = aliased(Player)
    p2 = aliased(Player)
    p3 = aliased(Player)
    p4 = aliased(Player)
    
    # Build query for matches from submitted sessions or without sessions
    query = select(
        Match.date,
        p1.full_name.label("team1_player1_name"),
        p2.full_name.label("team1_player2_name"),
        p3.full_name.label("team2_player1_name"),
        p4.full_name.label("team2_player2_name"),
        Match.team1_score,
        Match.team2_score
    ).select_from(
        Match
    ).outerjoin(
        Session, Match.session_id == Session.id
    ).outerjoin(
        p1, Match.team1_player1_id == p1.id
    ).outerjoin(
        p2, Match.team1_player2_id == p2.id
    ).outerjoin(
        p3, Match.team2_player1_id == p3.id
    ).outerjoin(
        p4, Match.team2_player2_id == p4.id
    ).where(
        or_(
            Session.status.in_([SessionStatus.SUBMITTED, SessionStatus.EDITED]),
            Match.session_id.is_(None)
        )
    ).order_by(
        Match.id.asc()
    )
    
    result = await session.execute(query)
    matches = result.all()
    
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header matching Google Sheets format
    writer.writerow(['Date', 'Team 1', '', 'Team 2', '', 'Team 1 Score', 'Team 2 Score'])
    
    # Write match data
    for match in matches:
        writer.writerow([
            match.date,
            match.team1_player1_name,
            match.team1_player2_name,
            match.team2_player1_name,
            match.team2_player2_name,
            match.team1_score,
            match.team2_score
        ])
    
    return output.getvalue()


async def get_player_match_history_by_id(session: AsyncSession, player_id: int) -> Optional[List[Dict]]:
    """
    Get match history for a specific player by ID - async version.
    
    Args:
        session: Database session
        player_id: ID of the player
    
    Returns:
        List of matches if player found (may be empty)
        None if player not found
    """
    # Verify player exists
    result = await session.execute(
        select(Player.id).where(Player.id == player_id)
    )
    if not result.scalar_one_or_none():
        return None  # Player not found
    
    # Create aliases for players
    p1 = aliased(Player)
    p2 = aliased(Player)
    p3 = aliased(Player)
    p4 = aliased(Player)
    eh = aliased(EloHistory)
    
    # Get all matches where player participated
    query = select(
        Match.id,
        Match.date,
        Match.session_id,
        Match.team1_player1_id,
        Match.team1_player2_id,
        Match.team2_player1_id,
        Match.team2_player2_id,
        Match.team1_score,
        Match.team2_score,
        Match.winner,
        cast(0, Integer).label("team1_elo_change"),  # Note: ELO changes not stored in matches table
        cast(0, Integer).label("team2_elo_change"),
        p1.full_name.label("team1_player1_name"),
        p2.full_name.label("team1_player2_name"),
        p3.full_name.label("team2_player1_name"),
        p4.full_name.label("team2_player2_name"),
        eh.elo_after,
        Session.status.label("session_status")
    ).select_from(
        Match
    ).outerjoin(
        p1, Match.team1_player1_id == p1.id
    ).outerjoin(
        p2, Match.team1_player2_id == p2.id
    ).outerjoin(
        p3, Match.team2_player1_id == p3.id
    ).outerjoin(
        p4, Match.team2_player2_id == p4.id
    ).outerjoin(
        eh, and_(eh.match_id == Match.id, eh.player_id == player_id)
    ).outerjoin(
        Session, Match.session_id == Session.id
    ).where(
        or_(
            Match.team1_player1_id == player_id,
            Match.team1_player2_id == player_id,
            Match.team2_player1_id == player_id,
            Match.team2_player2_id == player_id
        )
    ).order_by(
        Match.id.desc()
    )
    
    result = await session.execute(query)
    rows = result.all()
    
    results = []
    for row in rows:
        # Determine which team the player was on
        if row.team1_player1_id == player_id or row.team1_player2_id == player_id:
            # Player on team 1
            partner = row.team1_player2_name if row.team1_player1_id == player_id else row.team1_player1_name
            opponent1 = row.team2_player1_name
            opponent2 = row.team2_player2_name
            player_score = row.team1_score
            opponent_score = row.team2_score
            elo_change = row.team1_elo_change or 0
            
            if row.winner == 1:
                match_result = "W"
            elif row.winner == -1:
                match_result = "T"
            else:
                match_result = "L"
        else:
            # Player on team 2
            partner = row.team2_player2_name if row.team2_player1_id == player_id else row.team2_player1_name
            opponent1 = row.team1_player1_name
            opponent2 = row.team1_player2_name
            player_score = row.team2_score
            opponent_score = row.team1_score
            elo_change = row.team2_elo_change or 0
            
            if row.winner == 2:
                match_result = "W"
            elif row.winner == -1:
                match_result = "T"
            else:
                match_result = "L"
        
        # Handle session_status - it might be an enum or already a string
        session_status_value = None
        if row.session_status:
            if hasattr(row.session_status, 'value'):
                session_status_value = row.session_status.value
            else:
                session_status_value = str(row.session_status)
        
        results.append({
            "Date": row.date,
            "Partner": partner,
            "Opponent 1": opponent1,
            "Opponent 2": opponent2,
            "Result": match_result,
            "Score": f"{player_score}-{opponent_score}",
            "ELO Change": elo_change,
            "ELO After": row.elo_after,
            "Session Status": session_status_value
        })
    
    return results


async def create_session(session: AsyncSession, date: str) -> Dict:
    """
    Create a new session.
    
    Args:
        session: Database session
        date: Date string (e.g., '11/7/2025')
        
    Returns:
        Dict with session info
        
    Raises:
        ValueError: If an active session already exists for this date
    """
    # Check if active session exists for this date
    result = await session.execute(
        select(Session).where(
            and_(Session.date == date, Session.status == SessionStatus.ACTIVE)
        )
    )
    active_session = result.scalar_one_or_none()
    if active_session:
        raise ValueError(f"An active session '{active_session.name}' already exists for this date. Please submit the current session before creating a new one.")
    
    # Count existing sessions for this date
    result = await session.execute(
        select(func.count(Session.id)).where(Session.date == date)
    )
    count = result.scalar() or 0
    
    # Generate session name
    if count == 0:
        name = date
    else:
        name = f"{date} Session #{count + 1}"
    
    # Create the session
    new_session = Session(
        date=date,
        name=name,
        status=SessionStatus.ACTIVE
    )
    session.add(new_session)
    await session.flush()
    await session.commit()
    await session.refresh(new_session)
    
    return {
        "id": new_session.id,
        "date": new_session.date,
        "name": new_session.name,
        "status": new_session.status.value if new_session.status else None,
        "created_at": new_session.created_at.isoformat() if new_session.created_at else ""
    }


async def create_match_async(
    session: AsyncSession,
    match_request: 'CreateMatchRequest',
    session_id: int,
    date: str
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
    # Determine winner
    if match_request.team1_score > match_request.team2_score:
        winner = 1
    elif match_request.team2_score > match_request.team1_score:
        winner = 2
    else:
        winner = -1  # Tie
    
    # Create match using player IDs directly from the request
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
        is_public=match_request.is_public if match_request.is_public is not None else True
    )
    session.add(new_match)
    await session.flush()
    await session.commit()
    await session.refresh(new_match)
    
    return new_match.id


async def update_match_async(
    session: AsyncSession,
    match_id: int,
    match_request: 'UpdateMatchRequest',
    updated_by: Optional[int] = None
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
    # Get match
    result = await session.execute(
        select(Match).where(Match.id == match_id)
    )
    match = result.scalar_one_or_none()
    if not match:
        return False
    
    # Determine winner
    if match_request.team1_score > match_request.team2_score:
        winner = 1
    elif match_request.team2_score > match_request.team1_score:
        winner = 2
    else:
        winner = -1  # Tie
    
    # Update match using player IDs directly from the request
    match.team1_player1_id = match_request.team1_player1_id
    match.team1_player2_id = match_request.team1_player2_id
    match.team2_player1_id = match_request.team2_player1_id
    match.team2_player2_id = match_request.team2_player2_id
    match.team1_score = match_request.team1_score
    match.team2_score = match_request.team2_score
    match.winner = winner
    if match_request.is_public is not None:
        match.is_public = match_request.is_public
    if updated_by is not None:
        match.updated_by = updated_by
    
    # Update the session's updated_by and updated_at if the session exists
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
    # First, delete associated elo_history records
    await session.execute(
        delete(EloHistory).where(EloHistory.match_id == match_id)
    )
    
    # Then delete the match
    result = await session.execute(
        delete(Match).where(Match.id == match_id)
    )
    await session.commit()
    return result.rowcount > 0


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
    
    # Get player names
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
        "session_status": session_status.value if session_status else None
    }


# ============================================================================
# Async Stats Calculation Functions
# ============================================================================

async def load_ranked_matches_async(
    session: AsyncSession, 
    season_id: Optional[int] = None,
    league_id: Optional[int] = None
) -> List[Match]:
    """
    Load ranked matches from database.
    
    Only includes matches from finalized sessions (SUBMITTED or EDITED) or matches with no session.
    
    Args:
        session: Database session
        season_id: Optional season ID to filter by
        league_id: Optional league ID to filter by (filters through Session -> Season -> league_id)
        
    Returns:
        List of Match objects
    """
    conditions = [
        Match.is_ranked == True,
        or_(
            Session.status.in_([SessionStatus.SUBMITTED, SessionStatus.EDITED]),
            Session.id.is_(None)
        )
    ]
    
    # Build query with necessary joins
    query = select(Match).outerjoin(Session, Match.session_id == Session.id)
    
    # Add league_id filtering if provided (requires joining Season table)
    if league_id is not None:
        query = query.outerjoin(Season, Session.season_id == Season.id)
        conditions.append(Season.league_id == league_id)
    
    # Add season_id filtering if provided
    if season_id is not None:
        conditions.append(Session.season_id == season_id)
    
    query = query.where(and_(*conditions))
    query = query.order_by(Match.id.asc())
    
    result = await session.execute(query)
    return list(result.scalars().all())


async def delete_global_stats_async(session: AsyncSession) -> None:
    """Delete all global stats."""
    await session.execute(delete(EloHistory))
    await session.execute(delete(PartnershipStats))
    await session.execute(delete(OpponentStats))


async def delete_season_stats_async(session: AsyncSession, season_id: int) -> None:
    """Delete all season-specific stats for a given season."""
    await session.execute(
        delete(PartnershipStatsSeason).where(PartnershipStatsSeason.season_id == season_id)
    )
    await session.execute(
        delete(OpponentStatsSeason).where(OpponentStatsSeason.season_id == season_id)
    )
    await session.execute(
        delete(PlayerSeasonStats).where(PlayerSeasonStats.season_id == season_id)
    )


async def delete_league_stats_async(session: AsyncSession, league_id: int) -> None:
    """Delete all league-specific stats for a given league."""
    await session.execute(
        delete(PartnershipStatsLeague).where(PartnershipStatsLeague.league_id == league_id)
    )
    await session.execute(
        delete(OpponentStatsLeague).where(OpponentStatsLeague.league_id == league_id)
    )
    await session.execute(
        delete(PlayerLeagueStats).where(PlayerLeagueStats.league_id == league_id)
    )


async def delete_all_stats_async(session: AsyncSession) -> None:
    """Delete all stats from all tables (global, league, and season stats)."""
    # Delete global stats
    await session.execute(delete(EloHistory))
    await session.execute(delete(PartnershipStats))
    await session.execute(delete(OpponentStats))
    await session.execute(delete(PlayerGlobalStats))
    
    # Delete all league stats
    await session.execute(delete(PartnershipStatsLeague))
    await session.execute(delete(OpponentStatsLeague))
    await session.execute(delete(PlayerLeagueStats))
    
    # Delete all season stats
    await session.execute(delete(PartnershipStatsSeason))
    await session.execute(delete(OpponentStatsSeason))
    await session.execute(delete(PlayerSeasonStats))


def _chunks(lst, n):
    """Yield successive n-sized chunks from lst."""
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


async def insert_elo_history_async(session: AsyncSession, elo_history_list: List[EloHistory]) -> None:
    """Bulk insert ELO history records in chunks."""
    if not elo_history_list:
        return
    
    for chunk in _chunks(elo_history_list, 1000):
        session.add_all(chunk)


async def upsert_player_global_stats_async(session: AsyncSession, elo_history_list: List[EloHistory], matches: List[Match]) -> None:
    """
    Update PlayerGlobalStats based on elo_history and match data.
    For each player, calculate:
    - current_rating: Latest elo_after from elo_history
    - total_games: Count of matches they participated in
    - total_wins: Count of matches they won
    """
    if not elo_history_list:
        return
    
    # Group elo_history by player_id and get latest rating
    player_latest_elo = {}
    for elo_record in elo_history_list:
        if elo_record.player_id not in player_latest_elo:
            player_latest_elo[elo_record.player_id] = elo_record.elo_after
        # Since elo_history_list is ordered by match date, last one is latest
        player_latest_elo[elo_record.player_id] = elo_record.elo_after
    
    # Count games and wins for each player
    player_games = {}
    player_wins = {}
    
    for match in matches:
        # Get player IDs directly from Match ORM object
        team1_player_ids = [match.team1_player1_id, match.team1_player2_id]
        team2_player_ids = [match.team2_player1_id, match.team2_player2_id]
        all_player_ids = [pid for pid in team1_player_ids + team2_player_ids if pid is not None]
        
        # Count games for all 4 players
        for player_id in all_player_ids:
            player_games[player_id] = player_games.get(player_id, 0) + 1
        
        # Count wins for winning team
        # winner is 1 = team1, 2 = team2, -1 = tie
        if match.winner == 1:
            # Team 1 won
            for player_id in team1_player_ids:
                if player_id is not None:
                    player_wins[player_id] = player_wins.get(player_id, 0) + 1
        elif match.winner == 2:
            # Team 2 won
            for player_id in team2_player_ids:
                if player_id is not None:
                    player_wins[player_id] = player_wins.get(player_id, 0) + 1
        # If winner is -1 (tie), no one wins
    
    # Get all unique player IDs from both elo_history and matches
    all_player_ids = set(player_latest_elo.keys()) | set(player_games.keys())
    
    # Upsert PlayerGlobalStats for each player
    for player_id in all_player_ids:
        # Use latest ELO if available, otherwise use INITIAL_ELO
        current_rating = player_latest_elo.get(player_id, INITIAL_ELO)
        
        stmt = pg_insert(PlayerGlobalStats).values(
            player_id=player_id,
            current_rating=current_rating,
            total_games=player_games.get(player_id, 0),
            total_wins=player_wins.get(player_id, 0)
        ).on_conflict_do_update(
            index_elements=['player_id'],
            set_=dict(
                current_rating=current_rating,
                total_games=player_games.get(player_id, 0),
                total_wins=player_wins.get(player_id, 0),
                updated_at=func.now()
            )
        )
        await session.execute(stmt)


async def insert_partnership_stats_async(session: AsyncSession, partnerships: List[PartnershipStats]) -> None:
    """Bulk insert partnership stats in chunks."""
    if not partnerships:
        return
    
    for chunk in _chunks(partnerships, 1000):
        session.add_all(chunk)


async def insert_opponent_stats_async(session: AsyncSession, opponents: List[OpponentStats]) -> None:
    """Bulk insert opponent stats in chunks."""
    if not opponents:
        return
    
    for chunk in _chunks(opponents, 1000):
        session.add_all(chunk)


async def insert_partnership_stats_season_async(
    session: AsyncSession, 
    partnerships: List[PartnershipStatsSeason], 
    season_id: int
) -> None:
    """Bulk insert season-specific partnership stats in chunks."""
    if not partnerships:
        return
    
    for chunk in _chunks(partnerships, 1000):
        session.add_all(chunk)


async def insert_opponent_stats_season_async(
    session: AsyncSession, 
    opponents: List[OpponentStatsSeason], 
    season_id: int
) -> None:
    """Bulk insert season-specific opponent stats in chunks."""
    if not opponents:
        return
    
    for chunk in _chunks(opponents, 1000):
        session.add_all(chunk)


async def insert_partnership_stats_league_async(
    session: AsyncSession, 
    partnerships: List[PartnershipStatsLeague], 
    league_id: int
) -> None:
    """Bulk insert league-specific partnership stats in chunks."""
    if not partnerships:
        return
    
    for chunk in _chunks(partnerships, 1000):
        session.add_all(chunk)


async def insert_opponent_stats_league_async(
    session: AsyncSession, 
    opponents: List[OpponentStatsLeague], 
    league_id: int
) -> None:
    """Bulk insert league-specific opponent stats in chunks."""
    if not opponents:
        return
    
    for chunk in _chunks(opponents, 1000):
        session.add_all(chunk)
    
    for chunk in _chunks(opponents, 1000):
        session.add_all(chunk)


async def upsert_player_season_stats_async(
    session: AsyncSession, 
    tracker: 'calculation_service.StatsTracker', 
    season_id: int
) -> None:
    """
    Upsert player season stats from tracker.
    
    Args:
        session: Database session
        tracker: StatsTracker from calculation service
        season_id: Season ID
    """
    player_stats_list = []
    for player_id, player_stats in tracker.players.items():
        player_stats_list.append({
            "player_id": player_id,
            "season_id": season_id,
            "games": player_stats.game_count,
            "wins": player_stats.win_count,
            "points": player_stats.points,
            "win_rate": round(player_stats.win_rate, 3),
            "avg_point_diff": round(player_stats.avg_point_diff, 1)
        })
    
    if not player_stats_list:
        return
    
    # Use upsert for player season stats
    stmt = insert(PlayerSeasonStats).values(player_stats_list)
    stmt = stmt.on_conflict_do_update(
        index_elements=['player_id', 'season_id'],
        set_=dict(
            games=stmt.excluded.games,
            wins=stmt.excluded.wins,
            points=stmt.excluded.points,
            win_rate=stmt.excluded.win_rate,
            avg_point_diff=stmt.excluded.avg_point_diff,
            updated_at=sql_func.now()
        )
    )
    
    await session.execute(stmt)


async def calculate_global_stats_async(session: AsyncSession) -> Dict:
    """
    Calculate global stats from all ranked matches.
    
    This function:
    1. Loads all ranked matches
    2. Processes them through calculation service
    3. Calculates all stats in memory first
    4. Deletes all global stats
    5. Inserts new global stats
    
    All operations happen within a single transaction to ensure consistency.
    If calculation fails, old stats remain visible.
    
    Args:
        session: Database session
        
    Returns:
        Dict with player_count and match_count
    """
    # Load all ranked matches
    matches = await load_ranked_matches_async(session)
    
    if not matches:
        # No matches - delete stats and return
        await delete_global_stats_async(session)
        await session.commit()
        return {"player_count": 0, "match_count": 0}
    
    # Process matches through calculation service (in-memory, fast)
    # Note: player_id_map is no longer needed since we use IDs directly
    elo_deltas_map, partnerships, opponents, elo_history_list = calculation_service.process_matches(
        matches
    )
    
    # Now delete old stats and insert new ones (all calculated, so if this fails, transaction rolls back)
    await delete_global_stats_async(session)
    
    # Insert new stats (within same transaction)
    await insert_elo_history_async(session, elo_history_list)
    await insert_partnership_stats_async(session, partnerships)
    await insert_opponent_stats_async(session, opponents)
    await upsert_player_global_stats_async(session, elo_history_list, matches)
    
    # Commit the transaction - readers now see new stats
    # If any error occurs, transaction rolls back and old stats remain
    await session.commit()
    
    # Count unique players from matches
    unique_players = set()
    for match in matches:
        unique_players.add(match.team1_player1_id)
        unique_players.add(match.team1_player2_id)
        unique_players.add(match.team2_player1_id)
        unique_players.add(match.team2_player2_id)
    
    return {
        "player_count": len(unique_players),
        "match_count": len(matches)
    }


async def _calculate_season_stats_from_matches(
    session: AsyncSession, 
    season_id: int, 
    season_matches: List[Match]
) -> Dict:
    """
    Helper function to calculate season stats from a list of matches.
    Used internally by calculate_league_stats_async.
    
    Args:
        session: Database session
        season_id: Season ID
        season_matches: List of matches for this season
        
    Returns:
        Dict with player_count and match_count
    """
    if not season_matches:
        # No matches - delete stats and return
        await delete_season_stats_async(session, season_id)
        return {"player_count": 0, "match_count": 0}
    
    # Process matches through calculation service (in-memory, fast)
    # Note: player_id_map is no longer needed since we use IDs directly
    elo_deltas_map, partnerships, opponents, elo_history_list = calculation_service.process_matches(
        season_matches
    )
    
    # Create tracker for player season stats (process matches again to get player-level stats)
    tracker = calculation_service.StatsTracker()
    for match in season_matches:
        tracker.process_match(match)
    
    # Convert partnerships and opponents to season-specific models
    partnership_season_list = []
    for ps in partnerships:
        partnership_season_list.append(
            PartnershipStatsSeason(
                player_id=ps.player_id,
                partner_id=ps.partner_id,
                season_id=season_id,
                games=ps.games,
                wins=ps.wins,
                points=ps.points,
                win_rate=ps.win_rate,
                avg_point_diff=ps.avg_point_diff
            )
        )
    
    opponent_season_list = []
    for os in opponents:
        opponent_season_list.append(
            OpponentStatsSeason(
                player_id=os.player_id,
                opponent_id=os.opponent_id,
                season_id=season_id,
                games=os.games,
                wins=os.wins,
                points=os.points,
                win_rate=os.win_rate,
                avg_point_diff=os.avg_point_diff
            )
        )
    
    # Prepare player season stats list (calculate first, before deleting)
    player_stats_list = []
    for player_id, player_stats in tracker.players.items():
        player_stats_list.append({
            "player_id": player_id,
            "season_id": season_id,
            "games": player_stats.game_count,
            "wins": player_stats.win_count,
            "points": player_stats.points,
            "win_rate": round(player_stats.win_rate, 3),
            "avg_point_diff": round(player_stats.avg_point_diff, 1)
        })
    
    # Now delete old stats and insert new ones (all calculated, so if this fails, transaction rolls back)
    await delete_season_stats_async(session, season_id)
    
    # Insert new season-specific stats (within same transaction)
    await insert_partnership_stats_season_async(session, partnership_season_list, season_id)
    await insert_opponent_stats_season_async(session, opponent_season_list, season_id)
    
    # Insert player season stats
    if player_stats_list:
        stmt = insert(PlayerSeasonStats).values(player_stats_list)
        stmt = stmt.on_conflict_do_update(
            index_elements=['player_id', 'season_id'],
            set_=dict(
                games=stmt.excluded.games,
                wins=stmt.excluded.wins,
                points=stmt.excluded.points,
                win_rate=stmt.excluded.win_rate,
                avg_point_diff=stmt.excluded.avg_point_diff,
                updated_at=sql_func.now()
            )
        )
        await session.execute(stmt)
    
    # Count unique players in this season
    unique_players = set()
    for match in season_matches:
        if match.team1_player1_id:
            unique_players.add(match.team1_player1_id)
        if match.team1_player2_id:
            unique_players.add(match.team1_player2_id)
        if match.team2_player1_id:
            unique_players.add(match.team2_player1_id)
        if match.team2_player2_id:
            unique_players.add(match.team2_player2_id)
    
    return {
        "player_count": len(unique_players),
        "match_count": len(season_matches)
    }


async def calculate_league_stats_async(session: AsyncSession, league_id: int) -> Dict:
    """
    Calculate league-level stats and all season stats for a league.
    
    This function:
    1. Loads all ranked matches for the league (across all seasons) - single query
    2. Gets all seasons for the league
    3. Processes all matches through calculation service to get league-level stats
    4. Calculates league-level stats (partnerships, opponents, player stats)
    5. Deletes old league stats
    6. Inserts new league stats
    7. For each season in the league:
       - Filters matches by season_id (in-memory, already loaded)
       - Calculates season stats from filtered matches
       - Deletes old season stats
       - Inserts new season stats
    
    All operations happen within a single transaction to ensure consistency.
    If calculation fails, old stats remain visible.
    
    This approach is efficient because:
    - Single database query loads all matches
    - In-memory filtering by season (fast)
    - All calculations happen in one transaction
    
    Args:
        session: Database session
        league_id: League ID
        
    Returns:
        Dict with league_player_count, league_match_count, and season_counts
    """
    # Load all ranked matches for the league (across all seasons) - single query
    all_matches = await load_ranked_matches_async(session, league_id=league_id)
    
    # Get all seasons for the league
    seasons = await list_seasons(session, league_id)
    season_ids = [s["id"] for s in seasons]
    
    if not all_matches:
        # No matches - delete all stats and return
        await delete_league_stats_async(session, league_id)
        for season_id in season_ids:
            await delete_season_stats_async(session, season_id)
        await session.commit()
        return {
            "league_player_count": 0,
            "league_match_count": 0,
            "season_counts": {season_id: {"player_count": 0, "match_count": 0} for season_id in season_ids}
        }
    
    # Get session_id -> season_id mapping for all matches
    # Query all sessions for matches that have session_id
    session_ids = {m.session_id for m in all_matches if m.session_id}
    session_to_season_map = {}
    if session_ids:
        sessions_result = await session.execute(
            select(Session.id, Session.season_id).where(Session.id.in_(session_ids))
        )
        for sess_id, sess_season_id in sessions_result:
            if sess_season_id:
                session_to_season_map[sess_id] = sess_season_id
    
    # Process all matches through calculation service to get league-level stats
    # Note: player_id_map is no longer needed since we use IDs directly
    elo_deltas_map, partnerships, opponents, elo_history_list = calculation_service.process_matches(
        all_matches
    )
    
    # Create tracker for player league stats (process all matches to get player-level stats)
    league_tracker = calculation_service.StatsTracker()
    for match in all_matches:
        league_tracker.process_match(match)
    
    # Convert partnerships and opponents to league-specific models
    partnership_league_list = []
    for ps in partnerships:
        partnership_league_list.append(
            PartnershipStatsLeague(
                player_id=ps.player_id,
                partner_id=ps.partner_id,
                league_id=league_id,
                games=ps.games,
                wins=ps.wins,
                points=ps.points,
                win_rate=ps.win_rate,
                avg_point_diff=ps.avg_point_diff
            )
        )
    
    opponent_league_list = []
    for os in opponents:
        opponent_league_list.append(
            OpponentStatsLeague(
                player_id=os.player_id,
                opponent_id=os.opponent_id,
                league_id=league_id,
                games=os.games,
                wins=os.wins,
                points=os.points,
                win_rate=os.win_rate,
                avg_point_diff=os.avg_point_diff
            )
        )
    
    # Prepare player league stats list
    player_league_stats_list = []
    for player_id, player_stats in league_tracker.players.items():
        player_league_stats_list.append({
            "player_id": player_id,
            "league_id": league_id,
            "games": player_stats.game_count,
            "wins": player_stats.win_count,
            "points": player_stats.points,
            "win_rate": round(player_stats.win_rate, 3),
            "avg_point_diff": round(player_stats.avg_point_diff, 1)
        })
    
    # Now delete old league stats and insert new ones
    await delete_league_stats_async(session, league_id)
    
    # Insert new league-specific stats (within same transaction)
    await insert_partnership_stats_league_async(session, partnership_league_list, league_id)
    await insert_opponent_stats_league_async(session, opponent_league_list, league_id)
    
    # Insert player league stats
    if player_league_stats_list:
        stmt = insert(PlayerLeagueStats).values(player_league_stats_list)
        stmt = stmt.on_conflict_do_update(
            index_elements=['player_id', 'league_id'],
            set_=dict(
                games=stmt.excluded.games,
                wins=stmt.excluded.wins,
                points=stmt.excluded.points,
                win_rate=stmt.excluded.win_rate,
                avg_point_diff=stmt.excluded.avg_point_diff,
                updated_at=sql_func.now()
            )
        )
        await session.execute(stmt)
    
    # Now calculate stats for each season
    # Group matches by season_id for efficient processing
    matches_by_season: Dict[int, List[Match]] = {}
    for match in all_matches:
        season_id = session_to_season_map.get(match.session_id) if match.session_id else None
        if season_id and season_id in season_ids:
            if season_id not in matches_by_season:
                matches_by_season[season_id] = []
            matches_by_season[season_id].append(match)
    
    # Calculate stats for each season
    season_counts = {}
    for season_id in season_ids:
        season_matches = matches_by_season.get(season_id, [])
        season_result = await _calculate_season_stats_from_matches(session, season_id, season_matches)
        season_counts[season_id] = season_result
    
    # Count unique players in league
    unique_league_players = set()
    for match in all_matches:
        if match.team1_player1_id:
            unique_league_players.add(match.team1_player1_id)
        if match.team1_player2_id:
            unique_league_players.add(match.team1_player2_id)
        if match.team2_player1_id:
            unique_league_players.add(match.team2_player1_id)
        if match.team2_player2_id:
            unique_league_players.add(match.team2_player2_id)
    
    await session.commit()
    
    return {
        "league_player_count": len(unique_league_players),
        "league_match_count": len(all_matches),
        "season_counts": season_counts
    }


# Keep calculate_season_stats_async for backward compatibility, but it now calls the helper
async def calculate_season_stats_async(session: AsyncSession, season_id: int) -> Dict:
    """
    Calculate season-specific stats from ranked matches in a season.
    
    This is a backward compatibility wrapper that calls the helper function.
    For new code, use calculate_league_stats_async instead.
    
    Args:
        session: Database session
        season_id: Season ID
        
    Returns:
        Dict with player_count and match_count
    """
    # Load ranked matches for this season
    matches = await load_ranked_matches_async(session, season_id=season_id)
    
    # Use the helper function to calculate season stats
    result = await _calculate_season_stats_from_matches(session, season_id, matches)
    
    # Commit the transaction
    await session.commit()
    
    return result


def register_stats_queue_callbacks() -> None:
    """
    Register stats calculation callbacks with the stats queue.
    
    This function should be called during application startup, before the
    stats queue worker is started. It registers the calculation functions
    with the queue so they can be executed when jobs are processed.
    
    This breaks the circular dependency between stats_queue and data_service
    by using dependency injection instead of direct imports.
    """
    from backend.services.stats_queue import get_stats_queue
    queue = get_stats_queue()
    queue.register_calculation_callbacks(
        global_calc_callback=calculate_global_stats_async,
        league_calc_callback=calculate_league_stats_async
    )


# Weekly Schedule functions

async def create_weekly_schedule(
    session: AsyncSession,
    season_id: int,
    day_of_week: int,
    start_time: str,
    duration_hours: float,
    court_id: Optional[int],
    open_signups_mode: str,
    open_signups_day_of_week: Optional[int],
    open_signups_time: Optional[str],
    end_date: str,
    creator_player_id: Optional[int] = None
) -> Dict:
    """Create a weekly schedule and auto-generate signups."""
    # Validate season exists
    season_result = await session.execute(
        select(Season).where(Season.id == season_id)
    )
    season = season_result.scalar_one_or_none()
    if not season:
        raise ValueError("Season not found")
    
    # Validate end_date doesn't exceed 6 months or season end
    end_date_obj = datetime.fromisoformat(end_date).date() if isinstance(end_date, str) else end_date
    max_end_date = min(
        date.today() + timedelta(days=180),  # 6 months
        season.end_date
    )
    if end_date_obj > max_end_date:
        raise ValueError(f"end_date cannot exceed {max_end_date.isoformat()}")
    
    # Create schedule
    schedule = WeeklySchedule(
        season_id=season_id,
        day_of_week=day_of_week,
        start_time=start_time,
        duration_hours=duration_hours,
        court_id=court_id,
        open_signups_mode=OpenSignupsMode(open_signups_mode),
        open_signups_day_of_week=open_signups_day_of_week,
        open_signups_time=open_signups_time,
        end_date=end_date_obj,
        created_by=creator_player_id,
        updated_by=creator_player_id
    )
    session.add(schedule)
    await session.flush()
    
    # Generate signups
    await _generate_signups_from_schedule(session, schedule, season)
    
    # Recalculate open times for all signups in the season to ensure consistency
    await recalculate_open_signups_for_season(session, season_id)
    
    await session.commit()
    await session.refresh(schedule)
    
    return _weekly_schedule_to_dict(schedule)


async def get_weekly_schedules(session: AsyncSession, season_id: int) -> List[Dict]:
    """Get all weekly schedules for a season."""
    result = await session.execute(
        select(WeeklySchedule)
        .where(WeeklySchedule.season_id == season_id)
        .order_by(WeeklySchedule.day_of_week, WeeklySchedule.start_time)
    )
    schedules = result.scalars().all()
    return [_weekly_schedule_to_dict(s) for s in schedules]


async def get_weekly_schedule(session: AsyncSession, schedule_id: int) -> Optional[Dict]:
    """Get a weekly schedule by ID."""
    result = await session.execute(
        select(WeeklySchedule).where(WeeklySchedule.id == schedule_id)
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        return None
    return _weekly_schedule_to_dict(schedule)


async def update_weekly_schedule(
    session: AsyncSession,
    schedule_id: int,
    day_of_week: Optional[int] = None,
    start_time: Optional[str] = None,
    duration_hours: Optional[float] = None,
    court_id: Optional[int] = None,
    open_signups_mode: Optional[str] = None,
    open_signups_day_of_week: Optional[int] = None,
    open_signups_time: Optional[str] = None,
    end_date: Optional[str] = None,
    updater_player_id: Optional[int] = None
) -> Optional[Dict]:
    """Update a weekly schedule and regenerate affected signups."""
    result = await session.execute(
        select(WeeklySchedule).where(WeeklySchedule.id == schedule_id)
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        return None
    
    # Get season for validation
    season_result = await session.execute(
        select(Season).where(Season.id == schedule.season_id)
    )
    season = season_result.scalar_one_or_none()
    if not season:
        raise ValueError("Season not found")
    
    # Update fields
    if day_of_week is not None:
        schedule.day_of_week = day_of_week
    if start_time is not None:
        schedule.start_time = start_time
    if duration_hours is not None:
        schedule.duration_hours = duration_hours
    if court_id is not None:
        schedule.court_id = court_id
    if open_signups_mode is not None:
        schedule.open_signups_mode = OpenSignupsMode(open_signups_mode)
    if open_signups_day_of_week is not None:
        schedule.open_signups_day_of_week = open_signups_day_of_week
    if open_signups_time is not None:
        schedule.open_signups_time = open_signups_time
    if end_date is not None:
        end_date_obj = datetime.fromisoformat(end_date).date() if isinstance(end_date, str) else end_date
        max_end_date = min(
            date.today() + timedelta(days=180),
            season.end_date
        )
        if end_date_obj > max_end_date:
            raise ValueError(f"end_date cannot exceed {max_end_date.isoformat()}")
        schedule.end_date = end_date_obj
    
    if updater_player_id is not None:
        schedule.updated_by = updater_player_id
    
    # Calculate the end of the current week (Sunday)
    # Preserve signups from the current week (Monday-Sunday), delete only future weeks
    today = date.today()
    # Get Monday of current week (weekday: Monday=0, so subtract days to get Monday)
    days_since_monday = today.weekday()
    current_week_monday = today - timedelta(days=days_since_monday)
    current_week_sunday = current_week_monday + timedelta(days=6)
    
    # Delete only future week signups (after current week Sunday)
    # Convert Sunday to UTC datetime at end of day (23:59:59)
    utc = pytz.UTC
    current_week_sunday_end = utc.localize(
        datetime.combine(current_week_sunday, time(23, 59, 59))
    )
    
    await session.execute(
        delete(Signup).where(
            and_(
                Signup.weekly_schedule_id == schedule_id,
                Signup.scheduled_datetime > current_week_sunday_end
            )
        ),
        execution_options={"synchronize_session": False}
    )
    # Regenerate signups, skipping current week to preserve existing signups
    await _generate_signups_from_schedule(session, schedule, season, skip_current_week=True)
    
    # Recalculate open times for all signups in the season to ensure consistency
    await recalculate_open_signups_for_season(session, schedule.season_id)
    
    await session.commit()
    await session.refresh(schedule)
    
    return _weekly_schedule_to_dict(schedule)


async def delete_weekly_schedule(session: AsyncSession, schedule_id: int) -> bool:
    """Delete a weekly schedule and its generated future signups only."""
    now_utc = utcnow()
    
    result = await session.execute(
        select(WeeklySchedule).where(WeeklySchedule.id == schedule_id)
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        return False
    
    # Delete only future generated signups (cascade will handle signup_players and signup_events)
    # Past signups are preserved for historical records
    await session.execute(
        delete(Signup).where(
            Signup.weekly_schedule_id == schedule_id,
            Signup.scheduled_datetime > now_utc
        )
    )
    
    # Delete schedule
    await session.delete(schedule)
    
    # Recalculate open times for all signups in the season to ensure consistency
    await recalculate_open_signups_for_season(session, schedule.season_id)
    
    await session.commit()
    
    return True


async def _generate_signups_from_schedule(
    session: AsyncSession,
    schedule: WeeklySchedule,
    season: Season,
    skip_current_week: bool = False
):
    """Generate signups from a weekly schedule for the schedule duration.
    
    Args:
        session: Database session
        schedule: WeeklySchedule instance
        season: Season instance
        skip_current_week: If True, skip generating signups for the current week (Monday-Sunday)
    """
    utc = pytz.UTC
    now_utc = utcnow()
    
    # Calculate start date
    base_start_date = max(date.today(), season.start_date)
    
    # If skipping current week, start from next Monday
    if skip_current_week:
        today = date.today()
        days_since_monday = today.weekday()
        current_week_monday = today - timedelta(days=days_since_monday)
        next_monday = current_week_monday + timedelta(days=7)
        start_date = max(next_monday, base_start_date)
    else:
        start_date = base_start_date
    
    end_date = min(schedule.end_date, season.end_date)
    
    # Parse start_time
    # IMPORTANT: start_time is stored as "HH:MM" and should be interpreted as UTC time
    # The frontend should send times in UTC, but if it sends local time, we need timezone info
    # For now, we'll treat it as UTC to match the expected behavior
    time_parts = schedule.start_time.split(':')
    start_hour = int(time_parts[0])
    start_minute = int(time_parts[1]) if len(time_parts) > 1 else 0
    
    # Generate signups for each occurrence
    current_date = start_date
    while current_date <= end_date:
        # Check if current_date matches the day of week
        # Python weekday: Monday=0, Sunday=6
        if current_date.weekday() == schedule.day_of_week:
            # Create scheduled_datetime in UTC
            # The date is already a date object (no timezone), so we combine with time and localize to UTC
            scheduled_datetime = utc.localize(
                datetime.combine(current_date, time(start_hour, start_minute))
            )
            
            # Calculate open_signups_at based on mode
            open_signups_at = await _calculate_open_signups_at(
                session, schedule, scheduled_datetime, season
            )
            
            # Only create if scheduled_datetime is in the future or today
            if scheduled_datetime >= now_utc.replace(hour=0, minute=0, second=0, microsecond=0):
                signup = Signup(
                    season_id=schedule.season_id,
                    scheduled_datetime=scheduled_datetime,
                    duration_hours=schedule.duration_hours,
                    court_id=schedule.court_id,
                    open_signups_at=open_signups_at,
                    weekly_schedule_id=schedule.id,
                    created_by=schedule.created_by,
                    updated_by=schedule.updated_by
                )
                session.add(signup)
                # Flush to ensure this signup is visible for the next iteration's open_signups_at calculation
                await session.flush()
        
        current_date += timedelta(days=1)
    
    await session.flush()


def _get_previous_calendar_week_range(scheduled_datetime: datetime) -> Tuple[datetime, datetime]:
    """
    Calculate the start and end of the previous calendar week (Monday-Sunday)
    relative to the scheduled_datetime.
    
    Returns:
        Tuple[datetime, datetime]: (start_time, end_time) in UTC
    """
    utc = pytz.UTC
    
    # Calculate start of the current week (Monday) based on scheduled_datetime
    # scheduled_datetime is already UTC
    sched_date = scheduled_datetime.date()
    days_since_monday = sched_date.weekday()
    current_week_monday_date = sched_date - timedelta(days=days_since_monday)
    
    # Previous week range: [Prev Monday 00:00, Current Monday 00:00)
    prev_week_monday_date = current_week_monday_date - timedelta(days=7)
    
    prev_week_start = utc.localize(datetime.combine(prev_week_monday_date, time(0, 0, 0)))
    current_week_start = utc.localize(datetime.combine(current_week_monday_date, time(0, 0, 0)))
    
    return prev_week_start, current_week_start


async def _calculate_open_signups_at(
    session: AsyncSession,
    schedule: WeeklySchedule,
    scheduled_datetime: datetime,
    season: Season
) -> Optional[datetime]:
    """Calculate when signups should open for a scheduled datetime. Returns None for always open."""
    utc = pytz.UTC
    
    if schedule.open_signups_mode == OpenSignupsMode.ALWAYS_OPEN:
        # NULL means always open
        return None
    
    elif schedule.open_signups_mode == OpenSignupsMode.SPECIFIC_DAY_TIME:
        # Open at specific day/time the week before
        if not schedule.open_signups_day_of_week or not schedule.open_signups_time:
            # Fallback to always open if not configured
            return None
        
        # Find the previous week's occurrence of open_signups_day_of_week
        time_parts = schedule.open_signups_time.split(':')
        open_hour = int(time_parts[0])
        open_minute = int(time_parts[1]) if len(time_parts) > 1 else 0
        
        # Go back 7 days from scheduled_datetime, then find the matching day
        target_date = scheduled_datetime.date() - timedelta(days=7)
        days_until_target = (schedule.open_signups_day_of_week - target_date.weekday()) % 7
        if days_until_target == 0 and target_date.weekday() != schedule.open_signups_day_of_week:
            days_until_target = 7
        open_date = target_date + timedelta(days=days_until_target)
        
        return utc.localize(datetime.combine(open_date, time(open_hour, open_minute)))
    
    else:  # AUTO_AFTER_LAST_SESSION
        # Open immediately after the last session of the previous week
        # We need to find the last session of the PREVIOUS CALENDAR WEEK (Mon-Sun)
        # This ensures all signups for the current week open at the same time
        
        prev_week_start, current_week_start = _get_previous_calendar_week_range(scheduled_datetime)
        
        result = await session.execute(
            select(Signup)
            .where(
                Signup.season_id == season.id,
                Signup.scheduled_datetime >= prev_week_start,
                Signup.scheduled_datetime < current_week_start
            )
            .order_by(Signup.scheduled_datetime.desc())
            .limit(1)
        )
        last_signup = result.scalar_one_or_none()
        
        if last_signup:
            # Immediately after last session ends
            return last_signup.scheduled_datetime + timedelta(hours=last_signup.duration_hours)
        else:
            # No previous signup, open immediately (NULL means always open)
            return None





async def recalculate_open_signups_for_season(
    session: AsyncSession,
    season_id: int
) -> None:
    """
    Recalculate open_signups_at for all future signups in a season.
    This is called when a schedule is added/updated/deleted to ensure
    dynamic opening times are consistent across all schedules.
    """
    now_utc = utcnow()
    
    # Get all future signups for this season
    # We also include signups from the current week to ensure consistency
    # Start from today's date at 00:00
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    
    result = await session.execute(
        select(Signup, WeeklySchedule)
        .join(WeeklySchedule, Signup.weekly_schedule_id == WeeklySchedule.id)
        .where(
            Signup.season_id == season_id,
            Signup.scheduled_datetime >= today_start
        )
        .order_by(Signup.scheduled_datetime.asc())
    )
    rows = result.all()
    
    # Get season for context
    season_result = await session.execute(
        select(Season).where(Season.id == season_id)
    )
    season = season_result.scalar_one_or_none()
    if not season:
        return

    # Process each signup
    for signup, schedule in rows:
        # Only recalculate if mode is AUTO_AFTER_LAST_SESSION
        if schedule.open_signups_mode == OpenSignupsMode.AUTO_AFTER_LAST_SESSION:
            new_open_at = await _calculate_open_signups_at(
                session, schedule, signup.scheduled_datetime, season
            )
            
            # Update if changed
            if signup.open_signups_at != new_open_at:
                signup.open_signups_at = new_open_at
                session.add(signup)
    
    await session.flush()


def _weekly_schedule_to_dict(schedule: WeeklySchedule) -> Dict:
    """Convert WeeklySchedule model to dict."""
    return {
        "id": schedule.id,
        "season_id": schedule.season_id,
        "day_of_week": schedule.day_of_week,
        "start_time": schedule.start_time,
        "duration_hours": schedule.duration_hours,
        "court_id": schedule.court_id,
        "open_signups_mode": schedule.open_signups_mode.value,
        "open_signups_day_of_week": schedule.open_signups_day_of_week,
        "open_signups_time": schedule.open_signups_time,
        "end_date": schedule.end_date.isoformat() if schedule.end_date else None,
        "created_at": schedule.created_at.isoformat() if schedule.created_at else None,
        "updated_at": schedule.updated_at.isoformat() if schedule.updated_at else None,
    }


# Signup functions

async def create_signup(
    session: AsyncSession,
    season_id: int,
    scheduled_datetime: str,
    duration_hours: float,
    court_id: Optional[int],
    open_signups_at: Optional[str] = None,
    creator_player_id: Optional[int] = None
) -> Dict:
    """Create an ad-hoc signup."""
    utc = pytz.UTC
    now_utc = utcnow()
    
    # Parse datetimes (assume UTC)
    scheduled_dt = datetime.fromisoformat(scheduled_datetime.replace('Z', '+00:00'))
    if scheduled_dt.tzinfo is None:
        scheduled_dt = utc.localize(scheduled_dt)
    
    # If open_signups_at is not provided, store NULL (always open)
    if open_signups_at is None:
        open_dt = None
    else:
        open_dt = datetime.fromisoformat(open_signups_at.replace('Z', '+00:00'))
        if open_dt.tzinfo is None:
            open_dt = utc.localize(open_dt)
        
        # Validate open_signups_at is not in the past
        if open_dt < now_utc:
            raise ValueError("open_signups_at cannot be in the past")
    
    signup = Signup(
        season_id=season_id,
        scheduled_datetime=scheduled_dt,
        duration_hours=duration_hours,
        court_id=court_id,
        open_signups_at=open_dt,  # NULL means always open
        created_by=creator_player_id,
        updated_by=creator_player_id
    )
    session.add(signup)
    await session.commit()
    await session.refresh(signup)
    
    return await _signup_to_dict(session, signup)


async def get_signups(
    session: AsyncSession,
    season_id: int,
    upcoming_only: bool = False,
    past_only: bool = False,
    include_players: bool = False
) -> List[Dict]:
    """Get signups for a season."""
    now_utc = utcnow()
    
    if include_players:
        # Single query with JOIN to get signups and players
        query = (
            select(
                Signup,
                SignupPlayer.player_id,
                Player.full_name.label("player_name"),
                SignupPlayer.signed_up_at
            )
            .select_from(Signup)
            .outerjoin(SignupPlayer, Signup.id == SignupPlayer.signup_id)
            .outerjoin(Player, SignupPlayer.player_id == Player.id)
            .where(Signup.season_id == season_id)
        )
        
        if upcoming_only:
            query = query.where(Signup.scheduled_datetime >= now_utc)
        elif past_only:
            query = query.where(Signup.scheduled_datetime < now_utc)
        
        query = query.order_by(Signup.scheduled_datetime.asc(), SignupPlayer.signed_up_at.asc())
        
        result = await session.execute(query)
        rows = result.all()
        
        # Group players by signup
        signups_dict = {}
        for row in rows:
            signup = row[0]  # Signup object
            player_id = row[1]  # SignupPlayer.player_id
            player_name = row[2]  # Player.full_name
            signed_up_at = row[3]  # SignupPlayer.signed_up_at
            
            if signup.id not in signups_dict:
                signups_dict[signup.id] = {
                    "signup": signup,
                    "players": []
                }
            
            # Only add player if it exists (LEFT JOIN can return None)
            if player_id is not None and player_name is not None:
                signups_dict[signup.id]["players"].append({
                    "player_id": player_id,
                    "player_name": player_name,
                    "signed_up_at": signed_up_at.isoformat() if signed_up_at else None
                })
        
        # Convert to list of dicts
        return [await _signup_to_dict_with_players(session, data["signup"], data["players"]) for data in signups_dict.values()]
    else:
        # Simple query without players
        query = select(Signup).where(Signup.season_id == season_id)
        
        if upcoming_only:
            query = query.where(Signup.scheduled_datetime >= now_utc)
        elif past_only:
            query = query.where(Signup.scheduled_datetime < now_utc)
        
        query = query.order_by(Signup.scheduled_datetime.asc())
        
        result = await session.execute(query)
        signups = result.scalars().all()
        
        return [await _signup_to_dict(session, s, include_players=False) for s in signups]


async def get_signup(session: AsyncSession, signup_id: int, include_players: bool = False) -> Optional[Dict]:
    """Get a signup by ID."""
    result = await session.execute(
        select(Signup).where(Signup.id == signup_id)
    )
    signup = result.scalar_one_or_none()
    if not signup:
        return None
    return await _signup_to_dict(session, signup, include_players=include_players)


async def update_signup(
    session: AsyncSession,
    signup_id: int,
    scheduled_datetime: Optional[str] = None,
    duration_hours: Optional[float] = None,
    court_id: Optional[int] = None,
    open_signups_at: Optional[str] = None,
    updater_player_id: Optional[int] = None
) -> Optional[Dict]:
    """Update a signup."""
    utc = pytz.UTC
    now_utc = utcnow()
    
    result = await session.execute(
        select(Signup).where(Signup.id == signup_id)
    )
    signup = result.scalar_one_or_none()
    if not signup:
        return None
    
    if scheduled_datetime is not None:
        scheduled_dt = datetime.fromisoformat(scheduled_datetime.replace('Z', '+00:00'))
        if scheduled_dt.tzinfo is None:
            scheduled_dt = utc.localize(scheduled_dt)
        signup.scheduled_datetime = scheduled_dt
    
    if duration_hours is not None:
        signup.duration_hours = duration_hours
    
    if court_id is not None:
        signup.court_id = court_id
    
    if open_signups_at is not None:
        open_dt = datetime.fromisoformat(open_signups_at.replace('Z', '+00:00'))
        if open_dt.tzinfo is None:
            open_dt = utc.localize(open_dt)
        # Validate not in the past
        if open_dt < now_utc:
            raise ValueError("open_signups_at cannot be in the past")
        signup.open_signups_at = open_dt
    
    if updater_player_id is not None:
        signup.updated_by = updater_player_id
    
    await session.commit()
    await session.refresh(signup)
    
    return await _signup_to_dict(session, signup)


async def delete_signup(session: AsyncSession, signup_id: int) -> bool:
    """Delete a signup."""
    result = await session.execute(
        select(Signup).where(Signup.id == signup_id)
    )
    signup = result.scalar_one_or_none()
    if not signup:
        return False
    
    await session.delete(signup)
    await session.commit()
    
    return True


async def signup_player(
    session: AsyncSession,
    signup_id: int,
    player_id: int,
    creator_player_id: Optional[int] = None
) -> bool:
    """Add a player to a signup."""
    now_utc = utcnow()
    
    # Get signup and validate it's open
    result = await session.execute(
        select(Signup).where(Signup.id == signup_id)
    )
    signup = result.scalar_one_or_none()
    if not signup:
        raise ValueError("Signup not found")
    
    # NULL open_signups_at means always open
    if signup.open_signups_at is not None and signup.open_signups_at > now_utc:
        raise ValueError("Signups are not yet open for this session")
    
    # Check if already signed up
    existing = await session.execute(
        select(SignupPlayer).where(
            SignupPlayer.signup_id == signup_id,
            SignupPlayer.player_id == player_id
        )
    )
    if existing.scalar_one_or_none():
        return False  # Already signed up
    
    # Add player
    signup_player = SignupPlayer(
        signup_id=signup_id,
        player_id=player_id
    )
    session.add(signup_player)
    
    # Log event
    event = SignupEvent(
        signup_id=signup_id,
        player_id=player_id,
        event_type=SignupEventType.SIGNUP,
        created_by=creator_player_id or player_id
    )
    session.add(event)
    
    await session.commit()
    return True


async def dropout_player(
    session: AsyncSession,
    signup_id: int,
    player_id: int,
    creator_player_id: Optional[int] = None
) -> bool:
    """Remove a player from a signup."""
    now_utc = utcnow()
    
    # Get signup and validate it's open
    result = await session.execute(
        select(Signup).where(Signup.id == signup_id)
    )
    signup = result.scalar_one_or_none()
    if not signup:
        raise ValueError("Signup not found")
    
    # NULL open_signups_at means always open
    if signup.open_signups_at is not None and signup.open_signups_at > now_utc:
        raise ValueError("Signups are not yet open for this session")
    
    # Remove player
    result = await session.execute(
        delete(SignupPlayer).where(
            SignupPlayer.signup_id == signup_id,
            SignupPlayer.player_id == player_id
        )
    )
    
    if result.rowcount == 0:
        return False  # Not signed up
    
    # Log event
    event = SignupEvent(
        signup_id=signup_id,
        player_id=player_id,
        event_type=SignupEventType.DROPOUT,
        created_by=creator_player_id or player_id
    )
    session.add(event)
    
    await session.commit()
    return True


async def get_signup_players(session: AsyncSession, signup_id: int) -> List[Dict]:
    """Get all players signed up for a signup."""
    result = await session.execute(
        select(SignupPlayer, Player)
        .join(Player, SignupPlayer.player_id == Player.id)
        .where(SignupPlayer.signup_id == signup_id)
        .order_by(SignupPlayer.signed_up_at.asc())
    )
    rows = result.all()
    
    return [
        {
            "player_id": sp.player_id,
            "player_name": p.full_name,
            "signed_up_at": sp.signed_up_at.isoformat() if sp.signed_up_at else None
        }
        for sp, p in rows
    ]


async def get_signup_events(session: AsyncSession, signup_id: int) -> List[Dict]:
    """Get event log for a signup."""
    result = await session.execute(
        select(SignupEvent, Player)
        .join(Player, SignupEvent.player_id == Player.id)
        .where(SignupEvent.signup_id == signup_id)
        .order_by(SignupEvent.created_at.desc())
    )
    rows = result.all()
    
    return [
        {
            "id": event.id,
            "player_id": event.player_id,
            "player_name": p.full_name,
            "event_type": event.event_type.value,
            "created_at": event.created_at.isoformat() if event.created_at else None,
            "created_by": event.created_by
        }
        for event, p in rows
    ]


async def _signup_to_dict(session: AsyncSession, signup: Signup, include_players: bool = False) -> Dict:
    """Convert Signup model to dict."""
    utc = pytz.UTC
    now_utc = utcnow()
    
    # Get player count
    count_result = await session.execute(
        select(func.count(SignupPlayer.player_id))
        .where(SignupPlayer.signup_id == signup.id)
    )
    player_count = count_result.scalar() or 0
    
    # Handle naive datetimes (timezone-naive datetimes)
    scheduled_dt = signup.scheduled_datetime
    if scheduled_dt and scheduled_dt.tzinfo is None:
        scheduled_dt = utc.localize(scheduled_dt)
        
    open_at = signup.open_signups_at
    if open_at and open_at.tzinfo is None:
        open_at = utc.localize(open_at)

    # Compute is_open and is_past
    # NULL open_signups_at means always open
    is_open = open_at is None or open_at <= now_utc
    is_past = scheduled_dt < now_utc
    
    result = {
        "id": signup.id,
        "season_id": signup.season_id,
        "scheduled_datetime": signup.scheduled_datetime.isoformat() if signup.scheduled_datetime else None,
        "duration_hours": signup.duration_hours,
        "court_id": signup.court_id,
        "open_signups_at": signup.open_signups_at.isoformat() if signup.open_signups_at else None,
        "weekly_schedule_id": signup.weekly_schedule_id,
        "player_count": player_count,
        "is_open": is_open,
        "is_past": is_past,
        "created_at": signup.created_at.isoformat() if signup.created_at else None,
        "updated_at": signup.updated_at.isoformat() if signup.updated_at else None,
    }
    
    if include_players:
        result["players"] = await get_signup_players(session, signup.id)
    
    return result


async def _signup_to_dict_with_players(session: AsyncSession, signup: Signup, players: List[Dict]) -> Dict:
    """Convert Signup model to dict with pre-loaded players list (optimized version)."""
    now_utc = utcnow()
    
    # Compute is_open and is_past
    # NULL open_signups_at means always open
    is_open = signup.open_signups_at is None or signup.open_signups_at <= now_utc
    is_past = signup.scheduled_datetime < now_utc
    
    return {
        "id": signup.id,
        "season_id": signup.season_id,
        "scheduled_datetime": signup.scheduled_datetime.isoformat() if signup.scheduled_datetime else None,
        "duration_hours": signup.duration_hours,
        "court_id": signup.court_id,
        "open_signups_at": signup.open_signups_at.isoformat() if signup.open_signups_at else None,
        "weekly_schedule_id": signup.weekly_schedule_id,
        "player_count": len(players),  # Use pre-loaded count
        "is_open": is_open,
        "is_past": is_past,
        "created_at": signup.created_at.isoformat() if signup.created_at else None,
        "updated_at": signup.updated_at.isoformat() if signup.updated_at else None,
        "players": players  # Use pre-loaded players
    }


#
# League Messages
#

async def get_league_messages(session: AsyncSession, league_id: int, limit: int = 100) -> List[Dict]:
    """Get messages for a league with player names."""
    result = await session.execute(
        select(LeagueMessage, Player.full_name)
        .join(User, LeagueMessage.user_id == User.id)
        .outerjoin(Player, Player.user_id == User.id)
        .where(LeagueMessage.league_id == league_id)
        .order_by(LeagueMessage.created_at.desc())
        .limit(limit)
    )
    messages = []
    for msg, player_name in result.all():
        messages.append({
            "id": msg.id,
            "league_id": msg.league_id,
            "user_id": msg.user_id,
            "player_name": player_name or "Unknown",
            "message": msg.message_text,
            "created_at": msg.created_at.isoformat() if msg.created_at else None
        })
    return messages


async def create_league_message(session: AsyncSession, league_id: int, user_id: int, message_text: str) -> Dict:
    """Create a new league message."""
    new_message = LeagueMessage(
        league_id=league_id,
        user_id=user_id,
        message_text=message_text
    )
    session.add(new_message)
    await session.commit()
    await session.refresh(new_message)
    
    # Get player name
    result = await session.execute(
        select(Player.full_name)
        .where(Player.user_id == user_id)
    )
    player_name = result.scalar_one_or_none() or "Unknown"
    
    return {
        "id": new_message.id,
        "league_id": new_message.league_id,
        "user_id": new_message.user_id,
        "player_name": player_name,
        "message": new_message.message_text,
        "created_at": new_message.created_at.isoformat() if new_message.created_at else None
    }

