"""
WebSocket connection manager for real-time notification delivery.

Manages active WebSocket connections per user and provides methods
to broadcast messages to specific users.
"""

import asyncio
import json
import logging
from typing import Dict, Set, Optional
from datetime import datetime, timedelta
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

# Timeout for WebSocket connections (30 seconds of inactivity)
WEBSOCKET_TIMEOUT_SECONDS = 30


class WebSocketManager:
    """Manages WebSocket connections for real-time notifications."""
    
    def __init__(self):
        """Initialize the WebSocket manager."""
        # Dictionary mapping user_id to set of active WebSocket connections
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        # Dictionary mapping WebSocket to last activity timestamp
        self.connection_timestamps: Dict[WebSocket, datetime] = {}
        # Lock for thread-safe access to connections dict
        self._lock = asyncio.Lock()
    
    async def connect(self, user_id: int, websocket: WebSocket):
        """
        Register a WebSocket connection for a user.
        
        Args:
            user_id: ID of the user
            websocket: WebSocket connection object
        """
        async with self._lock:
            if user_id not in self.active_connections:
                self.active_connections[user_id] = set()
            self.active_connections[user_id].add(websocket)
            self.connection_timestamps[websocket] = datetime.utcnow()
            logger.info(f"WebSocket connected for user {user_id} (total connections: {len(self.active_connections[user_id])})")
    
    async def disconnect(self, user_id: int, websocket: WebSocket):
        """
        Remove a WebSocket connection for a user.
        
        Args:
            user_id: ID of the user
            websocket: WebSocket connection object
        """
        async with self._lock:
            if user_id in self.active_connections:
                self.active_connections[user_id].discard(websocket)
                # Clean up empty sets
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]
            # Remove timestamp tracking
            if websocket in self.connection_timestamps:
                del self.connection_timestamps[websocket]
            logger.info(f"WebSocket disconnected for user {user_id}")
    
    async def send_to_user(self, user_id: int, message: dict) -> bool:
        """
        Send a message to all active WebSocket connections for a user.
        
        Args:
            user_id: ID of the user
            message: Message dict to send (will be serialized to JSON)
            
        Returns:
            True if message was sent to at least one connection, False otherwise
        """
        async with self._lock:
            if user_id not in self.active_connections:
                return False
            
            connections = self.active_connections[user_id].copy()
        
        # Send to all connections (outside lock to avoid blocking)
        sent = False
        disconnected_connections = []
        
        for websocket in connections:
            try:
                # Update last activity timestamp
                async with self._lock:
                    self.connection_timestamps[websocket] = datetime.utcnow()
                
                message_json = json.dumps(message)
                await websocket.send_text(message_json)
                sent = True
            except Exception as e:
                logger.warning(f"Error sending WebSocket message to user {user_id}: {e}")
                # Mark connection for removal
                disconnected_connections.append(websocket)
        
        # Clean up disconnected connections
        if disconnected_connections:
            async with self._lock:
                if user_id in self.active_connections:
                    for ws in disconnected_connections:
                        self.active_connections[user_id].discard(ws)
                    if not self.active_connections[user_id]:
                        del self.active_connections[user_id]
        
        return sent
    
    async def get_connection_count(self, user_id: int) -> int:
        """
        Get the number of active connections for a user.
        
        Args:
            user_id: ID of the user
            
        Returns:
            Number of active connections
        """
        async with self._lock:
            if user_id not in self.active_connections:
                return 0
            return len(self.active_connections[user_id])
    
    async def update_activity(self, websocket: WebSocket):
        """
        Update the last activity timestamp for a WebSocket connection.
        Called when receiving ping or other messages from client.
        
        Args:
            websocket: WebSocket connection object
        """
        async with self._lock:
            if websocket in self.connection_timestamps:
                self.connection_timestamps[websocket] = datetime.utcnow()
    
    async def cleanup_stale_connections(self):
        """
        Clean up stale WebSocket connections that haven't had activity
        within the timeout period.
        
        This should be called periodically (e.g., every minute) to clean up
        connections that have timed out.
        """
        now = datetime.utcnow()
        timeout_threshold = now - timedelta(seconds=WEBSOCKET_TIMEOUT_SECONDS)
        
        stale_connections = []
        async with self._lock:
            for websocket, last_activity in list(self.connection_timestamps.items()):
                if last_activity < timeout_threshold:
                    stale_connections.append(websocket)
        
        # Close and remove stale connections
        for websocket in stale_connections:
            try:
                # Find which user this connection belongs to
                user_id_to_remove = None
                async with self._lock:
                    for user_id, conn_set in list(self.active_connections.items()):
                        if websocket in conn_set:
                            user_id_to_remove = user_id
                            break
                
                if user_id_to_remove:
                    await self.disconnect(user_id_to_remove, websocket)
                    logger.info(f"Cleaned up stale WebSocket connection for user {user_id_to_remove}")
            except Exception as e:
                logger.warning(f"Error cleaning up stale connection: {e}")


# Global WebSocket manager instance
_websocket_manager: Optional[WebSocketManager] = None


def get_websocket_manager() -> WebSocketManager:
    """
    Get the global WebSocket manager instance.
    
    Returns:
        WebSocketManager instance
    """
    global _websocket_manager
    if _websocket_manager is None:
        _websocket_manager = WebSocketManager()
    return _websocket_manager

