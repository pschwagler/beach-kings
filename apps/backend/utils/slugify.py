"""URL-safe slug generation utilities."""

import re
import unicodedata


def slugify(text: str) -> str:
    """Convert text to a URL-safe slug (lowercase, hyphens, no special chars).

    Args:
        text: Text to slugify (e.g. "John Doe").

    Returns:
        Slugified text (e.g. "john-doe").
    """
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")
