"""League pictures have no public URL and are never included in discovery responses."""

import asyncio
import base64
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from backend.api.auth_dependencies import require_user
from backend.api.routes import limiter
from backend.database.db import get_db_session
from backend.database.models import LeagueMember, LeaguePicture, Player
from backend.services import interaction_policy
from backend.services.leagues.league_picture_service import (
    MAX_UPLOAD_BYTES,
    make_thumbnail,
    process_picture,
)

router = APIRouter()
PICTURE_MEMBER_ROLES = ("admin", "member")
LeagueId = Annotated[int, Field(gt=0, le=2_147_483_647)]


class LeaguePictureResponse(BaseModel):
    data_uri: str | None = None
    revision: str | None = None


async def require_picture_member(
    session: AsyncSession, league_id: int, user_id: int, *, admin: bool = False
) -> None:
    # Deliberately require actual membership, including for platform admins.
    role = await session.scalar(
        select(LeagueMember.role)
        .join(Player, Player.id == LeagueMember.player_id)
        .where(LeagueMember.league_id == league_id, Player.user_id == user_id)
    )
    if role not in PICTURE_MEMBER_ROLES:
        raise HTTPException(403, "League membership required")
    if admin and role != "admin":
        raise HTTPException(403, "League admin access required")


def picture_response(image: bytes | None, revision: str | None) -> LeaguePictureResponse:
    return LeaguePictureResponse(
        data_uri=f"data:image/jpeg;base64,{base64.b64encode(image).decode('ascii')}"
        if image
        else None,
        revision=revision,
    )


@router.get("/api/leagues/pictures/thumbnails", response_model=dict[int, LeaguePictureResponse])
@limiter.limit("60/minute")
async def get_picture_thumbnails(
    request: Request,
    response: Response,
    user: Annotated[dict, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    league_ids: Annotated[list[LeagueId], Query(min_length=1, max_length=25)],
):
    member_league_ids = (
        select(LeagueMember.league_id)
        .join(Player, Player.id == LeagueMember.player_id)
        .where(Player.user_id == user["id"], LeagueMember.role.in_(PICTURE_MEMBER_ROLES))
    )
    pictures = await session.execute(
        select(LeaguePicture.league_id, LeaguePicture.image_bytes, LeaguePicture.revision).where(
            LeaguePicture.league_id.in_(league_ids),
            LeaguePicture.league_id.in_(member_league_ids),
        )
    )
    rows = pictures.all()
    response.headers["Cache-Control"] = "private, no-store"
    if not rows:
        return {}
    return await asyncio.to_thread(
        lambda: {
            league_id: picture_response(make_thumbnail(image), revision)
            for league_id, image, revision in rows
        }
    )


@router.get("/api/leagues/{league_id}/picture", response_model=LeaguePictureResponse)
async def get_picture(
    league_id: int,
    response: Response,
    user: Annotated[dict, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    await require_picture_member(session, league_id, user["id"])
    response.headers["Cache-Control"] = "private, no-store"
    picture = await session.get(LeaguePicture, league_id)
    return (
        picture_response(picture.image_bytes, picture.revision)
        if picture
        else picture_response(None, None)
    )


@router.post("/api/leagues/{league_id}/picture", response_model=LeaguePictureResponse)
@limiter.limit("10/minute")
async def upload_picture(
    request: Request,
    league_id: int,
    response: Response,
    file: Annotated[UploadFile, File()],
    user: Annotated[dict, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    await require_picture_member(session, league_id, user["id"], admin=True)
    try:
        await interaction_policy.enforce_user_ugc_creation(session, user["id"])
    except interaction_policy.InteractionUnavailable as error:
        raise HTTPException(409, "Interaction unavailable") from error
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    try:
        image = await asyncio.to_thread(process_picture, content, file.content_type)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    revision = uuid4().hex
    await session.execute(
        insert(LeaguePicture)
        .values(league_id=league_id, image_bytes=image, revision=revision)
        .on_conflict_do_update(
            index_elements=[LeaguePicture.league_id],
            set_={"image_bytes": image, "revision": revision, "updated_at": func.now()},
        )
    )
    await session.commit()
    response.headers["Cache-Control"] = "private, no-store"
    return picture_response(image, revision)


@router.delete("/api/leagues/{league_id}/picture", response_model=LeaguePictureResponse)
async def remove_picture(
    league_id: int,
    response: Response,
    user: Annotated[dict, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    await require_picture_member(session, league_id, user["id"], admin=True)
    await session.execute(delete(LeaguePicture).where(LeaguePicture.league_id == league_id))
    await session.commit()
    response.headers["Cache-Control"] = "private, no-store"
    return picture_response(None, None)
