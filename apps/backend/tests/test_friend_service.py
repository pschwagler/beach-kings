"""
Unit tests for friend service.

Tests friend request lifecycle, duplicate prevention, mutual friends,
batch status, and multi-signal suggestions (mutuals, sessions, leagues).
"""

import asyncio
import json

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from backend.services import friend_service, notification_service
from backend.database.models import (
    User,
    Player,
    LeagueMember,
    League,
    Friend,
    FriendRequest,
    FriendRequestStatus,
    Notification,
    NotificationType,
    PlayerGlobalStats,
    Location,
    Session,
    SessionParticipant,
    SessionStatus,
)


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


async def _get_friend_request_notification(db_session, request_id):
    result = await db_session.execute(
        select(Notification).where(Notification.type == NotificationType.FRIEND_REQUEST.value)
    )
    for notification in result.scalars().all():
        data = json.loads(notification.data) if notification.data else {}
        if data.get("friend_request_id") == request_id:
            return notification
    return None


async def _add_stale_friend_request_notification(
    db_session, *, sender_player_id, receiver_player_id, old_request_id=999_999
):
    receiver = await db_session.get(Player, receiver_player_id)
    notification = Notification(
        user_id=receiver.user_id,
        type=NotificationType.FRIEND_REQUEST.value,
        title="Friend Request",
        message="Old request",
        data=json.dumps(
            {
                "sender_player_id": sender_player_id,
                "friend_request_id": old_request_id,
            }
        ),
        is_read=False,
    )
    db_session.add(notification)
    await db_session.flush()
    await db_session.refresh(notification)
    return notification


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
    result = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    assert result["sender_player_id"] == players["alice"]
    assert result["receiver_player_id"] == players["bob"]
    assert result["status"] == "pending"
    assert result["id"] > 0


@pytest.mark.asyncio
async def test_send_friend_request_dismisses_stale_sender_notifications(db_session, players):
    """A re-request leaves exactly one presented notification for the relationship."""
    stale = await _add_stale_friend_request_notification(
        db_session,
        sender_player_id=players["alice"],
        receiver_player_id=players["bob"],
    )

    request = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    await db_session.refresh(stale)

    assert stale.dismissed_at is not None
    feed = await notification_service.get_user_notifications(db_session, user_id=stale.user_id)
    requests = [
        item for item in feed["items"] if item["type"] == NotificationType.FRIEND_REQUEST.value
    ]
    assert len(requests) == 1
    assert requests[0]["data"]["friend_request_id"] == request["id"]


@pytest.mark.asyncio
async def test_notification_feed_reconciles_legacy_friend_request_duplicates(db_session, players):
    """The feed keeps only the notification backed by the pending request."""
    request = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    stale = await _add_stale_friend_request_notification(
        db_session,
        sender_player_id=players["alice"],
        receiver_player_id=players["bob"],
    )

    feed = await notification_service.get_user_notifications(db_session, user_id=stale.user_id)
    await db_session.refresh(stale)

    requests = [
        item for item in feed["items"] if item["type"] == NotificationType.FRIEND_REQUEST.value
    ]
    assert [item["data"]["friend_request_id"] for item in requests] == [request["id"]]
    assert requests[0]["dedup_key"] == f"friend_request:{request['id']}"
    assert stale.dismissed_at is not None


@pytest.mark.asyncio
async def test_notification_feed_hydrates_legacy_sender_only_row(db_session, players):
    """A legacy sender-only notification is linked to the canonical request."""
    request = FriendRequest(
        sender_player_id=players["alice"],
        receiver_player_id=players["bob"],
        status=FriendRequestStatus.PENDING.value,
    )
    db_session.add(request)
    await db_session.flush()
    receiver = await db_session.get(Player, players["bob"])
    legacy = Notification(
        user_id=receiver.user_id,
        type=NotificationType.FRIEND_REQUEST.value,
        title="Friend Request",
        message="Legacy request",
        data=json.dumps({"sender_player_id": players["alice"]}),
        is_read=False,
    )
    db_session.add(legacy)
    await db_session.flush()

    feed = await notification_service.get_user_notifications(db_session, user_id=receiver.user_id)

    assert feed["items"][0]["data"]["friend_request_id"] == request.id
    assert feed["items"][0]["dedup_key"] == f"friend_request:{request.id}"


@pytest.mark.asyncio
async def test_cannot_friend_yourself(db_session, players):
    """Test that sending a friend request to yourself raises ValueError."""
    with pytest.raises(ValueError, match="Cannot send a friend request to yourself"):
        await friend_service.send_friend_request(db_session, players["alice"], players["alice"])


@pytest.mark.asyncio
async def test_duplicate_request_prevention(db_session, players):
    """Test that duplicate friend requests are rejected."""
    await friend_service.send_friend_request(db_session, players["alice"], players["bob"])

    with pytest.raises(ValueError, match="Friend request already sent"):
        await friend_service.send_friend_request(db_session, players["alice"], players["bob"])


@pytest.mark.asyncio
async def test_reverse_request_blocked(db_session, players):
    """Test that a reverse request is blocked with helpful message."""
    await friend_service.send_friend_request(db_session, players["alice"], players["bob"])

    with pytest.raises(ValueError, match="already sent you a friend request"):
        await friend_service.send_friend_request(db_session, players["bob"], players["alice"])


