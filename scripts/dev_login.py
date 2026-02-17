#!/usr/bin/env python3
"""
Generate auth tokens for any local user — instant impersonation for dev testing.

Looks up by player ID (primary), or falls back to phone number.

Usage (via Makefile):
    make dev-login ID=1
    make dev-login ID=5550001111

Usage (via Docker):
    docker exec beach-kings-backend bash -c \
        "cd /app && PYTHONPATH=/app python scripts/dev_login.py 1"
"""

import asyncio
import os
import sys
from datetime import timedelta

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from sqlalchemy import select
from backend.database.db import AsyncSessionLocal
from backend.database.models import User, Player
from backend.services.auth_service import create_access_token, generate_refresh_token
from backend.services.user_service import create_refresh_token as store_refresh_token
from backend.utils.datetime_utils import utcnow


async def list_players(session):
    """Print available players for reference."""
    print("\n📋 Available players:")
    result = await session.execute(
        select(Player.id, Player.full_name, Player.user_id, Player.level, Player.city)
        .where(Player.is_placeholder.is_(False), Player.user_id.isnot(None))
        .order_by(Player.id)
        .limit(20)
    )
    for row in result.all():
        level = row[3] or "?"
        city = row[4] or "?"
        print(f"  Player #{row[0]:<4}  {row[1]:<20}  {level:<4}  {city}")
    print()


async def main(identifier: str = ""):
    """
    Generate tokens for a user by player ID or phone number.

    Args:
        identifier: Player ID (integer) or phone number (digits)
    """
    if not identifier:
        print("❌ Usage: make dev-login ID=1        (player ID)")
        print("         make dev-login ID=5550001111 (phone number)")
        async with AsyncSessionLocal() as session:
            await list_players(session)
        return

    async with AsyncSessionLocal() as session:
        user = None
        player = None

        # Try as player ID first (small integers)
        if identifier.isdigit() and len(identifier) <= 6:
            result = await session.execute(
                select(Player).where(
                    Player.id == int(identifier),
                    Player.is_placeholder.is_(False),
                    Player.user_id.isnot(None),
                )
            )
            player = result.scalar_one_or_none()
            if player:
                user_result = await session.execute(
                    select(User).where(User.id == player.user_id)
                )
                user = user_result.scalar_one_or_none()

        # Fall back to phone number
        if not user:
            digits = "".join(c for c in identifier if c.isdigit())
            if len(digits) == 10:
                phone = f"+1{digits}"
            elif len(digits) == 11 and digits.startswith("1"):
                phone = f"+{digits}"
            else:
                phone = identifier

            result = await session.execute(
                select(User).where(User.phone_number == phone)
            )
            user = result.scalar_one_or_none()

            if user:
                player_result = await session.execute(
                    select(Player).where(
                        Player.user_id == user.id,
                        Player.is_placeholder.is_(False),
                    )
                )
                player = player_result.scalar_one_or_none()

        if not user:
            print(f"❌ No player found for: {identifier}")
            await list_players(session)
            return

        player_name = player.full_name if player else "(no player profile)"

        # Generate long-lived access token (24h for dev convenience)
        access_token = create_access_token(
            data={"user_id": user.id, "phone_number": user.phone_number},
            expires_delta=timedelta(hours=24),
        )

        # Generate and store refresh token
        refresh_token = generate_refresh_token()
        expires_at = utcnow() + timedelta(days=30)
        await store_refresh_token(session, user.id, refresh_token, expires_at)

        # Output
        print(f"\n🏖️  Logged in as: {player_name}")
        print(f"   Player #{player.id if player else '?'} | User #{user.id} | {user.phone_number}")
        if player:
            print(f"   {player.level or '?'} | {player.city or '?'}, {player.state or '?'}")
        print()

        # Browser-paste snippet
        print("📋 Paste into browser console (F12 → Console):\n")
        print(f"localStorage.setItem('beach_access_token', '{access_token}');")
        print(f"localStorage.setItem('beach_refresh_token', '{refresh_token}');")
        print("location.reload();")
        print()


if __name__ == "__main__":
    identifier = sys.argv[1] if len(sys.argv) > 1 else ""
    asyncio.run(main(identifier))
