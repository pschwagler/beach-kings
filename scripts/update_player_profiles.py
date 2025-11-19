#!/usr/bin/env python3
"""
Script to update player profiles with nickname, gender, and level.
"""

import asyncio
import httpx
import os
import sys

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

# Players to update
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

# Default password for all users
DEFAULT_PASSWORD = "Password123"

# Profile updates
GENDER = "male"
LEVEL = "Open"


async def login_player(client: httpx.AsyncClient, phone: str) -> str | None:
    """Login as a player and return access token."""
    response = await client.post(
        f"{API_BASE_URL}/api/auth/login",
        json={
            "phone_number": phone,
            "password": DEFAULT_PASSWORD,
        },
        timeout=30.0
    )
    
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token")
    else:
        print(f"   ❌ Login failed: {response.status_code} - {response.text}")
        return None


async def update_player_profile(client: httpx.AsyncClient, token: str, player: dict) -> bool:
    """Update player profile with nickname, gender, and level."""
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
        print(f"   ✅ Profile updated successfully")
        return True
    else:
        print(f"   ❌ Update failed: {response.status_code} - {response.text}")
        return False


async def process_player(player: dict):
    """Process a single player: login and update profile."""
    async with httpx.AsyncClient() as client:
        print(f"🔐 Logging in {player['full_name']} ({player['phone']})...")
        
        # Step 1: Login
        token = await login_player(client, player["phone"])
        if not token:
            return False
        
        # Step 2: Update profile
        print(f"📝 Updating profile for {player['full_name']}...")
        success = await update_player_profile(client, token, player)
        
        return success


async def main():
    """Main function to process all players."""
    print("🏐 Beach Kings - Player Profile Update Script")
    print("=" * 50)
    print(f"API URL: {API_BASE_URL}")
    print(f"Gender: {GENDER}")
    print(f"Level: {LEVEL}")
    print(f"Players to process: {len(PLAYERS)}")
    print("=" * 50)
    print()
    
    success_count = 0
    failed_count = 0
    
    for i, player in enumerate(PLAYERS, 1):
        print(f"\n[{i}/{len(PLAYERS)}] Processing {player['full_name']}...")
        
        try:
            success = await process_player(player)
            if success:
                success_count += 1
            else:
                failed_count += 1
        except Exception as e:
            print(f"   ❌ Error: {str(e)}")
            failed_count += 1
        
        # Wait between players to avoid rate limiting
        if i < len(PLAYERS):
            print(f"   ⏳ Waiting 2 seconds...")
            await asyncio.sleep(2)
    
    print("\n" + "=" * 50)
    print(f"✅ Successfully updated: {success_count}")
    print(f"❌ Failed: {failed_count}")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())