@pytest.mark.asyncio
async def test_concurrent_reverse_requests_leave_one_pending(db_session, players):
    """The unordered-pair index resolves a reverse-request race."""
    await db_session.commit()
    session_factory = async_sessionmaker(db_session.bind, expire_on_commit=False)

    async def attempt(sender_id, receiver_id):
        async with session_factory() as session:
            try:
                result = await friend_service.send_friend_request(session, sender_id, receiver_id)
                await session.commit()
                return ("created", result["id"])
            except ValueError as exc:
                await session.rollback()
                return ("rejected", str(exc))

    outcomes = await asyncio.gather(
        attempt(players["alice"], players["bob"]),
        attempt(players["bob"], players["alice"]),
    )

    assert sorted(outcome[0] for outcome in outcomes) == ["created", "rejected"]
    pending = await db_session.execute(
        select(FriendRequest).where(FriendRequest.status == FriendRequestStatus.PENDING.value)
    )
    requests = pending.scalars().all()
    assert len(requests) == 1
    assert {requests[0].sender_player_id, requests[0].receiver_player_id} == {
        players["alice"],
        players["bob"],
    }


# ──────────────────────────────────────────────────────────────
# Accept / Decline / Cancel
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_accept_friend_request(db_session, players):
    """Test accepting a request creates a friendship."""
    req = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    result = await friend_service.accept_friend_request(db_session, req["id"], players["bob"])
    assert result["status"] == "accepted"

    # Verify they are now friends
    assert await friend_service.are_friends(db_session, players["alice"], players["bob"])


@pytest.mark.asyncio
async def test_accept_friend_request_dismisses_receiver_notification(db_session, players):
    """Accepting hides every notification for that sender relationship."""
    req = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    notification = await _get_friend_request_notification(db_session, req["id"])
    stale_notification = await _add_stale_friend_request_notification(
        db_session,
        sender_player_id=players["alice"],
        receiver_player_id=players["bob"],
    )
    assert notification is not None
    assert notification.is_read is False
    assert stale_notification.is_read is False

    await friend_service.accept_friend_request(db_session, req["id"], players["bob"])
    await db_session.refresh(notification)
    await db_session.refresh(stale_notification)

    assert notification.is_read is True
    assert notification.read_at is not None
    assert notification.dismissed_at is not None
    assert stale_notification.is_read is True
    assert stale_notification.read_at is not None
    assert stale_notification.dismissed_at is not None

    feed = await notification_service.get_user_notifications(
        db_session, user_id=notification.user_id
    )
    assert all(item["type"] != NotificationType.FRIEND_REQUEST.value for item in feed["items"])


@pytest.mark.asyncio
async def test_accept_wrong_receiver(db_session, players):
    """Test that only the receiver can accept a request."""
    req = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    with pytest.raises(ValueError, match="Not authorized"):
        await friend_service.accept_friend_request(db_session, req["id"], players["carol"])


@pytest.mark.asyncio
async def test_accept_decline_race_has_one_resolution(db_session, players):
    """Row locking allows only one response to resolve a pending request."""
    req = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await db_session.commit()
    session_factory = async_sessionmaker(db_session.bind, expire_on_commit=False)

    async def respond(action):
        async with session_factory() as session:
            try:
                if action == "accept":
                    await friend_service.accept_friend_request(session, req["id"], players["bob"])
                else:
                    await friend_service.decline_friend_request(session, req["id"], players["bob"])
                await session.commit()
                return "resolved"
            except ValueError:
                await session.rollback()
                return "rejected"

    outcomes = await asyncio.gather(respond("accept"), respond("decline"))

    assert sorted(outcomes) == ["rejected", "resolved"]
    historical = await db_session.get(FriendRequest, req["id"])
    await db_session.refresh(historical)
    friendship = await db_session.execute(
        select(Friend).where(
            Friend.player1_id == min(players["alice"], players["bob"]),
            Friend.player2_id == max(players["alice"], players["bob"]),
        )
    )
    is_friend = friendship.scalar_one_or_none() is not None
    assert historical.status in {
        FriendRequestStatus.ACCEPTED.value,
        FriendRequestStatus.DECLINED.value,
    }
    assert is_friend is (historical.status == FriendRequestStatus.ACCEPTED.value)


@pytest.mark.asyncio
async def test_decline_friend_request(db_session, players):
    """Declining preserves a resolved historical row."""
    req = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.decline_friend_request(db_session, req["id"], players["bob"])

    # Should not be friends
    assert not await friend_service.are_friends(db_session, players["alice"], players["bob"])

    historical = await db_session.get(FriendRequest, req["id"])
    assert historical.status == FriendRequestStatus.DECLINED.value
    assert historical.responded_at is not None

    # There is no longer a pending request in either direction.
    pending = await friend_service.get_pending_request(
        db_session, players["alice"], players["bob"]
    )
    assert pending is None


@pytest.mark.asyncio
async def test_decline_friend_request_dismisses_receiver_notification(db_session, players):
    """Declining hides every notification for that sender relationship."""
    req = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    notification = await _get_friend_request_notification(db_session, req["id"])
    stale_notification = await _add_stale_friend_request_notification(
        db_session,
        sender_player_id=players["alice"],
        receiver_player_id=players["bob"],
    )
    assert notification is not None
    assert notification.is_read is False
    assert stale_notification.is_read is False

    await friend_service.decline_friend_request(db_session, req["id"], players["bob"])
    await db_session.refresh(notification)
    await db_session.refresh(stale_notification)

    assert notification.is_read is True
    assert notification.read_at is not None
    assert notification.dismissed_at is not None
    assert stale_notification.is_read is True
    assert stale_notification.read_at is not None
    assert stale_notification.dismissed_at is not None


