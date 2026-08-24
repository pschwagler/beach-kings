"""Authentication route handlers."""

import asyncio
import logging
import os
import random
import time
from datetime import datetime, timedelta
from typing import Dict, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.routes import (
    limiter,
    INVALID_CREDENTIALS_RESPONSE,
    INVALID_VERIFICATION_CODE_RESPONSE,
)
from backend.database.db import get_db_session
from backend.database.models import Player, User
from backend.services import (
    auth_service,
    user_service,
    data_service,
    rate_limiting_service,
    avatar_service,
    s3_service,
    moderation_service,
    apple_token_service,
    youth_safety_service,
    auth_delivery_service,
)
from backend.api.auth_dependencies import get_current_user
from backend.models.schemas import (
    SignupRequest,
    LoginRequest,
    SMSLoginRequest,
    VerifyPhoneRequest,
    EmailVerifyRequest,
    CheckPhoneRequest,
    PhoneAddRequest,
    PhoneAddVerify,
    AuthResponse,
    UserResponse,
    RefreshTokenRequest,
    RefreshTokenResponse,
    ResetPasswordRequest,
    ResetPasswordVerifyRequest,
    ResetPasswordConfirmRequest,
    ResetPasswordEmailRequest,
    ResetPasswordEmailVerifyRequest,
    GoogleAuthRequest,
    AppleAuthRequest,
    LinkProviderRequest,
    ChangePasswordRequest,
    ChangePasswordResponse,
    YouthEligibilityRequest,
    YouthEligibilityResponse,
)
from backend.utils.datetime_utils import utcnow

logger = logging.getLogger(__name__)
router = APIRouter()

_GENERIC_SIGNUP_MESSAGE = (
    "If this email or phone number can be used, a verification code will arrive shortly."
)
_DUMMY_PASSWORD_HASH = auth_service.hash_password("not-a-real-user-password-9")


async def _delivery_response(started_at: float, payload: dict[str, Any]) -> dict[str, Any]:
    """Apply a small production-only timing floor to discovery-safe responses."""
    if os.getenv("ENV", "development").lower() == "production":
        remaining = random.uniform(0.300, 0.450) - (time.monotonic() - started_at)
        if remaining > 0:
            await asyncio.sleep(remaining)
    return payload


async def _record_bad_code(
    session: AsyncSession,
    identifier: str,
    *,
    phone_number: str | None = None,
    email: str | None = None,
) -> None:
    exhausted = await rate_limiting_service.record_verification_failure(identifier)
    if not exhausted:
        return
    await user_service.invalidate_verification_codes(
        session,
        phone_number=phone_number,
        email=email,
    )
    raise HTTPException(
        status_code=429,
        detail="Too many verification attempts. Request a new code.",
        headers={"Retry-After": "600"},
    )


@router.post("/api/auth/youth-eligibility", response_model=YouthEligibilityResponse)
@limiter.limit("20/minute")
async def check_youth_eligibility(request: Request, payload: YouthEligibilityRequest):
    """Run the PII-free global age gate and issue a short-lived proof."""
    try:
        facts = youth_safety_service.evaluate_gate(**payload.model_dump())
    except youth_safety_service.YouthEligibilityError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return YouthEligibilityResponse(
        eligibility_token=youth_safety_service.create_eligibility_token(facts),
        age_group=facts.age_group,
        minimum_age=youth_safety_service.MINIMUM_AGE,
        policy=youth_safety_service.POLICY,
    )


async def _maybe_cancel_deletion(session: AsyncSession, user: dict) -> None:
    """Cancel pending account deletion if the user logs in during the grace period."""
    if user.get("deletion_scheduled_at"):
        await user_service.cancel_account_deletion(session, user["id"])


async def _issue_tokens(session: AsyncSession, user: dict) -> tuple:
    """
    Create an access token and a rotated refresh token for a user.

    Args:
        session: Database session
        user: User dict with at least 'id' and optionally 'phone_number'

    Returns:
        Tuple of (access_token, refresh_token)
    """
    session_version = int(user.get("session_version", 0))
    token_data = {
        "user_id": user["id"],
        "phone_number": user.get("phone_number") or "",
        "sv": session_version,
    }
    access_token = auth_service.create_access_token(data=token_data)

    refresh_token = auth_service.generate_refresh_token()
    expires_at = utcnow() + timedelta(days=auth_service.REFRESH_TOKEN_EXPIRATION_DAYS)
    created = await user_service.create_refresh_token(
        session,
        user["id"],
        refresh_token,
        expires_at,
        session_version=session_version,
    )
    if not created:
        raise RuntimeError("Unable to create replacement session")

    return access_token, refresh_token


async def _check_profile_complete(session: AsyncSession, user_id: int) -> bool:
    """
    Check whether a user's player profile has the required fields filled in.

    Args:
        session: Database session
        user_id: User ID to check

    Returns:
        True if the player has gender and level set, False otherwise
    """
    player = await data_service.get_player_by_user_id(session, user_id)
    if not player or not player.get("gender") or not player.get("level"):
        return False
    return True


