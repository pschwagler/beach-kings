"""
Integration tests for :func:`search_players_with_relevance`.

Verifies the relevance bucket assignment (friend > friend_of_friend >
recent_opponent > session > league > other) and the resulting sort order
returned by the picker search.
"""

import pytest
import pytest_asyncio

from backend.services import player_data
from backend.database.models import (
    Friend,
    League,
    LeagueMember,
    Match,
    Player,
    Session,
    SessionParticipant,
    SessionStatus,
    User,
)


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


async def _create_player(db_session, name: str, *, with_user: bool = False) -> int:
    """Create a Player (optionally backed by a User) and return its id."""
    user_id = None
    if with_user:
        user = User(
            phone_number=f"+1555{name.replace(' ', '')[:8].zfill(8)}",
            password_hash="hash",
            is_verified=True,
        )
        db_session.add(user)
        await db_session.flush()
        user_id = user.id

    player = Player(full_name=name, user_id=user_id)
    db_session.add(player)
    await db_session.flush()
    await db_session.refresh(player)
    return player.id


async def _add_friendship(db_session, player_a: int, player_b: int) -> None:
    """Insert a Friend row (player1_id < player2_id per CheckConstraint)."""
    p1, p2 = sorted([player_a, player_b])
    db_session.add(Friend(player1_id=p1, player2_id=p2))
    await db_session.flush()


@pytest_asyncio.fixture
async def daniel_universe(db_session):
    """
    Fixture: a caller plus six 'Daniel' candidates, each in a distinct bucket
    so a single search('Daniel') hits every code path.

    Returns the dict of player ids.
    """
    caller_id = await _create_player(db_session, "Test Caller", with_user=True)

    friend = await _create_player(db_session, "Daniel Friend")
    fof = await _create_player(db_session, "Daniel FoF")
    opp = await _create_player(db_session, "Daniel Opponent")
    sess = await _create_player(db_session, "Daniel Session")
    lg = await _create_player(db_session, "Daniel League")
    other = await _create_player(db_session, "Daniel Other")

    # Friend graph: caller <-> friend; friend <-> fof  (fof is 1 hop away)
    await _add_friendship(db_session, caller_id, friend)
    await _add_friendship(db_session, friend, fof)

    # Recent match (today) — caller + opp on opposing teams.
    placeholder_a = await _create_player(db_session, "Fill A")
    placeholder_b = await _create_player(db_session, "Fill B")
    sess_row = Session(
        date="2026-05-11",
        name="Recent",
        status=SessionStatus.ACTIVE,
    )
    db_session.add(sess_row)
    await db_session.flush()
    db_session.add(
        Match(
            session_id=sess_row.id,
            team1_player1_id=caller_id,
            team1_player2_id=placeholder_a,
            team2_player1_id=opp,
            team2_player2_id=placeholder_b,
            team1_score=21,
            team2_score=15,
            winner=1,
        )
    )

    # Session membership — independent session
    other_session = Session(
        date="2026-05-11", name="Picker Ctx", status=SessionStatus.ACTIVE
    )
    db_session.add(other_session)
    await db_session.flush()
    db_session.add(SessionParticipant(session_id=other_session.id, player_id=sess))

    # League membership
    league = League(name="Test League", is_open=True)
    db_session.add(league)
    await db_session.flush()
    db_session.add(LeagueMember(league_id=league.id, player_id=lg))

    await db_session.flush()

    return {
        "caller": caller_id,
        "friend": friend,
        "fof": fof,
        "opp": opp,
        "session": sess,
        "league": lg,
        "other": other,
        "session_id": other_session.id,
        "league_id": league.id,
    }


# ---------------------------------------------------------------------------
# Empty-query (default roster) behavior
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_empty_query_with_no_caller_returns_empty(db_session):
    """No caller + no context → nothing to rank, return empty."""
    result = await player_data.search_players_with_relevance(
        db_session, q="", caller_player_id=None
    )
    assert result == []


@pytest.mark.asyncio
async def test_empty_query_returns_caller_network(db_session, daniel_universe):
    """
    Empty q should return the caller's network — friends, FoF, recent
    opponents, plus session/league members when those contexts are set.
    """
    ids = daniel_universe
    result = await player_data.search_players_with_relevance(
        db_session,
        q="",
        caller_player_id=ids["caller"],
        session_id=ids["session_id"],
        league_id=ids["league_id"],
    )
    returned_ids = {item["id"] for item in result}
    # In-network players appear.
    assert ids["friend"] in returned_ids
    assert ids["fof"] in returned_ids
    assert ids["opp"] in returned_ids
    assert ids["session"] in returned_ids
    assert ids["league"] in returned_ids
    # Out-of-network player (no relation) does NOT appear — no name match
    # to surface them.
    assert ids["other"] not in returned_ids


