"""User/player profile route handlers."""

import asyncio
import logging

from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.routes import limiter
from backend.database.db import get_db_session
from backend.database.models import Player
from backend.services import (
    data_service,
    user_service,
    avatar_service,
    s3_service,
    my_stats_service,
    my_games_service,
)
from backend.services import push_prefs_service, court_service
from backend.services import interaction_policy, moderation_worker
from backend.api.auth_dependencies import get_current_user, require_verified_player
from backend.models.schemas import (
    UserResponse,
    UserUpdate,
    PlayerUpdate,
    StatusResponse,
    MyStatsPayload,
    LeagueInviteItemResponse,
    PushPrefsResponse,
    PushPrefsUpdate,
    AddPlayerHomeCourt,
    CourtListItem,
    BlockCreate,
    BlockedPlayerResponse,
    InteractionCapabilityBatchRequest,
    InteractionCapabilityBatchResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/users/me/blocks", response_model=List[BlockedPlayerResponse])
async def get_my_blocks(
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    return await interaction_policy.list_blocks(session, user["player_id"])


@router.post("/api/users/me/blocks", status_code=201)
async def block_player(
    payload: BlockCreate,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    try:
        result = await interaction_policy.create_block(
            session, user["player_id"], payload.player_id
        )
        await session.commit()
        await interaction_policy.broadcast_private_data_invalidation(
            session, [user["player_id"], payload.player_id]
        )
        return {**result, "status": "blocked"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/api/users/me/blocks/{player_id}")
async def unblock_player(
    player_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    await interaction_policy.remove_block(session, user["player_id"], player_id)
    await session.commit()
    await interaction_policy.broadcast_private_data_invalidation(
        session, [user["player_id"], player_id]
    )
    return {"player_id": player_id, "status": "unblocked"}


@router.post(
    "/api/users/interaction-capabilities",
    response_model=InteractionCapabilityBatchResponse,
)
async def get_interaction_capabilities(
    payload: InteractionCapabilityBatchRequest,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    capabilities = await interaction_policy.interaction_capabilities(
        session, user["player_id"], payload.player_ids
    )
    return {
        "capabilities": {
            str(player_id): capability for player_id, capability in capabilities.items()
        }
    }


def _build_user_response(user: dict) -> UserResponse:
    """Construct a ``UserResponse`` from a user dict, populating all auth flags.

    Centralises flag derivation so every endpoint that updates the current user
    returns a consistent, fully-populated shape.  Mirrors the implementation in
    ``auth.py`` — kept local to avoid a circular-import through the routes
    ``__init__`` package.

    Args:
        user: User dict as returned by ``user_service.get_user_by_id`` or
            ``get_current_user``.

    Returns:
        Fully-populated ``UserResponse`` including auth provider fields.
    """
    moderation_status = user_service.effective_moderation_status(user)
    return UserResponse(
        id=user["id"],
        phone_number=user.get("phone_number"),
        email=user.get("email"),
        is_verified=user["is_verified"],
        auth_provider=user.get("auth_provider", "phone"),
        has_password=user.get("password_hash") is not None,
        deletion_scheduled_at=user.get("deletion_scheduled_at"),
        created_at=user["created_at"],
        google_connected=user.get("google_id") is not None,
        apple_connected=user.get("apple_id") is not None,
        profile_is_private=bool(user.get("profile_is_private", False)),
        show_game_history=bool(user.get("show_game_history", False)),
        moderation_status=moderation_status,
        moderation_expires_at=(
            user.get("moderation_expires_at") if moderation_status != "active" else None
        ),
        moderation_case_id=(
            user.get("moderation_case_id") if moderation_status != "active" else None
        ),
    )


@router.put("/api/users/me", response_model=UserResponse)
async def update_current_user(
    payload: UserUpdate,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Update the current user's account information.

    Accepts ``email``, ``profile_is_private``, and ``show_game_history``.
    Phone number cannot be changed.  Only fields that are non-null in the
    request body are written; omitted fields are left unchanged.
    Requires authentication.
    """
    try:
        success = await user_service.update_user(
            session=session,
            user_id=current_user["id"],
            email=payload.email,
            profile_is_private=payload.profile_is_private,
            show_game_history=payload.show_game_history,
        )
        if not success:
            raise HTTPException(status_code=400, detail="No fields provided to update")

        updated_user = await user_service.get_user_by_id(session, current_user["id"])
        if not updated_user:
            raise HTTPException(status_code=404, detail="User not found")

        return _build_user_response(updated_user)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating user profile: {str(e)}")


@router.get("/api/users/me/player", response_model=dict)
async def get_current_user_player(
    current_user: dict = Depends(get_current_user), session: AsyncSession = Depends(get_db_session)
):
    """
    Get the current user's player profile.
    Requires authentication.

    Returns:
        Player profile with gender, level, global stats, etc., or null if user has no player profile
    """
    try:
        player = await data_service.get_player_by_user_id_with_stats(session, current_user["id"])
        return player
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user player: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting user player: {str(e)}")


@router.get("/api/users/me/stats", response_model=MyStatsPayload)
async def get_my_stats(
    current_user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
    league_id: Optional[int] = Query(
        default=None, description="Filter all stats to a single league"
    ),
    days: Optional[int] = Query(
        default=None,
        ge=1,
        le=3650,
        description="Time window in days (recomputes from raw match rows)",
    ),
):
    """
    Get the authenticated player's full stats payload for the My Stats screen.

    Returns overall stats, trophies, partner/opponent breakdowns, and ELO
    timeline. Requires a linked player profile.

    Query parameters:
        league_id: Restrict every aggregate to a single league.
        days: Restrict every aggregate to matches in the last ``days`` days.
            When set, the service recomputes stats from raw match rows so that
            partners/opponents/elo_timeline reflect only the windowed activity.
    """
    player_id = current_user["player_id"]

    try:
        payload = await my_stats_service.get_my_stats(
            session=session,
            player_id=player_id,
            league_id=league_id,
            days=days,
        )
    except Exception as e:
        logger.error(f"Error fetching my stats for player {player_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch stats.")

    if payload is None:
        raise HTTPException(status_code=404, detail="Player not found.")

    return payload


@router.put("/api/users/me/player", response_model=dict)
async def update_current_user_player(
    payload: PlayerUpdate,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Update the current user's player profile.
    Creates user and player if they don't exist (for signup flow).
    Requires authentication.
    """
    try:
        current_player = await data_service.get_player_by_user_id_with_stats(
            session, current_user["id"]
        )
        if current_player:
            await interaction_policy.enforce_ugc_creation(session, current_player["id"])
        user = await user_service.get_user_by_id(session, current_user["id"])
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        public_profile_text = "\n".join(
            value.strip()
            for value in (payload.full_name, payload.nickname)
            if value and value.strip()
        )
        try:
            await moderation_worker.screen_text(
                public_profile_text,
                safety_identifier=f"player_profile_{current_user['id']}",
            )
        except moderation_worker.ModerationUnavailable:
            raise HTTPException(
                status_code=503,
                detail="Profile review is temporarily unavailable. Please try again.",
            )
        except moderation_worker.ContentRejected:
            raise HTTPException(
                status_code=422,
                detail="This profile text cannot be used. Please revise it.",
            )

        player = await data_service.upsert_user_player(
            session=session,
            user_id=current_user["id"],
            full_name=payload.full_name,
            first_name=payload.first_name,
            last_name=payload.last_name,
            nickname=payload.nickname,
            gender=payload.gender,
            level=payload.level,
            date_of_birth=payload.date_of_birth,
            height=payload.height,
            preferred_side=payload.preferred_side,
            location_id=payload.location_id,
            city=payload.city,
            state=payload.state,
            city_latitude=payload.city_latitude,
            city_longitude=payload.city_longitude,
            distance_to_location=payload.distance_to_location,
        )

        if not player:
            raise HTTPException(
                status_code=400,
                detail="Failed to create/update player profile. A name is required.",
            )

        player_name = player.get("full_name") or player.get("name") or ""
        return {
            "id": player["id"],
            "full_name": player_name,
            "first_name": player.get("first_name"),
            "last_name": player.get("last_name"),
            "gender": player.get("gender"),
            "level": player.get("level"),
            "nickname": player.get("nickname"),
            "date_of_birth": player.get("date_of_birth"),
            "height": player.get("height"),
            "preferred_side": player.get("preferred_side"),
            "location_id": player.get("location_id"),
            "city": player.get("city"),
            "state": player.get("state"),
            "city_latitude": player.get("city_latitude"),
            "city_longitude": player.get("city_longitude"),
            "distance_to_location": player.get("distance_to_location"),
        }
    except interaction_policy.InteractionUnavailable:
        raise HTTPException(status_code=409, detail="Interaction unavailable")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating player profile: {str(e)}")


@router.post("/api/users/me/avatar", response_model=dict)
@limiter.limit("10/minute")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Upload or replace the current user's avatar image.

    Accepts JPEG, PNG, WebP, or HEIC images up to 5MB.
    The image is processed (converted to RGB, center-cropped to square,
    resized to 512x512, compressed as JPEG) and uploaded to S3.

    Returns:
        { "profile_picture_url": "<s3_url>" }
    """
    try:
        player = await data_service.get_player_by_user_id_with_stats(session, current_user["id"])
        if not player:
            raise HTTPException(status_code=404, detail="Player profile not found")
        await interaction_policy.enforce_ugc_creation(session, player["id"])

        file_bytes = await file.read()
        is_valid, error_msg = avatar_service.validate_avatar(file_bytes, file.content_type)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)

        loop = asyncio.get_event_loop()
        processed_bytes = await loop.run_in_executor(
            None, avatar_service.process_avatar, file_bytes
        )

        old_url = player.get("profile_picture_url")

        new_url = await loop.run_in_executor(
            None, s3_service.upload_avatar, player["id"], processed_bytes
        )

        try:
            await moderation_worker.screen_image_url(
                new_url, safety_identifier=f"player_avatar_{player['id']}"
            )
        except moderation_worker.ModerationUnavailable:
            await loop.run_in_executor(None, s3_service.delete_avatar, new_url)
            raise HTTPException(
                status_code=503,
                detail="Photo review is temporarily unavailable. Please try again.",
            )
        except moderation_worker.ContentRejected:
            await loop.run_in_executor(None, s3_service.delete_avatar, new_url)
            raise HTTPException(
                status_code=422,
                detail="This photo cannot be used. Please choose another photo.",
            )

        result = await session.execute(select(Player).where(Player.id == player["id"]))
        player_obj = result.scalar_one_or_none()
        if player_obj:
            player_obj.profile_picture_url = new_url
            player_obj.avatar = new_url
            await session.commit()

        if old_url:
            await loop.run_in_executor(None, s3_service.delete_avatar, old_url)

        return {"profile_picture_url": new_url}

    except interaction_policy.InteractionUnavailable:
        raise HTTPException(status_code=409, detail="Interaction unavailable")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading avatar: {e}")
        raise HTTPException(status_code=500, detail="Error uploading avatar")


@router.delete("/api/users/me/avatar", response_model=dict)
async def delete_avatar(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Remove the current user's avatar, reverting to initials.

    Deletes the image from S3 and clears profile_picture_url and avatar columns.

    Returns:
        { "message": "Avatar removed" }
    """
    try:
        player = await data_service.get_player_by_user_id_with_stats(session, current_user["id"])
        if not player:
            raise HTTPException(status_code=404, detail="Player profile not found")

        loop = asyncio.get_event_loop()
        old_url = player.get("profile_picture_url")
        if old_url:
            await loop.run_in_executor(None, s3_service.delete_avatar, old_url)

        result = await session.execute(select(Player).where(Player.id == player["id"]))
        player_obj = result.scalar_one_or_none()
        if player_obj:
            initials = data_service.generate_player_initials(player_obj.full_name or "")
            player_obj.profile_picture_url = None
            player_obj.avatar = initials or None
            await session.commit()

        return {"message": "Avatar removed"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting avatar: {e}")
        raise HTTPException(status_code=500, detail="Error deleting avatar")


@router.get("/api/users/me/leagues", response_model=list)
async def get_user_leagues(
    user: dict = Depends(get_current_user), session: AsyncSession = Depends(get_db_session)
):
    """
    Get all leagues that the current user is a member of.
    Requires authentication.
    """
    try:
        return await data_service.get_user_leagues(session, user["id"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting user leagues: {str(e)}")


@router.get("/api/users/me/league-invites/sent", response_model=list[LeagueInviteItemResponse])
async def get_my_sent_league_invites(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Return league invites sent by the current user across all leagues.
    Requires authentication.
    """
    try:
        result = await session.execute(select(Player).where(Player.user_id == current_user["id"]))
        player = result.scalar_one_or_none()
        if not player:
            return []
        return await data_service.list_my_sent_invites(session, player.id)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching sent league invites: {str(e)}"
        )


@router.get("/api/users/me/league-invites/received", response_model=list[LeagueInviteItemResponse])
async def get_my_received_league_invites(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Return pending league invites received by the current user across all leagues.

    Only pending invites (awaiting accept or decline) are returned.
    Requires authentication.
    """
    try:
        result = await session.execute(select(Player).where(Player.user_id == current_user["id"]))
        player = result.scalar_one_or_none()
        if not player:
            return []
        return await data_service.list_my_received_invites(session, player.id)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching received league invites: {str(e)}"
        )


@router.post("/api/users/me/delete", response_model=StatusResponse)
async def schedule_account_deletion(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Schedule account for deletion after a 30-day grace period.

    The user can cancel by logging in during the grace period.
    After 30 days a background worker permanently anonymizes all PII.
    """
    try:
        success = await user_service.schedule_account_deletion(session, current_user["id"])
        if not success:
            raise HTTPException(status_code=404, detail="User not found")
        return {
            "status": "success",
            "message": "Account deletion scheduled. You have 30 days to cancel by logging back in.",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error scheduling account deletion: {e}")
        raise HTTPException(status_code=500, detail="Error scheduling account deletion")


@router.delete("/api/users/me", response_model=StatusResponse)
async def delete_account_immediately(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Permanently delete and anonymize the authenticated account immediately."""
    try:
        success = await user_service.execute_account_deletion(session, current_user["id"])
        if not success:
            raise HTTPException(status_code=404, detail="User not found")
        return {"status": "success", "message": "Account permanently deleted."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting account immediately: {e}")
        raise HTTPException(status_code=500, detail="Error deleting account")


@router.post("/api/users/me/cancel-deletion", response_model=StatusResponse)
async def cancel_account_deletion(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Cancel a pending account deletion.

    Only valid while the 30-day grace period is still active.
    """
    try:
        success = await user_service.cancel_account_deletion(session, current_user["id"])
        if not success:
            raise HTTPException(status_code=400, detail="No pending deletion to cancel")
        return {"status": "success", "message": "Account deletion cancelled."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling account deletion: {e}")
        raise HTTPException(status_code=500, detail="Error cancelling account deletion")


@router.get("/api/users/me/games", response_model=dict)
async def get_my_games(
    current_user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
    league_id: Optional[int] = Query(default=None, description="Filter by league ID"),
    result: Optional[Literal["W", "L", "D"]] = Query(
        default=None, description="Filter by result: W, L, or D"
    ),
    limit: int = Query(default=50, ge=1, le=200, description="Max number of games to return"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
):
    """
    Get the authenticated player's match history for the My Games screen.

    Returns games newest-first, with optional filtering by league and result.
    Requires a linked player profile.
    """
    player_id = current_user["player_id"]

    try:
        result_data = await my_games_service.get_my_games(
            session=session,
            player_id=player_id,
            league_id=league_id,
            result_filter=result,
            limit=limit,
            offset=offset,
        )
    except Exception as e:
        logger.error(f"Error fetching games for player {player_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch game history.")

    if result_data is None:
        raise HTTPException(status_code=404, detail="Player not found.")

    games, total = result_data
    return {"games": games, "total": total}


@router.get("/api/users/me/push-prefs", response_model=PushPrefsResponse)
async def get_push_prefs(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> PushPrefsResponse:
    """Return the authenticated user's push notification preferences.

    When no preferences row exists yet, returns the defaults (all common
    types enabled; tournament_updates and ranking_changes disabled).
    """
    try:
        prefs = await push_prefs_service.get_prefs(session, current_user["id"])
        return PushPrefsResponse(**prefs)
    except Exception as e:
        logger.error(f"Error fetching push prefs for user {current_user['id']}: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to fetch push notification preferences."
        )


@router.patch("/api/users/me/push-prefs", response_model=PushPrefsResponse)
async def update_push_prefs(
    payload: PushPrefsUpdate,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> PushPrefsResponse:
    """Partially update the authenticated user's push notification preferences.

    Only fields included in the request body are changed. Omitted fields
    retain their current (or default) values. Creates the preference row
    on first call if it doesn't exist yet.
    """
    try:
        updates = payload.model_dump(exclude_none=True)
        prefs = await push_prefs_service.update_prefs(session, current_user["id"], updates)
        await session.commit()
        return PushPrefsResponse(**prefs)
    except Exception as e:
        logger.error(f"Error updating push prefs for user {current_user['id']}: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to update push notification preferences."
        )


# ---------------------------------------------------------------------------
# Saved courts ("My Courts")
#
# A player's saved courts ARE their home courts (shared player_home_courts
# table). These "me" endpoints give the mobile app a clean, self-scoped surface
# that resolves the player from the auth context.
# ---------------------------------------------------------------------------


@router.get("/api/users/me/courts", response_model=List[CourtListItem])
async def list_my_courts(
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """List the authenticated player's saved courts ("My Courts") as court cards."""
    try:
        return await court_service.get_saved_court_cards(session, user["player_id"])
    except Exception as e:
        logger.error("Error listing saved courts: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error listing saved courts")


@router.post("/api/users/me/courts", response_model=dict)
async def save_my_court(
    payload: AddPlayerHomeCourt,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Save a court to the authenticated player's "My Courts" (idempotent)."""
    try:
        return await court_service.save_court(session, user["player_id"], payload.court_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error saving court: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error saving court")


@router.delete("/api/users/me/courts/{court_id}", response_model=dict)
async def unsave_my_court(
    court_id: int,
    user: dict = Depends(require_verified_player),
    session: AsyncSession = Depends(get_db_session),
):
    """Remove a court from the authenticated player's "My Courts" (idempotent)."""
    try:
        return await court_service.unsave_court(session, user["player_id"], court_id)
    except Exception as e:
        logger.error("Error unsaving court: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Error unsaving court")
