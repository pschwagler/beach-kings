"""
Unit tests for notification service.
Tests notification creation, retrieval, marking as read, and bulk operations.
"""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch
from backend.services import notification_service
from backend.database.models import NotificationType, Player, League
from backend.services import user_service


@pytest_asyncio.fixture
async def test_user(db_session):
    """Create a test user for notification tests."""
    user_id = await user_service.create_user(
        session=db_session, phone_number="+15551234567", password_hash="hashed_password"
    )
    return user_id


@pytest_asyncio.fixture
async def test_user2(db_session):
    """Create a second test user for notification tests."""
    user_id = await user_service.create_user(
        session=db_session, phone_number="+15559876543", password_hash="hashed_password"
    )
    return user_id


@pytest.mark.asyncio
async def test_create_notification(db_session, test_user):
    """Test creating a single notification."""
    notification = await notification_service.create_notification(
        session=db_session,
        user_id=test_user,
        type=NotificationType.LEAGUE_MESSAGE.value,
        title="Test Notification",
        message="This is a test notification",
        data={"league_id": 1},
        link_url="/leagues/1",
    )

    assert notification is not None
    assert notification["user_id"] == test_user
    assert notification["type"] == NotificationType.LEAGUE_MESSAGE.value
    assert notification["title"] == "Test Notification"
    assert notification["message"] == "This is a test notification"
    assert notification["data"] == {"league_id": 1}
    assert notification["link_url"] == "/leagues/1"
    assert notification["is_read"] is False
    assert notification["id"] > 0
    assert notification["created_at"] is not None


@pytest.mark.asyncio
async def test_create_notification_validation(db_session, test_user):
    """Test notification creation validation."""
    # Missing user_id
    with pytest.raises(ValueError, match="user_id is required"):
        await notification_service.create_notification(
            session=db_session,
            user_id=None,
            type=NotificationType.LEAGUE_MESSAGE.value,
            title="Test",
            message="Test",
        )

    # Missing type
    with pytest.raises(ValueError, match="type is required"):
        await notification_service.create_notification(
            session=db_session, user_id=test_user, type="", title="Test", message="Test"
        )

    # Missing title
    with pytest.raises(ValueError, match="title is required"):
        await notification_service.create_notification(
            session=db_session,
            user_id=test_user,
            type=NotificationType.LEAGUE_MESSAGE.value,
            title="",
            message="Test",
        )

    # Missing message
    with pytest.raises(ValueError, match="message is required"):
        await notification_service.create_notification(
            session=db_session,
            user_id=test_user,
            type=NotificationType.LEAGUE_MESSAGE.value,
            title="Test",
            message="",
        )


@pytest.mark.asyncio
async def test_create_notification_without_optional_fields(db_session, test_user):
    """Test creating notification without optional fields."""
    notification = await notification_service.create_notification(
        session=db_session,
        user_id=test_user,
        type=NotificationType.LEAGUE_MESSAGE.value,
        title="Test",
        message="Test message",
    )

    assert notification is not None
    assert notification["data"] is None
    assert notification["link_url"] is None


@pytest.mark.asyncio
async def test_create_notifications_bulk(db_session, test_user, test_user2):
    """Test creating multiple notifications in bulk."""
    notifications_list = [
        {
            "user_id": test_user,
            "type": NotificationType.LEAGUE_MESSAGE.value,
            "title": "Notification 1",
            "message": "Message 1",
        },
        {
            "user_id": test_user2,
            "type": NotificationType.LEAGUE_JOIN_REQUEST.value,
            "title": "Notification 2",
            "message": "Message 2",
            "data": {"league_id": 1},
            "link_url": "/leagues/1",
        },
        {
            "user_id": test_user,
            "type": NotificationType.SEASON_START.value,
            "title": "Notification 3",
            "message": "Message 3",
        },
    ]

    created = await notification_service.create_notifications_bulk(
        session=db_session, notifications_list=notifications_list
    )

    assert len(created) == 3
    assert all(n["id"] > 0 for n in created)
    assert created[0]["user_id"] == test_user
    assert created[1]["user_id"] == test_user2
    assert created[2]["user_id"] == test_user


@pytest.mark.asyncio
async def test_create_notifications_bulk_empty_list(db_session):
    """Test creating bulk notifications with empty list."""
    result = await notification_service.create_notifications_bulk(
        session=db_session, notifications_list=[]
    )

    assert result == []