@pytest.mark.asyncio
async def test_decline_then_re_request(db_session, players):
    """Test that after declining, the sender can re-send a request."""
    req = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.decline_friend_request(db_session, req["id"], players["bob"])

    # Sender should be able to re-request without UniqueConstraint error
    new_req = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    assert new_req["status"] == "pending"
    assert new_req["id"] != req["id"]


@pytest.mark.asyncio
async def test_cancel_friend_request(db_session, players):
    """Cancelling preserves history and permits a new request."""
    req = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.cancel_friend_request(db_session, req["id"], players["alice"])

    historical = await db_session.get(FriendRequest, req["id"])
    assert historical.status == FriendRequestStatus.CANCELLED.value
    assert historical.responded_at is not None

    # Verify request is gone — should be able to send a new one
    new_req = await friend_service.send_friend_request(
        db_session, players["alice"], players["bob"]
    )
    assert new_req["id"] != req["id"]


@pytest.mark.asyncio
async def test_cancel_friend_request_dismisses_receiver_notification(db_session, players):
    """Cancelling hides and retains the receiver's active notification."""
    req = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    notification = await _get_friend_request_notification(db_session, req["id"])

    await friend_service.cancel_friend_request(db_session, req["id"], players["alice"])
    await db_session.refresh(notification)

    assert notification.is_read is True
    assert notification.dismissed_at is not None


@pytest.mark.asyncio
async def test_cancel_wrong_sender(db_session, players):
    """Test that only the sender can cancel a request."""
    req = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    with pytest.raises(ValueError, match="Not authorized"):
        await friend_service.cancel_friend_request(db_session, req["id"], players["bob"])


# ──────────────────────────────────────────────────────────────
# Remove friend (unfriend)
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_remove_friend(db_session, players):
    """Test removing a friendship."""
    req = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.accept_friend_request(db_session, req["id"], players["bob"])
    assert await friend_service.are_friends(db_session, players["alice"], players["bob"])

    await friend_service.remove_friend(db_session, players["alice"], players["bob"])
    assert not await friend_service.are_friends(db_session, players["alice"], players["bob"])


@pytest.mark.asyncio
async def test_remove_friend_not_friends(db_session, players):
    """Test removing a non-friend raises ValueError."""
    with pytest.raises(ValueError, match="Not friends"):
        await friend_service.remove_friend(db_session, players["alice"], players["bob"])


@pytest.mark.asyncio
async def test_unfriend_and_re_request(db_session, players):
    """Test that after unfriending, a new request can be sent."""
    req = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
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
    req = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.accept_friend_request(db_session, req["id"], players["bob"])

    with pytest.raises(ValueError, match="Already friends"):
        await friend_service.send_friend_request(db_session, players["alice"], players["bob"])


# ──────────────────────────────────────────────────────────────
# Get friends & friend requests
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_friends(db_session, players):
    """Test getting friends list."""
    # Alice friends Bob and Carol
    req1 = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.accept_friend_request(db_session, req1["id"], players["bob"])

    req2 = await friend_service.send_friend_request(db_session, players["alice"], players["carol"])
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
    await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.send_friend_request(db_session, players["carol"], players["bob"])

    requests = await friend_service.get_friend_requests(
        db_session, players["bob"], direction="incoming"
    )
    assert len(requests) == 2


@pytest.mark.asyncio
async def test_get_friend_requests_outgoing(db_session, players):
    """Test getting outgoing friend requests."""
    await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.send_friend_request(db_session, players["alice"], players["carol"])

    requests = await friend_service.get_friend_requests(
        db_session, players["alice"], direction="outgoing"
    )
    assert len(requests) == 2


@pytest.mark.asyncio
async def test_get_friends_includes_shared_league(db_session, players):
    """Friends list rows carry the name of a league shared with the viewer."""
    league_id = await _create_league(db_session, "QBK Open Men")
    other_league = await _create_league(db_session, "Elsewhere League")
    await _add_league_member(db_session, league_id, players["alice"])
    await _add_league_member(db_session, league_id, players["bob"])
    # Carol is in a league Alice is NOT in — no shared league.
    await _add_league_member(db_session, other_league, players["carol"])

    req1 = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.accept_friend_request(db_session, req1["id"], players["bob"])
    req2 = await friend_service.send_friend_request(db_session, players["alice"], players["carol"])
    await friend_service.accept_friend_request(db_session, req2["id"], players["carol"])

    result = await friend_service.get_friends(db_session, players["alice"])
    by_player = {item["player_id"]: item for item in result["items"]}
    assert by_player[players["bob"]]["shared_league_name"] == "QBK Open Men"
    assert by_player[players["carol"]]["shared_league_name"] is None


@pytest.mark.asyncio
async def test_get_friends_includes_last_active(db_session, players):
    """Friends list rows carry the created_at of the friend's latest match session."""
    from backend.database.models import Match, Session as GameSession

    req = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.accept_friend_request(db_session, req["id"], players["bob"])
    req2 = await friend_service.send_friend_request(db_session, players["alice"], players["carol"])
    await friend_service.accept_friend_request(db_session, req2["id"], players["carol"])

    game_session = GameSession(date="7/4/2026", name="Holiday Games")
    db_session.add(game_session)
    await db_session.flush()
    match = Match(
        session_id=game_session.id,
        team1_player1_id=players["bob"],
        team1_player2_id=players["dave"],
        team2_player1_id=players["alice"],
        team2_player2_id=players["carol"],
        team1_score=21,
        team2_score=15,
        winner=1,
    )
    db_session.add(match)
    await db_session.flush()
    await db_session.refresh(game_session)

    result = await friend_service.get_friends(db_session, players["alice"])
    by_player = {item["player_id"]: item for item in result["items"]}

    # Bob and Carol both played in that session.
    assert by_player[players["bob"]]["last_active"] == game_session.created_at.isoformat()
    assert by_player[players["carol"]]["last_active"] == game_session.created_at.isoformat()


