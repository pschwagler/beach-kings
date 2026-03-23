"""
Stats calculation pipeline: bulk ops and recalculation.

Extracted from stats_data.py.  Covers:
- load_stat_eligible_matches_async
- delete_*_stats_async helpers
- Bulk insert/upsert helpers (insert_elo_history_async, upsert_player_global_stats_async, etc.)
- calculate_global_stats_async
- _calculate_season_stats_from_matches (internal helper)
- calculate_league_stats_async
- calculate_season_stats_async
- register_stats_queue_callbacks
"""

from __future__ import annotations

from typing import Dict, List, Optional

from sqlalchemy import and_, delete, func, or_
from sqlalchemy.dialects.postgresql import insert, insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func as sql_func
from sqlalchemy import select

from backend.database.models import (
    EloHistory,
    LeagueMember,
    Match,
    OpponentStats,
    OpponentStatsSeason,
    OpponentStatsLeague,
    PartnershipStats,
    PartnershipStatsSeason,
    PartnershipStatsLeague,
    PlayerGlobalStats,
    PlayerLeagueStats,
    PlayerSeasonStats,
    Season,
    SeasonRatingHistory,
    ScoringSystem,
    Session,
    SessionStatus,
)
from backend.services import calculation_service
from backend.utils.constants import INITIAL_ELO


# ---------------------------------------------------------------------------
# Bulk insert / delete / upsert helpers
# ---------------------------------------------------------------------------


async def delete_global_stats_async(session: AsyncSession) -> None:
    """Delete all global stats (EloHistory, PartnershipStats, OpponentStats)."""
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
        delete(SeasonRatingHistory).where(SeasonRatingHistory.season_id == season_id)
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


async def load_stat_eligible_matches_async(
    session: AsyncSession, season_id: Optional[int] = None, league_id: Optional[int] = None
) -> List[Match]:
    """
    Load stat-eligible matches from database.

    Includes all matches where ranked_intent=True from finalized sessions
    (SUBMITTED or EDITED) or matches with no session.

    Args:
        session: Database session
        season_id: Optional season ID to filter by
        league_id: Optional league ID to filter by

    Returns:
        List of Match objects
    """
    conditions = [
        Match.ranked_intent.is_(True),
        or_(
            Session.status.in_([SessionStatus.SUBMITTED, SessionStatus.EDITED]),
            Session.id.is_(None),
        ),
    ]

    query = select(Match).outerjoin(Session, Match.session_id == Session.id)

    if league_id is not None:
        query = query.outerjoin(Season, Session.season_id == Season.id)
        conditions.append(Season.league_id == league_id)

    if season_id is not None:
        conditions.append(Session.season_id == season_id)

    query = query.where(and_(*conditions)).order_by(Match.id.asc())
    result = await session.execute(query)
    return list(result.scalars().all())


async def delete_all_stats_async(session: AsyncSession) -> None:
    """Delete all stats from all tables (global, league, and season stats)."""
    await session.execute(delete(EloHistory))
    await session.execute(delete(PartnershipStats))
    await session.execute(delete(OpponentStats))
    await session.execute(delete(PlayerGlobalStats))
    await session.execute(delete(PartnershipStatsLeague))
    await session.execute(delete(OpponentStatsLeague))
    await session.execute(delete(PlayerLeagueStats))
    await session.execute(delete(PartnershipStatsSeason))
    await session.execute(delete(OpponentStatsSeason))
    await session.execute(delete(PlayerSeasonStats))


def _chunks(lst, n):
    """Yield successive n-sized chunks from lst."""
    for i in range(0, len(lst), n):
        yield lst[i : i + n]


async def insert_elo_history_async(
    session: AsyncSession, elo_history_list: List[EloHistory]
) -> None:
    """Bulk insert ELO history records in chunks."""
    if not elo_history_list:
        return
    for chunk in _chunks(elo_history_list, 1000):
        session.add_all(chunk)


async def insert_season_rating_history_async(
    session: AsyncSession, season_rating_history_list: List[SeasonRatingHistory]
) -> None:
    """Bulk insert season rating history records in chunks."""
    if not season_rating_history_list:
        return
    for chunk in _chunks(season_rating_history_list, 1000):
        session.add_all(chunk)


