"""
Authentication service for password hashing, JWT tokens, and SMS verification.
"""

import hashlib
import hmac
import logging
import os
import re
import secrets
from datetime import timedelta
from typing import Optional

import bcrypt
import phonenumbers
from dotenv import load_dotenv
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError
from phonenumbers import NumberParseException, PhoneNumberFormat
from sqlalchemy.ext.asyncio import AsyncSession
from twilio.rest import Client

from backend.services import settings_service
from backend.utils.constants import APP_NAME
from backend.utils.datetime_utils import utcnow

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

DEPLOYED_ENVIRONMENTS = {"production", "prod", "staging"}
KNOWN_PLACEHOLDER_JWT_SECRETS = {
    "change-me-in-production",
    "changeme",
    "replace-me",
    "your-secret-key",
}
OPAQUE_TOKEN_DIGEST_PREFIX = "hmac-sha256:v1:"
MINIMUM_DEPLOYED_JWT_SECRET_BYTES = 32


def runtime_security_configuration_issues() -> list[str]:
    """Return unsafe deployed-runtime settings without exposing their values."""
    if os.getenv("ENV", "development").lower() not in DEPLOYED_ENVIRONMENTS:
        return []
    secret = (os.getenv("JWT_SECRET_KEY") or "").strip()
    if (
        not secret
        or secret.lower() in KNOWN_PLACEHOLDER_JWT_SECRETS
        or len(secret.encode("utf-8")) < MINIMUM_DEPLOYED_JWT_SECRET_BYTES
    ):
        return ["JWT_SECRET_KEY"]
    return []


def validate_runtime_security_config() -> None:
    """Reject unsafe authentication configuration before a deployed API starts."""
    if runtime_security_configuration_issues():
        raise RuntimeError("JWT_SECRET_KEY must be configured securely for deployment")


JWT_EXPIRATION_MINUTES = int(
    float(os.getenv("JWT_EXPIRATION_HOURS", "1")) * 60
)  # Access token: read hours from env, convert to minutes (default 1 hour)
REFRESH_TOKEN_EXPIRATION_DAYS = int(
    os.getenv("REFRESH_TOKEN_EXPIRATION_DAYS", "30")
)  # Refresh token: 30 days

# Twilio Configuration
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")
ENABLE_SMS = get_bool_env("ENABLE_SMS", default=True)

# Verification code configuration
VERIFICATION_CODE_LENGTH = 6
VERIFICATION_CODE_EXPIRATION_MINUTES = 10


MIN_PASSWORD_LENGTH = 8


def validate_password_length(password: str) -> None:
    """
    Enforce the minimum password length policy.

    Raises:
        HTTPException(400): if the password is shorter than ``MIN_PASSWORD_LENGTH``.
    """
    from fastapi import HTTPException

    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters long",
        )


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


