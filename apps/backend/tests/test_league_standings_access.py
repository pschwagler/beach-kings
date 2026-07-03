"""Access-control tests for ``make_require_league_member_or_public``.

This dependency backs the league standings endpoint. Standings are the public
"shop window" shown to non-member visitors, so a non-member must be able to read
a PUBLIC league's standings while a private league stays members-only.
"""

import bcrypt
import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.auth_dependencies import make_require_league_member_or_public
from backend.database.models import League, LeagueMember, Player
from backend.services import user_service


async def _league(db_session: AsyncSession, *, is_public: bool) -> League:
    league = League(name="Standings Access League", is_public=is_public, is_open=is_public)
    db_session.add(league)
    await db_session.commit()
    await db_session.refresh(league)
    return league


async def _user(db_session: AsyncSession, phone: str, email: str) -> dict:
    """Create a real user row and return a minimal auth-user dict."""
    password_hash = bcrypt.hashpw(b"test1234", bcrypt.gensalt()).decode()
    user_id = await user_service.create_user(
        session=db_session,
        phone_number=phone,
        password_hash=password_hash,
        email=email,
    )
    return {"id": user_id, "phone_number": phone, "email": email}


async def _member(db_session: AsyncSession, league: League, user_id: int) -> Player:
    player = Player(full_name="Standings Member", user_id=user_id)
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)
    db_session.add(LeagueMember(league_id=league.id, player_id=player.id, role="member"))
    await db_session.commit()
    return player


# A plain (non-admin) authenticated user dict; no phone/email matches admin settings.
NON_MEMBER_USER = {"id": 9001, "phone_number": "+15550009001", "email": "nm@example.com"}


@pytest.mark.asyncio
async def test_non_member_allowed_for_public_league(db_session):
    """A non-member authenticated user may read a public league's standings."""
    league = await _league(db_session, is_public=True)
    dep = make_require_league_member_or_public()

    result = await dep(league_id=league.id, user=NON_MEMBER_USER, session=db_session)

    assert result == NON_MEMBER_USER


@pytest.mark.asyncio
async def test_non_member_rejected_for_private_league(db_session):
    """A non-member is rejected (403) for a private league."""
    league = await _league(db_session, is_public=False)
    dep = make_require_league_member_or_public()

    with pytest.raises(HTTPException) as exc_info:
        await dep(league_id=league.id, user=NON_MEMBER_USER, session=db_session)

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_member_allowed_for_private_league(db_session):
    """A member may read a private league's standings."""
    league = await _league(db_session, is_public=False)
    member_user = await _user(db_session, "+15550009002", "m@example.com")
    await _member(db_session, league, member_user["id"])
    dep = make_require_league_member_or_public()

    result = await dep(league_id=league.id, user=member_user, session=db_session)

    assert result == member_user


@pytest.mark.asyncio
async def test_unknown_league_rejected(db_session):
    """A non-existent league is rejected (deny-by-default, no info leak)."""
    dep = make_require_league_member_or_public()

    with pytest.raises(HTTPException) as exc_info:
        await dep(league_id=999_999, user=NON_MEMBER_USER, session=db_session)

    assert exc_info.value.status_code == 403
