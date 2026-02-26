"""
Unit tests for direct message service.

Tests message sending validation, thread retrieval, read marking,
unread counts, and friendship gating.
"""

import pytest
import pytest_asyncio
from backend.services import direct_message_service, friend_service
from backend.database.models import User, Player, Friend


async def _create_user_and_player(db_session, phone, name):
    """Helper: create a user + player pair, return (user_id, player_id)."""
    user = User(phone_number=phone, password_hash="hash", is_verified=True)
    db_session.add(user)
    await db_session.flush()

    player = Player(full_name=name, user_id=user.id)
    db_session.add(player)
    await db_session.flush()
    await db_session.refresh(player)
    return user.id, player.id


async def _make_friends(db_session, player1_id, player2_id):
    """Helper: directly create a friendship row between two players."""
    p1, p2 = sorted([player1_id, player2_id])
    friend = Friend(player1_id=p1, player2_id=p2)
    db_session.add(friend)
    await db_session.flush()


@pytest_asyncio.fixture
async def players(db_session):
    """Create two test users with player profiles."""
    u1, p1 = await _create_user_and_player(db_session, "+15559000001", "Alice Sender")
    u2, p2 = await _create_user_and_player(db_session, "+15559000002", "Bob Receiver")
    u3, p3 = await _create_user_and_player(db_session, "+15559000003", "Carol Bystander")
    return {
        "alice": {"user_id": u1, "player_id": p1},
        "bob": {"user_id": u2, "player_id": p2},
        "carol": {"user_id": u3, "player_id": p3},
    }


@pytest_asyncio.fixture
async def friends(db_session, players):
    """Make Alice and Bob friends."""
    await _make_friends(db_session, players["alice"]["player_id"], players["bob"]["player_id"])
    return players


# ──────────────────────────────────────────────────────────────
# send_message — validation
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_send_message_self_raises(db_session, friends):
    """Cannot send a message to yourself."""
    pid = friends["alice"]["player_id"]
    with pytest.raises(ValueError, match="Cannot send a message to yourself"):
        await direct_message_service.send_message(db_session, pid, pid, "Hello")


@pytest.mark.asyncio
async def test_send_message_not_friends_raises(db_session, players):
    """Cannot send a message to a non-friend."""
    alice = players["alice"]["player_id"]
    carol = players["carol"]["player_id"]
    with pytest.raises(ValueError, match="You must be friends"):
        await direct_message_service.send_message(db_session, alice, carol, "Hello")


@pytest.mark.asyncio
async def test_send_message_empty_text_raises(db_session, friends):
    """Cannot send an empty or whitespace-only message."""
    alice = friends["alice"]["player_id"]
    bob = friends["bob"]["player_id"]
    with pytest.raises(ValueError, match="Message cannot be empty"):
        await direct_message_service.send_message(db_session, alice, bob, "   ")


@pytest.mark.asyncio
async def test_send_message_too_long_raises(db_session, friends):
    """Cannot send a message longer than 500 characters."""
    alice = friends["alice"]["player_id"]
    bob = friends["bob"]["player_id"]
    long_text = "a" * 501
    with pytest.raises(ValueError, match="Message cannot exceed 500 characters"):
        await direct_message_service.send_message(db_session, alice, bob, long_text)


# ──────────────────────────────────────────────────────────────
# send_message — success
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_send_message_success(db_session, friends):
    """Successful send returns the message dict."""
    alice = friends["alice"]["player_id"]
    bob = friends["bob"]["player_id"]
    result = await direct_message_service.send_message(db_session, alice, bob, "Hello Bob!")

    assert result["sender_player_id"] == alice
    assert result["receiver_player_id"] == bob
    assert result["message_text"] == "Hello Bob!"
    assert result["is_read"] is False
    assert result["id"] > 0
    assert result["created_at"] is not None


@pytest.mark.asyncio
async def test_send_message_trims_whitespace(db_session, friends):
    """Message text is trimmed before persisting."""
    alice = friends["alice"]["player_id"]
    bob = friends["bob"]["player_id"]
    result = await direct_message_service.send_message(db_session, alice, bob, "  Hello!  ")
    assert result["message_text"] == "Hello!"


# ──────────────────────────────────────────────────────────────
# get_thread
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_thread_returns_messages_between_two_players(db_session, friends):
    """get_thread returns only messages between the two specified players."""
    alice = friends["alice"]["player_id"]
    bob = friends["bob"]["player_id"]

    await direct_message_service.send_message(db_session, alice, bob, "Hi Bob")
    await direct_message_service.send_message(db_session, bob, alice, "Hi Alice")

    result = await direct_message_service.get_thread(db_session, alice, bob)
    assert result["total_count"] == 2
    assert len(result["messages"]) == 2

    # Both messages should involve only alice and bob
    for msg in result["messages"]:
        assert {msg["sender_player_id"], msg["receiver_player_id"]} == {alice, bob}


