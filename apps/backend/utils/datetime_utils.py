"""
Datetime utility functions.
Provides replacements for deprecated datetime functions.
"""

from datetime import datetime
from typing import Union
import pytz


def utcnow() -> datetime:
    """
    Get current UTC datetime using pytz.UTC.

    Returns:
        Current UTC datetime with pytz timezone information
    """
    return datetime.now(pytz.UTC)


def format_session_date(date_input: Union[str, datetime]) -> str:
    """
    Format a date for session naming in M/D/YYYY format (no leading zeros).

    This function handles multiple input formats and normalizes them
    to the standard session naming format used throughout the application.

    Args:
        date_input: Date as string (ISO "2026-01-21", US "1/21/2026", "01/21/2026")
                   or datetime object

    Returns:
        Formatted date string like "1/21/2026" (no leading zeros)

    Examples:
        >>> format_session_date("2026-01-21")
        "1/21/2026"
        >>> format_session_date("1/21/2026")
        "1/21/2026"
        >>> format_session_date("01/21/2026")
        "1/21/2026"
    """
    if isinstance(date_input, datetime):
        # Handle datetime object
        return f"{date_input.month}/{date_input.day}/{date_input.year}"

    if not isinstance(date_input, str):
        raise ValueError(f"Expected string or datetime, got {type(date_input)}")

    date_str = date_input.strip()

    # Try ISO format first (YYYY-MM-DD)
    if "-" in date_str and len(date_str) == 10 and date_str[4] == "-":
        try:
            parsed = datetime.strptime(date_str, "%Y-%m-%d")
            return f"{parsed.month}/{parsed.day}/{parsed.year}"
        except ValueError:
            pass

    # Try US format with slashes (M/D/YYYY or MM/DD/YYYY)
    if "/" in date_str:
        parts = date_str.split("/")
        if len(parts) == 3:
            try:
                month = int(parts[0])
                day = int(parts[1])
                year = int(parts[2])
                return f"{month}/{day}/{year}"
            except ValueError:
                pass

    # If already in correct format or can't parse, return as-is
    # This maintains backwards compatibility
    return date_str