@pytest.mark.asyncio
async def test_create_notifications_bulk_validation(db_session, test_user):
    """Test bulk notification creation validation."""
    # Missing user_id
    with pytest.raises(ValueError, match="user_id is required"):
        await notification_service.create_notifications_bulk(
            session=db_session,
            notifications_list=[
                {"type": NotificationType.LEAGUE_MESSAGE.value, "title": "Test", "message": "Test"}
            ],
        )

    # Missing type
    with pytest.raises(ValueError, match="type is required"):
        await notification_service.create_notifications_bulk(
            session=db_session,
            notifications_list=[{"user_id": test_user, "title": "Test", "message": "Test"}],
        )

    # Missing title
    with pytest.raises(ValueError, match="title is required"):
        await notification_service.create_notifications_bulk(
            session=db_session,
            notifications_list=[
                {
                    "user_id": test_user,
                    "type": NotificationType.LEAGUE_MESSAGE.value,
                    "message": "Test",
                }
            ],
        )

    # Missing message
    with pytest.raises(ValueError, match="message is required"):
        await notification_service.create_notifications_bulk(
            session=db_session,
            notifications_list=[
                {
                    "user_id": test_user,
                    "type": NotificationType.LEAGUE_MESSAGE.value,
                    "title": "Test",
                }
            ],
        )


@pytest.mark.asyncio
async def test_get_user_notifications(db_session, test_user):
    """Test retrieving user notifications."""
    # Create multiple notifications
    await notification_service.create_notification(
        session=db_session,
        user_id=test_user,
        type=NotificationType.LEAGUE_MESSAGE.value,
        title="Notification 1",
        message="Message 1",
    )
    await notification_service.create_notification(
        session=db_session,
        user_id=test_user,
        type=NotificationType.LEAGUE_JOIN_REQUEST.value,
        title="Notification 2",
        message="Message 2",
    )
    await db_session.commit()

    # Get all notifications
    result = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user
    )

    assert result["total_count"] == 2
    assert len(result["notifications"]) == 2
    assert result["has_more"] is False
    # Should be ordered by created_at DESC
    assert result["notifications"][0]["title"] == "Notification 2"


@pytest.mark.asyncio
async def test_get_user_notifications_pagination(db_session, test_user):
    """Test notification pagination."""
    # Create 5 notifications
    for i in range(5):
        await notification_service.create_notification(
            session=db_session,
            user_id=test_user,
            type=NotificationType.LEAGUE_MESSAGE.value,
            title=f"Notification {i}",
            message=f"Message {i}",
        )
    await db_session.commit()

    # Get first page (limit 2)
    result = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user, limit=2, offset=0
    )

    assert result["total_count"] == 5
    assert len(result["notifications"]) == 2
    assert result["has_more"] is True

    # Get second page
    result = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user, limit=2, offset=2
    )

    assert result["total_count"] == 5
    assert len(result["notifications"]) == 2
    assert result["has_more"] is True


@pytest.mark.asyncio
async def test_get_user_notifications_unread_only(db_session, test_user):
    """Test getting only unread notifications."""
    # Create read and unread notifications
    notif1 = await notification_service.create_notification(
        session=db_session,
        user_id=test_user,
        type=NotificationType.LEAGUE_MESSAGE.value,
        title="Unread",
        message="Message",
    )
    await notification_service.mark_as_read(
        session=db_session, notification_id=notif1["id"], user_id=test_user
    )

    await notification_service.create_notification(
        session=db_session,
        user_id=test_user,
        type=NotificationType.LEAGUE_MESSAGE.value,
        title="Unread 2",
        message="Message",
    )
    await db_session.commit()

    # Get unread only
    result = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user, unread_only=True
    )

    assert result["total_count"] == 1
    assert len(result["notifications"]) == 1
    assert result["notifications"][0]["title"] == "Unread 2"


