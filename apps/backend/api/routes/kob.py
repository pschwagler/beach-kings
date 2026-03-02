"""KOB (King/Queen of the Beach) tournament route handlers."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.db import get_db_session
from backend.api.auth_dependencies import require_verified_player
from backend.services import kob_service, kob_scheduler
from backend.models.schemas import (
    KobTournamentCreate,
    KobTournamentUpdate,
    KobPlayerAdd,
    KobScoreSubmit,
    KobSeedReorder,
    KobDropPlayer,
    KobBracketUpdate,
    KobTournamentResponse,
    KobTournamentDetailResponse,
    KobMatchResponse,
    KobFormatRecommendation,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Director routes (auth required)
# ---------------------------------------------------------------------------


@router.post("/api/kob/tournaments", response_model=KobTournamentDetailResponse)
async def create_tournament(
    payload: KobTournamentCreate,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Create a new KOB tournament."""
    try:
        tournament = await kob_service.create_tournament(
            session, user["player_id"], payload.model_dump()
        )
        # Re-fetch with eager loading for the response
        tournament = await kob_service.get_tournament(session, tournament.id)
        return await kob_service.build_detail_response(session, tournament)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating KOB tournament: {e}")
        raise HTTPException(status_code=500, detail="Error creating tournament")


@router.get("/api/kob/tournaments/mine", response_model=list[KobTournamentResponse])
async def get_my_tournaments(
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Get tournaments directed by or participated in by the current user."""
    try:
        tournaments = await kob_service.get_my_tournaments(
            session, user["player_id"]
        )
        return [
            kob_service.build_summary_response(t, len(t.kob_players) if hasattr(t, "kob_players") else 0)
            for t in tournaments
        ]
    except Exception as e:
        logger.error(f"Error fetching my tournaments: {e}")
        raise HTTPException(status_code=500, detail="Error fetching tournaments")


@router.get("/api/kob/tournaments/{tournament_id}", response_model=KobTournamentDetailResponse)
async def get_tournament_by_id(
    tournament_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Get tournament detail by ID (director view)."""
    tournament = await kob_service.get_tournament(session, tournament_id)
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if tournament.director_player_id != user["player_id"]:
        raise HTTPException(status_code=403, detail="Not the tournament director")
    return await kob_service.build_detail_response(session, tournament)


@router.patch("/api/kob/tournaments/{tournament_id}", response_model=KobTournamentDetailResponse)
async def update_tournament(
    tournament_id: int,
    payload: KobTournamentUpdate,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Update tournament config (pre-start only)."""
    try:
        tournament = await kob_service.update_tournament(
            session,
            tournament_id,
            user["player_id"],
            payload.model_dump(exclude_none=True),
        )
        return await kob_service.build_detail_response(session, tournament)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating KOB tournament: {e}")
        raise HTTPException(status_code=500, detail="Error updating tournament")


@router.delete("/api/kob/tournaments/{tournament_id}", status_code=204)
async def delete_tournament(
    tournament_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Delete a tournament."""
    try:
        await kob_service.delete_tournament(session, tournament_id, user["player_id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting KOB tournament: {e}")
        raise HTTPException(status_code=500, detail="Error deleting tournament")


@router.post("/api/kob/tournaments/{tournament_id}/players", response_model=KobTournamentDetailResponse)
async def add_player(
    tournament_id: int,
    payload: KobPlayerAdd,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Add a player to the tournament roster."""
    try:
        tournament = await kob_service.get_tournament(session, tournament_id)
        if not tournament:
            raise HTTPException(status_code=404, detail="Tournament not found")
        if tournament.director_player_id != user["player_id"]:
            raise HTTPException(status_code=403, detail="Not the tournament director")

        await kob_service.add_player(
            session, tournament_id, payload.player_id, payload.seed
        )
        tournament = await kob_service.get_tournament(session, tournament_id)
        return await kob_service.build_detail_response(session, tournament)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error adding player to KOB tournament: {e}")
        raise HTTPException(status_code=500, detail="Error adding player")


@router.delete(
    "/api/kob/tournaments/{tournament_id}/players/{player_id}",
    response_model=KobTournamentDetailResponse,
)
async def remove_player(
    tournament_id: int,
    player_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Remove a player from the tournament roster (SETUP only)."""
    try:
        tournament = await kob_service.get_tournament(session, tournament_id)
        if not tournament:
            raise HTTPException(status_code=404, detail="Tournament not found")
        if tournament.director_player_id != user["player_id"]:
            raise HTTPException(status_code=403, detail="Not the tournament director")

        await kob_service.remove_player(session, tournament_id, player_id)
        tournament = await kob_service.get_tournament(session, tournament_id)
        return await kob_service.build_detail_response(session, tournament)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error removing player from KOB tournament: {e}")
        raise HTTPException(status_code=500, detail="Error removing player")


@router.put("/api/kob/tournaments/{tournament_id}/seeds", response_model=KobTournamentDetailResponse)
async def reorder_seeds(
    tournament_id: int,
    payload: KobSeedReorder,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Reorder player seeds."""
    try:
        tournament = await kob_service.get_tournament(session, tournament_id)
        if not tournament:
            raise HTTPException(status_code=404, detail="Tournament not found")
        if tournament.director_player_id != user["player_id"]:
            raise HTTPException(status_code=403, detail="Not the tournament director")

        await kob_service.reorder_seeds(session, tournament_id, payload.player_ids)
        tournament = await kob_service.get_tournament(session, tournament_id)
        return await kob_service.build_detail_response(session, tournament)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error reordering seeds: {e}")
        raise HTTPException(status_code=500, detail="Error reordering seeds")


@router.post("/api/kob/tournaments/{tournament_id}/start", response_model=KobTournamentDetailResponse)
async def start_tournament(
    tournament_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Start the tournament — lock roster, generate schedule, create matches."""
    try:
        tournament = await kob_service.start_tournament(
            session, tournament_id, user["player_id"]
        )
        return await kob_service.build_detail_response(session, tournament)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error starting KOB tournament: {e}")
        raise HTTPException(status_code=500, detail="Error starting tournament")


@router.post("/api/kob/tournaments/{tournament_id}/advance", response_model=KobTournamentDetailResponse)
async def manual_advance(
    tournament_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Manually advance to the next round (director only)."""
    try:
        tournament = await kob_service.get_tournament(session, tournament_id)
        if not tournament:
            raise HTTPException(status_code=404, detail="Tournament not found")
        if tournament.director_player_id != user["player_id"]:
            raise HTTPException(status_code=403, detail="Not the tournament director")

        tournament = await kob_service.advance_round(session, tournament_id)
        return await kob_service.build_detail_response(session, tournament)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error advancing round: {e}")
        raise HTTPException(status_code=500, detail="Error advancing round")


@router.post("/api/kob/tournaments/{tournament_id}/drop-player", response_model=KobTournamentDetailResponse)
async def drop_player(
    tournament_id: int,
    payload: KobDropPlayer,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Drop a player from an active tournament (director only)."""
    try:
        tournament = await kob_service.get_tournament(session, tournament_id)
        if not tournament:
            raise HTTPException(status_code=404, detail="Tournament not found")
        if tournament.director_player_id != user["player_id"]:
            raise HTTPException(status_code=403, detail="Not the tournament director")

        await kob_service.drop_player(session, tournament_id, payload.player_id)
        tournament = await kob_service.get_tournament(session, tournament_id)
        return await kob_service.build_detail_response(session, tournament)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error dropping player: {e}")
        raise HTTPException(status_code=500, detail="Error dropping player")


@router.patch(
    "/api/kob/tournaments/{tournament_id}/matches/{matchup_id}",
    response_model=KobMatchResponse,
)
async def edit_score(
    tournament_id: int,
    matchup_id: str,
    payload: KobScoreSubmit,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Edit a match score (director override)."""
    try:
        tournament = await kob_service.get_tournament(session, tournament_id)
        if not tournament:
            raise HTTPException(status_code=404, detail="Tournament not found")
        if tournament.director_player_id != user["player_id"]:
            raise HTTPException(status_code=403, detail="Not the tournament director")

        match = await kob_service.update_score(
            session, tournament_id, matchup_id,
            payload.team1_score, payload.team2_score,
            game_index=payload.game_index,
        )
        return await kob_service.build_match_response(session, match)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error editing score: {e}")
        raise HTTPException(status_code=500, detail="Error editing score")


@router.post("/api/kob/tournaments/{tournament_id}/complete", response_model=KobTournamentDetailResponse)
async def complete_tournament(
    tournament_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Manually complete a tournament."""
    try:
        tournament = await kob_service.complete_tournament(
            session, tournament_id, user["player_id"]
        )
        return await kob_service.build_detail_response(session, tournament)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error completing tournament: {e}")
        raise HTTPException(status_code=500, detail="Error completing tournament")


@router.patch(
    "/api/kob/tournaments/{tournament_id}/bracket",
    response_model=KobMatchResponse,
)
async def update_bracket(
    tournament_id: int,
    payload: KobBracketUpdate,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Swap player assignments in a bracket match (director only, before scoring)."""
    try:
        tournament = await kob_service.get_tournament(session, tournament_id)
        if not tournament:
            raise HTTPException(status_code=404, detail="Tournament not found")
        if tournament.director_player_id != user["player_id"]:
            raise HTTPException(status_code=403, detail="Not the tournament director")

        match = await kob_service.update_bracket_match(
            session, tournament_id, payload.match_id,
            payload.team1, payload.team2,
        )
        return await kob_service.build_match_response(session, match)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating bracket: {e}")
        raise HTTPException(status_code=500, detail="Error updating bracket")


@router.get("/api/kob/recommend", response_model=KobFormatRecommendation)
async def get_format_recommendation(
    num_players: int = Query(..., ge=4, le=40),
    num_courts: int = Query(..., ge=1, le=20),
    format: str = Query(None),
    num_pools: int = Query(None),
    playoff_size: int = Query(None),
    max_rounds: int = Query(None),
    games_per_match: int = Query(1, ge=1, le=3),
    num_rr_cycles: int = Query(1, ge=1, le=3),
    game_to: int = Query(21),
    duration_minutes: int = Query(None, ge=30, le=480),
    playoff_format: str = Query(None),
    playoff_game_to: int = Query(None),
    playoff_games_per_match: int = Query(None),
):
    """
    Get a format recommendation with full schedule preview.

    No auth required — pure computation, no DB access.
    If format is None, uses suggest_defaults() to auto-pick a format.
    """
    if format is None:
        defaults = kob_scheduler.suggest_defaults(
            num_players, num_courts, duration_minutes
        )
        format = defaults["format"]
        if num_pools is None:
            num_pools = defaults["num_pools"]
        if playoff_size is None:
            playoff_size = defaults["playoff_size"]
        if max_rounds is None:
            max_rounds = defaults["max_rounds"]
        # Use suggested game_to when auto-picking format
        if defaults.get("game_to"):
            game_to = defaults["game_to"]

    return kob_scheduler.generate_preview(
        num_players=num_players,
        num_courts=num_courts,
        format=format,
        num_pools=num_pools,
        playoff_size=playoff_size,
        max_rounds=max_rounds,
        games_per_match=games_per_match,
        num_rr_cycles=num_rr_cycles,
        game_to=game_to,
        duration_minutes=duration_minutes,
        playoff_format=playoff_format,
        playoff_game_to=playoff_game_to,
        playoff_games_per_match=playoff_games_per_match,
    )


# ---------------------------------------------------------------------------
# Public routes (no auth — by code)
# ---------------------------------------------------------------------------


@router.get("/api/kob/{code}", response_model=KobTournamentDetailResponse)
async def get_tournament_by_code(
    code: str,
    session: AsyncSession = Depends(get_db_session),
):
    """Get full tournament state by shareable code (public — no auth)."""
    tournament = await kob_service.get_tournament_by_code(session, code)
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return await kob_service.build_detail_response(session, tournament)


@router.post("/api/kob/{code}/score", response_model=KobMatchResponse)
async def submit_score_public(
    code: str,
    matchup_id: str = Query(...),
    payload: KobScoreSubmit = ...,
    session: AsyncSession = Depends(get_db_session),
):
    """Submit a score for a match (public — anyone with the link)."""
    try:
        tournament = await kob_service.get_tournament_by_code(session, code)
        if not tournament:
            raise HTTPException(status_code=404, detail="Tournament not found")

        match = await kob_service.submit_score(
            session, tournament.id, matchup_id,
            payload.team1_score, payload.team2_score,
            game_index=payload.game_index,
        )
        return await kob_service.build_match_response(session, match)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error submitting score: {e}")
        raise HTTPException(status_code=500, detail="Error submitting score")
