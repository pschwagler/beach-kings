"""Auditable platform-role authorization and lifecycle operations."""

from __future__ import annotations

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import PlatformRoleAssignment, User
from backend.utils.datetime_utils import utcnow

SYSTEM_ADMIN = "system_admin"
_ADMIN_LIFECYCLE_LOCK = 0x424B41444D494E  # "BKADMIN"


async def _lock_admin_lifecycle(session: AsyncSession) -> None:
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:key)"), {"key": _ADMIN_LIFECYCLE_LOCK}
    )


async def is_system_admin(session: AsyncSession, user_id: int) -> bool:
    """Resolve current authorization from the database on every call."""
    result = await session.execute(
        select(PlatformRoleAssignment.id)
        .where(
            PlatformRoleAssignment.user_id == user_id,
            PlatformRoleAssignment.role == SYSTEM_ADMIN,
            PlatformRoleAssignment.revoked_at.is_(None),
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


def user_is_eligible(user: User) -> bool:
    """Return whether an account can currently exercise a platform role."""
    if not user.is_verified or user.deleted_at or user.deletion_scheduled_at:
        return False
    if user.moderation_status == "banned":
        return False
    if user.moderation_status == "suspended":
        return bool(user.moderation_expires_at and user.moderation_expires_at <= utcnow())
    return True


async def _active_assignment(
    session: AsyncSession, user_id: int, *, lock: bool = False
) -> PlatformRoleAssignment | None:
    statement = select(PlatformRoleAssignment).where(
        PlatformRoleAssignment.user_id == user_id,
        PlatformRoleAssignment.role == SYSTEM_ADMIN,
        PlatformRoleAssignment.revoked_at.is_(None),
    )
    if lock:
        statement = statement.with_for_update()
    return (await session.execute(statement)).scalar_one_or_none()


async def eligible_admin_count(
    session: AsyncSession, *, excluding_user_id: int | None = None
) -> int:
    statement = (
        select(func.count(func.distinct(User.id)))
        .select_from(User)
        .join(
            PlatformRoleAssignment,
            (PlatformRoleAssignment.user_id == User.id)
            & (PlatformRoleAssignment.role == SYSTEM_ADMIN)
            & PlatformRoleAssignment.revoked_at.is_(None),
        )
        .where(
            User.is_verified.is_(True),
            User.deleted_at.is_(None),
            User.deletion_scheduled_at.is_(None),
            (
                (User.moderation_status == "active")
                | (
                    (User.moderation_status == "suspended")
                    & User.moderation_expires_at.isnot(None)
                    & (User.moderation_expires_at <= utcnow())
                )
            ),
        )
    )
    if excluding_user_id is not None:
        statement = statement.where(User.id != excluding_user_id)
    return int((await session.execute(statement)).scalar_one())


async def ensure_can_become_inaccessible(session: AsyncSession, user_id: int) -> None:
    """Prevent deletion/moderation from making the final usable admin inaccessible."""
    await _lock_admin_lifecycle(session)
    if await _active_assignment(session, user_id, lock=True) is None:
        return
    if await eligible_admin_count(session, excluding_user_id=user_id) == 0:
        raise ValueError("The final eligible system admin cannot be made inaccessible")


async def grant_system_admin(
    session: AsyncSession, user_id: int, actor_user_id: int, reason: str
) -> PlatformRoleAssignment:
    reason = reason.strip()
    if not reason:
        raise ValueError("A reason is required")
    await _lock_admin_lifecycle(session)
    user = await session.get(User, user_id, with_for_update=True)
    if user is None:
        raise LookupError("User not found")
    if not user_is_eligible(user):
        raise ValueError("Only verified, active accounts can become system admins")
    if await _active_assignment(session, user_id, lock=True):
        raise RuntimeError("User already has the system_admin role")
    assignment = PlatformRoleAssignment(
        user_id=user_id,
        role=SYSTEM_ADMIN,
        granted_by_user_id=actor_user_id,
        grant_source="admin_api",
        grant_reason=reason,
    )
    session.add(assignment)
    await session.flush()
    return assignment


async def revoke_system_admin(
    session: AsyncSession, user_id: int, actor_user_id: int, reason: str
) -> PlatformRoleAssignment:
    reason = reason.strip()
    if not reason:
        raise ValueError("A reason is required")
    await _lock_admin_lifecycle(session)
    assignment = await _active_assignment(session, user_id, lock=True)
    if assignment is None:
        raise RuntimeError("User does not have an active system_admin role")
    if await eligible_admin_count(session, excluding_user_id=user_id) == 0:
        raise RuntimeError("The final eligible system admin cannot be revoked")
    assignment.revoked_at = utcnow()
    assignment.revoked_by_user_id = actor_user_id
    assignment.revoke_source = "admin_api"
    assignment.revoke_reason = reason
    await session.flush()
    return assignment


def assignment_dict(assignment: PlatformRoleAssignment) -> dict:
    return {
        "id": assignment.id,
        "role": assignment.role,
        "granted_at": assignment.granted_at,
        "granted_by_user_id": assignment.granted_by_user_id,
        "grant_source": assignment.grant_source,
        "grant_reason": assignment.grant_reason,
        "revoked_at": assignment.revoked_at,
        "revoked_by_user_id": assignment.revoked_by_user_id,
        "revoke_source": assignment.revoke_source,
        "revoke_reason": assignment.revoke_reason,
    }