@pytest.mark.asyncio
async def test_get_unread_count(db_session, test_user):
    """Test getting unread notification count."""
    # Create 3 notifications
    notif1 = await notification_service.create_notification(
        session=db_session,
        user_id=test_user,
        type=NotificationType.LEAGUE_MESSAGE.value,
        title="Notification 1",
        message="Message 1",
    )
    await notification_service.create_notification(
        session=db_session,
        user_id=test_user,
        type=NotificationType.LEAGUE_MESSAGE.value,
        title="Notification 2",
        message="Message 2",
    )
    await notification_service.create_notification(
        session=db_session,
        user_id=test_user,
        type=NotificationType.LEAGUE_MESSAGE.value,
        title="Notification 3",
        message="Message 3",
    )

    # Mark one as read
    await notification_service.mark_as_read(
        session=db_session, notification_id=notif1["id"], user_id=test_user
    )
    await db_session.commit()

    count = await notification_service.get_unread_count(session=db_session, user_id=test_user)

    assert count == 2


@pytest.mark.asyncio
async def test_mark_as_read(db_session, test_user):
    """Test marking a notification as read."""
    notification = await notification_service.create_notification(
        session=db_session,
        user_id=test_user,
        type=NotificationType.LEAGUE_MESSAGE.value,
        title="Test",
        message="Test message",
    )

    assert notification["is_read"] is False
    assert notification["read_at"] is None

    # Mark as read
    updated = await notification_service.mark_as_read(
        session=db_session, notification_id=notification["id"], user_id=test_user
    )

    assert updated["is_read"] is True
    assert updated["read_at"] is not None
    assert updated["id"] == notification["id"]


@pytest.mark.asyncio
async def test_mark_as_read_already_read(db_session, test_user):
    """Test marking an already-read notification as read."""
    notification = await notification_service.create_notification(
        session=db_session,
        user_id=test_user,
        type=NotificationType.LEAGUE_MESSAGE.value,
        title="Test",
        message="Test message",
    )

    # Mark as read first time
    updated1 = await notification_service.mark_as_read(
        session=db_session, notification_id=notification["id"], user_id=test_user
    )
    read_at_1 = updated1["read_at"]

    # Mark as read second time (should not change)
    updated2 = await notification_service.mark_as_read(
        session=db_session, notification_id=notification["id"], user_id=test_user
    )

    assert updated2["is_read"] is True
    assert updated2["read_at"] == read_at_1  # Should not change


@pytest.mark.asyncio
async def test_mark_as_read_wrong_user(db_session, test_user, test_user2):
    """Test that users can only mark their own notifications as read."""
    notification = await notification_service.create_notification(
        session=db_session,
        user_id=test_user,
        type=NotificationType.LEAGUE_MESSAGE.value,
        title="Test",
        message="Test message",
    )

    # Try to mark as read with wrong user
    with pytest.raises(ValueError, match="Notification not found or access denied"):
        await notification_service.mark_as_read(
            session=db_session, notification_id=notification["id"], user_id=test_user2
        )


@pytest.mark.asyncio
async def test_mark_as_read_nonexistent(db_session, test_user):
    """Test marking a nonexistent notification as read."""
    with pytest.raises(ValueError, match="Notification not found or access denied"):
        await notification_service.mark_as_read(
            session=db_session, notification_id=99999, user_id=test_user
        )


@pytest.mark.asyncio
async def test_mark_all_as_read(db_session, test_user):
    """Test marking all notifications as read."""
    # Create 3 notifications
    await notification_service.create_notification(
        session=db_session,
        user_id=test_user,
        type=NotificationType.LEAGUE_MESSAGE.value,
        title="Notification 1",
        message="Message 1",
    )
    await notification_service.create_notification(
        session=db_session,
        user_id=test_user,
        type=NotificationType.LEAGUE_MESSAGE.value,
        title="Notification 2",
        message="Message 2",
    )
    await notification_service.create_notification(
        session=db_session,
        user_id=test_user,
        type=NotificationType.LEAGUE_MESSAGE.value,
        title="Notification 3",
        message="Message 3",
    )
    await db_session.commit()

    # Mark all as read
    count = await notification_service.mark_all_as_read(session=db_session, user_id=test_user)

    assert count == 3

    # Verify all are read
    unread_count = await notification_service.get_unread_count(
        session=db_session, user_id=test_user
    )
    assert unread_count == 0


@pytest.mark.asyncio
async def test_mark_all_as_read_no_notifications(db_session, test_user):
    """Test marking all as read when user has no notifications."""
    count = await notification_service.mark_all_as_read(session=db_session, user_id=test_user)

    assert count == 0


