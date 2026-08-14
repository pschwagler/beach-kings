"""
Authentication dependencies for FastAPI routes.
"""

import logging
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.services import auth_service, role_service, user_service
from backend.database.db import get_db_session
from backend.database.models import (
    Court,
    League,
    LeagueMember,
    Player,
    Season,
    WeeklySchedule,
    Signup,
)
from backend.utils.datetime_utils import utcnow

logger = logging.getLogger(__name__)
# auto_error=False so we can raise 401 (not 403) for missing credentials.
# HTTPBearer with auto_error=True returns 403, which is semantically wrong for
# absent credentials; RFC 9110 says the server SHOULD send 401 when the resource
# requires authentication and the request carries no credentials.
security = HTTPBearer(auto_error=False)


def _is_deletion_expired(user: dict) -> bool:
    """
    Check whether a user's deletion grace period has passed.

    Returns True if the account should be treated as deleted, False otherwise.
    """
    deletion_at = user.get("deletion_scheduled_at")
    if not deletion_at:
        return False
    try:
        scheduled = datetime.fromisoformat(deletion_at)
        if scheduled.tzinfo is None:
            scheduled = scheduled.replace(tzinfo=timezone.utc)
        return utcnow() >= scheduled
    except (ValueError, TypeError):
        logger.warning(
            f"Could not parse deletion_scheduled_at for user {user.get('id')}: {deletion_at!r}"
        )
        return False


async def get_authenticated_user(
    session: AsyncSession = Depends(get_db_session),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """
    Dependency to get the current authenticated user from JWT token.

    Args:
        session: Database session
        credentials: HTTP Bearer token credentials (None when absent)

    Returns:
        User dictionary

    Raises:
        HTTPException: 401 if credentials are missing or invalid; user not found
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials

    # Verify token
    payload = auth_service.verify_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get user_id from token
    user_id = payload.get("user_id")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get user from database
    user = await user_service.get_user_by_id(session, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    current_version = int(user.get("session_version", 0))
    token_version = payload.get("sv")
    version_matches = (
        current_version == 0
        if token_version is None
        else isinstance(token_version, int)
        and not isinstance(token_version, bool)
        and token_version == current_version
    )
    if not version_matches:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.get("deleted_at"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account has been deleted",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if _is_deletion_expired(user):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account has been deleted",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


_RESTRICTED_ACCOUNT_ROUTES = {
    ("GET", "/api/auth/me"),
    ("POST", "/api/auth/logout"),
    ("GET", "/api/moderation/account-status"),
    ("GET", "/api/moderation/appeals/me"),
    ("POST", "/api/moderation/appeals"),
    ("POST", "/api/users/me/delete"),
    ("DELETE", "/api/users/me"),
    ("POST", "/api/users/me/cancel-deletion"),
}


def _enforce_account_access(request: Request, user: dict) -> dict:
    account_status = user_service.effective_moderation_status(user)
    resolved = {**user, "moderation_status": account_status}
    if (
        account_status == "active"
        or (request.method, request.url.path) in _RESTRICTED_ACCOUNT_ROUTES
    ):
        return resolved
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": f"account_{account_status}",
            "expires_at": user.get("moderation_expires_at"),
            "case_id": user.get("moderation_case_id"),
        },
    )


async def get_current_user(
    request: Request,
    user: dict = Depends(get_authenticated_user),
) -> dict:
    """Authenticate and enforce full account suspension/ban boundaries."""
    return _enforce_account_access(request, user)


async def get_current_user_optional(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
) -> Optional[dict]:
    """
    Optional dependency to get the current authenticated user.
    Returns None if no token is provided or token is invalid.

    Args:
        session: Database session
        credentials: Optional HTTP Bearer token credentials

    Returns:
        User dictionary or None
    """
    if credentials is None:
        return None

    try:
        user = await get_authenticated_user(session, credentials)
        return _enforce_account_access(request, user)
    except HTTPException:
        return None


async def require_user(user: dict = Depends(get_current_user)) -> dict:
    """Require any authenticated user."""
    return user


async def require_verified_player(
    user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """
    Require an authenticated, verified user with an existing player profile.

    Returns a dict with both user fields and player_id.
    Raises 403 if user is not verified or has no player record.
    """
    if not user.get("is_verified"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Phone verification required",
        )

    result = await session.execute(
        select(Player).where(
            Player.user_id == user["id"],
            Player.is_placeholder == False,  # noqa: E712
        )
    )
    player = result.scalar_one_or_none()
    if not player:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Player profile required",
        )

    return {**user, "player_id": player.id}


async def require_verified_player_allow_restricted(
    user: dict = Depends(get_authenticated_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Verified-player identity for status, appeal, deletion, and logout surfaces only."""
    if not user.get("is_verified"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Phone verification required",
        )
    result = await session.execute(
        select(Player).where(
            Player.user_id == user["id"],
            Player.is_placeholder == False,  # noqa: E712
        )
    )
    player = result.scalar_one_or_none()
    if not player:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Player profile required"
        )
    return {
        **user,
        "moderation_status": user_service.effective_moderation_status(user),
        "player_id": player.id,
    }


