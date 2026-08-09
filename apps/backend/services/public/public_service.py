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
    Session,
    User,
)
from backend.services.data_service import generate_player_initials
from backend.services.social.relationship_service import resolve_relationship
from backend.services.players.player_lifecycle import historical_id, historical_name


async def get_sitemap_leagues(session: AsyncSession) -> List[Dict]:
    """
    Get all public leagues for sitemap generation.

    Returns:
        List of dicts with id, name, updated_at for leagues where is_public=True.
    """
    result = await session.execute(
        select(League.id, League.name, League.updated_at)
        .where(League.is_public == True)  # noqa: E712
        .limit(50000)
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
        .where(PlayerGlobalStats.total_games >= 1, Player.deleted_at.is_(None))
        .limit(50000)
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
        select(Location.slug, Location.updated_at)
        .where(
            Location.slug.isnot(None),
            exists(select(League.id).where(League.location_id == Location.id)),
        )
        .limit(50000)
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

    # Subquery: games played per league (count matches across all sessions,
    # including gap-game sessions that have no season_id).
    games_played_subq = (
        select(
            Session.league_id,
            func.count(Match.id).label("games_played"),
        )
        .join(Match, Match.session_id == Session.id)
        .where(Session.league_id.isnot(None))
        .group_by(Session.league_id)
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
        # Private league: add games_played count and return limited data.
        # Filter by Session.league_id so gap sessions (season_id=NULL) are counted.
        games_played = (
            await session.execute(
                select(func.count(Match.id))
                .join(Session, Match.session_id == Session.id)
                .where(Session.league_id == league_id)
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
            Player.profile_picture_url,
        )
        .join(Player, Player.id == LeagueMember.player_id)
        .where(LeagueMember.league_id == league_id, Player.deleted_at.is_(None))
        .order_by(Player.full_name.asc())
    )
    response["members"] = [
        {
            "player_id": r.player_id,
            "full_name": r.full_name,
            "level": r.level,
            "avatar": (
                r.profile_picture_url or r.avatar or generate_player_initials(r.full_name or "")
            ),
            "role": r.role,
        }
        for r in members_result.all()
    ]

    # 4. Current season + standings
    # Prefer the genuinely-active season; fall back to the most-recent by
    # start_date so an ended league still shows its last season.
    from backend.services.leagues.league_data import _current_display_season

    latest_season = await _current_display_season(session, league_id)

    if latest_season:
        response["current_season"] = {
            "id": latest_season.id,
            "name": latest_season.name,
            "start_date": str(latest_season.start_date),
            "end_date": str(latest_season.end_date),
        }
        # Standings include all players regardless of profile_is_private.
        # The privacy flag only gates W-L stats on the individual player-profile
        # endpoint — league standings are always fully visible.
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
            .where(
                PlayerSeasonStats.season_id == latest_season.id,
                Player.deleted_at.is_(None),
            )
            .order_by(
                PlayerSeasonStats.points.desc(),
                PlayerSeasonStats.avg_point_diff.desc(),
                PlayerSeasonStats.win_rate.desc(),
            )
        )
        # enumerate starts at 1; ranks are contiguous 1..N.
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
    # Use Session.league_id to match gap sessions (season_id=NULL).
    # The previous INNER join on Season silently excluded all gap games.
    matches_result = await session.execute(
        select(
            Match.id,
            Session.date.label("date"),
            Match.team1_score,
            Match.team2_score,
            Match.winner,
            Match.team1_player1_id,
            Match.team1_player2_id,
            Match.team2_player1_id,
            Match.team2_player2_id,
            p1.full_name.label("t1p1"),
            p2.full_name.label("t1p2"),
            p3.full_name.label("t2p1"),
            p4.full_name.label("t2p2"),
            p1.deleted_at.label("t1p1_deleted_at"),
            p2.deleted_at.label("t1p2_deleted_at"),
            p3.deleted_at.label("t2p1_deleted_at"),
            p4.deleted_at.label("t2p2_deleted_at"),
        )
        .join(Session, Match.session_id == Session.id)
        .outerjoin(p1, Match.team1_player1_id == p1.id)
        .outerjoin(p2, Match.team1_player2_id == p2.id)
        .outerjoin(p3, Match.team2_player1_id == p3.id)
        .outerjoin(p4, Match.team2_player2_id == p4.id)
        .where(Session.league_id == league_id)
        .order_by(Match.id.desc())
        .limit(20)
    )
    response["recent_matches"] = [
        {
            "id": r.id,
            "date": r.date,
            "team1_player1": historical_name(r.t1p1, r.t1p1_deleted_at),
            "team1_player2": historical_name(r.t1p2, r.t1p2_deleted_at),
            "team2_player1": historical_name(r.t2p1, r.t2p1_deleted_at),
            "team2_player2": historical_name(r.t2p2, r.t2p2_deleted_at),
            "team1_player1_id": historical_id(r.team1_player1_id, r.t1p1_deleted_at),
            "team1_player2_id": historical_id(r.team1_player2_id, r.t1p2_deleted_at),
            "team2_player1_id": historical_id(r.team2_player1_id, r.t2p1_deleted_at),
            "team2_player2_id": historical_id(r.team2_player2_id, r.t2p2_deleted_at),
            "team1_score": r.team1_score,
            "team2_score": r.team2_score,
            "winner": r.winner,
        }
        for r in matches_result.all()
    ]

    return response


async def get_public_player(
    session: AsyncSession,
    player_id: int,
    viewer_user: Optional[Dict] = None,
) -> Optional[Dict]:
    """
    Get public-facing player profile by ID, with privacy gating applied.

    Privacy model:
    - **Always visible**: name, avatar, level, city/state, current_rating,
      total_games, and league_memberships.
    - **game_history_visible** flag (``show_game_history=True`` OR viewer is
      the owner): when True, W-L record (``total_wins``, ``win_rate``) are
      included in stats.  When False, those two fields are ``None``.
    - ``profile_is_private`` is stored but no longer gates any part of the
      response — it is a no-op for display purposes.

    Only players with total_games >= 1 are publicly visible to anonymous /
    unrelated viewers. The owner and accepted friends may fetch the direct
    profile even before the player has logged a game.

    Args:
        session: Database session.
        player_id: Target player ID.
        viewer_user: Optional authenticated user dict from
            ``get_current_user_optional``.  ``None`` means unauthenticated.

    Returns:
        Dict with player data (possibly floor-only), or ``None`` if the player
        is not found or is hidden from this viewer.
    """
    # 1. Fetch player + global stats + location + owning user's privacy flags
    result = await session.execute(
        select(
            Player, PlayerGlobalStats, Location, User.profile_is_private, User.show_game_history
        )
        .outerjoin(PlayerGlobalStats, PlayerGlobalStats.player_id == Player.id)
        .outerjoin(Location, Player.location_id == Location.id)
        .outerjoin(User, User.id == Player.user_id)
        .where(Player.id == player_id, Player.deleted_at.is_(None))
    )
    row = result.first()
    if not row:
        return None

    player, stats, location, profile_is_private, show_game_history = row
    total_games = int(stats.total_games) if stats and stats.total_games is not None else 0

    # Normalise NULL values coming from players that have no linked user
    # (e.g. placeholders) — treat them as fully public.
    profile_is_private = bool(profile_is_private)
    show_game_history = bool(show_game_history)

    # Resolve viewer identity
    viewer_user_id: Optional[int] = viewer_user["id"] if viewer_user else None
    is_self = viewer_user_id is not None and player.user_id == viewer_user_id
    viewer_player_id: Optional[int] = None
    if viewer_user_id is not None:
        viewer_player_result = await session.execute(
            select(Player.id).where(Player.user_id == viewer_user_id).limit(1)
        )
        viewer_player_id = viewer_player_result.scalar_one_or_none()

    relationship = {"status": "none", "request_id": None}
    if viewer_player_id is not None:
        relationship = await resolve_relationship(session, viewer_player_id, player_id)
    if total_games < 1 and relationship["status"] == "none":
        return None

    # game_history_visible: owner always sees full record; others see it only
    # when the player has opted in via show_game_history.
    # profile_is_private is preserved in the response for client use but no
    # longer gates any part of the server response.
    game_history_visible = is_self or bool(show_game_history)

    # 2. Location dict (always included)
    location_dict = (
        {
            "id": location.id,
            "name": location.name,
            "city": location.city,
            "state": location.state,
            "slug": location.slug,
        }
        if location
        else None
    )

    # 3. Stats — current_rating and total_games always visible.
    # W-L record (total_wins, win_rate) gated on game_history_visible.
    total_wins = int(stats.total_wins) if stats and stats.total_wins is not None else 0
    current_rating = float(stats.current_rating) if stats else 1200.0
    win_rate = round(total_wins / total_games, 4) if total_games > 0 else 0.0

    if game_history_visible:
        stats_dict = {
            "current_rating": current_rating,
            "total_games": total_games,
            "total_wins": total_wins,
            "win_rate": win_rate,
        }
    else:
        stats_dict = {
            "current_rating": current_rating,
            "total_games": total_games,
            "total_wins": None,
            "win_rate": None,
        }

    # 4. League memberships — always populated, not gated on privacy flags.
    memberships_result = await session.execute(
        select(League.id, League.name)
        .join(LeagueMember, LeagueMember.league_id == League.id)
        .where(
            LeagueMember.player_id == player_id,
            League.is_public == True,  # noqa: E712
        )
        .order_by(League.name.asc())
    )
    league_memberships = [
        {"league_id": r.id, "league_name": r.name} for r in memberships_result.all()
    ]

    return {
        "id": player.id,
        "full_name": player.full_name,
        "avatar": (
            player.profile_picture_url
            or player.avatar
            or generate_player_initials(player.full_name or "")
        ),
        "gender": player.gender,
        "level": player.level,
        "city": player.city,
        "state": player.state,
        "is_placeholder": player.is_placeholder,
        "location": location_dict,
        "stats": stats_dict,
        "league_memberships": league_memberships,
        "game_history_visible": game_history_visible,
        "profile_is_private": profile_is_private,
        "friend_status": relationship["status"],
        "friend_request_id": relationship["request_id"],
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
            Player.deleted_at.is_(None),
        )
        .group_by(Player.location_id)
    )
    player_counts = {r.location_id: r.player_count for r in player_counts_result.all()}

    # 5. Court counts per location (approved + active only)
    court_counts_result = await session.execute(
        select(
            Court.location_id,
            func.count(Court.id).label("court_count"),
        )
        .where(
            Court.location_id.in_(location_ids),
            Court.status == "approved",
            Court.is_active == True,  # noqa: E712
        )
        .group_by(Court.location_id)
    )
    court_counts = {r.location_id: r.court_count for r in court_counts_result.all()}

    # 6. Group by region
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
            "court_count": court_counts.get(loc.id, 0),
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
        result_list.append(
            {
                "id": None,
                "name": "Other",
                "locations": no_region_locations,
            }
        )

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
            Player.profile_picture_url,
            PlayerGlobalStats.current_rating,
            PlayerGlobalStats.total_games,
            PlayerGlobalStats.total_wins,
        )
        .join(PlayerGlobalStats, PlayerGlobalStats.player_id == Player.id)
        .where(
            Player.location_id == location.id,
            PlayerGlobalStats.total_games >= 1,
            Player.deleted_at.is_(None),
        )
        .order_by(PlayerGlobalStats.current_rating.desc())
        .limit(20)
    )
    top_players = [
        {
            "id": r.id,
            "full_name": r.full_name,
            "level": r.level,
            "avatar": (
                r.profile_picture_url or r.avatar or generate_player_initials(r.full_name or "")
            ),
            "current_rating": r.current_rating,
            "total_games": r.total_games,
            "total_wins": r.total_wins,
        }
        for r in players_result.all()
    ]

    # 4. Courts at this location (approved + active only)
    courts_result = await session.execute(
        select(
            Court.id,
            Court.name,
            Court.address,
            Court.slug,
            Court.average_rating,
            Court.review_count,
        )
        .where(
            Court.location_id == location.id,
            Court.status == "approved",
            Court.is_active == True,  # noqa: E712
        )
        .order_by(Court.name.asc())
    )
    courts = [
        {
            "id": r.id,
            "name": r.name,
            "address": r.address,
            "slug": r.slug,
            "average_rating": float(r.average_rating) if r.average_rating else None,
            "review_count": r.review_count or 0,
        }
        for r in courts_result.all()
    ]

    # 5. Aggregate stats (single query with scalar subqueries)
    player_count_subq = (
        select(func.count(Player.id))
        .join(PlayerGlobalStats, PlayerGlobalStats.player_id == Player.id)
        .where(
            Player.location_id == location.id,
            PlayerGlobalStats.total_games >= 1,
            Player.deleted_at.is_(None),
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
    # Join Session → League directly via Session.league_id so that gap-game
    # sessions (season_id=NULL) are counted in the location's match total.
    match_count_subq = (
        select(func.count(Match.id))
        .join(Session, Match.session_id == Session.id)
        .join(League, Session.league_id == League.id)
        .where(League.location_id == location.id)
        .correlate()
        .scalar_subquery()
    )
    court_count_subq = (
        select(func.count(Court.id))
        .where(
            Court.location_id == location.id,
            Court.status == "approved",
            Court.is_active == True,  # noqa: E712
        )
        .correlate()
        .scalar_subquery()
    )
    stats_row = (
        await session.execute(
            select(player_count_subq, league_count_subq, match_count_subq, court_count_subq)
        )
    ).one()
    total_players = stats_row[0] or 0
    total_leagues = stats_row[1] or 0
    total_matches = stats_row[2] or 0
    total_courts = stats_row[3] or 0

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
            "total_courts": total_courts,
        },
    }