async def upsert_player_global_stats_async(
    session: AsyncSession, elo_history_list: List[EloHistory], matches: List[Match]
) -> None:
    """
    Update PlayerGlobalStats based on elo_history and match data.

    Calculates:
    - current_rating: Latest elo_after from elo_history (INITIAL_ELO if none)
    - total_games: Count of matches participated in
    - total_wins: Count of matches won
    """
    if not elo_history_list and not matches:
        return

    player_latest_elo: Dict[int, float] = {}
    for elo_record in elo_history_list:
        player_latest_elo[elo_record.player_id] = elo_record.elo_after

    player_games: Dict[int, int] = {}
    player_wins: Dict[int, int] = {}

    for match in matches:
        team1_ids = [match.team1_player1_id, match.team1_player2_id]
        team2_ids = [match.team2_player1_id, match.team2_player2_id]
        all_pids = [pid for pid in team1_ids + team2_ids if pid is not None]
        for pid in all_pids:
            player_games[pid] = player_games.get(pid, 0) + 1
        if match.winner == 1:
            for pid in team1_ids:
                if pid is not None:
                    player_wins[pid] = player_wins.get(pid, 0) + 1
        elif match.winner == 2:
            for pid in team2_ids:
                if pid is not None:
                    player_wins[pid] = player_wins.get(pid, 0) + 1

    all_pids = set(player_latest_elo.keys()) | set(player_games.keys())
    for pid in all_pids:
        current_rating = player_latest_elo.get(pid, INITIAL_ELO)
        stmt = (
            pg_insert(PlayerGlobalStats)
            .values(
                player_id=pid,
                current_rating=current_rating,
                total_games=player_games.get(pid, 0),
                total_wins=player_wins.get(pid, 0),
            )
            .on_conflict_do_update(
                index_elements=["player_id"],
                set_=dict(
                    current_rating=current_rating,
                    total_games=player_games.get(pid, 0),
                    total_wins=player_wins.get(pid, 0),
                    updated_at=func.now(),
                ),
            )
        )
        await session.execute(stmt)


async def insert_partnership_stats_async(
    session: AsyncSession, partnerships: List[PartnershipStats]
) -> None:
    """Bulk insert partnership stats in chunks."""
    if not partnerships:
        return
    for chunk in _chunks(partnerships, 1000):
        session.add_all(chunk)


async def insert_opponent_stats_async(
    session: AsyncSession, opponents: List[OpponentStats]
) -> None:
    """Bulk insert opponent stats in chunks."""
    if not opponents:
        return
    for chunk in _chunks(opponents, 1000):
        session.add_all(chunk)


async def insert_partnership_stats_season_async(
    session: AsyncSession, partnerships: List[PartnershipStatsSeason], season_id: int
) -> None:
    """Bulk insert season-specific partnership stats in chunks."""
    if not partnerships:
        return
    for chunk in _chunks(partnerships, 1000):
        session.add_all(chunk)


async def insert_opponent_stats_season_async(
    session: AsyncSession, opponents: List[OpponentStatsSeason], season_id: int
) -> None:
    """Bulk insert season-specific opponent stats in chunks."""
    if not opponents:
        return
    for chunk in _chunks(opponents, 1000):
        session.add_all(chunk)


async def insert_partnership_stats_league_async(
    session: AsyncSession, partnerships: List[PartnershipStatsLeague], league_id: int
) -> None:
    """Bulk insert league-specific partnership stats in chunks."""
    if not partnerships:
        return
    for chunk in _chunks(partnerships, 1000):
        session.add_all(chunk)


async def insert_opponent_stats_league_async(
    session: AsyncSession, opponents: List[OpponentStatsLeague], league_id: int
) -> None:
    """Bulk insert league-specific opponent stats in chunks."""
    if not opponents:
        return
    for chunk in _chunks(opponents, 1000):
        session.add_all(chunk)


