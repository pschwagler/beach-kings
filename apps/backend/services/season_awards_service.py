"""
Season awards service — computes and manages end-of-season awards.

Awards include podium placements (gold/silver/bronze from final rankings)
and stat awards (Ironman, Sharpshooter, Rising Star, Point Machine) that
exclude podium finishers to spread recognition. Each player can win at
most one stat award.

Awards are lazy-computed on first request after a season ends, with a
background worker as a safety net.
"""

import logging
from datetime import date
from typing import Dict, List, Optional

from sqlalchemy import select, delete, and_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    EloHistory,
    League,
    Player,
    Season,
    SeasonAward,
    NotificationType,
)
from backend.services import data_service
from backend.utils.datetime_utils import utcnow

logger = logging.getLogger(__name__)

# Minimum games required to qualify for stat awards
MIN_GAMES_STAT_AWARD = 5

# Award key constants
PLACEMENT_KEYS = ["gold", "silver", "bronze"]
STAT_AWARD_DEFS = [
    {"key": "ironman", "stat": "Games"},
    {"key": "sharpshooter", "stat": "Win Rate"},
    {"key": "point_machine", "stat": "Avg Pt Diff"},
    {"key": "rising_star", "stat": "_elo_delta"},
]

# Display labels for notification messages
AWARD_LABELS = {
    "gold": "Gold (1st Place)",
    "silver": "Silver (2nd Place)",
    "bronze": "Bronze (3rd Place)",
    "ironman": "Ironman (Most Games)",
    "sharpshooter": "Sharpshooter (Best Win Rate)",
    "point_machine": "Point Machine (Best Avg Point Diff)",
    "rising_star": "Rising Star (Most ELO Growth)",
}


def _award_to_dict(award: SeasonAward, extra: Optional[Dict] = None) -> Dict:
    """Serialize a SeasonAward ORM object to a response dict.

    Args:
        award: SeasonAward ORM object
        extra: Optional extra fields to merge (e.g. player_name, league_name)

    Returns:
        Serialized award dict
    """
    result = {
        "id": award.id,
        "season_id": award.season_id,
        "season_name": award.season_name,
        "league_id": award.league_id,
        "player_id": award.player_id,
        "award_type": award.award_type,
        "award_key": award.award_key,
        "rank": award.rank,
        "value": award.value,
        "created_at": award.created_at.isoformat() if award.created_at else None,
    }
    if extra:
        result.update(extra)
    return result


def season_has_ended(season: Season) -> bool:
    """Check whether a season's end_date is in the past.

    Args:
        season: Season ORM object

    Returns:
        True if end_date exists and is before today
    """
    return bool(season.end_date and season.end_date < date.today())


