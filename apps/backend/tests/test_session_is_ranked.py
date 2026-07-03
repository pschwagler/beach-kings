"""Tests for per-session is_ranked support.

Covers:
  1. create_session persists is_ranked=True when request field is None (default).
  2. create_session persists is_ranked=False when explicitly requested.
  3. create_session persists is_ranked=True when explicitly requested.
  4. create_match_async inherits ranked_intent from Session.is_ranked
     (not from the match request's is_ranked field).
  5. Placeholder-forced-unranked rule is preserved: if any player is a
     placeholder, effective is_ranked is forced to False regardless of
     ranked_intent (session.is_ranked).
  6. Non-placeholder match with session.is_ranked=False produces
     ranked_intent=False and effective is_ranked=False.
  7. Non-placeholder match with session.is_ranked=True produces
     ranked_intent=True and effective is_ranked=True.
"""

import pytest
import pytest_asyncio
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import Match, Player, Session, User
from backend.models.schemas import CreateMatchRequest
from backend.services import data_service


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def player_a(db_session: AsyncSession) -> Player:
    """A real (non-placeholder) player."""
    user = User(phone_number="+15550000001", password_hash="x")
    db_session.add(user)
    await db_session.flush()
    p = Player(user_id=user.id, full_name="Alice A", first_name="Alice", last_name="A")
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


@pytest_asyncio.fixture
async def player_b(db_session: AsyncSession) -> Player:
    """A second real player."""
    user = User(phone_number="+15550000002", password_hash="x")
    db_session.add(user)
    await db_session.flush()
    p = Player(user_id=user.id, full_name="Bob B", first_name="Bob", last_name="B")
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


@pytest_asyncio.fixture
async def player_c(db_session: AsyncSession) -> Player:
    """A third real player."""
    user = User(phone_number="+15550000003", password_hash="x")
    db_session.add(user)
    await db_session.flush()
    p = Player(user_id=user.id, full_name="Carol C", first_name="Carol", last_name="C")
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


@pytest_asyncio.fixture
async def player_d(db_session: AsyncSession) -> Player:
    """A fourth real player."""
    user = User(phone_number="+15550000004", password_hash="x")
    db_session.add(user)
    await db_session.flush()
    p = Player(user_id=user.id, full_name="Dave D", first_name="Dave", last_name="D")
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


@pytest_asyncio.fixture
async def placeholder_player(db_session: AsyncSession) -> Player:
    """An unregistered placeholder player (no user_id)."""
    p = Player(
        user_id=None,
        full_name="Sub P",
        first_name="Sub",
        last_name="P",
        is_placeholder=True,
    )
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


async def _load_session_orm(db_session: AsyncSession, session_id: int) -> Session:
    """Reload a Session ORM row by id."""
    result = await db_session.execute(select(Session).where(Session.id == session_id))
    return result.scalar_one()


async def _load_match_orm(db_session: AsyncSession, match_id: int) -> Match:
    """Reload a Match ORM row by id."""
    result = await db_session.execute(select(Match).where(Match.id == match_id))
    return result.scalar_one()


# ---------------------------------------------------------------------------
# 1–3. Session creation stores is_ranked
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_session_default_is_ranked(db_session: AsyncSession):
    """When is_ranked is omitted (None), the session is persisted with is_ranked=True."""
    today = date.today().strftime("%-m/%-d/%Y")
    result = await data_service.create_session(db_session, date=today)

    orm = await _load_session_orm(db_session, result["id"])
    assert orm.is_ranked is True


@pytest.mark.asyncio
async def test_create_session_is_ranked_false(db_session: AsyncSession):
    """When is_ranked=False is passed, the session is persisted with is_ranked=False."""
    today = date.today().strftime("%-m/%-d/%Y")
    result = await data_service.create_session(db_session, date=today, is_ranked=False)

    orm = await _load_session_orm(db_session, result["id"])
    assert orm.is_ranked is False