@router.post("/api/auth/signup", response_model=Dict[str, Any])
async def signup(
    payload: SignupRequest,
    http_request: Request,
    session: AsyncSession = Depends(get_db_session),
):
    """
    Start signup process by storing signup data and sending a verification code.
    Account is only created after verification.

    Accepts either phone_number (SMS flow, web) or email (email flow, mobile).
    The request schema enforces that at least one is provided.
    """
    try:
        try:
            eligibility = youth_safety_service.decode_eligibility_token(payload.eligibility_token)
        except youth_safety_service.YouthEligibilityError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        youth_facts = youth_safety_service.account_values(eligibility)
        auth_service.validate_password_length(payload.password)
        if not any(char.isdigit() for char in payload.password):
            raise HTTPException(
                status_code=400, detail="Password must include at least one number"
            )
        # Name validation is handled by SignupRequest's model_validator
        # which ensures first_name + last_name (or full_name) are resolved.

        started_at = time.monotonic()
        if payload.email and not payload.phone_number:
            auth_service.normalize_email(payload.email)
        else:
            auth_service.normalize_phone_number(payload.phone_number)
        await rate_limiting_service.reserve_password_work(http_request)
        password_hash = auth_service.hash_password(payload.password)
        code = auth_service.generate_verification_code()

        # Email-only signup path (mobile)
        if payload.email and not payload.phone_number:
            email = auth_service.normalize_email(payload.email)
            reservation = await rate_limiting_service.reserve_code_delivery(
                http_request, email, channel="email"
            )
            if await user_service.check_email_exists(session, email):
                await auth_delivery_service.enqueue_noop(
                    session, channel="email", purpose="signup"
                )
                await rate_limiting_service.release_network_delivery(reservation)
                await rate_limiting_service.clear_verification_failures(email)
                return await _delivery_response(
                    started_at,
                    {"status": "success", "message": _GENERIC_SIGNUP_MESSAGE, "email": email},
                )

            success = await user_service.create_verification_code(
                session=session,
                phone_number=None,
                code=code,
                password_hash=password_hash,
                name=payload.full_name,
                email=email,
                youth_facts=youth_facts,
                delivery_channel="email",
                delivery_purpose="signup",
            )
            if not success:
                await rate_limiting_service.release_code_delivery(reservation)
                raise HTTPException(status_code=500, detail="Failed to create verification code")

            await rate_limiting_service.clear_verification_failures(email)

            return await _delivery_response(
                started_at,
                {
                    "status": "success",
                    "message": _GENERIC_SIGNUP_MESSAGE,
                    "email": email,
                },
            )

        # Phone signup path (web)
        phone_number = auth_service.normalize_phone_number(payload.phone_number)
        reservation = await rate_limiting_service.reserve_code_delivery(
            http_request, phone_number, channel="sms"
        )
        if await user_service.check_phone_exists(session, phone_number):
            await auth_delivery_service.enqueue_noop(session, channel="sms", purpose="signup")
            await rate_limiting_service.release_network_delivery(reservation)
            await rate_limiting_service.clear_verification_failures(phone_number)
            return await _delivery_response(
                started_at,
                {
                    "status": "success",
                    "message": _GENERIC_SIGNUP_MESSAGE,
                    "phone_number": phone_number,
                },
            )

        email = None
        if payload.email:
            email = auth_service.normalize_email(payload.email)

        success = await user_service.create_verification_code(
            session=session,
            phone_number=phone_number,
            code=code,
            password_hash=password_hash,
            name=payload.full_name,
            email=email,
            youth_facts=youth_facts,
            delivery_channel="sms",
            delivery_purpose="signup",
        )
        if not success:
            await rate_limiting_service.release_code_delivery(reservation)
            raise HTTPException(status_code=500, detail="Failed to create verification code")

        await rate_limiting_service.clear_verification_failures(phone_number)

        return await _delivery_response(
            started_at,
            {
                "status": "success",
                "message": _GENERIC_SIGNUP_MESSAGE,
                "phone_number": phone_number,
            },
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Error during signup")
        raise HTTPException(status_code=500, detail="Error during signup. Please try again.")


@router.post("/api/auth/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest,
    http_request: Request,
    session: AsyncSession = Depends(get_db_session),
):
    """Login with phone number or email and password."""
    try:
        user = None
        if payload.phone_number:
            identifier = auth_service.normalize_phone_number(payload.phone_number)
            await rate_limiting_service.ensure_login_available(http_request, identifier)
            await rate_limiting_service.reserve_password_work(http_request)
            phone_number = identifier
            user = await user_service.get_user_by_phone(session, phone_number)
        elif payload.email:
            identifier = auth_service.normalize_email(payload.email)
            await rate_limiting_service.ensure_login_available(http_request, identifier)
            await rate_limiting_service.reserve_password_work(http_request)
            email = identifier
            user = await user_service.get_user_by_email(session, email)

        if not user:
            auth_service.verify_password(payload.password, _DUMMY_PASSWORD_HASH)
            await rate_limiting_service.record_login_failure(http_request, identifier)
            raise INVALID_CREDENTIALS_RESPONSE

        if not user.get("password_hash"):
            auth_service.verify_password(payload.password, _DUMMY_PASSWORD_HASH)
            await rate_limiting_service.record_login_failure(http_request, identifier)
            raise INVALID_CREDENTIALS_RESPONSE

        if not auth_service.verify_password(payload.password, user["password_hash"]):
            await rate_limiting_service.record_login_failure(http_request, identifier)
            raise INVALID_CREDENTIALS_RESPONSE

        await rate_limiting_service.clear_login_failures(http_request, identifier)

        await _maybe_cancel_deletion(session, user)

        access_token, refresh_token = await _issue_tokens(session, user)

        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user_id=user["id"],
            phone_number=user.get("phone_number"),
            is_verified=user["is_verified"],
            auth_provider=user.get("auth_provider", "phone"),
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Error during login")
        raise HTTPException(status_code=500, detail="Error during login. Please try again.")


@router.post("/api/auth/google", response_model=AuthResponse)
@limiter.limit("10/minute")
async def google_auth(
    request: Request, payload: GoogleAuthRequest, session: AsyncSession = Depends(get_db_session)
):
    """
    Authenticate with Google ID token.

    Verifies the Google ID token, then:
    1. If user exists by google_id → log in
    2. If user exists by email → return 409 (must link from account settings)
    3. Otherwise → create new user + player profile, log in
    """
    try:
        # Verify Google token
        google_info = auth_service.verify_google_id_token(payload.id_token)
        google_id = google_info["sub"]
        email = google_info["email"].strip().lower()
        name = google_info.get("name")
        given_name = google_info.get("given_name")
        family_name = google_info.get("family_name")
        picture_url = google_info.get("picture")

        # 1. Check by google_id first
        user = await user_service.get_user_by_google_id(session, google_id)
        is_new_user = user is None

        if not user:
            # 2. Check if email already in use — do NOT auto-link
            existing = await user_service.get_user_by_email(session, email)
            if existing:
                raise HTTPException(
                    status_code=409,
                    detail="An account with this email already exists. "
                    "Please sign in with your original method and link Google from account settings.",
                )

        if not user:
            # 3. Create new user + player profile in a single transaction
            try:
                eligibility = youth_safety_service.decode_eligibility_token(
                    payload.eligibility_token
                )
            except youth_safety_service.YouthEligibilityError as exc:
                raise HTTPException(status_code=403, detail=str(exc)) from exc
            display_name = name or email.split("@")[0]
            user_id = await user_service.create_google_user(
                session,
                email=email,
                google_id=google_id,
                full_name=display_name,
                youth_facts=youth_safety_service.account_values(eligibility),
            )

            # Always create player profile for new users
            player = await data_service.upsert_user_player(
                session=session,
                user_id=user_id,
                full_name=display_name,
                first_name=given_name,
                last_name=family_name,
            )
            if not player:
                logger.error(f"Failed to create player profile for Google user {user_id}")

            # Commit user + player together atomically
            await session.commit()

            user = await user_service.get_user_by_id(session, user_id)

            # Import Google avatar (best-effort, after commit)
            if player and picture_url:
                try:
                    await _import_google_avatar(session, player["id"], picture_url)
                except Exception as e:
                    logger.warning(
                        f"Failed to import Google avatar for player {player['id']}: {e}"
                    )

        await _maybe_cancel_deletion(session, user)

        # Issue tokens
        access_token, refresh_token = await _issue_tokens(session, user)
        profile_complete = await _check_profile_complete(session, user["id"])

        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user_id=user["id"],
            phone_number=user.get("phone_number"),
            is_verified=user["is_verified"],
            auth_provider=user.get("auth_provider", "google"),
            profile_complete=profile_complete,
            is_new_user=is_new_user,
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error during Google auth")
        raise HTTPException(status_code=500, detail="Authentication failed. Please try again.")


@router.post("/api/auth/apple", response_model=AuthResponse)
@limiter.limit("10/minute")
async def apple_auth(
    request: Request, payload: AppleAuthRequest, session: AsyncSession = Depends(get_db_session)
):
    """
    Authenticate with Apple ID token.

    Verifies the Apple ID token, then:
    1. If user exists by apple_id -> log in
    2. If user exists by email -> return 409 (must link from account settings)
    3. Otherwise -> create new user + player profile, log in

    Note: Apple only sends the user's name on the FIRST authorization.
    On subsequent logins, only email and sub are available.
    """
    try:
        # Verify Apple token
        apple_info = auth_service.verify_apple_id_token(payload.id_token)
        apple_id = apple_info["sub"]
        email = apple_info["email"].strip().lower()

        # 1. Check by apple_id first
        user = await user_service.get_user_by_apple_id(session, apple_id)
        is_new_user = user is None

        if not user:
            # 2. Check if email already in use -- do NOT auto-link
            existing = await user_service.get_user_by_email(session, email)
            if existing:
                raise HTTPException(
                    status_code=409,
                    detail="An account with this email already exists. "
                    "Please sign in with your original method and link Apple from account settings.",
                )

        if not user:
            # 3. Create new user + player profile in a single transaction
            try:
                eligibility = youth_safety_service.decode_eligibility_token(
                    payload.eligibility_token
                )
            except youth_safety_service.YouthEligibilityError as exc:
                raise HTTPException(status_code=403, detail=str(exc)) from exc
            display_name = email.split("@")[0]
            user_id = await user_service.create_apple_user(
                session,
                email=email,
                apple_id=apple_id,
                full_name=display_name,
                youth_facts=youth_safety_service.account_values(eligibility),
            )

            # Always create player profile for new users
            player = await data_service.upsert_user_player(
                session=session,
                user_id=user_id,
                full_name=display_name,
            )
            if not player:
                logger.error(f"Failed to create player profile for Apple user {user_id}")

            # Commit user + player together atomically
            await session.commit()

            user = await user_service.get_user_by_id(session, user_id)

        if payload.authorization_code:
            await _capture_apple_refresh_token(
                session,
                user_id=user["id"],
                apple_id=apple_id,
                authorization_code=payload.authorization_code,
                client_id=apple_info.get("aud"),
            )

        await _maybe_cancel_deletion(session, user)

        # Issue tokens
        access_token, refresh_token = await _issue_tokens(session, user)
        profile_complete = await _check_profile_complete(session, user["id"])

        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user_id=user["id"],
            phone_number=user.get("phone_number"),
            is_verified=user["is_verified"],
            auth_provider=user.get("auth_provider", "apple"),
            profile_complete=profile_complete,
            is_new_user=is_new_user,
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error during Apple auth")
        raise HTTPException(status_code=500, detail="Authentication failed. Please try again.")


# Google avatar URL allowlist prefix
_GOOGLE_AVATAR_URL_PREFIX = "https://lh3.googleusercontent.com/"
_GOOGLE_AVATAR_MAX_BYTES = 5 * 1024 * 1024  # 5 MB


async def _import_google_avatar(session: AsyncSession, player_id: int, picture_url: str) -> None:
    """
    Download a Google profile picture and upload it as the player's avatar.

    Only fetches from allowlisted Google CDN domains. Enforces a size limit
    to prevent memory exhaustion.

    Args:
        session: Database session
        player_id: Player ID to set avatar for
        picture_url: Google profile picture URL
    """
    if not picture_url.startswith(_GOOGLE_AVATAR_URL_PREFIX):
        logger.warning(f"Skipping non-Google avatar URL for player {player_id}")
        return

    # Download with size limit
    async with httpx.AsyncClient(follow_redirects=False) as client:
        resp = await client.get(picture_url, timeout=10.0)
        if resp.status_code != 200:
            return
        if len(resp.content) > _GOOGLE_AVATAR_MAX_BYTES:
            logger.warning(
                f"Google avatar too large for player {player_id}: {len(resp.content)} bytes"
            )
            return
        image_bytes = resp.content

    # Process and upload
    loop = asyncio.get_running_loop()
    processed = await loop.run_in_executor(None, avatar_service.process_avatar, image_bytes)
    avatar_url = await loop.run_in_executor(None, s3_service.upload_avatar, player_id, processed)

    # Update player record
    result = await session.execute(select(Player).where(Player.id == player_id))
    player_obj = result.scalar_one_or_none()
    if player_obj:
        player_obj.profile_picture_url = avatar_url
        player_obj.avatar = avatar_url
        await session.commit()


# ---------------------------------------------------------------------------
# Provider-linking helpers (module-level so tests can monkeypatch them)
# ---------------------------------------------------------------------------


async def _set_google_id(session: AsyncSession, user_id: int, google_id: str) -> bool:
    """
    Write google_id onto a user row without changing auth_provider.

    Linking a secondary provider does not change the user's primary sign-in
    method; only the foreign-key column is updated.

    Args:
        session: Database session.
        user_id: ID of the user receiving the link.
        google_id: Google's ``sub`` claim to store.
    """
    result = await session.execute(
        update(User)
        .where(
            User.id == user_id,
            or_(User.google_id.is_(None), User.google_id == google_id),
        )
        .values(google_id=google_id, updated_at=func.now())
    )
    await session.flush()
    return result.rowcount == 1


async def _set_apple_id(session: AsyncSession, user_id: int, apple_id: str) -> bool:
    """
    Write apple_id onto a user row without changing auth_provider.

    Linking a secondary provider does not change the user's primary sign-in
    method; only the foreign-key column is updated.

    Args:
        session: Database session.
        user_id: ID of the user receiving the link.
        apple_id: Apple's ``sub`` claim to store.
    """
    result = await session.execute(
        update(User)
        .where(
            User.id == user_id,
            or_(User.apple_id.is_(None), User.apple_id == apple_id),
        )
        .values(apple_id=apple_id, updated_at=func.now())
    )
    await session.flush()
    return result.rowcount == 1


async def _capture_apple_refresh_token(
    session: AsyncSession,
    *,
    user_id: int,
    apple_id: str,
    authorization_code: str,
    client_id: str | None = None,
) -> None:
    """Exchange Apple's one-time code and retain an encrypted revocation token."""
    try:
        token_response = await apple_token_service.exchange_authorization_code(
            authorization_code, client_id
        )
        exchanged_identity = auth_service.verify_apple_id_token(token_response["id_token"])
        if exchanged_identity["sub"] != apple_id:
            raise ValueError("Apple authorization code belongs to a different account")
        exchanged_client_id = exchanged_identity.get("aud") or client_id
        if client_id is not None and exchanged_client_id != client_id:
            raise ValueError("Apple authorization code audience does not match")
        if not exchanged_client_id:
            raise ValueError("Apple authorization code audience is missing")
        ciphertext = apple_token_service.encrypt_refresh_credential(
            token_response["refresh_token"], exchanged_client_id
        )
        await user_service.store_apple_refresh_token(session, user_id, ciphertext)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except (
        apple_token_service.AppleConfigurationError,
        apple_token_service.AppleProviderError,
    ) as exc:
        logger.warning("Unable to capture Apple revocation credential: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Apple sign-in is temporarily unavailable. Please try again.",
        ) from exc


def _provider_link_error(status_code: int, code: str, message: str) -> HTTPException:
    """Build the public, non-secret provider-link error contract."""
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


class _ProviderAlreadyConnectedError(RuntimeError):
    """A concurrent request attached a different identity to this account."""


def _provider_already_connected_error(provider: str) -> HTTPException:
    return _provider_link_error(
        409,
        "PROVIDER_ALREADY_CONNECTED",
        f"This Beach League account already has a different {provider} account connected.",
    )


def _raise_provider_verification_error(provider: str, exc: ValueError) -> None:
    """Map internal token failures to stable diagnostics without token details."""
    if isinstance(exc, auth_service.ProviderConfigurationError):
        status_code = 503
        code = "PROVIDER_LINK_CONFIG"
        message = "Account linking is not configured for this provider."
    elif isinstance(exc, auth_service.ProviderAudienceError):
        status_code = 401
        code = "PROVIDER_LINK_AUDIENCE"
        message = "The provider token was issued for an unsupported application."
    elif isinstance(exc, auth_service.ProviderVerificationUnavailableError):
        status_code = 503
        code = "PROVIDER_LINK_VERIFICATION_UNAVAILABLE"
        message = "The provider token could not be verified right now."
    else:
        status_code = 401
        code = "PROVIDER_LINK_TOKEN_INVALID"
        message = "The provider token could not be verified."
    logger.warning("Provider link rejected provider=%s code=%s", provider, code)
    raise _provider_link_error(status_code, code, message) from exc


def _build_user_response(
    user: dict, moderation: dict | None = None, *, is_system_admin: bool = False
) -> UserResponse:
    """
    Construct a ``UserResponse`` from a user dict, populating all optional flags.

    Centralises flag derivation so every endpoint returns a consistent shape.

    Args:
        user: User dict as returned by ``user_service.get_user_by_id`` /
            ``get_current_user``.

    Returns:
        Fully-populated ``UserResponse``.
    """
    moderation_status = (moderation or {}).get(
        "account_status", user_service.effective_moderation_status(user)
    )
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
            (moderation or {}).get("account_expires_at", user.get("moderation_expires_at"))
            if moderation_status != "active"
            else None
        ),
        moderation_case_id=(
            (moderation or {}).get("account_case_id", user.get("moderation_case_id"))
            if moderation_status != "active"
            else None
        ),
        interaction_restricted_until=(moderation or {}).get("interaction_restricted_until"),
        interaction_restriction_case_id=(moderation or {}).get("interaction_restriction_case_id"),
        is_system_admin=is_system_admin,
        age_group=user.get("age_group"),
        eligibility_country=user.get("eligibility_country"),
        eligibility_region=user.get("eligibility_region"),
        guardian_consent=user.get("guardian_consent"),
    )


