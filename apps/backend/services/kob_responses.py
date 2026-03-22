"""
KOB API response serialization.

Builds response dicts from KobTournament/KobMatch/KobPlayer models
for API endpoints.
"""

from typing import Dict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    KobTournament,
    KobMatch,
    Player,
)
from backend.services.kob_queries import get_standings
from backend.services.kob_time import UNSEEDED_SORT_KEY


def _serialize_match(match: KobMatch, player_map: Dict[int, dict]) -> dict:
    """
    Serialize a KobMatch to a response dict.

    Args:
        match: KobMatch instance.
        player_map: Dict mapping player ID to {"name": ..., "avatar": ...}.

    Returns:
        Dict matching KobMatchResponse shape.
    """
    return {
        "id": match.id,
        "matchup_id": match.matchup_id,
        "round_num": match.round_num,
        "phase": match.phase,
        "pool_id": match.pool_id,
        "court_num": match.court_num,
        "team1_player1_id": match.team1_player1_id,
        "team1_player2_id": match.team1_player2_id,
        "team2_player1_id": match.team2_player1_id,
        "team2_player2_id": match.team2_player2_id,
        "team1_player1_name": player_map.get(match.team1_player1_id, {}).get("name"),
        "team1_player2_name": player_map.get(match.team1_player2_id, {}).get("name"),
        "team2_player1_name": player_map.get(match.team2_player1_id, {}).get("name"),
        "team2_player2_name": player_map.get(match.team2_player2_id, {}).get("name"),
        "team1_score": match.team1_score,
        "team2_score": match.team2_score,
        "winner": match.winner,
        "game_scores": match.game_scores,
        "bracket_position": match.bracket_position,
        "is_bye": match.is_bye,
    }


async def build_detail_response(
    session: AsyncSession,
    tournament: KobTournament,
) -> dict:
    """
    Build a full detail response dict for a tournament.

    Args:
        session: Database session.
        tournament: Loaded KobTournament.

    Returns:
        Dict matching KobTournamentDetailResponse shape.
    """
    # Build player name lookup
    player_ids = set()
    for kp in tournament.kob_players:
        player_ids.add(kp.player_id)
    for m in tournament.kob_matches:
        player_ids.update(
            [
                m.team1_player1_id,
                m.team1_player2_id,
                m.team2_player1_id,
                m.team2_player2_id,
            ]
        )

    result = await session.execute(
        select(Player.id, Player.full_name, Player.profile_picture_url).where(
            Player.id.in_(player_ids)
        )
    )
    player_map = {
        row.id: {"name": row.full_name, "avatar": row.profile_picture_url} for row in result
    }

    # Build players list
    players_resp = []
    for kp in sorted(tournament.kob_players, key=lambda p: p.seed or UNSEEDED_SORT_KEY):
        p_info = player_map.get(kp.player_id, {})
        players_resp.append(
            {
                "id": kp.id,
                "player_id": kp.player_id,
                "player_name": p_info.get("name"),
                "player_avatar": p_info.get("avatar"),
                "seed": kp.seed,
                "pool_id": kp.pool_id,
                "is_dropped": kp.is_dropped,
                "dropped_at_round": kp.dropped_at_round,
            }
        )

    # Build matches list
    matches_resp = [
        _serialize_match(m, player_map)
        for m in sorted(tournament.kob_matches, key=lambda x: (x.round_num, x.matchup_id))
    ]

    # Build standings
    standings = await get_standings(session, tournament.id)

    return {
        "id": tournament.id,
        "name": tournament.name,
        "code": tournament.code,
        "gender": tournament.gender,
        "format": tournament.format.value if tournament.format else None,
        "status": tournament.status.value if tournament.status else None,
        "game_to": tournament.game_to,
        "win_by": tournament.win_by,
        "num_courts": tournament.num_courts,
        "max_rounds": tournament.max_rounds,
        "has_playoffs": tournament.has_playoffs,
        "playoff_size": tournament.playoff_size,
        "num_pools": tournament.num_pools,
        "games_per_match": tournament.games_per_match or 1,
        "num_rr_cycles": tournament.num_rr_cycles or 1,
        "score_cap": tournament.score_cap,
        "playoff_format": tournament.playoff_format,
        "playoff_game_to": tournament.playoff_game_to,
        "playoff_games_per_match": tournament.playoff_games_per_match,
        "playoff_score_cap": tournament.playoff_score_cap,
        "is_ranked": tournament.is_ranked,
        "current_phase": tournament.current_phase,
        "current_round": tournament.current_round,
        "auto_advance": tournament.auto_advance,
        "scheduled_date": str(tournament.scheduled_date) if tournament.scheduled_date else None,
        "director_player_id": tournament.director_player_id,
        "director_name": tournament.director.full_name if tournament.director else None,
        "league_id": tournament.league_id,
        "location_id": tournament.location_id,
        "schedule_data": tournament.schedule_data,
        "players": players_resp,
        "matches": matches_resp,
        "standings": standings,
        "created_at": tournament.created_at.isoformat() if tournament.created_at else None,
        "updated_at": tournament.updated_at.isoformat() if tournament.updated_at else None,
    }


async def build_match_response(session: AsyncSession, match: KobMatch) -> dict:
    """
    Build a match response dict with player names resolved.

    Args:
        session: Database session.
        match: KobMatch instance.

    Returns:
        Dict matching KobMatchResponse shape.
    """
    pids = [
        match.team1_player1_id,
        match.team1_player2_id,
        match.team2_player1_id,
        match.team2_player2_id,
    ]
    result = await session.execute(
        select(Player.id, Player.full_name, Player.profile_picture_url).where(Player.id.in_(pids))
    )
    player_map = {
        row.id: {"name": row.full_name, "avatar": row.profile_picture_url} for row in result
    }
    return _serialize_match(match, player_map)


def build_summary_response(tournament: KobTournament, player_count: int = 0) -> dict:
    """
    Build a summary response dict for a tournament listing.

    Args:
        tournament: KobTournament instance.
        player_count: Number of players in roster.

    Returns:
        Dict matching KobTournamentResponse shape.
    """
    return {
        "id": tournament.id,
        "name": tournament.name,
        "code": tournament.code,
        "gender": tournament.gender,
        "format": tournament.format.value if tournament.format else None,
        "status": tournament.status.value if tournament.status else None,
        "num_courts": tournament.num_courts,
        "game_to": tournament.game_to,
        "scheduled_date": str(tournament.scheduled_date) if tournament.scheduled_date else None,
        "player_count": player_count,
        "current_round": tournament.current_round,
        "created_at": tournament.created_at.isoformat() if tournament.created_at else None,
    }
