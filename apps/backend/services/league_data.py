"""
League domain operations.

Covers leagues, seasons, locations, courts, home courts (league and player),
league members, join requests, and settings CRUD.

Extracted from data_service.py.  All symbols are re-exported through
data_service.py for backward compatibility.
"""

from datetime import datetime, date
from typing import List, Dict, Optional
import json
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func, and_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.sql import func as sql_func

from backend.database.models import (
    League,
    LeagueMember,
    LeagueMessage,
    LeagueConfig,
    LeagueRequest,
    LeagueHomeCourt,
    PlayerHomeCourt,
    Season,
    Location,
    Court,
    Player,
    Setting,
    Region,
    ScoringSystem,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Leagues
# ---------------------------------------------------------------------------


async def create_league(
    session: AsyncSession,
    name: str,
    description: Optional[str],
    location_id: Optional[str],
    is_open: bool,
    whatsapp_group_id: Optional[str],
    creator_user_id: int,
    gender: Optional[str] = None,
    level: Optional[str] = None,
) -> Dict:
    """Create a new league."""
    league = League(
        name=name,
        description=description,
        location_id=location_id,
        is_open=is_open,
        whatsapp_group_id=whatsapp_group_id,
        gender=gender,
        level=level,
    )
    session.add(league)
    await session.flush()  # Get the league ID

    # Get creator's player_id
    result = await session.execute(select(Player).where(Player.user_id == creator_user_id))
    player = result.scalar_one_or_none()
    if not player:
        raise ValueError("Player not found for user_id")

    # Add creator as admin member
    member = LeagueMember(league_id=league.id, player_id=player.id, role="admin")
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
        "home_courts": [],
    }


async def list_leagues(
    session: AsyncSession,
    location_id: Optional[str] = None,
    region_id: Optional[str] = None,
    gender: Optional[str] = None,
    level: Optional[str] = None,
    order: Optional[str] = None,
    limit: Optional[int] = None,
) -> List[Dict]:
    """
    List all leagues with optional filters, ordering, and limit.

    This is a legacy helper that returns the full list (optionally limited).
    For paginated access with total counts, prefer query_leagues.
    """
    # Subquery to count members for each league
    member_count_subq = (
        select(LeagueMember.league_id, func.count(LeagueMember.id).label("member_count"))
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
            Region.name.label("region_name"),
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
        player_result = await session.execute(select(Player.id).where(Player.user_id == user_id))
        player_id = player_result.scalar_one_or_none()

    # Subquery to count members for each league
    member_count_subq = (
        select(LeagueMember.league_id, func.count(LeagueMember.id).label("member_count"))
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
            Region.name.label("region_name"),
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
                select(LeagueMember.league_id).where(LeagueMember.player_id == player_id)
            )
        )

    if conditions:
        base_query = base_query.where(and_(*conditions))

    # Total count query (no member_count / region_name needed)
    count_query = (
        select(func.count(League.id))
        .select_from(League)
        .outerjoin(Location, Location.id == League.location_id)
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

    # Check for pending join requests when player is authenticated
    pending_league_ids: set = set()
    if player_id is not None:
        pending_result = await session.execute(
            select(LeagueRequest.league_id).where(
                and_(
                    LeagueRequest.player_id == player_id,
                    LeagueRequest.status == "pending",
                )
            )
        )
        pending_league_ids = {row[0] for row in pending_result.all()}

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
            "has_pending_request": league.id in pending_league_ids,
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
    """Get a league by ID, including home courts."""
    result = await session.execute(select(League).where(League.id == league_id))
    league = result.scalar_one_or_none()
    if not league:
        return None

    # Fetch home courts
    home_courts = await get_league_home_courts(session, league_id)

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
        "home_courts": home_courts,
    }