async def upsert_player_season_stats_async(
    session: AsyncSession, tracker: "calculation_service.StatsTracker", season_id: int
) -> None:
    """Upsert player season stats from a StatsTracker."""
    player_stats_list = [
        {
            "player_id": player_id,
            "season_id": season_id,
            "games": player_stats.game_count,
            "wins": player_stats.win_count,
            "points": player_stats.points,
            "win_rate": round(player_stats.win_rate, 3),
            "avg_point_diff": round(player_stats.avg_point_diff, 1),
        }
        for player_id, player_stats in tracker.players.items()
    ]
    if not player_stats_list:
        return

    stmt = insert(PlayerSeasonStats).values(player_stats_list)
    stmt = stmt.on_conflict_do_update(
        index_elements=["player_id", "season_id"],
        set_=dict(
            games=stmt.excluded.games,
            wins=stmt.excluded.wins,
            points=stmt.excluded.points,
            win_rate=stmt.excluded.win_rate,
            avg_point_diff=stmt.excluded.avg_point_diff,
            updated_at=sql_func.now(),
        ),
    )
    await session.execute(stmt)


# ---------------------------------------------------------------------------
# Stats calculation
# ---------------------------------------------------------------------------


async def calculate_global_stats_async(session: AsyncSession) -> Dict:
    """
    Calculate global stats from all ranked matches.

    Deletes existing global stats, processes all ranked matches in-memory,
    then inserts fresh stats — all within one transaction.

    Returns:
        Dict with player_count and match_count.
    """
    matches = await load_stat_eligible_matches_async(session)
    if not matches:
        await delete_global_stats_async(session)
        await session.commit()
        return {"player_count": 0, "match_count": 0}

    partnerships, opponents, elo_history_list = calculation_service.process_matches(matches)

    await delete_global_stats_async(session)
    await insert_elo_history_async(session, elo_history_list)
    await insert_partnership_stats_async(session, partnerships)
    await insert_opponent_stats_async(session, opponents)
    await upsert_player_global_stats_async(session, elo_history_list, matches)
    await session.commit()

    unique_players = {
        pid
        for match in matches
        for pid in [
            match.team1_player1_id,
            match.team1_player2_id,
            match.team2_player1_id,
            match.team2_player2_id,
        ]
    }
    return {"player_count": len(unique_players), "match_count": len(matches)}


