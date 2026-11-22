"""Feature evaluation and system-admin release management."""

from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.auth_dependencies import get_current_user_optional, require_system_admin
from backend.database.db import get_db_session
from backend.database.models import User
from backend.database.models.feature_flags import FeatureFlag, FeatureFlagChange
from backend.services.platform.feature_flag_service import resolve, resolved_flags, snapshot

router = APIRouter()
Platform = Literal["web", "ios", "android"]
OptionalUser = Annotated[dict | None, Depends(get_current_user_optional)]
Admin = Annotated[dict, Depends(require_system_admin)]
Session = Annotated[AsyncSession, Depends(get_db_session)]


class FlagValues(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    description: str = Field(min_length=1, max_length=500)
    enabled: bool = Field(default=False, strict=True)
    rollout_percent: int = Field(default=0, ge=0, le=100, strict=True)
    user_ids: list[Annotated[int, Field(strict=True, gt=0)]] = Field(
        default_factory=list, max_length=1000
    )
    platforms: list[Platform] = Field(
        default_factory=lambda: ["web", "ios", "android"], min_length=1, max_length=3
    )
    reason: str = Field(min_length=1, max_length=500, pattern=r"\S")


class FlagCreate(FlagValues):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]{1,79}$")


class FlagUpdate(FlagValues):
    revision: int = Field(ge=1)


@router.get("/api/feature-flags")
async def get_feature_flags(
    response: Response,
    user: OptionalUser,
    session: Session,
    platform: Platform = "web",
):
    response.headers["Cache-Control"] = "private, no-store"
    return await resolved_flags(session, user["id"] if user else None, platform)


@router.get("/api/admin-view/feature-flags")
async def list_flags(response: Response, admin: Admin, session: Session):
    response.headers["Cache-Control"] = "private, no-store"
    return [
        snapshot(f)
        for f in (await session.scalars(select(FeatureFlag).order_by(FeatureFlag.key))).all()
    ]


async def validate_targets(session, ids):
    if any(type(i) is not int or i <= 0 for i in ids):
        raise HTTPException(422, "User IDs must be positive integers")
    if ids:
        found = set(
            (
                await session.scalars(
                    select(User.id).where(User.id.in_(ids), User.deleted_at.is_(None))
                )
            ).all()
        )
        if found != set(ids):
            raise HTTPException(422, "One or more selected users do not exist or are deleted")


async def save_flag(session, flag, payload, admin, before):
    await validate_targets(session, payload.user_ids)
    for key, value in payload.model_dump(exclude={"key", "reason", "revision"}).items():
        setattr(flag, key, sorted(set(value)) if isinstance(value, list) else value)
    flag.updated_at = datetime.now(UTC)
    session.add(flag)
    session.add(
        FeatureFlagChange(
            flag_key=flag.key,
            actor_user_id=admin["id"],
            reason=payload.reason.strip(),
            before=before,
            after=snapshot(flag),
        )
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(409, "Flag already exists; reload and try again")
    return snapshot(flag)


@router.post("/api/admin-view/feature-flags", status_code=201)
async def create_flag(payload: FlagCreate, admin: Admin, session: Session):
    return await save_flag(session, FeatureFlag(key=payload.key, revision=1), payload, admin, None)


@router.put("/api/admin-view/feature-flags/{key}")
async def update_flag(
    key: str,
    payload: FlagUpdate,
    admin: Admin,
    session: Session,
):
    flag = await session.get(FeatureFlag, key, with_for_update=True)
    if not flag:
        raise HTTPException(404, "Unknown flag")
    if flag.revision != payload.revision:
        raise HTTPException(409, "Another admin changed this flag. Reload before saving.")
    before = snapshot(flag)
    flag.revision += 1
    return await save_flag(session, flag, payload, admin, before)


@router.get("/api/admin-view/feature-flags/{key}/history")
async def flag_history(key: str, response: Response, admin: Admin, session: Session):
    response.headers["Cache-Control"] = "private, no-store"
    rows = (
        await session.scalars(
            select(FeatureFlagChange)
            .where(FeatureFlagChange.flag_key == key)
            .order_by(FeatureFlagChange.id.desc())
            .limit(50)
        )
    ).all()
    return [
        {
            "id": r.id,
            "actor_user_id": r.actor_user_id,
            "reason": r.reason,
            "before": r.before,
            "after": r.after,
            "occurred_at": r.occurred_at,
        }
        for r in rows
    ]


def require_feature(key):
    async def dependency(request: Request, user: OptionalUser, session: Session):
        # Client platform is a rollout hint, never an authorization boundary.
        platform = request.headers.get("X-Client-Platform", "web")
        if platform not in ("web", "ios", "android"):
            raise HTTPException(400, "Invalid client platform")
        if not await resolve(session, key, user["id"] if user else None, platform):
            raise HTTPException(403, detail={"code": "FEATURE_DISABLED", "feature": key})

    return dependency
