"""Read-only, redacted inspection for the October 2026 player account links."""

import asyncio
import json

from sqlalchemy import func, or_, select

from backend.database.db import AsyncSessionLocal, Base, engine
from backend.database.models import LeagueMember, Match, Player, User


PAIRS = ((4, 52), (3, 49), (12, 50))


async def reference_counts(session, entity: str, row_id: int) -> dict[str, int]:
    counts = {}
    for table in Base.metadata.tables.values():
        for column in table.columns:
            if not any(fk.target_fullname == f"{entity}.id" for fk in column.foreign_keys):
                continue
            count = await session.scalar(
                select(func.count()).select_from(table).where(column == row_id)
            )
            if count:
                counts[f"{table.name}.{column.name}"] = count
    return counts


async def inspect() -> None:
    async with AsyncSessionLocal() as session:
        for old_id, new_id in PAIRS:
            rows = []
            for player_id in (old_id, new_id):
                player = await session.get(Player, player_id)
                if player is None:
                    raise RuntimeError(f"Missing player {player_id}")
                user = await session.get(User, player.user_id)
                if user is None:
                    raise RuntimeError(f"Missing user for player {player_id}")
                leagues = await session.scalar(
                    select(func.count())
                    .select_from(LeagueMember)
                    .where(LeagueMember.player_id == player_id)
                )
                matches = await session.scalar(
                    select(func.count())
                    .select_from(Match)
                    .where(
                        or_(
                            Match.team1_player1_id == player_id,
                            Match.team1_player2_id == player_id,
                            Match.team2_player1_id == player_id,
                            Match.team2_player2_id == player_id,
                        )
                    )
                )
                rows.append(
                    {
                        "player_id": player_id,
                        "user_id": user.id,
                        "name": player.full_name,
                        "provider": user.auth_provider,
                        "has_phone": bool(user.phone_number),
                        "has_email": bool(user.email),
                        "has_google": bool(user.google_id),
                        "has_apple": bool(user.apple_id),
                        "has_password": bool(user.password_hash),
                        "deleted_player": player.deleted_at is not None,
                        "deleted_user": user.deleted_at is not None,
                        "age_group": user.age_group,
                        "leagues": leagues,
                        "matches": matches,
                    }
                )
            print(json.dumps(rows, sort_keys=True))
            print(
                json.dumps(
                    {
                        "old_user_id": rows[0]["user_id"],
                        "old_user_references": await reference_counts(
                            session, "users", rows[0]["user_id"]
                        ),
                        "new_player_id": new_id,
                        "player_references": await reference_counts(session, "players", new_id),
                        "new_user_id": rows[1]["user_id"],
                        "user_references": await reference_counts(
                            session, "users", rows[1]["user_id"]
                        ),
                    },
                    sort_keys=True,
                )
            )
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(inspect())