@pytest.mark.asyncio
async def test_empty_query_sort_order(db_session, daniel_universe):
    """
    Empty-q results in a league match lead with league members, then fall
    back to the friend > FoF > opp > session ordering.
    """
    ids = daniel_universe
    result = await player_data.search_players_with_relevance(
        db_session,
        q="",
        caller_player_id=ids["caller"],
        session_id=ids["session_id"],
        league_id=ids["league_id"],
    )
    relations = [item["relation"] for item in result]
    seen = []
    for r in relations:
        if r not in seen:
            seen.append(r)
    assert seen == ["league", "friend", "friend_of_friend", "recent_opponent", "session"]


@pytest.mark.asyncio
async def test_empty_query_excludes_caller(db_session, daniel_universe):
    """The caller themselves never appears in the default-roster results."""
    ids = daniel_universe
    result = await player_data.search_players_with_relevance(
        db_session,
        q="",
        caller_player_id=ids["caller"],
        league_id=ids["league_id"],
    )
    returned_ids = {item["id"] for item in result}
    assert ids["caller"] not in returned_ids


@pytest.mark.asyncio
async def test_empty_query_excludes_placeholders(db_session, daniel_universe):
    """Placeholder league members shouldn't surface in the empty-q default roster."""
    ids = daniel_universe
    placeholder = Player(
        full_name="Daniel Placeholder Member",
        is_placeholder=True,
        created_by_player_id=ids["caller"],
    )
    db_session.add(placeholder)
    await db_session.flush()
    db_session.add(
        LeagueMember(league_id=ids["league_id"], player_id=placeholder.id)
    )
    await db_session.flush()

    result = await player_data.search_players_with_relevance(
        db_session,
        q="",
        caller_player_id=ids["caller"],
        league_id=ids["league_id"],
    )
    returned_ids = {item["id"] for item in result}
    assert placeholder.id not in returned_ids
    # Real league member still appears.
    assert ids["league"] in returned_ids


@pytest.mark.asyncio
async def test_empty_query_respects_limit(db_session):
    """The `limit` arg caps the empty-q default-roster size."""
    caller_id = await _create_player(db_session, "Caller", with_user=True)
    for i in range(5):
        friend_id = await _create_player(db_session, f"Friend {i:02d}")
        await _add_friendship(db_session, caller_id, friend_id)

    result = await player_data.search_players_with_relevance(
        db_session, q="", caller_player_id=caller_id, limit=3
    )
    assert len(result) == 3
    assert all(item["relation"] == "friend" for item in result)


@pytest.mark.asyncio
async def test_whitespace_only_query_uses_default_roster(db_session, daniel_universe):
    """Whitespace-only term is treated as empty (default-roster path)."""
    ids = daniel_universe
    result = await player_data.search_players_with_relevance(
        db_session, q="   ", caller_player_id=ids["caller"]
    )
    returned_ids = {item["id"] for item in result}
    # Friend (caller has one in the fixture) should surface even on whitespace q.
    assert ids["friend"] in returned_ids


# ---------------------------------------------------------------------------
# Relation buckets
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_assigns_friend_bucket(db_session, daniel_universe):
    """A direct friend matching the query is bucketed as 'friend'."""
    ids = daniel_universe
    result = await player_data.search_players_with_relevance(
        db_session, q="Daniel", caller_player_id=ids["caller"]
    )
    by_id = {item["id"]: item for item in result}
    assert by_id[ids["friend"]]["relation"] == "friend"


@pytest.mark.asyncio
async def test_assigns_friend_of_friend_bucket(db_session, daniel_universe):
    """A friend-of-a-friend (not a direct friend) is bucketed as 'friend_of_friend'."""
    ids = daniel_universe
    result = await player_data.search_players_with_relevance(
        db_session, q="Daniel", caller_player_id=ids["caller"]
    )
    by_id = {item["id"]: item for item in result}
    assert by_id[ids["fof"]]["relation"] == "friend_of_friend"


@pytest.mark.asyncio
async def test_assigns_recent_opponent_bucket(db_session, daniel_universe):
    """A player who shared a recent match with the caller is 'recent_opponent'."""
    ids = daniel_universe
    result = await player_data.search_players_with_relevance(
        db_session, q="Daniel", caller_player_id=ids["caller"]
    )
    by_id = {item["id"]: item for item in result}
    assert by_id[ids["opp"]]["relation"] == "recent_opponent"


