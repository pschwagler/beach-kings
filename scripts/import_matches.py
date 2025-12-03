#!/usr/bin/env python3
"""
Import matches from CSV into a specific league.
CSV format: Date, Team1_P1, Team1_P2, Team2_P1, Team2_P2, Team1_Score, Team2_Score

Usage:
    python scripts/import_matches.py <league_id> <csv_file> [--token <auth_token>] [--url <api_url>]
    
Example:
    python scripts/import_matches.py 1 matches.csv --token eyJ... --url http://localhost:8000
"""

import asyncio
import csv
import httpx
import os
import sys
import argparse
from datetime import datetime
from collections import defaultdict

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

# API base URL
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")

# Player nickname to full name mapping
# Add all your players here so nicknames from CSV map to actual player names
PLAYER_MAPPING = {
    "Pat": "Patrick Schwagler",
    "Colan": "Colan Gulla",
    "Dan": "Daniel Minicucci",
    "Roger": "Roger Subervi",
    "Dedo": "Chris Dedo",
    "Ken": "Ken Fowser",
    "Tim": "Tim Cole",
    "Sami": "Sami Jindyeh",
    "Connor": "Connor Galaida",
    "Mark": "Mark Gacki",
    "Matt": "Matthew Balcer",
    "Antoine": "Antoine Marthey",
    "Kevin": "Kevin Nardone",
    "Stanley": "Stanley Martinez",
    "Hayden": "Hayden Millington",
}


def parse_date(date_str: str) -> str:
    """
    Parse date string to ISO format (YYYY-MM-DD).
    Handles formats like: 11/4/2025, 2025-11-04, etc.
    """
    # Try different date formats
    for fmt in ["%m/%d/%Y", "%Y-%m-%d", "%m-%d-%Y", "%d/%m/%Y"]:
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
    
    # If no format works, return as-is
    return date_str.strip()


def map_player_name(nickname: str) -> str:
    """Map a nickname to full name using PLAYER_MAPPING."""
    full_name = PLAYER_MAPPING.get(nickname, nickname)
    if full_name == nickname and nickname not in PLAYER_MAPPING:
        print(f"      ⚠️  Warning: No mapping found for '{nickname}', using as-is")
    return full_name


def read_csv_matches(csv_file: str) -> list[dict]:
    """
    Read matches from CSV file.
    Expected columns: Date, Team1_P1, Team1_P2, Team2_P1, Team2_P2, Team1_Score, Team2_Score
    """
    matches = []
    
    with open(csv_file, 'r') as f:
        # Try to detect if file has headers
        sample = f.read(1024)
        f.seek(0)
        has_header = csv.Sniffer().has_header(sample)
        
        reader = csv.reader(f)
        
        if has_header:
            next(reader)  # Skip header row
        
        for row_num, row in enumerate(reader, start=1):
            if len(row) < 7:
                print(f"⚠️  Skipping row {row_num}: insufficient columns ({len(row)} < 7)")
                continue
            
            try:
                date_str = parse_date(row[0])
                # Map nicknames to full names
                team1_p1 = map_player_name(row[1].strip())
                team1_p2 = map_player_name(row[2].strip())
                team2_p1 = map_player_name(row[3].strip())
                team2_p2 = map_player_name(row[4].strip())
                team1_score = int(row[5].strip())
                team2_score = int(row[6].strip())
                
                matches.append({
                    "date": date_str,
                    "team1_player1": team1_p1,
                    "team1_player2": team1_p2,
                    "team2_player1": team2_p1,
                    "team2_player2": team2_p2,
                    "team1_score": team1_score,
                    "team2_score": team2_score,
                })
            except (ValueError, IndexError) as e:
                print(f"⚠️  Skipping row {row_num}: error parsing ({e})")
                continue
    
    return matches


async def create_match(client: httpx.AsyncClient, token: str, league_id: int, match: dict) -> dict | None:
    """Create a match using league_id and date (API will auto-create/find session)."""
    print(f"      🏐 {match['team1_player1']}/{match['team1_player2']} vs " \
          f"{match['team2_player1']}/{match['team2_player2']} " \
          f"({match['team1_score']}-{match['team2_score']})")
    
    response = await client.post(
        f"{API_BASE_URL}/api/matches",
        json={
            "league_id": league_id,
            "date": match["date"],
            "team1_player1": match["team1_player1"],
            "team1_player2": match["team1_player2"],
            "team2_player1": match["team2_player1"],
            "team2_player2": match["team2_player2"],
            "team1_score": match["team1_score"],
            "team2_score": match["team2_score"],
            "is_public": True,
        },
        headers={
            "Authorization": f"Bearer {token}",
        },
        timeout=30.0
    )
    
    if response.status_code == 200:
        result = response.json()
        session_id = result.get("session_id")
        print(f"         ✅ Match created (session: {session_id})")
        return result
    else:
        print(f"         ❌ Failed: {response.status_code} - {response.text}")
        return None


