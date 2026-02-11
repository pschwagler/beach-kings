"""
Unit tests for notification service.
Tests notification creation, retrieval, marking as read, and bulk operations.
"""

import pytest
import pytest_asyncio
from backend.services import notification_service
from backend.database.models import NotificationType
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
