#!/usr/bin/env python3
"""
Seed local dev database with test users for manual testing.

Creates 3 users with easy-to-remember credentials and complete player profiles.
Idempotent — skips users that already exist.

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
from backend.services.auth_service import hash_password

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
    """Create test users with complete player profiles."""
    print("\n🏖️  Seeding test users...\n")

    async with AsyncSessionLocal() as session:
        for user_data in TEST_USERS:
            # Check if user already exists
            result = await session.execute(
                select(User).where(User.phone_number == user_data["phone"])
            )
            existing_user = result.scalar_one_or_none()

            if existing_user:
                print(f"  ⏭️  {user_data['name']} already exists (user #{existing_user.id})")
                continue

            # Create user
            password_hash = hash_password(user_data["password"])
            new_user = User(
                phone_number=user_data["phone"],
                password_hash=password_hash,
                email=user_data["email"],
                is_verified=True,
            )
            session.add(new_user)
            await session.flush()

            # Create player profile
            new_player = Player(
                full_name=user_data["name"],
                user_id=new_user.id,
                gender=user_data["gender"],
                level=user_data["level"],
                location_id=user_data["location_id"],
                city=user_data["city"],
                state=user_data["state"],
                is_placeholder=False,
            )
            session.add(new_player)
            await session.flush()

            print(f"  ✅ Created {user_data['name']} (user #{new_user.id}, player #{new_player.id})")

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
