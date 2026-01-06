#!/usr/bin/env python3
"""
Run league calculations for all leagues in the database.

This script:
1. Deletes all stats tables (global, league, and season stats)
2. Runs calculate_global_stats_async for global stats
3. Fetches all leagues from the database
4. Runs calculate_league_stats_async for each league
5. Provides progress feedback and summary statistics
"""

import asyncio
import os
import sys
from pathlib import Path

# Add apps to path (so backend.* imports work)
# This mirrors the Docker setup where PYTHONPATH=/app and backend is at /app/backend
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
apps_path = os.path.join(project_root, "apps")
sys.path.insert(0, apps_path)

from backend.database.db import AsyncSessionLocal
from backend.services import data_service


async def calculate_all_leagues():
    """Calculate stats for all leagues."""
    async with AsyncSessionLocal() as session:
        print("=" * 60)
        print("🗑️  Deleting all stats tables...")
        print("=" * 60)
        
        try:
            await data_service.delete_all_stats_async(session)
            await session.commit()
            print("✓ All stats tables deleted successfully\n")
        except Exception as e:
            print(f"❌ Error deleting stats: {str(e)}")
            await session.rollback()
            return
        
        print("=" * 60)
        print("🌍 Calculating global stats...")
        print("=" * 60)
        
        try:
            global_result = await data_service.calculate_global_stats_async(session)
            global_player_count = global_result.get("player_count", 0)
            global_match_count = global_result.get("match_count", 0)
            print(f"✓ Global stats calculated: {global_player_count} players, {global_match_count} matches\n")
        except Exception as e:
            print(f"❌ Error calculating global stats: {str(e)}")
            await session.rollback()
            return
        
        print("=" * 60)
        print("📊 Fetching all leagues...")
        print("=" * 60)
        
        # Get all leagues
        leagues = await data_service.list_leagues(session)
        
        if not leagues:
            print("❌ No leagues found in the database.")
            return
        
        print(f"✓ Found {len(leagues)} league(s)\n")
        
        # Calculate stats for each league
        successful = 0
        failed = 0
        results = []
        
        for idx, league in enumerate(leagues, 1):
            league_id = league["id"]
            league_name = league["name"]
            
            print(f"[{idx}/{len(leagues)}] Calculating stats for league: {league_name} (ID: {league_id})")
            
            try:
                result = await data_service.calculate_league_stats_async(session, league_id)
                
                player_count = result.get("league_player_count", 0)
                match_count = result.get("league_match_count", 0)
                season_counts = result.get("season_counts", {})
                
                print(f"   ✓ Success: {player_count} players, {match_count} matches")
                
                if season_counts:
                    print(f"   ✓ Seasons processed: {len(season_counts)}")
                    for season_id, season_data in season_counts.items():
                        season_players = season_data.get("player_count", 0)
                        season_matches = season_data.get("match_count", 0)
                        print(f"      - Season {season_id}: {season_players} players, {season_matches} matches")
                
                successful += 1
                results.append({
                    "league_id": league_id,
                    "league_name": league_name,
                    "success": True,
                    "result": result
                })
                
            except Exception as e:
                print(f"   ❌ Error: {str(e)}")
                failed += 1
                results.append({
                    "league_id": league_id,
                    "league_name": league_name,
                    "success": False,
                    "error": str(e)
                })
            
            print()  # Blank line between leagues
        
        # Summary
        print("=" * 60)
        print("📊 Summary")
        print("=" * 60)
        print(f"Global stats: ✓ Calculated ({global_player_count} players, {global_match_count} matches)")
        print(f"Total leagues: {len(leagues)}")
        print(f"✅ Successful: {successful}")
        print(f"❌ Failed: {failed}")
        
        if failed > 0:
            print("\nFailed leagues:")
            for result in results:
                if not result["success"]:
                    print(f"  - {result['league_name']} (ID: {result['league_id']}): {result.get('error', 'Unknown error')}")
        
        print("\n✅ All calculations complete!")


if __name__ == "__main__":
    asyncio.run(calculate_all_leagues())
