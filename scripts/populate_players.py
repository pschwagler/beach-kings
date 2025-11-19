#!/usr/bin/env python3
"""
Script to populate players by signing them up and verifying their phones.
Since SMS is disabled, we query the database to get verification codes.
"""

import asyncio
import httpx
import os
import sys

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, text
from backend.database.models import VerificationCode

# Players to sign up
PLAYERS = [
    {"full_name": "Colan Gulla", "phone": "+14012078049", "nickname": "Colan"},
    {"full_name": "Daniel Minicucci", "phone": "+15168804085", "nickname": "Dan"},
    {"full_name": "Roger Subervi", "phone": "+13473000141", "nickname": "Roger"},
    {"full_name": "Chris Dedo", "phone": "+13108901973", "nickname": "Dedo"},
    {"full_name": "Ken Fowser", "phone": "+19179457340", "nickname": "Ken"},
    {"full_name": "Tim Cole", "phone": "+15167612182", "nickname": "Tim"},
    {"full_name": "Sami Jindyeh", "phone": "+13479094448", "nickname": "Sami"},
    {"full_name": "Connor Galaida", "phone": "+18604880934", "nickname": "Connor"},
    {"full_name": "Mark Gacki", "phone": "+12017253921", "nickname": "Mark"},
    {"full_name": "Matthew Balcer", "phone": "+15612138939", "nickname": "Matt"},
    {"full_name": "Antoine Marthey", "phone": "+19173617509", "nickname": "Antoine"},
    {"full_name": "Kevin Nardone", "phone": "+19177511735", "nickname": "Kevin"},
]

# API base URL
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")

# Default password for all users (meets requirements: 8+ chars, has number)
DEFAULT_PASSWORD = "Password123"

# Database connection
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"postgresql+asyncpg://{os.getenv('POSTGRES_USER', 'beachkings')}:{os.getenv('POSTGRES_PASSWORD', 'beachkings')}@{os.getenv('POSTGRES_HOST', 'localhost')}:{os.getenv('POSTGRES_PORT', '5432')}/{os.getenv('POSTGRES_DB', 'beachkings')}"
)


async def get_verification_code(session: AsyncSession, phone_number: str) -> str | None:
    """Get the most recent unused verification code for a phone number."""
    result = await session.execute(
        select(VerificationCode.code)
        .where(
            VerificationCode.phone_number == phone_number,
            VerificationCode.used == False
        )
        .order_by(VerificationCode.created_at.desc())
        .limit(1)
    )
    code = result.scalar_one_or_none()
    return code


async def signup_player(client: httpx.AsyncClient, player: dict) -> dict:
    """Sign up a player."""
    print(f"📝 Signing up {player['full_name']} ({player['phone']})...")
    
    response = await client.post(
        f"{API_BASE_URL}/api/auth/signup",
        json={
            "phone_number": player["phone"],
            "password": DEFAULT_PASSWORD,
            "full_name": player["full_name"],
        },
        timeout=30.0
    )
    
    if response.status_code == 200:
        print(f"   ✅ Signup successful")
        return response.json()
    elif response.status_code == 400 and "already registered" in response.text:
        print(f"   ⚠️  User already exists, skipping signup")
        return {"status": "exists"}
    else:
        print(f"   ❌ Signup failed: {response.status_code} - {response.text}")
        return None


async def verify_phone(client: httpx.AsyncClient, player: dict, code: str) -> dict:
    """Verify phone number with code."""
    print(f"   🔐 Verifying phone with code {code}...")
    
    response = await client.post(
        f"{API_BASE_URL}/api/auth/verify-phone",
        json={
            "phone_number": player["phone"],
            "code": code,
        },
        timeout=30.0
    )
    
    if response.status_code == 200:
        print(f"   ✅ Verification successful!")
        return response.json()
    else:
        print(f"   ❌ Verification failed: {response.status_code} - {response.text}")
        return None


async def process_player(player: dict, db_session: AsyncSession):
    """Process a single player: signup and verify."""
    async with httpx.AsyncClient() as client:
        # Step 1: Signup
        signup_result = await signup_player(client, player)
        if signup_result is None:
            return False
        
        # If user already exists, try to verify anyway (in case they're not verified)
        if signup_result.get("status") == "exists":
            print(f"   ℹ️  User exists, attempting verification...")
        
        # Step 2: Get verification code from database
        # Wait a bit for the code to be stored
        await asyncio.sleep(0.5)
        
        code = await get_verification_code(db_session, player["phone"])
        if not code:
            print(f"   ❌ Could not find verification code in database")
            return False
        
        # Step 3: Verify phone
        verify_result = await verify_phone(client, player, code)
        if verify_result is None:
            return False
        
        return True


async def main():
    """Main function to process all players."""
    print("🏐 Beach Kings - Player Population Script")
    print("=" * 50)
    print(f"API URL: {API_BASE_URL}")
    print(f"Database: {DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else 'N/A'}")
    print(f"Players to process: {len(PLAYERS)}")
    print("=" * 50)
    print()
    
    # Create database engine and session
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    success_count = 0
    failed_count = 0
    
    try:
        async with async_session() as session:
            for i, player in enumerate(PLAYERS, 1):
                print(f"\n[{i}/{len(PLAYERS)}] Processing {player['full_name']}...")
                
                try:
                    success = await process_player(player, session)
                    if success:
                        success_count += 1
                    else:
                        failed_count += 1
                except Exception as e:
                    print(f"   ❌ Error: {str(e)}")
                    failed_count += 1
                
                # Wait between players to avoid rate limiting
                # Rate limit is 10/minute for verify-phone, so wait 7 seconds between players
                if i < len(PLAYERS):
                    print(f"   ⏳ Waiting 7 seconds to avoid rate limiting...")
                    await asyncio.sleep(7)
        
        print("\n" + "=" * 50)
        print(f"✅ Successfully processed: {success_count}")
        print(f"❌ Failed: {failed_count}")
        print("=" * 50)
        
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())

