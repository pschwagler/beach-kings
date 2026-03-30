"""
Stats read-only operations.

Extracted from stats_data.py.  Covers:
- Rankings queries (_sort helpers, get_rankings)
- ELO timeline and match-with-ELO queries
- Paginated match listing (query_matches)
- Per-player / per-season / per-league stats reads
- CSV export and match history
"""

from __future__ import annotations

import csv
import io
import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

__all__ = [
    "get_rankings",
    "get_elo_timeline",
    "get_season_matches_with_elo",
    "get_league_matches_with_elo",
    "query_matches",
    "get_player_stats_by_id",
    "get_player_season_partnership_opponent_stats",
    "get_all_player_season_stats",
    "get_all_player_season_partnership_opponent_stats",
    "get_player_season_stats",
    "get_player_league_stats",
    "get_all_player_league_stats",
    "get_player_league_partnership_opponent_stats",
    "get_all_player_league_partnership_opponent_stats",
    "export_matches_to_csv",
    "get_player_match_history_by_id",
]

from sqlalchemy import and_, cast, func, or_
from sqlalchemy import Integer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from sqlalchemy import select

from backend.database.models import (
    Court,
    EloHistory,
    League,
    Match,
    OpponentStats,
    OpponentStatsSeason,
    OpponentStatsLeague,
    PartnershipStats,
    PartnershipStatsSeason,
    PartnershipStatsLeague,
    Player,
    PlayerGlobalStats,
    PlayerLeagueStats,
    PlayerSeasonStats,
    Season,
    Session,
    SessionStatus,
)
from backend.utils.constants import INITIAL_ELO
from backend.services.player_data import generate_player_initials


# ---------------------------------------------------------------------------
# Rankings helpers
# ---------------------------------------------------------------------------


def _sort_rankings_all_seasons(rankings: List[Dict]) -> List[Dict]:
    """
    Sort rankings for "All Seasons" view.
    Sort by: wins (desc) -> win_rate (desc) -> avg_pt_diff (desc) -> elo (desc)
    """
    return sorted(
        rankings,
        key=lambda p: (
            -(p.get("wins") or 0),
            -(p.get("win_rate") or 0.0),
            -(p.get("avg_pt_diff") or 0.0),
            -(p.get("elo") or 0),
        ),
    )


def _sort_rankings_single_season(rankings: List[Dict]) -> List[Dict]:
    """
    Sort rankings for single season view.
    Sort by: points (desc) -> avg_pt_diff (desc) -> win_rate (desc) -> elo (desc)
    """
    return sorted(
        rankings,
        key=lambda p: (
            -(p.get("points") or 0),
            -(p.get("avg_pt_diff") or 0.0),
            -(p.get("win_rate") or 0.0),
            -(p.get("elo") or 0),
        ),
    )