async def get_user_leagues(session: AsyncSession, user_id: int) -> List[Dict]:
    """Get all leagues a user is a member of, ordered by most recent session date."""
    from backend.database.models import Session as SessionModel

    # Subquery to count members for each league
    member_count_subq = (
        select(LeagueMember.league_id, func.count(LeagueMember.id).label("member_count"))
        .group_by(LeagueMember.league_id)
        .subquery()
    )

    # Subquery to get the most recent session date per league
    latest_session_subq = (
        select(
            Season.league_id,
            func.max(SessionModel.date).label("latest_session_date"),
        )
        .join(SessionModel, SessionModel.season_id == Season.id)
        .group_by(Season.league_id)
        .subquery()
    )

    result = await session.execute(
        select(
            League,
            LeagueMember.role.label("membership_role"),
            func.coalesce(member_count_subq.c.member_count, 0).label("member_count"),
            Location.name.label("location_name"),
            latest_session_subq.c.latest_session_date,
        )
        .join(LeagueMember, LeagueMember.league_id == League.id)
        .join(Player, Player.id == LeagueMember.player_id)
        .outerjoin(member_count_subq, member_count_subq.c.league_id == League.id)
        .outerjoin(Location, Location.id == League.location_id)
        .outerjoin(latest_session_subq, latest_session_subq.c.league_id == League.id)
        .where(Player.user_id == user_id)
        .distinct()
        .order_by(
            latest_session_subq.c.latest_session_date.desc().nulls_last(),
            League.created_at.desc(),
        )
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
        for league, role, member_count, location_name, _latest_date in rows
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
    level: Optional[str] = None,
) -> Optional[Dict]:
    """Update a league."""
    update_values = {
        "name": name,
        "description": description,
        "location_id": location_id,
        "is_open": is_open,
        "whatsapp_group_id": whatsapp_group_id,
    }
    if gender is not None:
        update_values["gender"] = gender
    if level is not None:
        update_values["level"] = level

    await session.execute(update(League).where(League.id == league_id).values(**update_values))
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
    await session.execute(delete(LeagueMember).where(LeagueMember.league_id == league_id))
    await session.execute(delete(LeagueMessage).where(LeagueMessage.league_id == league_id))
    await session.execute(delete(LeagueConfig).where(LeagueConfig.league_id == league_id))
    await session.execute(delete(Season).where(Season.league_id == league_id))

    # Now delete the league
    result = await session.execute(delete(League).where(League.id == league_id))
    await session.commit()
    return result.rowcount > 0


async def is_database_empty(session: AsyncSession) -> bool:
    """Check if database is empty."""
    result = await session.execute(select(func.count(Player.id)))
    count = result.scalar() or 0
    return count == 0


# ---------------------------------------------------------------------------
# Seasons
# ---------------------------------------------------------------------------


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
    point_system: Optional[str] = None,
    scoring_system: Optional[str] = None,
    points_per_win: Optional[int] = None,
    points_per_loss: Optional[int] = None,
) -> Dict:
    """
    Create a season.

    Args:
        session: Database session
        league_id: League ID
        name: Season name (optional)
        start_date: Start date (ISO string)
        end_date: End date (ISO string)
        point_system: Legacy point_system JSON (optional, for backward compatibility)
        scoring_system: Scoring system type ("points_system" or "season_rating")
        points_per_win: Points per win (for Points System, default 3)
        points_per_loss: Points per loss (for Points System, default 1, can be 0 or negative)
    """
    # If no name provided, generate default name based on season count for this league
    if not name or name.strip() == "":
        # Count existing seasons for this league
        result = await session.execute(
            select(func.count(Season.id)).where(Season.league_id == league_id)
        )
        season_count = result.scalar() or 0
        name = f"Season {season_count + 1}"

    # Determine scoring system
    if scoring_system:
        scoring_system_enum = ScoringSystem(scoring_system)
    else:
        # Default to points_system
        scoring_system_enum = ScoringSystem.POINTS_SYSTEM

    # Build point_system JSON
    if point_system:
        # Use provided point_system (for backward compatibility)
        # Validate that point_system type matches scoring_system
        try:
            point_system_dict_check = json.loads(point_system)
            if point_system_dict_check.get(
                "type"
            ) and scoring_system_enum.value != point_system_dict_check.get("type"):
                raise ValueError(
                    f"scoring_system '{scoring_system_enum.value}' does not match "
                    f"point_system type '{point_system_dict_check.get('type')}'"
                )
        except (json.JSONDecodeError, TypeError):
            # Invalid JSON, will be overwritten below
            pass
        point_system_json = point_system
    else:
        # Build from scoring system parameters
        if scoring_system_enum == ScoringSystem.POINTS_SYSTEM:
            points_per_win_val = points_per_win if points_per_win is not None else 3
            points_per_loss_val = points_per_loss if points_per_loss is not None else 1
            point_system_dict = {
                "type": "points_system",
                "points_per_win": points_per_win_val,
                "points_per_loss": points_per_loss_val,
            }
        else:  # SEASON_RATING
            point_system_dict = {
                "type": "season_rating"
                # All players start at 100 rating in Season Rating mode
            }
        point_system_json = json.dumps(point_system_dict)

    season = Season(
        league_id=league_id,
        name=name,
        start_date=datetime.fromisoformat(start_date).date()
        if isinstance(start_date, str)
        else start_date,
        end_date=datetime.fromisoformat(end_date).date()
        if isinstance(end_date, str)
        else end_date,
        scoring_system=scoring_system_enum,
        point_system=point_system_json,
    )
    session.add(season)
    await session.commit()
    await session.refresh(season)

    return {
        "id": season.id,
        "league_id": season.league_id,
        "name": season.name,
        "start_date": season.start_date.isoformat() if season.start_date else None,
        "end_date": season.end_date.isoformat() if season.end_date else None,
        "scoring_system": season.scoring_system if season.scoring_system else None,
        "point_system": season.point_system,
        "created_at": season.created_at.isoformat() if season.created_at else None,
        "updated_at": season.updated_at.isoformat() if season.updated_at else None,
    }