async def _is_system_admin(session: AsyncSession, user: dict) -> bool:
    """Resolve the user's current platform role from the database."""
    try:
        return await role_service.is_system_admin(session, user["id"])
    except Exception as exc:
        logger.warning("_is_system_admin check raised unexpectedly: %s", exc, exc_info=True)
        return False


async def require_court_owner_or_admin(session: AsyncSession, court_id: int, user: dict) -> Court:
    """
    Verify the user is the court creator or a system admin.

    Args:
        session: Database session
        court_id: Court to check ownership of
        user: Authenticated user dict (must include player_id)

    Returns:
        The Court ORM instance.

    Raises:
        HTTPException 404 if court not found, 403 if not authorized.
    """
    from sqlalchemy import select as sa_select

    result = await session.execute(sa_select(Court).where(Court.id == court_id))
    court = result.scalar_one_or_none()
    if not court:
        raise HTTPException(status_code=404, detail="Court not found")

    is_admin = await _is_system_admin(session, user)
    if court.created_by != user["player_id"] and not is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    return court


async def _has_league_role(
    session: AsyncSession, user_id: int, league_id: Optional[int], required_role: Optional[str]
) -> bool:
    """
    Check if a user (by user_id) has a role within a league via players -> league_members.
    required_role: 'admin' for admin; None for any membership.

    Returns False immediately when ``league_id`` is None (e.g. an unresolved
    target league), making the deny-by-default contract explicit and avoiding a
    pointless ``WHERE league_id IS NULL`` round-trip.
    """
    if league_id is None:
        return False

    query = (
        select(1)
        .select_from(
            LeagueMember.__table__.join(Player.__table__, LeagueMember.player_id == Player.id)
        )
        .where(LeagueMember.league_id == league_id, Player.user_id == user_id)
    )

    if required_role == "admin":
        query = query.where(LeagueMember.role == "admin")

    query = query.limit(1)

    result = await session.execute(query)
    return result.scalar_one_or_none() is not None


async def require_system_admin(
    user: dict = Depends(get_current_user), session: AsyncSession = Depends(get_db_session)
) -> dict:
    """Require platform-wide admin."""
    if not await _is_system_admin(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def make_require_league_admin():
    async def _dep(
        league_id: int,
        user: dict = Depends(get_current_user),
        session: AsyncSession = Depends(get_db_session),
    ) -> dict:
        if await _is_system_admin(session, user):
            return user
        if not await _has_league_role(
            session, user_id=user["id"], league_id=league_id, required_role="admin"
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="League admin access required"
            )
        return user

    return _dep


def make_require_league_member():
    async def _dep(
        league_id: int,
        user: dict = Depends(get_current_user),
        session: AsyncSession = Depends(get_db_session),
    ) -> dict:
        if await _is_system_admin(session, user):
            return user
        if not await _has_league_role(
            session, user_id=user["id"], league_id=league_id, required_role=None
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="League membership required"
            )
        return user

    return _dep


def make_require_league_member_or_public():
    """Allow any authenticated user to read a PUBLIC league; private leagues
    still require membership.

    Used for read-only league surfaces that non-members are allowed to view
    for public leagues (e.g. the standings tab, which is the public "shop
    window" shown to visitors who reach a league via discovery). Private,
    invite-only leagues remain members-only.
    """

    async def _dep(
        league_id: int,
        user: dict = Depends(get_current_user),
        session: AsyncSession = Depends(get_db_session),
    ) -> dict:
        if await _is_system_admin(session, user):
            return user
        if await _has_league_role(
            session, user_id=user["id"], league_id=league_id, required_role=None
        ):
            return user
        # Non-member: permitted only when the league is public.
        result = await session.execute(select(League.is_public).where(League.id == league_id))
        if result.scalar_one_or_none():
            return user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="League membership required"
        )

    return _dep


