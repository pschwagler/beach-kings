"""Season and stats route handlers."""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.auth_dependencies import (
    _has_league_role,
    _is_system_admin,
    get_current_user,
    get_current_user_optional,
    make_require_league_admin,
    make_require_league_admin_from_season,
    make_require_league_member,
    make_require_league_member_from_season,
    make_require_league_member_or_public,
    require_league_member_for_scope,
    require_user,
    require_verified_player,
)
from backend.database.db import get_db_session
from backend.database.models import Season as SeasonModel
from backend.models.schemas import (
    PartnershipOpponentStatsResponse,
    SeasonResponse,
)
from backend.services import (
    data_service,
    friend_service,
    notification_service,
    season_awards_service,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/api/leagues/{league_id}/seasons", response_model=SeasonResponse)
async def create_season(
    league_id: int,
    request: Request,
    user: dict = Depends(make_require_league_admin()),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Create a season in a league (league_admin or system_admin).
    Body: {
        name?: str,
        start_date: ISO,
        end_date: ISO,
        point_system?: str (legacy),
        scoring_system?: str ("points_system" or "season_rating"),
        points_per_win?: int (default 3, for Points System),
        points_per_loss?: int (default 1, for Points System, can be 0 or negative)
    }
    Seasons are active based on date ranges (current_date >= start_date AND current_date <= end_date).
    """
    try:
        body = await request.json()
        season = await data_service.create_season(
            session=session,
            league_id=league_id,
            name=body.get("name"),
            start_date=body["start_date"],
            end_date=body["end_date"],
            point_system=body.get("point_system"),  # Legacy support
            scoring_system=body.get("scoring_system"),
            points_per_win=body.get("points_per_win"),
            points_per_loss=body.get("points_per_loss"),
        )

        # Fire-and-forget notification (non-blocking)
        asyncio.create_task(
            notification_service.notify_members_about_season_activated(
                session=session,
                league_id=league_id,
                season_id=season["id"],
                season_name=season.get("name") or "New Season",
                start_date=season.get("start_date"),
                end_date=season.get("end_date"),
            )
        )

        return season
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Missing required field: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating season: {str(e)}")


@router.get("/api/leagues/{league_id}/seasons", response_model=list[SeasonResponse])
async def list_seasons(
    league_id: int,
    user: dict = Depends(make_require_league_member_or_public()),
    session: AsyncSession = Depends(get_db_session),
):
    """List safe season metadata for a public league or one the caller belongs to."""
    try:
        return await data_service.list_seasons(session, league_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing seasons: {str(e)}")


@router.get("/api/seasons/{season_id}", response_model=SeasonResponse)
async def get_season(
    season_id: int,
    user: dict = Depends(make_require_league_member_from_season()),
    session: AsyncSession = Depends(get_db_session),
):
    """Get a season (league member)."""
    try:
        season = await data_service.get_season(session, season_id)
        if not season:
            raise HTTPException(status_code=404, detail="Season not found")
        return season
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting season: {str(e)}")


@router.put("/api/seasons/{season_id}", response_model=SeasonResponse)
async def update_season(
    season_id: int,
    request: Request,
    user: dict = Depends(
        get_current_user
    ),  # League admin check inside service based on season->league
    session: AsyncSession = Depends(get_db_session),
):
    """
    Update a season (league_admin or system_admin).
    Body may include:
        name, start_date, end_date, point_system (legacy),
        scoring_system ("points_system" or "season_rating"),
        points_per_win, points_per_loss (for Points System)
    When changing scoring system, stats will be recalculated.
    """
    try:
        existing = await data_service.get_season(session, season_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Season not found")

        if not await _is_system_admin(session, user) and not await _has_league_role(
            session,
            user_id=user["id"],
            league_id=existing["league_id"],
            required_role="admin",
        ):
            raise HTTPException(status_code=403, detail="League admin access required")

        body = await request.json()
        season = await data_service.update_season(session, season_id=season_id, **body)
        if not season:
            raise HTTPException(status_code=404, detail="Season not found")
        return season
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating season: {str(e)}")


# ---------------------------------------------------------------------------
# Stats endpoints
# ---------------------------------------------------------------------------


@router.post("/api/matches/elo", response_model=list[dict])
async def get_matches(
    request: Request,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Get member-only matches for exactly one season or league."""
    try:
        body = await request.json()
        season_id = body.get("season_id")
        league_id = body.get("league_id")

        await require_league_member_for_scope(
            session, user, season_id=season_id, league_id=league_id
        )

        if season_id is not None:
            matches = await data_service.get_season_matches_with_elo(session, season_id)
            return matches
        elif league_id is not None:
            matches = await data_service.get_league_matches_with_elo(session, league_id)
            return matches
        raise AssertionError("scope authorization accepted an empty scope")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading matches: {str(e)}")


@router.get("/api/seasons/{season_id}/matches", response_model=list[dict])
async def get_season_matches(
    season_id: int,
    user: dict = Depends(make_require_league_member_from_season()),
    session: AsyncSession = Depends(get_db_session),
):
    """Get member-only season matches. Deprecated: use POST /api/matches/elo."""
    try:
        matches = await data_service.get_season_matches_with_elo(session, season_id)
        return matches
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading season matches: {str(e)}")


@router.post("/api/player-stats")
async def get_all_player_stats(
    request: Request,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Get member-only player stats for exactly one season or league."""
    try:
        body = await request.json()
        season_id = body.get("season_id")
        league_id = body.get("league_id")

        await require_league_member_for_scope(
            session, user, season_id=season_id, league_id=league_id
        )

        if season_id is not None:
            player_stats = await data_service.get_all_player_season_stats(session, season_id)
            return player_stats
        elif league_id is not None:
            player_stats = await data_service.get_all_player_league_stats(session, league_id)
            return player_stats
        raise AssertionError("scope authorization accepted an empty scope")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading player stats: {str(e)}")


@router.get("/api/seasons/{season_id}/player-stats")
async def get_season_player_stats(
    season_id: int,
    user: dict = Depends(make_require_league_member_from_season()),
    session: AsyncSession = Depends(get_db_session),
):
    """Get member-only season stats. Deprecated: use POST /api/player-stats."""
    try:
        player_stats = await data_service.get_all_player_season_stats(session, season_id)
        return player_stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading player season stats: {str(e)}")


@router.post("/api/partnership-opponent-stats")
async def get_partnership_opponent_stats(
    request: Request,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Get member-only relationship stats for exactly one season or league."""
    try:
        body = await request.json()
        season_id = body.get("season_id")
        league_id = body.get("league_id")

        await require_league_member_for_scope(
            session, user, season_id=season_id, league_id=league_id
        )

        if season_id is not None:
            stats = await data_service.get_all_player_season_partnership_opponent_stats(
                session, season_id
            )
            return stats
        elif league_id is not None:
            stats = await data_service.get_all_player_league_partnership_opponent_stats(
                session, league_id
            )
            return stats
        raise AssertionError("scope authorization accepted an empty scope")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error loading partnership/opponent stats: {str(e)}",
        )


@router.get("/api/seasons/{season_id}/partnership-opponent-stats")
async def get_season_partnership_opponent_stats(
    season_id: int,
    user: dict = Depends(make_require_league_member_from_season()),
    session: AsyncSession = Depends(get_db_session),
):
    """Get member-only season relationship stats. Deprecated: use the scoped POST route."""
    try:
        stats = await data_service.get_all_player_season_partnership_opponent_stats(
            session, season_id
        )
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error loading partnership/opponent stats: {str(e)}",
        )


@router.get(
    "/api/players/{player_id}/season/{season_id}/partnership-opponent-stats",
    response_model=PartnershipOpponentStatsResponse,
)
async def get_player_season_partnership_opponent_stats(
    player_id: int,
    season_id: int,
    user: dict = Depends(make_require_league_member_from_season()),
    session: AsyncSession = Depends(get_db_session),
):
    """Get a player's season relationship stats as a league member."""
    try:
        if await data_service.get_player_by_id(session, player_id) is None:
            raise HTTPException(status_code=404, detail="Player not found")
        stats = await data_service.get_player_season_partnership_opponent_stats(
            session, player_id, season_id
        )
        return stats
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error loading partnership/opponent stats: {str(e)}",
        )