async def list_seasons(session: AsyncSession, league_id: int) -> List[Dict]:
    """List seasons for a league."""
    result = await session.execute(
        select(Season).where(Season.league_id == league_id).order_by(Season.start_date.desc())
    )
    seasons = result.scalars().all()
    return [
        {
            "id": s.id,
            "league_id": s.league_id,
            "name": s.name,
            "start_date": s.start_date.isoformat() if s.start_date else None,
            "end_date": s.end_date.isoformat() if s.end_date else None,
            "scoring_system": s.scoring_system,  # Now just a string, no enum conversion needed
            "point_system": s.point_system,
            "awards_finalized_at": s.awards_finalized_at.isoformat()
            if s.awards_finalized_at
            else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        }
        for s in seasons
    ]


async def get_season(session: AsyncSession, season_id: int) -> Optional[Dict]:
    """Get a season by ID."""
    result = await session.execute(select(Season).where(Season.id == season_id))
    season = result.scalar_one_or_none()
    if not season:
        return None
    return {
        "id": season.id,
        "league_id": season.league_id,
        "name": season.name,
        "start_date": season.start_date.isoformat() if season.start_date else None,
        "end_date": season.end_date.isoformat() if season.end_date else None,
        "scoring_system": season.scoring_system if season.scoring_system else None,
        "point_system": season.point_system,
        "awards_finalized_at": season.awards_finalized_at.isoformat()
        if season.awards_finalized_at
        else None,
        "created_at": season.created_at.isoformat() if season.created_at else None,
        "updated_at": season.updated_at.isoformat() if season.updated_at else None,
    }


