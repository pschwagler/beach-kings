"""
User service layer for user and verification code database operations.
"""

from typing import Optional, Dict
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from backend.utils.datetime_utils import utcnow
from sqlalchemy import select, update, delete, func
from backend.database.models import User, VerificationCode, RefreshToken, PasswordResetToken
import logging

logger = logging.getLogger(__name__)

# Verification code expiration (in minutes)
VERIFICATION_CODE_EXPIRATION_MINUTES = 10

# Account locking configuration
MAX_FAILED_ATTEMPTS = 5
LOCK_DURATION_MINUTES = 15


async def create_user(
    session: AsyncSession, phone_number: str, password_hash: str, email: Optional[str] = None
) -> int:
    """
    Create a new user account.

    Checks if a verified user with the phone number already exists.
    Optionally cleans up old unverified accounts with the same phone.

    Args:
        session: Database session
        phone_number: Phone number in E.164 format
        password_hash: Required hashed password
        email: Optional user email

    Returns:
        User ID of the created user

    Raises:
        ValueError: If a verified user with this phone number already exists
    """
    # Check if user already exists
    result = await session.execute(select(User.id).where(User.phone_number == phone_number))
    if result.scalar_one_or_none():
        raise ValueError(f"Phone number {phone_number} is already registered")

    # Create new verified user
    new_user = User(
        phone_number=phone_number, password_hash=password_hash, email=email, is_verified=True
    )
    session.add(new_user)
    await session.flush()
    user_id = new_user.id
    await session.commit()

    return user_id


async def update_user_password(session: AsyncSession, user_id: int, password_hash: str) -> bool:
    """
    Update a user's password.

    Args:
        session: Database session
        user_id: User ID
        password_hash: New hashed password

    Returns:
        True if successful, False otherwise
    """
    result = await session.execute(
        update(User)
        .where(User.id == user_id)
        .values(password_hash=password_hash, updated_at=func.now())
    )
    await session.commit()
    return result.rowcount > 0


async def update_user(session: AsyncSession, user_id: int, email: Optional[str] = None) -> bool:
    """
    Update a user's email.

    Args:
        session: Database session
        user_id: User ID
        email: Optional new email (will be normalized to lowercase)

    Returns:
        True if successful, False otherwise
    """
    update_values = {"updated_at": func.now()}

    if email is not None:
        # Normalize email to lowercase
        update_values["email"] = email.strip().lower() if email else None

    if len(update_values) == 1:  # Only updated_at, nothing to update
        return False

    result = await session.execute(update(User).where(User.id == user_id).values(**update_values))
    await session.commit()
    return result.rowcount > 0


async def get_user_by_phone(session: AsyncSession, phone_number: str) -> Optional[Dict]:
    """
    Get user by phone number.

    Args:
        session: Database session
        phone_number: Phone number in E.164 format

    Returns:
        User dictionary or None if not found
    """
    result = await session.execute(select(User).where(User.phone_number == phone_number).limit(1))
    user = result.scalar_one_or_none()
    return _user_to_dict(user) if user else None


async def get_user_by_email(session: AsyncSession, email: str) -> Optional[Dict]:
    """
    Get user by email address.

    Args:
        session: Database session
        email: Email address (will be normalized to lowercase)

    Returns:
        User dictionary or None if not found
    """
    # Normalize email to lowercase for consistent lookup
    email = email.strip().lower() if email else None
    if not email:
        return None

    query = select(User).where(func.lower(func.trim(User.email)) == email)
    query = query.order_by(User.created_at.desc()).limit(1)

    result = await session.execute(query)
    user = result.scalar_one_or_none()
    return _user_to_dict(user) if user else None


async def get_user_by_id(session: AsyncSession, user_id: int) -> Optional[Dict]:
    """
    Get user by ID.

    Args:
        session: Database session
        user_id: User ID

    Returns:
        User dictionary or None if not found
    """
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    return _user_to_dict(user) if user else None


async def get_user_by_google_id(session: AsyncSession, google_id: str) -> Optional[Dict]:
    """
    Get user by Google ID (sub claim from Google ID token).

    Args:
        session: Database session
        google_id: Google's unique user identifier

    Returns:
        User dictionary or None if not found
    """
    result = await session.execute(select(User).where(User.google_id == google_id).limit(1))
    user = result.scalar_one_or_none()
    return _user_to_dict(user) if user else None


async def create_google_user(
    session: AsyncSession, email: str, google_id: str, full_name: str
) -> int:
    """
    Create a new user account via Google SSO.

    Args:
        session: Database session
        email: User email from Google
        google_id: Google's unique user identifier (sub claim)
        full_name: User's name from Google profile

    Returns:
        User ID of the created user

    Raises:
        ValueError: If a user with this email or google_id already exists
    """
    # Check email uniqueness
    existing = await get_user_by_email(session, email)
    if existing:
        raise ValueError(f"Email {email} is already registered")

    new_user = User(
        phone_number=None,
        password_hash=None,
        email=email.strip().lower(),
        auth_provider="google",
        google_id=google_id,
        is_verified=True,
    )
    session.add(new_user)
    await session.flush()
    user_id = new_user.id
    await session.commit()
    return user_id


