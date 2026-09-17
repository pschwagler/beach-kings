"""Browser-only Apple entrypoints; native auth keeps its existing contract."""

from fastapi import APIRouter, Depends, Request, Response
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.auth_dependencies import get_current_user
from backend.api.routes import limiter
from backend.api.routes.auth import _authenticate_apple, _link_apple_provider
from backend.database.db import get_db_session
from backend.models.schemas import (
    AppleAuthRequest,
    LinkProviderRequest,
    AuthResponse,
    UserResponse,
)
from backend.services.auth import apple_web_service

router = APIRouter(prefix="/api/auth/apple/web")


class WebAppleRequest(AppleAuthRequest):
    state: str = Field(min_length=32, max_length=128)
    authorization_code: str = Field(min_length=1, max_length=4096)


@router.get("/config")
async def config(response: Response):
    response.headers["Cache-Control"] = "no-store"
    return {"enabled": apple_web_service.configuration() is not None}


@router.post("/start")
@limiter.limit("10/minute")
async def start(request: Request, response: Response):
    return await apple_web_service.start(request, response)


@router.post("/link/start")
@limiter.limit("10/minute")
async def start_link(
    request: Request, response: Response, current_user: dict = Depends(get_current_user)
):
    return await apple_web_service.start(request, response, user_id=current_user["id"])


@router.post("/complete", response_model=AuthResponse)
@limiter.limit("10/minute")
async def complete(
    request: Request,
    response: Response,
    payload: WebAppleRequest,
    session: AsyncSession = Depends(get_db_session),
):
    transaction = await apple_web_service.consume(request, payload.state, payload.id_token)
    response.headers["Cache-Control"] = "no-store"
    response.delete_cookie(
        apple_web_service.COOKIE_NAME, path="/", secure=True, httponly=True, samesite="lax"
    )
    return await _authenticate_apple(
        payload,
        session,
        redirect_uri=transaction["redirectURI"],
        expected_nonce=transaction["nonce"],
    )


@router.post("/link/complete", response_model=UserResponse)
@limiter.limit("10/minute")
async def complete_link(
    request: Request,
    response: Response,
    payload: WebAppleRequest,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    transaction = await apple_web_service.consume(
        request, payload.state, payload.id_token, user_id=current_user["id"]
    )
    response.headers["Cache-Control"] = "no-store"
    response.delete_cookie(
        apple_web_service.COOKIE_NAME, path="/", secure=True, httponly=True, samesite="lax"
    )
    link_payload = LinkProviderRequest(
        id_token=payload.id_token, authorization_code=payload.authorization_code
    )
    return await _link_apple_provider(
        link_payload,
        current_user,
        session,
        redirect_uri=transaction["redirectURI"],
        expected_nonce=transaction["nonce"],
    )