async def compute_season_awards(session: AsyncSession, season_id: int) -> List[Dict]:
    """
    Compute and persist awards for a completed season.

    Determines podium placements (top 3) from final rankings and stat awards
    (Ironman, Sharpshooter, Point Machine, Rising Star) from eligible players
    who are NOT in the top 3. Each player can win at most one stat award —
    awards are assigned in definition order and previously-awarded players
    are skipped.

    Safe to call multiple times — returns existing awards if already finalized.

    Args:
        session: Database session
        season_id: ID of the completed season

    Returns:
        List of created award dicts (with player/league info if already existed)
    """
    # Load season
    season_result = await session.execute(
        select(Season).where(Season.id == season_id)
    )
    season = season_result.scalar_one_or_none()
    if not season:
        logger.warning(f"Season {season_id} not found for award computation")
        return []

    # Guard: already finalized — return existing awards instead of re-computing
    if season.awards_finalized_at is not None:
        logger.info(f"Season {season_id} already finalized, returning existing awards")
        return await _fetch_awards(session, SeasonAward.season_id == season_id)

    league_result = await session.execute(
        select(League.id, League.name).where(League.id == season.league_id)
    )
    league_row = league_result.one_or_none()
    if not league_row:
        logger.warning(f"League {season.league_id} not found for season {season_id}")
        return []

    league_id = league_row.id
    season_name = season.name or f"Season {season.id}"

    # Get final rankings for this season
    rankings = await data_service.get_rankings(session, {"season_id": season_id})
    if not rankings:
        logger.info(f"No rankings for season {season_id}, skipping awards")
        return []

    # Filter to players with games > 0
    active_players = [r for r in rankings if r.get("Games", 0) > 0]
    if not active_players:
        logger.info(f"No active players in season {season_id}, skipping awards")
        return []

    awards_to_create: List[SeasonAward] = []

    # --- Podium placements (top 3) ---
    podium_player_ids = set()
    for i, player in enumerate(active_players[:3]):
        rank = i + 1
        award_key = PLACEMENT_KEYS[i]
        podium_player_ids.add(player["player_id"])
        awards_to_create.append(
            SeasonAward(
                season_id=season_id,
                player_id=player["player_id"],
                award_type="placement",
                award_key=award_key,
                rank=rank,
                value=float(player.get("Points", 0)),
                season_name=season_name,
                league_id=league_id,
            )
        )

    # --- Stat awards (excluding podium finishers, min games threshold) ---
    # Each player can only win one stat award. Awards are assigned in
    # definition order (ironman → sharpshooter → point_machine → rising_star).
    eligible = [
        r
        for r in active_players
        if r["player_id"] not in podium_player_ids
        and r.get("Games", 0) >= MIN_GAMES_STAT_AWARD
    ]

    # Compute ELO deltas for Rising Star
    elo_deltas = await _compute_elo_deltas(
        session, season, [r["player_id"] for r in eligible]
    )

    stat_awarded_player_ids: set = set()

    for award_def in STAT_AWARD_DEFS:
        stat_key = award_def["stat"]
        award_key = award_def["key"]

        if stat_key == "_elo_delta":
            candidates = [
                (r, elo_deltas.get(r["player_id"], 0.0))
                for r in eligible
                if r["player_id"] not in stat_awarded_player_ids
            ]
            candidates = [(r, v) for r, v in candidates if v > 0]
        else:
            candidates = [
                (r, float(r.get(stat_key, 0)))
                for r in eligible
                if r["player_id"] not in stat_awarded_player_ids
            ]
            candidates = [(r, v) for r, v in candidates if v > 0]

        if not candidates:
            continue

        # Sort by stat value descending
        candidates.sort(key=lambda x: x[1], reverse=True)
        winner, stat_value = candidates[0]
        stat_awarded_player_ids.add(winner["player_id"])

        awards_to_create.append(
            SeasonAward(
                season_id=season_id,
                player_id=winner["player_id"],
                award_type="stat_award",
                award_key=award_key,
                rank=None,
                value=round(stat_value, 2),
                season_name=season_name,
                league_id=league_id,
            )
        )

    # Persist awards — handle race condition where another process finalized first
    try:
        for award in awards_to_create:
            session.add(award)

        season.awards_finalized_at = utcnow()
        await session.flush()

        # Send notifications to winners
        await _notify_winners(session, awards_to_create, season_name, league_id)

        await session.commit()
    except IntegrityError:
        await session.rollback()
        logger.info(
            f"Season {season_id} was finalized by another process, returning existing awards"
        )
        return await _fetch_awards(session, SeasonAward.season_id == season_id)

    # Return with full player/league info via _fetch_awards for consistent shape
    logger.info(
        f"Computed {len(awards_to_create)} award(s) for season {season_id} ({season_name})"
    )
    return await _fetch_awards(session, SeasonAward.season_id == season_id)


async def _compute_elo_deltas(
    session: AsyncSession, season: Season, player_ids: List[int]
) -> Dict[int, float]:
    """
    Compute ELO delta for each player during a season's date range.

    Delta = last chronological ELO - first chronological ELO within
    [season.start_date, season.end_date]. Requires EloHistory.date to be
    stored in YYYY-MM-DD format for string comparison to work correctly.

    Players with fewer than 2 ELO entries in the range get no delta entry.

    Args:
        session: Database session
        season: Season ORM object
        player_ids: Player IDs to compute deltas for

    Returns:
        Dict mapping player_id -> elo_delta (only positive deltas included)
    """
    if not player_ids:
        return {}

    start = season.start_date.isoformat() if season.start_date else None
    end = season.end_date.isoformat() if season.end_date else None
    if not start or not end:
        return {}

    # Query all ELO entries in the season date range, ordered chronologically
    all_entries = await session.execute(
        select(EloHistory.player_id, EloHistory.date, EloHistory.elo_after)
        .where(
            and_(
                EloHistory.player_id.in_(player_ids),
                EloHistory.date >= start,
                EloHistory.date <= end,
            )
        )
        .order_by(EloHistory.player_id, EloHistory.date, EloHistory.match_id)
    )
    rows = all_entries.all()

    # Group by player and compute delta (last - first)
    player_entries: Dict[int, List[float]] = {}
    for row in rows:
        player_entries.setdefault(row.player_id, []).append(row.elo_after)

    deltas = {}
    for pid, elos in player_entries.items():
        if len(elos) >= 2:
            deltas[pid] = elos[-1] - elos[0]

    return deltas


