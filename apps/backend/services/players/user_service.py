"""
User service layer for user and verification code database operations.
"""

from datetime import datetime, timedelta, timezone
import logging
from typing import Optional, Dict
from urllib.parse import urlparse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from backend.utils.datetime_utils import utcnow
from sqlalchemy import select, update, delete, func
from sqlalchemy.dialects.postgresql import insert
from backend.database.models import (
    User,
    VerificationCode,
    RefreshToken,
    PasswordResetToken,
    Player,
    Friend,
    FriendRequest,
    DirectMessage,
    Notification,
    LeagueMember,
    LeagueMessage,
    LeagueRequest,
    PlayerSeasonStats,
    PlayerLeagueStats,
    PlayerGlobalStats,
    PartnershipStats,
    PartnershipStatsSeason,
    PartnershipStatsLeague,
    OpponentStats,
    OpponentStatsSeason,
    OpponentStatsLeague,
    EloHistory,
    SeasonRatingHistory,
    SignupPlayer,
    SignupEvent,
    SessionParticipant,
    Feedback,
    CourtReview,
    CourtReviewPhoto,
    CourtPhoto,
    CourtEditSuggestion,
    PlayerInvite,
    Court,
    CourtCheckIn,
    KobTournament,
    KobPlayer,
    League,
    LeagueConfig,
    LeagueInvite,
    Location,
    Match,
    PlayerHomeCourt,
    Season,
    SeasonAward,
    Session,
    Setting,
    Signup,
    WeeklySchedule,
    MediaDeletionJob,
    AppleCredential,
    AppleRevocationJob,
)


def effective_moderation_status(user: dict) -> str:
    """Return the account status after applying time-bound suspension expiry."""
    account_status = user.get("moderation_status") or "active"
    if account_status != "suspended":
        return account_status
    expires_at = user.get("moderation_expires_at")
    if not expires_at:
        return account_status
    try:
        expiry = datetime.fromisoformat(expires_at) if isinstance(expires_at, str) else expires_at
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        return "active" if expiry <= utcnow() else account_status
    except (TypeError, ValueError):
        return account_status


logger = logging.getLogger(__name__)

# Verification code expiration (in minutes)
VERIFICATION_CODE_EXPIRATION_MINUTES = 10

# Account locking configuration
MAX_FAILED_ATTEMPTS = 5
LOCK_DURATION_MINUTES = 15


async def create_user(
    session: AsyncSession,
    phone_number: Optional[str] = None,
    password_hash: str = "",
    email: Optional[str] = None,
) -> int:
    """
    Create a new user account.

    At least one of ``phone_number`` or ``email`` must be provided. If a
    verified user with the same phone number or email already exists, raises
    ``ValueError``.

    Args:
        session: Database session
        phone_number: Phone number in E.164 format (optional when email is used)
        password_hash: Required hashed password
        email: Optional user email (normalized to lowercase)

    Returns:
        User ID of the created user

    Raises:
        ValueError: If neither identifier is provided, or if a user with the
            given phone number or email already exists.
    """
    if not phone_number and not email:
        raise ValueError("Either phone_number or email must be provided")

    normalized_email = email.strip().lower() if email else None

    if phone_number:
        result = await session.execute(select(User.id).where(User.phone_number == phone_number))
        if result.scalar_one_or_none():
            raise ValueError(f"Phone number {phone_number} is already registered")

    if normalized_email:
        existing = await get_user_by_email(session, normalized_email)
        if existing:
            raise ValueError(f"Email {normalized_email} is already registered")

    new_user = User(
        phone_number=phone_number,
        password_hash=password_hash,
        email=normalized_email,
        is_verified=True,
    )
    session.add(new_user)
    await session.flush()
    user_id = new_user.id
    await session.commit()

    return user_id