@router.get("/api/leagues/{league_id}/player-stats")
async def get_league_player_stats(
    league_id: int,
    user: dict = Depends(make_require_league_member()),
    session: AsyncSession = Depends(get_db_session),
):
    """Get all player league stats as a league member."""
    try:
        player_stats = await data_service.get_all_player_league_stats(session, league_id)
        return player_stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading player league stats: {str(e)}")


@router.get("/api/leagues/{league_id}/partnership-opponent-stats")
async def get_league_partnership_opponent_stats(
    league_id: int,
    user: dict = Depends(make_require_league_member()),
    session: AsyncSession = Depends(get_db_session),
):
    """Get all league relationship stats as a league member."""
    try:
        stats = await data_service.get_all_player_league_partnership_opponent_stats(
            session, league_id
        )
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error loading partnership/opponent stats: {str(e)}",
        )


@router.get("/api/players/{player_id}/league/{league_id}/stats", response_model=dict)
async def get_player_league_stats(
    player_id: int,
    league_id: int,
    user: dict = Depends(make_require_league_member()),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Legacy slim endpoint kept for the web app. Returns only counts/rates from
    ``PlayerLeagueStats``. New clients should call
    ``GET /api/leagues/{league_id}/players/{player_id}/stats`` which returns the
    full aggregated shape (player profile, partners, opponents, etc.).
    """
    try:
        league_stats = await data_service.get_player_league_stats(session, player_id, league_id)

        if league_stats is None:
            raise HTTPException(status_code=404, detail="Player or league not found.")

        return league_stats
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading player league stats: {str(e)}")


@router.get("/api/leagues/{league_id}/players/{player_id}/stats", response_model=dict)
async def get_league_player_stats_full(
    league_id: int,
    player_id: int,
    season_id: int | None = None,
    session: AsyncSession = Depends(get_db_session),
    current_user: dict | None = Depends(get_current_user_optional),
):
    """
    Aggregated player stats in the context of a league (and optional season).

    Returns the full shape consumed by the mobile League Player Stats view:
    player profile (name/initials/level/location), league/season context,
    overall record, partner/opponent breakdowns, and ``is_self`` when the
    request is authenticated.

    Members-only for every league, public or private: the caller must be an
    authenticated member of the league or a 403 is raised. Non-members (and
    unauthenticated callers) are routed to the player's public profile instead
    of this league-scoped view.
    ``rank`` and ``game_history`` are populated; ``rating_delta`` is always None.
    """
    try:
        # Resolve the caller's player_id from their user_id. The optional-auth
        # user dict does NOT carry player_id (only require_verified_player adds
        # it), so we look it up explicitly — needed for both the members-only
        # access gate and the ``is_self`` flag.
        viewer_player_id = (
            await friend_service.get_player_id_for_user(session, current_user["id"])
            if current_user
            else None
        )
        stats = await data_service.get_league_player_stats_full(
            session,
            league_id=league_id,
            player_id=player_id,
            season_id=season_id,
            current_user_player_id=viewer_player_id,
            caller_player_id=viewer_player_id,
        )
        if stats is None:
            raise HTTPException(status_code=404, detail="Player, league, or season not found.")
        return stats
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading league player stats: {str(e)}")


@router.get(
    "/api/players/{player_id}/league/{league_id}/partnership-opponent-stats",
    response_model=PartnershipOpponentStatsResponse,
)
async def get_player_league_partnership_opponent_stats(
    player_id: int,
    league_id: int,
    user: dict = Depends(make_require_league_member()),
    session: AsyncSession = Depends(get_db_session),
):
    """Get a player's league relationship stats as a league member."""
    try:
        if await data_service.get_player_by_id(session, player_id) is None:
            raise HTTPException(status_code=404, detail="Player not found")
        stats = await data_service.get_player_league_partnership_opponent_stats(
            session, player_id, league_id
        )
        return stats
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error loading partnership/opponent stats: {str(e)}",
        )