@pytest.mark.asyncio
async def test_create_session_is_ranked_true(db_session: AsyncSession):
    """When is_ranked=True is passed explicitly, the session is persisted with is_ranked=True."""
    today = date.today().strftime("%-m/%-d/%Y")
    result = await data_service.create_session(db_session, date=today, is_ranked=True)

    orm = await _load_session_orm(db_session, result["id"])
    assert orm.is_ranked is True


# ---------------------------------------------------------------------------
# 4–7. Match creation inherits ranked_intent from Session.is_ranked
# ---------------------------------------------------------------------------


def _make_match_request(p1: int, p2: int, p3: int, p4: int, session_id: int) -> CreateMatchRequest:
    """Build a minimal CreateMatchRequest with all four players and a session_id."""
    return CreateMatchRequest(
        session_id=session_id,
        team1_player1_id=p1,
        team1_player2_id=p2,
        team2_player1_id=p3,
        team2_player2_id=p4,
        team1_score=21,
        team2_score=15,
    )


@pytest.mark.asyncio
async def test_match_inherits_ranked_intent_from_session_is_ranked_true(
    db_session: AsyncSession,
    player_a: Player,
    player_b: Player,
    player_c: Player,
    player_d: Player,
):
    """Match ranked_intent and effective is_ranked both come from session.is_ranked=True
    (no placeholders — placeholder rule doesn't fire)."""
    today = date.today().strftime("%-m/%-d/%Y")
    sess = await data_service.create_session(db_session, date=today, is_ranked=True)

    req = _make_match_request(player_a.id, player_b.id, player_c.id, player_d.id, sess["id"])
    match_id = await data_service.create_match_async(db_session, req, sess["id"])

    match = await _load_match_orm(db_session, match_id)
    assert match.ranked_intent is True, "ranked_intent should mirror session.is_ranked=True"
    assert match.is_ranked is True, "effective is_ranked should be True with no placeholders"


@pytest.mark.asyncio
async def test_match_inherits_ranked_intent_from_session_is_ranked_false(
    db_session: AsyncSession,
    player_a: Player,
    player_b: Player,
    player_c: Player,
    player_d: Player,
):
    """Match ranked_intent and effective is_ranked both come from session.is_ranked=False
    (no placeholders — result must still be False)."""
    today = date.today().strftime("%-m/%-d/%Y")
    sess = await data_service.create_session(db_session, date=today, is_ranked=False)

    req = _make_match_request(player_a.id, player_b.id, player_c.id, player_d.id, sess["id"])
    match_id = await data_service.create_match_async(db_session, req, sess["id"])

    match = await _load_match_orm(db_session, match_id)
    assert match.ranked_intent is False, "ranked_intent should mirror session.is_ranked=False"
    assert match.is_ranked is False, "effective is_ranked should be False when intent is False"


@pytest.mark.asyncio
async def test_placeholder_forces_is_ranked_false_regardless_of_session_intent(
    db_session: AsyncSession,
    player_a: Player,
    player_b: Player,
    player_c: Player,
    placeholder_player: Player,
):
    """Placeholder presence forces effective is_ranked=False even when session.is_ranked=True.

    Precedence (documented here and in create_match_async):
      ranked_intent = session.is_ranked  (session-level intent)
      is_ranked     = ranked_intent AND NOT has_placeholders  (effective, computed)
    """
    today = date.today().strftime("%-m/%-d/%Y")
    sess = await data_service.create_session(db_session, date=today, is_ranked=True)

    req = _make_match_request(
        player_a.id, player_b.id, player_c.id, placeholder_player.id, sess["id"]
    )
    match_id = await data_service.create_match_async(db_session, req, sess["id"])

    match = await _load_match_orm(db_session, match_id)
    # Intent inherits from session (True), but placeholder forces effective to False
    assert match.ranked_intent is True, "ranked_intent should still mirror session.is_ranked"
    assert match.is_ranked is False, "placeholder must force effective is_ranked=False"
