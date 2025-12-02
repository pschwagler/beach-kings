"""
Email service using SendGrid for sending notifications.
"""

import os
import logging
from typing import Optional
from datetime import datetime
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email, To, Content
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

# SendGrid Configuration
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
SENDGRID_FROM_EMAIL = os.getenv("SENDGRID_FROM_EMAIL", "noreply@beachleaguevb.com")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@beachleaguevb.com")


async def send_feedback_email(
    feedback_text: str,
    contact_email: Optional[str] = None,
    user_name: Optional[str] = None,
    user_phone: Optional[str] = None,
    timestamp: Optional[datetime] = None
) -> bool:
    """
    Send feedback notification email to admin via SendGrid.
    
    Args:
        feedback_text: The feedback message
        contact_email: Optional email provided by the user
        user_name: Name of authenticated user (if logged in)
        user_phone: Phone number of authenticated user (if logged in)
        timestamp: When the feedback was submitted
        
    Returns:
        bool: True if email was sent successfully, False otherwise
    """
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
        
        body_lines.extend([
            "",
            "---",
            "This is an automated message from Beach League feedback system.",
        ])
        
        email_body = "\n".join(body_lines)
        
        # Create the email message
        message = Mail(
            from_email=Email(SENDGRID_FROM_EMAIL),
            to_emails=To(ADMIN_EMAIL),
            subject=subject,
            plain_text_content=Content("text/plain", email_body)
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

