"""
Unit tests for placeholder player schema, models, and constraints.

Tests Epic 1 deliverables:
- Player.is_placeholder and Player.created_by_player_id columns
- PlayerInvite model (creation, unique token, 1:1 with player)
- InviteStatus and NotificationType.PLACEHOLDER_CLAIMED enum values
- System "Unknown Player" record conventions
- ON DELETE SET NULL behavior for created_by_player_id
"""

import secrets

import pytest
import pytest_asyncio
from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError

from backend.database.models import (
    Player,
    PlayerInvite,
    InviteStatus,
    NotificationType,
)
from backend.services import user_service

# db_session fixture is provided by conftest.py


# ============================================================================
# Fixtures
# ============================================================================


@pytest_asyncio.fixture
async def test_user(db_session):
    """Create a test user."""
    user_id = await user_service.create_user(
        session=db_session,
        phone_number="+15550001111",
        password_hash="hashed_password",
    )
    return user_id


@pytest_asyncio.fixture
async def creator_player(db_session, test_user):
    """Create a real (non-placeholder) player who will create placeholders."""
    player = Player(full_name="Creator Player", user_id=test_user)
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)
    return player


@pytest_asyncio.fixture
async def placeholder_player(db_session, creator_player):
    """Create a placeholder player with an associated invite."""
    player = Player(
        full_name="Placeholder Person",
        is_placeholder=True,
        created_by_player_id=creator_player.id,
        user_id=None,
    )
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)

    invite = PlayerInvite(
        player_id=player.id,
        invite_token=secrets.token_urlsafe(32),
        created_by_player_id=creator_player.id,
        status=InviteStatus.PENDING.value,
    )
    db_session.add(invite)
    await db_session.commit()
    await db_session.refresh(invite)

    return player, invite


# ============================================================================
# Player.is_placeholder column tests
# ============================================================================


@pytest.mark.asyncio
async def test_player_is_placeholder_defaults_to_false(db_session, test_user):
    """New players should default to is_placeholder=False."""
    player = Player(full_name="Regular Player", user_id=test_user)
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)

    assert player.is_placeholder is False


@pytest.mark.asyncio
async def test_player_is_placeholder_can_be_set_true(db_session, creator_player):
    """Placeholder players should have is_placeholder=True."""
    player = Player(
        full_name="Ghost Player",
        is_placeholder=True,
        created_by_player_id=creator_player.id,
        user_id=None,
    )
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)

    assert player.is_placeholder is True
    assert player.user_id is None
    assert player.created_by_player_id == creator_player.id


# ============================================================================
# Player.created_by_player_id FK tests
# ============================================================================


@pytest.mark.asyncio
async def test_created_by_player_id_nullable(db_session, test_user):
    """Regular players should have created_by_player_id=NULL."""
    player = Player(full_name="Normal Player", user_id=test_user)
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)

    assert player.created_by_player_id is None


@pytest.mark.asyncio
async def test_created_by_player_id_set_null_on_creator_delete(
    db_session, creator_player
):
    """Deleting the creator should SET NULL on placeholder's created_by_player_id."""
    placeholder = Player(
        full_name="Orphan Placeholder",
        is_placeholder=True,
        created_by_player_id=creator_player.id,
        user_id=None,
    )
    db_session.add(placeholder)
    await db_session.commit()
    await db_session.refresh(placeholder)

    placeholder_id = placeholder.id
    assert placeholder.created_by_player_id == creator_player.id

    # Delete the creator
    await db_session.execute(
        delete(Player).where(Player.id == creator_player.id)
    )
    await db_session.commit()

    # Expire cached objects so re-query hits the DB
    db_session.expire_all()

    # Refresh and verify SET NULL
    result = await db_session.execute(
        select(Player).where(Player.id == placeholder_id)
    )
    orphan = result.scalar_one()
    assert orphan.created_by_player_id is None
    assert orphan.is_placeholder is True


# ============================================================================
# PlayerInvite model tests
# ============================================================================


