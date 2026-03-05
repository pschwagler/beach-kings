"""
KOB round advancement, bracket management, and playoff logic.

Handles checking round completion, advancing to next rounds,
transitioning to playoffs, creating draft brackets, and
completing tournaments.
"""

import logging
from typing import List

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    KobTournament,
    KobMatch,
    TournamentStatus,
)
from backend.services.kob_algorithms import generate_playoff_schedule
from backend.services.kob_queries import get_tournament, get_standings
from backend.services.kob_time import UNSEEDED_SORT_KEY

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Round completion check
# ---------------------------------------------------------------------------

async def check_round_complete(
    session: AsyncSession,
    tournament_id: int,
    round_num: int,
) -> bool:
    """
    Check if all non-bye matches in a round have been scored.

    Args:
        session: Database session.
        tournament_id: Tournament ID.
        round_num: Round number to check.

    Returns:
        True if all matches are scored.
    """
    result = await session.execute(
        select(func.count(KobMatch.id)).where(
            and_(
                KobMatch.tournament_id == tournament_id,
                KobMatch.round_num == round_num,
                KobMatch.is_bye.is_(False),
                KobMatch.team1_score.is_(None),
            )
        )
    )
    unscored = result.scalar()
    return unscored == 0


# ---------------------------------------------------------------------------
# Round advancement
# ---------------------------------------------------------------------------

async def advance_round(
    session: AsyncSession,
    tournament_id: int,
) -> KobTournament:
    """
    Advance to the next round (or to playoffs, or complete).

    Args:
        session: Database session.
        tournament_id: Tournament ID.

    Returns:
        Updated KobTournament.
    """
    tournament = await get_tournament(session, tournament_id)
    if not tournament:
        raise ValueError("Tournament not found")
    if tournament.status != TournamentStatus.ACTIVE:
        raise ValueError("Tournament is not active")

    schedule = tournament.schedule_data
    if not schedule:
        raise ValueError("No schedule data")

    current_round = tournament.current_round or 1
    total_rounds = schedule["total_rounds"]

    # Check if we need to transition to playoffs
    if (
        tournament.has_playoffs
        and tournament.current_phase == "pool_play"
        and current_round >= total_rounds
    ):
        await _advance_to_playoffs(session, tournament)
        return tournament

    # Draft bracket: after semi round, create final match with winners
    if (
        tournament.current_phase == "playoffs"
        and tournament.effective_playoff_format == "DRAFT"
    ):
        advanced = await _try_advance_draft_bracket(session, tournament)
        if advanced:
            return tournament

    # Check if tournament is complete
    if current_round >= total_rounds:
        tournament.status = TournamentStatus.COMPLETED
        await session.flush()
        await session.refresh(tournament)
        return tournament

    # Advance to next round
    tournament.current_round = current_round + 1
    await session.flush()
    await session.refresh(tournament)
    return tournament


# ---------------------------------------------------------------------------
# Playoff transitions
# ---------------------------------------------------------------------------

async def _advance_to_playoffs(
    session: AsyncSession,
    tournament: KobTournament,
) -> None:
    """
    Compute pool standings, generate playoff schedule, create matches.

    Branches on playoff_format:
    - ROUND_ROBIN (default): existing full RR playoff behavior.
    - DRAFT: auto-populate teams by seed, single-elimination bracket.

    Args:
        session: Database session.
        tournament: Active tournament.
    """
    schedule = tournament.schedule_data
    pools = schedule.get("pools", {})
    advance_per_pool = schedule.get("advance_per_pool", 2)

    # Get advancing players from pool standings
    advancing = []
    if pools:
        for pool_id_str, pool_pids in pools.items():
            pool_standings = await get_standings(
                session, tournament.id, pool_id=int(pool_id_str)
            )
            for entry in pool_standings[:advance_per_pool]:
                advancing.append(entry["player_id"])
    else:
        # No pools — use overall standings
        standings = await get_standings(session, tournament.id, phase="pool_play")
        playoff_size = tournament.playoff_size or 4
        advancing = [s["player_id"] for s in standings[:playoff_size]]

    if len(advancing) < 4:
        tournament.status = TournamentStatus.COMPLETED
        await session.flush()
        return

    playoff_format = tournament.effective_playoff_format

    if playoff_format == "DRAFT":
        await _create_draft_bracket(session, tournament, advancing)
    else:
        await _create_rr_playoffs(session, tournament, advancing)


async def _create_rr_playoffs(
    session: AsyncSession,
    tournament: KobTournament,
    advancing: List[int],
) -> None:
    """Create round-robin playoff rounds (existing behavior)."""
    schedule = tournament.schedule_data

    playoff_rounds = generate_playoff_schedule(
        advancing,
        tournament.num_courts,
        round_offset=tournament.current_round,
    )

    schedule["rounds"].extend(playoff_rounds)
    schedule["total_rounds"] = tournament.current_round + len(playoff_rounds)
    tournament.schedule_data = schedule

    tournament.current_phase = "playoffs"
    tournament.current_round = tournament.current_round + 1

    for rnd in playoff_rounds:
        for m in rnd["matches"]:
            match = KobMatch(
                tournament_id=tournament.id,
                matchup_id=m["matchup_id"],
                round_num=rnd["round_num"],
                phase="playoffs",
                court_num=m.get("court_num"),
                team1_player1_id=m["team1"][0],
                team1_player2_id=m["team1"][1],
                team2_player1_id=m["team2"][0],
                team2_player2_id=m["team2"][1],
                is_bye=m.get("is_bye", False),
            )
            session.add(match)

    await session.flush()


