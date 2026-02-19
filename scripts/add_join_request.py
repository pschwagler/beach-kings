#!/usr/bin/env python3
"""
One-off script to add a pending league join request for testing the join-request UI.

Usage (Docker; entrypoint must be overridden so the script runs instead of the server):
  docker compose run --rm --entrypoint "" -e PYTHONPATH=/app backend python /app/scripts/add_join_request.py "Roger Subervi" 1

Usage (local, from repo root with venv and PYTHONPATH):
  PYTHONPATH=apps/backend python scripts/add_join_request.py "Roger Subervi" 1
"""

import asyncio
import os
import sys

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from sqlalchemy import select

from backend.database.db import AsyncSessionLocal
from backend.database.models import Player, League, LeagueRequest


async def add_join_request(player_full_name: str, league_id: int) -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Player).where(Player.full_name == player_full_name)
        )
        player = result.scalar_one_or_none()
        if not player:
            print(f"Player not found: {player_full_name}")
            return

        league_result = await session.execute(select(League).where(League.id == league_id))
        league = league_result.scalar_one_or_none()
        if not league:
            print(f"League not found: id={league_id}")
            return

        existing = await session.execute(
            select(LeagueRequest).where(
                LeagueRequest.league_id == league_id,
                LeagueRequest.player_id == player.id,
                LeagueRequest.status == "pending",
            )
        )
        if existing.scalar_one_or_none():
            print(f"Pending join request already exists for {player_full_name} in league {league_id}")
            return

        req = LeagueRequest(
            league_id=league_id,
            player_id=player.id,
            status="pending",
        )
        session.add(req)
        await session.commit()
        print(f"Added join request: {player_full_name} -> league {league_id} (request id={req.id})")


def main():
    player_name = sys.argv[1] if len(sys.argv) > 1 else "Roger Subervi"
    league_id = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    asyncio.run(add_join_request(player_name, league_id))


if __name__ == "__main__":
    main()