@pytest.mark.asyncio
async def test_create_player_invite(db_session, placeholder_player):
    """Test basic PlayerInvite creation."""
    player, invite = placeholder_player

    assert invite.id is not None
    assert invite.player_id == player.id
    assert invite.invite_token is not None
    assert len(invite.invite_token) > 0
    assert invite.status == InviteStatus.PENDING.value
    assert invite.claimed_by_user_id is None
    assert invite.claimed_at is None
    assert invite.created_at is not None


@pytest.mark.asyncio
async def test_invite_token_must_be_unique(db_session, creator_player):
    """Two invites cannot share the same token."""
    token = secrets.token_urlsafe(32)

    player1 = Player(
        full_name="P1",
        is_placeholder=True,
        created_by_player_id=creator_player.id,
    )
    player2 = Player(
        full_name="P2",
        is_placeholder=True,
        created_by_player_id=creator_player.id,
    )
    db_session.add_all([player1, player2])
    await db_session.commit()
    await db_session.refresh(player1)
    await db_session.refresh(player2)

    invite1 = PlayerInvite(
        player_id=player1.id,
        invite_token=token,
        created_by_player_id=creator_player.id,
    )
    db_session.add(invite1)
    await db_session.commit()

    invite2 = PlayerInvite(
        player_id=player2.id,
        invite_token=token,  # duplicate token
        created_by_player_id=creator_player.id,
    )
    db_session.add(invite2)

    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_one_invite_per_player(db_session, placeholder_player, creator_player):
    """Each placeholder can have only one invite (1:1 relationship)."""
    player, existing_invite = placeholder_player

    duplicate_invite = PlayerInvite(
        player_id=player.id,  # same player
        invite_token=secrets.token_urlsafe(32),
        created_by_player_id=creator_player.id,
    )
    db_session.add(duplicate_invite)

    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_invite_cascades_on_player_delete(
    db_session, placeholder_player, creator_player
):
    """Deleting a placeholder player should CASCADE delete its invite."""
    player, invite = placeholder_player
    invite_id = invite.id

    await db_session.execute(
        delete(Player).where(Player.id == player.id)
    )
    await db_session.commit()

    result = await db_session.execute(
        select(PlayerInvite).where(PlayerInvite.id == invite_id)
    )
    assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_invite_phone_number_optional(db_session, creator_player):
    """Phone number on invite is optional."""
    player = Player(
        full_name="No Phone",
        is_placeholder=True,
        created_by_player_id=creator_player.id,
    )
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)

    # Without phone
    invite = PlayerInvite(
        player_id=player.id,
        invite_token=secrets.token_urlsafe(32),
        created_by_player_id=creator_player.id,
    )
    db_session.add(invite)
    await db_session.commit()
    await db_session.refresh(invite)

    assert invite.phone_number is None


@pytest.mark.asyncio
async def test_invite_with_phone_number(db_session, creator_player):
    """Phone number can be stored on the invite."""
    player = Player(
        full_name="Has Phone",
        is_placeholder=True,
        created_by_player_id=creator_player.id,
    )
    db_session.add(player)
    await db_session.commit()
    await db_session.refresh(player)

    invite = PlayerInvite(
        player_id=player.id,
        invite_token=secrets.token_urlsafe(32),
        created_by_player_id=creator_player.id,
        phone_number="+15559876543",
    )
    db_session.add(invite)
    await db_session.commit()
    await db_session.refresh(invite)

    assert invite.phone_number == "+15559876543"


@pytest.mark.asyncio
async def test_invite_status_check_constraint_in_model():
    """Verify the check constraint is defined in the ORM metadata.

    The actual DB-level constraint is enforced by migration 017.
    This test confirms the model definition matches.
    """
    table = PlayerInvite.__table__
    check_constraints = [
        c for c in table.constraints if hasattr(c, "sqltext")
    ]
    constraint_texts = [str(c.sqltext) for c in check_constraints]
    assert any(
        "pending" in text and "claimed" in text for text in constraint_texts
    ), f"Expected status check constraint, found: {constraint_texts}"


