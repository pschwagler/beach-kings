"""
Pure relevance core for the player picker search.

This module is intentionally DB-free so the scoring rules can be unit tested
in isolation and evolved independently of the SQL that feeds them.

Design
------
Every relationship a player has to the caller is an independent **signal**
worth a fixed number of points. A player's relevance is the *sum* of all
signals that apply in the current context (additive — never bucketed). This
removes the old classifier bug where a single mutually-exclusive bucket could
demote a league member who was also a friend.

Extensibility
-------------
Signals read from a :class:`PlayerSignalMetrics` aggregate that already
carries *counts*, not just booleans. Graded scoring later (e.g. "played the
caller >5 times in the window") is a one-line change to a signal's
``points_fn`` — the framework, collector shape, and callers stay put.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

__all__ = [
    "RECENT_WINDOW_DAYS",
    "POINTS",
    "PlayerSignalMetrics",
    "ScoreContext",
    "Signal",
    "SIGNALS",
    "score_player",
    "tags_for",
]

# Recency window (days) shared by every "recent_*" signal. Single source of
# truth so the whole relevance model moves together if it's ever retuned.
RECENT_WINDOW_DAYS = 90

# Additive point scale. Tuned so a seated player always leads, a context
# league member always outranks a casual acquaintance, etc.
POINTS: dict[str, int] = {
    "in_session": 1000,
    "in_context_league": 150,
    "recent_partner": 20,
    "recent_opp": 20,
    "recent_session": 20,
    "friend": 15,
    "shared_league": 5,
    "fof": 1,
}


@dataclass(frozen=True)
class PlayerSignalMetrics:
    """
    Per-candidate aggregate of the caller's relationship signals.

    Counts (``recent_*_count``) are stored rather than booleans so future
    graded signals need no schema or collector change — today's signals just
    threshold them at ``> 0``.
    """

    is_session: bool = False
    is_context_league: bool = False
    is_friend: bool = False
    is_fof: bool = False
    is_shared_league: bool = False
    recent_partner_count: int = 0
    recent_opp_count: int = 0
    recent_session_count: int = 0


@dataclass(frozen=True)
class ScoreContext:
    """Request context that gates context-sensitive signals/tags."""

    is_league_match: bool


@dataclass(frozen=True)
class Signal:
    """
    One relevance signal.

    ``points_fn`` maps metrics -> points (boolean threshold today, graded
    later). ``applies_fn`` gates the signal on request context; signals that
    apply everywhere keep the default.
    """

    key: str
    points_fn: Callable[[PlayerSignalMetrics], int]
    applies_fn: Callable[[ScoreContext], bool] = field(default=lambda _ctx: True)


SIGNALS: tuple[Signal, ...] = (
    Signal(
        "in_session",
        lambda m: POINTS["in_session"] if m.is_session else 0,
    ),
    Signal(
        "in_context_league",
        lambda m: POINTS["in_context_league"] if m.is_context_league else 0,
        lambda ctx: ctx.is_league_match,
    ),
    Signal(
        "recent_partner",
        lambda m: POINTS["recent_partner"] if m.recent_partner_count > 0 else 0,
    ),
    Signal(
        "recent_opp",
        lambda m: POINTS["recent_opp"] if m.recent_opp_count > 0 else 0,
    ),
    Signal(
        "recent_session",
        lambda m: POINTS["recent_session"] if m.recent_session_count > 0 else 0,
    ),
    Signal(
        "friend",
        lambda m: POINTS["friend"] if m.is_friend else 0,
    ),
    Signal(
        "shared_league",
        lambda m: POINTS["shared_league"] if m.is_shared_league else 0,
    ),
    Signal(
        "fof",
        lambda m: POINTS["fof"] if m.is_fof else 0,
    ),
)


def score_player(metrics: PlayerSignalMetrics, ctx: ScoreContext) -> int:
    """Sum every applicable signal's points for one candidate."""
    return sum(sig.points_fn(metrics) for sig in SIGNALS if sig.applies_fn(ctx))


# Fixed left-to-right pill order. Only these four relationships surface a
# visible pill; every other signal contributes points silently.
def tags_for(metrics: PlayerSignalMetrics, ctx: ScoreContext) -> list[str]:
    """
    Resolve the (at most three) pills shown on a result row.

    The league pill is context-exclusive: a league match shows ``in_league``
    for context-league members (and never also ``shared_league``); a casual
    match shows the distinct ``shared_league`` pill for any common league.
    """
    tags: list[str] = []
    if ctx.is_league_match and metrics.is_context_league:
        tags.append("in_league")
    elif not ctx.is_league_match and metrics.is_shared_league:
        tags.append("shared_league")
    if metrics.is_friend:
        tags.append("friend")
    if metrics.recent_opp_count > 0:
        tags.append("recent_opp")
    return tags
