"""
Integration tests for :func:`player_data.search_players_with_relevance`.

The picker search is **additive** (every relationship to the caller adds
points; see :mod:`backend.services.player_search_scoring`) and returns **one
bounded, deduped, score-ranked list** — no pagination cursor. The caller's
whole network is returned ranked; a name term additionally appends capped
score-0 strangers.

Two invariants are pinned as property tests because they are the whole point
of the design:

  * no duplicate player ids, ever;
  * a session / league member is always present and correctly flagged even
    off an empty or stale cache (membership is queried live, never cached).
"""

import pytest
import pytest_asyncio

from backend.services import player_data, player_search_cache
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


async def _create_player(
    db_session,
    name: str,
    *,
    with_user: bool = False,
    is_placeholder: bool = False,
    status: str | None = None,
) -> int:
    """Create a Player (optionally user-backed / placeholder / system)."""
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

    player = Player(
        full_name=name,
        user_id=user_id,
        is_placeholder=is_placeholder,
        status=status,
    )
    db_session.add(player)
    await db_session.flush()
    await db_session.refresh(player)
    return player.id


async def _add_friendship(db_session, a: int, b: int) -> None:
    """Insert a Friend row (player1_id < player2_id per CheckConstraint)."""
    p1, p2 = sorted([a, b])
    db_session.add(Friend(player1_id=p1, player2_id=p2))
    await db_session.flush()


async def _recent_match(db_session, *, t1: tuple[int, int], t2: tuple[int, int]):
    """A match in a fresh session (created_at = now → inside the window)."""
    s = Session(date="2026-05-11", name="Recent", status=SessionStatus.ACTIVE)
    db_session.add(s)
    await db_session.flush()
    db_session.add(
        Match(
            session_id=s.id,
            team1_player1_id=t1[0],
            team1_player2_id=t1[1],
            team2_player1_id=t2[0],
            team2_player2_id=t2[1],
            team1_score=21,
            team2_score=15,
            winner=1,
        )
    )
    await db_session.flush()
    return s.id


def _assert_no_dupes(items: list[dict]) -> None:
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), "search returned duplicate players"


@pytest_asyncio.fixture
async def universe(db_session):
    """
    One caller plus eight 'Daniel' candidates spanning every signal, used to
    assert additive scoring, pills, and ordering in one search.
    """
    caller = await _create_player(db_session, "Test Caller", with_user=True)

    friend = await _create_player(db_session, "Daniel Friend")
    fof = await _create_player(db_session, "Daniel FoF")
    opp = await _create_player(db_session, "Daniel Opponent")
    sess = await _create_player(db_session, "Daniel Session")
    lg = await _create_player(db_session, "Daniel League")
    jane = await _create_player(db_session, "Daniel Jane")  # league+friend+opp
    shared = await _create_player(db_session, "Daniel Shared")  # non-ctx league
    other = await _create_player(db_session, "Daniel Other")

    await _add_friendship(db_session, caller, friend)
    await _add_friendship(db_session, friend, fof)
    await _add_friendship(db_session, caller, jane)

    pa = await _create_player(db_session, "Fill A")
    pb = await _create_player(db_session, "Fill B")
    await _recent_match(db_session, t1=(caller, pa), t2=(opp, pb))
    await _recent_match(db_session, t1=(caller, pa), t2=(jane, pb))

    ctx_session = Session(
        date="2026-05-11", name="Picker Ctx", status=SessionStatus.ACTIVE
    )
    db_session.add(ctx_session)
    await db_session.flush()
    db_session.add(SessionParticipant(session_id=ctx_session.id, player_id=sess))

    ctx_league = League(name="Ctx League", is_open=True)
    other_league = League(name="Other League", is_open=True)
    db_session.add_all([ctx_league, other_league])
    await db_session.flush()
    db_session.add_all(
        [
            LeagueMember(league_id=ctx_league.id, player_id=lg),
            LeagueMember(league_id=ctx_league.id, player_id=jane),
            # caller + `shared` share a non-context league.
            LeagueMember(league_id=other_league.id, player_id=caller),
            LeagueMember(league_id=other_league.id, player_id=shared),
        ]
    )
    await db_session.flush()

    return {
        "caller": caller,
        "friend": friend,
        "fof": fof,
        "opp": opp,
        "session": sess,
        "league": lg,
        "jane": jane,
        "shared": shared,
        "other": other,
        "session_id": ctx_session.id,
        "league_id": ctx_league.id,
    }