@pytest.mark.asyncio
async def test_get_friends_last_active_none_without_matches(db_session, players):
    """Friends with no recorded matches have last_active None."""
    req = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.accept_friend_request(db_session, req["id"], players["bob"])

    result = await friend_service.get_friends(db_session, players["alice"])
    assert result["items"][0]["last_active"] is None


@pytest.mark.asyncio
async def test_shared_league_name_is_deterministic(db_session, players):
    """With several shared leagues, the alphabetically first name is used."""
    league_b = await _create_league(db_session, "Beta League")
    league_a = await _create_league(db_session, "Alpha League")
    for lid in (league_a, league_b):
        await _add_league_member(db_session, lid, players["alice"])
        await _add_league_member(db_session, lid, players["bob"])

    req = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.accept_friend_request(db_session, req["id"], players["bob"])

    result = await friend_service.get_friends(db_session, players["alice"])
    assert result["items"][0]["shared_league_name"] == "Alpha League"


@pytest.mark.asyncio
async def test_get_friend_requests_includes_shared_league(db_session, players):
    """Request rows carry the shared-league name vs the counterpart."""
    league_id = await _create_league(db_session, "QBK Open Men")
    await _add_league_member(db_session, league_id, players["alice"])
    await _add_league_member(db_session, league_id, players["bob"])

    await friend_service.send_friend_request(db_session, players["bob"], players["alice"])
    await friend_service.send_friend_request(db_session, players["dave"], players["alice"])

    requests = await friend_service.get_friend_requests(
        db_session, players["alice"], direction="incoming"
    )
    by_sender = {r["sender_player_id"]: r for r in requests}
    assert by_sender[players["bob"]]["shared_league_name"] == "QBK Open Men"
    assert by_sender[players["dave"]]["shared_league_name"] is None


@pytest.mark.asyncio
async def test_get_friend_requests_includes_mutual_counts(db_session, players):
    """Incoming requests carry a batched mutual-friend count vs the viewer."""
    # Alice–Carol and Bob–Carol are friends → Carol is mutual between Alice and Bob.
    req1 = await friend_service.send_friend_request(db_session, players["alice"], players["carol"])
    await friend_service.accept_friend_request(db_session, req1["id"], players["carol"])
    req2 = await friend_service.send_friend_request(db_session, players["bob"], players["carol"])
    await friend_service.accept_friend_request(db_session, req2["id"], players["carol"])

    # Bob (1 mutual) and Dave (0 mutuals) send requests to Alice.
    await friend_service.send_friend_request(db_session, players["bob"], players["alice"])
    await friend_service.send_friend_request(db_session, players["dave"], players["alice"])

    requests = await friend_service.get_friend_requests(
        db_session, players["alice"], direction="incoming"
    )
    by_sender = {r["sender_player_id"]: r for r in requests}
    assert by_sender[players["bob"]]["mutual_friends_count"] == 1
    assert by_sender[players["dave"]]["mutual_friends_count"] == 0


@pytest.mark.asyncio
async def test_get_friend_requests_outgoing_counts_vs_receiver(db_session, players):
    """Outgoing requests count mutuals against the receiver (the counterpart)."""
    # Alice–Carol and Bob–Carol are friends.
    req1 = await friend_service.send_friend_request(db_session, players["alice"], players["carol"])
    await friend_service.accept_friend_request(db_session, req1["id"], players["carol"])
    req2 = await friend_service.send_friend_request(db_session, players["bob"], players["carol"])
    await friend_service.accept_friend_request(db_session, req2["id"], players["carol"])

    await friend_service.send_friend_request(db_session, players["alice"], players["bob"])

    requests = await friend_service.get_friend_requests(
        db_session, players["alice"], direction="outgoing"
    )
    assert len(requests) == 1
    assert requests[0]["mutual_friends_count"] == 1


# ──────────────────────────────────────────────────────────────
# Mutual friends
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_mutual_friends(db_session, players):
    """Test mutual friend calculation."""
    # Alice friends Bob, Alice friends Carol, Bob friends Carol
    req1 = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.accept_friend_request(db_session, req1["id"], players["bob"])

    req2 = await friend_service.send_friend_request(db_session, players["alice"], players["carol"])
    await friend_service.accept_friend_request(db_session, req2["id"], players["carol"])

    req3 = await friend_service.send_friend_request(db_session, players["bob"], players["carol"])
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
    mutual = await friend_service.get_mutual_friends(db_session, players["alice"], players["bob"])
    assert len(mutual) == 0


# ──────────────────────────────────────────────────────────────
# Batch friend status
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_batch_friend_status(db_session, players):
    """Test batch friend status for search results."""
    # Alice friends Bob, Alice has pending request to Carol
    req1 = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.accept_friend_request(db_session, req1["id"], players["bob"])

    await friend_service.send_friend_request(db_session, players["alice"], players["carol"])

    # Dave sends request to Alice
    await friend_service.send_friend_request(db_session, players["dave"], players["alice"])

    result = await friend_service.batch_friend_status(
        db_session,
        players["alice"],
        [
            players["alice"],
            players["bob"],
            players["carol"],
            players["dave"],
            999_999,
        ],
    )

    assert result["statuses"][str(players["alice"])] == "self"
    assert result["statuses"][str(players["bob"])] == "friend"
    assert result["statuses"][str(players["carol"])] == "pending_outgoing"
    assert result["statuses"][str(players["dave"])] == "pending_incoming"
    assert result["statuses"]["999999"] == "none"
    assert result["relationships"][str(players["bob"])] == {
        "status": "friend",
        "request_id": None,
    }
    assert result["relationships"][str(players["carol"])]["request_id"] is not None
    assert result["relationships"][str(players["dave"])]["request_id"] is not None


