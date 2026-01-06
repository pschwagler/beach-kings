"""
Datetime utility functions.
Provides replacements for deprecated datetime functions.
"""

from datetime import datetime
import pytz


def utcnow() -> datetime:
    """
    Get current UTC datetime using pytz.UTC.

    Returns:
        Current UTC datetime with pytz timezone information
    """
    return datetime.now(pytz.UTC)
