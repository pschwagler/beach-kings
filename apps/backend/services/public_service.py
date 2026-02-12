"""
Public service functions — no authentication required.

Provides read-only data access for SEO (sitemap, public pages).
"""

from typing import List, Dict, Optional

from sqlalchemy import select, exists, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from backend.database.models import (
    League,
    LeagueMember,
    Location,
    Match,
    Player,
    PlayerGlobalStats,
    PlayerSeasonStats,
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
