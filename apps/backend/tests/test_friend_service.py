"""
Unit tests for friend service.

Tests friend request lifecycle, duplicate prevention, mutual friends,
batch status, and league-based suggestions.
"""

import pytest
import pytest_asyncio
from backend.services import friend_service
from backend.database.models import User, Player, Friend, LeagueMember, League, FriendRequest


async def _create_user_and_player(db_session, phone, name):
    """Helper: create a user + player pair, return (user_id, player_id).

    Creates User and Player directly (no commit) so everything stays
    in the same transaction managed by the test session.
    """
    user = User(phone_number=phone, password_hash="hash", is_verified=True)
    db_session.add(user)
    await db_session.flush()

    player = Player(full_name=name, user_id=user.id)
    db_session.add(player)
    await db_session.flush()
    await db_session.refresh(player)
    return user.id, player.id


async def _create_league(db_session, name="Test League"):
    """Helper: create a league, return league_id."""
    league = League(name=name, is_open=True)
    db_session.add(league)
    await db_session.flush()
    await db_session.refresh(league)
    return league.id


async def _add_league_member(db_session, league_id, player_id):
    """Helper: add a player to a league."""
    member = LeagueMember(league_id=league_id, player_id=player_id)
    db_session.add(member)
    await db_session.flush()


@pytest_asyncio.fixture
async def players(db_session):
    """Create three test users with player profiles."""
    _, p1 = await _create_user_and_player(db_session, "+15551000001", "Alice Alpha")
    _, p2 = await _create_user_and_player(db_session, "+15551000002", "Bob Beta")
    _, p3 = await _create_user_and_player(db_session, "+15551000003", "Carol Gamma")
    _, p4 = await _create_user_and_player(db_session, "+15551000004", "Dave Delta")
    return {"alice": p1, "bob": p2, "carol": p3, "dave": p4}


# ──────────────────────────────────────────────────────────────
# Send request
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_send_friend_request(db_session, players):
    """Test sending a friend request creates a pending request."""
    result = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    assert result["sender_player_id"] == players["alice"]
    assert result["receiver_player_id"] == players["bob"]
    assert result["status"] == "pending"
    assert result["id"] > 0


@pytest.mark.asyncio
async def test_cannot_friend_yourself(db_session, players):
    """Test that sending a friend request to yourself raises ValueError."""
    with pytest.raises(ValueError, match="Cannot send a friend request to yourself"):
        await friend_service.send_friend_request(
            db_session, players["alice"], players["alice"]
        )


@pytest.mark.asyncio
async def test_duplicate_request_prevention(db_session, players):
    """Test that duplicate friend requests are rejected."""
    await friend_service.send_friend_request(db_session, players["alice"], players["bob"])

    with pytest.raises(ValueError, match="Friend request already sent"):
        await friend_service.send_friend_request(
            db_session, players["alice"], players["bob"]
        )


@pytest.mark.asyncio
async def test_reverse_request_blocked(db_session, players):
    """Test that a reverse request is blocked with helpful message."""
    await friend_service.send_friend_request(db_session, players["alice"], players["bob"])

    with pytest.raises(ValueError, match="already sent you a friend request"):
        await friend_service.send_friend_request(
            db_session, players["bob"], players["alice"]
        )


# ──────────────────────────────────────────────────────────────
# Accept / Decline / Cancel
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_accept_friend_request(db_session, players):
    """Test accepting a request creates a friendship."""
    req = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    result = await friend_service.accept_friend_request(
        db_session, req["id"], players["bob"]
    )
    assert result["status"] == "accepted"

    # Verify they are now friends
    assert await friend_service.are_friends(db_session, players["alice"], players["bob"])


@pytest.mark.asyncio
async def test_accept_wrong_receiver(db_session, players):
    """Test that only the receiver can accept a request."""
    req = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    with pytest.raises(ValueError, match="Not authorized"):
        await friend_service.accept_friend_request(
            db_session, req["id"], players["carol"]
        )


@pytest.mark.asyncio
async def test_decline_friend_request(db_session, players):
    """Test declining a request deletes the row."""
    req = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    await friend_service.decline_friend_request(
        db_session, req["id"], players["bob"]
    )

    # Should not be friends
    assert not await friend_service.are_friends(
        db_session, players["alice"], players["bob"]
    )

    # Row should be gone — no pending request in either direction
    pending = await friend_service.get_pending_request(
        db_session, players["alice"], players["bob"]
    )
    assert pending is None


