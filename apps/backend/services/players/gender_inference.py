"""
Gender inference service using Google Gemini Flash.

Provides a best-effort inference of gender (male/female) from a person's
first name. Unknown, ambiguous, or error cases all return None — this
function must never raise.
"""

import asyncio
import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

_GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""

GENDER_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "gender": {
            "type": "string",
            "enum": ["male", "female", "unknown"],
        }
    },
    "required": ["gender"],
}

# Singleton Gemini client; populated lazily on first use.
_client: Any = None


def _get_client() -> Any:
    """Return the module-level Gemini client singleton, creating it if needed.

    Lazy-imports ``google.genai`` so the import cost is not paid unless the
    client is actually needed (i.e. an API key is present and inference is
    requested).
    """
    global _client
    if _client is None:
        from google import genai  # noqa: PLC0415

        _client = genai.Client(api_key=_GEMINI_API_KEY)
    return _client


async def infer_gender_from_name(name: str) -> str | None:
    """Infer likely gender from a person's name using Gemini Flash.

    Sends only the first token of ``name`` to the model to avoid leaking
    full names unnecessarily.  Returns ``"male"`` or ``"female"`` when the
    model is confident, or ``None`` for ambiguous/unknown names, missing API
    keys, empty input, or any error condition.

    This function is intentionally best-effort — it will never raise.

    Args:
        name: The full display name of the person. Only the first word is sent
            to the model.

    Returns:
        ``"male"``, ``"female"``, or ``None``.
    """
    if not _GEMINI_API_KEY or not name.strip():
        return None

    try:
        client = _get_client()
        first_name = name.strip().split()[0]

        def _call() -> str:
            resp = client.models.generate_content(
                model="gemini-3-flash-preview",
                contents=f"First name: {first_name}",
                config={
                    "response_mime_type": "application/json",
                    "response_json_schema": GENDER_SCHEMA,
                    "system_instruction": (
                        "Infer likely gender from the given first name. "
                        "Reply unknown if ambiguous, unisex, or unclear."
                    ),
                },
            )
            if (
                resp
                and resp.candidates
                and resp.candidates[0].content
                and resp.candidates[0].content.parts
            ):
                return resp.candidates[0].content.parts[0].text or ""
            return ""

        raw = await asyncio.to_thread(_call)
        if not raw:
            return None

        gender = json.loads(raw).get("gender", "unknown")
        return gender if gender in ("male", "female") else None

    except Exception:
        logger.warning("gender inference failed for %r", name, exc_info=True)
        return None
