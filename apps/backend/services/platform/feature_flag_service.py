"""Server-owned flag evaluation. Unknown flags default to disabled."""

from hashlib import sha256

from sqlalchemy import select

from backend.database.models.feature_flags import FeatureFlag

PLATFORMS = ("web", "ios", "android")


def evaluate(flag, user_id: int | None, platform: str) -> bool:
    if not flag.enabled or platform not in flag.platforms:
        return False
    if user_id is not None and user_id in flag.user_ids:
        return True
    if flag.rollout_percent == 100:
        return True
    if user_id is None:
        return False
    # Include the flag key to avoid identical cohorts for unrelated releases.
    bucket = int(sha256(f"{flag.key}:{user_id}".encode()).hexdigest()[:16], 16) % 10000
    return bucket < flag.rollout_percent * 100


async def resolve(session, key, user_id, platform):
    flag = await session.get(FeatureFlag, key)
    return bool(flag and evaluate(flag, user_id, platform))


async def resolved_flags(session, user_id, platform):
    flags = (await session.scalars(select(FeatureFlag))).all()
    return {flag.key: evaluate(flag, user_id, platform) for flag in flags}


def snapshot(flag):
    return {
        name: getattr(flag, name)
        for name in (
            "key",
            "description",
            "enabled",
            "rollout_percent",
            "user_ids",
            "platforms",
            "revision",
        )
    }
