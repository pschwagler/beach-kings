"""Tests for ``get_league_detail``'s ``has_pending_request`` flag.

The flag drives the non-member "Request sent" CTA state on the mobile league
detail screen. It must be True only when the *caller* has a pending
``LeagueRequest`` for the league — not approved/rejected requests, and not
another player's request.
"""

import pytest
import pytest_asyncio

import bcrypt
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import League, LeagueRequest, Player
from backend.services import data_service, user_service


@pytest_asyncio.fixture
async def visitor(db_session: AsyncSession):
    """A user + player who is NOT a member of the league under test."""
    password_hash = bcrypt.hashpw(b"test1234", bcrypt.gensalt()).decode()
    user_id = await user_service.create_user(
        session=db_session,
        phone_number="+15550002222",
        password_hash=password_hash,
        email="pending_visitor@example.com",
    )
    p = Player(full_name="Pending Visitor", user_id=user_id)
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return {"user_id": user_id, "player": p}


@pytest_asyncio.fixture
async def open_league(db_session: AsyncSession):
    """An open, public league owned by some other player (visitor is not a member)."""
    owner = Player(full_name="League Owner")
    db_session.add(owner)
    await db_session.commit()
    await db_session.refresh(owner)
    league = League(name="Pending Request League", is_open=True, is_public=True)
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)
    return league


async def _request(db_session, league_id, player_id, status):
    req = LeagueRequest(league_id=league_id, player_id=player_id, status=status)
    db_session.add(req)
    await db_session.commit()


@pytest.mark.asyncio
async def test_has_pending_request_false_without_request(
    db_session: AsyncSession, open_league, visitor
):
    """No request → flag is False (and the visitor is a non-member: user_role None)."""
    detail = await data_service.get_league_detail(
        db_session, open_league.id, visitor["user_id"]
    )
    assert detail is not None
    assert detail["has_pending_request"] is False
    assert detail["user_role"] is None


@pytest.mark.asyncio
async def test_has_pending_request_true_with_pending(
    db_session: AsyncSession, open_league, visitor
):
    """A pending request by the caller → flag is True."""
    await _request(db_session, open_league.id, visitor["player"].id, "pending")
    detail = await data_service.get_league_detail(
        db_session, open_league.id, visitor["user_id"]
    )
    assert detail is not None
    assert detail["has_pending_request"] is True


@pytest.mark.asyncio
async def test_has_pending_request_false_when_rejected(
    db_session: AsyncSession, open_league, visitor
):
    """A rejected (non-pending) request must NOT set the flag."""
    await _request(db_session, open_league.id, visitor["player"].id, "rejected")
    detail = await data_service.get_league_detail(
        db_session, open_league.id, visitor["user_id"]
    )
    assert detail is not None
    assert detail["has_pending_request"] is False