@pytest.mark.asyncio
async def test_mark_all_as_read_partial(db_session, test_user):
    """Test marking all as read when some are already read."""
    # Create 3 notifications
    notif1 = await notification_service.create_notification(
        session=db_session,
        user_id=test_user,
        type=NotificationType.LEAGUE_MESSAGE.value,
        title="Notification 1",
        message="Message 1",
    )
    await notification_service.create_notification(
        session=db_session,
        user_id=test_user,
        type=NotificationType.LEAGUE_MESSAGE.value,
        title="Notification 2",
        message="Message 2",
    )

    # Mark one as read
    await notification_service.mark_as_read(
        session=db_session, notification_id=notif1["id"], user_id=test_user
    )
    await db_session.commit()

    # Mark all as read (should only mark 1)
    count = await notification_service.mark_all_as_read(session=db_session, user_id=test_user)

    assert count == 1


# ────────────────────────────────────────────────────────────────────────────
# notify_players_about_session_submitted tests
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_session_submitted_notification_league_session(db_session, test_user, test_user2):
    """Test session-submitted notification for a league session with multiple players."""
    # Create player rows for both users
    player1 = Player(user_id=test_user, full_name="Player One")
    player2 = Player(user_id=test_user2, full_name="Player Two")
    db_session.add_all([player1, player2])
    await db_session.flush()

    # Create league
    league = League(name="Test League")
    db_session.add(league)
    await db_session.flush()

    await db_session.commit()

    # Mock get_session_match_player_user_ids to return test_user2 (submitter excluded)
    with patch.object(
        notification_service,
        "get_session_match_player_user_ids",
        new_callable=AsyncMock,
        return_value=[test_user2],
    ):
        await notification_service.notify_players_about_session_submitted(
            session=db_session,
            session_id=999,
            submitter_user_id=test_user,
            session_name="Week 1",
            league_id=league.id,
            league_name="Test League",
        )
        await db_session.commit()

    result = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user2
    )
    assert result["total_count"] == 1
    notif = result["notifications"][0]
    assert notif["type"] == NotificationType.SESSION_SUBMITTED.value
    assert "Test League" in notif["title"]
    assert "Player One" in notif["message"]
    assert f"/league/{league.id}" in notif["link_url"]


@pytest.mark.asyncio
async def test_session_submitted_notification_no_players(db_session, test_user):
    """Test session-submitted notification early-returns when no players are in the session."""
    with patch.object(
        notification_service,
        "get_session_match_player_user_ids",
        new_callable=AsyncMock,
        return_value=[],
    ):
        await notification_service.notify_players_about_session_submitted(
            session=db_session,
            session_id=999,
            submitter_user_id=test_user,
            session_name="Empty Session",
        )
        await db_session.commit()

    result = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user
    )
    assert result["total_count"] == 0


@pytest.mark.asyncio
async def test_session_submitted_notification_non_league(db_session, test_user, test_user2):
    """Test session-submitted notification for a non-league session."""
    player1 = Player(user_id=test_user, full_name="Submitter Name")
    player2 = Player(user_id=test_user2, full_name="Other Player")
    db_session.add_all([player1, player2])
    await db_session.flush()
    await db_session.commit()

    with patch.object(
        notification_service,
        "get_session_match_player_user_ids",
        new_callable=AsyncMock,
        return_value=[test_user2],
    ):
        await notification_service.notify_players_about_session_submitted(
            session=db_session,
            session_id=888,
            submitter_user_id=test_user,
            session_name="Pickup Games",
            league_id=None,
        )
        await db_session.commit()

    result = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user2
    )
    assert result["total_count"] == 1
    notif = result["notifications"][0]
    assert notif["type"] == NotificationType.SESSION_SUBMITTED.value
    assert notif["title"] == "Games submitted"
    assert notif["link_url"] == "/home"


@pytest.mark.asyncio
async def test_session_submitted_excludes_submitter(db_session, test_user):
    """Test that the submitter is excluded from notifications."""
    player1 = Player(user_id=test_user, full_name="Solo Player")
    db_session.add(player1)
    await db_session.flush()
    await db_session.commit()

    # get_session_match_player_user_ids with exclude_user_id returns empty
    with patch.object(
        notification_service,
        "get_session_match_player_user_ids",
        new_callable=AsyncMock,
        return_value=[],
    ):
        await notification_service.notify_players_about_session_submitted(
            session=db_session,
            session_id=777,
            submitter_user_id=test_user,
            session_name="Solo Session",
        )
        await db_session.commit()

    result = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user
    )
    assert result["total_count"] == 0