async def _create_draft_bracket(
    session: AsyncSession,
    tournament: KobTournament,
    advancing: List[int],
) -> None:
    """
    Create draft-format single-elimination bracket matches.

    Auto-populates teams by seed. Director can swap before match starts.
    Top 4: seed1+seed4 vs seed2+seed3 (final).
    Top 6: Semi: seed3+seed6 vs seed4+seed5, then seed1+lowestSemiWinner
           vs seed2+otherSemiWinner in final (final created after semis scored).

    Args:
        session: Database session.
        tournament: Active tournament.
        advancing: Seed-ordered player IDs advancing to playoffs.
    """
    schedule = tournament.schedule_data
    round_offset = tournament.current_round
    playoff_size = len(advancing)

    if playoff_size == 4:
        # Single final: seed1+seed4 vs seed2+seed3
        rnd = {
            "round_num": round_offset + 1,
            "phase": "playoffs",
            "pool_id": None,
            "bracket_position": "final",
            "label": "Final",
            "matches": [{
                "matchup_id": "pf_bracket_final",
                "court_num": 1,
                "team1": [advancing[0], advancing[3]],
                "team2": [advancing[1], advancing[2]],
                "is_bye": False,
            }],
        }
        schedule["rounds"].append(rnd)
        schedule["total_rounds"] = round_offset + 1
        tournament.schedule_data = schedule

        match = KobMatch(
            tournament_id=tournament.id,
            matchup_id="pf_bracket_final",
            round_num=round_offset + 1,
            phase="playoffs",
            court_num=1,
            team1_player1_id=advancing[0],
            team1_player2_id=advancing[3],
            team2_player1_id=advancing[1],
            team2_player2_id=advancing[2],
            bracket_position="final",
        )
        session.add(match)

    elif playoff_size >= 6:
        # Semifinal round: seed3+seed6 vs seed4+seed5
        semi_rnd = {
            "round_num": round_offset + 1,
            "phase": "playoffs",
            "pool_id": None,
            "bracket_position": "semifinal",
            "label": "Semifinal",
            "matches": [
                {
                    "matchup_id": "pf_bracket_sf1",
                    "court_num": 1,
                    "team1": [advancing[2], advancing[5]],
                    "team2": [advancing[3], advancing[4]],
                    "is_bye": False,
                },
            ],
        }
        # If 8+ players, add sf2
        if playoff_size >= 8:
            semi_rnd["matches"].append({
                "matchup_id": "pf_bracket_sf2",
                "court_num": min(2, tournament.num_courts),
                "team1": [advancing[4], advancing[7]] if playoff_size >= 8 else [0, 0],
                "team2": [advancing[5], advancing[6]] if playoff_size >= 8 else [0, 0],
                "is_bye": False,
            })

        schedule["rounds"].append(semi_rnd)
        # Final will be added after semis complete — reserve the slot
        schedule["total_rounds"] = round_offset + 2
        tournament.schedule_data = schedule

        # Create semi match rows
        for m in semi_rnd["matches"]:
            match = KobMatch(
                tournament_id=tournament.id,
                matchup_id=m["matchup_id"],
                round_num=round_offset + 1,
                phase="playoffs",
                court_num=m["court_num"],
                team1_player1_id=m["team1"][0],
                team1_player2_id=m["team1"][1],
                team2_player1_id=m["team2"][0],
                team2_player2_id=m["team2"][1],
                bracket_position="semifinal",
            )
            session.add(match)

    tournament.current_phase = "playoffs"
    tournament.current_round = round_offset + 1
    await session.flush()