async def get_rankings(session: AsyncSession, body: Optional[Dict] = None) -> List[Dict]:
    """
    Get current player rankings ordered by points.

    Args:
        session: Database session
        body: Optional query parameters dict with:
            - season_id: Optional[int] - filter by season
            - league_id: Optional[int] - filter by league

    Returns:
        List of player ranking dicts.
    """
    if body is None:
        body = {}

    season_id = body.get("season_id")
    league_id = body.get("league_id")

    try:
        if league_id is not None and season_id is None:
            stats_subq = (
                select(
                    PlayerLeagueStats.player_id,
                    PlayerLeagueStats.points,
                    PlayerLeagueStats.games,
                    PlayerLeagueStats.wins,
                    PlayerLeagueStats.win_rate,
                    PlayerLeagueStats.avg_point_diff,
                )
                .where(PlayerLeagueStats.league_id == int(league_id))
                .subquery()
            )
        else:
            latest_stats_subq = select(
                PlayerSeasonStats.player_id,
                func.max(PlayerSeasonStats.updated_at).label("max_updated_at"),
            )
            if season_id is not None:
                latest_stats_subq = latest_stats_subq.where(
                    PlayerSeasonStats.season_id == int(season_id)
                )
            latest_stats_subq = latest_stats_subq.group_by(PlayerSeasonStats.player_id).subquery()

            latest_id_subq = select(
                PlayerSeasonStats.player_id, func.max(PlayerSeasonStats.id).label("max_id")
            ).join(
                latest_stats_subq,
                and_(
                    PlayerSeasonStats.player_id == latest_stats_subq.c.player_id,
                    PlayerSeasonStats.updated_at == latest_stats_subq.c.max_updated_at,
                ),
            )
            if season_id is not None:
                latest_id_subq = latest_id_subq.where(
                    PlayerSeasonStats.season_id == int(season_id)
                )
            latest_id_subq = latest_id_subq.group_by(PlayerSeasonStats.player_id).subquery()

            stats_subq = (
                select(
                    PlayerSeasonStats.player_id,
                    PlayerSeasonStats.points,
                    PlayerSeasonStats.games,
                    PlayerSeasonStats.wins,
                    PlayerSeasonStats.win_rate,
                    PlayerSeasonStats.avg_point_diff,
                )
                .join(
                    latest_id_subq,
                    and_(
                        PlayerSeasonStats.player_id == latest_id_subq.c.player_id,
                        PlayerSeasonStats.id == latest_id_subq.c.max_id,
                    ),
                )
                .subquery()
            )

        query = (
            select(
                Player.id,
                Player.full_name,
                Player.nickname,
                Player.is_placeholder,
                PlayerGlobalStats.current_rating,
                stats_subq.c.points,
                stats_subq.c.games,
                stats_subq.c.wins,
                stats_subq.c.win_rate,
                stats_subq.c.avg_point_diff,
            )
            .outerjoin(PlayerGlobalStats, Player.id == PlayerGlobalStats.player_id)
            .outerjoin(stats_subq, Player.id == stats_subq.c.player_id)
            .where(
                or_(
                    stats_subq.c.games.isnot(None),
                    PlayerGlobalStats.total_games.isnot(None),
                )
            )
        )

        result = await session.execute(query)
        rows = result.all()

        rankings = []
        for row in rows:
            name = row.full_name or row.nickname or f"Player {row.id}"
            initials = generate_player_initials(name)
            rankings.append(
                {
                    "player_id": row.id,
                    "name": name,
                    "initials": initials,
                    "is_placeholder": row.is_placeholder or False,
                    "elo": round(row.current_rating) if row.current_rating else INITIAL_ELO,
                    "points": row.points or 0,
                    "games": row.games or 0,
                    "wins": row.wins or 0,
                    "losses": (row.games or 0) - (row.wins or 0),
                    "win_rate": row.win_rate or 0.0,
                    "avg_pt_diff": row.avg_point_diff or 0.0,
                }
            )

        if season_id is not None:
            rankings = _sort_rankings_single_season(rankings)
        else:
            rankings = _sort_rankings_all_seasons(rankings)

        return rankings

    except Exception:
        logger.exception("get_rankings failed")
        return []


# ---------------------------------------------------------------------------
# ELO timeline + matches-with-ELO
# ---------------------------------------------------------------------------


async def get_elo_timeline(session: AsyncSession) -> List[Dict]:
    """Get ELO timeline data for all players.

    Fetches all EloHistory records in a single query and builds the
    timeline in Python to avoid O(N*M) database round-trips.
    """
    result = await session.execute(
        select(EloHistory.date).distinct().order_by(EloHistory.date.asc())
    )
    dates = [row[0] for row in result.all()]
    if not dates:
        return []

    result = await session.execute(
        select(Player.id, Player.full_name).order_by(Player.full_name.asc())
    )
    player_rows = result.all()
    player_id_to_name = {row[0]: row[1] for row in player_rows}

    # Fetch all EloHistory records once, ordered by player, date, id
    result = await session.execute(
        select(EloHistory.player_id, EloHistory.date, EloHistory.elo_after).order_by(
            EloHistory.player_id, EloHistory.date.asc(), EloHistory.id.asc()
        )
    )
    all_elo_rows = result.all()

    # Build per-player sorted list of (date, elo_after)
    # Since rows are ordered by player_id, date asc, id asc, the last entry
    # for each date is the most recent elo for that player on that date.
    player_elo_history: Dict[int, List] = {}
    for player_id, elo_date, elo_after in all_elo_rows:
        if player_id not in player_elo_history:
            player_elo_history[player_id] = []
        history = player_elo_history[player_id]
        # Keep only the latest elo per date (last write wins since sorted by id asc)
        if history and history[-1][0] == elo_date:
            history[-1] = (elo_date, elo_after)
        else:
            history.append((elo_date, elo_after))

    # For each player, track the current elo as we walk through dates
    # Using a pointer per player into their sorted history
    player_pointers: Dict[int, int] = {pid: 0 for pid in player_id_to_name}
    player_current_elo: Dict[int, float] = {pid: INITIAL_ELO for pid in player_id_to_name}

    timeline = []
    for d in dates:
        row_data: Dict = {"date": d}
        for player_id, name in player_id_to_name.items():
            history = player_elo_history.get(player_id, [])
            ptr = player_pointers[player_id]
            # Advance pointer to include all entries up to and including date d
            while ptr < len(history) and history[ptr][0] <= d:
                player_current_elo[player_id] = history[ptr][1]
                ptr += 1
            player_pointers[player_id] = ptr
            row_data[name] = player_current_elo[player_id]
        timeline.append(row_data)

    return timeline