@router.post("/api/auth/send-verification", response_model=Dict[str, Any])
async def send_verification(
    request: Request, payload: CheckPhoneRequest, session: AsyncSession = Depends(get_db_session)
):
    """Send SMS verification code to phone number."""
    try:
        started_at = time.monotonic()
        phone_number = auth_service.normalize_phone_number(payload.phone_number)
        reservation = await rate_limiting_service.reserve_code_delivery(
            request, phone_number, channel="sms"
        )
        user = await user_service.get_user_by_phone(session, phone_number)
        pending = None
        if not user:
            pending = await user_service.get_pending_verification_data(
                session, phone_number=phone_number
            )
        if not user and not pending:
            await auth_delivery_service.enqueue_noop(session, channel="sms", purpose="login")
            await rate_limiting_service.release_network_delivery(reservation)
            await rate_limiting_service.clear_verification_failures(phone_number)
            return await _delivery_response(
                started_at, {"status": "success", "message": _GENERIC_SIGNUP_MESSAGE}
            )

        code = auth_service.generate_verification_code()

        success = await user_service.create_verification_code(
            session=session,
            phone_number=phone_number,
            code=code,
            password_hash=(pending or {}).get("password_hash"),
            name=(pending or {}).get("name"),
            email=(pending or {}).get("email"),
            youth_facts=(pending or {}).get("youth_facts"),
            delivery_channel="sms",
            delivery_purpose="login",
        )
        if not success:
            await rate_limiting_service.release_code_delivery(reservation)
            raise HTTPException(status_code=500, detail="Failed to create verification code")

        await rate_limiting_service.clear_verification_failures(phone_number)

        return await _delivery_response(
            started_at, {"status": "success", "message": _GENERIC_SIGNUP_MESSAGE}
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error sending verification")
        raise HTTPException(
            status_code=500, detail="Error sending verification. Please try again."
        )


@router.post("/api/auth/send-email-verification", response_model=Dict[str, Any])
async def send_email_verification(
    request: Request,
    payload: ResetPasswordEmailRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Resend a pending email-signup code without disclosing account state."""
    started_at = time.monotonic()
    email = auth_service.normalize_email(payload.email)
    reservation = await rate_limiting_service.reserve_code_delivery(
        request, email, channel="email"
    )
    pending = await user_service.get_pending_verification_data(session, email=email)
    if await user_service.check_email_exists(session, email) or not pending:
        await auth_delivery_service.enqueue_noop(session, channel="email", purpose="signup")
        await rate_limiting_service.release_network_delivery(reservation)
        await rate_limiting_service.clear_verification_failures(email)
        return await _delivery_response(
            started_at, {"status": "success", "message": _GENERIC_SIGNUP_MESSAGE}
        )

    code = auth_service.generate_verification_code()
    created = await user_service.create_verification_code(
        session=session,
        phone_number=None,
        code=code,
        password_hash=pending.get("password_hash"),
        name=pending.get("name"),
        email=email,
        youth_facts=pending.get("youth_facts"),
        delivery_channel="email",
        delivery_purpose="signup",
    )
    if not created:
        await rate_limiting_service.release_code_delivery(reservation)
        raise HTTPException(status_code=500, detail="Failed to create verification code")
    await rate_limiting_service.clear_verification_failures(email)
    return await _delivery_response(
        started_at, {"status": "success", "message": _GENERIC_SIGNUP_MESSAGE}
    )


@router.post("/api/auth/verify-phone", response_model=AuthResponse)
async def verify_phone(
    request: Request, payload: VerifyPhoneRequest, session: AsyncSession = Depends(get_db_session)
):
    """Verify phone number with code (for signup)."""
    try:
        phone_number = auth_service.normalize_phone_number(payload.phone_number)
        await rate_limiting_service.ensure_verification_available(request, phone_number)

        signup_data = await user_service.verify_and_mark_code_used(
            session, phone_number, payload.code
        )
        if not signup_data:
            await _record_bad_code(
                session,
                phone_number,
                phone_number=phone_number,
            )
            raise INVALID_VERIFICATION_CODE_RESPONSE

        is_signup = signup_data.get("password_hash") is not None

        if is_signup:
            try:
                user_id = await user_service.create_user(
                    session=session,
                    phone_number=phone_number,
                    password_hash=signup_data["password_hash"],
                    email=signup_data.get("email"),
                    youth_facts=signup_data.get("youth_facts"),
                )

                full_name = signup_data.get("name")
                if full_name:
                    player = await data_service.upsert_user_player(
                        session=session, user_id=user_id, full_name=full_name
                    )
                    if not player:
                        logger.error(f"Failed to create player profile for user {user_id}")

                user = await user_service.get_user_by_id(session, user_id)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
        else:
            user = await user_service.get_user_by_phone(session, phone_number)
            if not user:
                raise INVALID_CREDENTIALS_RESPONSE
        await rate_limiting_service.clear_verification_failures(phone_number)

        await _maybe_cancel_deletion(session, user)

        access_token, refresh_token = await _issue_tokens(session, user)
        profile_complete = await _check_profile_complete(session, user["id"])

        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user_id=user["id"],
            phone_number=user.get("phone_number"),
            is_verified=user["is_verified"],
            auth_provider=user.get("auth_provider", "phone"),
            profile_complete=profile_complete,
            is_new_user=is_signup,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error verifying phone")
        raise HTTPException(status_code=500, detail="Error verifying phone. Please try again.")


def _mask_phone_for_log(phone_number: str) -> str:
    """Mask all but the last 4 digits of a phone number for safe logging."""
    if not phone_number:
        return ""
    if len(phone_number) <= 4:
        return "*" * len(phone_number)
    return "*" * (len(phone_number) - 4) + phone_number[-4:]


@router.post("/api/auth/phone/add/request", response_model=Dict[str, Any])
async def add_phone_request(
    request: Request,
    payload: PhoneAddRequest,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Start the one-time add-phone OTP flow for the authenticated user.

    The user must not already have a phone number on file; phone changes are
    handled via support email, not self-service.
    """
    if current_user.get("phone_number"):
        raise HTTPException(
            status_code=400,
            detail="Phone already set. Contact support to change.",
        )

    try:
        phone_number = auth_service.normalize_phone_number(payload.phone_number)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    reservation = await rate_limiting_service.reserve_code_delivery(
        request, phone_number, channel="sms"
    )
    if await user_service.check_phone_exists(session, phone_number):
        await rate_limiting_service.release_code_delivery(reservation)
        raise HTTPException(status_code=409, detail="This number cannot be added.")

    code = auth_service.generate_verification_code()
    created = await user_service.create_verification_code(
        session=session,
        phone_number=phone_number,
        code=code,
        delivery_channel="sms",
        delivery_purpose="phone_add",
    )
    if not created:
        await rate_limiting_service.release_code_delivery(reservation)
        raise HTTPException(status_code=500, detail="Failed to create verification code")

    await rate_limiting_service.clear_verification_failures(phone_number)

    logger.info(
        "phone_add_request user=%s phone=%s",
        current_user["id"],
        _mask_phone_for_log(phone_number),
    )
    return {"status": "success"}


@router.post("/api/auth/phone/add/verify", response_model=UserResponse)
async def add_phone_verify(
    request: Request,
    payload: PhoneAddVerify,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Complete the add-phone OTP flow and attach the phone to the current user.
    """
    if current_user.get("phone_number"):
        raise HTTPException(
            status_code=400,
            detail="Phone already set. Contact support to change.",
        )

    try:
        phone_number = auth_service.normalize_phone_number(payload.phone_number)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    await rate_limiting_service.ensure_verification_available(request, phone_number)
    signup_data = await user_service.verify_and_mark_code_used(session, phone_number, payload.code)
    if signup_data is None:
        await _record_bad_code(session, phone_number, phone_number=phone_number)
        raise HTTPException(status_code=400, detail="Invalid or expired code.")
    await rate_limiting_service.clear_verification_failures(phone_number)

    # Race re-check: another account may have claimed this phone between request
    # and verify.
    if await user_service.check_phone_exists(session, phone_number):
        raise HTTPException(status_code=409, detail="This number cannot be added.")

    attached = await user_service.add_phone_number(session, current_user["id"], phone_number)
    if not attached:
        raise HTTPException(status_code=500, detail="Failed to attach phone number.")

    logger.info(
        "phone_add_verify user=%s phone=%s",
        current_user["id"],
        _mask_phone_for_log(phone_number),
    )

    updated_user = await user_service.get_user_by_id(session, current_user["id"])
    if not updated_user:
        raise HTTPException(status_code=500, detail="Failed to load updated user.")

    return _build_user_response(updated_user)


@router.post("/api/auth/verify-email", response_model=AuthResponse)
async def verify_email(
    request: Request,
    payload: EmailVerifyRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Verify email with code (for email-based signup)."""
    try:
        email = auth_service.normalize_email(payload.email)
        await rate_limiting_service.ensure_verification_available(request, email)

        signup_data = await user_service.verify_and_mark_email_code_used(
            session, email, payload.code
        )
        if not signup_data:
            await _record_bad_code(session, email, email=email)
            raise INVALID_VERIFICATION_CODE_RESPONSE

        is_signup = signup_data.get("password_hash") is not None
        if not is_signup:
            # Email-verify is only used for signup today; reset uses a separate route.
            raise INVALID_VERIFICATION_CODE_RESPONSE

        try:
            user_id = await user_service.create_user(
                session=session,
                phone_number=None,
                password_hash=signup_data["password_hash"],
                email=email,
                youth_facts=signup_data.get("youth_facts"),
            )

            full_name = signup_data.get("name")
            if full_name:
                player = await data_service.upsert_user_player(
                    session=session, user_id=user_id, full_name=full_name
                )
                if not player:
                    logger.error(f"Failed to create player profile for user {user_id}")

            user = await user_service.get_user_by_id(session, user_id)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        await rate_limiting_service.clear_verification_failures(email)
        await _maybe_cancel_deletion(session, user)

        access_token, refresh_token = await _issue_tokens(session, user)
        profile_complete = await _check_profile_complete(session, user["id"])

        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user_id=user["id"],
            phone_number=user.get("phone_number"),
            is_verified=user["is_verified"],
            auth_provider=user.get("auth_provider", "email"),
            profile_complete=profile_complete,
            is_new_user=True,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error verifying email")
        raise HTTPException(status_code=500, detail="Error verifying email. Please try again.")


@router.post("/api/auth/reset-password", response_model=Dict[str, Any])
async def reset_password(
    request: Request,
    payload: ResetPasswordRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Initiate password reset by sending verification code."""
    try:
        started_at = time.monotonic()
        phone_number = auth_service.normalize_phone_number(payload.phone_number)
        reservation = await rate_limiting_service.reserve_code_delivery(
            request, phone_number, channel="sms"
        )

        user = await user_service.get_user_by_phone(session, phone_number)
        if not user:
            await auth_delivery_service.enqueue_noop(
                session, channel="sms", purpose="password_reset"
            )
            await rate_limiting_service.release_network_delivery(reservation)
            await rate_limiting_service.clear_verification_failures(phone_number)
            return await _delivery_response(
                started_at,
                {
                    "status": "success",
                    "message": "If an account exists with this phone number, a verification code has been sent.",
                },
            )

        code = auth_service.generate_verification_code()
        success = await user_service.create_verification_code(
            session=session,
            phone_number=phone_number,
            code=code,
            delivery_channel="sms",
            delivery_purpose="password_reset",
        )
        if not success:
            await rate_limiting_service.release_code_delivery(reservation)
            raise HTTPException(status_code=500, detail="Failed to create verification code")

        await rate_limiting_service.clear_verification_failures(phone_number)

        return await _delivery_response(
            started_at,
            {
                "status": "success",
                "message": "If an account exists with this phone number, a verification code has been sent.",
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error initiating password reset")
        raise HTTPException(
            status_code=500, detail="Error initiating password reset. Please try again."
        )


@router.post("/api/auth/reset-password-verify", response_model=Dict[str, Any])
async def reset_password_verify(
    request: Request,
    payload: ResetPasswordVerifyRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Verify code for password reset and return a reset token."""
    try:
        phone_number = auth_service.normalize_phone_number(payload.phone_number)
        await rate_limiting_service.ensure_verification_available(request, phone_number)

        code_result = await user_service.verify_and_mark_code_used(
            session, phone_number, payload.code
        )
        if not code_result:
            await _record_bad_code(session, phone_number, phone_number=phone_number)
            raise INVALID_VERIFICATION_CODE_RESPONSE

        user = await user_service.get_user_by_phone(session, phone_number)
        if not user:
            raise INVALID_VERIFICATION_CODE_RESPONSE
        await rate_limiting_service.clear_verification_failures(phone_number)

        reset_token = auth_service.generate_refresh_token()
        expires_at = utcnow() + timedelta(hours=1)

        success = await user_service.create_password_reset_token(
            session, user["id"], reset_token, expires_at
        )
        if not success:
            raise HTTPException(status_code=500, detail="Failed to create reset token")

        return {
            "status": "success",
            "reset_token": reset_token,
            "message": "Verification code verified. You can now set your new password.",
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error verifying reset code")
        raise HTTPException(
            status_code=500, detail="Error verifying reset code. Please try again."
        )


@router.post("/api/auth/reset-password-email", response_model=Dict[str, Any])
async def reset_password_email(
    request: Request,
    payload: ResetPasswordEmailRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Initiate password reset by sending a verification code to the user's email."""
    try:
        started_at = time.monotonic()
        email = auth_service.normalize_email(payload.email)
        reservation = await rate_limiting_service.reserve_code_delivery(
            request, email, channel="email"
        )

        user = await user_service.get_user_by_email(session, email)
        if not user:
            await auth_delivery_service.enqueue_noop(
                session, channel="email", purpose="password_reset"
            )
            await rate_limiting_service.release_network_delivery(reservation)
            # Do not leak whether the email is registered.
            await rate_limiting_service.clear_verification_failures(email)
            return await _delivery_response(
                started_at,
                {
                    "status": "success",
                    "message": "If an account exists with this email, a verification code has been sent.",
                },
            )

        code = auth_service.generate_verification_code()
        success = await user_service.create_verification_code(
            session=session,
            phone_number=None,
            code=code,
            email=email,
            delivery_channel="email",
            delivery_purpose="password_reset",
        )
        if not success:
            await rate_limiting_service.release_code_delivery(reservation)
            raise HTTPException(status_code=500, detail="Failed to create verification code")

        await rate_limiting_service.clear_verification_failures(email)

        return await _delivery_response(
            started_at,
            {
                "status": "success",
                "message": "If an account exists with this email, a verification code has been sent.",
            },
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error initiating email password reset")
        raise HTTPException(
            status_code=500, detail="Error initiating password reset. Please try again."
        )


@router.post("/api/auth/reset-password-email-verify", response_model=Dict[str, Any])
async def reset_password_email_verify(
    request: Request,
    payload: ResetPasswordEmailVerifyRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Verify an email reset code and return a short-lived reset token."""
    try:
        email = auth_service.normalize_email(payload.email)
        await rate_limiting_service.ensure_verification_available(request, email)

        code_result = await user_service.verify_and_mark_email_code_used(
            session, email, payload.code
        )
        if not code_result:
            await _record_bad_code(session, email, email=email)
            raise INVALID_VERIFICATION_CODE_RESPONSE

        user = await user_service.get_user_by_email(session, email)
        if not user:
            raise INVALID_VERIFICATION_CODE_RESPONSE
        await rate_limiting_service.clear_verification_failures(email)

        reset_token = auth_service.generate_refresh_token()
        expires_at = utcnow() + timedelta(hours=1)

        success = await user_service.create_password_reset_token(
            session, user["id"], reset_token, expires_at
        )
        if not success:
            raise HTTPException(status_code=500, detail="Failed to create reset token")

        return {
            "status": "success",
            "reset_token": reset_token,
            "message": "Verification code verified. You can now set your new password.",
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error verifying email reset code")
        raise HTTPException(
            status_code=500, detail="Error verifying reset code. Please try again."
        )


@router.post("/api/auth/reset-password-confirm", response_model=AuthResponse)
@limiter.limit("10/minute")
async def reset_password_confirm(
    request: Request,
    payload: ResetPasswordConfirmRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Confirm password reset with token and set new password. Automatically logs the user in."""
    try:
        auth_service.validate_password_length(payload.new_password)

        user_id = await user_service.verify_and_use_password_reset_token(
            session, payload.reset_token
        )
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid or expired reset token")

        user = await user_service.get_user_by_id(session, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        new_password_hash = auth_service.hash_password(payload.new_password)
        success = await user_service.update_user_password(session, user_id, new_password_hash)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to update password")

        # A password reset is an account-recovery boundary. Revoke every
        # existing refresh session before issuing the replacement session so a
        # previously stolen token cannot survive the reset. The revocation and
        # password update are committed atomically by _issue_tokens.
        await user_service.delete_user_refresh_tokens(session, user_id)

        updated_user = await user_service.get_user_by_id(session, user_id)
        if not updated_user:
            raise HTTPException(status_code=404, detail="User not found")

        # _issue_tokens writes a refresh token and commits the password update
        # and prior-session revocation in the same transaction.
        access_token, refresh_token = await _issue_tokens(session, updated_user)

        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user_id=updated_user["id"],
            phone_number=updated_user.get("phone_number"),
            is_verified=updated_user["is_verified"],
            auth_provider=updated_user.get("auth_provider", "phone"),
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error resetting password")
        raise HTTPException(status_code=500, detail="Error resetting password. Please try again.")


@router.post("/api/auth/sms-login", response_model=AuthResponse)
async def sms_login(
    request: Request, payload: SMSLoginRequest, session: AsyncSession = Depends(get_db_session)
):
    """Passwordless login with SMS verification code."""
    try:
        phone_number = auth_service.normalize_phone_number(payload.phone_number)
        await rate_limiting_service.ensure_verification_available(request, phone_number)

        if not await user_service.verify_and_mark_code_used(session, phone_number, payload.code):
            await _record_bad_code(session, phone_number, phone_number=phone_number)
            raise INVALID_VERIFICATION_CODE_RESPONSE

        user = await user_service.get_user_by_phone(session, phone_number)
        if not user:
            raise INVALID_VERIFICATION_CODE_RESPONSE
        await rate_limiting_service.clear_verification_failures(phone_number)

        await _maybe_cancel_deletion(session, user)

        access_token, refresh_token = await _issue_tokens(session, user)

        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user_id=user["id"],
            phone_number=user.get("phone_number"),
            is_verified=user["is_verified"],
            auth_provider=user.get("auth_provider", "phone"),
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error during SMS login")
        raise HTTPException(status_code=500, detail="Error during SMS login. Please try again.")


@router.get("/api/auth/check-phone")
async def check_phone(phone_number: str):
    """Retired because account-discovery responses enable enumeration."""
    del phone_number
    raise HTTPException(status_code=410, detail="This endpoint is no longer available.")


@router.post("/api/auth/refresh", response_model=RefreshTokenResponse)
async def refresh_token(
    request: RefreshTokenRequest, session: AsyncSession = Depends(get_db_session)
):
    """Refresh access token and rotate refresh token."""
    try:
        refresh_token_record = await user_service.get_refresh_token(session, request.refresh_token)
        if not refresh_token_record:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        expires_at = datetime.fromisoformat(refresh_token_record["expires_at"])
        if utcnow() > expires_at:
            await user_service.delete_refresh_token(session, request.refresh_token)
            raise HTTPException(status_code=401, detail="Refresh token has expired")

        user = await user_service.get_user_by_id(session, refresh_token_record["user_id"])
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        if int(refresh_token_record.get("session_version", 0)) != int(
            user.get("session_version", 0)
        ):
            await user_service.delete_refresh_token(session, request.refresh_token)
            await session.commit()
            raise HTTPException(
                status_code=401,
                detail="Session expired. Please sign in again.",
            )

        # Atomic rotation: delete old + create new in one transaction.
        # delete_refresh_token uses flush (not commit) so both ops share the same txn.
        await user_service.delete_refresh_token(session, request.refresh_token)

        # Issue new access + refresh tokens (create_refresh_token commits the txn)
        access_token, new_refresh_token = await _issue_tokens(session, user)

        return RefreshTokenResponse(
            access_token=access_token,
            refresh_token=new_refresh_token,
            token_type="bearer",
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error refreshing token")
        raise HTTPException(status_code=500, detail="Error refreshing token. Please try again.")


@router.post("/api/auth/logout")
async def logout(
    current_user: dict = Depends(get_current_user), session: AsyncSession = Depends(get_db_session)
):
    """Logout the current user by invalidating all refresh tokens."""
    try:
        await user_service.delete_user_refresh_tokens(session, current_user["id"])
        await session.commit()
        return {"status": "success", "message": "Logged out successfully"}
    except Exception:
        logger.exception("Error during logout")
        raise HTTPException(status_code=500, detail="Error during logout. Please try again.")


@router.get("/api/auth/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Get current authenticated user information."""
    moderation = await moderation_service.account_status(session, current_user["id"])
    from backend.services import role_service

    is_admin = await role_service.is_system_admin(session, current_user["id"])
    return _build_user_response(current_user, moderation, is_system_admin=is_admin)


@router.post("/api/auth/google/add", response_model=UserResponse)
async def add_google_provider(
    payload: LinkProviderRequest,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Link a Google account to the currently authenticated user.

    Verifies the supplied Google ID token, then:
    1. If the token's ``sub`` already belongs to a different user → 409.
    2. If already linked to this user → idempotent 200.
    3. Otherwise → write ``google_id`` and return the updated ``UserResponse``.

    Linking a secondary provider does NOT change ``auth_provider`` — the
    user's primary sign-in method is preserved.
    """
    try:
        google_info = auth_service.verify_google_id_token(payload.id_token)
    except ValueError as exc:
        _raise_provider_verification_error("google", exc)

    google_id = google_info["sub"]

    attached_google_id = current_user.get("google_id")
    if attached_google_id is not None and attached_google_id != google_id:
        raise _provider_already_connected_error("Google")

    # Check whether this Google ID already belongs to another account.
    existing = await user_service.get_user_by_google_id(session, google_id)
    if existing and existing["id"] != current_user["id"]:
        raise _provider_link_error(
            409,
            "PROVIDER_LINK_CONFLICT",
            "This Google account is already linked to a different Beach League account.",
        )

    # Idempotent: already linked to this user — skip the write.
    if not existing:
        try:
            if not await _set_google_id(session, current_user["id"], google_id):
                raise _ProviderAlreadyConnectedError
            await session.commit()
        except _ProviderAlreadyConnectedError as exc:
            await session.rollback()
            logger.warning(
                "Provider replacement rejected provider=google code=PROVIDER_ALREADY_CONNECTED"
            )
            raise _provider_already_connected_error("Google") from exc
        except IntegrityError as exc:
            await session.rollback()
            logger.warning("Provider link conflict provider=google code=PROVIDER_LINK_CONFLICT")
            raise _provider_link_error(
                409,
                "PROVIDER_LINK_CONFLICT",
                "This Google account is already linked to a different Beach League account.",
            ) from exc
        except Exception as exc:
            await session.rollback()
            logger.exception("Provider link persistence failed provider=google")
            raise _provider_link_error(
                500,
                "PROVIDER_LINK_PERSISTENCE",
                "The Google account could not be linked.",
            ) from exc

    updated_user = await user_service.get_user_by_id(session, current_user["id"])
    if not updated_user:
        raise HTTPException(status_code=500, detail="Failed to load updated user.")

    return _build_user_response(updated_user)


@router.post("/api/auth/apple/add", response_model=UserResponse)
async def add_apple_provider(
    payload: LinkProviderRequest,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Link an Apple account to the currently authenticated user.

    Verifies the supplied Apple ID token, then:
    1. If the token's ``sub`` already belongs to a different user → 409.
    2. If already linked to this user → idempotent 200.
    3. Otherwise → write ``apple_id`` and return the updated ``UserResponse``.

    Linking a secondary provider does NOT change ``auth_provider`` — the
    user's primary sign-in method is preserved.
    """
    try:
        apple_info = auth_service.verify_apple_id_token(payload.id_token)
    except ValueError as exc:
        _raise_provider_verification_error("apple", exc)

    apple_id = apple_info["sub"]

    attached_apple_id = current_user.get("apple_id")
    if attached_apple_id is not None and attached_apple_id != apple_id:
        raise _provider_already_connected_error("Apple")

    # Check whether this Apple ID already belongs to another account.
    existing = await user_service.get_user_by_apple_id(session, apple_id)
    if existing and existing["id"] != current_user["id"]:
        raise _provider_link_error(
            409,
            "PROVIDER_LINK_CONFLICT",
            "This Apple account is already linked to a different Beach League account.",
        )

    # Idempotent: a repeat link for the same user succeeds without consuming
    # another one-time Apple authorization code or changing stored state.
    if not existing:
        try:
            # Exchange and stage the revocation credential before the provider
            # ID. Both writes are flushed and then committed together below.
            if payload.authorization_code:
                await _capture_apple_refresh_token(
                    session,
                    user_id=current_user["id"],
                    apple_id=apple_id,
                    authorization_code=payload.authorization_code,
                    client_id=apple_info.get("aud"),
                )
            if not await _set_apple_id(session, current_user["id"], apple_id):
                raise _ProviderAlreadyConnectedError
            await session.commit()
        except _ProviderAlreadyConnectedError as exc:
            await session.rollback()
            logger.warning(
                "Provider replacement rejected provider=apple code=PROVIDER_ALREADY_CONNECTED"
            )
            raise _provider_already_connected_error("Apple") from exc
        except HTTPException as exc:
            await session.rollback()
            logger.warning("Provider link rejected provider=apple code=APPLE_LINK_CODE_EXCHANGE")
            raise _provider_link_error(
                503,
                "APPLE_LINK_CODE_EXCHANGE",
                "Apple authorization could not be completed securely.",
            ) from exc
        except IntegrityError as exc:
            await session.rollback()
            logger.warning("Provider link conflict provider=apple code=PROVIDER_LINK_CONFLICT")
            raise _provider_link_error(
                409,
                "PROVIDER_LINK_CONFLICT",
                "This Apple account is already linked to a different Beach League account.",
            ) from exc
        except Exception as exc:
            await session.rollback()
            logger.exception("Provider link persistence failed provider=apple")
            raise _provider_link_error(
                500,
                "PROVIDER_LINK_PERSISTENCE",
                "The Apple account could not be linked.",
            ) from exc

    updated_user = await user_service.get_user_by_id(session, current_user["id"])
    if not updated_user:
        raise HTTPException(status_code=500, detail="Failed to load updated user.")

    return _build_user_response(updated_user)


@router.post("/api/auth/change-password", response_model=ChangePasswordResponse)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Change the authenticated user's password.

    Verifies the current password, then replaces it with the new one.
    Every prior access and refresh session is invalidated. Replacement tokens
    keep the device performing the change signed in.

    Returns the ISO-8601 timestamp at which the password was changed.
    """
    try:
        # OAuth-only users have no password hash — they must use password reset first.
        if not current_user.get("password_hash"):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Your account uses social sign-in. Set a password via password reset first."
                ),
            )

        auth_service.validate_password_length(payload.new_password)

        if not auth_service.verify_password(
            payload.current_password, current_user["password_hash"]
        ):
            raise HTTPException(status_code=401, detail="Current password is incorrect")

        new_password_hash = auth_service.hash_password(payload.new_password)
        success = await user_service.update_user_password(
            session, current_user["id"], new_password_hash
        )
        if not success:
            raise HTTPException(status_code=500, detail="Failed to update password")

        # Revoke all refresh tokens so other sessions are invalidated.
        # Both writes share a single transaction so the password change and
        # session invalidation either both commit or both roll back.
        await user_service.delete_user_refresh_tokens(session, current_user["id"])

        # Re-fetch the incremented session version before issuing replacement
        # credentials. _issue_tokens commits the entire transaction.
        updated_user = await user_service.get_user_by_id(session, current_user["id"])
        if not updated_user:
            raise HTTPException(status_code=500, detail="Failed to load updated user")
        password_changed_at = updated_user.get("password_changed_at") or utcnow().isoformat()
        access_token, refresh_token = await _issue_tokens(session, updated_user)

        return ChangePasswordResponse(
            status="success",
            password_changed_at=password_changed_at,
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error changing password")
        raise HTTPException(status_code=500, detail="Error changing password. Please try again.")