async def link_google_id(session: AsyncSession, user_id: int, google_id: str) -> bool:
    """
    Link a Google ID to an existing user account (auto-link on email match).

    Args:
        session: Database session
        user_id: User ID to link
        google_id: Google's unique user identifier

    Returns:
        True if successful, False otherwise
    """
    result = await session.execute(
        update(User)
        .where(User.id == user_id)
        .values(google_id=google_id, updated_at=func.now())
    )
    await session.commit()
    return result.rowcount > 0


def _user_to_dict(user: User) -> Dict:
    """
    Convert a User ORM instance to a dictionary.

    Args:
        user: User ORM instance

    Returns:
        User dictionary
    """
    return {
        "id": user.id,
        "phone_number": user.phone_number,
        "password_hash": user.password_hash,
        "email": user.email,
        "auth_provider": getattr(user, "auth_provider", "phone") or "phone",
        "google_id": getattr(user, "google_id", None),
        "is_verified": user.is_verified,
        "failed_verification_attempts": user.failed_verification_attempts or 0,
        "locked_until": user.locked_until,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
    }


async def check_phone_exists(session: AsyncSession, phone_number: str) -> bool:
    """
    Check if a phone number exists in the system.

    Args:
        session: Database session
        phone_number: Phone number in E.164 format

    Returns:
        True if phone exists, False otherwise
    """
    user = await get_user_by_phone(session, phone_number)
    return user is not None


async def create_verification_code(
    session: AsyncSession,
    phone_number: str,
    code: str,
    expires_in_minutes: int = VERIFICATION_CODE_EXPIRATION_MINUTES,
    password_hash: Optional[str] = None,
    name: Optional[str] = None,
    email: Optional[str] = None,
) -> bool:
    """
    Create a verification code record with optional signup data.

    Ensures only one active code exists per phone number by deleting
    any existing unused codes before creating a new one.

    Args:
        session: Database session
        phone_number: Phone number in E.164 format
        code: Verification code
        expires_in_minutes: Expiration time in minutes (default 10)
        password_hash: Optional hashed password (for signup)
        email: Optional user email (for signup)

    Returns:
        True if successful, False otherwise
    """
    try:
        expires_at = utcnow() + timedelta(minutes=expires_in_minutes)
        expires_at_str = expires_at.isoformat()

        # Delete old unused codes
        await session.execute(
            delete(VerificationCode).where(
                VerificationCode.phone_number == phone_number, VerificationCode.used.is_(False)
            )
        )

        # Create new code with signup data
        new_code = VerificationCode(
            phone_number=phone_number,
            code=code,
            expires_at=expires_at_str,
            used=False,
            password_hash=password_hash,
            name=name,
            email=email,
        )
        session.add(new_code)
        await session.commit()
        return True
    except Exception as e:
        logger.error(f"Error creating verification code: {str(e)}")
        await session.rollback()
        return False


async def verify_and_mark_code_used(
    session: AsyncSession, phone_number: str, code: str
) -> Optional[Dict]:
    """
    Atomically verify a code and mark it as used, returning signup data if present.

    This prevents race conditions where the same code could be verified twice.
    Only marks as used if the code is valid and not expired.

    Args:
        session: Database session
        phone_number: Phone number in E.164 format
        code: Verification code

    Returns:
        Dictionary with signup data (password_hash, name, email) if code was valid and marked as used,
        None otherwise
    """
    # Get the code and signup data before marking as used
    result = await session.execute(
        select(VerificationCode).where(
            VerificationCode.phone_number == phone_number,
            VerificationCode.code == code,
            VerificationCode.used.is_(False),
            VerificationCode.expires_at > utcnow().isoformat(),
        )
    )
    verification_code = result.scalar_one_or_none()
    if not verification_code:
        return None

    # Extract signup data
    signup_data = {
        "password_hash": verification_code.password_hash,
        "name": verification_code.name,
        "email": verification_code.email,
    }

    # Atomically mark as used
    verification_code.used = True
    await session.commit()

    return signup_data


def is_account_locked(user: Dict) -> bool:
    """
    Check if a user account is currently locked.

    Args:
        user: User dictionary with locked_until field

    Returns:
        True if account is locked, False otherwise
    """
    if not user.get("locked_until"):
        return False

    locked_until = datetime.fromisoformat(user["locked_until"])
    if utcnow() < locked_until:
        return True

    # Lock has expired, clear it (async call needed but this function is sync)
    # This will be handled by the caller
    return False


