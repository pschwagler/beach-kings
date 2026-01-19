#!/usr/bin/env python3
"""
Script to create a notification for a user.

Usage:
    python scripts/create_notification.py --user-id 1 --type LEAGUE_MESSAGE --title "Test Notification" --message "This is a test message"
    
Or run interactively:
    python scripts/create_notification.py
"""

import asyncio
import sys
import os
import argparse
from pathlib import Path

# Add the project root to the path so we can import backend modules
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from backend.database.db import AsyncSessionLocal
from backend.services import notification_service
from backend.database.models import NotificationType


async def create_notification_for_user(
    user_id: int,
    notification_type: str,
    title: str,
    message: str,
    link_url: str = None,
    data: dict = None
):
    """Create a notification for a user."""
    async with AsyncSessionLocal() as session:
        try:
            notification = await notification_service.create_notification(
                session=session,
                user_id=user_id,
                type=notification_type,
                title=title,
                message=message,
                link_url=link_url,
                data=data
            )
            await session.commit()
            print(f"✅ Successfully created notification for user {user_id}")
            print(f"   Notification ID: {notification['id']}")
            print(f"   Title: {notification['title']}")
            print(f"   Message: {notification['message']}")
            print(f"   Type: {notification['type']}")
            return notification
        except Exception as e:
            await session.rollback()
            print(f"❌ Error creating notification: {e}")
            raise


async def main():
    parser = argparse.ArgumentParser(description="Create a notification for a user")
    parser.add_argument("--user-id", type=int, help="User ID to send notification to", default=1)
    parser.add_argument("--type", type=str, help="Notification type", 
                       choices=[t.value for t in NotificationType],
                       default=NotificationType.LEAGUE_MESSAGE.value)
    parser.add_argument("--title", type=str, help="Notification title", 
                       default="Test Notification")
    parser.add_argument("--message", type=str, help="Notification message",
                       default="This is a test notification message")
    parser.add_argument("--link-url", type=str, help="Optional link URL", default=None)
    
    args = parser.parse_args()
    
    await create_notification_for_user(
        user_id=args.user_id,
        notification_type=args.type,
        title=args.title,
        message=args.message,
        link_url=args.link_url
    )


if __name__ == "__main__":
    asyncio.run(main())