@pytest.mark.asyncio
async def test_get_thread_excludes_other_conversations(db_session, friends):
    """Messages from unrelated conversations don't appear in the thread."""
    alice = friends["alice"]["player_id"]
    bob = friends["bob"]["player_id"]
    carol = friends["carol"]["player_id"]

    # Make carol and alice friends too
    await _make_friends(db_session, alice, carol)

    await direct_message_service.send_message(db_session, alice, bob, "Hi Bob")
    await direct_message_service.send_message(db_session, alice, carol, "Hi Carol")

    result = await direct_message_service.get_thread(db_session, alice, bob)
    assert result["total_count"] == 1
    assert result["messages"][0]["message_text"] == "Hi Bob"


@pytest.mark.asyncio
async def test_get_thread_pagination(db_session, friends):
    """get_thread respects limit and offset."""
    alice = friends["alice"]["player_id"]
    bob = friends["bob"]["player_id"]

    for i in range(5):
        await direct_message_service.send_message(db_session, alice, bob, f"Msg {i}")

    result = await direct_message_service.get_thread(db_session, alice, bob, limit=2, offset=0)
    assert len(result["messages"]) == 2
    assert result["total_count"] == 5
    assert result["has_more"] is True

    result2 = await direct_message_service.get_thread(db_session, alice, bob, limit=2, offset=4)
    assert len(result2["messages"]) == 1
    assert result2["has_more"] is False


# ──────────────────────────────────────────────────────────────
# mark_thread_read
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_mark_thread_read_only_marks_received_messages(db_session, friends):
    """mark_thread_read only marks messages addressed TO the player, not sent BY them."""
    alice = friends["alice"]["player_id"]
    bob = friends["bob"]["player_id"]

    await direct_message_service.send_message(db_session, alice, bob, "From Alice 1")
    await direct_message_service.send_message(db_session, alice, bob, "From Alice 2")
    await direct_message_service.send_message(db_session, bob, alice, "From Bob 1")

    # Bob marks thread with Alice as read (should mark Alice's 2 messages)
    count = await direct_message_service.mark_thread_read(db_session, bob, alice)
    assert count == 2

    # Alice's message from Bob should still be unread for Alice
    unread = await direct_message_service.get_unread_count(db_session, alice)
    assert unread == 1


@pytest.mark.asyncio
async def test_mark_thread_read_idempotent(db_session, friends):
    """Marking an already-read thread returns 0."""
    alice = friends["alice"]["player_id"]
    bob = friends["bob"]["player_id"]

    await direct_message_service.send_message(db_session, alice, bob, "Hello")
    await direct_message_service.mark_thread_read(db_session, bob, alice)

    count = await direct_message_service.mark_thread_read(db_session, bob, alice)
    assert count == 0


# ──────────────────────────────────────────────────────────────
# get_unread_count
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unread_count_zero_when_no_messages(db_session, friends):
    """Unread count is 0 when there are no messages."""
    bob = friends["bob"]["player_id"]
    count = await direct_message_service.get_unread_count(db_session, bob)
    assert count == 0


@pytest.mark.asyncio
async def test_unread_count_increments_per_received_message(db_session, friends):
    """Each received message increments the unread count."""
    alice = friends["alice"]["player_id"]
    bob = friends["bob"]["player_id"]

    await direct_message_service.send_message(db_session, alice, bob, "Msg 1")
    await direct_message_service.send_message(db_session, alice, bob, "Msg 2")

    count = await direct_message_service.get_unread_count(db_session, bob)
    assert count == 2

    # Sent messages don't count as unread for the sender
    alice_count = await direct_message_service.get_unread_count(db_session, alice)
    assert alice_count == 0


# ──────────────────────────────────────────────────────────────
# get_conversations
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_conversations_lists_partners(db_session, friends):
    """get_conversations returns conversation partners with latest message."""
    alice = friends["alice"]["player_id"]
    bob = friends["bob"]["player_id"]

    await direct_message_service.send_message(db_session, alice, bob, "Hello!")

    result = await direct_message_service.get_conversations(db_session, alice)
    assert result["total_count"] == 1
    conv = result["conversations"][0]
    assert conv["player_id"] == bob
    assert conv["last_message_text"] == "Hello!"
    assert conv["is_friend"] is True


@pytest.mark.asyncio
async def test_get_conversations_shows_unread_count(db_session, friends):
    """Unread count per conversation reflects messages received but not read."""
    alice = friends["alice"]["player_id"]
    bob = friends["bob"]["player_id"]

    await direct_message_service.send_message(db_session, bob, alice, "Hey 1")
    await direct_message_service.send_message(db_session, bob, alice, "Hey 2")

    result = await direct_message_service.get_conversations(db_session, alice)
    assert result["conversations"][0]["unread_count"] == 2
