"""Runtime emergency controls for user-to-user message creation.

The controls intentionally cover message writes only. Existing message reads and
all safety/account operations remain available when a surface is disabled.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from enum import Enum

from sqlalchemy.ext.asyncio import AsyncSession

from backend.services import settings_service


PROTECTED_ENVS = {"production", "prod", "staging"}
TRUE_VALUES = {"true", "1", "yes", "on", "enabled"}
FALSE_VALUES = {"false", "0", "no", "off", "disabled"}


class MessageSurface(str, Enum):
    DIRECT_MESSAGES = "direct_messages"
    LEAGUE_CHAT = "league_chat"


@dataclass(frozen=True)
class SurfaceConfig:
    setting_key: str
    env_var: str


SURFACE_CONFIG = {
    MessageSurface.DIRECT_MESSAGES: SurfaceConfig(
        setting_key="direct_message_writes_enabled",
        env_var="DIRECT_MESSAGE_WRITES_ENABLED",
    ),
    MessageSurface.LEAGUE_CHAT: SurfaceConfig(
        setting_key="league_chat_writes_enabled",
        env_var="LEAGUE_CHAT_WRITES_ENABLED",
    ),
}


class MessageWritesUnavailable(Exception):
    """A message surface is disabled or lacks valid protected-environment config."""


def _is_protected_environment() -> bool:
    return os.getenv("ENV", "development").strip().lower() in PROTECTED_ENVS


def _parse_bool(value: str | None) -> bool | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in TRUE_VALUES:
        return True
    if normalized in FALSE_VALUES:
        return False
    return None


async def surface_status(session: AsyncSession, surface: MessageSurface) -> str:
    """Return ``enabled``, ``disabled``, or ``misconfigured`` for a surface.

    Missing configuration defaults on in development and test. Protected
    environments require an explicit, valid database or environment value and
    therefore fail closed when configuration cannot be verified.
    """
    config = SURFACE_CONFIG[surface]
    try:
        value = await settings_service.get_setting_with_fallback(
            session,
            config.setting_key,
            env_var=config.env_var,
            default=None,
        )
    except Exception:
        return "misconfigured" if _is_protected_environment() else "enabled"

    enabled = _parse_bool(value)
    if enabled is None:
        return "misconfigured" if _is_protected_environment() else "enabled"
    return "enabled" if enabled else "disabled"


async def enforce_write_enabled(session: AsyncSession, surface: MessageSurface) -> None:
    """Reject a new message write unless its surface is explicitly available."""
    if await surface_status(session, surface) != "enabled":
        raise MessageWritesUnavailable("Messaging is temporarily unavailable")


async def readiness_statuses(session: AsyncSession) -> dict[str, str]:
    """Return privacy-safe readiness values for both message surfaces."""
    return {surface.value: await surface_status(session, surface) for surface in MessageSurface}