async def submit_session(client: httpx.AsyncClient, token: str, session_id: int) -> bool:
    """Submit a session to trigger stats calculation."""
    print(f"   📊 Submitting session {session_id}...")
    
    response = await client.patch(
        f"{API_BASE_URL}/api/sessions/{session_id}",
        json={"submit": True},
        headers={
            "Authorization": f"Bearer {token}",
        },
        timeout=30.0
    )
    
    if response.status_code == 200:
        print(f"      ✅ Session submitted")
        return True
    else:
        print(f"      ⚠️  Failed to submit: {response.status_code} - {response.text}")
        return False


async def main():
    """Main function to import matches from CSV."""
    parser = argparse.ArgumentParser(description="Import matches from CSV into a league")
    parser.add_argument("league_id", type=int, help="League ID to import matches into")
    parser.add_argument("csv_file", help="Path to CSV file with match data")
    parser.add_argument("--token", help="Authentication token (or set API_TOKEN env var)")
    parser.add_argument("--url", help="API base URL (default: http://localhost:8000 or API_BASE_URL env var)")
    parser.add_argument("--no-submit", action="store_true", help="Don't auto-submit sessions")
    
    args = parser.parse_args()
    
    # Get API URL
    global API_BASE_URL
    if args.url:
        API_BASE_URL = args.url.rstrip('/')
    
    # Get auth token
    token = args.token or os.getenv("API_TOKEN")
    if not token:
        print("❌ Error: Authentication token required. Use --token or set API_TOKEN env var.")
        print("\nTo get a token, login via the API:")
        print(f"  curl -X POST {API_BASE_URL}/api/auth/login \\")
        print('    -H "Content-Type: application/json" \\')
        print('    -d \'{"phone_number": "+1234567890", "password": "yourpassword"}\'')
        sys.exit(1)
    
    # Read matches from CSV
    print(f"📖 Reading matches from {args.csv_file}...")
    try:
        matches = read_csv_matches(args.csv_file)
    except FileNotFoundError:
        print(f"❌ Error: File not found: {args.csv_file}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error reading CSV: {e}")
        sys.exit(1)
    
    if not matches:
        print("❌ No valid matches found in CSV file")
        sys.exit(1)
    
    print(f"✅ Found {len(matches)} matches")
    print()
    
    # Group matches by date
    matches_by_date = defaultdict(list)
    for match in matches:
        matches_by_date[match["date"]].append(match)
    
    print(f"🏐 Beach League - Match Import Script")
    print("=" * 60)
    print(f"API URL: {API_BASE_URL}")
    print(f"League ID: {args.league_id}")
    print(f"Total Matches: {len(matches)}")
    print(f"Dates: {len(matches_by_date)}")
    print("=" * 60)
    print()
    
    success_count = 0
    failed_count = 0
    sessions_to_submit = set()  # Track unique session IDs
    
    async with httpx.AsyncClient() as client:
        for date in sorted(matches_by_date.keys()):
            date_matches = matches_by_date[date]
            print(f"\n📅 Processing {date} ({len(date_matches)} matches)...")
            
            # Create matches for this date (API will auto-create/find session)
            date_session_id = None
            for match in date_matches:
                result = await create_match(client, token, args.league_id, match)
                if result:
                    success_count += 1
                    # Track the session ID
                    if result.get("session_id"):
                        date_session_id = result.get("session_id")
                        sessions_to_submit.add(date_session_id)
                else:
                    failed_count += 1
            
            # Small delay to avoid rate limiting
            await asyncio.sleep(0.5)
        
        # Submit all sessions at the end
        if not args.no_submit and sessions_to_submit:
            print(f"\n📊 Submitting {len(sessions_to_submit)} sessions...")
            for session_id in sorted(sessions_to_submit):
                await submit_session(client, token, session_id)
                await asyncio.sleep(0.3)
    
    print("\n" + "=" * 60)
    print(f"✅ Successfully imported: {success_count}")
    print(f"❌ Failed: {failed_count}")
    print(f"📊 Sessions submitted: {len(sessions_to_submit)}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())

