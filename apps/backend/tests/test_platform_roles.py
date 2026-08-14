import pytest

from backend.database.models import PlatformRoleAssignment, User
from backend.services import role_service


def _user(email: str, *, verified: bool = True, moderation_status: str = "active") -> User:
    return User(
        email=email,
        auth_provider="google",
        google_id=f"google-{email}",
        is_verified=verified,
        moderation_status=moderation_status,
    )


@pytest.mark.asyncio
async def test_role_lookup_and_audit_metadata_change_immediately(db_session):
    actor = _user("actor@example.com")
    target = _user("target@example.com")
    db_session.add_all([actor, target])
    await db_session.flush()
    db_session.add(
        PlatformRoleAssignment(
            user_id=actor.id,
            role="system_admin",
            grant_source="test_bootstrap",
            grant_reason="Test bootstrap admin",
        )
    )
    await db_session.flush()

    granted = await role_service.grant_system_admin(
        db_session, target.id, actor.id, "On-call platform coverage"
    )
    assert await role_service.is_system_admin(db_session, target.id) is True
    assert granted.granted_by_user_id == actor.id
    assert granted.grant_source == "admin_api"
    assert granted.grant_reason == "On-call platform coverage"

    revoked = await role_service.revoke_system_admin(
        db_session, target.id, actor.id, "Coverage rotation ended"
    )
    assert await role_service.is_system_admin(db_session, target.id) is False
    assert revoked.revoked_by_user_id == actor.id
    assert revoked.revoke_reason == "Coverage rotation ended"


@pytest.mark.asyncio
async def test_promotion_rejects_ineligible_and_duplicate_accounts(db_session):
    actor = _user("actor2@example.com")
    target = _user("unverified@example.com", verified=False)
    db_session.add_all([actor, target])
    await db_session.flush()
    db_session.add(
        PlatformRoleAssignment(
            user_id=actor.id,
            role="system_admin",
            grant_source="test_bootstrap",
            grant_reason="Test bootstrap admin",
        )
    )
    await db_session.flush()

    with pytest.raises(ValueError, match="verified, active"):
        await role_service.grant_system_admin(db_session, target.id, actor.id, "Promote")

    target.is_verified = True
    await role_service.grant_system_admin(db_session, target.id, actor.id, "Promote")
    with pytest.raises(RuntimeError, match="already has"):
        await role_service.grant_system_admin(db_session, target.id, actor.id, "Again")


@pytest.mark.asyncio
async def test_final_admin_guard_and_self_revocation(db_session):
    first = _user("first@example.com")
    second = _user("second@example.com")
    db_session.add_all([first, second])
    await db_session.flush()
    db_session.add(
        PlatformRoleAssignment(
            user_id=first.id,
            role="system_admin",
            grant_source="test_bootstrap",
            grant_reason="Test bootstrap admin",
        )
    )
    await db_session.flush()

    with pytest.raises(RuntimeError, match="final eligible"):
        await role_service.revoke_system_admin(db_session, first.id, first.id, "Leaving")
    with pytest.raises(ValueError, match="final eligible"):
        await role_service.ensure_can_become_inaccessible(db_session, first.id)

    await role_service.grant_system_admin(db_session, second.id, first.id, "Second admin")
    await role_service.revoke_system_admin(db_session, first.id, first.id, "Leaving safely")
    assert await role_service.is_system_admin(db_session, first.id) is False