@pytest.mark.asyncio
async def test_decline_then_re_request(db_session, players):
    """Test that after declining, the sender can re-send a request."""
    req = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    await friend_service.decline_friend_request(
        db_session, req["id"], players["bob"]
    )

    # Sender should be able to re-request without UniqueConstraint error
    new_req = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    assert new_req["status"] == "pending"
    assert new_req["id"] != req["id"]


@pytest.mark.asyncio
async def test_cancel_friend_request(db_session, players):
    """Test cancelling an outgoing request deletes it."""
    req = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    await friend_service.cancel_friend_request(
        db_session, req["id"], players["alice"]
    )

    # Verify request is gone — should be able to send a new one
    new_req = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    assert new_req["id"] != req["id"]


@pytest.mark.asyncio
async def test_cancel_wrong_sender(db_session, players):
    """Test that only the sender can cancel a request."""
    req = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    with pytest.raises(ValueError, match="Not authorized"):
        await friend_service.cancel_friend_request(
            db_session, req["id"], players["bob"]
        )


# ──────────────────────────────────────────────────────────────
# Remove friend (unfriend)
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_remove_friend(db_session, players):
    """Test removing a friendship."""
    req = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    await friend_service.accept_friend_request(db_session, req["id"], players["bob"])
    assert await friend_service.are_friends(db_session, players["alice"], players["bob"])

    await friend_service.remove_friend(db_session, players["alice"], players["bob"])
    assert not await friend_service.are_friends(
        db_session, players["alice"], players["bob"]
    )


@pytest.mark.asyncio
async def test_remove_friend_not_friends(db_session, players):
    """Test removing a non-friend raises ValueError."""
    with pytest.raises(ValueError, match="Not friends"):
        await friend_service.remove_friend(
            db_session, players["alice"], players["bob"]
        )


@pytest.mark.asyncio
async def test_unfriend_and_re_request(db_session, players):
    """Test that after unfriending, a new request can be sent."""
    req = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    await friend_service.accept_friend_request(db_session, req["id"], players["bob"])
    await friend_service.remove_friend(db_session, players["alice"], players["bob"])

    # Should be able to re-request
    new_req = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    assert new_req["status"] == "pending"


@pytest.mark.asyncio
async def test_cannot_request_existing_friend(db_session, players):
    """Test that a request to an existing friend is rejected."""
    req = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    await friend_service.accept_friend_request(db_session, req["id"], players["bob"])

    with pytest.raises(ValueError, match="Already friends"):
        await friend_service.send_friend_request(
            db_session, players["alice"], players["bob"]
        )


# ──────────────────────────────────────────────────────────────
# Get friends & friend requests
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_friends(db_session, players):
    """Test getting friends list."""
    # Alice friends Bob and Carol
    req1 = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    await friend_service.accept_friend_request(db_session, req1["id"], players["bob"])

    req2 = await friend_service.send_friend_request(
        db_session, players["alice"], players["carol"]
    )
    await friend_service.accept_friend_request(db_session, req2["id"], players["carol"])

    result = await friend_service.get_friends(db_session, players["alice"])
    assert result["total_count"] == 2
    assert len(result["items"]) == 2

    friend_ids = {f["player_id"] for f in result["items"]}
    assert players["bob"] in friend_ids
    assert players["carol"] in friend_ids


@pytest.mark.asyncio
async def test_get_friend_requests_incoming(db_session, players):
    """Test getting incoming friend requests."""
    await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    await friend_service.send_friend_request(
        db_session, players["carol"], players["bob"]
    )

    requests = await friend_service.get_friend_requests(
        db_session, players["bob"], direction="incoming"
    )
    assert len(requests) == 2


@pytest.mark.asyncio
async def test_get_friend_requests_outgoing(db_session, players):
    """Test getting outgoing friend requests."""
    await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    await friend_service.send_friend_request(
        db_session, players["alice"], players["carol"]
    )

    requests = await friend_service.get_friend_requests(
        db_session, players["alice"], direction="outgoing"
    )
    assert len(requests) == 2


# ──────────────────────────────────────────────────────────────
# Mutual friends
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_mutual_friends(db_session, players):
    """Test mutual friend calculation."""
    # Alice friends Bob, Alice friends Carol, Bob friends Carol
    req1 = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    await friend_service.accept_friend_request(db_session, req1["id"], players["bob"])

    req2 = await friend_service.send_friend_request(
        db_session, players["alice"], players["carol"]
    )
    await friend_service.accept_friend_request(db_session, req2["id"], players["carol"])

    req3 = await friend_service.send_friend_request(
        db_session, players["bob"], players["carol"]
    )
    await friend_service.accept_friend_request(db_session, req3["id"], players["carol"])

    # Alice and Bob's mutual friends = Carol
    # Bob and Carol's mutual friends = Alice
    mutual_ab = await friend_service.get_mutual_friends(
        db_session, players["alice"], players["bob"]
    )
    assert len(mutual_ab) == 1
    assert mutual_ab[0]["player_id"] == players["carol"]

    count = await friend_service.get_mutual_friend_count(
        db_session, players["alice"], players["bob"]
    )
    assert count == 1


