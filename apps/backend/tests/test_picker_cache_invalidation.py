"""
Post-commit player-picker cache invalidation wiring.

The picker cache (``picker:v1:caller=<pid>``) holds each caller's global
network signals. Those signals go stale when a caller plays a new game or
when a session roster changes, so the write paths must drop exactly the
affected callers' entries synchronously after the commit.

These tests pin the *wiring* contract:
- ``create_match_async`` invalidates every match participant.
- ``add_session_participant`` / ``remove_session_participant`` invalidate
  every current participant of the session plus the changed player.
- No-op write paths (idempotent add, blocked remove) invalidate nothing.
- A failing invalidation never breaks the write (it already committed).
"""

import pytest
import pytest_asyncio

from sqlalchemy import select

from backend.database.models import (
    Player,
    Session,
    SessionParticipant,
    SessionStatus,
    Match,
)
from backend.services import player_search_cache
from backend.services.games.session_data import (
    create_match_async,
    add_session_participant,
    remove_session_participant,
)
from backend.models.schemas import CreateMatchRequest


@pytest_asyncio.fixture
async def four_players(db_session):
    """Four persisted players for match / roster fixtures."""
    players = []
    for i in range(1, 5):
        p = Player(full_name=f"Picker P{i}", gender="M", level="intermediate")
        db_session.add(p)
        await db_session.flush()
        players.append(p)
    return players


@pytest_asyncio.fixture
async def active_session(db_session, four_players):
    """An ACTIVE non-league session created by the first player."""
    sess = Session(
        date="2026-05-16",
        name="Picker invalidation session",
        status=SessionStatus.ACTIVE,
        created_by=four_players[0].id,
    )
    db_session.add(sess)
    await db_session.flush()
    await db_session.commit()
    return sess


@pytest.fixture
def captured_invalidations(monkeypatch):
    """Capture every set of player ids passed to player_search_cache.invalidate."""
    calls: list[set[int]] = []

    async def _fake_invalidate(player_ids):
        calls.append({p for p in player_ids if p is not None})

    monkeypatch.setattr(player_search_cache, "invalidate", _fake_invalidate)
    return calls


# ---------------------------------------------------------------------------
# create_match_async
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_match_invalidates_every_participant(
    db_session, four_players, active_session, captured_invalidations
):
    """Creating a match drops the picker cache for all four players."""
    req = CreateMatchRequest(
        team1_player1_id=four_players[0].id,
        team1_player2_id=four_players[1].id,
        team2_player1_id=four_players[2].id,
        team2_player2_id=four_players[3].id,
        team1_score=21,
        team2_score=15,
    )

    await create_match_async(db_session, req, active_session.id)

    expected = {p.id for p in four_players}
    assert expected in captured_invalidations
    invalidated = set().union(*captured_invalidations)
    assert invalidated == expected


@pytest.mark.asyncio
async def test_create_match_commits_even_if_invalidation_raises(
    db_session, four_players, active_session, monkeypatch
):
    """A failing invalidation must not roll back / break the committed match."""

    async def _boom(_player_ids):
        raise RuntimeError("redis exploded")

    monkeypatch.setattr(player_search_cache, "invalidate", _boom)

    req = CreateMatchRequest(
        team1_player1_id=four_players[0].id,
        team1_player2_id=four_players[1].id,
        team2_player1_id=four_players[2].id,
        team2_player2_id=four_players[3].id,
        team1_score=21,
        team2_score=10,
    )

    match_id = await create_match_async(db_session, req, active_session.id)

    await db_session.rollback()
    row = await db_session.execute(select(Match).where(Match.id == match_id))
    assert row.scalar_one().id == match_id


# ---------------------------------------------------------------------------
# add_session_participant
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_add_participant_invalidates_all_current_plus_new(
    db_session, four_players, active_session, captured_invalidations
):
    """Adding a player invalidates the new player and every existing one."""
    db_session.add(SessionParticipant(session_id=active_session.id, player_id=four_players[0].id))
    db_session.add(SessionParticipant(session_id=active_session.id, player_id=four_players[1].id))
    await db_session.commit()

    added = await add_session_participant(db_session, active_session.id, four_players[2].id)

    assert added is True
    invalidated = set().union(*captured_invalidations)
    assert invalidated == {
        four_players[0].id,
        four_players[1].id,
        four_players[2].id,
    }


@pytest.mark.asyncio
async def test_add_existing_participant_is_noop_and_invalidates_nothing(
    db_session, four_players, active_session, captured_invalidations
):
    """Idempotent re-add changes no state, so nothing is invalidated."""
    db_session.add(SessionParticipant(session_id=active_session.id, player_id=four_players[0].id))
    await db_session.commit()

    added = await add_session_participant(db_session, active_session.id, four_players[0].id)

    assert added is True
    assert captured_invalidations == []


# ---------------------------------------------------------------------------
# remove_session_participant
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_remove_participant_invalidates_remaining_plus_removed(
    db_session, four_players, active_session, captured_invalidations
):
    """Removing a player invalidates everyone still in the session + the removed."""
    for p in four_players[:3]:
        db_session.add(SessionParticipant(session_id=active_session.id, player_id=p.id))
    await db_session.commit()

    removed = await remove_session_participant(db_session, active_session.id, four_players[2].id)

    assert removed is True
    invalidated = set().union(*captured_invalidations)
    assert invalidated == {
        four_players[0].id,
        four_players[1].id,
        four_players[2].id,
    }


@pytest.mark.asyncio
async def test_remove_blocked_by_match_invalidates_nothing(
    db_session, four_players, active_session, captured_invalidations
):
    """A player with a match cannot be removed, so no cache is touched."""
    for p in four_players:
        db_session.add(SessionParticipant(session_id=active_session.id, player_id=p.id))
    db_session.add(
        Match(
            session_id=active_session.id,
            team1_player1_id=four_players[0].id,
            team1_player2_id=four_players[1].id,
            team2_player1_id=four_players[2].id,
            team2_player2_id=four_players[3].id,
            team1_score=21,
            team2_score=12,
            winner=1,
        )
    )
    await db_session.commit()

    removed = await remove_session_participant(db_session, active_session.id, four_players[0].id)

    assert removed is False
    assert captured_invalidations == []