async def update_season(session: AsyncSession, season_id: int, **fields) -> Optional[Dict]:
    """
    Update a season - async version.

    When changing scoring system, updates point_system configuration accordingly.
    """
    # Get current season to preserve initial_rating if changing scoring system
    season_result = await session.execute(select(Season).where(Season.id == season_id))
    season = season_result.scalar_one_or_none()
    if not season:
        return None

    allowed = {
        "name",
        "start_date",
        "end_date",
        "point_system",
        "scoring_system",
        "points_per_win",
        "points_per_loss",
    }
    updates = {k: v for k, v in fields.items() if k in allowed}

    if not updates:
        return await get_season(session, season_id)

    # Handle scoring system changes
    scoring_system_changed = (
        "scoring_system" in updates or "points_per_win" in updates or "points_per_loss" in updates
    )
    if scoring_system_changed:
        # Build new point_system JSON
        scoring_system_val = updates.get(
            "scoring_system", season.scoring_system if season.scoring_system else "points_system"
        )
        scoring_system_enum = ScoringSystem(scoring_system_val)

        # Validate consistency if point_system is being set directly
        if "point_system" in updates and updates["point_system"]:
            try:
                point_system_dict_check = json.loads(updates["point_system"])
                if point_system_dict_check.get(
                    "type"
                ) and scoring_system_enum.value != point_system_dict_check.get("type"):
                    raise ValueError(
                        f"scoring_system '{scoring_system_enum.value}' does not match "
                        f"point_system type '{point_system_dict_check.get('type')}'"
                    )
            except (json.JSONDecodeError, TypeError):
                # Invalid JSON, will be overwritten
                pass

        if scoring_system_enum == ScoringSystem.POINTS_SYSTEM:
            points_per_win_val = updates.get("points_per_win")
            if points_per_win_val is None:
                # Try to get from existing config
                if season.point_system:
                    try:
                        point_system_dict = json.loads(season.point_system)
                        points_per_win_val = point_system_dict.get("points_per_win", 3)
                    except (json.JSONDecodeError, TypeError):
                        points_per_win_val = 3
                else:
                    points_per_win_val = 3

            points_per_loss_val = updates.get("points_per_loss")
            if points_per_loss_val is None:
                # Try to get from existing config
                if season.point_system:
                    try:
                        point_system_dict = json.loads(season.point_system)
                        points_per_loss_val = point_system_dict.get("points_per_loss", 1)
                    except (json.JSONDecodeError, TypeError):
                        points_per_loss_val = 1
                else:
                    points_per_loss_val = 1

            point_system_dict = {
                "type": "points_system",
                "points_per_win": points_per_win_val,
                "points_per_loss": points_per_loss_val,
            }
        else:  # SEASON_RATING
            point_system_dict = {"type": "season_rating"}

        updates["point_system"] = json.dumps(point_system_dict)
        updates["scoring_system"] = scoring_system_enum
        # Remove points_per_win and points_per_loss from updates (they're in point_system now)
        updates.pop("points_per_win", None)
        updates.pop("points_per_loss", None)
    else:
        scoring_system_changed = False

    # Convert date strings to date objects if needed
    if "start_date" in updates and isinstance(updates["start_date"], str):
        updates["start_date"] = datetime.fromisoformat(updates["start_date"]).date()
    if "end_date" in updates and isinstance(updates["end_date"], str):
        updates["end_date"] = datetime.fromisoformat(updates["end_date"]).date()

    await session.execute(update(Season).where(Season.id == season_id).values(**updates))
    await session.commit()

    # Trigger stats recalculation if scoring system changed
    if scoring_system_changed:
        try:
            from backend.services.stats_queue import get_stats_queue

            queue = get_stats_queue()
            await queue.enqueue_calculation(session, "league", season.league_id)
        except Exception:
            # Don't fail the update if queueing fails - stats can be recalculated manually
            pass

    # Clear awards if season re-opened (end_date moved to the future).
    # This must succeed — stale awards for an active season would be wrong.
    if "end_date" in fields:
        refreshed = await session.execute(select(Season).where(Season.id == season_id))
        updated_season = refreshed.scalar_one_or_none()
        if (
            updated_season
            and updated_season.awards_finalized_at is not None
            and updated_season.end_date
            and updated_season.end_date >= date.today()
        ):
            from backend.services.season_awards_service import clear_season_awards

            await clear_season_awards(session, season_id)
            logger.info(f"Cleared awards for re-opened season {season_id}")

    return await get_season(session, season_id)


# ---------------------------------------------------------------------------
# Locations
# ---------------------------------------------------------------------------


async def create_location(
    session: AsyncSession,
    name: str,
    city: Optional[str],
    state: Optional[str],
    country: str = "USA",
    location_id: Optional[str] = None,
) -> Dict:
    """Create a location."""
    if not location_id:
        raise ValueError("location_id is required when creating a location")

    location = Location(id=location_id, name=name, city=city, state=state, country=country)
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
    country: Optional[str],
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
            update(Location).where(Location.id == location_id).values(**update_values)
        )
        await session.commit()

    result = await session.execute(select(Location).where(Location.id == location_id))
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
    result = await session.execute(delete(Location).where(Location.id == location_id))
    await session.commit()
    return result.rowcount > 0


# ---------------------------------------------------------------------------
# Courts
# ---------------------------------------------------------------------------


async def create_court(
    session: AsyncSession,
    name: str,
    address: Optional[str],
    location_id: str,
    geoJson: Optional[str],
) -> Dict:
    """Create a court."""
    court = Court(name=name, address=address, location_id=location_id, geoJson=geoJson)
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


