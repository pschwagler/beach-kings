"""Message-only emergency control behavior."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.database.models import Friend, League, Player, User
from backend.services import (
    direct_message_service,
    friend_service,
    interaction_policy,
    message_data,
    message_write_policy,
    moderation_worker,
    settings_service,
)


@pytest.mark.asyncio
async def test_missing_controls_default_enabled_in_development(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setattr(
        settings_service,
        "get_setting_with_fallback",
        AsyncMock(return_value=None),
    )

    statuses = await message_write_policy.readiness_statuses(AsyncMock())

    assert statuses == {"direct_messages": "enabled", "league_chat": "enabled"}


@pytest.mark.asyncio
@pytest.mark.parametrize("environment", ["production", "prod", "staging"])
async def test_missing_controls_fail_closed_in_protected_environments(monkeypatch, environment):
    monkeypatch.setenv("ENV", environment)
    monkeypatch.setattr(
        settings_service,
        "get_setting_with_fallback",
        AsyncMock(return_value=None),
    )

    with pytest.raises(message_write_policy.MessageWritesUnavailable):
        await message_write_policy.enforce_write_enabled(
            AsyncMock(), message_write_policy.MessageSurface.DIRECT_MESSAGES
        )


@pytest.mark.asyncio
async def test_invalid_production_control_fails_closed(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setattr(
        settings_service,
        "get_setting_with_fallback",
        AsyncMock(return_value="perhaps"),
    )

    status = await message_write_policy.surface_status(
        AsyncMock(), message_write_policy.MessageSurface.LEAGUE_CHAT
    )

    assert status == "misconfigured"


@pytest.mark.asyncio
async def test_disabled_surface_rejects_only_that_message_surface(monkeypatch):
    monkeypatch.setenv("ENV", "production")

    async def setting_value(_session, key, **_kwargs):
        return "false" if key == "direct_message_writes_enabled" else "true"

    monkeypatch.setattr(settings_service, "get_setting_with_fallback", setting_value)

    with pytest.raises(message_write_policy.MessageWritesUnavailable):
        await message_write_policy.enforce_write_enabled(
            AsyncMock(), message_write_policy.MessageSurface.DIRECT_MESSAGES
        )
    await message_write_policy.enforce_write_enabled(
        AsyncMock(), message_write_policy.MessageSurface.LEAGUE_CHAT
    )


@pytest.mark.asyncio
async def test_containment_drill_disables_and_restores_each_surface_independently(monkeypatch):
    """Rehearse the protected-environment switch sequence without external state."""
    monkeypatch.setenv("ENV", "production")
    controls = {
        "direct_message_writes_enabled": "true",
        "league_chat_writes_enabled": "true",
    }

    async def setting_value(_session, key, **_kwargs):
        return controls[key]

    monkeypatch.setattr(settings_service, "get_setting_with_fallback", setting_value)
    session = AsyncMock()
    direct_messages = message_write_policy.MessageSurface.DIRECT_MESSAGES
    league_chat = message_write_policy.MessageSurface.LEAGUE_CHAT

    assert await message_write_policy.readiness_statuses(session) == {
        "direct_messages": "enabled",
        "league_chat": "enabled",
    }

    controls["direct_message_writes_enabled"] = "false"
    assert await message_write_policy.readiness_statuses(session) == {
        "direct_messages": "disabled",
        "league_chat": "enabled",
    }
    with pytest.raises(message_write_policy.MessageWritesUnavailable):
        await message_write_policy.enforce_write_enabled(session, direct_messages)
    await message_write_policy.enforce_write_enabled(session, league_chat)

    controls["direct_message_writes_enabled"] = "true"
    controls["league_chat_writes_enabled"] = "false"
    assert await message_write_policy.readiness_statuses(session) == {
        "direct_messages": "enabled",
        "league_chat": "disabled",
    }
    await message_write_policy.enforce_write_enabled(session, direct_messages)
    with pytest.raises(message_write_policy.MessageWritesUnavailable):
        await message_write_policy.enforce_write_enabled(session, league_chat)

    controls["league_chat_writes_enabled"] = "true"
    assert await message_write_policy.readiness_statuses(session) == {
        "direct_messages": "enabled",
        "league_chat": "enabled",
    }
    await message_write_policy.enforce_write_enabled(session, direct_messages)
    await message_write_policy.enforce_write_enabled(session, league_chat)


@pytest.mark.asyncio
async def test_blocking_remains_available_while_message_writes_are_disabled(
    db_session, monkeypatch
):
    """The containment switches must never disable a member safety action."""
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("DIRECT_MESSAGE_WRITES_ENABLED", "false")
    monkeypatch.setenv("LEAGUE_CHAT_WRITES_ENABLED", "false")

    users = [
        User(phone_number="+15558880101", password_hash="hash", is_verified=True),
        User(phone_number="+15558880102", password_hash="hash", is_verified=True),
    ]
    db_session.add_all(users)
    await db_session.flush()
    players = [
        Player(full_name="Containment One", user_id=users[0].id),
        Player(full_name="Containment Two", user_id=users[1].id),
    ]
    db_session.add_all(players)
    await db_session.flush()
    low, high = sorted((players[0].id, players[1].id))
    db_session.add(Friend(player1_id=low, player2_id=high))
    await db_session.flush()

    result = await interaction_policy.create_block(db_session, players[0].id, players[1].id)

    assert result == {"player_id": players[1].id, "created": True}
    assert await interaction_policy.blocked_by_viewer(db_session, players[0].id, players[1].id)


@pytest.mark.asyncio
async def test_league_chat_read_survives_containment_and_send_works_after_restore(
    db_session, monkeypatch
):
    """Exercise the league-chat disable/read/restore sequence against local data."""
    monkeypatch.setenv("ENV", "production")
    controls = {
        "direct_message_writes_enabled": "true",
        "league_chat_writes_enabled": "true",
    }

    async def setting_value(_session, key, **_kwargs):
        return controls[key]

    monkeypatch.setattr(settings_service, "get_setting_with_fallback", setting_value)
    monkeypatch.setattr(moderation_worker, "initial_visibility", lambda: "pending")
    monkeypatch.setattr(moderation_worker, "enqueue_target", AsyncMock())

    user = User(phone_number="+15558880201", password_hash="hash", is_verified=True)
    db_session.add(user)
    await db_session.flush()
    player = Player(full_name="League Drill Member", user_id=user.id)
    db_session.add(player)
    await db_session.flush()
    league = League(name="Local containment drill", created_by=player.id)
    db_session.add(league)
    await db_session.flush()

    before = await message_data.create_league_message(
        db_session, league.id, user.id, "before containment"
    )
    controls["league_chat_writes_enabled"] = "false"
    with pytest.raises(message_write_policy.MessageWritesUnavailable):
        await message_data.create_league_message(
            db_session, league.id, user.id, "must be rejected"
        )
    during = await message_data.get_league_messages(db_session, league.id, current_user_id=user.id)

    assert [message["id"] for message in during] == [before["id"]]

    controls["league_chat_writes_enabled"] = "true"
    after = await message_data.create_league_message(
        db_session, league.id, user.id, "after restoration"
    )
    restored = await message_data.get_league_messages(
        db_session, league.id, current_user_id=user.id
    )

    assert [message["id"] for message in restored] == [before["id"], after["id"]]


@pytest.mark.asyncio
async def test_direct_message_read_survives_containment_and_send_works_after_restore(
    db_session, monkeypatch
):
    """Exercise the direct-message disable/read/restore sequence against local data."""
    monkeypatch.setenv("ENV", "production")
    controls = {
        "direct_message_writes_enabled": "true",
        "league_chat_writes_enabled": "true",
    }

    async def setting_value(_session, key, **_kwargs):
        return controls[key]

    monkeypatch.setattr(settings_service, "get_setting_with_fallback", setting_value)
    monkeypatch.setattr(moderation_worker, "initial_visibility", lambda: "pending")
    monkeypatch.setattr(moderation_worker, "enqueue_target", AsyncMock())

    users = [
        User(phone_number="+15558880301", password_hash="hash", is_verified=True),
        User(phone_number="+15558880302", password_hash="hash", is_verified=True),
    ]
    db_session.add_all(users)
    await db_session.flush()
    players = [
        Player(full_name="Direct Drill One", user_id=users[0].id),
        Player(full_name="Direct Drill Two", user_id=users[1].id),
    ]
    db_session.add_all(players)
    await db_session.flush()
    low, high = sorted((players[0].id, players[1].id))
    db_session.add(Friend(player1_id=low, player2_id=high))
    await db_session.flush()

    before = await direct_message_service.send_message(
        db_session, players[0].id, players[1].id, "before containment"
    )
    controls["direct_message_writes_enabled"] = "false"
    with pytest.raises(message_write_policy.MessageWritesUnavailable):
        await direct_message_service.send_message(
            db_session, players[0].id, players[1].id, "must be rejected"
        )
    during = await direct_message_service.get_thread(db_session, players[0].id, players[1].id)

    assert [message["id"] for message in during["items"]] == [before["id"]]

    controls["direct_message_writes_enabled"] = "true"
    after = await direct_message_service.send_message(
        db_session, players[0].id, players[1].id, "after restoration"
    )
    restored = await direct_message_service.get_thread(db_session, players[0].id, players[1].id)

    assert [message["id"] for message in restored["items"]] == [
        before["id"],
        after["id"],
    ]


@pytest.mark.asyncio
async def test_configuration_lookup_failure_is_fail_closed_only_when_protected(monkeypatch):
    async def failed_lookup(*_args, **_kwargs):
        raise RuntimeError("configuration store unavailable")

    monkeypatch.setattr(settings_service, "get_setting_with_fallback", failed_lookup)
    monkeypatch.setenv("ENV", "production")
    assert (
        await message_write_policy.surface_status(
            AsyncMock(), message_write_policy.MessageSurface.DIRECT_MESSAGES
        )
        == "misconfigured"
    )

    monkeypatch.setenv("ENV", "test")
    assert (
        await message_write_policy.surface_status(
            AsyncMock(), message_write_policy.MessageSurface.DIRECT_MESSAGES
        )
        == "enabled"
    )


@pytest.mark.asyncio
async def test_direct_message_control_runs_before_social_or_persistence_work(monkeypatch):
    async def disabled(*_args, **_kwargs):
        raise message_write_policy.MessageWritesUnavailable()

    friendship_check = AsyncMock(return_value=True)
    monkeypatch.setattr(message_write_policy, "enforce_write_enabled", disabled)
    monkeypatch.setattr(friend_service, "are_friends", friendship_check)
    session = AsyncMock()

    with pytest.raises(message_write_policy.MessageWritesUnavailable):
        await direct_message_service.send_message(session, 1, 2, "hello")

    friendship_check.assert_not_awaited()
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_league_chat_control_runs_before_identity_or_persistence_work(monkeypatch):
    async def disabled(*_args, **_kwargs):
        raise message_write_policy.MessageWritesUnavailable()

    monkeypatch.setattr(message_write_policy, "enforce_write_enabled", disabled)
    session = AsyncMock()

    with pytest.raises(message_write_policy.MessageWritesUnavailable):
        await message_data.create_league_message(session, 1, 2, "hello")

    session.execute.assert_not_awaited()
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_direct_message_abuse_policy_runs_before_friendship_or_persistence(monkeypatch):
    async def enabled(*_args, **_kwargs):
        return None

    async def blocked(*_args, **_kwargs):
        raise interaction_policy.InteractionUnavailable(MagicMock())

    friendship_check = AsyncMock(return_value=True)
    monkeypatch.setattr(message_write_policy, "enforce_write_enabled", enabled)
    monkeypatch.setattr(interaction_policy, "enforce_action", blocked)
    monkeypatch.setattr(friend_service, "are_friends", friendship_check)
    session = AsyncMock()

    with pytest.raises(interaction_policy.InteractionUnavailable):
        await direct_message_service.send_message(session, 1, 2, "hello")

    friendship_check.assert_not_awaited()
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_league_chat_abuse_policy_runs_before_persistence(monkeypatch):
    async def enabled(*_args, **_kwargs):
        return None

    async def restricted(*_args, **_kwargs):
        raise interaction_policy.InteractionUnavailable(MagicMock())

    player_result = MagicMock()
    player_result.scalar_one_or_none.return_value = 7
    session = AsyncMock()
    session.execute.return_value = player_result
    monkeypatch.setattr(message_write_policy, "enforce_write_enabled", enabled)
    monkeypatch.setattr(interaction_policy, "enforce_ugc_creation", restricted)

    with pytest.raises(interaction_policy.InteractionUnavailable):
        await message_data.create_league_message(session, 1, 2, "hello")

    session.add.assert_not_called()