# ────────────────────────────────────────────────────────────────────────────
# notify_league_members_about_message tests
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_notify_league_members_about_message_creates_notifications(
    db_session, test_user, test_user2
):
    """Members (excluding sender) receive LEAGUE_MESSAGE notifications."""
    player1 = Player(user_id=test_user, full_name="Sender Name")
    player2 = Player(user_id=test_user2, full_name="Member Name")
    db_session.add_all([player1, player2])
    league = League(name="Beach League")
    db_session.add(league)
    await db_session.flush()
    await db_session.commit()

    await notification_service.notify_league_members_about_message(
        session=db_session,
        league_id=league.id,
        message_id=42,
        sender_user_id=test_user,
        message_text="Hello everyone!",
        league_name="Beach League",
        member_user_ids=[test_user, test_user2],  # sender filtered out internally
    )
    await db_session.commit()

    # sender should NOT receive notification
    sender_notifs = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user
    )
    assert sender_notifs["total_count"] == 0

    # member should receive notification
    member_notifs = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user2
    )
    assert member_notifs["total_count"] == 1
    notif = member_notifs["notifications"][0]
    assert notif["type"] == NotificationType.LEAGUE_MESSAGE.value
    assert "Beach League" in notif["title"]
    assert notif["link_url"] == f"/league/{league.id}?tab=messages"


@pytest.mark.asyncio
async def test_notify_league_members_about_message_empty_member_list(db_session, test_user):
    """Empty member_user_ids list → no notifications created."""
    league = League(name="Empty League")
    db_session.add(league)
    await db_session.flush()
    await db_session.commit()

    await notification_service.notify_league_members_about_message(
        session=db_session,
        league_id=league.id,
        message_id=1,
        sender_user_id=test_user,
        message_text="Nobody here",
        league_name="Empty League",
        member_user_ids=[],
    )
    await db_session.commit()

    league_msg_result = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user
    )
    assert league_msg_result["total_count"] == 0


@pytest.mark.asyncio
async def test_notify_league_members_truncates_long_message(db_session, test_user, test_user2):
    """Messages longer than 100 characters are truncated with ellipsis."""
    player1 = Player(user_id=test_user, full_name="Alpha")
    player2 = Player(user_id=test_user2, full_name="Beta")
    db_session.add_all([player1, player2])
    league = League(name="Truncation League")
    db_session.add(league)
    await db_session.flush()
    await db_session.commit()

    long_text = "x" * 200

    await notification_service.notify_league_members_about_message(
        session=db_session,
        league_id=league.id,
        message_id=99,
        sender_user_id=test_user,
        message_text=long_text,
        league_name="Truncation League",
        member_user_ids=[test_user2],
    )
    await db_session.commit()

    notifs = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user2
    )
    assert notifs["total_count"] == 1
    assert notifs["notifications"][0]["message"].endswith("...")


# ────────────────────────────────────────────────────────────────────────────
# notify_admins_about_join_request tests
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_notify_admins_about_join_request_creates_notification(
    db_session, test_user, test_user2
):
    """League admins receive a LEAGUE_JOIN_REQUEST notification."""
    player_requesting = Player(user_id=test_user2, full_name="Requesting Player")
    db_session.add(player_requesting)
    league = League(name="Admin League")
    db_session.add(league)
    await db_session.flush()
    await db_session.commit()

    await notification_service.notify_admins_about_join_request(
        session=db_session,
        league_id=league.id,
        request_id=77,
        player_id=player_requesting.id,
        league_name="Admin League",
        player_name="Requesting Player",
        admin_user_ids=[test_user],
    )
    await db_session.commit()

    admin_notifs = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user
    )
    assert admin_notifs["total_count"] == 1
    notif = admin_notifs["notifications"][0]
    assert notif["type"] == NotificationType.LEAGUE_JOIN_REQUEST.value
    assert notif["title"] == "New Join Request"
    assert "Requesting Player" in notif["message"]
    assert "Admin League" in notif["message"]
    assert notif["link_url"] == f"/league/{league.id}?tab=details"
    # Data should include action buttons
    assert "actions" in notif["data"]


