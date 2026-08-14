"""
Unit tests for :mod:`backend.services.players.player_search_scoring`.

This is the pure, DB-free relevance core: additive signal scoring and the
context-aware tag (pill) rules. Written test-first — see plan in PR.
"""

import pytest

from backend.services.players.player_search_scoring import (
    POINTS,
    RECENT_WINDOW_DAYS,
    PlayerSignalMetrics,
    ScoreContext,
    score_player,
    tags_for,
)

LEAGUE_CTX = ScoreContext(is_league_match=True)
CASUAL_CTX = ScoreContext(is_league_match=False)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------


def test_recent_window_is_90_days():
    """The recency window is a single shared constant (spec: 90 days)."""
    assert RECENT_WINDOW_DAYS == 90


def test_point_values_match_spec():
    """Point weights are exactly the agreed additive scale."""
    assert POINTS == {
        "in_session": 1000,
        "in_context_league": 150,
        "recent_partner": 20,
        "recent_opp": 20,
        "recent_session": 20,
        "friend": 15,
        "shared_league": 5,
        "fof": 1,
    }


# ---------------------------------------------------------------------------
# score_player — single signals
# ---------------------------------------------------------------------------


def test_no_signals_scores_zero():
    """A total stranger (none of the above) scores 0 in any context."""
    m = PlayerSignalMetrics()
    assert score_player(m, LEAGUE_CTX) == 0
    assert score_player(m, CASUAL_CTX) == 0
    assert tags_for(m, LEAGUE_CTX) == []
    assert tags_for(m, CASUAL_CTX) == []


@pytest.mark.parametrize(
    "metrics,expected",
    [
        (PlayerSignalMetrics(is_session=True), 1000),
        (PlayerSignalMetrics(is_friend=True), 15),
        (PlayerSignalMetrics(is_fof=True), 1),
        (PlayerSignalMetrics(is_shared_league=True), 5),
        (PlayerSignalMetrics(recent_partner_count=1), 20),
        (PlayerSignalMetrics(recent_partner_count=9), 20),  # boolean today, count-ready
        (PlayerSignalMetrics(recent_opp_count=1), 20),
        (PlayerSignalMetrics(recent_session_count=1), 20),
    ],
)
def test_single_signal_points_casual(metrics, expected):
    """Each context-independent signal contributes exactly its weight."""
    assert score_player(metrics, CASUAL_CTX) == expected


def test_context_league_only_scores_in_a_league_match():
    """`in_context_league` is gated by ``applies`` — no points in a casual match."""
    m = PlayerSignalMetrics(is_context_league=True)
    assert score_player(m, LEAGUE_CTX) == POINTS["in_context_league"]
    assert score_player(m, CASUAL_CTX) == 0


# ---------------------------------------------------------------------------
# score_player — additive (the actual bug being fixed)
# ---------------------------------------------------------------------------


def test_signals_are_additive_not_bucketed():
    """
    The whole point of the rewrite: a player in many buckets sums them.
    Friend + recent partner + FoF = 15 + 20 + 1.
    """
    m = PlayerSignalMetrics(is_friend=True, recent_partner_count=1, is_fof=True)
    assert score_player(m, CASUAL_CTX) == 15 + 20 + 1


def test_jane_outranks_pure_league_member_in_league_match():
    """
    Regression for the reported bug. In a league match:

      Jane  = context-league + shared-league + friend + recent opp
            = 150 + 5 + 15 + 20 = 190
      Bob   = context-league + shared-league (pure league member)
            = 150 + 5 = 155

    Jane (also a friend/opponent) must sort ABOVE pure league member Bob,
    not get demoted out of the league group.
    """
    jane = PlayerSignalMetrics(
        is_context_league=True,
        is_shared_league=True,
        is_friend=True,
        recent_opp_count=2,
    )
    bob = PlayerSignalMetrics(is_context_league=True, is_shared_league=True)

    jane_score = score_player(jane, LEAGUE_CTX)
    bob_score = score_player(bob, LEAGUE_CTX)

    assert jane_score == 190
    assert bob_score == 155
    assert jane_score > bob_score


def test_in_session_dominates_every_other_combination():
    """
    A seated/session player (+1000) always outranks the richest possible
    non-session player, so they reliably lead the list.
    """
    everything_but_session = PlayerSignalMetrics(
        is_context_league=True,
        is_shared_league=True,
        is_friend=True,
        is_fof=True,
        recent_partner_count=3,
        recent_opp_count=3,
        recent_session_count=3,
    )
    session_only = PlayerSignalMetrics(is_session=True)
    assert score_player(session_only, LEAGUE_CTX) > score_player(
        everything_but_session, LEAGUE_CTX
    )


# ---------------------------------------------------------------------------
# tags_for — pill rules (max 3, context-aware league pill)
# ---------------------------------------------------------------------------


def test_in_league_pill_only_in_league_match():
    """Context-league membership surfaces the 'in_league' pill in a league match."""
    m = PlayerSignalMetrics(is_context_league=True, is_shared_league=True)
    assert tags_for(m, LEAGUE_CTX) == ["in_league"]


def test_shared_league_pill_only_outside_a_league_match():
    """
    Outside a league match there is no context league, so a common league
    surfaces the distinct 'shared_league' pill instead.
    """
    m = PlayerSignalMetrics(is_shared_league=True)
    assert tags_for(m, CASUAL_CTX) == ["shared_league"]


def test_league_pills_are_mutually_exclusive_in_league_match():
    """
    In a league match a context-league member is also shared_league
    (the context league is one of the caller's leagues) — show only the
    single 'in_league' pill, never both.
    """
    m = PlayerSignalMetrics(is_context_league=True, is_shared_league=True)
    tags = tags_for(m, LEAGUE_CTX)
    assert "in_league" in tags
    assert "shared_league" not in tags


def test_no_league_pill_when_context_league_member_in_casual_match():
    """is_context_league is meaningless casually; no shared league => no pill."""
    m = PlayerSignalMetrics(is_context_league=True)
    assert tags_for(m, CASUAL_CTX) == []


def test_friend_and_recent_opp_pills_and_order():
    """
    Full pill set, fixed order: league pill, then friend, then recent opp.
    Max three pills.
    """
    m = PlayerSignalMetrics(
        is_context_league=True,
        is_shared_league=True,
        is_friend=True,
        recent_opp_count=1,
    )
    assert tags_for(m, LEAGUE_CTX) == ["in_league", "friend", "recent_opp"]


def test_scored_but_pill_less_signals_emit_no_tag():
    """
    recent_partner / recent_session / fof add points but never a pill
    (per spec: only In League / Shared league / Friend / Recent opp).
    """
    m = PlayerSignalMetrics(
        recent_partner_count=5,
        recent_session_count=5,
        is_fof=True,
    )
    assert score_player(m, CASUAL_CTX) == 20 + 20 + 1
    assert tags_for(m, CASUAL_CTX) == []