# ---------------------------------------------------------------------------
# Additive scoring + the reported bug
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_league_match_scores_are_additive_and_ranked(db_session, universe):
    """
    League match, q='Daniel'. Expected scores:
      session 1000 > jane 185 (150+15+20) > league 150 > opp 20 >
      friend 15 > shared 5 (no pill here) > fof 1 > other 0 (stranger)
    """
    u = universe
    items = await player_data.search_players_with_relevance(
        db_session,
        q="Daniel",
        caller_player_id=u["caller"],
        session_id=u["session_id"],
        league_id=u["league_id"],
    )
    _assert_no_dupes(items)
    by_id = {i["id"]: i for i in items}

    assert by_id[u["session"]]["score"] == 1000
    assert by_id[u["jane"]]["score"] == 185
    assert by_id[u["league"]]["score"] == 150
    assert by_id[u["opp"]]["score"] == 20
    assert by_id[u["friend"]]["score"] == 15
    assert by_id[u["shared"]]["score"] == 5
    assert by_id[u["fof"]]["score"] == 1
    assert by_id[u["other"]]["score"] == 0

    order = [i["id"] for i in items]
    assert order == [
        u["session"],
        u["jane"],
        u["league"],
        u["opp"],
        u["friend"],
        u["shared"],
        u["fof"],
        u["other"],
    ]


@pytest.mark.asyncio
async def test_friend_league_member_outranks_pure_league_member(db_session, universe):
    """
    THE regression: Jane (league member who is ALSO a friend + recent opp)
    must sort ABOVE pure league member `league`, and still carry the
    'in_league' pill — never demoted out of the league group.
    """
    u = universe
    items = await player_data.search_players_with_relevance(
        db_session,
        q="Daniel",
        caller_player_id=u["caller"],
        session_id=u["session_id"],
        league_id=u["league_id"],
    )
    order = [i["id"] for i in items]
    assert order.index(u["jane"]) < order.index(u["league"])
    jane = next(i for i in items if i["id"] == u["jane"])
    assert jane["tags"] == ["in_league", "friend", "recent_opp"]


@pytest.mark.asyncio
async def test_pure_league_member_has_in_league_pill(db_session, universe):
    u = universe
    items = await player_data.search_players_with_relevance(
        db_session,
        q="Daniel",
        caller_player_id=u["caller"],
        league_id=u["league_id"],
    )
    lg = next(i for i in items if i["id"] == u["league"])
    assert lg["tags"] == ["in_league"]


# ---------------------------------------------------------------------------
# Context-aware pills
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_shared_league_pill_only_in_casual_match(db_session, universe):
    """Casual match (no league_id): a common league shows 'shared_league'."""
    u = universe
    items = await player_data.search_players_with_relevance(
        db_session, q="Daniel", caller_player_id=u["caller"]
    )
    shared = next(i for i in items if i["id"] == u["shared"])
    assert shared["tags"] == ["shared_league"]
    assert shared["score"] == 5


@pytest.mark.asyncio
async def test_shared_league_member_has_no_pill_in_league_match(db_session, universe):
    """In a league match the only league pill is the context one."""
    u = universe
    items = await player_data.search_players_with_relevance(
        db_session,
        q="Daniel",
        caller_player_id=u["caller"],
        league_id=u["league_id"],
    )
    shared = next(i for i in items if i["id"] == u["shared"])
    assert shared["tags"] == []
    assert shared["score"] == 5  # still scored, just no pill


@pytest.mark.asyncio
async def test_friend_and_recent_opp_pills(db_session, universe):
    u = universe
    items = await player_data.search_players_with_relevance(
        db_session, q="Daniel", caller_player_id=u["caller"]
    )
    by_id = {i["id"]: i for i in items}
    assert by_id[u["friend"]]["tags"] == ["friend"]
    assert by_id[u["opp"]]["tags"] == ["recent_opp"]
    assert by_id[u["fof"]]["tags"] == []  # FoF scores but no pill


