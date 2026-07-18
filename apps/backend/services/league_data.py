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

__all__ = [
    "create_league",
    "list_leagues",
    "query_leagues",
    "get_league",
    "get_league_detail",
    "get_user_leagues",
    "update_league",
    "delete_league",
    "is_database_empty",
    "create_season",
    "resolve_active_season",
    "list_seasons",
    "get_season",
    "update_season",
    "create_location",
    "list_locations",
    "list_regions",
    "update_location",
    "delete_location",
    "create_court",
    "list_courts",
    "update_court",
    "delete_court",
    "get_league_home_courts",
    "add_league_home_court",
    "remove_league_home_court",
    "reorder_league_home_courts",
    "set_league_home_courts",
    "get_player_home_courts",
    "add_player_home_court",
    "remove_player_home_court",
    "set_player_home_courts",
    "reorder_player_home_courts",
    "list_league_members",
    "add_league_member",
    "add_league_members_batch",
    "is_league_member",
    "get_league_member_by_player",
    "update_league_member",
    "remove_league_member",
    "get_league_member_user_ids",
    "get_league_admin_user_ids",
    "has_pending_league_request",
    "create_league_request",
    "list_league_join_requests",
    "list_league_join_requests_rejected",
    "cancel_league_request",
    "get_setting",
    "set_setting",
    "get_league_standings",
    "get_invitable_players",
    "create_league_invites",
    "list_league_invites",
    "list_my_sent_invites",
    "list_my_received_invites",
    "respond_to_league_invite",
    "get_player_public_leagues",
]

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func, and_, or_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.sql import func as sql_func