async def _try_advance_draft_bracket(
    session: AsyncSession,
    tournament: KobTournament,
) -> bool:
    """
    Check if current draft bracket round is complete. If semis are done,
    create the final match with seed1/seed2 paired with semi winners.

    Returns True if bracket was advanced, False otherwise.
    """
    current_round = tournament.current_round or 1

    # Get current round matches
    result = await session.execute(
        select(KobMatch).where(
            and_(
                KobMatch.tournament_id == tournament.id,
                KobMatch.round_num == current_round,
                KobMatch.phase == "playoffs",
            )
        )
    )
    current_matches = result.scalars().all()

    # Check if all are scored
    if any(m.winner is None and not m.is_bye for m in current_matches):
        return False

    # Check if this is a semifinal round
    semi_matches = [m for m in current_matches if m.bracket_position == "semifinal"]
    if not semi_matches:
        return False

    # Check if final already exists
    result = await session.execute(
        select(KobMatch).where(
            and_(
                KobMatch.tournament_id == tournament.id,
                KobMatch.bracket_position == "final",
            )
        )
    )
    existing_final = result.scalar_one_or_none()
    if existing_final:
        # Final already created — just advance round
        if current_round < (tournament.schedule_data or {}).get("total_rounds", 0):
            tournament.current_round = current_round + 1
            await session.flush()
            await session.refresh(tournament)
        return True

    # Collect semi winners + semi losers
    semi_winners = []
    for m in semi_matches:
        if m.winner == 1:
            semi_winners.extend([m.team1_player1_id, m.team1_player2_id])
        else:
            semi_winners.extend([m.team2_player1_id, m.team2_player2_id])

    # Get seed-ordered advancing players
    players = sorted(tournament.kob_players, key=lambda p: p.seed or UNSEEDED_SORT_KEY)
    advancing_pids = [p.player_id for p in players if not p.is_dropped]
    playoff_size = tournament.playoff_size or len(advancing_pids)
    top_pids = advancing_pids[:playoff_size]

    # Seed 1 + lowest-ranked semi winner, Seed 2 + other semi winner
    seed1 = top_pids[0] if len(top_pids) > 0 else 0
    seed2 = top_pids[1] if len(top_pids) > 1 else 0

    # From semi_winners, exclude seed1/seed2 (they didn't play semis for Top 6)
    available_winners = [pid for pid in semi_winners if pid not in (seed1, seed2)]
    # Sort by seed (higher seed number = lower rank)
    seed_map = {p.player_id: p.seed or UNSEEDED_SORT_KEY for p in players}
    available_winners.sort(key=lambda pid: seed_map.get(pid, UNSEEDED_SORT_KEY), reverse=True)

    # Seed1 picks lowest-ranked winner, Seed2 gets the other
    partner1 = available_winners[0] if available_winners else 0
    partner2 = available_winners[1] if len(available_winners) > 1 else 0

    final_round_num = current_round + 1
    schedule = tournament.schedule_data
    final_rnd = {
        "round_num": final_round_num,
        "phase": "playoffs",
        "pool_id": None,
        "bracket_position": "final",
        "label": "Final",
        "matches": [{
            "matchup_id": "pf_bracket_final",
            "court_num": 1,
            "team1": [seed1, partner1],
            "team2": [seed2, partner2],
            "is_bye": False,
        }],
    }
    schedule["rounds"].append(final_rnd)
    schedule["total_rounds"] = final_round_num
    tournament.schedule_data = schedule

    final_match = KobMatch(
        tournament_id=tournament.id,
        matchup_id="pf_bracket_final",
        round_num=final_round_num,
        phase="playoffs",
        court_num=1,
        team1_player1_id=seed1,
        team1_player2_id=partner1,
        team2_player1_id=seed2,
        team2_player2_id=partner2,
        bracket_position="final",
    )
    session.add(final_match)

    tournament.current_round = final_round_num
    await session.flush()
    await session.refresh(tournament)
    return True


# ---------------------------------------------------------------------------
# Bracket editing
# ---------------------------------------------------------------------------

async def update_bracket_match(
    session: AsyncSession,
    tournament_id: int,
    match_id: int,
    team1: List[int],
    team2: List[int],
) -> KobMatch:
    """
    Director: swap player assignments in a bracket match that hasn't started.

    Args:
        session: Database session.
        tournament_id: Tournament ID.
        match_id: KobMatch.id to update.
        team1: [player_id, player_id] for team 1.
        team2: [player_id, player_id] for team 2.

    Returns:
        Updated KobMatch.

    Raises:
        ValueError: If match not found, already scored, or invalid players.
    """
    result = await session.execute(
        select(KobMatch).where(
            and_(
                KobMatch.id == match_id,
                KobMatch.tournament_id == tournament_id,
            )
        )
    )
    match = result.scalar_one_or_none()
    if not match:
        raise ValueError("Match not found")
    if match.winner is not None:
        raise ValueError("Cannot edit a match that has already been scored")
    if not match.bracket_position:
        raise ValueError("Can only edit bracket matches")

    if len(team1) != 2 or len(team2) != 2:
        raise ValueError("Each team must have exactly 2 players")

    match.team1_player1_id = team1[0]
    match.team1_player2_id = team1[1]
    match.team2_player1_id = team2[0]
    match.team2_player2_id = team2[1]

    await session.flush()
    await session.refresh(match)
    return match


# ---------------------------------------------------------------------------
# Tournament completion
# ---------------------------------------------------------------------------

async def complete_tournament(
    session: AsyncSession,
    tournament_id: int,
    director_player_id: int,
) -> KobTournament:
    """
    Manually complete a tournament.

    Args:
        session: Database session.
        tournament_id: Tournament ID.
        director_player_id: Must match director.

    Returns:
        Updated KobTournament with COMPLETED status.
    """
    tournament = await get_tournament(session, tournament_id)
    if not tournament:
        raise ValueError("Tournament not found")
    if tournament.director_player_id != director_player_id:
        raise ValueError("Only the director can complete the tournament")
    if tournament.status != TournamentStatus.ACTIVE:
        raise ValueError("Tournament is not active")

    tournament.status = TournamentStatus.COMPLETED
    await session.flush()
    await session.refresh(tournament)
    return tournament
