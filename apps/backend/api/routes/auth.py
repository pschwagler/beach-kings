"""Authentication route handlers."""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.routes import limiter, INVALID_CREDENTIALS_RESPONSE, INVALID_VERIFICATION_CODE_RESPONSE
from backend.database.db import get_db_session
from backend.services import auth_service, user_service, data_service, rate_limiting_service
from backend.api.auth_dependencies import get_current_user
from backend.models.schemas import (
    SignupRequest,
    LoginRequest,
    SMSLoginRequest,
    VerifyPhoneRequest,
    CheckPhoneRequest,
    AuthResponse,
    CheckPhoneResponse,
    UserResponse,
    RefreshTokenRequest,
    RefreshTokenResponse,
    ResetPasswordRequest,
    ResetPasswordVerifyRequest,
    ResetPasswordConfirmRequest,
)
from backend.utils.datetime_utils import utcnow

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/api/auth/signup", response_model=Dict[str, Any])
async def signup(request: SignupRequest, session: AsyncSession = Depends(get_db_session)):
    """
    Start signup process by storing signup data and sending verification code.
    Account is only created after phone verification.
    """
    try:
        phone_number = auth_service.normalize_phone_number(request.phone_number)
        if await user_service.check_phone_exists(session, phone_number):
            raise HTTPException(status_code=400, detail="Phone number is already registered")
        if len(request.password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
        if not any(char.isdigit() for char in request.password):
            raise HTTPException(status_code=400, detail="Password must include at least one number")
        if not request.full_name or not request.full_name.strip():
            raise HTTPException(status_code=400, detail="Full name is required")

        email = None
        if request.email:
            email = auth_service.normalize_email(request.email)

        password_hash = auth_service.hash_password(request.password)
        code = auth_service.generate_verification_code()

        success = await user_service.create_verification_code(
            session=session,
            phone_number=phone_number,
            code=code,
            password_hash=password_hash,
            name=request.full_name.strip(),
            email=email,
        )
        if not success:
            raise HTTPException(status_code=500, detail="Failed to create verification code")

        sms_sent = await auth_service.send_sms_verification(session, phone_number, code)
        if not sms_sent:
            raise HTTPException(status_code=500, detail="Failed to send SMS. Please check Twilio configuration.")

        return {
            "status": "success",
            "message": "Verification code sent. Please verify your phone number to complete signup.",
            "phone_number": phone_number,
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during signup: {str(e)}")


@router.post("/api/auth/login", response_model=AuthResponse)
async def login(request: LoginRequest, session: AsyncSession = Depends(get_db_session)):
    """Login with phone number or email and password."""
    try:
        user = None
        if request.phone_number:
            phone_number = auth_service.normalize_phone_number(request.phone_number)
            user = await user_service.get_user_by_phone(session, phone_number)
        elif request.email:
            email = auth_service.normalize_email(request.email)
            user = await user_service.get_user_by_email(session, email)

        if not user:
            raise INVALID_CREDENTIALS_RESPONSE

        if not user.get("password_hash"):
            raise HTTPException(status_code=401, detail="Please contact support for help - NO_PASSWORD")

        if not auth_service.verify_password(request.password, user["password_hash"]):
            raise INVALID_CREDENTIALS_RESPONSE

        token_data = {"user_id": user["id"], "phone_number": user["phone_number"]}
        access_token = auth_service.create_access_token(data=token_data)

        refresh_token = auth_service.generate_refresh_token()
        expires_at = utcnow() + timedelta(days=auth_service.REFRESH_TOKEN_EXPIRATION_DAYS)
        await user_service.create_refresh_token(session, user["id"], refresh_token, expires_at)

        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user_id=user["id"],
            phone_number=user["phone_number"],
            is_verified=user["is_verified"],
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during login: {str(e)}")


@router.post("/api/auth/send-verification", response_model=Dict[str, Any])
@limiter.limit("10/minute")
async def send_verification(
    request: Request, payload: CheckPhoneRequest, session: AsyncSession = Depends(get_db_session)
):
    """Send SMS verification code to phone number."""
    try:
        phone_number = auth_service.normalize_phone_number(payload.phone_number)
        code = auth_service.generate_verification_code()

        success = await user_service.create_verification_code(
            session=session, phone_number=phone_number, code=code
        )
        if not success:
            raise HTTPException(status_code=500, detail="Failed to create verification code")

        sms_sent = await auth_service.send_sms_verification(session, phone_number, code)
        if not sms_sent:
            raise HTTPException(status_code=500, detail="Failed to send SMS. Please check Twilio configuration.")

        return {"status": "success", "message": "Verification code sent successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error sending verification: {str(e)}")


@router.post("/api/auth/verify-phone", response_model=AuthResponse)
@limiter.limit("10/minute")
async def verify_phone(
    request: Request, payload: VerifyPhoneRequest, session: AsyncSession = Depends(get_db_session)
):
    """Verify phone number with code (for signup)."""
    try:
        phone_number = auth_service.normalize_phone_number(payload.phone_number)

        signup_data = await user_service.verify_and_mark_code_used(
            session, phone_number, payload.code
        )
        if not signup_data:
            user = await user_service.get_user_by_phone(session, phone_number)
            if user:
                if user_service.is_account_locked(user):
                    raise HTTPException(
                        status_code=423,
                        detail="Account is temporarily locked due to too many failed attempts. Please try again later.",
                    )
                await user_service.increment_failed_attempts(session, phone_number)
            raise INVALID_VERIFICATION_CODE_RESPONSE

        is_signup = signup_data.get("password_hash") is not None

        if is_signup:
            try:
                user_id = await user_service.create_user(
                    session=session,
                    phone_number=phone_number,
                    password_hash=signup_data["password_hash"],
                    email=signup_data.get("email"),
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
            if user_service.is_account_locked(user):
                raise HTTPException(
                    status_code=423,
                    detail="Account is temporarily locked due to too many failed attempts. Please try again later.",
                )

        await user_service.reset_failed_attempts(session, user["id"])

        token_data = {"user_id": user["id"], "phone_number": user["phone_number"]}
        access_token = auth_service.create_access_token(data=token_data)

        refresh_token = auth_service.generate_refresh_token()
        expires_at = utcnow() + timedelta(days=auth_service.REFRESH_TOKEN_EXPIRATION_DAYS)
        await user_service.create_refresh_token(session, user["id"], refresh_token, expires_at)

        profile_complete = True
        player = await data_service.get_player_by_user_id(session, user["id"])
        if not player or not player.get("gender") or not player.get("level"):
            profile_complete = False

        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user_id=user["id"],
            phone_number=user["phone_number"],
            is_verified=user["is_verified"],
            profile_complete=profile_complete,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error verifying phone: {str(e)}")


@router.post("/api/auth/reset-password", response_model=Dict[str, Any])
async def reset_password(
    request: Request,
    payload: ResetPasswordRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Initiate password reset by sending verification code."""
    try:
        phone_number = auth_service.normalize_phone_number(payload.phone_number)
        await rate_limiting_service.check_phone_rate_limit(request, phone_number)

        user = await user_service.get_user_by_phone(session, phone_number)
        if not user:
            return {
                "status": "success",
                "message": "If an account exists with this phone number, a verification code has been sent.",
            }

        code = auth_service.generate_verification_code()
        success = await user_service.create_verification_code(
            session=session, phone_number=phone_number, code=code
        )
        if not success:
            raise HTTPException(status_code=500, detail="Failed to create verification code")

        sms_sent = await auth_service.send_sms_verification(session, phone_number, code)
        if not sms_sent:
            raise HTTPException(status_code=500, detail="Failed to send SMS. Please check Twilio configuration.")

        return {
            "status": "success",
            "message": "If an account exists with this phone number, a verification code has been sent.",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error initiating password reset: {str(e)}")


@router.post("/api/auth/reset-password-verify", response_model=Dict[str, Any])
async def reset_password_verify(
    request: Request,
    payload: ResetPasswordVerifyRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Verify code for password reset and return a reset token."""
    try:
        phone_number = auth_service.normalize_phone_number(payload.phone_number)
        await rate_limiting_service.check_phone_rate_limit(request, phone_number)

        user = await user_service.get_user_by_phone(session, phone_number)
        if not user:
            raise INVALID_CREDENTIALS_RESPONSE

        if user_service.is_account_locked(user):
            raise HTTPException(
                status_code=423,
                detail="Account is temporarily locked due to too many failed attempts. Please try again later.",
            )

        code_result = await user_service.verify_and_mark_code_used(
            session, phone_number, payload.code
        )
        if not code_result:
            await user_service.increment_failed_attempts(session, phone_number)
            raise INVALID_VERIFICATION_CODE_RESPONSE

        await user_service.reset_failed_attempts(session, user["id"])

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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error verifying reset code: {str(e)}")


@router.post("/api/auth/reset-password-confirm", response_model=AuthResponse)
@limiter.limit("10/minute")
async def reset_password_confirm(
    request: Request,
    payload: ResetPasswordConfirmRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Confirm password reset with token and set new password. Automatically logs the user in."""
    try:
        if len(payload.new_password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
        if not any(char.isdigit() for char in payload.new_password):
            raise HTTPException(status_code=400, detail="Password must include at least one number")

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

        token_data = {"user_id": user["id"], "phone_number": user["phone_number"]}
        access_token = auth_service.create_access_token(data=token_data)

        refresh_token = auth_service.generate_refresh_token()
        expires_at = utcnow() + timedelta(days=auth_service.REFRESH_TOKEN_EXPIRATION_DAYS)
        await user_service.create_refresh_token(session, user["id"], refresh_token, expires_at)

        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user_id=user["id"],
            phone_number=user["phone_number"],
            is_verified=user["is_verified"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error resetting password: {str(e)}")


@router.post("/api/auth/sms-login", response_model=AuthResponse)
@limiter.limit("10/minute")
async def sms_login(
    request: Request, payload: SMSLoginRequest, session: AsyncSession = Depends(get_db_session)
):
    """Passwordless login with SMS verification code."""
    try:
        phone_number = auth_service.normalize_phone_number(payload.phone_number)
        user = await user_service.get_user_by_phone(session, phone_number)
        if not user:
            raise INVALID_CREDENTIALS_RESPONSE

        if user_service.is_account_locked(user):
            raise HTTPException(
                status_code=423,
                detail="Account is temporarily locked due to too many failed attempts. Please try again later.",
            )

        if not await user_service.verify_and_mark_code_used(session, phone_number, payload.code):
            await user_service.increment_failed_attempts(session, phone_number)
            raise INVALID_VERIFICATION_CODE_RESPONSE

        await user_service.reset_failed_attempts(session, user["id"])

        token_data = {"user_id": user["id"], "phone_number": user["phone_number"]}
        access_token = auth_service.create_access_token(data=token_data)

        refresh_token = auth_service.generate_refresh_token()
        expires_at = utcnow() + timedelta(days=auth_service.REFRESH_TOKEN_EXPIRATION_DAYS)
        await user_service.create_refresh_token(session, user["id"], refresh_token, expires_at)

        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user_id=user["id"],
            phone_number=user["phone_number"],
            is_verified=user["is_verified"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during SMS login: {str(e)}")


@router.get("/api/auth/check-phone", response_model=CheckPhoneResponse)
async def check_phone(phone_number: str, session: AsyncSession = Depends(get_db_session)):
    """Check if phone number exists in the system."""
    try:
        normalized_phone = auth_service.normalize_phone_number(phone_number)
        user = await user_service.get_user_by_phone(session, normalized_phone)
        return CheckPhoneResponse(
            exists=user is not None, is_verified=user.get("is_verified", False)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking phone: {str(e)}")


@router.post("/api/auth/refresh", response_model=RefreshTokenResponse)
async def refresh_token(
    request: RefreshTokenRequest, session: AsyncSession = Depends(get_db_session)
):
    """Refresh access token using refresh token."""
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

        token_data = {"user_id": user["id"], "phone_number": user["phone_number"]}
        access_token = auth_service.create_access_token(data=token_data)

        return RefreshTokenResponse(access_token=access_token, token_type="bearer")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error refreshing token: {str(e)}")


@router.post("/api/auth/logout")
async def logout(
    current_user: dict = Depends(get_current_user), session: AsyncSession = Depends(get_db_session)
):
    """Logout the current user by invalidating all refresh tokens."""
    try:
        await user_service.delete_user_refresh_tokens(session, current_user["id"])
        return {"status": "success", "message": "Logged out successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during logout: {str(e)}")


@router.get("/api/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Get current authenticated user information."""
    return UserResponse(
        id=current_user["id"],
        phone_number=current_user["phone_number"],
        email=current_user["email"],
        is_verified=current_user["is_verified"],
        created_at=current_user["created_at"],
    )
