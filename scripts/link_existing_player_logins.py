"""One-time, non-destructive reconciliation of three confirmed player logins.

The older user and player IDs remain canonical, keeping their phone numbers,
matches, leagues, messages, and notifications. New email/Google credentials and
mobile notification settings move to those users. Duplicate rows remain in the
database with deleted_at set so they no longer appear as active accounts.

Run without --apply to preflight. --apply repeats every check under row locks
and commits all three links in one transaction. No contact details are printed.
"""

import argparse
import asyncio
import json

from sqlalchemy import func, select

from backend.database.db import AsyncSessionLocal, Base, engine
from backend.database.models import DeviceToken, Player, PushNotificationPreference, User
from backend.utils.datetime_utils import utcnow


PAIRS = (
    (4, 52, 4, 34, "Roger Subervi", "email"),
    (3, 49, 3, 31, "Daniel Minicucci", "email"),
    (12, 50, 12, 32, "Antoine Marthey", "google"),
)
ALLOWED_NEW_USER_REFS = {
    "device_tokens.user_id",
    "players.user_id",
    "push_notification_preferences.user_id",
    "refresh_tokens.user_id",
}


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


async def load_pair(session, pair, *, lock: bool):
    old_player_id, new_player_id, old_user_id, new_user_id, name, provider = pair
    player_stmt = select(Player).where(Player.id.in_((old_player_id, new_player_id)))
    user_stmt = select(User).where(User.id.in_((old_user_id, new_user_id)))
    if lock:
        player_stmt = player_stmt.with_for_update()
        user_stmt = user_stmt.with_for_update()
    players = {row.id: row for row in (await session.scalars(player_stmt)).all()}
    users = {row.id: row for row in (await session.scalars(user_stmt)).all()}
    if set(players) != {old_player_id, new_player_id} or set(users) != {
        old_user_id,
        new_user_id,
    }:
        raise RuntimeError(f"Missing row for pair {old_player_id}/{new_player_id}")
    old_player, new_player = players[old_player_id], players[new_player_id]
    old_user, new_user = users[old_user_id], users[new_user_id]

    if not all(
        (
            old_player.full_name == name,
            new_player.full_name == name,
            old_player.user_id == old_user_id,
            new_player.user_id == new_user_id,
            old_player.deleted_at is None,
            new_player.deleted_at is None,
            old_user.deleted_at is None,
            new_user.deleted_at is None,
            old_user.phone_number,
            not old_user.email,
            not old_user.google_id,
            not old_user.apple_id,
            old_user.auth_provider == "phone",
            old_user.is_verified,
            not new_user.phone_number,
            new_user.email,
            new_user.auth_provider == provider,
            new_user.is_verified,
            old_user.age_group == "adult",
            new_user.age_group == "adult",
            old_user.moderation_status == "active",
            new_user.moderation_status == "active",
            not old_user.deletion_scheduled_at,
            not new_user.deletion_scheduled_at,
        )
    ):
        raise RuntimeError(f"Identity preflight failed for pair {old_player_id}/{new_player_id}")
    if provider == "email" and (not new_user.password_hash or new_user.google_id):
        raise RuntimeError(f"Email credential preflight failed for player {new_player_id}")
    if provider == "google" and (not new_user.google_id or new_user.password_hash):
        raise RuntimeError(f"Google credential preflight failed for player {new_player_id}")
    if new_user.apple_id:
        raise RuntimeError(f"Unexpected Apple identity for player {new_player_id}")

    player_refs = await reference_counts(session, "players", new_player_id)
    user_refs = await reference_counts(session, "users", new_user_id)
    if player_refs:
        raise RuntimeError(f"New player {new_player_id} has references: {player_refs}")
    if user_refs.get("players.user_id") != 1 or set(user_refs) - ALLOWED_NEW_USER_REFS:
        raise RuntimeError(f"Unexpected references for user {new_user_id}: {user_refs}")
    old_pref = await session.scalar(
        select(PushNotificationPreference).where(PushNotificationPreference.user_id == old_user_id)
    )
    if old_pref is not None:
        raise RuntimeError(f"Older user {old_user_id} already has notification preferences")

    return old_player, new_player, old_user, new_user, user_refs


async def reconcile(*, apply: bool) -> None:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            loaded = [await load_pair(session, pair, lock=apply) for pair in PAIRS]
            print(
                json.dumps(
                    {
                        "mode": "apply" if apply else "dry_run",
                        "pairs": [
                            {
                                "retained_player_id": old_player.id,
                                "retained_user_id": old_user.id,
                                "retired_player_id": new_player.id,
                                "retired_user_id": new_user.id,
                                "provider": new_user.auth_provider,
                                "keep_existing_phone": True,
                                "move_new_email": True,
                                "move_device_tokens": refs.get("device_tokens.user_id", 0),
                                "move_push_preferences": refs.get(
                                    "push_notification_preferences.user_id", 0
                                ),
                            }
                            for old_player, new_player, old_user, new_user, refs in loaded
                        ],
                    },
                    sort_keys=True,
                )
            )
            for old_player, new_player, old_user, new_user, _ in loaded if apply else ():
                email, google_id = new_user.email, new_user.google_id
                password_hash, provider = new_user.password_hash, new_user.auth_provider

                # Free unique login keys before attaching them to the older user.
                new_user.email = None
                new_user.google_id = None
                new_user.apple_id = None
                new_user.password_hash = None
                new_user.session_version += 1
                new_user.deleted_at = utcnow()
                new_player.deleted_at = utcnow()
                await session.flush()

                old_user.email = email
                old_user.google_id = google_id
                old_user.password_hash = password_hash
                old_user.auth_provider = provider
                old_user.session_version += 1
                # old_user.phone_number and both older IDs remain untouched.
                await session.flush()

                for token in (
                    await session.scalars(
                        select(DeviceToken).where(DeviceToken.user_id == new_user.id)
                    )
                ).all():
                    token.user_id = old_user.id
                for preference in (
                    await session.scalars(
                        select(PushNotificationPreference).where(
                            PushNotificationPreference.user_id == new_user.id
                        )
                    )
                ).all():
                    preference.user_id = old_user.id
                await session.flush()

            # The transaction commits only after all three pairs pass and move.
    await engine.dispose()
    if apply:
        print("Committed all three links; no database rows were removed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    asyncio.run(reconcile(apply=parser.parse_args().apply))
