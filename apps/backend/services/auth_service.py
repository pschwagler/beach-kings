"""
Authentication service for password hashing, JWT tokens, and SMS verification.
"""

import bcrypt
import os
import random
import logging
import re
import secrets
from datetime import timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from backend.utils.datetime_utils import utcnow
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError
from twilio.rest import Client
from dotenv import load_dotenv
import phonenumbers
from phonenumbers import NumberParseException, PhoneNumberFormat
from backend.services import settings_service

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)


def get_bool_env(key: str, default: bool = True) -> bool:
    """
    Parse a boolean environment variable from a string value.

    .env files store all values as strings, so this function converts string
    values like "true", "True", "TRUE", "1", "yes" to True, and everything
    else (including "false", "False", "0", "no", empty string) to False.

    Args:
        key: Environment variable name
        default: Default value if the variable is not set

    Returns:
        bool: Parsed boolean value
    """
    value = os.getenv(key)
    if value is None:
        return default
    return value.lower() in ("true", "1", "yes")


# JWT Configuration
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not JWT_SECRET_KEY:
    raise ValueError(
        "JWT_SECRET_KEY environment variable must be set. "
        "Generate a secure random key with: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
    )
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRATION_MINUTES = int(os.getenv("JWT_EXPIRATION_MINUTES", "15"))  # Access token: 15 minutes
REFRESH_TOKEN_EXPIRATION_DAYS = int(
    os.getenv("REFRESH_TOKEN_EXPIRATION_DAYS", "7")
)  # Refresh token: 7 days

# Twilio Configuration
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")
ENABLE_SMS = get_bool_env("ENABLE_SMS", default=True)

# Verification code configuration
VERIFICATION_CODE_LENGTH = 4
VERIFICATION_CODE_EXPIRATION_MINUTES = 10


def hash_password(password: str) -> str:
    """
    Hash a password using bcrypt.

    Args:
        password: Plain text password

    Returns:
        Hashed password string
    """
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """
    Verify a password against a hash.

    Args:
        password: Plain text password
        password_hash: Hashed password from database

    Returns:
        True if password matches, False otherwise
    """
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception as e:
        logger.error(f"Error verifying password: {str(e)}")
        return False


async def is_sms_enabled(session: Optional[AsyncSession] = None) -> bool:
    """
    Check if SMS is enabled, checking database first.

    Args:
        session: Optional database session for checking database settings

    Returns:
        True if SMS is enabled, False otherwise
    """
    try:
        return await settings_service.get_bool_setting(
            session, "enable_sms", env_var="ENABLE_SMS", default=True, fallback_to_cache=True
        )
    except Exception as e:
        logger.warning(f"Error getting ENABLE_SMS from settings, using default: {e}")
        return ENABLE_SMS


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token.

    Args:
        data: Dictionary containing user data (e.g., user_id, phone_number)
        expires_delta: Optional expiration time delta. Defaults to JWT_EXPIRATION_MINUTES

    Returns:
        Encoded JWT token string
    """
    to_encode = data.copy()

    if expires_delta:
        expire = utcnow() + expires_delta
    else:
        expire = utcnow() + timedelta(minutes=JWT_EXPIRATION_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def generate_refresh_token() -> str:
    """
    Generate a secure random refresh token.

    Returns:
        Random token string suitable for use as refresh token
    """
    return secrets.token_urlsafe(32)


def verify_token(token: str) -> Optional[dict]:
    """
    Verify and decode a JWT token.

    Args:
        token: JWT token string

    Returns:
        Decoded token payload if valid, None otherwise
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except ExpiredSignatureError:
        # Expired tokens are expected behavior - log at DEBUG level
        logger.debug("JWT token has expired")
        return None
    except JWTError as e:
        # Other JWT errors (invalid signature, malformed token, etc.) are unexpected
        logger.warning(f"JWT verification failed: {str(e)}")
        return None


def generate_verification_code() -> str:
    """
    Generate a random 4-digit verification code.

    Returns:
        4-digit code as string
    """
    return str(random.randint(1000, 9999))


def normalize_phone_number(phone: str, default_region: str = "US") -> str:
    """
    Normalize phone number to E.164 format using phonenumbers library.

    Args:
        phone: Phone number in various formats
        default_region: Default region code if number doesn't have country code (default: "US")

    Returns:
        Phone number in E.164 format (e.g., +15551234567)

    Raises:
        ValueError: If phone number cannot be parsed or is invalid
    """
    try:
        # Parse the phone number
        parsed_number = phonenumbers.parse(phone, default_region)

        # Validate the number
        if not phonenumbers.is_valid_number(parsed_number):
            raise ValueError(f"Invalid phone number: {phone}")

        # Format to E.164
        return phonenumbers.format_number(parsed_number, PhoneNumberFormat.E164)

    except NumberParseException as e:
        raise ValueError(f"Could not parse phone number '{phone}': {str(e)}")


def validate_phone_number(phone: str, default_region: str = "US") -> bool:
    """
    Validate if a phone number is valid.

    Args:
        phone: Phone number to validate
        default_region: Default region code if number doesn't have country code (default: "US")

    Returns:
        True if phone number is valid, False otherwise
    """
    try:
        parsed_number = phonenumbers.parse(phone, default_region)
        return phonenumbers.is_valid_number(parsed_number)
    except (NumberParseException, ValueError):
        return False


def validate_email(email: str) -> bool:
    """
    Validate if an email address is valid.

    Args:
        email: Email address to validate

    Returns:
        True if email is valid, False otherwise
    """
    if not email:
        return False

    # Basic email regex pattern
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    return bool(re.match(pattern, email))


def normalize_email(email: str) -> str:
    """
    Normalize email address (lowercase and strip whitespace).

    Args:
        email: Email address to normalize

    Returns:
        Normalized email address in lowercase

    Raises:
        ValueError: If email is invalid
    """
    if not email:
        raise ValueError("Email cannot be empty")

    email = email.strip().lower()

    if not validate_email(email):
        raise ValueError(f"Invalid email address: {email}")

    return email


async def send_sms_verification(session: AsyncSession, phone_number: str, code: str) -> bool:
    """
    Send SMS verification code via Twilio.

    Args:
        session: Database session for checking database settings
        phone_number: Phone number in E.164 format
        code: Verification code to send

    Returns:
        True if SMS sent successfully, False otherwise
    """
    # Check if SMS is disabled (database setting first, then env var)
    enable_sms = await is_sms_enabled(session)
    if not enable_sms:
        logger.warning(f"SMS sending is disabled. Skipping SMS to {phone_number}.")
        return True  # Return True to not break the flow, but log that SMS was skipped

    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER]):
        logger.error(
            "Twilio credentials not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER environment variables."
        )
        return False

    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

        message = client.messages.create(
            body=f"Beach League: Your verification code is: {code}",
            from_=TWILIO_PHONE_NUMBER,
            to=phone_number,
        )

        logger.info(f"SMS sent to {phone_number}, SID: {message.sid}")
        return True

    except Exception as e:
        logger.error(f"Failed to send SMS to {phone_number}: {str(e)}")
        return False