async def _calculate_season_stats_from_matches(
    session: AsyncSession, season_id: int, season_matches: List[Match]
) -> Dict:
    """
    Helper: calculate season stats from a pre-loaded list of matches.

    Used internally by calculate_league_stats_async.

    Returns:
        Dict with player_count and match_count.
    """
    season_result = await session.execute(select(Season).where(Season.id == season_id))
    season = season_result.scalar_one_or_none()
    if not season:
        raise ValueError(f"Season {season_id} not found")

    try:
        scoring_config = calculation_service.get_scoring_config(season.point_system)
    except Exception:
        scoring_config = {"type": "points_system", "points_per_win": 3, "points_per_loss": 1}

    is_season_rating = season.scoring_system == ScoringSystem.SEASON_RATING.value

    initial_ratings: Dict[int, float] = {}
    if is_season_rating:
        try:
            league_members_result = await session.execute(
                select(LeagueMember.player_id).where(LeagueMember.league_id == season.league_id)
            )
            all_league_member_ids = [row[0] for row in league_members_result.all()]
            for pid in all_league_member_ids:
                initial_ratings[pid] = 100.0
        except Exception:
            pass

    if not season_matches:
        await delete_season_stats_async(session, season_id)
        return {"player_count": 0, "match_count": 0}

    tracker = calculation_service.StatsTracker(
        initial_ratings=initial_ratings if is_season_rating else None,
        scoring_config=scoring_config,
    )
    for match in season_matches:
        tracker.process_match(match)

    partnership_season_list = []
    for player_id, player_stats in tracker.players.items():
        for partner_id, games in player_stats.games_with.items():
            wins = player_stats.wins_with.get(partner_id, 0)
            losses = games - wins
            win_rate = wins / games if games > 0 else 0
            points = calculation_service.calculate_points(wins, losses, scoring_config)
            total_pt_diff = player_stats.point_diff_with.get(partner_id, 0)
            avg_pt_diff = total_pt_diff / games if games > 0 else 0
            partnership_season_list.append(
                PartnershipStatsSeason(
                    player_id=player_id,
                    partner_id=partner_id,
                    season_id=season_id,
                    games=games,
                    wins=wins,
                    points=points,
                    win_rate=round(win_rate, 3),
                    avg_point_diff=round(avg_pt_diff, 1),
                )
            )

    opponent_season_list = []
    for player_id, player_stats in tracker.players.items():
        for opponent_id, games in player_stats.games_against.items():
            wins = player_stats.wins_against.get(opponent_id, 0)
            losses = games - wins
            win_rate = wins / games if games > 0 else 0
            points = calculation_service.calculate_points(wins, losses, scoring_config)
            total_pt_diff = player_stats.point_diff_against.get(opponent_id, 0)
            avg_pt_diff = total_pt_diff / games if games > 0 else 0
            opponent_season_list.append(
                OpponentStatsSeason(
                    player_id=player_id,
                    opponent_id=opponent_id,
                    season_id=season_id,
                    games=games,
                    wins=wins,
                    points=points,
                    win_rate=round(win_rate, 3),
                    avg_point_diff=round(avg_pt_diff, 1),
                )
            )

    player_stats_list = [
        {
            "player_id": player_id,
            "season_id": season_id,
            "games": player_stats.game_count,
            "wins": player_stats.win_count,
            "points": player_stats.points,
            "win_rate": round(player_stats.win_rate, 3),
            "avg_point_diff": round(player_stats.avg_point_diff, 1),
        }
        for player_id, player_stats in tracker.players.items()
    ]

    season_rating_history_list = []
    if is_season_rating:
        for player_id, player_stats in tracker.players.items():
            for (
                match_id,
                rating_after,
                rating_change,
                d,
            ) in player_stats.match_season_rating_history:
                season_rating_history_list.append(
                    SeasonRatingHistory(
                        player_id=player_id,
                        season_id=season_id,
                        match_id=match_id,
                        date=d or "",
                        rating_after=round(rating_after, 2),
                        rating_change=round(rating_change, 2),
                    )
                )

    await delete_season_stats_async(session, season_id)
    await insert_partnership_stats_season_async(session, partnership_season_list, season_id)
    await insert_opponent_stats_season_async(session, opponent_season_list, season_id)

    if season_rating_history_list:
        await insert_season_rating_history_async(session, season_rating_history_list)

    if player_stats_list:
        stmt = insert(PlayerSeasonStats).values(player_stats_list)
        stmt = stmt.on_conflict_do_update(
            index_elements=["player_id", "season_id"],
            set_=dict(
                games=stmt.excluded.games,
                wins=stmt.excluded.wins,
                points=stmt.excluded.points,
                win_rate=stmt.excluded.win_rate,
                avg_point_diff=stmt.excluded.avg_point_diff,
                updated_at=sql_func.now(),
            ),
        )
        await session.execute(stmt)

    unique_players = {
        pid
        for match in season_matches
        for pid in [
            match.team1_player1_id,
            match.team1_player2_id,
            match.team2_player1_id,
            match.team2_player2_id,
        ]
        if pid
    }
    return {"player_count": len(unique_players), "match_count": len(season_matches)}