from backend.database.models import (
    League,
    LeagueMember,
    LeagueMessage,
    LeagueConfig,
    LeagueRequest,
    LeagueInvite,
    LeagueHomeCourt,
    PlayerHomeCourt,
    Season,
    Session as SessionModel,
    Match,
    Location,
    Court,
    Player,
    PlayerSeasonStats,
    PlayerLeagueStats,
    PlayerGlobalStats,
    Setting,
    Region,
    ScoringSystem,
    Friend,
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
    # Commit the league together with its admin member. A new league
    # deliberately starts with NO season: seasons are explicit competitive
    # periods an admin creates when they want one. Until then league games are
    # logged as gap games (league_id set, season_id NULL) and standings fall
    # back to league all-time (see resolve_active_season).
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
    q: Optional[str] = None,
    is_open: Optional[bool] = None,
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
    if q is not None and q.strip():
        pattern = f"%{q.strip()}%"
        conditions.append(or_(League.name.ilike(pattern), League.description.ilike(pattern)))
    if is_open is not None:
        conditions.append(League.is_open == is_open)

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

    # Check for pending join requests when player is authenticated.
    # This is a bulk lookup across every league on the page, so it stays a
    # single IN-query rather than calling has_pending_league_request() in a
    # loop (which would issue one query per league).
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

    # Fetch friends who are members of the leagues on this page.
    # The friends table stores rows with player1_id < player2_id (DB constraint),
    # so we must check both orderings to find friendships for the current user.
    friends_by_league: Dict[int, list] = {}
    if player_id is not None and rows:
        page_league_ids = [league.id for league, *_ in rows]
        friends_result = await session.execute(
            select(
                LeagueMember.league_id,
                Player.id,
                Player.first_name,
                Player.last_name,
                Player.avatar,
            )
            .distinct()
            .join(Player, Player.id == LeagueMember.player_id)
            .join(
                Friend,
                or_(
                    and_(
                        Friend.player1_id == player_id,
                        Friend.player2_id == LeagueMember.player_id,
                    ),
                    and_(
                        Friend.player2_id == player_id,
                        Friend.player1_id == LeagueMember.player_id,
                    ),
                ),
            )
            .where(LeagueMember.league_id.in_(page_league_ids))
            .order_by(Player.first_name.asc())
        )
        for league_id, pid, first_name, last_name, avatar in friends_result.all():
            friends_by_league.setdefault(league_id, []).append(
                {
                    "player_id": pid,
                    "first_name": first_name,
                    "last_name": last_name,
                    "avatar": avatar,
                }
            )

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
            "friend_count": len(friends_by_league.get(league.id, [])),
            "friends_preview": friends_by_league.get(league.id, [])[:3],
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
    """Get a league by ID, including home courts and resolved location name."""
    result = await session.execute(
        select(League, Location.name.label("location_name"))
        .outerjoin(Location, Location.id == League.location_id)
        .where(League.id == league_id)
    )
    row = result.one_or_none()
    if not row:
        return None
    league, location_name = row

    # Fetch home courts
    home_courts = await get_league_home_courts(session, league_id)

    return {
        "id": league.id,
        "name": league.name,
        "description": league.description,
        "location_id": league.location_id,
        "location_name": location_name,
        "is_open": league.is_open,
        "whatsapp_group_id": league.whatsapp_group_id,
        "gender": league.gender,
        "level": league.level,
        "created_at": league.created_at.isoformat() if league.created_at else None,
        "updated_at": league.updated_at.isoformat() if league.updated_at else None,
        "home_courts": home_courts,
    }


async def get_league_detail(session: AsyncSession, league_id: int, user_id: int) -> Optional[Dict]:
    """Get enriched league detail including membership context and current-season stats.

    Returns all fields from get_league plus:
    - member_count, season_count
    - current_season_id/name/is_active: the genuinely-active season preferred;
      falls back to the most-recent season by start_date when none is active
      (e.g. an ended league), so the last season is still surfaced.
    - user_role, user_rank, user_wins, user_losses, user_rating (null for non-members)
    - has_pending_request: True when the caller has a pending join request for
      this league (drives the non-member "Request sent" CTA state)
    """
    # Base league + location
    result = await session.execute(
        select(League, Location.name.label("location_name"))
        .outerjoin(Location, Location.id == League.location_id)
        .where(League.id == league_id)
    )
    row = result.one_or_none()
    if not row:
        return None
    league, location_name = row

    home_courts = await get_league_home_courts(session, league_id)

    # Member count
    mc_result = await session.execute(
        select(func.count(LeagueMember.id)).where(LeagueMember.league_id == league_id)
    )
    member_count = int(mc_result.scalar() or 0)

    # Season count + most-recent season (by start_date desc, id desc)
    sc_result = await session.execute(
        select(func.count(Season.id)).where(Season.league_id == league_id)
    )
    season_count = int(sc_result.scalar() or 0)

    current_season_id: Optional[int] = None
    current_season_name: Optional[str] = None
    is_active = False
    if season_count > 0:
        # Prefer the genuinely-active season; fall back to most-recent by
        # start_date when nothing is active (e.g. an ended league).
        display_season = await _current_display_season(session, league_id)
        if display_season is not None:
            current_season_id = display_season.id
            current_season_name = display_season.name
            is_active = _is_season_active(display_season)

    # Resolve the caller's player_id (None if the user has no player profile)
    player_id_result = await session.execute(select(Player.id).where(Player.user_id == user_id))
    caller_player_id: Optional[int] = player_id_result.scalar_one_or_none()

    user_role: Optional[str] = None
    user_rank: Optional[int] = None
    user_wins: Optional[int] = None
    user_losses: Optional[int] = None
    user_rating: Optional[float] = None
    has_pending_request = False

    if caller_player_id is not None:
        # Membership role — checked first so a confirmed member skips the
        # pending-request lookup entirely (a member can't also have a
        # pending join request for the same league).
        role_result = await session.execute(
            select(LeagueMember.role).where(
                LeagueMember.league_id == league_id,
                LeagueMember.player_id == caller_player_id,
            )
        )
        role_row = role_result.scalar_one_or_none()
        if role_row is not None:
            user_role = str(role_row)
        else:
            # Pending join request — drives the non-member "Request sent" CTA state.
            has_pending_request = await has_pending_league_request(
                session, league_id, caller_player_id
            )

        # Current-season stats + rank
        if current_season_id is not None:
            stats_result = await session.execute(
                select(
                    PlayerSeasonStats.wins,
                    PlayerSeasonStats.games,
                    PlayerSeasonStats.points,
                ).where(
                    PlayerSeasonStats.season_id == current_season_id,
                    PlayerSeasonStats.player_id == caller_player_id,
                )
            )
            stats = stats_result.one_or_none()
            if stats:
                w = int(stats.wins or 0)
                g = int(stats.games or 0)
                user_wins = w
                user_losses = max(0, g - w)
                user_rating = float(stats.points or 0.0)

                # Rank within the season
                ranked_sq = (
                    select(
                        PlayerSeasonStats.player_id.label("player_id"),
                        func.row_number().over(order_by=_SEASON_RANK_ORDER).label("season_rank"),
                    )
                    .where(PlayerSeasonStats.season_id == current_season_id)
                    .subquery()
                )
                rank_result = await session.execute(
                    select(ranked_sq.c.season_rank).where(
                        ranked_sq.c.player_id == caller_player_id
                    )
                )
                rank_row = rank_result.scalar_one_or_none()
                if rank_row is not None:
                    user_rank = int(rank_row)

    return {
        "id": league.id,
        "name": league.name,
        "description": league.description,
        "location_id": league.location_id,
        "location_name": location_name,
        "is_open": league.is_open,
        "is_public": getattr(league, "is_public", False),
        "whatsapp_group_id": league.whatsapp_group_id,
        "gender": league.gender,
        "level": league.level,
        "created_at": league.created_at.isoformat() if league.created_at else None,
        "updated_at": league.updated_at.isoformat() if league.updated_at else None,
        "home_courts": home_courts,
        "member_count": member_count,
        "season_count": season_count,
        "current_season_id": current_season_id,
        "current_season_name": current_season_name,
        "is_active": is_active,
        "user_role": user_role,
        "user_rank": user_rank,
        "user_wins": user_wins,
        "user_losses": user_losses,
        "user_rating": user_rating,
        "has_pending_request": has_pending_request,
    }


# Canonical season-rank ordering. Used wherever a player's rank within a
# season is computed so the leagues list, league detail, and standings tab
# never disagree on tiebreakers. Points decide first; ties break by wins
# (players expect "more wins ranks higher"), then avg point diff and win rate.
_SEASON_RANK_ORDER = (
    PlayerSeasonStats.points.desc(),
    PlayerSeasonStats.wins.desc(),
    PlayerSeasonStats.avg_point_diff.desc(),
    PlayerSeasonStats.win_rate.desc(),
)


async def get_user_leagues(session: AsyncSession, user_id: int) -> List[Dict]:
    """Get all leagues a user is a member of, ordered by most recent session date.

    Each entry includes the league's current season (genuinely-active season
    preferred; falls back to most-recent-by-start_date when none is active),
    with ``is_active`` derived via the canonical ``_is_season_active`` helper.
    The user's stats in that season are included (``games_played`` plus a
    single-row ``standings`` array with wins, losses, win_rate, and
    ``season_rank``).

    Query budget: 2 queries regardless of how many leagues K the user belongs to.
    - Phase 1: one query for league membership + ordering context.
    - Phase 2a: one batch query for active seasons across all league IDs.
    - Phase 2b: one batch fallback query for the most-recent season in leagues
      that had no active season.
    (Phases 2a/2b together = 2 queries; subsequent stats/ranks are also batched.)
    """
    from backend.database.models import Session as SessionModel

    member_count_subq = (
        select(LeagueMember.league_id, func.count(LeagueMember.id).label("member_count"))
        .group_by(LeagueMember.league_id)
        .subquery()
    )

    # Derive league from Session.league_id directly so that gap sessions
    # (season_id=NULL, league_id set) contribute to a league's latest_session_date
    # ordering.  The previous Season join excluded all gap sessions.
    latest_session_subq = (
        select(
            SessionModel.league_id,
            func.max(SessionModel.date).label("latest_session_date"),
        )
        .where(SessionModel.league_id.isnot(None))
        .group_by(SessionModel.league_id)
        .subquery()
    )

    # Phase 1: fetch league membership + ordering context.
    # Exclude placeholder player rows so a user with both a placeholder and a
    # real Player record for the same league only appears once, keyed on the
    # real (non-placeholder) player.
    result = await session.execute(
        select(
            League,
            LeagueMember.role.label("membership_role"),
            Player.id.label("player_id"),
            Player.full_name.label("player_full_name"),
            func.coalesce(member_count_subq.c.member_count, 0).label("member_count"),
            Location.name.label("location_name"),
            latest_session_subq.c.latest_session_date,
        )
        .join(LeagueMember, LeagueMember.league_id == League.id)
        .join(Player, Player.id == LeagueMember.player_id)
        .outerjoin(member_count_subq, member_count_subq.c.league_id == League.id)
        .outerjoin(Location, Location.id == League.location_id)
        .outerjoin(latest_session_subq, latest_session_subq.c.league_id == League.id)
        .where(
            Player.user_id == user_id,
            Player.is_placeholder.is_(False),
        )
        .distinct()
        .order_by(
            latest_session_subq.c.latest_session_date.desc().nulls_last(),
            League.created_at.desc(),
        )
    )
    rows = result.all()

    if not rows:
        return []

    # Collect the full set of league IDs for this user (deduplicated).
    all_league_ids: list[int] = list({r[0].id for r in rows})

    # Phase 2: resolve seasons in exactly 2 queries regardless of K leagues.
    #
    # 2a — ONE batch query for active seasons across all league IDs.
    #      Dedup to one row per league using row_number() ordered by
    #      created_at DESC, id DESC (matching resolve_active_season's tiebreak).
    today = date.today()
    active_rn_sq = (
        select(
            Season,
            func.row_number()
            .over(
                partition_by=Season.league_id,
                order_by=(Season.created_at.desc(), Season.id.desc()),
            )
            .label("rn"),
        )
        .where(
            Season.league_id.in_(all_league_ids),
            *_active_season_conditions(today),
        )
        .subquery()
    )
    active_result = await session.execute(
        select(Season)
        .join(active_rn_sq, active_rn_sq.c.id == Season.id)
        .where(active_rn_sq.c.rn == 1)
    )
    active_by_league: Dict[int, Season] = {s.league_id: s for s in active_result.scalars().all()}

    # 2b — ONE fallback query: for leagues with NO active season, pick the
    #      most-recent season by start_date DESC, id DESC (display order).
    leagues_needing_fallback = [lid for lid in all_league_ids if lid not in active_by_league]
    fallback_by_league: Dict[int, Season] = {}
    if leagues_needing_fallback:
        fallback_rn_sq = (
            select(
                Season,
                func.row_number()
                .over(
                    partition_by=Season.league_id,
                    order_by=(Season.start_date.desc(), Season.id.desc()),
                )
                .label("rn"),
            )
            .where(Season.league_id.in_(leagues_needing_fallback))
            .subquery()
        )
        fallback_result = await session.execute(
            select(Season)
            .join(fallback_rn_sq, fallback_rn_sq.c.id == Season.id)
            .where(fallback_rn_sq.c.rn == 1)
        )
        fallback_by_league = {s.league_id: s for s in fallback_result.scalars().all()}

    # Build the per-league season map: active wins, fallback for the rest.
    league_seasons: Dict[int, Season | None] = {
        lid: active_by_league.get(lid) or fallback_by_league.get(lid) for lid in all_league_ids
    }

    # Build a per-row player_id map keyed by league_id so stats/rank are
    # computed against the correct (non-placeholder) player for each league.
    player_id_by_league: Dict[int, int] = {r[0].id: r.player_id for r in rows}

    # Gather season IDs that have a resolved season.
    season_ids_with_data: list[int] = [s.id for s in league_seasons.values() if s is not None]

    # Build the set of (season_id, player_id) pairs we need stats for.
    # A user could theoretically have different player rows in different leagues
    # (e.g. after claim), so we include all unique player_ids seen.
    all_player_ids: list[int] = list({pid for pid in player_id_by_league.values()})

    # Fetch PlayerSeasonStats for all relevant (player, season) combinations.
    # Key: (season_id, player_id) → stats row.
    stats_by_season_player: Dict[tuple[int, int], PlayerSeasonStats] = {}
    if season_ids_with_data and all_player_ids:
        stats_result = await session.execute(
            select(PlayerSeasonStats).where(
                and_(
                    PlayerSeasonStats.player_id.in_(all_player_ids),
                    PlayerSeasonStats.season_id.in_(season_ids_with_data),
                )
            )
        )
        for stats_row in stats_result.scalars().all():
            stats_by_season_player[(stats_row.season_id, stats_row.player_id)] = stats_row

    # Compute ranks: one windowed query covering all relevant seasons.
    # Key: (season_id, player_id) → rank.
    ranks_map: Dict[tuple[int, int], int] = {}
    if season_ids_with_data:
        ranked_sq = (
            select(
                PlayerSeasonStats.season_id.label("season_id"),
                PlayerSeasonStats.player_id.label("player_id"),
                func.row_number()
                .over(
                    partition_by=PlayerSeasonStats.season_id,
                    order_by=_SEASON_RANK_ORDER,
                )
                .label("season_rank"),
            )
            .where(PlayerSeasonStats.season_id.in_(season_ids_with_data))
            .subquery()
        )
        rank_result = await session.execute(
            select(
                ranked_sq.c.season_id,
                ranked_sq.c.player_id,
                ranked_sq.c.season_rank,
            ).where(ranked_sq.c.player_id.in_(all_player_ids))
        )
        for rank_row in rank_result.all():
            ranks_map[(rank_row.season_id, rank_row.player_id)] = int(rank_row.season_rank)

    league_games_by_season: Dict[int, int] = {}
    if season_ids_with_data:
        league_games_result = await session.execute(
            select(SessionModel.season_id, func.count(Match.id).label("game_count"))
            .join(Match, Match.session_id == SessionModel.id)
            .where(SessionModel.season_id.in_(season_ids_with_data))
            .group_by(SessionModel.season_id)
        )
        league_games_by_season = {
            int(row.season_id): int(row.game_count or 0) for row in league_games_result.all()
        }

    output: List[Dict] = []
    for r in rows:
        league_obj = r[0]
        # Use the per-row player_id to avoid mixing up stats when a user has
        # more than one Player record (e.g. after claiming a placeholder).
        row_player_id = r.player_id
        display_season = league_seasons.get(league_obj.id)

        season_data: Optional[Dict] = None
        if display_season is not None:
            season_data = {
                "id": display_season.id,
                "name": display_season.name or f"Season {display_season.id}",
                "start_date": (
                    display_season.start_date.isoformat() if display_season.start_date else None
                ),
                "end_date": (
                    display_season.end_date.isoformat() if display_season.end_date else None
                ),
                # Use the canonical null-safe rule — handles open-ended seasons.
                "is_active": _is_season_active(display_season),
            }

        stats = (
            stats_by_season_player.get((display_season.id, row_player_id))
            if display_season
            else None
        )
        user_games = int(stats.games) if stats and stats.games is not None else 0
        user_wins = int(stats.wins) if stats and stats.wins is not None else 0
        user_losses = max(0, user_games - user_wins)
        user_points = float(stats.points) if stats and stats.points is not None else 0.0
        user_win_rate = float(stats.win_rate) if stats and stats.win_rate is not None else 0.0
        user_avg_pt_diff = (
            float(stats.avg_point_diff) if stats and stats.avg_point_diff is not None else 0.0
        )
        season_id_for_rank = display_season.id if display_season else None
        user_rank = ranks_map.get((season_id_for_rank, row_player_id))

        standings: List[Dict] = []
        if user_games > 0 or user_rank is not None:
            standings.append(
                {
                    "player_id": row_player_id,
                    "name": r.player_full_name or "",
                    "elo": 0,
                    "points": user_points,
                    "games": user_games,
                    "wins": user_wins,
                    "losses": user_losses,
                    "win_rate": user_win_rate,
                    "avg_pt_diff": user_avg_pt_diff,
                    "season_rank": user_rank,
                }
            )

        output.append(
            {
                "id": league_obj.id,
                "name": league_obj.name,
                "description": league_obj.description,
                "location_id": league_obj.location_id,
                "location_name": r.location_name,
                "is_open": league_obj.is_open,
                "whatsapp_group_id": league_obj.whatsapp_group_id,
                "gender": league_obj.gender,
                "level": league_obj.level,
                "membership_role": r.membership_role,
                "member_count": int(r.member_count) if r.member_count is not None else 0,
                "created_at": (
                    league_obj.created_at.isoformat() if league_obj.created_at else None
                ),
                "updated_at": (
                    league_obj.updated_at.isoformat() if league_obj.updated_at else None
                ),
                "current_season": season_data,
                "games_played": user_games,
                "league_games_played": (
                    league_games_by_season.get(display_season.id, 0) if display_season else 0
                ),
                "standings": standings,
            }
        )
    return output


async def get_player_public_leagues(session: AsyncSession, player_id: int) -> list[dict] | None:
    """Get public leagues for a player by player ID.

    Returns None if the player does not exist (caller should return 404).
    Returns a list of slim dicts (id, name, rank, games_played) for all
    public leagues the player belongs to, ordered by most-recent session date.
    rank and games_played reflect the current (or most-recent) season.
    """
    # Verify player exists.
    player_exists = (
        await session.execute(select(Player.id).where(Player.id == player_id))
    ).scalar_one_or_none()
    if player_exists is None:
        return None

    # Phase 1: fetch leagues for this player (public only).
    latest_session_subq = (
        select(
            SessionModel.league_id,
            func.max(SessionModel.date).label("latest_session_date"),
        )
        .where(SessionModel.league_id.isnot(None))
        .group_by(SessionModel.league_id)
        .subquery()
    )

    result = await session.execute(
        select(
            League,
            latest_session_subq.c.latest_session_date,
        )
        .join(LeagueMember, LeagueMember.league_id == League.id)
        .outerjoin(latest_session_subq, latest_session_subq.c.league_id == League.id)
        .where(
            LeagueMember.player_id == player_id,
            League.is_public.is_(True),
        )
        .distinct()
        .order_by(
            latest_session_subq.c.latest_session_date.desc().nulls_last(),
            League.created_at.desc(),
        )
    )
    rows = result.all()

    if not rows:
        return []

    all_league_ids: list[int] = [r[0].id for r in rows]
    today = date.today()

    # Phase 2a: active seasons.
    active_rn_sq = (
        select(
            Season,
            func.row_number()
            .over(
                partition_by=Season.league_id,
                order_by=(Season.created_at.desc(), Season.id.desc()),
            )
            .label("rn"),
        )
        .where(
            Season.league_id.in_(all_league_ids),
            *_active_season_conditions(today),
        )
        .subquery()
    )
    active_result = await session.execute(
        select(Season)
        .join(active_rn_sq, active_rn_sq.c.id == Season.id)
        .where(active_rn_sq.c.rn == 1)
    )
    active_by_league: dict[int, Season] = {s.league_id: s for s in active_result.scalars().all()}

    # Phase 2b: fallback seasons for leagues with no active season.
    leagues_needing_fallback = [lid for lid in all_league_ids if lid not in active_by_league]
    fallback_by_league: dict[int, Season] = {}
    if leagues_needing_fallback:
        fallback_rn_sq = (
            select(
                Season,
                func.row_number()
                .over(
                    partition_by=Season.league_id,
                    order_by=(Season.start_date.desc(), Season.id.desc()),
                )
                .label("rn"),
            )
            .where(Season.league_id.in_(leagues_needing_fallback))
            .subquery()
        )
        fallback_result = await session.execute(
            select(Season)
            .join(fallback_rn_sq, fallback_rn_sq.c.id == Season.id)
            .where(fallback_rn_sq.c.rn == 1)
        )
        fallback_by_league = {s.league_id: s for s in fallback_result.scalars().all()}

    league_seasons: dict[int, Season | None] = {
        lid: active_by_league.get(lid) or fallback_by_league.get(lid) for lid in all_league_ids
    }

    season_ids_with_data: list[int] = [s.id for s in league_seasons.values() if s is not None]

    # Fetch stats for this player across all relevant seasons.
    stats_by_season: dict[int, PlayerSeasonStats] = {}
    if season_ids_with_data:
        stats_result = await session.execute(
            select(PlayerSeasonStats).where(
                and_(
                    PlayerSeasonStats.player_id == player_id,
                    PlayerSeasonStats.season_id.in_(season_ids_with_data),
                )
            )
        )
        for stats_row in stats_result.scalars().all():
            stats_by_season[stats_row.season_id] = stats_row

    # Compute rank per season using a windowed row_number over all players.
    ranks_by_season: dict[int, int] = {}
    if season_ids_with_data:
        ranked_sq = (
            select(
                PlayerSeasonStats.season_id.label("season_id"),
                PlayerSeasonStats.player_id.label("player_id"),
                func.row_number()
                .over(
                    partition_by=PlayerSeasonStats.season_id,
                    order_by=_SEASON_RANK_ORDER,
                )
                .label("season_rank"),
            )
            .where(PlayerSeasonStats.season_id.in_(season_ids_with_data))
            .subquery()
        )
        rank_result = await session.execute(
            select(
                ranked_sq.c.season_id,
                ranked_sq.c.season_rank,
            ).where(ranked_sq.c.player_id == player_id)
        )
        for rank_row in rank_result.all():
            ranks_by_season[rank_row.season_id] = int(rank_row.season_rank)

    output: list[dict] = []
    for r in rows:
        league_obj = r[0]
        display_season = league_seasons.get(league_obj.id)
        stats = stats_by_season.get(display_season.id) if display_season else None
        games_played = int(stats.games) if stats and stats.games is not None else 0
        rank = ranks_by_season.get(display_season.id) if display_season else None
        output.append(
            {
                "id": league_obj.id,
                "name": league_obj.name,
                "rank": rank,
                "games_played": games_played,
            }
        )
    return output


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
    """Check if a season is active based on its date range.

    Null bounds are treated as open: a season with no ``end_date`` (an
    open-ended / rolling season) is active indefinitely until an admin sets one.
    """
    if current_date is None:
        current_date = date.today()
    started = season.start_date is None or season.start_date <= current_date
    not_ended = season.end_date is None or season.end_date >= current_date
    return started and not_ended


def _active_season_conditions(today: date) -> list:
    """Canonical SQL conditions for 'season is active on ``today``'.

    A season is active when:
      (start_date IS NULL OR start_date <= today)
      AND (end_date IS NULL OR end_date >= today)

    Null bounds are treated as open-ended — identical semantics to
    :func:`_is_season_active`.  Use this in every query that filters for
    active seasons so the predicate has a single source of truth.

    Args:
        today: The reference date to evaluate activity against.

    Returns:
        A list of SQLAlchemy column expressions suitable for ``and_(*...)``.
    """
    return [
        or_(Season.start_date.is_(None), Season.start_date <= today),
        or_(Season.end_date.is_(None), Season.end_date >= today),
    ]


async def resolve_active_season(
    session: AsyncSession,
    league_id: int,
    today: date | None = None,
) -> Season | None:
    """Single canonical resolver for a league's active season.

    Active = (start_date IS NULL OR start_date <= today)
             AND (end_date IS NULL OR end_date >= today).
    Tiebreak: most-recently-created season, then highest ID when timestamps
    tie. Returns None when none qualify; never raises, never creates. ``today``
    is injectable for tests.

    Args:
        session: Async database session.
        league_id: ID of the league whose active season to resolve.
        today: Reference date; defaults to ``date.today()``.  Inject in tests
               to freeze time.

    Returns:
        The active :class:`Season` ORM object, or ``None`` if none qualifies.
    """
    if today is None:
        today = date.today()

    result = await session.execute(
        select(Season)
        .where(
            and_(
                Season.league_id == league_id,
                *_active_season_conditions(today),
            )
        )
        .order_by(Season.created_at.desc(), Season.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _current_display_season(session: AsyncSession, league_id: int) -> Season | None:
    """Return the season to display as a league's "current" season.

    Prefers the genuinely-active season via the canonical resolver; only when
    none qualifies does it fall back to the most-recent season by start_date
    so that an ended league still shows its last season (flagged inactive).
    Returns None when the league has no seasons at all.

    Args:
        session: Async database session.
        league_id: ID of the target league.

    Returns:
        A :class:`Season` ORM object, or ``None`` when no seasons exist.
    """
    active = await resolve_active_season(session, league_id)
    if active is not None:
        return active
    result = await session.execute(
        select(Season)
        .where(Season.league_id == league_id)
        .order_by(Season.start_date.desc(), Season.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def create_season(
    session: AsyncSession,
    league_id: int,
    name: Optional[str],
    start_date: str,
    end_date: Optional[str],
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
    """List seasons with one canonical active label and aggregate counts.

    Legacy date ranges may overlap. Only the season selected by the canonical
    resolver is labeled active so list consumers agree with automatic game and
    session attribution without rewriting historical season dates.
    """
    result = await session.execute(
        select(Season).where(Season.league_id == league_id).order_by(Season.start_date.desc())
    )
    seasons = result.scalars().all()
    if not seasons:
        return []

    season_ids = [s.id for s in seasons]
    today = date.today()
    active_season = await resolve_active_season(session, league_id, today=today)
    active_season_id = active_season.id if active_season is not None else None

    session_counts = {
        row.season_id: row.cnt
        for row in (
            await session.execute(
                select(SessionModel.season_id, func.count(SessionModel.id).label("cnt"))
                .where(SessionModel.season_id.in_(season_ids))
                .group_by(SessionModel.season_id)
            )
        ).all()
    }
    game_counts = {
        row.season_id: row.cnt
        for row in (
            await session.execute(
                select(SessionModel.season_id, func.count(Match.id).label("cnt"))
                .join(Match, Match.session_id == SessionModel.id)
                .where(SessionModel.season_id.in_(season_ids))
                .group_by(SessionModel.season_id)
            )
        ).all()
    }

    return [
        {
            "id": s.id,
            "league_id": s.league_id,
            "name": s.name,
            "start_date": s.start_date.isoformat() if s.start_date else None,
            "end_date": s.end_date.isoformat() if s.end_date else None,
            "is_active": s.id == active_season_id,
            "session_count": session_counts.get(s.id, 0),
            "game_count": game_counts.get(s.id, 0),
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
        {
            "id": court.id,
            "name": court.name,
            "address": court.address,
            "latitude": court.latitude,
            "longitude": court.longitude,
            "position": phc.position,
        }
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


async def has_pending_league_request(
    session: AsyncSession, league_id: int, player_id: int
) -> bool:
    """Check whether ``player_id`` has a pending join request for ``league_id``.

    Centralizes the "pending" status literal so every caller (league detail's
    CTA state, the join-request dedup check, the cancel-request flow) agrees
    on what counts as an outstanding request.
    """
    result = await session.execute(
        select(LeagueRequest.id).where(
            and_(
                LeagueRequest.league_id == league_id,
                LeagueRequest.player_id == player_id,
                LeagueRequest.status == "pending",
            )
        )
    )
    return result.scalar_one_or_none() is not None


async def create_league_request(session: AsyncSession, league_id: int, player_id: int) -> Dict:
    """Create a join request for an invite-only league."""
    if await has_pending_league_request(session, league_id, player_id):
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
    created_at_iso = req.created_at.isoformat() if req.created_at else None
    return {
        "id": req.id,
        "league_id": req.league_id,
        "player_id": req.player_id,
        "player_name": full_name,
        "display_name": full_name,
        "status": req.status,
        "created_at": created_at_iso,
        "requested_at": created_at_iso,
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
    if not await has_pending_league_request(session, league_id, player_id):
        raise ValueError("No pending join request found for this league")

    await session.execute(
        delete(LeagueRequest).where(
            and_(
                LeagueRequest.league_id == league_id,
                LeagueRequest.player_id == player_id,
                LeagueRequest.status == "pending",
            )
        )
    )
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


# ---------------------------------------------------------------------------
# League Standings
# ---------------------------------------------------------------------------


def _abbreviate_name(full_name: Optional[str]) -> str:
    """Convert 'Patrick Schwagler' → 'P. Schwagler'. Falls back to full_name."""
    if not full_name:
        return ""
    parts = full_name.strip().split()
    if len(parts) < 2:
        return full_name
    return f"{parts[0][0]}. {' '.join(parts[1:])}"


async def get_league_standings(
    session: AsyncSession,
    league_id: int,
    season_id: Optional[int] = None,
) -> Dict:
    """
    Return standings and season metadata for a league.

    When season_id is provided, returns per-season stats (PlayerSeasonStats).
    When season_id is None, returns aggregate league stats (PlayerLeagueStats).

    Returns:
        {"standings": [LeagueStandingEntry dicts], "season_info": dict | None}
    """
    from backend.services.player_data import generate_player_initials
    from backend.database.models import Session as SessionModel, Match

    if season_id is not None:
        rows_result = await session.execute(
            select(PlayerSeasonStats, Player)
            .join(Player, Player.id == PlayerSeasonStats.player_id)
            .where(PlayerSeasonStats.season_id == season_id)
            .order_by(*_SEASON_RANK_ORDER)
        )
        rows = rows_result.all()

        standings = []
        for rank, (stats, player) in enumerate(rows, start=1):
            losses = stats.games - stats.wins
            win_rate_pct = round(stats.win_rate * 100, 1)
            avatar_str = player.avatar or ""
            if len(avatar_str) > 2:
                avatar_url: Optional[str] = avatar_str
                initials = generate_player_initials(player.full_name or "")
            else:
                avatar_url = None
                initials = avatar_str or generate_player_initials(player.full_name or "")
            standings.append(
                {
                    "rank": rank,
                    "player_id": player.id,
                    "display_name": _abbreviate_name(player.full_name),
                    "initials": initials,
                    "avatar_url": avatar_url,
                    "wins": stats.wins,
                    "losses": losses,
                    "win_rate": win_rate_pct,
                    "rating": stats.points,
                    "rating_delta": None,
                    "games_played": stats.games,
                }
            )

        # Build season_info
        season_result = await session.execute(select(Season).where(Season.id == season_id))
        season = season_result.scalar_one_or_none()
        season_info = None
        if season:
            session_count_result = await session.execute(
                select(func.count(SessionModel.id)).where(SessionModel.season_id == season_id)
            )
            session_count = session_count_result.scalar() or 0

            game_count_result = await session.execute(
                select(func.count(Match.id))
                .join(SessionModel, Match.session_id == SessionModel.id)
                .where(SessionModel.season_id == season_id)
            )
            game_count = game_count_result.scalar() or 0

            season_info = {
                "id": season.id,
                "name": season.name or f"Season {season.id}",
                "started_at": season.start_date.isoformat() if season.start_date else None,
                "ended_at": season.end_date.isoformat() if season.end_date else None,
                "session_count": session_count,
                "game_count": game_count,
            }

        return {"standings": standings, "season_info": season_info}

    # All-time aggregate view
    rows_result = await session.execute(
        select(PlayerLeagueStats, Player, PlayerGlobalStats)
        .join(Player, Player.id == PlayerLeagueStats.player_id)
        .outerjoin(PlayerGlobalStats, PlayerGlobalStats.player_id == PlayerLeagueStats.player_id)
        .where(PlayerLeagueStats.league_id == league_id)
        .order_by(PlayerLeagueStats.wins.desc(), PlayerLeagueStats.win_rate.desc())
    )
    rows = rows_result.all()

    standings = []
    for rank, (stats, player, global_stats) in enumerate(rows, start=1):
        losses = stats.games - stats.wins
        win_rate_pct = round(stats.win_rate * 100, 1)
        avatar_str = player.avatar or ""
        if len(avatar_str) > 2:
            avatar_url: Optional[str] = avatar_str
            initials = generate_player_initials(player.full_name or "")
        else:
            avatar_url = None
            initials = avatar_str or generate_player_initials(player.full_name or "")
        standings.append(
            {
                "rank": rank,
                "player_id": player.id,
                "display_name": _abbreviate_name(player.full_name),
                "initials": initials,
                "avatar_url": avatar_url,
                "wins": stats.wins,
                "losses": losses,
                "win_rate": win_rate_pct,
                "rating": global_stats.current_rating if global_stats else None,
                "rating_delta": None,
                "games_played": stats.games,
            }
        )

    return {"standings": standings, "season_info": None}


# ---------------------------------------------------------------------------
# League Invites
# ---------------------------------------------------------------------------


async def get_invitable_players(
    session: AsyncSession,
    league_id: int,
    admin_player_id: int,
    query: Optional[str] = None,
) -> List[Dict]:
    """
    Return players that an admin can invite to a league, grouped by section.

    Sections (in priority order):
    - 'friends': players who are friends with the admin
    - 'recent_opponents': players the admin faced in recent matches (not friends)
    - 'suggested': all other players (capped at 20)

    Each player carries an ``invite_status`` indicating their relationship to the
    league: 'member', 'invited', 'requested', or 'none'.

    Args:
        session: Async database session.
        league_id: The league being administered.
        admin_player_id: Player ID of the admin performing the lookup.
        query: Optional name search string (case-insensitive prefix/substring).

    Returns:
        List of player dicts matching InvitablePlayerResponse shape.
    """
    from backend.services.player_data import generate_player_initials

    # 1. Pre-fetch exclusion sets in parallel via separate queries.
    member_result = await session.execute(
        select(LeagueMember.player_id).where(LeagueMember.league_id == league_id)
    )
    member_ids: set[int] = {r[0] for r in member_result.all()}

    invited_result = await session.execute(
        select(LeagueInvite.player_id).where(
            and_(LeagueInvite.league_id == league_id, LeagueInvite.status == "pending")
        )
    )
    invited_ids: set[int] = {r[0] for r in invited_result.all()}

    requested_result = await session.execute(
        select(LeagueRequest.player_id).where(
            and_(LeagueRequest.league_id == league_id, LeagueRequest.status == "pending")
        )
    )
    requested_ids: set[int] = {r[0] for r in requested_result.all()}

    # 2. Friend IDs for the admin.
    friend_result = await session.execute(
        select(Friend).where(
            or_(Friend.player1_id == admin_player_id, Friend.player2_id == admin_player_id)
        )
    )
    friend_ids: set[int] = set()
    for row in friend_result.scalars().all():
        other = row.player2_id if row.player1_id == admin_player_id else row.player1_id
        friend_ids.add(other)

    # 3. Recent opponent IDs (last 50 matches, not already friends).
    opponent_result = await session.execute(
        select(
            Match.team1_player1_id,
            Match.team1_player2_id,
            Match.team2_player1_id,
            Match.team2_player2_id,
        )
        .where(
            or_(
                Match.team1_player1_id == admin_player_id,
                Match.team1_player2_id == admin_player_id,
                Match.team2_player1_id == admin_player_id,
                Match.team2_player2_id == admin_player_id,
            )
        )
        .order_by(Match.id.desc())
        .limit(50)
    )
    recent_opponent_ids: set[int] = set()
    for t1p1, t1p2, t2p1, t2p2 in opponent_result.all():
        for pid in (t1p1, t1p2, t2p1, t2p2):
            if pid is not None and pid != admin_player_id and pid not in friend_ids:
                recent_opponent_ids.add(pid)

    # 4. Build player query (non-placeholder, non-self).
    player_q = (
        select(
            Player.id,
            Player.full_name,
            Player.level,
            Location.name.label("location_name"),
        )
        .outerjoin(Location, Location.id == Player.location_id)
        .where(
            and_(
                Player.id != admin_player_id,
                or_(Player.is_placeholder.is_(None), Player.is_placeholder.is_(False)),
            )
        )
    )
    if query:
        player_q = player_q.where(Player.full_name.ilike(f"%{query}%"))

    player_result = await session.execute(player_q.order_by(Player.full_name.asc()))
    rows = player_result.all()

    # 5. Assign sections and statuses.
    friends_list: List[Dict] = []
    opponents_list: List[Dict] = []
    suggested_list: List[Dict] = []

    for pid, full_name, level, location_name in rows:
        name = full_name or f"Player {pid}"
        initials = generate_player_initials(name)

        if pid in member_ids:
            inv_status = "member"
        elif pid in invited_ids:
            inv_status = "invited"
        elif pid in requested_ids:
            inv_status = "requested"
        else:
            inv_status = "none"

        player_dict = {
            "player_id": pid,
            "display_name": name,
            "initials": initials,
            "location_name": location_name,
            "level": level,
            "invite_status": inv_status,
        }

        if pid in friend_ids:
            friends_list.append({**player_dict, "section": "friends"})
        elif pid in recent_opponent_ids:
            opponents_list.append({**player_dict, "section": "recent_opponents"})
        else:
            suggested_list.append({**player_dict, "section": "suggested"})

    return friends_list + opponents_list + suggested_list[:20]


async def create_league_invites(
    session: AsyncSession,
    league_id: int,
    player_ids: List[int],
    invited_by_player_id: Optional[int] = None,
) -> int:
    """
    Bulk-insert league invite rows, skipping duplicates.

    Args:
        session: Async database session.
        league_id: The league being administered.
        player_ids: Players to invite.
        invited_by_player_id: Admin player who is sending the invites.

    Returns:
        Number of new invite rows actually inserted.
    """
    if not player_ids:
        return 0

    # Filter out players that already have a pending invite.
    existing_result = await session.execute(
        select(LeagueInvite.player_id).where(
            and_(
                LeagueInvite.league_id == league_id,
                LeagueInvite.player_id.in_(player_ids),
                LeagueInvite.status == "pending",
            )
        )
    )
    existing_ids: set[int] = {r[0] for r in existing_result.all()}
    new_ids = [pid for pid in player_ids if pid not in existing_ids]

    if not new_ids:
        return 0

    new_invites = [
        LeagueInvite(
            league_id=league_id,
            player_id=pid,
            invited_by_player_id=invited_by_player_id,
            status="pending",
        )
        for pid in new_ids
    ]
    session.add_all(new_invites)
    await session.commit()
    return len(new_invites)


async def _batch_game_counts(session: AsyncSession, player_ids: list[int]) -> dict[int, int]:
    """Return total match counts keyed by player ID for the given player IDs.

    Counts matches across all four player positions (team1_player1_id,
    team1_player2_id, team2_player1_id, team2_player2_id) using a single
    UNION ALL query, then aggregates per player.

    Args:
        session: Async database session.
        player_ids: List of player IDs to count games for.

    Returns:
        Dict mapping each player ID to their total match count.  Players with
        zero matches are absent from the dict; callers should use
        ``games_by_player.get(pid, 0)``.
    """
    if not player_ids:
        return {}

    game_count_result = await session.execute(
        select(
            Match.team1_player1_id.label("pid"),
            func.count(Match.id).label("cnt"),
        )
        .where(Match.team1_player1_id.in_(player_ids))
        .group_by(Match.team1_player1_id)
        .union_all(
            select(
                Match.team1_player2_id,
                func.count(Match.id),
            )
            .where(Match.team1_player2_id.in_(player_ids))
            .group_by(Match.team1_player2_id),
            select(
                Match.team2_player1_id,
                func.count(Match.id),
            )
            .where(Match.team2_player1_id.in_(player_ids))
            .group_by(Match.team2_player1_id),
            select(
                Match.team2_player2_id,
                func.count(Match.id),
            )
            .where(Match.team2_player2_id.in_(player_ids))
            .group_by(Match.team2_player2_id),
        )
    )
    games_by_player: dict[int, int] = {}
    for pid, cnt in game_count_result.all():
        games_by_player[pid] = games_by_player.get(pid, 0) + int(cnt)
    return games_by_player


async def list_league_invites(session: AsyncSession, league_id: int) -> List[Dict]:
    """
    List all invites for a league (admin view).

    Populates ``game_count`` for each invitee using a single batch query that
    counts the total matches they have participated in (any position on either
    team), giving admins a sense of each player's activity level.

    Args:
        session: Async database session.
        league_id: The league to query.

    Returns:
        List of dicts matching LeagueInviteItemResponse shape.
    """
    from backend.services.player_data import generate_player_initials

    result = await session.execute(
        select(
            LeagueInvite.id,
            LeagueInvite.league_id,
            League.name.label("league_name"),
            LeagueInvite.player_id,
            Player.full_name.label("display_name"),
            LeagueInvite.status,
            LeagueInvite.created_at.label("invited_at"),
        )
        .join(League, League.id == LeagueInvite.league_id)
        .join(Player, Player.id == LeagueInvite.player_id)
        .where(LeagueInvite.league_id == league_id)
        .order_by(LeagueInvite.created_at.desc())
    )
    rows = result.all()

    if not rows:
        return []

    player_ids = list({row.player_id for row in rows})
    games_by_player = await _batch_game_counts(session, player_ids)

    return [
        {
            "id": row.id,
            "league_id": row.league_id,
            "league_name": row.league_name or "Unknown League",
            "player_id": row.player_id,
            "display_name": row.display_name or f"Player {row.player_id}",
            "initials": generate_player_initials(row.display_name or ""),
            "invited_at": row.invited_at.isoformat() if row.invited_at else "",
            "status": row.status,
            "game_count": games_by_player.get(row.player_id, 0),
        }
        for row in rows
    ]


async def respond_to_league_invite(
    session: AsyncSession,
    league_id: int,
    player_id: int,
    action: str,
) -> dict:
    """
    Accept or decline a pending league invite on behalf of the invitee.

    Only the player named on the invite may call this (ownership is enforced
    by keying the lookup on both ``league_id`` and ``player_id``).

    On **accept**:
        - Sets invite status to 'accepted'.
        - Adds the player as a league member (role='member') unless they are
          already a member (idempotent).

    On **decline**:
        - Sets invite status to 'declined'.
        - Leaves league membership unchanged.

    Args:
        session: Async database session.
        league_id: The league the invite belongs to.
        player_id: The invitee's player ID (must be the caller).
        action: Either ``'accept'`` or ``'decline'``.

    Returns:
        Dict with a single key ``status`` set to ``'accepted'`` or
        ``'declined'``.

    Raises:
        ValueError: When no pending invite exists for ``(league_id, player_id)``.
    """
    # Fetch the pending invite for this exact (league, player) pair.
    invite_result = await session.execute(
        select(LeagueInvite).where(
            and_(
                LeagueInvite.league_id == league_id,
                LeagueInvite.player_id == player_id,
                LeagueInvite.status == "pending",
            )
        )
    )
    invite = invite_result.scalar_one_or_none()
    if invite is None:
        raise ValueError(
            f"No pending league invite found for player {player_id} in league {league_id}"
        )

    new_status = "accepted" if action == "accept" else "declined"

    # Update invite status (immutable pattern — we update the row in-place via
    # SQLAlchemy UPDATE rather than mutating the ORM object attributes directly).
    await session.execute(
        update(LeagueInvite).where(LeagueInvite.id == invite.id).values(status=new_status)
    )

    if action == "accept":
        # Add the player as a league member if they are not already one.
        existing_member_result = await session.execute(
            select(LeagueMember).where(
                and_(
                    LeagueMember.league_id == league_id,
                    LeagueMember.player_id == player_id,
                )
            )
        )
        if existing_member_result.scalar_one_or_none() is None:
            session.add(LeagueMember(league_id=league_id, player_id=player_id, role="member"))

    await session.commit()
    return {"status": new_status}


async def list_my_sent_invites(session: AsyncSession, player_id: int) -> List[Dict]:
    """List all invites sent by a given player across all leagues.

    Populates ``game_count`` for each invitee using a single batch query that
    counts the total matches they have participated in across all four match
    positions.

    Args:
        session: Async database session.
        player_id: The player whose sent invites to return.

    Returns:
        List of dicts matching LeagueInviteItemResponse shape, ordered by
        most-recently-created invite first.
    """
    from backend.services.player_data import generate_player_initials

    result = await session.execute(
        select(
            LeagueInvite.id,
            LeagueInvite.league_id,
            League.name.label("league_name"),
            LeagueInvite.player_id,
            Player.full_name.label("display_name"),
            LeagueInvite.status,
            LeagueInvite.created_at.label("invited_at"),
        )
        .join(League, League.id == LeagueInvite.league_id)
        .join(Player, Player.id == LeagueInvite.player_id)
        .where(LeagueInvite.invited_by_player_id == player_id)
        .order_by(LeagueInvite.created_at.desc())
    )
    rows = result.all()

    if not rows:
        return []

    invitee_ids = list({row.player_id for row in rows})
    games_by_player = await _batch_game_counts(session, invitee_ids)

    return [
        {
            "id": row.id,
            "league_id": row.league_id,
            "league_name": row.league_name or "Unknown League",
            "player_id": row.player_id,
            "display_name": row.display_name or f"Player {row.player_id}",
            "initials": generate_player_initials(row.display_name or ""),
            "invited_at": row.invited_at.isoformat() if row.invited_at else "",
            "status": row.status,
            "game_count": games_by_player.get(row.player_id, 0),
        }
        for row in rows
    ]


async def list_my_received_invites(session: AsyncSession, player_id: int) -> List[Dict]:
    """List all pending invites received by a given player across all leagues.

    Only pending invites are returned — the caller is expected to act on them
    (accept or decline).  Accepted and declined invites are excluded because
    they are no longer actionable.

    Populates ``game_count`` for the invitee (the current player) using the
    same batch approach as :func:`list_league_invites`, so the response shape
    is identical to :class:`LeagueInviteItemResponse`.

    Args:
        session: Async database session.
        player_id: The player whose received pending invites to return.

    Returns:
        List of dicts matching LeagueInviteItemResponse shape, ordered by
        most-recently-created invite first.
    """
    from backend.services.player_data import generate_player_initials

    result = await session.execute(
        select(
            LeagueInvite.id,
            LeagueInvite.league_id,
            League.name.label("league_name"),
            LeagueInvite.player_id,
            Player.full_name.label("display_name"),
            LeagueInvite.status,
            LeagueInvite.created_at.label("invited_at"),
        )
        .join(League, League.id == LeagueInvite.league_id)
        .join(Player, Player.id == LeagueInvite.player_id)
        .where(
            and_(
                LeagueInvite.player_id == player_id,
                LeagueInvite.status == "pending",
            )
        )
        .order_by(LeagueInvite.created_at.desc())
    )
    rows = result.all()

    if not rows:
        return []

    games_by_player = await _batch_game_counts(session, [player_id])

    return [
        {
            "id": row.id,
            "league_id": row.league_id,
            "league_name": row.league_name or "Unknown League",
            "player_id": row.player_id,
            "display_name": row.display_name or f"Player {row.player_id}",
            "initials": generate_player_initials(row.display_name or ""),
            "invited_at": row.invited_at.isoformat() if row.invited_at else "",
            "status": row.status,
            "game_count": games_by_player.get(player_id, 0),
        }
        for row in rows
    ]
