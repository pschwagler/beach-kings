"""
Redis cache for the picker search's expensive, caller-global signal network.

Only the *caller-global* relationship signals are cached here — friends,
friends-of-friends, shared leagues, and recent partner/opponent/session
counts. These cost 6-8 sequential queries to collect yet change rarely (only
when the caller plays a game or their session roster changes).

Deliberately **not** cached: ``is_session`` / ``is_context_league``. Those
depend on the *picker request context*, are a single indexed lookup each, and
are recomputed live on every read — so a player added to the session a second
ago is always shown, even off a fully stale cache.

Invalidation unit
-----------------
One entry per caller (``picker:v1:caller=<id>``), so invalidation on a game /
roster mutation is a single ``DEL`` per affected player — no SCAN, no
wildcards. Staleness of the rarer drift (friend added, league joined) is
absorbed by the short TTL. Every Redis op degrades to a miss/no-op when Redis
is down, so the floor is exactly the uncached behaviour.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Iterable, Mapping, Optional

from backend.services import redis_service

# Bump when the serialized shape changes; old keys orphan and TTL out.
CACHE_VERSION = "v1"

# TTL is the backstop for drift we do not explicitly invalidate (friend
# add/remove, league join). Long enough to absorb a whole picker interaction;
# short enough that un-invalidated drift self-heals quickly.
CACHE_TTL_SECONDS = 600


@dataclass(frozen=True)
class CallerNetworkSignals:
    """The caller-global signal aggregate for one candidate player.

    Counts (not booleans) are stored for the recent_* signals so future
    graded scoring needs no cache-shape change.
    """

    is_friend: bool = False
    is_fof: bool = False
    is_shared_league: bool = False
    recent_partner_count: int = 0
    recent_opp_count: int = 0
    recent_session_count: int = 0


def cache_key(caller_player_id: int) -> str:
    """Per-caller cache key. The only invalidation handle the system needs."""
    return f"picker:{CACHE_VERSION}:caller={caller_player_id}"


def serialize_network(network: Mapping[int, CallerNetworkSignals]) -> str:
    """Encode a ``{pid: CallerNetworkSignals}`` map to a compact JSON string."""
    rows = [
        [
            pid,
            int(s.is_friend),
            int(s.is_fof),
            int(s.is_shared_league),
            s.recent_partner_count,
            s.recent_opp_count,
            s.recent_session_count,
        ]
        for pid, s in network.items()
    ]
    return json.dumps(rows, separators=(",", ":"))


def deserialize_network(raw: str) -> Optional[dict[int, CallerNetworkSignals]]:
    """
    Decode a cached payload. Returns ``None`` for any malformed / tampered /
    version-mismatched value — the caller treats that as a cache miss and
    recomputes, so a bad entry can never corrupt results.
    """
    try:
        rows = json.loads(raw)
        if not isinstance(rows, list):
            return None
        return {
            int(r[0]): CallerNetworkSignals(
                is_friend=bool(r[1]),
                is_fof=bool(r[2]),
                is_shared_league=bool(r[3]),
                recent_partner_count=int(r[4]),
                recent_opp_count=int(r[5]),
                recent_session_count=int(r[6]),
            )
            for r in rows
        }
    except (ValueError, TypeError, IndexError, json.JSONDecodeError):
        return None


async def load_network(
    caller_player_id: int,
) -> Optional[dict[int, CallerNetworkSignals]]:
    """Return the cached network for a caller, or ``None`` on miss/garbage/down."""
    raw = await redis_service.redis_get(cache_key(caller_player_id))
    if raw is None:
        return None
    return deserialize_network(raw)


async def store_network(
    caller_player_id: int, network: Mapping[int, CallerNetworkSignals]
) -> None:
    """Best-effort cache write; a Redis failure is swallowed by redis_service."""
    await redis_service.redis_set(
        cache_key(caller_player_id),
        serialize_network(network),
        expiry_seconds=CACHE_TTL_SECONDS,
    )


async def invalidate(player_ids: Iterable[int]) -> None:
    """
    Drop the cached network for each affected player (single ``DEL`` each).

    Called synchronously post-commit from the game / session-roster write
    paths. A failed delete is non-fatal: the entry simply TTLs out and, until
    then, only *ranking* is mildly stale — never membership/correctness.
    """
    for pid in {p for p in player_ids if p is not None}:
        await redis_service.redis_delete(cache_key(pid))