# ---------------------------------------------------------------------------
# Name fields on the wire
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_result_item_shape(db_session, universe):
    u = universe
    items = await player_data.search_players_with_relevance(
        db_session, q="Daniel", caller_player_id=u["caller"], league_id=u["league_id"]
    )
    item = items[0]
    assert set(item.keys()) == {
        "id",
        "first_name",
        "last_name",
        "full_name",
        "nickname",
        "initials",
        "tags",
        "score",
        "in_session",
    }
    assert isinstance(item["tags"], list)
    assert isinstance(item["score"], int)
    assert isinstance(item["in_session"], bool)


@pytest.mark.asyncio
async def test_first_and_last_name_are_split_for_client(db_session):
    """first/last are sent so the client can render last-initial etc."""
    caller = await _create_player(db_session, "Caller", with_user=True)
    await _create_player(db_session, "Sandra Bullock")
    items = await player_data.search_players_with_relevance(
        db_session, q="Sandra", caller_player_id=caller
    )
    s = next(i for i in items if i["full_name"] == "Sandra Bullock")
    assert s["first_name"] == "Sandra"
    assert s["last_name"] == "Bullock"
    assert s["initials"] == "SB"


# ---------------------------------------------------------------------------
# Exclusions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_excludes_caller_placeholder_and_system(db_session):
    caller = await _create_player(db_session, "Daniel Caller", with_user=True)
    real = await _create_player(db_session, "Daniel Real")
    ph = await _create_player(db_session, "Daniel Ghost", is_placeholder=True)
    sysp = await _create_player(db_session, "Daniel System", status="system")

    items = await player_data.search_players_with_relevance(
        db_session, q="Daniel", caller_player_id=caller
    )
    ids = {i["id"] for i in items}
    assert real in ids
    assert caller not in ids
    assert ph not in ids
    assert sysp not in ids


# ---------------------------------------------------------------------------
# Single bounded list — query semantics
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_empty_query_returns_full_network_no_strangers(db_session):
    """
    Empty q => the caller's whole ranked network, and *no* strangers
    (returning the entire player table unbounded is the thing we removed).
    """
    caller = await _create_player(db_session, "Caller", with_user=True)
    fr = await _create_player(db_session, "Aaa Friend")
    await _add_friendship(db_session, caller, fr)
    s1 = await _create_player(db_session, "Bbb Stranger")
    s2 = await _create_player(db_session, "Ccc Stranger")

    items = await player_data.search_players_with_relevance(
        db_session, q="", caller_player_id=caller
    )
    ids = {i["id"] for i in items}
    assert ids == {fr}  # network only
    assert s1 not in ids and s2 not in ids
    assert caller not in ids


@pytest.mark.asyncio
async def test_name_query_appends_score0_strangers_after_network(db_session):
    """A name term appends capped score-0 strangers after the ranked network."""
    caller = await _create_player(db_session, "Caller", with_user=True)
    fr = await _create_player(db_session, "Daniel Friend")
    await _add_friendship(db_session, caller, fr)
    st = await _create_player(db_session, "Daniel Stranger")

    items = await player_data.search_players_with_relevance(
        db_session, q="Daniel", caller_player_id=caller
    )
    _assert_no_dupes(items)
    order = [i["id"] for i in items]
    assert order == [fr, st]  # network (15) before stranger (0)
    assert next(i for i in items if i["id"] == st)["score"] == 0


@pytest.mark.asyncio
async def test_stranger_cap_is_respected(db_session):
    caller = await _create_player(db_session, "Caller", with_user=True)
    for i in range(8):
        await _create_player(db_session, f"Daniel S{i:02d}")

    items = await player_data.search_players_with_relevance(
        db_session, q="Daniel", caller_player_id=caller, limit=3
    )
    assert len(items) == 3  # no network, capped strangers
    assert all(i["score"] == 0 for i in items)


@pytest.mark.asyncio
async def test_no_caller_empty_query_returns_empty(db_session):
    """No identity and no search term => nothing to show in a picker."""
    await _create_player(db_session, "Solo Player")
    items = await player_data.search_players_with_relevance(
        db_session, q="", caller_player_id=None
    )
    assert items == []