async def list_courts(
    session: AsyncSession,
    location_id: Optional[str] = None,
    only_approved: bool = False,
) -> List[Dict]:
    """List courts, optionally filtered by location and/or approval status."""
    query = (
        select(Court)
        .where(
            Court.is_placeholder == False  # noqa: E712 — exclude placeholder courts
        )
        .order_by(Court.name.asc())
    )
    if location_id is not None:
        query = query.where(Court.location_id == location_id)
    if only_approved:
        query = query.where(Court.status == "approved")

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
    geoJson: Optional[str],
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
        await session.execute(update(Court).where(Court.id == court_id).values(**update_values))
        await session.commit()

    result = await session.execute(select(Court).where(Court.id == court_id))
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
    result = await session.execute(delete(Court).where(Court.id == court_id))
    await session.commit()
    return result.rowcount > 0


# ---------------------------------------------------------------------------
# League Home Courts
# ---------------------------------------------------------------------------


async def get_league_home_courts(session: AsyncSession, league_id: int) -> List[Dict]:
    """Get all home courts for a league, ordered by position."""
    result = await session.execute(
        select(LeagueHomeCourt, Court)
        .join(Court, Court.id == LeagueHomeCourt.court_id)
        .where(LeagueHomeCourt.league_id == league_id)
        .order_by(LeagueHomeCourt.position.asc(), Court.name.asc())
    )
    rows = result.all()
    return [
        {"id": court.id, "name": court.name, "address": court.address, "position": lhc.position}
        for lhc, court in rows
    ]


async def add_league_home_court(session: AsyncSession, league_id: int, court_id: int) -> Dict:
    """Add a court as a home court for a league. Returns the court dict."""
    # Verify court exists
    court_result = await session.execute(select(Court).where(Court.id == court_id))
    court = court_result.scalar_one_or_none()
    if not court:
        raise ValueError(f"Court {court_id} not found")

    # Determine next position
    max_pos_result = await session.execute(
        select(func.max(LeagueHomeCourt.position)).where(LeagueHomeCourt.league_id == league_id)
    )
    max_pos = max_pos_result.scalar() or -1
    position = max_pos + 1

    home_court = LeagueHomeCourt(league_id=league_id, court_id=court_id, position=position)
    session.add(home_court)
    await session.commit()
    return {"id": court.id, "name": court.name, "address": court.address, "position": position}


async def remove_league_home_court(session: AsyncSession, league_id: int, court_id: int) -> bool:
    """Remove a home court from a league. Returns True if deleted."""
    result = await session.execute(
        delete(LeagueHomeCourt).where(
            and_(LeagueHomeCourt.league_id == league_id, LeagueHomeCourt.court_id == court_id)
        )
    )
    await session.commit()
    return result.rowcount > 0


async def reorder_league_home_courts(
    session: AsyncSession, league_id: int, court_positions: List[Dict]
) -> List[Dict]:
    """Reorder home courts for a league. Accepts [{court_id, position}]."""
    for item in court_positions:
        await session.execute(
            update(LeagueHomeCourt)
            .where(
                and_(
                    LeagueHomeCourt.league_id == league_id,
                    LeagueHomeCourt.court_id == item["court_id"],
                )
            )
            .values(position=item["position"])
        )
    await session.commit()
    return await get_league_home_courts(session, league_id)


async def set_league_home_courts(
    session: AsyncSession, league_id: int, court_ids: List[int]
) -> List[Dict]:
    """Replace all home courts for a league with the given ordered list of court IDs.

    Position is implicit from array index. Existing rows are deleted and replaced.
    Returns the new list in the same shape as get_league_home_courts.
    """
    await session.execute(delete(LeagueHomeCourt).where(LeagueHomeCourt.league_id == league_id))
    for position, court_id in enumerate(court_ids):
        session.add(LeagueHomeCourt(league_id=league_id, court_id=court_id, position=position))
    await session.commit()
    return await get_league_home_courts(session, league_id)


# ---------------------------------------------------------------------------
# Player Home Courts
# ---------------------------------------------------------------------------


async def get_player_home_courts(session: AsyncSession, player_id: int) -> List[Dict]:
    """Get all home courts for a player, ordered by position."""
    result = await session.execute(
        select(PlayerHomeCourt, Court)
        .join(Court, Court.id == PlayerHomeCourt.court_id)
        .where(PlayerHomeCourt.player_id == player_id)
        .order_by(PlayerHomeCourt.position.asc(), Court.name.asc())
    )
    rows = result.all()
    return [
        {"id": court.id, "name": court.name, "address": court.address, "position": phc.position}
        for phc, court in rows
    ]