@pytest.mark.asyncio
async def test_batch_friend_status_empty(db_session, players):
    """Test batch friend status with empty list."""
    result = await friend_service.batch_friend_status(db_session, players["alice"], [])
    assert result["statuses"] == {}
    assert result["relationships"] == {}
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

    suggestions = await friend_service.get_friend_suggestions(db_session, players["alice"])

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
    req = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.accept_friend_request(db_session, req["id"], players["bob"])

    suggestions = await friend_service.get_friend_suggestions(db_session, players["alice"])
    suggestion_ids = {s["player_id"] for s in suggestions}
    assert players["bob"] not in suggestion_ids
    assert players["carol"] in suggestion_ids


@pytest.mark.asyncio
async def test_friend_suggestions_no_leagues_no_signals(db_session, players):
    """Suggestions empty when player has no leagues, no mutuals, no sessions."""
    suggestions = await friend_service.get_friend_suggestions(db_session, players["alice"])
    assert suggestions == []


async def _create_session_with_participants(db_session, player_ids):
    """Helper: create a session and add participants, return session_id."""
    session_obj = Session(
        name="Test Session",
        date="2026-01-15",
        status=SessionStatus.ACTIVE,
    )
    db_session.add(session_obj)
    await db_session.flush()
    for pid in player_ids:
        db_session.add(SessionParticipant(session_id=session_obj.id, player_id=pid))
    await db_session.flush()
    return session_obj.id


@pytest.mark.asyncio
async def test_suggestions_includes_mutual_friends(db_session, players):
    """Mutual friends signal: A-B friends, B-C friends => C suggested to A."""
    # Alice friends Bob
    req1 = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.accept_friend_request(db_session, req1["id"], players["bob"])
    # Bob friends Carol
    req2 = await friend_service.send_friend_request(db_session, players["bob"], players["carol"])
    await friend_service.accept_friend_request(db_session, req2["id"], players["carol"])

    suggestions = await friend_service.get_friend_suggestions(db_session, players["alice"])
    suggestion_map = {s["player_id"]: s for s in suggestions}

    assert players["carol"] in suggestion_map
    assert suggestion_map[players["carol"]]["mutual_friend_count"] >= 1


@pytest.mark.asyncio
async def test_suggestions_includes_shared_sessions(db_session, players):
    """Shared session signal: A and D in same session => D suggested to A."""
    await _create_session_with_participants(db_session, [players["alice"], players["dave"]])

    suggestions = await friend_service.get_friend_suggestions(db_session, players["alice"])
    suggestion_map = {s["player_id"]: s for s in suggestions}

    assert players["dave"] in suggestion_map
    assert suggestion_map[players["dave"]]["shared_session_count"] >= 1


@pytest.mark.asyncio
async def test_suggestions_no_leagues_returns_results_via_mutuals(db_session, players):
    """Player with no leagues but mutual friends still gets suggestions."""
    # Alice friends Bob, Bob friends Carol
    req1 = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.accept_friend_request(db_session, req1["id"], players["bob"])
    req2 = await friend_service.send_friend_request(db_session, players["bob"], players["carol"])
    await friend_service.accept_friend_request(db_session, req2["id"], players["carol"])

    # Alice has no leagues — should still get Carol via mutual (Bob)
    suggestions = await friend_service.get_friend_suggestions(db_session, players["alice"])
    assert len(suggestions) > 0
    suggestion_ids = {s["player_id"] for s in suggestions}
    assert players["carol"] in suggestion_ids


@pytest.mark.asyncio
async def test_suggestions_composite_score_ordering(db_session, players):
    """Mutuals weighted higher than leagues: 1 mutual (5) > 2 leagues (2)."""
    # Carol: give her 1 mutual with Alice (via Bob)
    req1 = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.accept_friend_request(db_session, req1["id"], players["bob"])
    req2 = await friend_service.send_friend_request(db_session, players["bob"], players["carol"])
    await friend_service.accept_friend_request(db_session, req2["id"], players["carol"])

    # Dave: put in 2 shared leagues with Alice (no mutuals)
    league1 = await _create_league(db_session, "League One")
    league2 = await _create_league(db_session, "League Two")
    await _add_league_member(db_session, league1, players["alice"])
    await _add_league_member(db_session, league1, players["dave"])
    await _add_league_member(db_session, league2, players["alice"])
    await _add_league_member(db_session, league2, players["dave"])

    suggestions = await friend_service.get_friend_suggestions(db_session, players["alice"])
    suggestion_ids = [s["player_id"] for s in suggestions]

    # Carol (1 mutual = 5 pts) should rank above Dave (2 leagues = 2 pts)
    carol_idx = suggestion_ids.index(players["carol"])
    dave_idx = suggestion_ids.index(players["dave"])
    assert carol_idx < dave_idx