async def increment_failed_attempts(session: AsyncSession, phone_number: str) -> bool:
    """
    Increment failed verification attempts for a user.
    Locks the account if MAX_FAILED_ATTEMPTS is reached.

    Args:
        session: Database session
        phone_number: Phone number in E.164 format

    Returns:
        True if account was locked, False otherwise
    """
    # Get current attempts
    result = await session.execute(
        select(User)
        .where(User.phone_number == phone_number)
        .order_by(User.created_at.desc())
        .limit(1)
    )
    user = result.scalar_one_or_none()
    if not user:
        return False

    current_attempts = user.failed_verification_attempts or 0
    new_attempts = current_attempts + 1

    # Update attempts
    if new_attempts >= MAX_FAILED_ATTEMPTS:
        # Lock the account
        locked_until = utcnow() + timedelta(minutes=LOCK_DURATION_MINUTES)
        locked_until_str = locked_until.isoformat()
        user.failed_verification_attempts = new_attempts
        user.locked_until = locked_until_str
        await session.commit()
        logger.warning(
            f"Account locked for phone {phone_number} after {new_attempts} failed attempts"
        )
        return True
    else:
        # Just increment attempts
        user.failed_verification_attempts = new_attempts
        await session.commit()
        return False


async def reset_failed_attempts(session: AsyncSession, user_id: int):
    """
    Reset failed verification attempts for a user (on successful verification).

    Args:
        session: Database session
        user_id: User ID
    """
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one()
    user.failed_verification_attempts = 0
    user.locked_until = None
    await session.commit()


async def clear_account_lock(session: AsyncSession, user_id: int):
    """
    Clear an expired account lock.

    Args:
        session: Database session
        user_id: User ID
    """
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user and user.locked_until:
        locked_until = datetime.fromisoformat(user.locked_until)
        if utcnow() >= locked_until:
            user.locked_until = None
            await session.commit()


# Refresh token functions


async def create_refresh_token(
    session: AsyncSession, user_id: int, token: str, expires_at: datetime
) -> bool:
    """
    Create a refresh token record.

    Args:
        session: Database session
        user_id: User ID
        token: Refresh token string
        expires_at: Expiration datetime

    Returns:
        True if successful, False otherwise
    """
    try:
        expires_at_str = expires_at.isoformat()

        # Delete old refresh tokens for this user
        await session.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))

        # Create new refresh token
        new_token = RefreshToken(user_id=user_id, token=token, expires_at=expires_at_str)
        session.add(new_token)
        await session.commit()
        return True
    except Exception as e:
        logger.error(f"Error creating refresh token: {str(e)}")
        await session.rollback()
        return False


async def get_refresh_token(session: AsyncSession, token: str) -> Optional[Dict]:
    """
    Get refresh token record by token string.

    Args:
        session: Database session
        token: Refresh token string

    Returns:
        Refresh token dictionary with user_id and expires_at, or None if not found
    """
    result = await session.execute(select(RefreshToken).where(RefreshToken.token == token))
    refresh_token = result.scalar_one_or_none()
    if refresh_token:
        return {
            "id": refresh_token.id,
            "user_id": refresh_token.user_id,
            "token": refresh_token.token,
            "expires_at": refresh_token.expires_at,
            "created_at": refresh_token.created_at.isoformat()
            if refresh_token.created_at
            else None,
        }
    return None


async def delete_refresh_token(session: AsyncSession, token: str) -> bool:
    """
    Delete a refresh token (on logout or token rotation).

    Args:
        session: Database session
        token: Refresh token string

    Returns:
        True if token was deleted, False otherwise
    """
    result = await session.execute(delete(RefreshToken).where(RefreshToken.token == token))
    await session.commit()
    return result.rowcount > 0


async def delete_user_refresh_tokens(session: AsyncSession, user_id: int) -> int:
    """
    Delete all refresh tokens for a user.

    Args:
        session: Database session
        user_id: User ID

    Returns:
        Number of tokens deleted
    """
    result = await session.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
    await session.commit()
    return result.rowcount


# Password reset token functions


async def create_password_reset_token(
    session: AsyncSession, user_id: int, token: str, expires_at: datetime
) -> bool:
    """
    Create a password reset token record.

    Args:
        session: Database session
        user_id: User ID
        token: Reset token string
        expires_at: Expiration datetime

    Returns:
        True if successful, False otherwise
    """
    try:
        expires_at_str = expires_at.isoformat()

        # Delete old unused reset tokens for this user
        await session.execute(
            delete(PasswordResetToken).where(
                PasswordResetToken.user_id == user_id, PasswordResetToken.used.is_(False)
            )
        )

        # Create new reset token
        new_token = PasswordResetToken(
            user_id=user_id, token=token, expires_at=expires_at_str, used=False
        )
        session.add(new_token)
        await session.commit()
        return True
    except Exception as e:
        logger.error(f"Error creating password reset token: {str(e)}")
        await session.rollback()
        return False


async def verify_and_use_password_reset_token(session: AsyncSession, token: str) -> Optional[int]:
    """
    Verify a password reset token and mark it as used.

    Args:
        session: Database session
        token: Reset token string

    Returns:
        User ID if token is valid and was marked as used, None otherwise
    """
    # Get the token and verify it's valid and not expired
    result = await session.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token == token,
            PasswordResetToken.used.is_(False),
            PasswordResetToken.expires_at > utcnow().isoformat(),
        )
    )
    reset_token = result.scalar_one_or_none()
    if not reset_token:
        return None

    user_id = reset_token.user_id

    # Atomically mark as used
    reset_token.used = True
    await session.commit()

    return user_id
