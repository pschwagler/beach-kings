"""Environment-aware frontend URL helpers."""

import os


PRODUCTION_FRONTEND_URL = "https://beachleaguevb.com"
DEFAULT_LOCAL_FRONTEND_PORT = "3000"


def get_frontend_base_url() -> str:
    """Return the public frontend origin for the current deployment.

    ``FRONTEND_URL`` is authoritative for previews, staging, LAN testing, and
    non-standard deployments. Production keeps a safe canonical fallback,
    while development and test environments default to the local web app.
    """
    configured_url = os.getenv("FRONTEND_URL", "").strip()
    if configured_url:
        return configured_url.rstrip("/")

    environment = os.getenv("ENV", "development").strip().lower()
    if environment in {"production", "prod"}:
        return PRODUCTION_FRONTEND_URL

    frontend_port = os.getenv("FRONTEND_PORT", DEFAULT_LOCAL_FRONTEND_PORT).strip()
    return f"http://localhost:{frontend_port or DEFAULT_LOCAL_FRONTEND_PORT}"


def build_invite_url(token: str) -> str:
    """Build the web claim URL for a player invite token."""
    return f"{get_frontend_base_url()}/invite/{token}"