@pytest.mark.asyncio
async def test_notify_admins_about_join_request_empty_admin_list(db_session, test_user):
    """Empty admin_user_ids list → no notifications created."""
    league = League(name="No Admin League")
    db_session.add(league)
    await db_session.flush()
    await db_session.commit()

    await notification_service.notify_admins_about_join_request(
        session=db_session,
        league_id=league.id,
        request_id=1,
        player_id=1,
        admin_user_ids=[],
    )
    await db_session.commit()

    join_req_result = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user
    )
    assert join_req_result["total_count"] == 0


# ────────────────────────────────────────────────────────────────────────────
# notify_player_about_join_approval / rejection tests
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_notify_player_about_join_approval(db_session, test_user):
    """Approved player receives a LEAGUE_INVITE notification."""
    league = League(name="Approved League")
    db_session.add(league)
    await db_session.flush()
    await db_session.commit()

    await notification_service.notify_player_about_join_approval(
        session=db_session,
        league_id=league.id,
        player_user_id=test_user,
        league_name="Approved League",
    )
    await db_session.commit()

    notifs = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user
    )
    assert notifs["total_count"] == 1
    notif = notifs["notifications"][0]
    assert notif["type"] == NotificationType.LEAGUE_INVITE.value
    assert notif["title"] == "Join request approved"
    assert "Approved League" in notif["message"]
    assert notif["link_url"] == f"/league/{league.id}"


@pytest.mark.asyncio
async def test_notify_player_about_join_rejection(db_session, test_user):
    """Rejected player receives a LEAGUE_JOIN_REJECTED notification."""
    league = League(name="Rejected League")
    db_session.add(league)
    await db_session.flush()
    await db_session.commit()

    await notification_service.notify_player_about_join_rejection(
        session=db_session,
        league_id=league.id,
        player_user_id=test_user,
        league_name="Rejected League",
    )
    await db_session.commit()

    notifs = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user
    )
    assert notifs["total_count"] == 1
    notif = notifs["notifications"][0]
    assert notif["type"] == NotificationType.LEAGUE_JOIN_REJECTED.value
    assert notif["title"] == "Join request declined"
    assert "Rejected League" in notif["message"]


# ────────────────────────────────────────────────────────────────────────────
# notify_members_about_season_activated tests
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_notify_members_about_season_activated_active_season(db_session, test_user):
    """Members receive SEASON_ACTIVATED notification when season is currently active."""
    from datetime import date, timedelta

    league = League(name="Active League")
    db_session.add(league)
    await db_session.flush()
    await db_session.commit()

    today = date.today()
    start = (today - timedelta(days=5)).isoformat()
    end = (today + timedelta(days=25)).isoformat()

    await notification_service.notify_members_about_season_activated(
        session=db_session,
        league_id=league.id,
        season_id=1,
        season_name="Spring 2025",
        start_date=start,
        end_date=end,
        league_name="Active League",
        member_user_ids=[test_user],
    )
    await db_session.commit()

    notifs = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user
    )
    assert notifs["total_count"] == 1
    notif = notifs["notifications"][0]
    assert notif["type"] == NotificationType.SEASON_ACTIVATED.value
    assert "Active League" in notif["title"]
    assert "Spring 2025" in notif["message"]
    assert notif["link_url"] == f"/league/{league.id}?tab=rankings"


@pytest.mark.asyncio
async def test_notify_members_about_season_activated_future_season(db_session, test_user):
    """No notifications sent when season start date is in the future."""
    from datetime import date, timedelta

    league = League(name="Future League")
    db_session.add(league)
    await db_session.flush()
    await db_session.commit()

    today = date.today()
    start = (today + timedelta(days=10)).isoformat()
    end = (today + timedelta(days=40)).isoformat()

    await notification_service.notify_members_about_season_activated(
        session=db_session,
        league_id=league.id,
        season_id=2,
        season_name="Future Season",
        start_date=start,
        end_date=end,
        league_name="Future League",
        member_user_ids=[test_user],
    )
    await db_session.commit()

    notifs = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user
    )
    assert notifs["total_count"] == 0


@pytest.mark.asyncio
async def test_notify_members_about_season_activated_no_dates(db_session, test_user):
    """No notifications sent when start_date/end_date are not provided."""
    league = League(name="Dateless League")
    db_session.add(league)
    await db_session.flush()
    await db_session.commit()

    await notification_service.notify_members_about_season_activated(
        session=db_session,
        league_id=league.id,
        season_id=3,
        season_name="No Date Season",
        start_date=None,
        end_date=None,
        member_user_ids=[test_user],
    )
    await db_session.commit()

    notifs = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user
    )
    assert notifs["total_count"] == 0