async def search_public_players(
    session: AsyncSession,
    *,
    search: Optional[str] = None,
    location_id: Optional[str] = None,
    gender: Optional[str] = None,
    level: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = None,
    min_games: Optional[int] = None,
    include_placeholders: bool = False,
    page: int = 1,
    page_size: int = 25,
) -> Dict:
    """
    Search publicly visible players with optional filters and sorting.

    Only players with total_games >= 1 are included (same visibility rule
    as individual public player profiles).

    Args:
        sort_by: Sort field — 'games' (default), 'name', or 'rating'.
        sort_dir: Sort direction — 'asc' or 'desc'. Defaults per field:
            name → asc, games → desc, rating → desc.
        min_games: Minimum total games played (filters out players below).

    Returns:
        Dict with 'items' (list of player dicts) and 'total_count'.
    """
    base = (
        select(
            Player.id,
            Player.full_name,
            Player.avatar,
            Player.profile_picture_url,
            Player.gender,
            Player.level,
            Player.is_placeholder,
            Location.name.label("location_name"),
            PlayerGlobalStats.total_games,
            PlayerGlobalStats.current_rating,
        )
        .join(PlayerGlobalStats, PlayerGlobalStats.player_id == Player.id)
        .outerjoin(Location, Player.location_id == Location.id)
        .where(PlayerGlobalStats.total_games >= 1, Player.deleted_at.is_(None))
    )

    if not include_placeholders:
        base = base.where(Player.is_placeholder == False)  # noqa: E712

    if search:
        # Escape LIKE metacharacters to prevent wildcard injection
        safe_search = search.replace("%", "\\%").replace("_", "\\_")
        base = base.where(Player.full_name.ilike(f"%{safe_search}%"))
    if location_id:
        ids = [lid.strip() for lid in location_id.split(",") if lid.strip()]
        if len(ids) == 1:
            base = base.where(Player.location_id == ids[0])
        else:
            base = base.where(Player.location_id.in_(ids))
    if gender:
        base = base.where(Player.gender == gender)
    if level:
        base = base.where(Player.level == level)
    if min_games is not None:
        base = base.where(PlayerGlobalStats.total_games >= min_games)

    # Total count
    count_q = select(func.count()).select_from(base.subquery())
    total_count = (await session.execute(count_q)).scalar() or 0

    # Determine sort order with optional direction override.
    # Default direction: name → asc, games → desc, rating → desc.
    if sort_by == "name":
        default_dir = "asc"
        primary_col = Player.full_name
        secondary = [PlayerGlobalStats.total_games.desc()]
    elif sort_by == "rating":
        default_dir = "desc"
        primary_col = PlayerGlobalStats.current_rating
        secondary = [Player.full_name.asc()]
    else:
        default_dir = "desc"
        primary_col = PlayerGlobalStats.total_games
        secondary = [Player.full_name.asc()]

    direction = sort_dir if sort_dir in ("asc", "desc") else default_dir
    primary_order = primary_col.asc() if direction == "asc" else primary_col.desc()
    order_clauses = [primary_order] + secondary

    # Paginated results
    offset = (page - 1) * page_size
    rows = (
        await session.execute(base.order_by(*order_clauses).offset(offset).limit(page_size))
    ).all()

    items = [
        {
            "id": r.id,
            "full_name": r.full_name,
            "avatar": (
                r.profile_picture_url or r.avatar or generate_player_initials(r.full_name or "")
            ),
            "gender": r.gender,
            "level": r.level,
            "is_placeholder": r.is_placeholder,
            "location_name": r.location_name,
            "total_games": r.total_games,
            "current_rating": r.current_rating,
        }
        for r in rows
    ]

    return {"items": items, "total_count": total_count, "page": page, "page_size": page_size}