async def calculate_league_stats_async(session: AsyncSession, league_id: int) -> Dict:
    """
    Calculate league-level stats and all season stats for a league.

    Loads all ranked matches once, processes league-level stats, then
    calculates per-season stats from in-memory subsets.

    Returns:
        Dict with league_player_count, league_match_count, and season_counts.
    """
    # Lazy import to avoid circular dependency
    from backend.services.league_data import list_seasons

    all_matches = await load_stat_eligible_matches_async(session, league_id=league_id)
    seasons = await list_seasons(session, league_id)
    season_ids = [s["id"] for s in seasons]

    if not all_matches:
        await delete_league_stats_async(session, league_id)
        for sid in season_ids:
            await delete_season_stats_async(session, sid)
        await session.commit()
        return {
            "league_player_count": 0,
            "league_match_count": 0,
            "season_counts": {sid: {"player_count": 0, "match_count": 0} for sid in season_ids},
        }

    session_ids_set = {m.session_id for m in all_matches if m.session_id}
    session_to_season_map: Dict[int, int] = {}
    if session_ids_set:
        sessions_result = await session.execute(
            select(Session.id, Session.season_id).where(Session.id.in_(session_ids_set))
        )
        for sess_id, sess_season_id in sessions_result:
            if sess_season_id:
                session_to_season_map[sess_id] = sess_season_id

    partnerships, opponents, _ = calculation_service.process_matches(all_matches)

    league_tracker = calculation_service.StatsTracker()
    for match in all_matches:
        league_tracker.process_match(match)

    partnership_league_list = [
        PartnershipStatsLeague(
            player_id=ps.player_id,
            partner_id=ps.partner_id,
            league_id=league_id,
            games=ps.games,
            wins=ps.wins,
            points=ps.points,
            win_rate=ps.win_rate,
            avg_point_diff=ps.avg_point_diff,
        )
        for ps in partnerships
    ]

    opponent_league_list = [
        OpponentStatsLeague(
            player_id=os.player_id,
            opponent_id=os.opponent_id,
            league_id=league_id,
            games=os.games,
            wins=os.wins,
            points=os.points,
            win_rate=os.win_rate,
            avg_point_diff=os.avg_point_diff,
        )
        for os in opponents
    ]

    player_league_stats_list = [
        {
            "player_id": player_id,
            "league_id": league_id,
            "games": player_stats.game_count,
            "wins": player_stats.win_count,
            "points": player_stats.points,
            "win_rate": round(player_stats.win_rate, 3),
            "avg_point_diff": round(player_stats.avg_point_diff, 1),
        }
        for player_id, player_stats in league_tracker.players.items()
    ]

    await delete_league_stats_async(session, league_id)
    await insert_partnership_stats_league_async(session, partnership_league_list, league_id)
    await insert_opponent_stats_league_async(session, opponent_league_list, league_id)

    if player_league_stats_list:
        stmt = insert(PlayerLeagueStats).values(player_league_stats_list)
        stmt = stmt.on_conflict_do_update(
            index_elements=["player_id", "league_id"],
            set_=dict(
                games=stmt.excluded.games,
                wins=stmt.excluded.wins,
                points=stmt.excluded.points,
                win_rate=stmt.excluded.win_rate,
                avg_point_diff=stmt.excluded.avg_point_diff,
                updated_at=sql_func.now(),
            ),
        )
        await session.execute(stmt)

    matches_by_season: Dict[int, List[Match]] = {}
    for match in all_matches:
        sid = session_to_season_map.get(match.session_id) if match.session_id else None
        if sid and sid in season_ids:
            matches_by_season.setdefault(sid, []).append(match)

    season_counts: Dict[int, Dict] = {}
    for sid in season_ids:
        season_matches = matches_by_season.get(sid, [])
        season_counts[sid] = await _calculate_season_stats_from_matches(
            session, sid, season_matches
        )

    unique_league_players = {
        pid
        for match in all_matches
        for pid in [
            match.team1_player1_id,
            match.team1_player2_id,
            match.team2_player1_id,
            match.team2_player2_id,
        ]
        if pid
    }

    await session.commit()

    return {
        "league_player_count": len(unique_league_players),
        "league_match_count": len(all_matches),
        "season_counts": season_counts,
    }


async def calculate_season_stats_async(session: AsyncSession, season_id: int) -> Dict:
    """
    Calculate season-specific stats from ranked matches.

    Backward-compatibility wrapper around _calculate_season_stats_from_matches.
    For new code, prefer calculate_league_stats_async.

    Returns:
        Dict with player_count and match_count.
    """
    matches = await load_stat_eligible_matches_async(session, season_id=season_id)
    result = await _calculate_season_stats_from_matches(session, season_id, matches)
    await session.commit()
    return result


def register_stats_queue_callbacks() -> None:
    """
    Register stats calculation callbacks with the stats queue.

    Call during application startup before the stats queue worker is started.
    Uses lazy import to break the circular dependency between stats_queue and
    this module.
    """
    from backend.services.stats_queue import get_stats_queue

    queue = get_stats_queue()
    queue.register_calculation_callbacks(
        global_calc_callback=calculate_global_stats_async,
        league_calc_callback=calculate_league_stats_async,
    )
