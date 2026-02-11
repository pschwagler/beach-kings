"""
Unit tests for WebSocket manager.
Tests connection management, message sending, and timeout handling.
"""

import pytest
import pytest_asyncio
import asyncio
from unittest.mock import AsyncMock
from datetime import datetime, timedelta
from backend.services.websocket_manager import (
    WebSocketManager,
    get_websocket_manager,
    WEBSOCKET_TIMEOUT_SECONDS,
)


@pytest_asyncio.fixture
async def ws_manager():
    """Create a fresh WebSocket manager for each test."""
    return WebSocketManager()


@pytest_asyncio.fixture
def mock_websocket():
    """Create a mock WebSocket connection."""
    ws = AsyncMock()
    ws.send_text = AsyncMock()
    ws.close = AsyncMock()
    return ws


@pytest.mark.asyncio
async def test_connect(ws_manager, mock_websocket):
    """Test connecting a WebSocket."""
    user_id = 1

    await ws_manager.connect(user_id, mock_websocket)

    # Verify connection is registered
    count = await ws_manager.get_connection_count(user_id)
    assert count == 1

    # Verify timestamp is set
    assert mock_websocket in ws_manager.connection_timestamps


@pytest.mark.asyncio
async def test_connect_multiple_connections(ws_manager, mock_websocket):
    """Test connecting multiple WebSockets for same user."""
    user_id = 1
    ws1 = AsyncMock()
    ws1.send_text = AsyncMock()
    ws2 = AsyncMock()
    ws2.send_text = AsyncMock()

    await ws_manager.connect(user_id, ws1)
    await ws_manager.connect(user_id, ws2)

    count = await ws_manager.get_connection_count(user_id)
    assert count == 2


@pytest.mark.asyncio
async def test_disconnect(ws_manager, mock_websocket):
    """Test disconnecting a WebSocket."""
    user_id = 1

    await ws_manager.connect(user_id, mock_websocket)
    assert await ws_manager.get_connection_count(user_id) == 1

    await ws_manager.disconnect(user_id, mock_websocket)

    # Verify connection is removed
    count = await ws_manager.get_connection_count(user_id)
    assert count == 0

    # Verify timestamp is removed
    assert mock_websocket not in ws_manager.connection_timestamps


@pytest.mark.asyncio
async def test_disconnect_multiple_connections(ws_manager):
    """Test disconnecting one connection when multiple exist."""
    user_id = 1
    ws1 = AsyncMock()
    ws1.send_text = AsyncMock()
    ws2 = AsyncMock()
    ws2.send_text = AsyncMock()

    await ws_manager.connect(user_id, ws1)
    await ws_manager.connect(user_id, ws2)

    await ws_manager.disconnect(user_id, ws1)

    # Only one should remain
    count = await ws_manager.get_connection_count(user_id)
    assert count == 1


@pytest.mark.asyncio
async def test_send_to_user(ws_manager, mock_websocket):
    """Test sending a message to a user."""
    user_id = 1
    message = {"type": "notification", "notification": {"id": 1}}

    await ws_manager.connect(user_id, mock_websocket)
    result = await ws_manager.send_to_user(user_id, message)

    assert result is True
    mock_websocket.send_text.assert_called_once()
    # Verify JSON was sent
    call_args = mock_websocket.send_text.call_args[0][0]
    assert '"type": "notification"' in call_args


@pytest.mark.asyncio
async def test_send_to_user_no_connection(ws_manager):
    """Test sending to a user with no active connections."""
    user_id = 1
    message = {"type": "notification"}

    result = await ws_manager.send_to_user(user_id, message)

    assert result is False


@pytest.mark.asyncio
async def test_send_to_user_multiple_connections(ws_manager):
    """Test sending to a user with multiple connections."""
    user_id = 1
    ws1 = AsyncMock()
    ws1.send_text = AsyncMock()
    ws2 = AsyncMock()
    ws2.send_text = AsyncMock()
    message = {"type": "notification"}

    await ws_manager.connect(user_id, ws1)
    await ws_manager.connect(user_id, ws2)

    result = await ws_manager.send_to_user(user_id, message)

    assert result is True
    ws1.send_text.assert_called_once()
    ws2.send_text.assert_called_once()