@pytest.mark.asyncio
async def test_suggestions_reason_mutual(db_session, players):
    """Reason string for mutual-based suggestion."""
    req1 = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.accept_friend_request(db_session, req1["id"], players["bob"])
    req2 = await friend_service.send_friend_request(db_session, players["bob"], players["carol"])
    await friend_service.accept_friend_request(db_session, req2["id"], players["carol"])

    suggestions = await friend_service.get_friend_suggestions(db_session, players["alice"])
    carol_suggestion = next(s for s in suggestions if s["player_id"] == players["carol"])
    assert "mutual friend" in carol_suggestion["reason"].lower()


@pytest.mark.asyncio
async def test_suggestions_reason_session(db_session, players):
    """Reason string for session-based suggestion (no mutuals or leagues)."""
    await _create_session_with_participants(db_session, [players["alice"], players["dave"]])

    suggestions = await friend_service.get_friend_suggestions(db_session, players["alice"])
    dave_suggestion = next(s for s in suggestions if s["player_id"] == players["dave"])
    assert "played together" in dave_suggestion["reason"].lower()


@pytest.mark.asyncio
async def test_suggestions_reason_league(db_session, players):
    """Reason string for league-only suggestion includes league name."""
    league_id = await _create_league(db_session, "QBK Open")
    await _add_league_member(db_session, league_id, players["alice"])
    await _add_league_member(db_session, league_id, players["bob"])

    suggestions = await friend_service.get_friend_suggestions(db_session, players["alice"])
    bob_suggestion = next(s for s in suggestions if s["player_id"] == players["bob"])
    assert "QBK Open" in bob_suggestion["reason"]


# ──────────────────────────────────────────────────────────────
# get_friend_ids helper
# ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_friend_ids(db_session, players):
    """Test getting friend IDs."""
    req1 = await friend_service.send_friend_request(db_session, players["alice"], players["bob"])
    await friend_service.accept_friend_request(db_session, req1["id"], players["bob"])

    req2 = await friend_service.send_friend_request(db_session, players["carol"], players["alice"])
    await friend_service.accept_friend_request(db_session, req2["id"], players["alice"])

    friend_ids = await friend_service.get_friend_ids(db_session, players["alice"])
    assert friend_ids == {players["bob"], players["carol"]}


@pytest.mark.asyncio
async def test_get_friend_ids_empty(db_session, players):
    """Test getting friend IDs when player has no friends."""
    friend_ids = await friend_service.get_friend_ids(db_session, players["alice"])
    assert friend_ids == set()


# ──────────────────────────────────────────────────────────────
# discover_players
# ──────────────────────────────────────────────────────────────


async def _create_player_with_stats(
    db_session,
    phone: str,
    name: str,
    total_games: int = 10,
    current_rating: float = 1200.0,
    gender: str | None = None,
    level: str | None = None,
    location_id: str | None = None,
) -> tuple[int, int]:
    """Helper: create user + player + global stats, return (user_id, player_id)."""
    user_id, player_id = await _create_user_and_player(db_session, phone, name)
    if gender or level or location_id:
        result = await db_session.get(Player, player_id)
        if gender:
            result.gender = gender
        if level:
            result.level = level
        if location_id:
            result.location_id = location_id
        await db_session.flush()
    stats = PlayerGlobalStats(
        player_id=player_id,
        total_games=total_games,
        current_rating=current_rating,
    )
    db_session.add(stats)
    await db_session.flush()
    return user_id, player_id


async def _make_friends(db_session, player_a: int, player_b: int) -> None:
    """Helper: send and accept a friend request between two players."""
    req = await friend_service.send_friend_request(db_session, player_a, player_b)
    await friend_service.accept_friend_request(db_session, req["id"], player_b)


@pytest_asyncio.fixture
async def discover_setup(db_session):
    """Create players with stats and a friendship graph for discover tests.

    Friendship graph (all bidirectional):
        Alice -- Bob
        Alice -- Carol
        Bob   -- Dave
        Carol -- Dave
        Bob   -- Eve

    Alice's friends = {Bob, Carol}
    Mutual counts from Alice's POV:
        Dave: 2 (Bob, Carol)
        Eve:  1 (Bob)
        Bob:  already a friend
        Carol: already a friend
    """
    loc = Location(id="test_beach", name="Test Beach")
    db_session.add(loc)
    await db_session.flush()

    _, alice = await _create_player_with_stats(
        db_session,
        "+15552000001",
        "Alice Alpha",
        total_games=50,
        current_rating=1400.0,
        gender="female",
        level="intermediate",
        location_id="test_beach",
    )
    _, bob = await _create_player_with_stats(
        db_session,
        "+15552000002",
        "Bob Beta",
        total_games=30,
        current_rating=1350.0,
        gender="male",
        level="advanced",
        location_id="test_beach",
    )
    _, carol = await _create_player_with_stats(
        db_session,
        "+15552000003",
        "Carol Gamma",
        total_games=20,
        current_rating=1250.0,
        gender="female",
        level="beginner",
        location_id="test_beach",
    )
    _, dave = await _create_player_with_stats(
        db_session,
        "+15552000004",
        "Dave Delta",
        total_games=40,
        current_rating=1300.0,
        gender="male",
        level="intermediate",
    )
    _, eve = await _create_player_with_stats(
        db_session,
        "+15552000005",
        "Eve Epsilon",
        total_games=5,
        current_rating=1200.0,
        gender="female",
        level="advanced",
    )

    # Build friendship graph
    await _make_friends(db_session, alice, bob)
    await _make_friends(db_session, alice, carol)
    await _make_friends(db_session, bob, dave)
    await _make_friends(db_session, carol, dave)
    await _make_friends(db_session, bob, eve)

    return {
        "alice": alice,
        "bob": bob,
        "carol": carol,
        "dave": dave,
        "eve": eve,
    }