def make_require_league_member_with_403_auth():
    """
    Require league membership, returning 403 for both unauthenticated and non-member users.
    This converts 401 (Unauthorized) to 403 (Forbidden) to avoid leaking information about authentication status.
    """
    _forbidden = HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    async def _dep(
        league_id: int,
        session: AsyncSession = Depends(get_db_session),
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(
            HTTPBearer(auto_error=False)
        ),
    ) -> dict:
        if credentials is None:
            raise _forbidden

        payload = auth_service.verify_token(credentials.credentials)
        if payload is None or payload.get("user_id") is None:
            raise _forbidden

        user = await user_service.get_user_by_id(session, payload["user_id"])
        if user is None or _is_deletion_expired(user):
            raise _forbidden

        # Check league membership
        if await _is_system_admin(session, user):
            return user
        if not await _has_league_role(
            session, user_id=user["id"], league_id=league_id, required_role=None
        ):
            raise _forbidden
        return user

    return _dep


def make_require_league_member_from_season():
    """Require league membership, getting league_id from season_id."""

    async def _dep(
        season_id: int,
        user: dict = Depends(get_current_user),
        session: AsyncSession = Depends(get_db_session),
    ) -> dict:
        # Get season to find league_id
        result = await session.execute(select(Season).where(Season.id == season_id))
        season = result.scalar_one_or_none()
        if not season:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Season not found")

        league_id = season.league_id

        if await _is_system_admin(session, user):
            return user
        if not await _has_league_role(
            session, user_id=user["id"], league_id=league_id, required_role=None
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="League membership required"
            )
        return user

    return _dep


def make_require_league_admin_from_season():
    """Require league admin, getting league_id from season_id."""

    async def _dep(
        season_id: int,
        user: dict = Depends(get_current_user),
        session: AsyncSession = Depends(get_db_session),
    ) -> dict:
        # Get season to find league_id
        result = await session.execute(select(Season).where(Season.id == season_id))
        season = result.scalar_one_or_none()
        if not season:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Season not found")

        league_id = season.league_id

        if await _is_system_admin(session, user):
            return user
        if not await _has_league_role(
            session, user_id=user["id"], league_id=league_id, required_role="admin"
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="League admin access required"
            )
        return user

    return _dep


def make_require_league_admin_from_schedule():
    """Require league admin, getting league_id from weekly_schedule_id."""

    async def _dep(
        schedule_id: int,
        user: dict = Depends(get_current_user),
        session: AsyncSession = Depends(get_db_session),
    ) -> dict:
        # Get schedule to find season, then league_id
        result = await session.execute(
            select(WeeklySchedule).where(WeeklySchedule.id == schedule_id)
        )
        schedule = result.scalar_one_or_none()
        if not schedule:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Weekly schedule not found"
            )

        # Get season to find league_id
        season_result = await session.execute(
            select(Season).where(Season.id == schedule.season_id)
        )
        season = season_result.scalar_one_or_none()
        if not season:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Season not found")

        league_id = season.league_id

        if await _is_system_admin(session, user):
            return user
        if not await _has_league_role(
            session, user_id=user["id"], league_id=league_id, required_role="admin"
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="League admin access required"
            )
        return user

    return _dep


def make_require_kob_director():
    """Require authenticated user is the director of the given KOB tournament."""

    async def _dep(
        tournament_id: int,
        user: dict = Depends(require_verified_player),
        session: AsyncSession = Depends(get_db_session),
    ) -> dict:
        from backend.services import kob_service

        tournament = await kob_service.get_tournament(session, tournament_id)
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found",
            )
        if tournament.director_player_id != user["player_id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not the tournament director",
            )
        return {**user, "tournament": tournament}

    return _dep


def make_require_league_admin_from_signup():
    """Require league admin, getting league_id from signup_id."""

    async def _dep(
        signup_id: int,
        user: dict = Depends(get_current_user),
        session: AsyncSession = Depends(get_db_session),
    ) -> dict:
        # Get signup to find season_id
        result = await session.execute(select(Signup).where(Signup.id == signup_id))
        signup = result.scalar_one_or_none()
        if not signup:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signup not found")

        # Get season to find league_id
        # For ad-hoc signups (weekly_schedule_id is None), get season_id directly from signup
        # For scheduled signups, we could also get it from signup.season_id, but we'll use the same approach
        season_result = await session.execute(select(Season).where(Season.id == signup.season_id))
        season = season_result.scalar_one_or_none()
        if not season:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Season not found")

        league_id = season.league_id

        if await _is_system_admin(session, user):
            return user
        if not await _has_league_role(
            session, user_id=user["id"], league_id=league_id, required_role="admin"
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="League admin access required"
            )
        return user

    return _dep