@pytest.mark.asyncio
async def test_no_caller_name_query_returns_strangers(db_session):
    """No caller + name term => score-0 name matches."""
    await _create_player(db_session, "Solo Player")
    items = await player_data.search_players_with_relevance(
        db_session, q="Solo", caller_player_id=None
    )
    assert any(i["full_name"] == "Solo Player" for i in items)
    assert all(i["score"] == 0 for i in items)


@pytest.mark.asyncio
async def test_no_name_match_returns_empty(db_session):
    caller = await _create_player(db_session, "Caller", with_user=True)
    await _create_player(db_session, "Daniel One")
    items = await player_data.search_players_with_relevance(
        db_session, q="zzzznomatch", caller_player_id=caller
    )
    assert items == []


# ---------------------------------------------------------------------------
# in_session is a layout signal, not a pill
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_in_session_flag_is_a_distinct_layout_signal(db_session, universe):
    """
    Session membership is exposed as a boolean (for the compact-chip group),
    NOT as a pill — it never appears in `tags`.
    """
    u = universe
    items = await player_data.search_players_with_relevance(
        db_session,
        q="Daniel",
        caller_player_id=u["caller"],
        session_id=u["session_id"],
        league_id=u["league_id"],
    )
    by_id = {i["id"]: i for i in items}
    assert by_id[u["session"]]["in_session"] is True
    assert by_id[u["session"]]["tags"] == []  # no pill for session
    assert by_id[u["friend"]]["in_session"] is False
    assert by_id[u["other"]]["in_session"] is False  # stranger


# ---------------------------------------------------------------------------
# Property tests — the structural guarantees (cache-independent)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_no_duplicates_even_when_member_is_also_network(db_session, universe):
    """
    `jane` is a friend (network) AND a context-league member (live set).
    She must appear exactly once, never duplicated across the two sources.
    """
    u = universe
    items = await player_data.search_players_with_relevance(
        db_session,
        q="Daniel",
        caller_player_id=u["caller"],
        session_id=u["session_id"],
        league_id=u["league_id"],
    )
    _assert_no_dupes(items)
    assert sum(1 for i in items if i["id"] == u["jane"]) == 1


@pytest.mark.asyncio
async def test_session_league_member_present_off_empty_cache(
    db_session, universe, monkeypatch
):
    """
    THE safety property. Force a cache hit of an *empty* network (simulating
    a totally stale / cold cache). Session and league members must STILL be
    present and correctly flagged, because membership is queried live and is
    never cached.
    """
    u = universe

    async def _empty_cache(_caller):
        return {}  # cache "hit", but stale/empty

    monkeypatch.setattr(player_search_cache, "load_network", _empty_cache)

    items = await player_data.search_players_with_relevance(
        db_session,
        q="Daniel",
        caller_player_id=u["caller"],
        session_id=u["session_id"],
        league_id=u["league_id"],
    )
    by_id = {i["id"]: i for i in items}

    # Present despite an empty cached network:
    assert u["session"] in by_id
    assert by_id[u["session"]]["in_session"] is True
    assert by_id[u["session"]]["score"] == 1000  # live session signal
    assert u["league"] in by_id
    assert by_id[u["league"]]["tags"] == ["in_league"]
    assert by_id[u["league"]]["score"] == 150  # live league signal


@pytest.mark.asyncio
async def test_cache_hit_matches_cache_miss(db_session, universe, monkeypatch):
    """A populated cache must yield byte-identical results to an empty one."""
    u = universe
    kwargs = dict(
        q="Daniel",
        caller_player_id=u["caller"],
        session_id=u["session_id"],
        league_id=u["league_id"],
    )

    # Miss path (no Redis): compute live.
    miss = await player_data.search_players_with_relevance(db_session, **kwargs)

    # Hit path: back the cache with a dict and prime it.
    store: dict = {}

    async def _set(key, value, expiry_seconds=None):
        store[key] = value
        return True

    async def _get(key):
        return store.get(key)

    monkeypatch.setattr(player_search_cache.redis_service, "redis_set", _set)
    monkeypatch.setattr(player_search_cache.redis_service, "redis_get", _get)

    primed = await player_data.search_players_with_relevance(db_session, **kwargs)
    cached = await player_data.search_players_with_relevance(db_session, **kwargs)

    assert store, "expected the network to be cached after the first call"
    assert miss == primed == cached
