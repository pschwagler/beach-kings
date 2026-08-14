"""Email service using Resend for transactional notifications."""

import os
import logging
from typing import Optional
from datetime import datetime
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from dotenv import load_dotenv
from backend.services import settings_service
from backend.utils.constants import APP_NAME

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


# Resend configuration
RESEND_API_URL = "https://api.resend.com/emails"
RESEND_API_KEY = os.getenv("RESEND_API_KEY")
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "Beach League <noreply@beachleaguevb.com>")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@beachleaguevb.com")
ENABLE_EMAIL = get_bool_env("ENABLE_EMAIL", default=True)


def configuration_issues() -> list[str]:
    """Return missing provider settings without exposing their values."""
    issues: list[str] = []
    if not (os.getenv("RESEND_API_KEY") or RESEND_API_KEY):
        issues.append("RESEND_API_KEY")
    if not (os.getenv("RESEND_FROM_EMAIL") or RESEND_FROM_EMAIL):
        issues.append("RESEND_FROM_EMAIL")
    return issues


async def send_email_request(
    to_email: str,
    subject: str,
    body: str,
    *,
    idempotency_key: str | None = None,
) -> httpx.Response:
    """Submit a plain-text transactional email to Resend."""
    api_key = os.getenv("RESEND_API_KEY") or RESEND_API_KEY
    from_email = os.getenv("RESEND_FROM_EMAIL") or RESEND_FROM_EMAIL
    if not api_key:
        raise RuntimeError("RESEND_API_KEY is not configured")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    async with httpx.AsyncClient(timeout=15.0) as client:
        return await client.post(
            RESEND_API_URL,
            headers=headers,
            json={
                "from": from_email,
                "to": [to_email],
                "subject": subject,
                "text": body,
            },
        )


async def is_enabled(session: Optional[AsyncSession] = None) -> bool:
    """
    Check if email is enabled, checking database first.

    Args:
        session: Optional database session for checking database settings

    Returns:
        True if email is enabled, False otherwise
    """
    try:
        return await settings_service.get_bool_setting(
            session, "enable_email", env_var="ENABLE_EMAIL", default=True, fallback_to_cache=True
        )
    except Exception as e:
        logger.warning(f"Error getting ENABLE_EMAIL from settings, using default: {e}")
        return ENABLE_EMAIL


async def send_feedback_email(
    feedback_text: str,
    contact_email: Optional[str] = None,
    user_name: Optional[str] = None,
    user_phone: Optional[str] = None,
    timestamp: Optional[datetime] = None,
    session: Optional[AsyncSession] = None,
    category: str = "feedback",
) -> bool:
    """
    Send feedback notification email to admin via Resend.

    Args:
        feedback_text: The feedback message
        contact_email: Optional email provided by the user
        user_name: Name of authenticated user (if logged in)
        user_phone: Phone number of authenticated user (if logged in)
        timestamp: When the feedback was submitted
        session: Optional database session for checking database settings
        category: "feedback" or "support"

    Returns:
        bool: True if email was sent successfully, False otherwise
    """
    # Check if email is disabled (database setting first, then env var)
    enable_email = await is_enabled(session)
    if not enable_email:
        logger.info("Email sending is disabled. Email notification skipped.")
        return True  # Return True to not break the flow, but log that email was skipped

    # If Resend is not configured, log warning and return True (don't fail the request)
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured. Email notification skipped.")
        return True

    try:
        # Format the email content
        label = "Support Request" if category == "support" else "Feedback"
        subject = f"New {label} Received - {APP_NAME}"

        # Build the email body
        body_lines = [
            f"New {label.lower()} has been submitted:",
            "",
            "=" * 60,
            "FEEDBACK:",
            "=" * 60,
            feedback_text,
            "",
            "=" * 60,
            "DETAILS:",
            "=" * 60,
        ]

        if user_name:
            body_lines.append(f"User: {user_name}")
        else:
            body_lines.append("User: Anonymous")

        if user_phone:
            body_lines.append(f"Phone: {user_phone}")

        if contact_email:
            body_lines.append(f"Contact Email: {contact_email}")
        else:
            body_lines.append("Contact Email: Not provided")

        if timestamp:
            body_lines.append(f"Submitted: {timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')}")

        body_lines.extend(
            [
                "",
                "---",
                f"This is an automated message from {APP_NAME} feedback system.",
            ]
        )

        email_body = "\n".join(body_lines)

        response = await send_email_request(ADMIN_EMAIL, subject, email_body)

        if response.status_code >= 200 and response.status_code < 300:
            logger.info(f"Feedback email sent successfully to {ADMIN_EMAIL}")
            return True
        else:
            logger.error("Resend returned status %s", response.status_code)
            return False

    except Exception as e:
        logger.error(f"Failed to send feedback email: {str(e)}")
        # Don't raise the exception - we don't want email failures to break feedback submission
        return False


async def _send_code_email(
    to_email: str,
    subject: str,
    body: str,
    session: Optional[AsyncSession] = None,
    idempotency_key: str | None = None,
) -> bool:
    """
    Generic helper to send a plain-text email via Resend.

    In dev or when email is disabled / Resend is unconfigured, the call is
    logged and the function returns True so signup/reset flows succeed locally.
    """
    enable_email = await is_enabled(session)
    if not enable_email:
        logger.info("Email disabled; verification delivery skipped")
        return True

    if not RESEND_API_KEY:
        logger.warning("Verification email provider is not configured; delivery stubbed")
        return True

    try:
        response = await send_email_request(
            to_email, subject, body, idempotency_key=idempotency_key
        )

        if 200 <= response.status_code < 300:
            logger.info("Verification email accepted by provider")
            return True
        logger.error(
            "Verification email provider returned status %s",
            response.status_code,
        )
        return False
    except Exception as exc:
        logger.error(
            "Verification email provider request failed error_code=%s",
            type(exc).__name__,
        )
        return False


async def send_verification_code_email(
    email: str,
    code: str,
    session: Optional[AsyncSession] = None,
    idempotency_key: str | None = None,
) -> bool:
    """
    Send a signup verification code to the given email address.

    Args:
        email: Recipient email address (assumed normalized/lowercased)
        code: 6-digit verification code
        session: Optional database session for settings lookup

    Returns:
        True on success (or stubbed success in dev), False on send error.
    """
    subject = f"Your {APP_NAME} verification code"
    body = (
        f"Welcome to {APP_NAME}!\n\n"
        f"Your verification code is: {code}\n\n"
        "This code will expire in 10 minutes.\n"
        "If you did not request this code, you can safely ignore this email.\n"
    )
    return await _send_code_email(
        email, subject, body, session=session, idempotency_key=idempotency_key
    )


async def send_password_reset_code_email(
    email: str,
    code: str,
    session: Optional[AsyncSession] = None,
    idempotency_key: str | None = None,
) -> bool:
    """
    Send a password reset verification code to the given email address.

    Args:
        email: Recipient email address (assumed normalized/lowercased)
        code: 6-digit reset code
        session: Optional database session for settings lookup

    Returns:
        True on success (or stubbed success in dev), False on send error.
    """
    subject = f"{APP_NAME} password reset code"
    body = (
        f"We received a request to reset your {APP_NAME} password.\n\n"
        f"Your reset code is: {code}\n\n"
        "This code will expire in 10 minutes.\n"
        "If you did not request a password reset, you can safely ignore this email.\n"
    )
    return await _send_code_email(
        email, subject, body, session=session, idempotency_key=idempotency_key
    )