async def add_player_home_court(session: AsyncSession, player_id: int, court_id: int) -> Dict:
    """Add a court as a home court for a player. Returns the court dict."""
    # Verify court exists
    court_result = await session.execute(select(Court).where(Court.id == court_id))
    court = court_result.scalar_one_or_none()
    if not court:
        raise ValueError(f"Court {court_id} not found")

    # Determine next position
    max_pos_result = await session.execute(
        select(func.max(PlayerHomeCourt.position)).where(PlayerHomeCourt.player_id == player_id)
    )
    max_pos = max_pos_result.scalar() or -1
    position = max_pos + 1

    home_court = PlayerHomeCourt(player_id=player_id, court_id=court_id, position=position)
    session.add(home_court)
    await session.commit()
    return {"id": court.id, "name": court.name, "address": court.address, "position": position}


async def remove_player_home_court(session: AsyncSession, player_id: int, court_id: int) -> bool:
    """Remove a home court from a player. Returns True if deleted."""
    result = await session.execute(
        delete(PlayerHomeCourt).where(
            and_(PlayerHomeCourt.player_id == player_id, PlayerHomeCourt.court_id == court_id)
        )
    )
    await session.commit()
    return result.rowcount > 0


async def set_player_home_courts(
    session: AsyncSession, player_id: int, court_ids: List[int]
) -> List[Dict]:
    """Replace all home courts for a player with the given ordered list of court IDs.

    Position is implicit from array index. Existing rows are deleted and replaced.
    Returns the new list in the same shape as get_player_home_courts.
    """
    await session.execute(delete(PlayerHomeCourt).where(PlayerHomeCourt.player_id == player_id))
    for position, court_id in enumerate(court_ids):
        session.add(PlayerHomeCourt(player_id=player_id, court_id=court_id, position=position))
    await session.commit()
    return await get_player_home_courts(session, player_id)


async def reorder_player_home_courts(
    session: AsyncSession, player_id: int, court_positions: List[Dict]
) -> List[Dict]:
    """Reorder home courts for a player. Accepts [{court_id, position}]."""
    for item in court_positions:
        await session.execute(
            update(PlayerHomeCourt)
            .where(
                and_(
                    PlayerHomeCourt.player_id == player_id,
                    PlayerHomeCourt.court_id == item["court_id"],
                )
            )
            .values(position=item["position"])
        )
    await session.commit()
    return await get_player_home_courts(session, player_id)


# ---------------------------------------------------------------------------
# League Members
# ---------------------------------------------------------------------------


async def list_league_members(session: AsyncSession, league_id: int) -> List[Dict]:
    """List league members. player_name is full_name only (nicknames used on backend for matching only)."""
    from backend.services.player_data import generate_player_initials

    result = await session.execute(
        select(
            LeagueMember,
            Player.full_name.label("player_name"),
            Player.nickname.label("player_nickname"),
            Player.level.label("player_level"),
            Player.avatar.label("player_avatar"),
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
            "player_name": player_name or f"Player {member.player_id}",
            "player_nickname": player_nickname,
            "player_level": player_level,
            "player_avatar": player_avatar or generate_player_initials(player_name or ""),
            "joined_at": member.created_at.isoformat() if member.created_at else None,
            "is_placeholder": member.role == "placeholder",
        }
        for member, player_name, player_nickname, player_level, player_avatar in rows
    ]


async def add_league_member(
    session: AsyncSession, league_id: int, player_id: int, role: str = "member"
) -> Dict:
    """Add a league member."""
    member = LeagueMember(league_id=league_id, player_id=player_id, role=role)
    session.add(member)
    await session.commit()
    await session.refresh(member)
    return {
        "id": member.id,
        "league_id": member.league_id,
        "player_id": member.player_id,
        "role": member.role,
    }


