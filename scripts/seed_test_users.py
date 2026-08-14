#!/usr/bin/env python3
# ruff: noqa: E402
"""
Seed local dev database with test users for manual testing.

Creates 3 users with easy-to-remember credentials and complete player profiles.
Idempotent — creates missing fixtures and normalizes existing fixtures back to
the documented local credentials and complete player profiles.

Usage (via Makefile):
    make seed-users

Usage (via Docker):
    docker exec beach-kings-backend python -c "
        import sys; sys.path.insert(0, '/app');
        from scripts.seed_test_users import main; import asyncio; asyncio.run(main())
    "
"""

import asyncio
import os
import sys

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from sqlalchemy import select
from backend.database.db import AsyncSessionLocal
from backend.database.models import User, Player
from backend.services.auth.auth_service import hash_password

# Test users — easy to remember
TEST_USERS = [
    {
        "phone": "+15550001111",
        "password": "test1234",
        "name": "Alice Test",
        "email": "alice@test.com",
        "gender": "female",
        "level": "A",
        "location_id": "socal_sd",
        "city": "San Diego",
        "state": "CA",
    },
    {
        "phone": "+15550002222",
        "password": "test1234",
        "name": "Bob Test",
        "email": "bob@test.com",
        "gender": "male",
        "level": "AA",
        "location_id": "socal_la",
        "city": "Los Angeles",
        "state": "CA",
    },
    {
        "phone": "+15550003333",
        "password": "test1234",
        "name": "Carol Test",
        "email": "carol@test.com",
        "gender": "female",
        "level": "B",
        "location_id": "socal_sd",
        "city": "San Diego",
        "state": "CA",
    },
]


async def main():
    """Create or normalize test users with complete player profiles."""
    print("\n🏖️  Seeding test users...\n")

    async with AsyncSessionLocal() as session:
        for user_data in TEST_USERS:
            # Check if user already exists
            result = await session.execute(
                select(User).where(User.phone_number == user_data["phone"])
            )
            existing_user = result.scalar_one_or_none()

            if existing_user is None:
                existing_user = User(phone_number=user_data["phone"])
                session.add(existing_user)
                await session.flush()
                user_action = "Created"
            else:
                user_action = "Normalized"

            # These accounts exist solely as local fixtures. Reapply the
            # documented contract on every run so stale passwords or partial
            # signup state cannot make manual/E2E results order-dependent.
            existing_user.password_hash = hash_password(user_data["password"])
            existing_user.email = user_data["email"]
            existing_user.auth_provider = "phone"
            existing_user.is_verified = True
            existing_user.deleted_at = None
            existing_user.deletion_scheduled_at = None
            existing_user.moderation_status = "active"
            existing_user.age_group = "adult"
            existing_user.eligibility_country = "US"
            existing_user.eligibility_region = user_data["state"]
            existing_user.age_assurance_source = "self_declared"
            existing_user.age_declaration_source = "self_declared"
            existing_user.guardian_consent = False

            player_result = await session.execute(
                select(Player).where(Player.user_id == existing_user.id)
            )
            player = player_result.scalars().first()
            if player is None:
                player = Player(user_id=existing_user.id, full_name=user_data["name"])
                session.add(player)
                await session.flush()

            first_name, last_name = user_data["name"].split(" ", 1)
            player.full_name = user_data["name"]
            player.first_name = first_name
            player.last_name = last_name
            player.gender = user_data["gender"]
            player.level = user_data["level"]
            player.location_id = user_data["location_id"]
            player.city = user_data["city"]
            player.state = user_data["state"]
            player.is_placeholder = False
            player.deleted_at = None

            print(
                f"  ✅ {user_action} {user_data['name']} "
                f"(user #{existing_user.id}, player #{player.id})"
            )

        await session.commit()

    # Print summary
    print("\n" + "─" * 50)
    print("📋 Test User Credentials:")
    print("─" * 50)
    for u in TEST_USERS:
        phone_short = u["phone"].replace("+1", "")
        print(f"  {u['name']:<14}  phone: {phone_short}  pw: {u['password']}")
    print("─" * 50)
    print("💡 Login at http://localhost:3000/login")
    print("💡 Or use: make dev-login PHONE=5550001111\n")


if __name__ == "__main__":
    asyncio.run(main())