def hash_opaque_token(token: str, *, purpose: str) -> str:
    """Return a versioned, purpose-separated keyed digest for an opaque token."""
    message = f"{purpose}:{token}".encode("utf-8")
    digest = hmac.new(JWT_SECRET_KEY.encode("utf-8"), message, hashlib.sha256).hexdigest()
    return f"{OPAQUE_TOKEN_DIGEST_PREFIX}{digest}"


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
    Generate a cryptographically secure 6-digit verification code.

    Uses ``secrets`` instead of ``random`` to prevent predictability.

    Returns:
        6-digit code as string
    """
    return f"{secrets.randbelow(900000) + 100000}"


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


# Provider token verification failures are deliberately typed so authenticated
# linking routes can return stable, sanitized diagnostics without leaking JWT
# claims, provider responses, or deployment configuration.
class ProviderTokenError(ValueError):
    """A signed provider token could not be accepted."""


class ProviderAudienceError(ProviderTokenError):
    """The token audience is not in the configured first-party allowlist."""


class ProviderConfigurationError(ProviderTokenError):
    """No usable first-party audience has been configured."""


class ProviderVerificationUnavailableError(ProviderTokenError):
    """Provider verification could not complete due to an external failure."""


def _configured_audiences(
    legacy_value: Optional[str], allowlist_value: Optional[str]
) -> tuple[str, ...]:
    """Return a stable, deduplicated audience allowlist.

    The singular value remains first so existing deployments retain their
    current primary client while plural comma-separated configuration can add
    iOS, Android, and web audiences during migration.
    """
    values = [legacy_value or "", *(allowlist_value or "").split(",")]
    return tuple(dict.fromkeys(value.strip() for value in values if value.strip()))


# Google OAuth Configuration. GOOGLE_CLIENT_ID remains supported; the plural
# value adds explicit first-party platform audiences.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_IDS = os.getenv("GOOGLE_CLIENT_IDS")


def verify_google_id_token(token: str) -> dict:
    """
    Verify a Google ID token and extract user info.

    Uses google.oauth2.id_token to verify the token against Google's
    public keys and validate the audience claim.

    Args:
        token: The ID token string from the Google Sign-In flow

    Returns:
        Dictionary with 'email', 'sub' (Google user ID), 'name', 'picture', 'email_verified'

    Raises:
        ValueError: If token is invalid, expired, or audience doesn't match
    """
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    audiences = _configured_audiences(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_IDS)
    if not audiences:
        raise ProviderConfigurationError("Google token audiences are not configured")

    try:
        # Signature, expiry, and issuer are verified by google-auth. Audience
        # is checked explicitly below so multiple platform clients can be
        # accepted without weakening validation.
        id_info = google_id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            audience=None,
        )

        if id_info.get("aud") not in audiences:
            raise ProviderAudienceError("Google token audience is not allowed")
        if not id_info.get("email_verified"):
            raise ProviderTokenError("Google email is not verified")

        return {
            "email": id_info["email"],
            "sub": id_info["sub"],
            "name": id_info.get("name"),
            "given_name": id_info.get("given_name"),
            "family_name": id_info.get("family_name"),
            "picture": id_info.get("picture"),
            "email_verified": id_info.get("email_verified", False),
            "aud": id_info["aud"],
        }
    except ProviderTokenError:
        raise
    except ValueError as exc:
        raise ProviderTokenError("Invalid Google ID token") from exc
    except Exception as exc:
        logger.warning("Google ID token verification unavailable", exc_info=True)
        raise ProviderVerificationUnavailableError(
            "Google token verification is temporarily unavailable"
        ) from exc


# Apple Sign In Configuration
APPLE_CLIENT_ID = os.getenv("APPLE_CLIENT_ID")  # e.g. "com.beachleague.mobile"
APPLE_CLIENT_IDS = os.getenv("APPLE_CLIENT_IDS")
APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"

# Cache Apple's public keys to avoid fetching on every request
_apple_jwks_cache: Optional[dict] = None


def _fetch_apple_public_keys() -> dict:
    """
    Fetch Apple's public keys (JWKS) for verifying Sign in with Apple tokens.

    Caches the result in module-level variable to avoid repeated HTTP requests.

    Returns:
        JWKS dictionary with Apple's public keys

    Raises:
        ValueError: If the keys cannot be fetched
    """
    global _apple_jwks_cache
    if _apple_jwks_cache is not None:
        return _apple_jwks_cache

    import httpx

    try:
        response = httpx.get(APPLE_KEYS_URL, timeout=10)
        response.raise_for_status()
        _apple_jwks_cache = response.json()
        return _apple_jwks_cache
    except Exception as exc:
        logger.warning("Unable to fetch Apple public keys", exc_info=True)
        raise ProviderVerificationUnavailableError(
            "Apple token verification is temporarily unavailable"
        ) from exc


def verify_apple_id_token(token: str) -> dict:
    """
    Verify an Apple ID token and extract user info.

    Uses python-jose to decode the RS256 JWT against Apple's public JWKS,
    validating issuer and audience claims.

    Args:
        token: The ID token string from the Sign in with Apple flow

    Returns:
        Dictionary with 'email', 'sub' (Apple user ID), 'email_verified'

    Raises:
        ValueError: If token is invalid, expired, or audience doesn't match
    """

    audiences = _configured_audiences(APPLE_CLIENT_ID, APPLE_CLIENT_IDS)
    if not audiences:
        raise ProviderConfigurationError("Apple token audiences are not configured")

    try:
        # Get the key ID from the token header
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        if not kid:
            raise ProviderTokenError("Apple token header is invalid")

        # Read the unverified audience only to select an allowlisted expected
        # value. jwt.decode below still verifies the signed claim exactly.
        unverified_audience = jwt.get_unverified_claims(token).get("aud")
        if unverified_audience not in audiences:
            raise ProviderAudienceError("Apple token audience is not allowed")

        # Fetch Apple's public keys and find the matching key
        jwks = _fetch_apple_public_keys()
        matching_key = None
        for key in jwks.get("keys", []):
            if key["kid"] == kid:
                matching_key = key
                break

        if matching_key is None:
            # Invalidate cache and retry once — Apple may have rotated keys
            global _apple_jwks_cache
            _apple_jwks_cache = None
            jwks = _fetch_apple_public_keys()
            for key in jwks.get("keys", []):
                if key["kid"] == kid:
                    matching_key = key
                    break

        if matching_key is None:
            raise ProviderTokenError("Apple token signing key is not recognized")

        # Verify and decode the token
        payload = jwt.decode(
            token,
            matching_key,
            algorithms=["RS256"],
            audience=unverified_audience,
            issuer="https://appleid.apple.com",
        )

        email = payload.get("email")
        if not email:
            raise ProviderTokenError("Apple token is missing a required claim")

        return {
            "email": email,
            "sub": payload["sub"],
            "email_verified": payload.get("email_verified", False),
            "aud": payload["aud"],
        }
    except JWTError as e:
        raise ProviderTokenError("Invalid Apple ID token") from e
    except ProviderTokenError:
        raise
    except Exception as exc:
        logger.warning("Apple ID token verification unavailable", exc_info=True)
        raise ProviderVerificationUnavailableError(
            "Apple token verification is temporarily unavailable"
        ) from exc


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
        logger.info("SMS delivery disabled; verification delivery skipped")
        return True  # Return True to not break the flow, but log that SMS was skipped

    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER]):
        logger.error("Verification SMS provider is not configured")
        return False

    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

        client.messages.create(
            body=f"{APP_NAME}: Your verification code is: {code}",
            from_=TWILIO_PHONE_NUMBER,
            to=phone_number,
        )

        logger.info("Verification SMS accepted by provider")
        return True

    except Exception as exc:
        logger.error(
            "Verification SMS provider request failed error_code=%s",
            type(exc).__name__,
        )
        return False
