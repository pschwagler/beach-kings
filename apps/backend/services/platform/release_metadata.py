"""Release identity shared by API and background-worker readiness checks."""

import os
import re
import secrets


READINESS_GENERATION_ENV = "RELEASE_READINESS_GENERATION"
READINESS_GENERATION_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")
PROCESS_GENERATION = secrets.token_hex(16)


def configured_readiness_generation() -> str | None:
    """Return the deployment-provided generation when configured and valid."""
    value = os.getenv(READINESS_GENERATION_ENV, "").strip()
    return value if READINESS_GENERATION_PATTERN.fullmatch(value) else None


def readiness_generation() -> str:
    """Use a shared release ID in deployment and a process-local fallback in development."""
    return configured_readiness_generation() or PROCESS_GENERATION