@pytest.mark.asyncio
async def test_discover_players_sort_by_mutuals(db_session, discover_setup):
    """Default sort (mutuals desc): Dave (2) before Eve (1)."""
    result = await friend_service.discover_players(
        db_session,
        discover_setup["alice"],
    )
    items = result["items"]
    ids = [item["id"] for item in items]

    # Caller excluded
    assert discover_setup["alice"] not in ids

    # Dave has 2 mutuals, Eve has 1 — Dave should come first among non-friends
    dave_idx = ids.index(discover_setup["dave"])
    eve_idx = ids.index(discover_setup["eve"])
    assert dave_idx < eve_idx


@pytest.mark.asyncio
async def test_discover_players_excludes_caller(db_session, discover_setup):
    """Caller should never appear in results."""
    result = await friend_service.discover_players(
        db_session,
        discover_setup["alice"],
    )
    result_ids = {item["id"] for item in result["items"]}
    assert discover_setup["alice"] not in result_ids


@pytest.mark.asyncio
async def test_discover_players_friend_status(db_session, discover_setup):
    """Items include correct friend_status: friend, pending_outgoing, none."""
    result = await friend_service.discover_players(
        db_session,
        discover_setup["alice"],
    )
    status_map = {item["id"]: item["friend_status"] for item in result["items"]}

    assert status_map[discover_setup["bob"]] == "friend"
    assert status_map[discover_setup["carol"]] == "friend"
    assert status_map[discover_setup["dave"]] == "none"
    assert status_map[discover_setup["eve"]] == "none"


@pytest.mark.asyncio
async def test_discover_players_pending_outgoing_status(db_session, discover_setup):
    """Player with pending outgoing request shows pending_outgoing status."""
    # Alice sends request to Dave (not yet accepted)
    await friend_service.remove_friend(db_session, discover_setup["bob"], discover_setup["dave"])
    await friend_service.remove_friend(db_session, discover_setup["carol"], discover_setup["dave"])
    await friend_service.send_friend_request(
        db_session, discover_setup["alice"], discover_setup["dave"]
    )

    result = await friend_service.discover_players(
        db_session,
        discover_setup["alice"],
    )
    status_map = {item["id"]: item["friend_status"] for item in result["items"]}
    assert status_map[discover_setup["dave"]] == "pending_outgoing"


@pytest.mark.asyncio
async def test_discover_players_mutual_friend_count(db_session, discover_setup):
    """Each item includes correct mutual_friend_count."""
    result = await friend_service.discover_players(
        db_session,
        discover_setup["alice"],
    )
    counts = {item["id"]: item["mutual_friend_count"] for item in result["items"]}

    assert counts[discover_setup["dave"]] == 2
    assert counts[discover_setup["eve"]] == 1


@pytest.mark.asyncio
async def test_discover_players_search_filter(db_session, discover_setup):
    """Search by name filters results."""
    result = await friend_service.discover_players(
        db_session,
        discover_setup["alice"],
        search="Dave",
    )
    assert result["total_count"] == 1
    assert result["items"][0]["id"] == discover_setup["dave"]


@pytest.mark.asyncio
async def test_discover_players_includes_zero_game_players(db_session, discover_setup):
    """Players with a stats row but zero games are discoverable."""
    _, frank = await _create_player_with_stats(
        db_session,
        "+15552000006",
        "Frank Zero",
        total_games=0,
        current_rating=1200.0,
    )

    result = await friend_service.discover_players(
        db_session,
        discover_setup["alice"],
        search="Frank",
    )
    assert result["total_count"] == 1
    item = result["items"][0]
    assert item["id"] == frank
    assert item["total_games"] == 0
    assert item["friend_status"] == "none"


@pytest.mark.asyncio
async def test_discover_players_includes_players_without_stats_row(
    db_session, discover_setup
):
    """Brand-new players with no PlayerGlobalStats row are discoverable and
    get coalesced defaults (0 games, 1200 rating)."""
    _, gina = await _create_user_and_player(db_session, "+15552000007", "Gina Newcomer")

    result = await friend_service.discover_players(
        db_session,
        discover_setup["alice"],
        search="Gina",
    )
    assert result["total_count"] == 1
    item = result["items"][0]
    assert item["id"] == gina
    assert item["total_games"] == 0
    assert item["current_rating"] == 1200.0

    # Also visible in unfiltered browse
    browse = await friend_service.discover_players(
        db_session,
        discover_setup["alice"],
    )
    assert gina in {entry["id"] for entry in browse["items"]}


@pytest.mark.asyncio
async def test_discover_players_gender_filter(db_session, discover_setup):
    """Filter by gender returns only matching players."""
    result = await friend_service.discover_players(
        db_session,
        discover_setup["alice"],
        gender="male",
    )
    result_ids = {item["id"] for item in result["items"]}
    # Bob and Dave are male
    assert discover_setup["bob"] in result_ids
    assert discover_setup["dave"] in result_ids
    # Carol and Eve are female
    assert discover_setup["carol"] not in result_ids
    assert discover_setup["eve"] not in result_ids


@pytest.mark.asyncio
async def test_discover_players_level_filter(db_session, discover_setup):
    """Filter by level returns only matching players."""
    result = await friend_service.discover_players(
        db_session,
        discover_setup["alice"],
        level="advanced",
    )
    result_ids = {item["id"] for item in result["items"]}
    assert discover_setup["bob"] in result_ids
    assert discover_setup["eve"] in result_ids
    assert discover_setup["dave"] not in result_ids