# ============================================================================
# Player ↔ PlayerInvite relationship tests
# ============================================================================


@pytest.mark.asyncio
async def test_player_invite_relationship(db_session, placeholder_player):
    """Player.invite relationship returns the associated invite."""
    player, invite = placeholder_player

    result = await db_session.execute(
        select(Player).where(Player.id == player.id)
    )
    loaded_player = result.scalar_one()
    # Eagerly load the relationship
    await db_session.refresh(loaded_player, ["invite"])

    assert loaded_player.invite is not None
    assert loaded_player.invite.invite_token == invite.invite_token


@pytest.mark.asyncio
async def test_player_created_placeholders_relationship(
    db_session, creator_player
):
    """Creator's created_placeholders relationship lists their placeholders."""
    p1 = Player(
        full_name="Placeholder A",
        is_placeholder=True,
        created_by_player_id=creator_player.id,
    )
    p2 = Player(
        full_name="Placeholder B",
        is_placeholder=True,
        created_by_player_id=creator_player.id,
    )
    db_session.add_all([p1, p2])
    await db_session.commit()

    await db_session.refresh(creator_player, ["created_placeholders"])
    names = {p.full_name for p in creator_player.created_placeholders}
    assert "Placeholder A" in names
    assert "Placeholder B" in names


# ============================================================================
# Enum tests
# ============================================================================


@pytest.mark.asyncio
async def test_notification_type_placeholder_claimed():
    """PLACEHOLDER_CLAIMED should be a valid NotificationType."""
    assert NotificationType.PLACEHOLDER_CLAIMED.value == "placeholder_claimed"
    assert NotificationType.PLACEHOLDER_CLAIMED in NotificationType


@pytest.mark.asyncio
async def test_invite_status_enum_values():
    """InviteStatus should have pending and claimed values."""
    assert InviteStatus.PENDING.value == "pending"
    assert InviteStatus.CLAIMED.value == "claimed"


# ============================================================================
# Unknown Player record conventions
# ============================================================================


@pytest.mark.asyncio
async def test_unknown_player_record_shape(db_session):
    """System 'Unknown Player' record should have is_placeholder=false, user_id=NULL, status='system'."""
    unknown = Player(
        full_name="Unknown Player",
        user_id=None,
        is_placeholder=False,
        status="system",
    )
    db_session.add(unknown)
    await db_session.commit()
    await db_session.refresh(unknown)

    assert unknown.full_name == "Unknown Player"
    assert unknown.user_id is None
    assert unknown.is_placeholder is False
    assert unknown.status == "system"


@pytest.mark.asyncio
async def test_unknown_player_discoverable_by_query(db_session):
    """Unknown Player can be found by the canonical query pattern."""
    unknown = Player(
        full_name="Unknown Player",
        user_id=None,
        is_placeholder=False,
        status="system",
    )
    db_session.add(unknown)
    await db_session.commit()

    result = await db_session.execute(
        select(Player).where(
            Player.full_name == "Unknown Player",
            Player.user_id.is_(None),
            Player.is_placeholder.is_(False),
        )
    )
    found = result.scalar_one_or_none()
    assert found is not None
    assert found.id == unknown.id


# ============================================================================
# Multiple placeholders with same name
# ============================================================================


@pytest.mark.asyncio
async def test_duplicate_placeholder_names_allowed(db_session, creator_player):
    """Two placeholders can have the same full_name (different people with same name)."""
    p1 = Player(
        full_name="John Smith",
        is_placeholder=True,
        created_by_player_id=creator_player.id,
    )
    p2 = Player(
        full_name="John Smith",
        is_placeholder=True,
        created_by_player_id=creator_player.id,
    )
    db_session.add_all([p1, p2])
    await db_session.commit()
    await db_session.refresh(p1)
    await db_session.refresh(p2)

    assert p1.id != p2.id
    assert p1.full_name == p2.full_name == "John Smith"