@pytest.mark.asyncio
async def test_send_to_user_connection_error(ws_manager):
    """Test handling connection errors when sending."""
    user_id = 1
    ws = AsyncMock()
    ws.send_text = AsyncMock(side_effect=Exception("Connection error"))
    message = {"type": "notification"}

    await ws_manager.connect(user_id, ws)
    result = await ws_manager.send_to_user(user_id, message)

    # Should return False if all connections fail
    assert result is False
    # Connection should be cleaned up
    count = await ws_manager.get_connection_count(user_id)
    assert count == 0


@pytest.mark.asyncio
async def test_send_to_user_partial_failure(ws_manager):
    """Test sending when one connection fails but another succeeds."""
    user_id = 1
    ws1 = AsyncMock()
    ws1.send_text = AsyncMock()
    ws2 = AsyncMock()
    ws2.send_text = AsyncMock(side_effect=Exception("Connection error"))
    message = {"type": "notification"}

    await ws_manager.connect(user_id, ws1)
    await ws_manager.connect(user_id, ws2)

    result = await ws_manager.send_to_user(user_id, message)

    # Should return True if at least one succeeds
    assert result is True
    ws1.send_text.assert_called_once()
    # Failed connection should be cleaned up
    count = await ws_manager.get_connection_count(user_id)
    assert count == 1


@pytest.mark.asyncio
async def test_update_activity(ws_manager, mock_websocket):
    """Test updating connection activity timestamp."""
    user_id = 1

    await ws_manager.connect(user_id, mock_websocket)
    initial_time = ws_manager.connection_timestamps[mock_websocket]

    # Wait a bit
    await asyncio.sleep(0.01)

    await ws_manager.update_activity(mock_websocket)
    updated_time = ws_manager.connection_timestamps[mock_websocket]

    assert updated_time > initial_time


@pytest.mark.asyncio
async def test_update_activity_not_connected(ws_manager, mock_websocket):
    """Test updating activity for a connection that doesn't exist."""
    # Should not raise an error
    await ws_manager.update_activity(mock_websocket)

    # Timestamp should not be set
    assert mock_websocket not in ws_manager.connection_timestamps


@pytest.mark.asyncio
async def test_cleanup_stale_connections(ws_manager):
    """Test cleaning up stale connections."""
    user_id = 1
    ws = AsyncMock()
    ws.send_text = AsyncMock()
    ws.close = AsyncMock()

    await ws_manager.connect(user_id, ws)

    # Manually set old timestamp
    old_time = datetime.utcnow() - timedelta(seconds=WEBSOCKET_TIMEOUT_SECONDS + 10)
    ws_manager.connection_timestamps[ws] = old_time

    await ws_manager.cleanup_stale_connections()

    # Connection should be removed
    count = await ws_manager.get_connection_count(user_id)
    assert count == 0
    assert ws not in ws_manager.connection_timestamps


@pytest.mark.asyncio
async def test_cleanup_stale_connections_recent(ws_manager, mock_websocket):
    """Test that recent connections are not cleaned up."""
    user_id = 1

    await ws_manager.connect(user_id, mock_websocket)

    # Timestamp should be recent (just set)
    await ws_manager.cleanup_stale_connections()

    # Connection should still exist
    count = await ws_manager.get_connection_count(user_id)
    assert count == 1


@pytest.mark.asyncio
async def test_get_connection_count(ws_manager, mock_websocket):
    """Test getting connection count."""
    user_id = 1

    # No connections
    count = await ws_manager.get_connection_count(user_id)
    assert count == 0

    # Add connection
    await ws_manager.connect(user_id, mock_websocket)
    count = await ws_manager.get_connection_count(user_id)
    assert count == 1


@pytest.mark.asyncio
async def test_get_websocket_manager_singleton():
    """Test that get_websocket_manager returns a singleton."""
    manager1 = get_websocket_manager()
    manager2 = get_websocket_manager()

    assert manager1 is manager2


@pytest.mark.asyncio
async def test_send_to_user_updates_activity(ws_manager, mock_websocket):
    """Test that sending a message updates activity timestamp."""
    user_id = 1
    message = {"type": "notification"}

    await ws_manager.connect(user_id, mock_websocket)
    initial_time = ws_manager.connection_timestamps[mock_websocket]

    # Wait a bit
    await asyncio.sleep(0.01)

    await ws_manager.send_to_user(user_id, message)
    updated_time = ws_manager.connection_timestamps[mock_websocket]

    assert updated_time > initial_time