@pytest.mark.asyncio
async def test_mutual_friends_none(db_session, players):
    """Test mutual friends when no overlap exists."""
    mutual = await friend_service.get_mutual_friends(
        db_session, players["alice"], players["bob"]
    )
    assert len(mutual) == 0


# ──────────────────────────────────────────────────────────────
# Batch friend status
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_batch_friend_status(db_session, players):
    """Test batch friend status for search results."""
    # Alice friends Bob, Alice has pending request to Carol
    req1 = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    await friend_service.accept_friend_request(db_session, req1["id"], players["bob"])

    await friend_service.send_friend_request(
        db_session, players["alice"], players["carol"]
    )

    # Dave sends request to Alice
    await friend_service.send_friend_request(
        db_session, players["dave"], players["alice"]
    )

    result = await friend_service.batch_friend_status(
        db_session,
        players["alice"],
        [players["bob"], players["carol"], players["dave"]],
    )

    assert result["statuses"][str(players["bob"])] == "friend"
    assert result["statuses"][str(players["carol"])] == "pending_outgoing"
    assert result["statuses"][str(players["dave"])] == "pending_incoming"


@pytest.mark.asyncio
async def test_batch_friend_status_empty(db_session, players):
    """Test batch friend status with empty list."""
    result = await friend_service.batch_friend_status(db_session, players["alice"], [])
    assert result["statuses"] == {}
    assert result["mutual_counts"] == {}


# ──────────────────────────────────────────────────────────────
# Friend suggestions
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_friend_suggestions(db_session, players):
    """Test league-based friend suggestions."""
    league_id = await _create_league(db_session, "Beach League")

    # Add Alice and Bob to the league
    await _add_league_member(db_session, league_id, players["alice"])
    await _add_league_member(db_session, league_id, players["bob"])
    await _add_league_member(db_session, league_id, players["carol"])

    suggestions = await friend_service.get_friend_suggestions(
        db_session, players["alice"]
    )

    suggestion_ids = {s["player_id"] for s in suggestions}
    assert players["bob"] in suggestion_ids
    assert players["carol"] in suggestion_ids
    assert players["alice"] not in suggestion_ids  # shouldn't suggest self


@pytest.mark.asyncio
async def test_friend_suggestions_excludes_friends(db_session, players):
    """Test that suggestions exclude existing friends."""
    league_id = await _create_league(db_session)
    await _add_league_member(db_session, league_id, players["alice"])
    await _add_league_member(db_session, league_id, players["bob"])
    await _add_league_member(db_session, league_id, players["carol"])

    # Alice friends Bob
    req = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    await friend_service.accept_friend_request(db_session, req["id"], players["bob"])

    suggestions = await friend_service.get_friend_suggestions(
        db_session, players["alice"]
    )
    suggestion_ids = {s["player_id"] for s in suggestions}
    assert players["bob"] not in suggestion_ids
    assert players["carol"] in suggestion_ids


@pytest.mark.asyncio
async def test_friend_suggestions_no_leagues(db_session, players):
    """Test that suggestions return empty when player has no leagues."""
    suggestions = await friend_service.get_friend_suggestions(
        db_session, players["alice"]
    )
    assert suggestions == []


# ──────────────────────────────────────────────────────────────
# get_friend_ids helper
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_friend_ids(db_session, players):
    """Test getting friend IDs."""
    req1 = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    await friend_service.accept_friend_request(db_session, req1["id"], players["bob"])

    req2 = await friend_service.send_friend_request(
        db_session, players["carol"], players["alice"]
    )
    await friend_service.accept_friend_request(db_session, req2["id"], players["alice"])

    friend_ids = await friend_service.get_friend_ids(db_session, players["alice"])
    assert friend_ids == {players["bob"], players["carol"]}


@pytest.mark.asyncio
async def test_get_friend_ids_empty(db_session, players):
    """Test getting friend IDs when player has no friends."""
    friend_ids = await friend_service.get_friend_ids(db_session, players["alice"])
    assert friend_ids == set()