async def add_league_members_batch(
    session: AsyncSession, league_id: int, members: List[Dict]
) -> Dict:
    """
    Add multiple league members in one request.

    Pre-fetches existing members in a single query and batch-inserts
    new members to avoid N+1 database round-trips.

    Args:
        session: Database session.
        league_id: League ID.
        members: List of dicts with keys player_id (int) and role (str, default "member").

    Returns:
        Dict with "added" (list of member dicts) and "failed" (list of
        {"player_id": int, "error": str}).
    """
    added: List[Dict] = []
    failed: List[Dict] = []

    # Validate inputs and collect valid player IDs
    valid_entries: List[tuple] = []  # (player_id, role)
    for item in members:
        player_id = item.get("player_id")
        role = item.get("role", "member")
        if player_id is None:
            failed.append({"player_id": player_id, "error": "Missing player_id"})
            continue
        try:
            pid = int(player_id)
        except (TypeError, ValueError):
            failed.append({"player_id": player_id, "error": "Invalid player_id"})
            continue
        valid_entries.append((pid, role))

    if not valid_entries:
        return {"added": added, "failed": failed}

    # Pre-fetch all existing member player_ids for this league in one query
    valid_pids = [pid for pid, _ in valid_entries]
    result = await session.execute(
        select(LeagueMember.player_id).where(
            and_(
                LeagueMember.league_id == league_id,
                LeagueMember.player_id.in_(valid_pids),
            )
        )
    )
    existing_pids = {row[0] for row in result.all()}

    # Collect new members to insert
    new_members: List[LeagueMember] = []
    new_entries: List[tuple] = []  # (player_id, role) for successful adds
    for pid, role in valid_entries:
        if pid in existing_pids:
            failed.append({"player_id": pid, "error": "Already a member"})
            continue
        new_members.append(LeagueMember(league_id=league_id, player_id=pid, role=role))
        new_entries.append((pid, role))

    # Batch insert all new members in a single transaction
    if new_members:
        try:
            session.add_all(new_members)
            await session.commit()
            for member in new_members:
                await session.refresh(member)
                added.append(
                    {
                        "id": member.id,
                        "league_id": member.league_id,
                        "player_id": member.player_id,
                        "role": member.role,
                    }
                )
        except Exception as e:
            await session.rollback()
            err_msg = str(e)
            if "foreign key" in err_msg.lower() or "unique" in err_msg.lower():
                err_msg = "Player not found or already a member"
            for pid, _ in new_entries:
                failed.append({"player_id": pid, "error": err_msg})

    return {"added": added, "failed": failed}


