"""
My Stats service — composes per-player stats for the authenticated user's
stats dashboard (GET /api/users/me/stats).

Aggregates:
- Player identity (name, city, level)
- Overall stats (wins, losses, rating, peak_rating, current_streak, etc.)
- Trophies (placement awards only — gold/silver/bronze)
- Partners and opponents breakdown
- ELO timeline (per-player date/rating pairs)
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from backend.database.models import (
    EloHistory,
    Match,
    OpponentStats,
    PartnershipStats,
    Player,
    PlayerGlobalStats,
    PlayerSeasonStats,
    SeasonAward,
    Session,
    SessionStatus,
)
from backend.services.player_data import generate_player_initials
from backend.services.season_awards_service import get_player_awards
from backend.utils.constants import INITIAL_ELO

logger = logging.getLogger(__name__)


async def get_my_stats(
    session: AsyncSession,
    player_id: int,
) -> Optional[Dict]:
    """
    Build the full MyStatsPayload for a player.

    Args:
        session: Async database session.
        player_id: ID of the authenticated player.

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

    # --- Global rating ----------------------------------------------------
    result = await session.execute(
        select(PlayerGlobalStats).where(PlayerGlobalStats.player_id == player_id)
    )
    global_stats = result.scalar_one_or_none()
    current_rating = round(global_stats.current_rating) if global_stats else INITIAL_ELO

    # --- Aggregated season stats (latest season row) ----------------------
    result = await session.execute(
        select(PlayerSeasonStats)
        .where(PlayerSeasonStats.player_id == player_id)
        .order_by(PlayerSeasonStats.updated_at.desc())
        .limit(1)
    )
    season_row = result.scalar_one_or_none()
    games_played = season_row.games if season_row else 0
    wins = season_row.wins if season_row else 0
    losses = games_played - wins
    win_rate = round(float(season_row.win_rate), 1) if season_row else 0.0
    avg_point_diff = round(float(season_row.avg_point_diff), 1) if season_row else 0.0

    # --- Peak rating (MAX elo_after for this player) ----------------------
    peak_result = await session.execute(
        select(func.max(EloHistory.elo_after)).where(EloHistory.player_id == player_id)
    )
    peak_raw = peak_result.scalar()
    peak_rating = round(peak_raw) if peak_raw is not None else current_rating

    # --- Current streak ---------------------------------------------------
    current_streak = await _compute_current_streak(session, player_id)

    # --- Trophies (placement awards only) ---------------------------------
    all_awards = await get_player_awards(session, player_id)
    trophies = [
        {
            "league_id": a["league_id"],
            "league_name": a.get("league_name", ""),
            "season_name": a.get("season_name", ""),
            "place": a["rank"],
        }
        for a in all_awards
        if a.get("award_type") == "placement" and a.get("rank") is not None
    ]

    # --- Partners ---------------------------------------------------------
    PartnerPlayer = aliased(Player)
    result = await session.execute(
        select(
            PartnershipStats,
            PartnerPlayer.id.label("partner_player_id"),
            PartnerPlayer.full_name.label("partner_name"),
        )
        .join(PartnerPlayer, PartnershipStats.partner_id == PartnerPlayer.id)
        .where(PartnershipStats.player_id == player_id)
        .order_by(PartnershipStats.points.desc(), PartnershipStats.win_rate.desc())
    )
    partners = [
        _build_relation_row(
            player_id=row.partner_player_id,
            full_name=row.partner_name,
            games=row[0].games,
            wins=row[0].wins,
            win_rate=row[0].win_rate,
        )
        for row in result.all()
    ]

    # --- Opponents --------------------------------------------------------
    OpponentPlayer = aliased(Player)
    result = await session.execute(
        select(
            OpponentStats,
            OpponentPlayer.id.label("opponent_player_id"),
            OpponentPlayer.full_name.label("opponent_name"),
        )
        .join(OpponentPlayer, OpponentStats.opponent_id == OpponentPlayer.id)
        .where(OpponentStats.player_id == player_id)
        .order_by(OpponentStats.points.desc(), OpponentStats.win_rate.desc())
    )
    opponents = [
        _build_relation_row(
            player_id=row.opponent_player_id,
            full_name=row.opponent_name,
            games=row[0].games,
            wins=row[0].wins,
            win_rate=row[0].win_rate,
        )
        for row in result.all()
    ]

    # --- ELO timeline (per-player) ----------------------------------------
    elo_result = await session.execute(
        select(EloHistory.date, EloHistory.elo_after)
        .where(EloHistory.player_id == player_id)
        .order_by(EloHistory.date.asc(), EloHistory.id.asc())
    )
    # Deduplicate: keep latest elo_after per date (last row per date wins
    # because rows are ordered by date asc, id asc so we overwrite).
    elo_by_date: Dict[str, float] = {}
    for elo_date, elo_after in elo_result.all():
        elo_by_date[elo_date] = round(elo_after)

    elo_timeline = [{"date": d, "rating": r} for d, r in elo_by_date.items()]

    return {
        "player_name": player_name,
        "player_city": player_city,
        "player_level": player_level,
        "overall": {
            "wins": wins,
            "losses": losses,
            "games_played": games_played,
            "rating": current_rating,
            "peak_rating": peak_rating,
            "win_rate": win_rate,
            "current_streak": current_streak,
            "avg_point_diff": avg_point_diff,
        },
        "trophies": trophies,
        "partners": partners,
        "opponents": opponents,
        "elo_timeline": elo_timeline,
    }


# ---------------------------------------------------------------------------
# Private helpers
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
    # Abbreviated display name: "First L." when two tokens, else full name.
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


async def _compute_current_streak(session: AsyncSession, player_id: int) -> int:
    """Compute the current win/loss streak for a player.

    Walks match results from newest to oldest (submitted sessions only).
    Returns a positive integer for a win streak, negative for a loss streak,
    and 0 when there are no completed matches.

    Args:
        session: Async database session.
        player_id: ID of the player.

    Returns:
        Integer streak value (positive = wins, negative = losses, 0 = none).
    """
    result = await session.execute(
        select(Match.winner, Match.team1_player1_id, Match.team1_player2_id)
        .select_from(Match)
        .join(Session, Match.session_id == Session.id)
        .where(
            Session.status.in_([SessionStatus.SUBMITTED, SessionStatus.EDITED]),
            (Match.team1_player1_id == player_id)
            | (Match.team1_player2_id == player_id)
            | (Match.team2_player1_id == player_id)
            | (Match.team2_player2_id == player_id),
        )
        .order_by(Match.id.desc())
        .limit(50)
    )
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
