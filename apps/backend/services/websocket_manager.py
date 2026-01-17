"""
WebSocket connection manager for real-time notification delivery.

Manages active WebSocket connections per user and provides methods
to broadcast messages to specific users.
"""

import asyncio
import json
import logging
from typing import Dict, Set, Optional
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Manages WebSocket connections for real-time notifications."""
    
    def __init__(self):
        """Initialize the WebSocket manager."""
        # Dictionary mapping user_id to set of active WebSocket connections
        self.active_connections: Dict[int, Set[WebSocket]] = {}
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