async def is_league_member(session: AsyncSession, league_id: int, player_id: int) -> bool:
    """Check if a player is a member of a league."""
    result = await session.execute(
        select(LeagueMember)
        .where(and_(LeagueMember.league_id == league_id, LeagueMember.player_id == player_id))
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def get_league_member_by_player(
    session: AsyncSession, league_id: int, player_id: int
) -> Optional[Dict]:
    """Get league member by player_id."""
    result = await session.execute(
        select(LeagueMember).where(
            and_(LeagueMember.league_id == league_id, LeagueMember.player_id == player_id)
        )
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
    session: AsyncSession, league_id: int, member_id: int, role: str
) -> Optional[Dict]:
    """Update a league member."""
    await session.execute(
        update(LeagueMember)
        .where(and_(LeagueMember.id == member_id, LeagueMember.league_id == league_id))
        .values(role=role)
    )
    await session.commit()

    result = await session.execute(
        select(LeagueMember).where(
            and_(LeagueMember.id == member_id, LeagueMember.league_id == league_id)
        )
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


async def remove_league_member(session: AsyncSession, league_id: int, member_id: int) -> bool:
    """Remove a league member."""
    result = await session.execute(
        delete(LeagueMember).where(
            and_(LeagueMember.id == member_id, LeagueMember.league_id == league_id)
        )
    )
    await session.commit()
    return result.rowcount > 0


async def get_league_member_user_ids(
    session: AsyncSession, league_id: int, exclude_user_id: Optional[int] = None
) -> List[int]:
    """
    Get user IDs for all league members.

    Args:
        session: Database session
        league_id: ID of the league
        exclude_user_id: Optional user ID to exclude from results

    Returns:
        List of user IDs
    """
    query = (
        select(Player.user_id)
        .join(LeagueMember, LeagueMember.player_id == Player.id)
        .where(and_(LeagueMember.league_id == league_id, Player.user_id.isnot(None)))
    )

    if exclude_user_id is not None:
        query = query.where(Player.user_id != exclude_user_id)

    result = await session.execute(query)
    user_ids = [row[0] for row in result.all() if row[0] is not None]
    return user_ids


async def get_league_admin_user_ids(session: AsyncSession, league_id: int) -> List[int]:
    """
    Get user IDs for all league admins.

    Args:
        session: Database session
        league_id: ID of the league

    Returns:
        List of user IDs
    """
    result = await session.execute(
        select(Player.user_id)
        .join(LeagueMember, LeagueMember.player_id == Player.id)
        .where(
            and_(
                LeagueMember.league_id == league_id,
                LeagueMember.role == "admin",
                Player.user_id.isnot(None),
            )
        )
    )
    user_ids = [row[0] for row in result.all() if row[0] is not None]
    return user_ids


# ---------------------------------------------------------------------------
# League Join Requests
# ---------------------------------------------------------------------------


async def create_league_request(session: AsyncSession, league_id: int, player_id: int) -> Dict:
    """Create a join request for an invite-only league."""
    # Check if a pending request already exists
    existing_request = await session.execute(
        select(LeagueRequest).where(
            and_(
                LeagueRequest.league_id == league_id,
                LeagueRequest.player_id == player_id,
                LeagueRequest.status == "pending",
            )
        )
    )
    if existing_request.scalar_one_or_none():
        raise ValueError("A pending join request already exists for this league")

    # Create new request
    request = LeagueRequest(league_id=league_id, player_id=player_id, status="pending")
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


def _join_request_row_to_dict(req, full_name):
    """Build a dict for a join request row (shared by pending and rejected lists)."""
    return {
        "id": req.id,
        "league_id": req.league_id,
        "player_id": req.player_id,
        "player_name": full_name,
        "status": req.status,
        "created_at": req.created_at.isoformat() if req.created_at else None,
    }


async def list_league_join_requests(session: AsyncSession, league_id: int) -> List[Dict]:
    """
    List pending join requests for a league (for admin UI).
    Returns each request with player full_name and created_at.
    """
    result = await session.execute(
        select(LeagueRequest, Player.full_name)
        .join(Player, LeagueRequest.player_id == Player.id)
        .where(
            and_(
                LeagueRequest.league_id == league_id,
                LeagueRequest.status == "pending",
            )
        )
        .order_by(LeagueRequest.created_at.asc())
    )
    rows = result.all()
    return [_join_request_row_to_dict(req, full_name) for req, full_name in rows]


async def list_league_join_requests_rejected(session: AsyncSession, league_id: int) -> List[Dict]:
    """
    List rejected join requests for a league (for admin UI).
    Allows admins to find declined requests and approve them later.
    """
    result = await session.execute(
        select(LeagueRequest, Player.full_name)
        .join(Player, LeagueRequest.player_id == Player.id)
        .where(
            and_(
                LeagueRequest.league_id == league_id,
                LeagueRequest.status == "rejected",
            )
        )
        .order_by(LeagueRequest.updated_at.desc())
    )
    rows = result.all()
    return [_join_request_row_to_dict(req, full_name) for req, full_name in rows]


async def cancel_league_request(session: AsyncSession, league_id: int, player_id: int) -> bool:
    """
    Cancel a pending join request for a league.

    Args:
        session: Database session
        league_id: League ID
        player_id: Player ID of the requesting user

    Returns:
        True if a pending request was found and deleted

    Raises:
        ValueError: If no pending request exists for this player and league
    """
    result = await session.execute(
        select(LeagueRequest).where(
            and_(
                LeagueRequest.league_id == league_id,
                LeagueRequest.player_id == player_id,
                LeagueRequest.status == "pending",
            )
        )
    )
    request = result.scalar_one_or_none()
    if not request:
        raise ValueError("No pending join request found for this league")

    await session.delete(request)
    await session.commit()
    return True


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------


async def get_setting(session: AsyncSession, key: str) -> Optional[str]:
    """
    Get a setting value - async version.

    Args:
        session: Database session
        key: Setting key

    Returns:
        Setting value or None if not found
    """
    result = await session.execute(select(Setting).where(Setting.key == key))
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
        index_elements=["key"], set_=dict(value=stmt.excluded.value, updated_at=sql_func.now())
    )
    await session.execute(stmt)
    await session.commit()
