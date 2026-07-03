"""
Push notification preferences service.

Provides get/update operations for per-user push preference rows, plus a
``should_send_push`` predicate used by notification_service to gate the push
send path (the in-app DB notification is always created regardless of prefs).
"""

from typing import Dict, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import PushNotificationPreference, NotificationType

# ---------------------------------------------------------------------------
# Pref-key → NotificationType mapping
#
# Maps each boolean column in PushNotificationPreference to the set of
# NotificationType values it controls. Notification types that don't appear
# here are sent unconditionally (no per-type toggle).
# ---------------------------------------------------------------------------

_PREF_TO_TYPES: Dict[str, list[str]] = {
    "direct_messages": [NotificationType.DIRECT_MESSAGE.value],
    "league_messages": [
        NotificationType.LEAGUE_MESSAGE.value,
        NotificationType.LEAGUE_INVITE.value,
        NotificationType.LEAGUE_JOIN_REQUEST.value,
        NotificationType.LEAGUE_JOIN_REJECTED.value,
        NotificationType.MEMBER_JOINED.value,
        NotificationType.MEMBER_REMOVED.value,
        NotificationType.SEASON_START.value,
        NotificationType.SEASON_ACTIVATED.value,
        NotificationType.PLACEHOLDER_CLAIMED.value,
    ],
    "friend_requests": [
        NotificationType.FRIEND_REQUEST.value,
        NotificationType.FRIEND_ACCEPTED.value,
    ],
    "match_invites": [
        NotificationType.SESSION_SUBMITTED.value,
        NotificationType.SESSION_AUTO_SUBMITTED.value,
        NotificationType.SESSION_AUTO_DELETED.value,
    ],
    "tournament_updates": [],  # Reserved for future tournament push types
    "ranking_changes": [NotificationType.SEASON_AWARD.value],
}

# Reverse lookup: notification type value → pref key
_TYPE_TO_PREF: Dict[str, str] = {
    ntype: pref_key for pref_key, ntypes in _PREF_TO_TYPES.items() for ntype in ntypes
}

# ---------------------------------------------------------------------------
# Default preference values (returned when no DB row exists)
# ---------------------------------------------------------------------------

_DEFAULTS: Dict[str, bool] = {
    "push_enabled": True,
    "direct_messages": True,
    "league_messages": True,
    "friend_requests": True,
    "match_invites": True,
    "tournament_updates": False,
    "ranking_changes": False,
}

# Explicit allowlist of ORM columns that update_prefs is permitted to write.
# Derived from _DEFAULTS so it stays in sync with the preference schema.
# Using an allowlist (rather than hasattr) prevents arbitrary ORM attribute
# writes if update_prefs is ever called with untrusted field names.
_WRITABLE_PREF_FIELDS: frozenset[str] = frozenset(_DEFAULTS.keys())


def _row_to_dict(row: PushNotificationPreference) -> Dict[str, bool]:
    """Serialize a PushNotificationPreference ORM row to a plain dict."""
    return {
        "push_enabled": row.push_enabled,
        "direct_messages": row.direct_messages,
        "league_messages": row.league_messages,
        "friend_requests": row.friend_requests,
        "match_invites": row.match_invites,
        "tournament_updates": row.tournament_updates,
        "ranking_changes": row.ranking_changes,
    }


async def get_prefs(session: AsyncSession, user_id: int) -> Dict[str, bool]:
    """Return the push preferences for ``user_id``.

    If no row exists yet, returns the all-defaults dict without writing
    anything to the DB (write-on-first-save semantics).

    Args:
        session: Active async DB session.
        user_id: Authenticated user's ID.

    Returns:
        Dict with all 7 preference boolean fields.
    """
    result = await session.execute(
        select(PushNotificationPreference).where(PushNotificationPreference.user_id == user_id)
    )
    row = result.scalar_one_or_none()
    return _row_to_dict(row) if row is not None else dict(_DEFAULTS)


async def update_prefs(
    session: AsyncSession,
    user_id: int,
    updates: Dict[str, Optional[bool]],
) -> Dict[str, bool]:
    """Upsert push preferences for ``user_id``.

    Fetches or creates the preference row, applies only the provided
    (non-None) fields, persists, and returns the full updated dict.

    Args:
        session: Active async DB session.
        user_id: Authenticated user's ID.
        updates: Partial dict mapping pref field names to new values.
                 Fields absent or set to ``None`` are not changed.

    Returns:
        Dict with all 7 preference boolean fields after the update.
    """
    result = await session.execute(
        select(PushNotificationPreference).where(PushNotificationPreference.user_id == user_id)
    )
    row = result.scalar_one_or_none()

    if row is None:
        # Create from defaults, then apply the partial update
        row = PushNotificationPreference(
            user_id=user_id,
            **{k: v for k, v in _DEFAULTS.items()},
        )
        session.add(row)

    # Apply only provided (non-None) fields that are in the explicit allowlist.
    # Gating on _WRITABLE_PREF_FIELDS (not just hasattr) prevents arbitrary
    # ORM attribute writes if this function is ever called with untrusted input.
    for field, value in updates.items():
        if value is not None and field in _WRITABLE_PREF_FIELDS:
            setattr(row, field, value)

    await session.flush()
    await session.refresh(row)
    return _row_to_dict(row)


def should_send_push(prefs: Dict[str, bool], notification_type: str) -> bool:
    """Determine whether a push notification should be sent.

    Returns ``True`` when push should be sent, ``False`` when it should be
    suppressed. The in-app notification DB row is always created regardless.

    Decision logic:
    1. If ``push_enabled`` is False → suppress (master kill-switch).
    2. Look up the per-type pref for ``notification_type``. If the type has
       no per-type mapping it is treated as always-send (returns True).
    3. Return the per-type pref value.

    Args:
        prefs: Dict returned by ``get_prefs()`` (or ``_DEFAULTS`` equivalent).
        notification_type: The NotificationType enum value string (e.g.
            ``"direct_message"``).

    Returns:
        ``True`` if push should be sent, ``False`` if it should be skipped.
    """
    if not prefs.get("push_enabled", True):
        return False

    pref_key = _TYPE_TO_PREF.get(notification_type)
    if pref_key is None:
        # No per-type pref configured → allow push
        return True

    return bool(prefs.get(pref_key, True))
