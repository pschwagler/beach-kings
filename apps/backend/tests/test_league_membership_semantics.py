from uuid import uuid4

import pytest
from sqlalchemy import select

from backend.database.models import (
    League,
    LeagueInvite,
    LeagueMember,
    LeagueRequest,
    Player,
    User,
)
from backend.services import data_service


async def _player(db_session, suffix: str) -> Player:
    user = User(
        phone_number=f"+1{uuid4().int % 10**14:014d}",
        password_hash="hash",
        is_verified=True,
        age_group="adult",
    )
    db_session.add(user)
    await db_session.flush()
    player = Player(full_name=f"Player {suffix}", user_id=user.id)
    db_session.add(player)
    await db_session.flush()
    return player


@pytest.mark.asyncio
async def test_admin_adds_fresh_player_then_self_leave_requires_invitation(db_session):
    admin = await _player(db_session, "0001")
    target = await _player(db_session, "0002")
    league = League(name="Consent League", is_open=False, created_by=admin.id)
    db_session.add(league)
    await db_session.flush()
    db_session.add(
        LeagueMember(
            league_id=league.id,
            player_id=admin.id,
            role="admin",
            created_by=admin.id,
        )
    )
    await db_session.commit()

    first = await data_service.admin_add_league_members(
        db_session,
        league.id,
        [{"player_id": target.id, "role": "member"}],
        admin.id,
    )
    assert [member["player_id"] for member in first["added"]] == [target.id]
    assert first["invited"] == []

    membership = (
        await db_session.execute(
            select(LeagueMember).where(
                LeagueMember.league_id == league.id,
                LeagueMember.player_id == target.id,
            )
        )
    ).scalar_one()
    assert await data_service.remove_league_member(
        db_session,
        league.id,
        membership.id,
        self_left_by_player_id=target.id,
    )

    second = await data_service.admin_add_league_members(
        db_session,
        league.id,
        [{"player_id": target.id, "role": "member"}],
        admin.id,
    )
    assert second["added"] == []
    assert second["invited"] == [target.id]
    invite = (
        await db_session.execute(
            select(LeagueInvite).where(
                LeagueInvite.league_id == league.id,
                LeagueInvite.player_id == target.id,
            )
        )
    ).scalar_one()
    assert invite.status == "pending"


@pytest.mark.asyncio
async def test_pending_request_is_approved_but_rejected_request_requires_invite(db_session):
    admin = await _player(db_session, "0011")
    pending_player = await _player(db_session, "0012")
    rejected_player = await _player(db_session, "0013")
    league = League(name="Public Approval", is_open=True, created_by=admin.id)
    db_session.add(league)
    await db_session.flush()
    db_session.add_all(
        [
            LeagueMember(
                league_id=league.id,
                player_id=admin.id,
                role="admin",
                created_by=admin.id,
            ),
            LeagueRequest(
                league_id=league.id,
                player_id=pending_player.id,
                status="pending",
            ),
            LeagueRequest(
                league_id=league.id,
                player_id=rejected_player.id,
                status="rejected",
            ),
        ]
    )
    await db_session.commit()

    result = await data_service.admin_add_league_members(
        db_session,
        league.id,
        [
            {"player_id": pending_player.id, "role": "member"},
            {"player_id": rejected_player.id, "role": "member"},
        ],
        admin.id,
    )

    assert [member["player_id"] for member in result["added"]] == [pending_player.id]
    assert result["invited"] == [rejected_player.id]
    pending_request = (
        await db_session.execute(
            select(LeagueRequest).where(
                LeagueRequest.league_id == league.id,
                LeagueRequest.player_id == pending_player.id,
            )
        )
    ).scalar_one()
    assert pending_request.status == "approved"