def _build_elo_by_match(elo_rows) -> Dict:
    """Group EloHistory rows by match_id into a nested dict."""
    elo_by_match: Dict = {}
    for elo_row in elo_rows:
        match_id = elo_row.match_id
        if match_id not in elo_by_match:
            elo_by_match[match_id] = {}
        elo_before = elo_row.elo_after - elo_row.elo_change
        elo_by_match[match_id][elo_row.player_id] = {
            "elo_before": round(elo_before, 1),
            "elo_after": round(elo_row.elo_after, 1),
            "elo_change": round(elo_row.elo_change, 1),
        }
    return elo_by_match


def _match_row_to_elo_dict(row, elo_by_match: Dict) -> Dict:
    """Convert a match query row to a dict with elo_changes."""
    return {
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
        "is_ranked": row.is_ranked,
        "ranked_intent": row.ranked_intent,
        "elo_changes": elo_by_match.get(row.id, {}),
    }


async def get_season_matches_with_elo(session: AsyncSession, season_id: int) -> List[Dict]:
    """Get all matches for a season with ELO changes per player."""
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
        .where(Session.season_id == season_id)
        .order_by(Match.id.desc())
    )

    result = await session.execute(query)
    match_rows = result.all()
    match_ids = [row.id for row in match_rows]

    elo_result = await session.execute(
        select(
            EloHistory.match_id, EloHistory.player_id, EloHistory.elo_after, EloHistory.elo_change
        ).where(EloHistory.match_id.in_(match_ids))
    )
    elo_by_match = _build_elo_by_match(elo_result.all())

    return [_match_row_to_elo_dict(row, elo_by_match) for row in match_rows]


async def get_league_matches_with_elo(session: AsyncSession, league_id: int) -> List[Dict]:
    """Get all matches for a league (across all seasons) with ELO changes per player."""
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
            Match.winner,
            Match.is_ranked,
            Match.ranked_intent,
        )
        .select_from(Match)
        .outerjoin(Session, Match.session_id == Session.id)
        .outerjoin(Season, Session.season_id == Season.id)
        .outerjoin(p1, Match.team1_player1_id == p1.id)
        .outerjoin(p2, Match.team1_player2_id == p2.id)
        .outerjoin(p3, Match.team2_player1_id == p3.id)
        .outerjoin(p4, Match.team2_player2_id == p4.id)
        .where(Season.league_id == league_id)
        .order_by(Match.id.desc())
    )

    result = await session.execute(query)
    match_rows = result.all()
    match_ids = [row.id for row in match_rows]

    elo_result = await session.execute(
        select(
            EloHistory.match_id, EloHistory.player_id, EloHistory.elo_after, EloHistory.elo_change
        ).where(EloHistory.match_id.in_(match_ids))
    )
    elo_by_match = _build_elo_by_match(elo_result.all())

    return [_match_row_to_elo_dict(row, elo_by_match) for row in match_rows]