async def get_season_awards(session: AsyncSession, season_id: int) -> List[Dict]:
    """
    Get awards for a season, lazy-computing if the season is past and not finalized.

    Args:
        session: Database session
        season_id: Season ID

    Returns:
        List of award dicts with player and league info
    """
    season_result = await session.execute(
        select(Season).where(Season.id == season_id)
    )
    season = season_result.scalar_one_or_none()
    if not season:
        return []

    # Lazy compute: if season ended and not finalized yet
    if season_has_ended(season) and season.awards_finalized_at is None:
        return await compute_season_awards(session, season_id)

    # Fetch existing awards with player info
    return await _fetch_awards(session, SeasonAward.season_id == season_id)


async def get_player_awards(session: AsyncSession, player_id: int) -> List[Dict]:
    """
    Get all awards for a player across all seasons.

    Args:
        session: Database session
        player_id: Player ID

    Returns:
        List of award dicts sorted by season end date descending
    """
    return await _fetch_awards(session, SeasonAward.player_id == player_id)


async def get_league_awards(session: AsyncSession, league_id: int) -> List[Dict]:
    """
    Get all awards across all seasons in a league.

    Args:
        session: Database session
        league_id: League ID

    Returns:
        List of award dicts sorted by season end date descending
    """
    return await _fetch_awards(session, SeasonAward.league_id == league_id)


async def _fetch_awards(session: AsyncSession, *filters) -> List[Dict]:
    """
    Fetch awards with player and league info, sorted by season end date descending.

    Args:
        session: Database session
        *filters: SQLAlchemy filter expressions

    Returns:
        List of serialized award dicts with player/league names
    """
    query = (
        select(
            SeasonAward,
            Player.full_name.label("player_name"),
            Player.avatar.label("player_avatar"),
            Player.profile_picture_url.label("player_profile_picture_url"),
            League.name.label("league_name"),
        )
        .join(Player, SeasonAward.player_id == Player.id)
        .join(League, SeasonAward.league_id == League.id)
        .join(Season, SeasonAward.season_id == Season.id)
        .where(*filters)
        .order_by(Season.end_date.desc(), SeasonAward.award_type, SeasonAward.rank.nullslast())
    )
    result = await session.execute(query)
    rows = result.all()

    return [
        _award_to_dict(
            row.SeasonAward,
            extra={
                "player_name": row.player_name,
                "player_avatar": row.player_avatar,
                "player_profile_picture_url": row.player_profile_picture_url,
                "league_name": row.league_name,
            },
        )
        for row in rows
    ]


async def clear_season_awards(session: AsyncSession, season_id: int) -> None:
    """
    Delete all awards for a season and reset awards_finalized_at.

    Used when a season is re-opened (end_date extended to the future).

    Args:
        session: Database session
        season_id: Season ID to clear awards for
    """
    await session.execute(
        delete(SeasonAward).where(SeasonAward.season_id == season_id)
    )

    season_result = await session.execute(
        select(Season).where(Season.id == season_id)
    )
    season = season_result.scalar_one_or_none()
    if season:
        season.awards_finalized_at = None

    await session.flush()
    logger.info(f"Cleared awards for season {season_id}")


async def _notify_winners(
    session: AsyncSession,
    awards: List[SeasonAward],
    season_name: str,
    league_id: int,
) -> None:
    """
    Send notifications to each award winner.

    Uses a single batch query to resolve player_id → user_id mappings.

    Args:
        session: Database session
        awards: List of SeasonAward ORM objects
        season_name: Name of the season for display
        league_id: League ID for link URL
    """
    # Avoid circular import — notification_service imports from data_service
    # which this module also depends on
    from backend.services.notification_service import create_notifications_bulk

    if not awards:
        return

    # Batch-resolve player_id → user_id in one query
    player_ids = list({a.player_id for a in awards})
    user_result = await session.execute(
        select(Player.id, Player.user_id).where(Player.id.in_(player_ids))
    )
    pid_to_uid = {row.id: row.user_id for row in user_result.all() if row.user_id}

    notifications = []
    for award in awards:
        user_id = pid_to_uid.get(award.player_id)
        if not user_id:
            continue

        label = AWARD_LABELS.get(award.award_key, award.award_key)
        notifications.append(
            {
                "user_id": user_id,
                "type": NotificationType.SEASON_AWARD.value,
                "title": "Season Award",
                "message": f"You earned {label} in {season_name}!",
                "data": {
                    "league_id": league_id,
                    "season_id": award.season_id,
                    "award_key": award.award_key,
                },
                "link_url": f"/league/{league_id}?tab=awards",
            }
        )

    if notifications:
        try:
            await create_notifications_bulk(session, notifications)
        except Exception as e:
            logger.warning(f"Failed to send award notifications: {e}")
