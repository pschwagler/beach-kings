"""
Email service using SendGrid for sending notifications.
"""

import os
import logging
from typing import Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email, To, Content
from dotenv import load_dotenv
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


# SendGrid Configuration
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
SENDGRID_FROM_EMAIL = os.getenv("SENDGRID_FROM_EMAIL", "noreply@beachleaguevb.com")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@beachleaguevb.com")
ENABLE_EMAIL = get_bool_env("ENABLE_EMAIL", default=True)


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
) -> bool:
    """
    Send feedback notification email to admin via SendGrid.

    Args:
        feedback_text: The feedback message
        contact_email: Optional email provided by the user
        user_name: Name of authenticated user (if logged in)
        user_phone: Phone number of authenticated user (if logged in)
        timestamp: When the feedback was submitted
        session: Optional database session for checking database settings

    Returns:
        bool: True if email was sent successfully, False otherwise
    """
    # Check if email is disabled (database setting first, then env var)
    enable_email = await is_enabled(session)
    if not enable_email:
        logger.info("Email sending is disabled. Email notification skipped.")
        return True  # Return True to not break the flow, but log that email was skipped

    # If SendGrid is not configured, log warning and return True (don't fail the request)
    if not SENDGRID_API_KEY:
        logger.warning("SENDGRID_API_KEY not configured. Email notification skipped.")
        return True

    try:
        # Format the email content
        subject = "New Feedback Received - Beach League"

        # Build the email body
        body_lines = [
            "New feedback has been submitted:",
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
                "This is an automated message from Beach League feedback system.",
            ]
        )

        email_body = "\n".join(body_lines)

        # Create the email message
        message = Mail(
            from_email=Email(SENDGRID_FROM_EMAIL),
            to_emails=To(ADMIN_EMAIL),
            subject=subject,
            plain_text_content=Content("text/plain", email_body),
        )

        # Send the email
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(message)

        if response.status_code >= 200 and response.status_code < 300:
            logger.info(f"Feedback email sent successfully to {ADMIN_EMAIL}")
            return True
        else:
            logger.error(f"SendGrid returned status {response.status_code}: {response.body}")
            return False

    except Exception as e:
        logger.error(f"Failed to send feedback email: {str(e)}")
        # Don't raise the exception - we don't want email failures to break feedback submission
        return False