async def query_matches(
    session: AsyncSession, body: Dict, user: Optional[Dict] = None
) -> List[Dict]:
    """
    Query matches with filtering.

    Args:
        session: Database session
        body: Query parameters dict with limit, offset, league_id, season_id,
              submitted_only, include_non_public, sort_by, sort_dir.
        user: Optional user dict (reserved for future permission checks).

    Returns:
        List of match dicts.
    """
    limit = min(max(int(body.get("limit", 50)), 1), 500)
    offset = max(int(body.get("offset", 0)), 0)
    submitted_only = body.get("submitted_only", True)
    include_non_public = body.get("include_non_public", False)
    league_id = body.get("league_id")
    season_id = body.get("season_id")
    sort_by = body.get("sort_by", "id")
    sort_dir = body.get("sort_dir", "desc")

    if sort_by not in ["id", "date"]:
        sort_by = "id"
    if sort_dir not in ["asc", "desc"]:
        sort_dir = "desc"

    p1 = aliased(Player)
    p2 = aliased(Player)
    p3 = aliased(Player)
    p4 = aliased(Player)
    creator = aliased(Player)
    updater = aliased(Player)

    query = (
        select(
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
            cast(0, Integer).label("team2_elo_change"),
        )
        .select_from(Match)
        .outerjoin(Session, Match.session_id == Session.id)
        .outerjoin(Season, Session.season_id == Season.id)
        .outerjoin(p1, Match.team1_player1_id == p1.id)
        .outerjoin(p2, Match.team1_player2_id == p2.id)
        .outerjoin(p3, Match.team2_player1_id == p3.id)
        .outerjoin(p4, Match.team2_player2_id == p4.id)
        .outerjoin(creator, Session.created_by == creator.id)
        .outerjoin(updater, Session.updated_by == updater.id)
    )

    conditions = []
    if submitted_only:
        conditions.append(
            or_(
                Match.session_id.is_(None),
                Session.status.in_([SessionStatus.SUBMITTED, SessionStatus.EDITED]),
            )
        )
    if not include_non_public:
        conditions.append(Match.is_public.is_(True))
    if league_id is not None:
        conditions.append(and_(Session.season_id.isnot(None), Season.league_id == int(league_id)))
    if season_id is not None:
        conditions.append(Session.season_id == int(season_id))
    if conditions:
        query = query.where(and_(*conditions))

    order_column = Match.date if sort_by == "date" else Match.id
    if sort_dir.lower() == "asc":
        query = query.order_by(order_column.asc())
    else:
        query = query.order_by(order_column.desc())

    query = query.limit(limit).offset(offset)
    result = await session.execute(query)
    rows = result.all()

    return [
        {
            "id": row.id,
            "date": row.date,
            "session_id": row.session_id,
            "session_name": row.session_name,
            "session_status": row.session_status.value if row.session_status else None,
            "session_created_at": row.session_created_at.isoformat()
            if row.session_created_at
            else None,
            "session_updated_at": row.session_updated_at.isoformat()
            if row.session_updated_at
            else None,
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


# ---------------------------------------------------------------------------
# Player stats reads
# ---------------------------------------------------------------------------


async def get_player_stats_by_id(session: AsyncSession, player_id: int) -> Optional[Dict]:
    """
    Get detailed stats for a player by ID including partnerships and opponents.

    Returns None if the player does not exist.
    """
    result = await session.execute(select(Player).where(Player.id == player_id))
    player = result.scalar_one_or_none()
    if not player:
        return None

    player_name = player.full_name or player.nickname or f"Player {player_id}"

    result = await session.execute(
        select(PlayerGlobalStats).where(PlayerGlobalStats.player_id == player.id)
    )
    global_stats = result.scalar_one_or_none()
    current_elo = global_stats.current_rating if global_stats else INITIAL_ELO

    games = wins = points = 0
    win_rate = avg_point_diff = 0.0

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

    PartnerPlayer = aliased(Player)
    result = await session.execute(
        select(PartnershipStats, PartnerPlayer.full_name.label("partner_name"))
        .join(PartnerPlayer, PartnershipStats.partner_id == PartnerPlayer.id)
        .where(PartnershipStats.player_id == player_id)
        .order_by(PartnershipStats.points.desc(), PartnershipStats.win_rate.desc())
    )
    partnerships = [
        {
            "partner_opponent": row[1],
            "points": row[0].points,
            "games": row[0].games,
            "wins": row[0].wins,
            "losses": row[0].games - row[0].wins,
            "win_rate": row[0].win_rate,
            "avg_pt_diff": row[0].avg_point_diff,
        }
        for row in result.all()
    ]

    OpponentPlayer = aliased(Player)
    result = await session.execute(
        select(OpponentStats, OpponentPlayer.full_name.label("opponent_name"))
        .join(OpponentPlayer, OpponentStats.opponent_id == OpponentPlayer.id)
        .where(OpponentStats.player_id == player_id)
        .order_by(OpponentStats.points.desc(), OpponentStats.win_rate.desc())
    )
    opponents = [
        {
            "partner_opponent": row[1],
            "points": row[0].points,
            "games": row[0].games,
            "wins": row[0].wins,
            "losses": row[0].games - row[0].wins,
            "win_rate": row[0].win_rate,
            "avg_pt_diff": row[0].avg_point_diff,
        }
        for row in result.all()
    ]

    return {
        "name": player_name,
        "current_elo": round(current_elo),
        "games": games,
        "wins": wins,
        "losses": games - wins,
        "win_rate": win_rate,
        "points": points,
        "avg_point_diff": avg_point_diff,
        "rank": None,
        "partnerships": partnerships,
        "opponents": opponents,
        "match_history": [],
    }


async def get_player_season_partnership_opponent_stats(
    session: AsyncSession, player_id: int, season_id: int
) -> Dict:
    """
    Get season-specific partnership and opponent stats for a player.

    Returns a dict with keys ``partnerships`` and ``opponents``, each a list of
    stat dicts for the given player in the given season.
    """
    PartnerPlayer = aliased(Player)
    result = await session.execute(
        select(PartnershipStatsSeason, PartnerPlayer.full_name.label("partner_name"))
        .join(PartnerPlayer, PartnershipStatsSeason.partner_id == PartnerPlayer.id)
        .where(
            and_(
                PartnershipStatsSeason.player_id == player_id,
                PartnershipStatsSeason.season_id == season_id,
            )
        )
        .order_by(PartnershipStatsSeason.points.desc(), PartnershipStatsSeason.win_rate.desc())
    )
    partnerships = [
        {
            "partner_opponent": row[1],
            "points": row[0].points,
            "games": row[0].games,
            "wins": row[0].wins,
            "losses": row[0].games - row[0].wins,
            "win_rate": row[0].win_rate,
            "avg_pt_diff": row[0].avg_point_diff,
        }
        for row in result.all()
    ]

    OpponentPlayer = aliased(Player)
    result = await session.execute(
        select(OpponentStatsSeason, OpponentPlayer.full_name.label("opponent_name"))
        .join(OpponentPlayer, OpponentStatsSeason.opponent_id == OpponentPlayer.id)
        .where(
            and_(
                OpponentStatsSeason.player_id == player_id,
                OpponentStatsSeason.season_id == season_id,
            )
        )
        .order_by(OpponentStatsSeason.points.desc(), OpponentStatsSeason.win_rate.desc())
    )
    opponents = [
        {
            "partner_opponent": row[1],
            "points": row[0].points,
            "games": row[0].games,
            "wins": row[0].wins,
            "losses": row[0].games - row[0].wins,
            "win_rate": row[0].win_rate,
            "avg_pt_diff": row[0].avg_point_diff,
        }
        for row in result.all()
    ]

    return {"partnerships": partnerships, "opponents": opponents}


async def get_all_player_season_stats(session: AsyncSession, season_id: int) -> Dict[int, Dict]:
    """
    Get season stats for all players in a season.

    Returns:
        Mapping of player_id -> stats dict.
    """
    result = await session.execute(
        select(PlayerSeasonStats).where(PlayerSeasonStats.season_id == season_id)
    )
    rows = result.scalars().all()
    return {
        row.player_id: {
            "player_id": row.player_id,
            "season_id": row.season_id,
            "games": row.games,
            "wins": row.wins,
            "losses": row.games - row.wins,
            "win_rate": row.win_rate,
            "points": row.points,
            "avg_pt_diff": row.avg_point_diff,
        }
        for row in rows
    }


async def get_all_player_season_partnership_opponent_stats(
    session: AsyncSession, season_id: int
) -> Dict[int, Dict]:
    """
    Get season partnership and opponent stats for all players in a season.

    Returns:
        Mapping of player_id -> dict with ``partnerships`` and ``opponents`` lists.
    """
    PartnerPlayer = aliased(Player)
    result = await session.execute(
        select(PartnershipStatsSeason, PartnerPlayer.full_name.label("partner_name"))
        .join(PartnerPlayer, PartnershipStatsSeason.partner_id == PartnerPlayer.id)
        .where(PartnershipStatsSeason.season_id == season_id)
        .order_by(PartnershipStatsSeason.points.desc(), PartnershipStatsSeason.win_rate.desc())
    )
    partnership_rows = result.all()

    OpponentPlayer = aliased(Player)
    result = await session.execute(
        select(OpponentStatsSeason, OpponentPlayer.full_name.label("opponent_name"))
        .join(OpponentPlayer, OpponentStatsSeason.opponent_id == OpponentPlayer.id)
        .where(OpponentStatsSeason.season_id == season_id)
        .order_by(OpponentStatsSeason.points.desc(), OpponentStatsSeason.win_rate.desc())
    )
    opponent_rows = result.all()

    result_dict: Dict[int, Dict] = {}

    for row in partnership_rows:
        pid = row[0].player_id
        if pid not in result_dict:
            result_dict[pid] = {"partnerships": [], "opponents": []}
        result_dict[pid]["partnerships"].append(
            {
                "partner_opponent": row[1],
                "points": row[0].points,
                "games": row[0].games,
                "wins": row[0].wins,
                "losses": row[0].games - row[0].wins,
                "win_rate": row[0].win_rate,
                "avg_pt_diff": row[0].avg_point_diff,
            }
        )

    for row in opponent_rows:
        pid = row[0].player_id
        if pid not in result_dict:
            result_dict[pid] = {"partnerships": [], "opponents": []}
        result_dict[pid]["opponents"].append(
            {
                "partner_opponent": row[1],
                "points": row[0].points,
                "games": row[0].games,
                "wins": row[0].wins,
                "losses": row[0].games - row[0].wins,
                "win_rate": row[0].win_rate,
                "avg_pt_diff": row[0].avg_point_diff,
            }
        )

    return result_dict


async def get_player_season_stats(
    session: AsyncSession, player_id: int, season_id: int
) -> Optional[Dict]:
    """
    Get season stats for a single player.

    Returns None if no stats row exists for the player/season combination.
    """
    result = await session.execute(
        select(PlayerSeasonStats).where(
            and_(
                PlayerSeasonStats.player_id == player_id,
                PlayerSeasonStats.season_id == season_id,
            )
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        return None
    return {
        "player_id": row.player_id,
        "season_id": row.season_id,
        "games": row.games,
        "wins": row.wins,
        "losses": row.games - row.wins,
        "win_rate": row.win_rate,
        "points": row.points,
        "avg_pt_diff": row.avg_point_diff,
    }


async def get_player_league_stats(
    session: AsyncSession, player_id: int, league_id: int
) -> Optional[Dict]:
    """
    Get league-level stats for a single player.

    Returns None if no stats row exists for the player/league combination.
    """
    result = await session.execute(
        select(PlayerLeagueStats).where(
            and_(
                PlayerLeagueStats.player_id == player_id,
                PlayerLeagueStats.league_id == league_id,
            )
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        return None
    return {
        "player_id": row.player_id,
        "league_id": row.league_id,
        "games": row.games,
        "wins": row.wins,
        "losses": row.games - row.wins,
        "win_rate": row.win_rate,
        "points": row.points,
        "avg_pt_diff": row.avg_point_diff,
    }


async def get_all_player_league_stats(session: AsyncSession, league_id: int) -> Dict[int, Dict]:
    """
    Get league stats for all players in a league.

    Returns:
        Mapping of player_id -> stats dict.
    """
    result = await session.execute(
        select(PlayerLeagueStats).where(PlayerLeagueStats.league_id == league_id)
    )
    rows = result.scalars().all()
    return {
        row.player_id: {
            "player_id": row.player_id,
            "league_id": row.league_id,
            "games": row.games,
            "wins": row.wins,
            "losses": row.games - row.wins,
            "win_rate": row.win_rate,
            "points": row.points,
            "avg_pt_diff": row.avg_point_diff,
        }
        for row in rows
    }


async def get_player_league_partnership_opponent_stats(
    session: AsyncSession, player_id: int, league_id: int
) -> Dict:
    """
    Get league-specific partnership and opponent stats for a player.

    Returns a dict with keys ``partnerships`` and ``opponents``, each a list of
    stat dicts for the given player in the given league.
    """
    PartnerPlayer = aliased(Player)
    result = await session.execute(
        select(PartnershipStatsLeague, PartnerPlayer.full_name.label("partner_name"))
        .join(PartnerPlayer, PartnershipStatsLeague.partner_id == PartnerPlayer.id)
        .where(
            and_(
                PartnershipStatsLeague.player_id == player_id,
                PartnershipStatsLeague.league_id == league_id,
            )
        )
        .order_by(PartnershipStatsLeague.points.desc(), PartnershipStatsLeague.win_rate.desc())
    )
    partnerships = [
        {
            "partner_opponent": row[1],
            "points": row[0].points,
            "games": row[0].games,
            "wins": row[0].wins,
            "losses": row[0].games - row[0].wins,
            "win_rate": row[0].win_rate,
            "avg_pt_diff": row[0].avg_point_diff,
        }
        for row in result.all()
    ]

    OpponentPlayer = aliased(Player)
    result = await session.execute(
        select(OpponentStatsLeague, OpponentPlayer.full_name.label("opponent_name"))
        .join(OpponentPlayer, OpponentStatsLeague.opponent_id == OpponentPlayer.id)
        .where(
            and_(
                OpponentStatsLeague.player_id == player_id,
                OpponentStatsLeague.league_id == league_id,
            )
        )
        .order_by(OpponentStatsLeague.points.desc(), OpponentStatsLeague.win_rate.desc())
    )
    opponents = [
        {
            "partner_opponent": row[1],
            "points": row[0].points,
            "games": row[0].games,
            "wins": row[0].wins,
            "losses": row[0].games - row[0].wins,
            "win_rate": row[0].win_rate,
            "avg_pt_diff": row[0].avg_point_diff,
        }
        for row in result.all()
    ]

    return {"partnerships": partnerships, "opponents": opponents}


async def get_all_player_league_partnership_opponent_stats(
    session: AsyncSession, league_id: int
) -> Dict[int, Dict]:
    """
    Get league partnership and opponent stats for all players in a league.

    Returns:
        Mapping of player_id -> dict with ``partnerships`` and ``opponents`` lists.
    """
    PartnerPlayer = aliased(Player)
    result = await session.execute(
        select(PartnershipStatsLeague, PartnerPlayer.full_name.label("partner_name"))
        .join(PartnerPlayer, PartnershipStatsLeague.partner_id == PartnerPlayer.id)
        .where(PartnershipStatsLeague.league_id == league_id)
        .order_by(PartnershipStatsLeague.points.desc(), PartnershipStatsLeague.win_rate.desc())
    )
    partnership_rows = result.all()

    OpponentPlayer = aliased(Player)
    result = await session.execute(
        select(OpponentStatsLeague, OpponentPlayer.full_name.label("opponent_name"))
        .join(OpponentPlayer, OpponentStatsLeague.opponent_id == OpponentPlayer.id)
        .where(OpponentStatsLeague.league_id == league_id)
        .order_by(OpponentStatsLeague.points.desc(), OpponentStatsLeague.win_rate.desc())
    )
    opponent_rows = result.all()

    result_dict: Dict[int, Dict] = {}

    for row in partnership_rows:
        pid = row[0].player_id
        if pid not in result_dict:
            result_dict[pid] = {"partnerships": [], "opponents": []}
        result_dict[pid]["partnerships"].append(
            {
                "partner_opponent": row[1],
                "points": row[0].points,
                "games": row[0].games,
                "wins": row[0].wins,
                "losses": row[0].games - row[0].wins,
                "win_rate": row[0].win_rate,
                "avg_pt_diff": row[0].avg_point_diff,
            }
        )

    for row in opponent_rows:
        pid = row[0].player_id
        if pid not in result_dict:
            result_dict[pid] = {"partnerships": [], "opponents": []}
        result_dict[pid]["opponents"].append(
            {
                "partner_opponent": row[1],
                "points": row[0].points,
                "games": row[0].games,
                "wins": row[0].wins,
                "losses": row[0].games - row[0].wins,
                "win_rate": row[0].win_rate,
                "avg_pt_diff": row[0].avg_point_diff,
            }
        )

    return result_dict


# ---------------------------------------------------------------------------
# CSV export + match history
# ---------------------------------------------------------------------------


async def export_matches_to_csv(session: AsyncSession) -> str:
    """
    Export all matches (locked-in sessions only) to CSV format.

    Format: DATE, T1P1, T1P2, T2P1, T2P2, T1SCORE, T2SCORE
    """
    p1 = aliased(Player)
    p2 = aliased(Player)
    p3 = aliased(Player)
    p4 = aliased(Player)

    query = (
        select(
            Match.date,
            p1.full_name.label("team1_player1_name"),
            p2.full_name.label("team1_player2_name"),
            p3.full_name.label("team2_player1_name"),
            p4.full_name.label("team2_player2_name"),
            Match.team1_score,
            Match.team2_score,
        )
        .select_from(Match)
        .outerjoin(Session, Match.session_id == Session.id)
        .outerjoin(p1, Match.team1_player1_id == p1.id)
        .outerjoin(p2, Match.team1_player2_id == p2.id)
        .outerjoin(p3, Match.team2_player1_id == p3.id)
        .outerjoin(p4, Match.team2_player2_id == p4.id)
        .where(
            or_(
                Session.status.in_([SessionStatus.SUBMITTED, SessionStatus.EDITED]),
                Match.session_id.is_(None),
            )
        )
        .order_by(Match.id.asc())
    )

    result = await session.execute(query)
    matches = result.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Team 1", "", "Team 2", "", "Team 1 Score", "Team 2 Score"])
    for match in matches:
        writer.writerow(
            [
                match.date,
                match.team1_player1_name,
                match.team1_player2_name,
                match.team2_player1_name,
                match.team2_player2_name,
                match.team1_score,
                match.team2_score,
            ]
        )

    return output.getvalue()


async def get_player_match_history_by_id(
    session: AsyncSession, player_id: int
) -> Optional[List[Dict]]:
    """
    Get match history for a specific player by ID.

    Returns None if the player is not found, or a (possibly empty) list of match dicts.
    """
    result = await session.execute(select(Player.id).where(Player.id == player_id))
    if not result.scalar_one_or_none():
        return None

    p1 = aliased(Player)
    p2 = aliased(Player)
    p3 = aliased(Player)
    p4 = aliased(Player)
    eh = aliased(EloHistory)

    query = (
        select(
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
            cast(0, Integer).label("team1_elo_change"),
            cast(0, Integer).label("team2_elo_change"),
            p1.full_name.label("team1_player1_name"),
            p2.full_name.label("team1_player2_name"),
            p3.full_name.label("team2_player1_name"),
            p4.full_name.label("team2_player2_name"),
            p1.is_placeholder.label("t1p1_is_placeholder"),
            p2.is_placeholder.label("t1p2_is_placeholder"),
            p3.is_placeholder.label("t2p1_is_placeholder"),
            p4.is_placeholder.label("t2p2_is_placeholder"),
            eh.elo_after,
            Match.is_ranked,
            Match.ranked_intent,
            Session.status.label("session_status"),
            Session.name.label("session_name"),
            Session.code.label("session_code"),
            Session.season_id.label("season_id"),
            Season.league_id.label("league_id"),
            League.name.label("league_name"),
            Season.name.label("season_name"),
            Court.name.label("court_name"),
        )
        .select_from(Match)
        .outerjoin(p1, Match.team1_player1_id == p1.id)
        .outerjoin(p2, Match.team1_player2_id == p2.id)
        .outerjoin(p3, Match.team2_player1_id == p3.id)
        .outerjoin(p4, Match.team2_player2_id == p4.id)
        .outerjoin(eh, and_(eh.match_id == Match.id, eh.player_id == player_id))
        .outerjoin(Session, Match.session_id == Session.id)
        .outerjoin(Season, Session.season_id == Season.id)
        .outerjoin(League, Season.league_id == League.id)
        .outerjoin(Court, Session.court_id == Court.id)
        .where(
            or_(
                Match.team1_player1_id == player_id,
                Match.team1_player2_id == player_id,
                Match.team2_player1_id == player_id,
                Match.team2_player2_id == player_id,
            )
        )
        .order_by(Match.id.desc())
    )

    result = await session.execute(query)
    rows = result.all()

    results = []
    for row in rows:
        if row.team1_player1_id == player_id or row.team1_player2_id == player_id:
            if row.team1_player1_id == player_id:
                partner = row.team1_player2_name
                partner_id = row.team1_player2_id
                partner_is_placeholder = bool(row.t1p2_is_placeholder)
            else:
                partner = row.team1_player1_name
                partner_id = row.team1_player1_id
                partner_is_placeholder = bool(row.t1p1_is_placeholder)
            opponent1 = row.team2_player1_name
            opponent1_id = row.team2_player1_id
            opponent1_is_placeholder = bool(row.t2p1_is_placeholder)
            opponent2 = row.team2_player2_name
            opponent2_id = row.team2_player2_id
            opponent2_is_placeholder = bool(row.t2p2_is_placeholder)
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
            if row.team2_player1_id == player_id:
                partner = row.team2_player2_name
                partner_id = row.team2_player2_id
                partner_is_placeholder = bool(row.t2p2_is_placeholder)
            else:
                partner = row.team2_player1_name
                partner_id = row.team2_player1_id
                partner_is_placeholder = bool(row.t2p1_is_placeholder)
            opponent1 = row.team1_player1_name
            opponent1_id = row.team1_player1_id
            opponent1_is_placeholder = bool(row.t1p1_is_placeholder)
            opponent2 = row.team1_player2_name
            opponent2_id = row.team1_player2_id
            opponent2_is_placeholder = bool(row.t1p2_is_placeholder)
            player_score = row.team2_score
            opponent_score = row.team1_score
            elo_change = row.team2_elo_change or 0
            if row.winner == 2:
                match_result = "W"
            elif row.winner == -1:
                match_result = "T"
            else:
                match_result = "L"

        session_status_value = None
        if row.session_status:
            if hasattr(row.session_status, "value"):
                session_status_value = row.session_status.value
            else:
                session_status_value = str(row.session_status)

        results.append(
            {
                "date": row.date,
                "partner": partner,
                "partner_id": partner_id,
                "partner_is_placeholder": partner_is_placeholder,
                "opponent_1": opponent1,
                "opponent_1_id": opponent1_id,
                "opponent_1_is_placeholder": opponent1_is_placeholder,
                "opponent_2": opponent2,
                "opponent_2_id": opponent2_id,
                "opponent_2_is_placeholder": opponent2_is_placeholder,
                "result": match_result,
                "score": f"{player_score}-{opponent_score}",
                "elo_change": elo_change,
                "elo_after": row.elo_after,
                "session_status": session_status_value,
                "session_id": row.session_id,
                "session_name": row.session_name,
                "session_code": row.session_code,
                "season_id": row.season_id,
                "season_name": row.season_name,
                "league_id": row.league_id,
                "league_name": row.league_name,
                "is_ranked": row.is_ranked,
                "ranked_intent": row.ranked_intent,
                "court_name": row.court_name,
            }
        )

    return results