async def update_user_password(session: AsyncSession, user_id: int, password_hash: str) -> bool:
    """
    Update a user's password and record the change timestamp.

    Flushes but does not commit, so callers can compose this with other
    operations (e.g. revoking refresh tokens) inside a single transaction.
    The caller is responsible for committing.

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
        .values(
            password_hash=password_hash,
            password_changed_at=func.now(),
            updated_at=func.now(),
        )
    )
    await session.flush()
    return result.rowcount > 0


async def update_user(
    session: AsyncSession,
    user_id: int,
    email: Optional[str] = None,
    profile_is_private: Optional[bool] = None,
    show_game_history: Optional[bool] = None,
) -> bool:
    """
    Update mutable fields on a User row.

    Only fields provided as non-None are written; omitted fields are left
    unchanged.  At least one payload field must be supplied (otherwise no
    meaningful update occurs and the function returns ``False``).

    Args:
        session: Database session.
        user_id: Target user ID.
        email: New email address (normalised to lowercase).
        profile_is_private: When True, only the floor of the player's public
            profile is visible to non-self viewers.
        show_game_history: When True (and profile is public), non-self viewers
            may see the per-game history list.

    Returns:
        True if exactly one row was updated, False otherwise.
    """
    update_values: dict = {"updated_at": func.now()}

    if email is not None:
        update_values["email"] = email.strip().lower() if email else None

    if profile_is_private is not None:
        update_values["profile_is_private"] = profile_is_private

    if show_game_history is not None:
        update_values["show_game_history"] = show_game_history

    if len(update_values) == 1:  # only updated_at — nothing substantive to update
        return False

    result = await session.execute(update(User).where(User.id == user_id).values(**update_values))
    await session.commit()
    return result.rowcount > 0


async def add_phone_number(session: AsyncSession, user_id: int, phone_number: str) -> bool:
    """
    Attach a phone number to a user that currently has none.

    Uses a conditional UPDATE (``WHERE id = :id AND phone_number IS NULL``) so the
    operation is safe against races: if the user already has a phone number, the
    update affects zero rows and returns ``False``.

    Args:
        session: Database session
        user_id: User ID
        phone_number: Normalized E.164 phone number

    Returns:
        True if the phone was attached, False if the user already had a phone
        or the user does not exist.
    """
    try:
        result = await session.execute(
            update(User)
            .where(User.id == user_id, User.phone_number.is_(None))
            .values(phone_number=phone_number, updated_at=func.now())
        )
        await session.commit()
        return result.rowcount == 1
    except IntegrityError:
        # Another user already holds this phone number (unique constraint).
        await session.rollback()
        return False


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

    Uses the DB unique index on email/google_id for race-safe uniqueness
    enforcement instead of a SELECT-then-INSERT pattern.

    Note: This function flushes but does NOT commit — the caller is
    responsible for committing after all related mutations (e.g., player
    profile creation) succeed.

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
    new_user = User(
        phone_number=None,
        password_hash=None,
        email=email.strip().lower(),
        auth_provider="google",
        google_id=google_id,
        is_verified=True,
    )
    session.add(new_user)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise ValueError(f"Email {email} is already registered")
    return new_user.id


async def get_user_by_apple_id(session: AsyncSession, apple_id: str) -> Optional[Dict]:
    """
    Get user by Apple ID (sub claim from Apple ID token).

    Args:
        session: Database session
        apple_id: Apple's unique user identifier

    Returns:
        User dictionary or None if not found
    """
    result = await session.execute(select(User).where(User.apple_id == apple_id).limit(1))
    user = result.scalar_one_or_none()
    return _user_to_dict(user) if user else None


async def create_apple_user(
    session: AsyncSession, email: str, apple_id: str, full_name: str
) -> int:
    """
    Create a new user account via Apple Sign In.

    Uses the DB unique index on email/apple_id for race-safe uniqueness
    enforcement instead of a SELECT-then-INSERT pattern.

    Note: This function flushes but does NOT commit -- the caller is
    responsible for committing after all related mutations (e.g., player
    profile creation) succeed.

    Args:
        session: Database session
        email: User email from Apple
        apple_id: Apple's unique user identifier (sub claim)
        full_name: User's name (may be empty on subsequent logins)

    Returns:
        User ID of the created user

    Raises:
        ValueError: If a user with this email or apple_id already exists
    """
    new_user = User(
        phone_number=None,
        password_hash=None,
        email=email.strip().lower(),
        auth_provider="apple",
        apple_id=apple_id,
        is_verified=True,
    )
    session.add(new_user)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise ValueError(f"Email {email} is already registered")
    return new_user.id


async def link_google_id(session: AsyncSession, user_id: int, google_id: str) -> bool:
    """
    Link a Google ID to an existing user account.

    Updates both google_id and auth_provider so the user is consistently
    recorded as a Google-linked account.

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
        .values(google_id=google_id, auth_provider="google", updated_at=func.now())
    )
    await session.commit()
    return result.rowcount > 0


