"""User/player profile route handlers."""

import asyncio
import logging

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.routes import limiter
from backend.database.db import get_db_session
from backend.database.models import Player
from backend.services import data_service, user_service, avatar_service, s3_service
from backend.api.auth_dependencies import get_current_user
from backend.models.schemas import UserResponse, UserUpdate, PlayerUpdate

logger = logging.getLogger(__name__)
router = APIRouter()


@router.put("/api/users/me", response_model=UserResponse)
async def update_current_user(
    payload: UserUpdate,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Update the current user's account information (email).
    Phone number cannot be changed.
    Requires authentication.
    """
    try:
        success = await user_service.update_user(
            session=session, user_id=current_user["id"], email=payload.email
        )
        if not success:
            raise HTTPException(status_code=400, detail="No fields provided to update")

        updated_user = await user_service.get_user_by_id(session, current_user["id"])
        if not updated_user:
            raise HTTPException(status_code=404, detail="User not found")

        return UserResponse(
            id=updated_user["id"],
            phone_number=updated_user["phone_number"],
            email=updated_user["email"],
            is_verified=updated_user["is_verified"],
            created_at=updated_user["created_at"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating user profile: {str(e)}")


@router.get("/api/users/me/player")
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


@router.put("/api/users/me/player")
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
        user = await user_service.get_user_by_id(session, current_user["id"])
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        player = await data_service.upsert_user_player(
            session=session,
            user_id=current_user["id"],
            full_name=payload.full_name,
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
                detail="Failed to create/update player profile. full_name is required.",
            )

        player_name = player.get("full_name") or player.get("name") or ""
        return {
            "id": player["id"],
            "full_name": player_name,
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating player profile: {str(e)}")


@router.post("/api/users/me/avatar")
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

        result = await session.execute(
            select(Player).where(Player.id == player["id"])
        )
        player_obj = result.scalar_one_or_none()
        if player_obj:
            player_obj.profile_picture_url = new_url
            player_obj.avatar = new_url
            await session.commit()

        if old_url:
            await loop.run_in_executor(None, s3_service.delete_avatar, old_url)

        return {"profile_picture_url": new_url}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading avatar: {e}")
        raise HTTPException(status_code=500, detail="Error uploading avatar")


@router.delete("/api/users/me/avatar")
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

        result = await session.execute(
            select(Player).where(Player.id == player["id"])
        )
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


@router.get("/api/users/me/leagues")
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