# ---------------------------------------------------------------------------
# Rankings
# ---------------------------------------------------------------------------


@router.post("/api/rankings", response_model=list[dict])
async def query_rankings(
    request: Request,
    user: dict = Depends(require_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Query rankings with filters (e.g., by season_id).
    Body: RankingsQueryRequest

    Returns:
        list: Array of player rankings with stats
    """
    try:
        body = await request.json()
        await require_league_member_for_scope(
            session,
            user,
            season_id=body.get("season_id"),
            league_id=body.get("league_id"),
        )
        rankings = await data_service.get_rankings(session, body)
        # Return empty array with 200 status if no rankings (e.g., season with no matches)
        # This is more appropriate than 404, as the resource exists but has no data
        return rankings or []
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading rankings: {str(e)}")


# ---------------------------------------------------------------------------
# Season Awards
# ---------------------------------------------------------------------------


@router.get("/api/seasons/{season_id}/awards", response_model=list[dict])
async def get_season_awards(
    season_id: int,
    user: dict = Depends(make_require_league_member_from_season()),
    session: AsyncSession = Depends(get_db_session),
):
    """Get season awards as a league member, computing them lazily when eligible."""
    try:
        awards = await season_awards_service.get_season_awards(session, season_id)
        return awards
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading season awards: {str(e)}")


@router.get("/api/leagues/{league_id}/awards", response_model=list[dict])
async def get_league_awards(
    league_id: int,
    user: dict = Depends(make_require_league_member()),
    session: AsyncSession = Depends(get_db_session),
):
    """Get all league awards as a league member."""
    try:
        awards = await season_awards_service.get_league_awards(session, league_id)
        return awards
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading league awards: {str(e)}")


@router.get("/api/players/{player_id}/awards", response_model=list[dict])
async def get_player_awards(
    player_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Get all awards for the authenticated player's own profile."""
    try:
        if user["player_id"] != player_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        awards = await season_awards_service.get_player_awards(session, player_id)
        return awards
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading player awards: {str(e)}")


@router.post("/api/seasons/{season_id}/finalize-awards", response_model=list[dict])
async def finalize_season_awards(
    season_id: int,
    user: dict = Depends(make_require_league_admin_from_season()),
    session: AsyncSession = Depends(get_db_session),
):
    """Manually trigger award computation for a season (league admin only).

    Returns existing awards if already finalized. Returns 400 if the season
    has not ended yet.
    """
    try:
        result = await session.execute(sa_select(SeasonModel).where(SeasonModel.id == season_id))
        season_obj = result.scalar_one_or_none()
        if not season_obj:
            raise HTTPException(status_code=404, detail="Season not found")
        if not season_awards_service.season_has_ended(season_obj):
            raise HTTPException(status_code=400, detail="Season has not ended yet")

        awards = await season_awards_service.compute_season_awards(session, season_id)
        return awards
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error finalizing season awards: {str(e)}")