@pytest.mark.asyncio
async def test_notify_members_about_season_activated_empty_members(db_session, test_user):
    """Empty member_user_ids → no notifications created."""
    from datetime import date, timedelta

    league = League(name="Empty Members League")
    db_session.add(league)
    await db_session.flush()
    await db_session.commit()

    today = date.today()
    start = (today - timedelta(days=1)).isoformat()
    end = (today + timedelta(days=30)).isoformat()

    await notification_service.notify_members_about_season_activated(
        session=db_session,
        league_id=league.id,
        season_id=4,
        season_name="Empty Season",
        start_date=start,
        end_date=end,
        member_user_ids=[],
    )
    await db_session.commit()

    season_act_result = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user
    )
    assert season_act_result["total_count"] == 0


# ────────────────────────────────────────────────────────────────────────────
# notify_members_about_new_member tests
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_notify_members_about_new_member_notifies_existing_members(
    db_session, test_user, test_user2
):
    """Existing members receive MEMBER_JOINED notification; new member is excluded."""
    existing_player = Player(user_id=test_user, full_name="Veteran")
    new_player = Player(user_id=test_user2, full_name="Newbie")
    db_session.add_all([existing_player, new_player])
    league = League(name="Growing League")
    db_session.add(league)
    await db_session.flush()
    await db_session.commit()

    await notification_service.notify_members_about_new_member(
        session=db_session,
        league_id=league.id,
        new_member_user_id=test_user2,
        league_name="Growing League",
        member_user_ids=[test_user, test_user2],  # new member filtered internally
    )
    await db_session.commit()

    # Existing member gets notified
    veteran_notifs = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user
    )
    assert veteran_notifs["total_count"] == 1
    notif = veteran_notifs["notifications"][0]
    assert notif["type"] == NotificationType.MEMBER_JOINED.value
    assert "Growing League" in notif["title"]
    assert notif["link_url"] == f"/league/{league.id}"

    # New member does NOT get notified about themselves
    newbie_notifs = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user2
    )
    assert newbie_notifs["total_count"] == 0


@pytest.mark.asyncio
async def test_notify_members_about_new_member_only_new_member_in_list(
    db_session, test_user
):
    """When the only member_user_id is the new member, no notifications are created."""
    league = League(name="Solo League")
    db_session.add(league)
    await db_session.flush()
    await db_session.commit()

    await notification_service.notify_members_about_new_member(
        session=db_session,
        league_id=league.id,
        new_member_user_id=test_user,
        member_user_ids=[test_user],
    )
    await db_session.commit()

    solo_notifs = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user
    )
    assert solo_notifs["total_count"] == 0


# ────────────────────────────────────────────────────────────────────────────
# notify_player_about_removal_from_league tests
# ────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_notify_player_about_removal_from_league(db_session, test_user):
    """Removed player receives a MEMBER_REMOVED notification."""
    league = League(name="Kicker League")
    db_session.add(league)
    await db_session.flush()
    await db_session.commit()

    await notification_service.notify_player_about_removal_from_league(
        session=db_session,
        league_id=league.id,
        removed_user_id=test_user,
        league_name="Kicker League",
    )
    await db_session.commit()

    notifs = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user
    )
    assert notifs["total_count"] == 1
    notif = notifs["notifications"][0]
    assert notif["type"] == NotificationType.MEMBER_REMOVED.value
    assert notif["title"] == "Removed from league"
    assert "Kicker League" in notif["message"]
    assert notif["link_url"] == "/home"


@pytest.mark.asyncio
async def test_notify_player_about_removal_fetches_league_name(db_session, test_user):
    """When league_name is None, it is fetched from the database."""
    league = League(name="Auto-fetched League")
    db_session.add(league)
    await db_session.flush()
    await db_session.commit()

    await notification_service.notify_player_about_removal_from_league(
        session=db_session,
        league_id=league.id,
        removed_user_id=test_user,
        league_name=None,  # forces DB lookup
    )
    await db_session.commit()

    notifs = await notification_service.get_user_notifications(
        session=db_session, user_id=test_user
    )
    assert notifs["total_count"] == 1
    assert "Auto-fetched League" in notifs["notifications"][0]["message"]