@pytest.mark.asyncio
async def test_discover_players_same_league_filter(db_session, discover_setup):
    """same_league=True keeps only players sharing >=1 league with the caller."""
    shared_league = await _create_league(db_session, "Shared League")
    other_league = await _create_league(db_session, "Other League")
    await _add_league_member(db_session, shared_league, discover_setup["alice"])
    await _add_league_member(db_session, shared_league, discover_setup["dave"])
    await _add_league_member(db_session, other_league, discover_setup["eve"])

    result = await friend_service.discover_players(
        db_session, discover_setup["alice"], same_league=True
    )
    result_ids = {item["id"] for item in result["items"]}
    assert result_ids == {discover_setup["dave"]}
    assert result["total_count"] == 1


@pytest.mark.asyncio
async def test_discover_players_same_league_no_leagues(db_session, discover_setup):
    """same_league=True with a league-less caller returns no players."""
    result = await friend_service.discover_players(
        db_session, discover_setup["alice"], same_league=True
    )
    assert result["items"] == []
    assert result["total_count"] == 0


@pytest.mark.asyncio
async def test_discover_players_has_mutuals_filter(db_session, discover_setup):
    """has_mutuals=True keeps only players sharing >=1 friend with the caller."""
    result = await friend_service.discover_players(
        db_session, discover_setup["alice"], has_mutuals=True
    )
    result_ids = {item["id"] for item in result["items"]}
    # Dave (2 mutuals: Bob+Carol) and Eve (1: Bob). Bob/Carol are Alice's
    # friends but share no third friend with her, so they drop out too.
    assert result_ids == {discover_setup["dave"], discover_setup["eve"]}
    assert result["total_count"] == 2


@pytest.mark.asyncio
async def test_discover_players_has_mutuals_friendless_caller(db_session, players):
    """has_mutuals=True for a caller with no friends returns no players."""
    # `players` fixture has no friendships or stats; give one target stats so
    # the base query would otherwise match it.
    stats = PlayerGlobalStats(player_id=players["bob"], total_games=10)
    db_session.add(stats)
    await db_session.flush()

    result = await friend_service.discover_players(db_session, players["alice"], has_mutuals=True)
    assert result["items"] == []
    assert result["total_count"] == 0


@pytest.mark.asyncio
async def test_discover_players_min_games_filter(db_session, discover_setup):
    """min_games excludes players below the threshold."""
    result = await friend_service.discover_players(
        db_session,
        discover_setup["alice"],
        min_games=25,
    )
    result_ids = {item["id"] for item in result["items"]}
    # Bob=30, Dave=40 pass; Carol=20, Eve=5 filtered out
    assert discover_setup["bob"] in result_ids
    assert discover_setup["dave"] in result_ids
    assert discover_setup["carol"] not in result_ids
    assert discover_setup["eve"] not in result_ids


@pytest.mark.asyncio
async def test_discover_players_location_filter(db_session, discover_setup):
    """Filter by location_id returns only matching players."""
    result = await friend_service.discover_players(
        db_session,
        discover_setup["alice"],
        location_id="test_beach",
    )
    result_ids = {item["id"] for item in result["items"]}
    # Bob and Carol are at test_beach; Dave and Eve have no location
    assert discover_setup["bob"] in result_ids
    assert discover_setup["carol"] in result_ids
    assert discover_setup["dave"] not in result_ids
    assert discover_setup["eve"] not in result_ids


@pytest.mark.asyncio
async def test_discover_players_sort_by_games(db_session, discover_setup):
    """Sort by games descending orders by total_games."""
    result = await friend_service.discover_players(
        db_session,
        discover_setup["alice"],
        sort_by="games",
        sort_dir="desc",
    )
    games_list = [item["total_games"] for item in result["items"]]
    assert games_list == sorted(games_list, reverse=True)


@pytest.mark.asyncio
async def test_discover_players_sort_by_name(db_session, discover_setup):
    """Sort by name ascending orders alphabetically."""
    result = await friend_service.discover_players(
        db_session,
        discover_setup["alice"],
        sort_by="name",
        sort_dir="asc",
    )
    names = [item["full_name"] for item in result["items"]]
    assert names == sorted(names)


@pytest.mark.asyncio
async def test_discover_players_pagination(db_session, discover_setup):
    """Pagination returns correct page and page_size."""
    result = await friend_service.discover_players(
        db_session,
        discover_setup["alice"],
        page=1,
        page_size=2,
    )
    assert len(result["items"]) == 2
    assert result["page"] == 1
    assert result["page_size"] == 2
    assert result["total_count"] == 4  # 4 players besides Alice

    result_p2 = await friend_service.discover_players(
        db_session,
        discover_setup["alice"],
        page=2,
        page_size=2,
    )
    assert len(result_p2["items"]) == 2
    # No overlap between pages
    ids_p1 = {item["id"] for item in result["items"]}
    ids_p2 = {item["id"] for item in result_p2["items"]}
    assert ids_p1.isdisjoint(ids_p2)


@pytest.mark.asyncio
async def test_discover_players_includes_required_fields(db_session, discover_setup):
    """Each item has all DiscoverPlayerItem fields."""
    result = await friend_service.discover_players(
        db_session,
        discover_setup["alice"],
    )
    item = result["items"][0]
    required_fields = {
        "id",
        "full_name",
        "avatar",
        "gender",
        "level",
        "location_name",
        "total_games",
        "current_rating",
        "mutual_friend_count",
        "friend_status",
    }
    assert required_fields.issubset(item.keys())
