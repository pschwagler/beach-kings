#!/usr/bin/env python3
"""
Complete script to set up players: signup, verify phone, and update profile.
This script handles the full player onboarding process.
"""

import asyncio
import httpx
import json
import os
import sys
import traceback

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from backend.database.models import VerificationCode

# Load player data from gitignored JSON file
PLAYERS_JSON_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "players.json")
if not os.path.exists(PLAYERS_JSON_PATH):
    print(f"❌ Player data file not found: {PLAYERS_JSON_PATH}")
    print("   Copy scripts/players.example.json → scripts/players.json and fill in real data.")
    sys.exit(1)

with open(PLAYERS_JSON_PATH, "r") as f:
    PLAYERS = json.load(f)

# API base URL
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")

# Default password for all users (meets requirements: 8+ chars, has number)
DEFAULT_PASSWORD = "Password123"

# Profile settings
GENDER = "male"
LEVEL = "Open"

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
    print(f"   📝 Signing up {player['full_name']} ({player['phone']})...")
    
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
        print(f"      ✅ Signup successful")
        return response.json()
    elif response.status_code == 400 and "already registered" in response.text:
        print(f"      ⚠️  User already exists, will attempt verification")
        return {"status": "exists"}
    else:
        print(f"      ❌ Signup failed: {response.status_code} - {response.text}")
        return None


async def verify_phone(client: httpx.AsyncClient, player: dict, code: str) -> dict:
    """Verify phone number with code and return auth response."""
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
        print(f"      ✅ Verification successful!")
        return response.json()
    else:
        print(f"      ❌ Verification failed: {response.status_code} - {response.text}")
        return None


async def update_player_profile(client: httpx.AsyncClient, token: str, player: dict) -> bool:
    """Update player profile with nickname, gender, and level."""
    print(f"   📋 Updating profile (nickname: {player['nickname']}, gender: {GENDER}, level: {LEVEL})...")
    
    response = await client.put(
        f"{API_BASE_URL}/api/users/me/player",
        json={
            "full_name": player["full_name"],
            "nickname": player["nickname"],
            "gender": GENDER,
            "level": LEVEL,
        },
        headers={
            "Authorization": f"Bearer {token}",
        },
        timeout=30.0
    )
    
    if response.status_code == 200:
        print(f"      ✅ Profile updated successfully")
        return True
    else:
        print(f"      ❌ Update failed: {response.status_code} - {response.text}")
        return False


async def process_player(player: dict, db_session: AsyncSession):
    """Process a single player: signup, verify, and update profile."""
    async with httpx.AsyncClient() as client:
        # Step 1: Signup
        signup_result = await signup_player(client, player)
        if signup_result is None:
            return False
        
        # If user already exists, we still need to verify/login
        if signup_result.get("status") == "exists":
            # Try to login instead
            print(f"      🔑 Attempting login...")
            login_response = await client.post(
                f"{API_BASE_URL}/api/auth/login",
                json={
                    "phone_number": player["phone"],
                    "password": DEFAULT_PASSWORD,
                },
                timeout=30.0
            )
            
            if login_response.status_code == 200:
                auth_data = login_response.json()
                token = auth_data.get("access_token")
                if token:
                    # Skip verification, go straight to profile update
                    return await update_player_profile(client, token, player)
            else:
                # If login fails, continue with verification flow
                print(f"      ⚠️  Login failed, continuing with verification...")
        
        # Step 2: Get verification code from database
        # Wait a bit for the code to be stored
        await asyncio.sleep(0.5)
        
        code = await get_verification_code(db_session, player["phone"])
        if not code:
            print(f"      ❌ Could not find verification code in database")
            return False
        
        # Step 3: Verify phone (this returns auth tokens)
        verify_result = await verify_phone(client, player, code)
        if verify_result is None:
            return False
        
        # Step 4: Update profile using the access token from verification
        token = verify_result.get("access_token")
        if not token:
            print(f"      ❌ No access token in verification response")
            return False
        
        profile_success = await update_player_profile(client, token, player)
        return profile_success


async def main():
    """Main function to process all players."""
    print("🏐 Beach League - Complete Player Setup Script")
    print("=" * 60)
    print(f"API URL: {API_BASE_URL}")
    print(f"Database: {DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else 'N/A'}")
    print(f"Gender: {GENDER}")
    print(f"Level: {LEVEL}")
    print(f"Players to process: {len(PLAYERS)}")
    print("=" * 60)
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
                    traceback.print_exc()
                    failed_count += 1
                
                # Wait between players to avoid rate limiting
                # Rate limit is 10/minute for verify-phone, so wait 7 seconds between players
                if i < len(PLAYERS):
                    print(f"   ⏳ Waiting 7 seconds to avoid rate limiting...")
                    await asyncio.sleep(7)
        
        print("\n" + "=" * 60)
        print(f"✅ Successfully processed: {success_count}")
        print(f"❌ Failed: {failed_count}")
        print("=" * 60)
        
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
