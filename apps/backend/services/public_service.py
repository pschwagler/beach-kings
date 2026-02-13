"""
Public service functions — no authentication required.

Provides read-only data access for SEO (sitemap, public pages).
"""

from typing import List, Dict, Optional

from sqlalchemy import and_, select, exists, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from backend.database.models import (
    Court,
    League,
    LeagueMember,
    Location,
    Match,
    Player,
    PlayerGlobalStats,
    PlayerSeasonStats,
    Region,
    Season,
    Session,
)
from backend.services.data_service import generate_player_initials


async def get_sitemap_leagues(session: AsyncSession) -> List[Dict]:
    """
    Get all public leagues for sitemap generation.

    Returns:
        List of dicts with id, name, updated_at for leagues where is_public=True.
    """
    result = await session.execute(
        select(League.id, League.name, League.updated_at).where(League.is_public == True)  # noqa: E712
    )
    return [
        {
            "id": row.id,
            "name": row.name,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        for row in result.all()
    ]


async def get_sitemap_players(session: AsyncSession) -> List[Dict]:
    """
    Get all players with at least 1 game for sitemap generation.

    Returns:
        List of dicts with id, full_name, updated_at for players with total_games >= 1.
    """
    result = await session.execute(
        select(Player.id, Player.full_name, Player.updated_at)
        .join(PlayerGlobalStats, PlayerGlobalStats.player_id == Player.id)
        .where(PlayerGlobalStats.total_games >= 1)
    )
    return [
        {
            "id": row.id,
            "full_name": row.full_name,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        for row in result.all()
    ]


async def get_sitemap_locations(session: AsyncSession) -> List[Dict]:
    """
    Get all locations that have a slug and at least 1 league for sitemap generation.

    Returns:
        List of dicts with slug, updated_at for locations with >=1 league.
    """
    result = await session.execute(
        select(Location.slug, Location.updated_at).where(
            Location.slug.isnot(None),
            exists(select(League.id).where(League.location_id == Location.id)),
        )
    )
    return [
        {
            "slug": row.slug,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        for row in result.all()
    ]


async def get_public_leagues(
    session: AsyncSession,
    location_id: Optional[str] = None,
    region_id: Optional[str] = None,
    gender: Optional[str] = None,
    level: Optional[str] = None,
    page: int = 1,
    page_size: int = 25,
) -> Dict:
    """
    Get paginated list of public leagues with filters.

    Params:
        location_id: Filter by location ID.
        region_id: Filter by region ID.
        gender: Filter by gender ('male', 'female', 'mixed').
        level: Filter by skill level.
        page: 1-based page number.
        page_size: Items per page.

    Returns:
        Paginated dict with items, page, page_size, total_count.
        Each item includes league info, location, member count, games played.
    """
    if page < 1:
        page = 1
    if page_size <= 0:
        page_size = 25

    # Subquery: member count per league
    member_count_subq = (
        select(LeagueMember.league_id, func.count(LeagueMember.id).label("member_count"))
        .group_by(LeagueMember.league_id)
        .subquery()
    )

    # Subquery: games played per league (count matches across all seasons)
    games_played_subq = (
        select(
            Season.league_id,
            func.count(Match.id).label("games_played"),
        )
        .join(Session, Session.season_id == Season.id)
        .join(Match, Match.session_id == Session.id)
        .group_by(Season.league_id)
        .subquery()
    )

    # Base query
    base_query = (
        select(
            League,
            func.coalesce(member_count_subq.c.member_count, 0).label("member_count"),
            func.coalesce(games_played_subq.c.games_played, 0).label("games_played"),
            Location.name.label("location_name"),
            Location.city.label("location_city"),
            Location.state.label("location_state"),
            Location.slug.label("location_slug"),
            Region.id.label("region_id"),
            Region.name.label("region_name"),
        )
        .outerjoin(member_count_subq, member_count_subq.c.league_id == League.id)
        .outerjoin(games_played_subq, games_played_subq.c.league_id == League.id)
        .outerjoin(Location, Location.id == League.location_id)
        .outerjoin(Region, Region.id == Location.region_id)
        .where(League.is_public == True)  # noqa: E712
    )

    # Build filter conditions
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
        base_query = base_query.where(and_(*conditions))

    # Total count
    count_query = (
        select(func.count(League.id))
        .select_from(League)
        .outerjoin(Location, Location.id == League.location_id)
        .where(League.is_public == True)  # noqa: E712
    )
    if conditions:
        count_query = count_query.where(and_(*conditions))
    total_count = (await session.execute(count_query)).scalar() or 0

    # Paginate + order by newest first
    offset = (page - 1) * page_size
    items_query = base_query.order_by(League.created_at.desc()).offset(offset).limit(page_size)

    result = await session.execute(items_query)
    rows = result.all()

    items = [
        {
            "id": league.id,
            "name": league.name,
            "description": league.description,
            "gender": league.gender,
            "level": league.level,
            "is_open": league.is_open,
            "member_count": int(member_count),
            "games_played": int(games_played),
            "location": {
                "id": league.location_id,
                "name": location_name,
                "city": location_city,
                "state": location_state,
                "slug": location_slug,
            }
            if league.location_id
            else None,
            "region": {
                "id": r_region_id,
                "name": region_name,
            }
            if r_region_id
            else None,
        }
        for (
            league,
            member_count,
            games_played,
            location_name,
            location_city,
            location_state,
            location_slug,
            r_region_id,
            region_name,
        ) in rows
    ]

    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total_count": total_count,
    }


async def get_public_league(session: AsyncSession, league_id: int) -> Optional[Dict]:
    """
    Get public-facing league data by ID.

    Public leagues (is_public=True): full data — info, member list with
    names/level/avatar, current season standings, last 20 match results, creator name.

    Private leagues (is_public=False): limited data — name, location,
    member count, creator name, games played.

    Returns:
        Dict with league data, or None if league not found.
    """
    # 1. Fetch league + location + creator
    creator_player = aliased(Player)
    result = await session.execute(
        select(League, Location, creator_player.full_name.label("creator_name"))
        .outerjoin(Location, League.location_id == Location.id)
        .outerjoin(creator_player, League.created_by == creator_player.id)
        .where(League.id == league_id)
    )
    row = result.first()
    if not row:
        return None

    league, location, creator_name = row

    # 2. Member count (always needed)
    member_count = (
        await session.execute(
            select(func.count(LeagueMember.id)).where(LeagueMember.league_id == league_id)
        )
    ).scalar() or 0

    # Base response (shared by public and private leagues)
    response = {
        "id": league.id,
        "name": league.name,
        "is_public": league.is_public,
        "gender": league.gender,
        "level": league.level,
        "member_count": member_count,
        "creator_name": creator_name,
        "location": {
            "id": location.id,
            "name": location.name,
            "city": location.city,
            "state": location.state,
            "slug": location.slug,
        }
        if location
        else None,
    }

    if not league.is_public:
        # Private league: add games_played count and return limited data
        games_played = (
            await session.execute(
                select(func.count(Match.id))
                .join(Session, Match.session_id == Session.id)
                .join(Season, Session.season_id == Season.id)
                .where(Season.league_id == league_id)
            )
        ).scalar() or 0
        response["games_played"] = games_played
        return response

    # --- Full data for public leagues ---
    response["description"] = league.description

    # 3. Member list
    members_result = await session.execute(
        select(
            LeagueMember.player_id,
            LeagueMember.role,
            Player.full_name,
            Player.level,
            Player.avatar,
        )
        .join(Player, Player.id == LeagueMember.player_id)
        .where(LeagueMember.league_id == league_id)
        .order_by(Player.full_name.asc())
    )
    response["members"] = [
        {
            "player_id": r.player_id,
            "full_name": r.full_name,
            "level": r.level,
            "avatar": r.avatar or generate_player_initials(r.full_name or ""),
            "role": r.role,
        }
        for r in members_result.all()
    ]

    # 4. Current season + standings
    latest_season = (
        await session.execute(
            select(Season)
            .where(Season.league_id == league_id)
            .order_by(Season.start_date.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if latest_season:
        response["current_season"] = {
            "id": latest_season.id,
            "name": latest_season.name,
            "start_date": str(latest_season.start_date),
            "end_date": str(latest_season.end_date),
        }
        standings_result = await session.execute(
            select(
                PlayerSeasonStats.player_id,
                Player.full_name,
                PlayerSeasonStats.games,
                PlayerSeasonStats.wins,
                PlayerSeasonStats.points,
                PlayerSeasonStats.win_rate,
                PlayerSeasonStats.avg_point_diff,
            )
            .join(Player, Player.id == PlayerSeasonStats.player_id)
            .where(PlayerSeasonStats.season_id == latest_season.id)
            .order_by(
                PlayerSeasonStats.points.desc(),
                PlayerSeasonStats.avg_point_diff.desc(),
                PlayerSeasonStats.win_rate.desc(),
            )
        )
        response["standings"] = [
            {
                "rank": rank,
                "player_id": r.player_id,
                "full_name": r.full_name,
                "games": r.games,
                "wins": r.wins,
                "points": r.points,
                "win_rate": r.win_rate,
                "avg_point_diff": r.avg_point_diff,
            }
            for rank, r in enumerate(standings_result.all(), 1)
        ]
    else:
        response["current_season"] = None
        response["standings"] = []

    # 5. Last 20 match results
    p1 = aliased(Player)
    p2 = aliased(Player)
    p3 = aliased(Player)
    p4 = aliased(Player)
    matches_result = await session.execute(
        select(
            Match.id,
            Match.date,
            Match.team1_score,
            Match.team2_score,
            Match.winner,
            p1.full_name.label("t1p1"),
            p2.full_name.label("t1p2"),
            p3.full_name.label("t2p1"),
            p4.full_name.label("t2p2"),
        )
        .join(Session, Match.session_id == Session.id)
        .join(Season, Session.season_id == Season.id)
        .outerjoin(p1, Match.team1_player1_id == p1.id)
        .outerjoin(p2, Match.team1_player2_id == p2.id)
        .outerjoin(p3, Match.team2_player1_id == p3.id)
        .outerjoin(p4, Match.team2_player2_id == p4.id)
        .where(Season.league_id == league_id)
        .order_by(Match.id.desc())
        .limit(20)
    )
    response["recent_matches"] = [
        {
            "id": r.id,
            "date": r.date,
            "team1_player1": r.t1p1,
            "team1_player2": r.t1p2,
            "team2_player1": r.t2p1,
            "team2_player2": r.t2p2,
            "team1_score": r.team1_score,
            "team2_score": r.team2_score,
            "winner": r.winner,
        }
        for r in matches_result.all()
    ]

    return response


async def get_public_player(session: AsyncSession, player_id: int) -> Optional[Dict]:
    """
    Get public-facing player profile by ID.

    Returns player info, global stats, location, and public league memberships.
    Only players with total_games >= 1 are publicly visible (returns None otherwise).

    Returns:
        Dict with player data, or None if player not found or has no games.
    """
    # 1. Fetch player + global stats + location
    result = await session.execute(
        select(Player, PlayerGlobalStats, Location)
        .join(PlayerGlobalStats, PlayerGlobalStats.player_id == Player.id)
        .outerjoin(Location, Player.location_id == Location.id)
        .where(Player.id == player_id, PlayerGlobalStats.total_games >= 1)
    )
    row = result.first()
    if not row:
        return None

    player, stats, location = row

    # 2. Public league memberships
    memberships_result = await session.execute(
        select(League.id, League.name)
        .join(LeagueMember, LeagueMember.league_id == League.id)
        .where(
            LeagueMember.player_id == player_id,
            League.is_public == True,  # noqa: E712
        )
        .order_by(League.name.asc())
    )

    win_rate = round(stats.total_wins / stats.total_games, 4) if stats.total_games > 0 else 0.0

    return {
        "id": player.id,
        "full_name": player.full_name,
        "avatar": player.avatar or generate_player_initials(player.full_name or ""),
        "gender": player.gender,
        "level": player.level,
        "location": {
            "id": location.id,
            "name": location.name,
            "city": location.city,
            "state": location.state,
            "slug": location.slug,
        }
        if location
        else None,
        "stats": {
            "current_rating": stats.current_rating,
            "total_games": stats.total_games,
            "total_wins": stats.total_wins,
            "win_rate": win_rate,
        },
        "league_memberships": [
            {"league_id": r.id, "league_name": r.name}
            for r in memberships_result.all()
        ],
        "created_at": player.created_at.isoformat() if player.created_at else None,
        "updated_at": player.updated_at.isoformat() if player.updated_at else None,
    }


async def get_public_locations(session: AsyncSession) -> List[Dict]:
    """
    Get all locations with slugs for the public location directory.

    Returns locations grouped by region, each with basic stats
    (league count, player count). Only locations with a slug are included.

    Returns:
        List of dicts with region info and nested locations list.
    """
    # 1. Fetch all locations with slugs, joined to region
    result = await session.execute(
        select(Location, Region)
        .outerjoin(Region, Location.region_id == Region.id)
        .where(Location.slug.isnot(None))
        .order_by(Region.name.asc(), Location.city.asc())
    )
    rows = result.all()

    if not rows:
        return []

    # 2. Collect location IDs for batch stat queries
    location_ids = [row.Location.id for row in rows]

    # 3. League counts per location (public only)
    league_counts_result = await session.execute(
        select(
            League.location_id,
            func.count(League.id).label("league_count"),
        )
        .where(
            League.location_id.in_(location_ids),
            League.is_public == True,  # noqa: E712
        )
        .group_by(League.location_id)
    )
    league_counts = {r.location_id: r.league_count for r in league_counts_result.all()}

    # 4. Player counts per location (players with >=1 game)
    player_counts_result = await session.execute(
        select(
            Player.location_id,
            func.count(Player.id).label("player_count"),
        )
        .join(PlayerGlobalStats, PlayerGlobalStats.player_id == Player.id)
        .where(
            Player.location_id.in_(location_ids),
            PlayerGlobalStats.total_games >= 1,
        )
        .group_by(Player.location_id)
    )
    player_counts = {r.location_id: r.player_count for r in player_counts_result.all()}

    # 5. Group by region
    regions_map: Dict[str, Dict] = {}
    no_region_locations: List[Dict] = []

    for row in rows:
        loc = row.Location
        region = row.Region

        loc_data = {
            "id": loc.id,
            "name": loc.name,
            "city": loc.city,
            "state": loc.state,
            "slug": loc.slug,
            "league_count": league_counts.get(loc.id, 0),
            "player_count": player_counts.get(loc.id, 0),
        }

        if region:
            if region.id not in regions_map:
                regions_map[region.id] = {
                    "id": region.id,
                    "name": region.name,
                    "locations": [],
                }
            regions_map[region.id]["locations"].append(loc_data)
        else:
            no_region_locations.append(loc_data)

    result_list = list(regions_map.values())

    # Append ungrouped locations under "Other" if any exist
    if no_region_locations:
        result_list.append({
            "id": None,
            "name": "Other",
            "locations": no_region_locations,
        })

    return result_list


async def get_public_location_by_slug(session: AsyncSession, slug: str) -> Optional[Dict]:
    """
    Get public-facing location data by URL slug.

    Returns location info, public leagues, top 20 players by ELO,
    courts, and aggregate stats (total players, matches, leagues).

    Returns:
        Dict with location data, or None if slug not found.
    """
    # 1. Fetch location + region
    result = await session.execute(
        select(Location, Region)
        .outerjoin(Region, Location.region_id == Region.id)
        .where(Location.slug == slug)
    )
    row = result.first()
    if not row:
        return None

    location, region = row

    # 2. Public leagues at this location
    leagues_result = await session.execute(
        select(
            League.id,
            League.name,
            League.gender,
            League.level,
            func.count(LeagueMember.id).label("member_count"),
        )
        .outerjoin(LeagueMember, LeagueMember.league_id == League.id)
        .where(
            League.location_id == location.id,
            League.is_public == True,  # noqa: E712
        )
        .group_by(League.id, League.name, League.gender, League.level)
        .order_by(League.name.asc())
    )
    leagues = [
        {
            "id": r.id,
            "name": r.name,
            "gender": r.gender,
            "level": r.level,
            "member_count": r.member_count,
        }
        for r in leagues_result.all()
    ]

    # 3. Top 20 players by ELO at this location
    players_result = await session.execute(
        select(
            Player.id,
            Player.full_name,
            Player.level,
            Player.avatar,
            PlayerGlobalStats.current_rating,
            PlayerGlobalStats.total_games,
            PlayerGlobalStats.total_wins,
        )
        .join(PlayerGlobalStats, PlayerGlobalStats.player_id == Player.id)
        .where(
            Player.location_id == location.id,
            PlayerGlobalStats.total_games >= 1,
        )
        .order_by(PlayerGlobalStats.current_rating.desc())
        .limit(20)
    )
    top_players = [
        {
            "id": r.id,
            "full_name": r.full_name,
            "level": r.level,
            "avatar": r.avatar or generate_player_initials(r.full_name or ""),
            "current_rating": r.current_rating,
            "total_games": r.total_games,
            "total_wins": r.total_wins,
        }
        for r in players_result.all()
    ]

    # 4. Courts at this location
    courts_result = await session.execute(
        select(Court.id, Court.name, Court.address)
        .where(Court.location_id == location.id)
        .order_by(Court.name.asc())
    )
    courts = [
        {"id": r.id, "name": r.name, "address": r.address}
        for r in courts_result.all()
    ]

    # 5. Aggregate stats (single query with scalar subqueries)
    player_count_subq = (
        select(func.count(Player.id))
        .join(PlayerGlobalStats, PlayerGlobalStats.player_id == Player.id)
        .where(
            Player.location_id == location.id,
            PlayerGlobalStats.total_games >= 1,
        )
        .correlate()
        .scalar_subquery()
    )
    league_count_subq = (
        select(func.count(League.id))
        .where(
            League.location_id == location.id,
            League.is_public == True,  # noqa: E712
        )
        .correlate()
        .scalar_subquery()
    )
    match_count_subq = (
        select(func.count(Match.id))
        .join(Session, Match.session_id == Session.id)
        .join(Season, Session.season_id == Season.id)
        .join(League, Season.league_id == League.id)
        .where(League.location_id == location.id)
        .correlate()
        .scalar_subquery()
    )
    stats_row = (
        await session.execute(
            select(player_count_subq, league_count_subq, match_count_subq)
        )
    ).one()
    total_players = stats_row[0] or 0
    total_leagues = stats_row[1] or 0
    total_matches = stats_row[2] or 0

    return {
        "id": location.id,
        "name": location.name,
        "city": location.city,
        "state": location.state,
        "slug": location.slug,
        "latitude": location.latitude,
        "longitude": location.longitude,
        "region": {
            "id": region.id,
            "name": region.name,
        }
        if region
        else None,
        "leagues": leagues,
        "top_players": top_players,
        "courts": courts,
        "stats": {
            "total_players": total_players,
            "total_leagues": total_leagues,
            "total_matches": total_matches,
        },
    }