@pytest.mark.asyncio
async def test_assigns_session_bucket(db_session, daniel_universe):
    """A player in the picker's session context is bucketed as 'session'."""
    ids = daniel_universe
    result = await player_data.search_players_with_relevance(
        db_session,
        q="Daniel",
        caller_player_id=ids["caller"],
        session_id=ids["session_id"],
    )
    by_id = {item["id"]: item for item in result}
    assert by_id[ids["session"]]["relation"] == "session"


@pytest.mark.asyncio
async def test_assigns_league_bucket(db_session, daniel_universe):
    """A player in the picker's league context is bucketed as 'league'."""
    ids = daniel_universe
    result = await player_data.search_players_with_relevance(
        db_session,
        q="Daniel",
        caller_player_id=ids["caller"],
        league_id=ids["league_id"],
    )
    by_id = {item["id"]: item for item in result}
    assert by_id[ids["league"]]["relation"] == "league"


@pytest.mark.asyncio
async def test_assigns_other_bucket(db_session, daniel_universe):
    """A bare name match with no caller relation falls through to 'other'."""
    ids = daniel_universe
    result = await player_data.search_players_with_relevance(
        db_session, q="Daniel", caller_player_id=ids["caller"]
    )
    by_id = {item["id"]: item for item in result}
    assert by_id[ids["other"]]["relation"] == "other"


# ---------------------------------------------------------------------------
# Ordering
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_default_sort_order_no_league(db_session, daniel_universe):
    """
    Outside a league match (no ``league_id``), friend outranks FoF, FoF
    outranks recent opponent, and so on. The league-only candidate has no
    other relation, so it falls through to ``other``.
    """
    ids = daniel_universe
    result = await player_data.search_players_with_relevance(
        db_session,
        q="Daniel",
        caller_player_id=ids["caller"],
        session_id=ids["session_id"],
    )
    ordered_relations = [item["relation"] for item in result]
    seen = []
    for r in ordered_relations:
        if r not in seen:
            seen.append(r)
    assert seen == [
        "friend",
        "friend_of_friend",
        "recent_opponent",
        "session",
        "other",
    ]


@pytest.mark.asyncio
async def test_league_match_promotes_league_first(db_session, daniel_universe):
    """
    In a league match (``league_id`` set), league members are the most
    relevant pick and rank ahead of even direct friends.
    """
    ids = daniel_universe
    result = await player_data.search_players_with_relevance(
        db_session,
        q="Daniel",
        caller_player_id=ids["caller"],
        session_id=ids["session_id"],
        league_id=ids["league_id"],
    )
    ordered_relations = [item["relation"] for item in result]
    seen = []
    for r in ordered_relations:
        if r not in seen:
            seen.append(r)
    assert seen == [
        "league",
        "friend",
        "friend_of_friend",
        "recent_opponent",
        "session",
        "other",
    ]
    # The league member is the very first result.
    assert result[0]["relation"] == "league"
    assert result[0]["id"] == ids["league"]


# ---------------------------------------------------------------------------
# Exclusions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_excludes_caller_themselves(db_session):
    """The caller should never appear in their own search results."""
    caller_id = await _create_player(db_session, "Daniel Caller", with_user=True)
    other_id = await _create_player(db_session, "Daniel Other")

    result = await player_data.search_players_with_relevance(
        db_session, q="Daniel", caller_player_id=caller_id
    )
    returned_ids = {item["id"] for item in result}
    assert caller_id not in returned_ids
    assert other_id in returned_ids


@pytest.mark.asyncio
async def test_excludes_placeholders(db_session):
    """Placeholder players (invite stubs) should never surface in search."""
    real = await _create_player(db_session, "Daniel Real")
    creator_id = await _create_player(db_session, "Creator")
    placeholder = Player(
        full_name="Daniel Placeholder",
        is_placeholder=True,
        created_by_player_id=creator_id,
    )
    db_session.add(placeholder)
    await db_session.flush()

    result = await player_data.search_players_with_relevance(
        db_session, q="Daniel", caller_player_id=None
    )
    returned_ids = {item["id"] for item in result}
    assert real in returned_ids
    assert placeholder.id not in returned_ids


@pytest.mark.asyncio
async def test_limit_caps_results(db_session):
    """The `limit` arg caps the number of items returned."""
    for i in range(5):
        await _create_player(db_session, f"Daniel {i:02d}")

    result = await player_data.search_players_with_relevance(
        db_session, q="Daniel", caller_player_id=None, limit=2
    )
    assert len(result) == 2
