"""
My Stats service — composes per-player stats for the authenticated user's
stats dashboard (GET /api/users/me/stats).

Aggregates:
- Player identity (name, city, level)
- Overall stats (wins, losses, rating, peak_rating, current_streak, etc.)
- Trophies (placement awards only — gold/silver/bronze)
- Partners and opponents breakdown
- ELO timeline (per-player date/rating pairs)

Three computation paths:
1. Fast path — no filters: read from pre-aggregated tables (PlayerSeasonStats,
   PartnershipStats, OpponentStats).
2. League-only path — ``league_id`` set, ``days`` not set: read from
   league-scoped aggregate tables (PlayerLeagueStats, PartnershipStatsLeague,
   OpponentStatsLeague) and constrain elo timeline / streak by the league's
   seasons.
3. Recompute path — ``days`` set (with or without ``league_id``): recompute
   overall / partners / opponents / elo timeline from raw Match rows joined to
   Session for the time window. Trophies are not windowed by ``days``; they
   reflect lifetime (or league-only) placements.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Dict, List, Literal, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from backend.database.models import (
    EloHistory,
    Match,
    OpponentStats,
    OpponentStatsLeague,
    PartnershipStats,
    PartnershipStatsLeague,
    Player,
    PlayerGlobalStats,
    PlayerLeagueStats,
    Session,
    SessionStatus,
)
from backend.services.player_data import generate_player_initials
from backend.services.season_awards_service import get_player_awards
from backend.utils.constants import INITIAL_ELO

logger = logging.getLogger(__name__)

_SUBMITTED_STATUSES = (SessionStatus.SUBMITTED, SessionStatus.EDITED)


def _signed_diff_for_row(row, player_id: int) -> int:
    """Signed point diff for `player_id` from a Core ``Row`` of Match columns."""
    on_team1 = player_id in (row.team1_player1_id, row.team1_player2_id)
    return (row.team1_score - row.team2_score) if on_team1 else (row.team2_score - row.team1_score)


async def get_my_stats(
    session: AsyncSession,
    player_id: int,
    *,
    league_id: Optional[int] = None,
    days: Optional[int] = None,
) -> Optional[Dict]:
    """
    Build the full MyStatsPayload for a player.

    Args:
        session: Async database session.
        player_id: ID of the authenticated player.
        league_id: Optional league filter. When set, every aggregate is
            restricted to matches/seasons in this league.
        days: Optional time window. When set, overall/partners/opponents/
            elo_timeline are recomputed from raw match rows whose session
            date falls in the last ``days`` days.

    Returns:
        Dict matching ``MyStatsPayload`` schema, or ``None`` if the player
        does not exist.
    """
    # --- Player identity ---------------------------------------------------
    result = await session.execute(select(Player).where(Player.id == player_id))
    player = result.scalar_one_or_none()
    if not player:
        return None

    player_name = player.full_name or player.nickname or f"Player {player_id}"
    player_city = getattr(player, "city", None)
    player_level = player.level

    # --- Global rating (always lifetime) ----------------------------------
    result = await session.execute(
        select(PlayerGlobalStats).where(PlayerGlobalStats.player_id == player_id)
    )
    global_stats = result.scalar_one_or_none()
    current_rating = round(global_stats.current_rating) if global_stats else INITIAL_ELO

    date_cutoff = _days_to_cutoff(days)

    # --- Overall + peak + partners + opponents (path-dependent) -----------
    if days is None:
        overall = await _overall_from_aggregates(session, player_id, league_id)
        peak_rating = await _peak_rating_from_aggregates(session, player_id, league_id)
        partners = await _partners_from_aggregates(session, player_id, league_id)
        opponents = await _opponents_from_aggregates(session, player_id, league_id)
    else:
        match_ids, overall = await _overall_from_matches(
            session, player_id, league_id, date_cutoff
        )
        peak_rating = await _peak_rating_from_match_ids(session, player_id, match_ids)
        partners = await _relations_from_matches(session, player_id, match_ids, "partner")
        opponents = await _relations_from_matches(session, player_id, match_ids, "opponent")

    if peak_rating is None:
        peak_rating = current_rating

    # --- Streak (always bounded by filters when set) ----------------------
    current_streak = await _compute_current_streak(
        session, player_id, league_id=league_id, date_cutoff=date_cutoff
    )

    # --- ELO timeline (path-dependent) ------------------------------------
    if days is None:
        elo_timeline = await _elo_timeline_full(session, player_id, league_id)
    else:
        elo_timeline = await _elo_timeline_for_match_ids(session, player_id, match_ids)

    # --- Trophies ---------------------------------------------------------
    # Trophies are not windowed by ``days`` — they always reflect lifetime
    # (or league-scoped) placement awards. Documented in the P3.5 plan.
    all_awards = await get_player_awards(session, player_id)
    trophies = [
        {
            "league_id": a["league_id"],
            "league_name": a.get("league_name", ""),
            "season_name": a.get("season_name", ""),
            "place": a["rank"],
        }
        for a in all_awards
        if a.get("award_type") == "placement"
        and a.get("rank") is not None
        and (league_id is None or a.get("league_id") == league_id)
    ]

    return {
        "player_name": player_name,
        "player_city": player_city,
        "player_level": player_level,
        "overall": {
            **overall,
            "rating": current_rating,
            "peak_rating": peak_rating,
            "current_streak": current_streak,
        },
        "trophies": trophies,
        "partners": partners,
        "opponents": opponents,
        "elo_timeline": elo_timeline,
    }


# ---------------------------------------------------------------------------
# Filter helpers
# ---------------------------------------------------------------------------


def _days_to_cutoff(days: Optional[int]) -> Optional[str]:
    """Translate a positive ``days`` window into an inclusive YYYY-MM-DD cutoff.

    Session.date is stored as a YYYY-MM-DD string, so a lexicographic ``>=``
    compare against this cutoff is correct.
    """
    if days is None:
        return None
    return (date.today() - timedelta(days=days)).isoformat()


def _player_team_clause(player_id: int):
    """Boolean clause matching matches where ``player_id`` is on either team."""
    return (
        (Match.team1_player1_id == player_id)
        | (Match.team1_player2_id == player_id)
        | (Match.team2_player1_id == player_id)
        | (Match.team2_player2_id == player_id)
    )


# ---------------------------------------------------------------------------
# Aggregate-table paths (no ``days``)
# ---------------------------------------------------------------------------


async def _overall_from_aggregates(
    session: AsyncSession, player_id: int, league_id: Optional[int]
) -> Dict:
    """Build the overall block from pre-aggregated tables.

    Lifetime (``league_id is None``) reads ``PlayerGlobalStats`` — a single row
    holding true cross-league totals. League-scoped reads from
    ``PlayerLeagueStats``.
    """
    if league_id is None:
        result = await session.execute(
            select(PlayerGlobalStats).where(PlayerGlobalStats.player_id == player_id)
        )
        row = result.scalar_one_or_none()
        games_played = row.total_games if row else 0
        wins = row.total_wins if row else 0
        win_rate = (wins / games_played * 100) if games_played else 0.0
        avg_point_diff = float(row.avg_point_diff) if row else 0.0
        return {
            "wins": wins,
            "losses": games_played - wins,
            "games_played": games_played,
            "win_rate": round(win_rate, 1),
            "avg_point_diff": round(avg_point_diff, 1),
        }

    result = await session.execute(
        select(PlayerLeagueStats).where(
            PlayerLeagueStats.player_id == player_id,
            PlayerLeagueStats.league_id == league_id,
        )
    )
    row = result.scalar_one_or_none()
    games_played = row.games if row else 0
    wins = row.wins if row else 0
    win_rate = (wins / games_played * 100) if games_played else 0.0
    avg_point_diff = float(row.avg_point_diff) if row else 0.0
    return {
        "wins": wins,
        "losses": games_played - wins,
        "games_played": games_played,
        "win_rate": round(win_rate, 1),
        "avg_point_diff": round(avg_point_diff, 1),
    }


async def _peak_rating_from_aggregates(
    session: AsyncSession, player_id: int, league_id: Optional[int]
) -> Optional[int]:
    """Peak ``elo_after`` for a player, optionally constrained to a league.

    Uses ``Session.league_id == league_id`` so that gap-game sessions
    (league_id set, season_id NULL) are included.  The former
    ``Season.id``-subquery excluded gap games because their season_id is NULL.
    """
    query = select(func.max(EloHistory.elo_after)).where(EloHistory.player_id == player_id)
    if league_id is not None:
        query = (
            query.join(Match, EloHistory.match_id == Match.id)
            .join(Session, Match.session_id == Session.id)
            .where(Session.league_id == league_id)
        )
    result = await session.execute(query)
    peak = result.scalar()
    return round(peak) if peak is not None else None


async def _partners_from_aggregates(
    session: AsyncSession, player_id: int, league_id: Optional[int]
) -> List[Dict]:
    """Partners breakdown from PartnershipStats / PartnershipStatsLeague."""
    PartnerPlayer = aliased(Player)
    if league_id is None:
        query = (
            select(
                PartnershipStats,
                PartnerPlayer.id.label("partner_player_id"),
                PartnerPlayer.full_name.label("partner_name"),
            )
            .join(PartnerPlayer, PartnershipStats.partner_id == PartnerPlayer.id)
            .where(PartnershipStats.player_id == player_id)
            .order_by(PartnershipStats.points.desc(), PartnershipStats.win_rate.desc())
        )
    else:
        query = (
            select(
                PartnershipStatsLeague,
                PartnerPlayer.id.label("partner_player_id"),
                PartnerPlayer.full_name.label("partner_name"),
            )
            .join(PartnerPlayer, PartnershipStatsLeague.partner_id == PartnerPlayer.id)
            .where(
                PartnershipStatsLeague.player_id == player_id,
                PartnershipStatsLeague.league_id == league_id,
            )
            .order_by(
                PartnershipStatsLeague.points.desc(),
                PartnershipStatsLeague.win_rate.desc(),
            )
        )
    result = await session.execute(query)
    return [
        _build_relation_row(
            player_id=row.partner_player_id,
            full_name=row.partner_name,
            games=row[0].games,
            wins=row[0].wins,
            # Stored win_rate is canonically 0-1; the payload contract is 0-100
            # (the days-windowed path computes wins/games*100 directly).
            win_rate=row[0].win_rate * 100,
        )
        for row in result.all()
    ]


async def _opponents_from_aggregates(
    session: AsyncSession, player_id: int, league_id: Optional[int]
) -> List[Dict]:
    """Opponents breakdown from OpponentStats / OpponentStatsLeague."""
    OpponentPlayer = aliased(Player)
    if league_id is None:
        query = (
            select(
                OpponentStats,
                OpponentPlayer.id.label("opponent_player_id"),
                OpponentPlayer.full_name.label("opponent_name"),
            )
            .join(OpponentPlayer, OpponentStats.opponent_id == OpponentPlayer.id)
            .where(OpponentStats.player_id == player_id)
            .order_by(OpponentStats.points.desc(), OpponentStats.win_rate.desc())
        )
    else:
        query = (
            select(
                OpponentStatsLeague,
                OpponentPlayer.id.label("opponent_player_id"),
                OpponentPlayer.full_name.label("opponent_name"),
            )
            .join(OpponentPlayer, OpponentStatsLeague.opponent_id == OpponentPlayer.id)
            .where(
                OpponentStatsLeague.player_id == player_id,
                OpponentStatsLeague.league_id == league_id,
            )
            .order_by(
                OpponentStatsLeague.points.desc(),
                OpponentStatsLeague.win_rate.desc(),
            )
        )
    result = await session.execute(query)
    return [
        _build_relation_row(
            player_id=row.opponent_player_id,
            full_name=row.opponent_name,
            games=row[0].games,
            wins=row[0].wins,
            # Stored win_rate is canonically 0-1; the payload contract is 0-100
            # (the days-windowed path computes wins/games*100 directly).
            win_rate=row[0].win_rate * 100,
        )
        for row in result.all()
    ]


async def _elo_timeline_full(
    session: AsyncSession, player_id: int, league_id: Optional[int]
) -> List[Dict]:
    """Per-player ELO timeline (lifetime or league-scoped).

    Uses ``Session.league_id == league_id`` so that gap-game sessions
    (league_id set, season_id NULL) are included in the timeline.
    """
    query = (
        select(EloHistory.date, EloHistory.elo_after)
        .where(EloHistory.player_id == player_id)
        .order_by(EloHistory.date.asc(), EloHistory.match_id.asc())
    )
    if league_id is not None:
        query = (
            query.join(Match, EloHistory.match_id == Match.id)
            .join(Session, Match.session_id == Session.id)
            .where(Session.league_id == league_id)
        )
    result = await session.execute(query)
    elo_by_date: Dict[str, float] = {}
    for elo_date, elo_after in result.all():
        elo_by_date[elo_date] = round(elo_after)
    return [{"date": d, "rating": r} for d, r in elo_by_date.items()]


# ---------------------------------------------------------------------------
# Recompute paths (``days`` set)
# ---------------------------------------------------------------------------


async def _overall_from_matches(
    session: AsyncSession,
    player_id: int,
    league_id: Optional[int],
    date_cutoff: Optional[str],
) -> Tuple[List[int], Dict]:
    """Recompute overall stats from raw Match rows in the time window.

    Returns:
        (match_ids, overall_dict). ``match_ids`` is the list of qualifying
        match ids — passed to downstream helpers so they can constrain
        peak / partners / opponents / elo_timeline to the same set.
    """
    query = (
        select(
            Match.id,
            Match.team1_player1_id,
            Match.team1_player2_id,
            Match.team2_player1_id,
            Match.team2_player2_id,
            Match.team1_score,
            Match.team2_score,
            Match.winner,
        )
        .select_from(Match)
        .join(Session, Match.session_id == Session.id)
        .where(
            Session.status.in_(_SUBMITTED_STATUSES),
            _player_team_clause(player_id),
        )
    )
    if date_cutoff is not None:
        query = query.where(Session.date >= date_cutoff)
    if league_id is not None:
        # Use Session.league_id directly so gap-game sessions (league_id set,
        # season_id NULL) are included.  The former season-subquery excluded
        # gap games because season_id=NULL is never IN a list of season ids.
        query = query.where(Session.league_id == league_id)

    rows = (await session.execute(query)).all()

    match_ids: List[int] = []
    games_played = 0
    wins = 0
    losses = 0
    point_diff_total = 0

    for row in rows:
        match_ids.append(row.id)
        on_team1 = row.team1_player1_id == player_id or row.team1_player2_id == player_id
        point_diff_total += _signed_diff_for_row(row, player_id)
        if row.winner == -1:
            # Tie — counts toward games_played but not wins/losses.
            games_played += 1
            continue

        games_played += 1
        player_won = (on_team1 and row.winner == 1) or (not on_team1 and row.winner == 2)
        if player_won:
            wins += 1
        else:
            losses += 1

    win_rate = round((wins / games_played) * 100, 1) if games_played else 0.0
    avg_point_diff = round(point_diff_total / games_played, 1) if games_played else 0.0

    return match_ids, {
        "wins": wins,
        "losses": losses,
        "games_played": games_played,
        "win_rate": win_rate,
        "avg_point_diff": avg_point_diff,
    }


async def _peak_rating_from_match_ids(
    session: AsyncSession, player_id: int, match_ids: List[int]
) -> Optional[int]:
    """MAX(elo_after) for a player constrained to a list of match ids."""
    if not match_ids:
        return None
    result = await session.execute(
        select(func.max(EloHistory.elo_after)).where(
            EloHistory.player_id == player_id,
            EloHistory.match_id.in_(match_ids),
        )
    )
    peak = result.scalar()
    return round(peak) if peak is not None else None


async def _relations_from_matches(
    session: AsyncSession,
    player_id: int,
    match_ids: List[int],
    role: Literal["partner", "opponent"],
) -> List[Dict]:
    """Aggregate partner/opponent stats from a list of qualifying match ids.

    Walks the rows in Python — the dataset is bounded by ``days`` which
    typically yields tens-to-hundreds of matches. Avoids a complex
    SQL pivot at the cost of a single extra query for player names.
    """
    if not match_ids:
        return []

    rows = (
        await session.execute(
            select(
                Match.id,
                Match.team1_player1_id,
                Match.team1_player2_id,
                Match.team2_player1_id,
                Match.team2_player2_id,
                Match.winner,
            ).where(Match.id.in_(match_ids))
        )
    ).all()

    # other_id -> [games, wins]
    counter: Dict[int, List[int]] = {}
    for row in rows:
        team1 = (row.team1_player1_id, row.team1_player2_id)
        team2 = (row.team2_player1_id, row.team2_player2_id)
        on_team1 = player_id in team1
        my_team = team1 if on_team1 else team2
        their_team = team2 if on_team1 else team1
        if row.winner == -1:
            won = False
        else:
            won = (on_team1 and row.winner == 1) or (not on_team1 and row.winner == 2)

        if role == "partner":
            others = [pid for pid in my_team if pid != player_id]
        else:
            others = list(their_team)

        for other_id in others:
            entry = counter.setdefault(other_id, [0, 0])
            entry[0] += 1
            if won:
                entry[1] += 1

    if not counter:
        return []

    other_ids = list(counter.keys())
    name_rows = (
        await session.execute(select(Player.id, Player.full_name).where(Player.id.in_(other_ids)))
    ).all()
    names = {pid: name for pid, name in name_rows}

    out: List[Dict] = []
    for other_id, (games, wins) in counter.items():
        win_rate = round((wins / games) * 100, 1) if games else 0.0
        out.append(
            _build_relation_row(
                player_id=other_id,
                full_name=names.get(other_id),
                games=games,
                wins=wins,
                win_rate=win_rate,
            )
        )
    # Sort by games desc, then win_rate desc — mirrors aggregate-table order.
    out.sort(key=lambda r: (-r["games_played"], -r["win_rate"]))
    return out


async def _elo_timeline_for_match_ids(
    session: AsyncSession, player_id: int, match_ids: List[int]
) -> List[Dict]:
    """ELO timeline restricted to a list of match ids."""
    if not match_ids:
        return []
    result = await session.execute(
        select(EloHistory.date, EloHistory.elo_after)
        .where(
            EloHistory.player_id == player_id,
            EloHistory.match_id.in_(match_ids),
        )
        .order_by(EloHistory.date.asc(), EloHistory.match_id.asc())
    )
    elo_by_date: Dict[str, float] = {}
    for elo_date, elo_after in result.all():
        elo_by_date[elo_date] = round(elo_after)
    return [{"date": d, "rating": r} for d, r in elo_by_date.items()]


# ---------------------------------------------------------------------------
# Streak (shared)
# ---------------------------------------------------------------------------


async def _compute_current_streak(
    session: AsyncSession,
    player_id: int,
    *,
    league_id: Optional[int] = None,
    date_cutoff: Optional[str] = None,
) -> int:
    """Compute the current win/loss streak for a player.

    Walks match results from newest to oldest (submitted sessions only).
    Returns a positive integer for a win streak, negative for a loss streak,
    and 0 when there are no completed matches.

    Args:
        session: Async database session.
        player_id: ID of the player.
        league_id: Restrict to sessions whose season belongs to this league.
        date_cutoff: Inclusive YYYY-MM-DD cutoff on Session.date.

    Returns:
        Integer streak value (positive = wins, negative = losses, 0 = none).
    """
    query = (
        select(Match.winner, Match.team1_player1_id, Match.team1_player2_id)
        .select_from(Match)
        .join(Session, Match.session_id == Session.id)
        .where(
            Session.status.in_(_SUBMITTED_STATUSES),
            _player_team_clause(player_id),
        )
        .order_by(Match.id.desc())
        .limit(50)
    )
    if league_id is not None:
        # Use Session.league_id directly so gap-game sessions (league_id set,
        # season_id NULL) contribute to the league streak.
        query = query.where(Session.league_id == league_id)
    if date_cutoff is not None:
        query = query.where(Session.date >= date_cutoff)

    result = await session.execute(query)
    rows = result.all()

    if not rows:
        return 0

    streak = 0
    streak_sign: Optional[int] = None  # +1 for win streak, -1 for loss streak

    for row in rows:
        on_team1 = row.team1_player1_id == player_id or row.team1_player2_id == player_id
        if row.winner == -1:
            # Tie — treat as neutral; stop streak counting
            break
        player_won = (on_team1 and row.winner == 1) or (not on_team1 and row.winner == 2)
        result_sign = 1 if player_won else -1

        if streak_sign is None:
            streak_sign = result_sign
            streak = result_sign
        elif result_sign == streak_sign:
            streak += result_sign
        else:
            break

    return streak


# ---------------------------------------------------------------------------
# Relation row builder (shared)
# ---------------------------------------------------------------------------


def _build_relation_row(
    player_id: int,
    full_name: Optional[str],
    games: int,
    wins: int,
    win_rate: float,
) -> Dict:
    """Build a partner/opponent row dict matching ``MyStatsRelationStat``.

    Args:
        player_id: ID of the partner or opponent player.
        full_name: Full name used to derive display_name and initials.
        games: Total games played together/against.
        wins: Number of wins.
        win_rate: Win rate percentage.

    Returns:
        Dict with keys matching ``MyStatsRelationStat``.
    """
    name = full_name or f"Player {player_id}"
    initials = generate_player_initials(name)
    parts = name.split()
    if len(parts) >= 2:
        display_name = f"{parts[0][0]}. {parts[-1]}"
    else:
        display_name = name

    return {
        "player_id": player_id,
        "display_name": display_name,
        "initials": initials,
        "games_played": games,
        "wins": wins,
        "losses": games - wins,
        "win_rate": round(float(win_rate), 1),
    }