def _user_to_dict(user: User) -> Dict:
    """
    Convert a User ORM instance to a dictionary.

    Includes all mutable fields that callers (routes, tests) may need to
    inspect, including the privacy toggles added for the PRIVACY feature.

    Args:
        user: User ORM instance.

    Returns:
        User dictionary.
    """
    return {
        "id": user.id,
        "phone_number": user.phone_number,
        "password_hash": user.password_hash,
        "email": user.email,
        "auth_provider": user.auth_provider or "phone",
        "google_id": user.google_id,
        "apple_id": user.apple_id,
        "is_verified": user.is_verified,
        "failed_verification_attempts": user.failed_verification_attempts or 0,
        "locked_until": user.locked_until,
        "deletion_scheduled_at": (
            user.deletion_scheduled_at.isoformat() if user.deletion_scheduled_at else None
        ),
        "deleted_at": user.deleted_at.isoformat() if user.deleted_at else None,
        "moderation_status": user.moderation_status or "active",
        "moderation_expires_at": (
            user.moderation_expires_at.isoformat() if user.moderation_expires_at else None
        ),
        "moderation_case_id": user.moderation_case_id,
        "moderation_updated_at": (
            user.moderation_updated_at.isoformat() if user.moderation_updated_at else None
        ),
        "password_changed_at": (
            user.password_changed_at.isoformat() if user.password_changed_at else None
        ),
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        # Privacy toggles (PRIVACY feature)
        "profile_is_private": bool(user.profile_is_private),
        "show_game_history": bool(user.show_game_history),
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


async def check_email_exists(session: AsyncSession, email: str) -> bool:
    """
    Check if a normalized email address is already registered.

    Args:
        session: Database session
        email: Email address (will be normalized to lowercase)

    Returns:
        True if email exists, False otherwise.
    """
    user = await get_user_by_email(session, email)
    return user is not None


async def create_verification_code(
    session: AsyncSession,
    phone_number: Optional[str] = None,
    code: str = "",
    expires_in_minutes: int = VERIFICATION_CODE_EXPIRATION_MINUTES,
    password_hash: Optional[str] = None,
    name: Optional[str] = None,
    email: Optional[str] = None,
) -> bool:
    """
    Create a verification code record with optional signup data.

    Exactly one of ``phone_number`` or ``email`` must be provided. Ensures
    only one active code exists per identifier by deleting any existing
    unused codes keyed on the same identifier before inserting.

    Args:
        session: Database session
        phone_number: Phone number in E.164 format (mutually exclusive with email)
        code: Verification code
        expires_in_minutes: Expiration time in minutes (default 10)
        password_hash: Optional hashed password (for signup)
        name: Optional full name (for signup)
        email: Email address (mutually exclusive with phone_number)

    Returns:
        True if successful, False otherwise
    """
    if not phone_number and not email:
        logger.error("create_verification_code requires phone_number or email")
        return False

    normalized_email = email.strip().lower() if email else None

    try:
        expires_at = utcnow() + timedelta(minutes=expires_in_minutes)
        expires_at_str = expires_at.isoformat()

        # Delete old unused codes keyed on the same identifier
        if phone_number:
            await session.execute(
                delete(VerificationCode).where(
                    VerificationCode.phone_number == phone_number,
                    VerificationCode.used.is_(False),
                )
            )
        else:
            await session.execute(
                delete(VerificationCode).where(
                    VerificationCode.email == normalized_email,
                    VerificationCode.phone_number.is_(None),
                    VerificationCode.used.is_(False),
                )
            )

        new_code = VerificationCode(
            phone_number=phone_number,
            code=code,
            expires_at=expires_at_str,
            used=False,
            password_hash=password_hash,
            name=name,
            email=normalized_email,
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
    Atomically verify a phone-based code and mark it as used.

    Returns signup data if present (password_hash, name, email) when the code
    is valid, not expired, and has not been used; ``None`` otherwise.
    """
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

    signup_data = {
        "password_hash": verification_code.password_hash,
        "name": verification_code.name,
        "email": verification_code.email,
    }

    verification_code.used = True
    await session.commit()

    return signup_data


async def verify_and_mark_email_code_used(
    session: AsyncSession, email: str, code: str
) -> Optional[Dict]:
    """
    Atomically verify an email-based code and mark it as used.

    Args:
        session: Database session
        email: Email address (will be normalized to lowercase)
        code: Verification code

    Returns:
        Dict with signup data (password_hash, name, email) when valid, else None.
    """
    normalized = email.strip().lower() if email else None
    if not normalized:
        return None

    result = await session.execute(
        select(VerificationCode).where(
            VerificationCode.email == normalized,
            VerificationCode.phone_number.is_(None),
            VerificationCode.code == code,
            VerificationCode.used.is_(False),
            VerificationCode.expires_at > utcnow().isoformat(),
        )
    )
    verification_code = result.scalar_one_or_none()
    if not verification_code:
        return None

    signup_data = {
        "password_hash": verification_code.password_hash,
        "name": verification_code.name,
        "email": verification_code.email,
    }

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

        # Clean up only expired tokens for this user (keep active tokens from other tabs/devices)
        now_str = utcnow().isoformat()
        await session.execute(
            delete(RefreshToken).where(
                RefreshToken.user_id == user_id,
                RefreshToken.expires_at < now_str,
            )
        )

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
    await session.flush()
    return result.rowcount > 0


async def delete_user_refresh_tokens(session: AsyncSession, user_id: int) -> int:
    """
    Delete all refresh tokens for a user.

    Flushes but does not commit, so callers can compose this with other
    operations (e.g. updating the user's password) inside a single
    transaction. The caller is responsible for committing.

    Args:
        session: Database session
        user_id: User ID

    Returns:
        Number of tokens deleted
    """
    result = await session.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
    await session.flush()
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


# Account deletion constants
DELETION_GRACE_PERIOD_DAYS = 30


async def schedule_account_deletion(session: AsyncSession, user_id: int) -> bool:
    """
    Schedule an account for deletion after a 30-day grace period.

    Args:
        session: Database session
        user_id: User ID to schedule for deletion

    Returns:
        True if scheduled successfully, False if user not found
    """
    from backend.services.platform import role_service

    await role_service.ensure_can_become_inaccessible(session, user_id)
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return False

    user.deletion_scheduled_at = utcnow() + timedelta(days=DELETION_GRACE_PERIOD_DAYS)
    await session.commit()
    logger.info(f"Account deletion scheduled for user {user_id} at {user.deletion_scheduled_at}")
    return True


async def cancel_account_deletion(session: AsyncSession, user_id: int) -> bool:
    """
    Cancel a pending account deletion.

    Args:
        session: Database session
        user_id: User ID to cancel deletion for

    Returns:
        True if cancelled, False if user not found or no deletion pending
    """
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.deletion_scheduled_at:
        return False

    user.deletion_scheduled_at = None
    await session.commit()
    logger.info(f"Account deletion cancelled for user {user_id}")
    return True


async def store_apple_refresh_token(
    session: AsyncSession, user_id: int, refresh_token_ciphertext: str
) -> None:
    """Insert or replace the encrypted Apple refresh token for a linked account."""
    await session.execute(
        insert(AppleCredential)
        .values(user_id=user_id, refresh_token_ciphertext=refresh_token_ciphertext)
        .on_conflict_do_update(
            index_elements=[AppleCredential.user_id],
            set_={
                "refresh_token_ciphertext": refresh_token_ciphertext,
                "updated_at": func.now(),
            },
        )
    )
    await session.flush()


async def _enqueue_apple_revocation(session: AsyncSession, user_id: int) -> None:
    """Move a stored Apple credential into the durable deletion outbox."""
    credential = (
        await session.execute(select(AppleCredential).where(AppleCredential.user_id == user_id))
    ).scalar_one_or_none()
    if credential is None:
        return
    session.add(AppleRevocationJob(refresh_token_ciphertext=credential.refresh_token_ciphertext))
    await session.delete(credential)


def _managed_avatar_key(url: str, player_id: int) -> Optional[str]:
    """Return the key only for avatars created by this app's S3 upload convention."""
    parsed = urlparse(url)
    key = parsed.path.lstrip("/")
    expected_prefix = f"avatars/{player_id}/"
    if parsed.scheme != "https" or not (parsed.hostname or "").endswith(".amazonaws.com"):
        return None
    return key if key.startswith(expected_prefix) and len(key) > len(expected_prefix) else None


async def _enqueue_s3_deletions(player: Player, player_id: int, session: AsyncSession) -> None:
    """Record owned media for deletion in the same transaction as account cleanup."""
    photo_result = await session.execute(
        select(CourtPhoto.s3_key).where(CourtPhoto.uploaded_by == player_id)
    )
    review_photo_result = await session.execute(
        select(CourtReviewPhoto.s3_key)
        .join(CourtReview, CourtReviewPhoto.review_id == CourtReview.id)
        .where(CourtReview.player_id == player_id)
    )
    keys = {row[0] for row in photo_result.all()} | {row[0] for row in review_photo_result.all()}
    if player.profile_picture_url:
        avatar_key = _managed_avatar_key(player.profile_picture_url, player_id)
        if avatar_key:
            keys.add(avatar_key)
    session.add_all([MediaDeletionJob(object_key=key) for key in sorted(keys) if key])


async def _delete_player_stats(session: AsyncSession, player_id: int) -> None:
    """Delete all stats rows for a player."""
    await session.execute(
        delete(PartnershipStats).where(
            (PartnershipStats.player_id == player_id) | (PartnershipStats.partner_id == player_id)
        )
    )
    await session.execute(
        delete(PartnershipStatsSeason).where(
            (PartnershipStatsSeason.player_id == player_id)
            | (PartnershipStatsSeason.partner_id == player_id)
        )
    )
    await session.execute(
        delete(PartnershipStatsLeague).where(
            (PartnershipStatsLeague.player_id == player_id)
            | (PartnershipStatsLeague.partner_id == player_id)
        )
    )
    await session.execute(
        delete(OpponentStats).where(
            (OpponentStats.player_id == player_id) | (OpponentStats.opponent_id == player_id)
        )
    )
    await session.execute(
        delete(OpponentStatsSeason).where(
            (OpponentStatsSeason.player_id == player_id)
            | (OpponentStatsSeason.opponent_id == player_id)
        )
    )
    await session.execute(
        delete(OpponentStatsLeague).where(
            (OpponentStatsLeague.player_id == player_id)
            | (OpponentStatsLeague.opponent_id == player_id)
        )
    )
    await session.execute(
        delete(PlayerSeasonStats).where(PlayerSeasonStats.player_id == player_id)
    )
    await session.execute(
        delete(PlayerLeagueStats).where(PlayerLeagueStats.player_id == player_id)
    )
    await session.execute(
        delete(PlayerGlobalStats).where(PlayerGlobalStats.player_id == player_id)
    )
    await session.execute(delete(EloHistory).where(EloHistory.player_id == player_id))
    await session.execute(
        delete(SeasonRatingHistory).where(SeasonRatingHistory.player_id == player_id)
    )


async def _delete_social_data(session: AsyncSession, player_id: int) -> None:
    """Delete friend requests, friendships, and direct messages for a player."""
    await session.execute(delete(Notification).where(Notification.actor_player_id == player_id))
    await session.execute(
        delete(FriendRequest).where(
            (FriendRequest.sender_player_id == player_id)
            | (FriendRequest.receiver_player_id == player_id)
        )
    )
    await session.execute(
        delete(Friend).where((Friend.player1_id == player_id) | (Friend.player2_id == player_id))
    )
    await session.execute(
        delete(DirectMessage).where(
            (DirectMessage.sender_player_id == player_id)
            | (DirectMessage.receiver_player_id == player_id)
        )
    )
    from backend.services import interaction_policy

    await interaction_policy.delete_blocks_for_player(session, player_id)


async def _delete_league_participation(session: AsyncSession, player_id: int) -> None:
    """Delete league memberships, requests, signups, and session participation."""
    await session.execute(delete(LeagueRequest).where(LeagueRequest.player_id == player_id))
    await session.execute(delete(LeagueMember).where(LeagueMember.player_id == player_id))
    await session.execute(delete(SignupEvent).where(SignupEvent.player_id == player_id))
    await session.execute(delete(SignupPlayer).where(SignupPlayer.player_id == player_id))
    await session.execute(
        delete(SessionParticipant).where(SessionParticipant.player_id == player_id)
    )
    await session.execute(delete(LeagueInvite).where(LeagueInvite.player_id == player_id))
    await session.execute(delete(PlayerHomeCourt).where(PlayerHomeCourt.player_id == player_id))
    await session.execute(delete(CourtCheckIn).where(CourtCheckIn.player_id == player_id))
    await session.execute(delete(SeasonAward).where(SeasonAward.player_id == player_id))
    await session.execute(delete(KobPlayer).where(KobPlayer.player_id == player_id))


async def _delete_court_contributions(session: AsyncSession, player_id: int) -> None:
    """Delete court photos, reviews, and suggestions by a player."""
    await session.execute(delete(CourtPhoto).where(CourtPhoto.uploaded_by == player_id))
    await session.execute(delete(CourtReview).where(CourtReview.player_id == player_id))
    await session.execute(
        update(CourtEditSuggestion)
        .where(CourtEditSuggestion.reviewed_by == player_id)
        .values(reviewed_by=None)
    )
    await session.execute(
        delete(CourtEditSuggestion).where(CourtEditSuggestion.suggested_by == player_id)
    )


async def _detach_retained_attribution(session: AsyncSession, player_id: int) -> None:
    """Remove ordinary-product attribution while preserving factual rows."""
    for model, columns in (
        (Location, ("created_by", "updated_by")),
        (Court, ("created_by", "updated_by")),
        (League, ("created_by", "updated_by")),
        (LeagueConfig, ("created_by", "updated_by")),
        (LeagueMember, ("created_by",)),
        (Season, ("created_by", "updated_by")),
        (Session, ("created_by", "updated_by")),
        (Match, ("created_by", "updated_by")),
        (Setting, ("updated_by",)),
        (WeeklySchedule, ("created_by", "updated_by")),
        (Signup, ("created_by", "updated_by")),
        (SignupEvent, ("created_by",)),
        (SessionParticipant, ("invited_by",)),
        (PlayerInvite, ("created_by_player_id",)),
        (LeagueInvite, ("invited_by_player_id",)),
        (CourtPhoto, ("uploaded_by",)),
        (CourtEditSuggestion, ("reviewed_by",)),
        (Friend, ("created_by",)),
        (KobTournament, ("director_player_id",)),
        (Player, ("created_by_player_id",)),
    ):
        for column_name in columns:
            column = getattr(model, column_name)
            await session.execute(
                update(model).where(column == player_id).values(**{column_name: None})
            )


def _anonymize_player(player: Player, deleted_at: datetime) -> None:
    """Replace player PII with anonymized values. Keeps the row for match FK integrity."""
    player.full_name = "Deleted Player"
    player.first_name = ""
    player.last_name = ""
    player.user_id = None
    player.nickname = None
    player.gender = None
    player.level = None
    player.city = None
    player.state = None
    player.location_id = None
    player.date_of_birth = None
    player.city_latitude = None
    player.city_longitude = None
    player.distance_to_location = None
    player.profile_picture_url = None
    player.avatar = None
    player.height = None
    player.preferred_side = None
    player.avp_playerProfileId = None
    player.status = None
    player.created_by_player_id = None
    player.deleted_at = deleted_at


async def _delete_user_data(session: AsyncSession, user: User, deleted_at: datetime) -> None:
    """Delete user-level rows and anonymize user PII."""
    user_id = user.id
    await _enqueue_apple_revocation(session, user_id)
    await session.execute(delete(Notification).where(Notification.user_id == user_id))
    await session.execute(delete(LeagueMessage).where(LeagueMessage.user_id == user_id))
    await session.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
    await session.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user_id))
    await session.execute(delete(Feedback).where(Feedback.user_id == user_id))

    if user.phone_number:
        await session.execute(
            delete(VerificationCode).where(VerificationCode.phone_number == user.phone_number)
        )

    user.phone_number = None
    user.email = None
    user.google_id = None
    user.apple_id = None
    user.password_hash = None
    user.deletion_scheduled_at = None
    user.deleted_at = deleted_at
    user.is_verified = False
    user.failed_verification_attempts = 0
    user.locked_until = None
    user.password_changed_at = None


async def execute_account_deletion(session: AsyncSession, user_id: int) -> bool:
    """
    Execute permanent account deletion: anonymize PII, delete related data.

    Preserves match records so other players' history isn't broken — the
    player's name is replaced with "Deleted Player".

    Args:
        session: Database session
        user_id: User ID to delete

    Returns:
        True if executed successfully, False if user not found
    """
    from backend.services.platform import role_service

    await role_service.ensure_can_become_inaccessible(session, user_id)
    user_result = await session.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        return False

    player_result = await session.execute(
        select(Player).where(Player.user_id == user_id, Player.is_placeholder == False)  # noqa: E712
    )
    player = player_result.scalar_one_or_none()
    player_id = player.id if player else None
    deleted_at = utcnow()

    if player_id:
        await _enqueue_s3_deletions(player, player_id, session)
        await _delete_player_stats(session, player_id)
        await _delete_social_data(session, player_id)
        await _delete_league_participation(session, player_id)
        await _delete_court_contributions(session, player_id)
        await session.execute(delete(PlayerInvite).where(PlayerInvite.player_id == player_id))
        await _detach_retained_attribution(session, player_id)
        _anonymize_player(player, deleted_at)

    await _delete_user_data(session, user, deleted_at)

    await session.commit()
    logger.info(f"Account deletion executed for user {user_id} (player {player_id})")
    return True
