"""
Authentication dependencies for FastAPI routes.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.services import auth_service, user_service, data_service
from backend.database.db import get_db_session
from backend.database.models import Court, LeagueMember, Player, Season, WeeklySchedule, Signup

security = HTTPBearer()


async def get_current_user(
    session: AsyncSession = Depends(get_db_session),
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    Dependency to get the current authenticated user from JWT token.

    Args:
        session: Database session
        credentials: HTTP Bearer token credentials

    Returns:
        User dictionary

    Raises:
        HTTPException: If token is invalid or user not found
    """
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

    return user


async def get_current_user_optional(
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
        return await get_current_user(session, credentials)
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


async def _is_system_admin(session: AsyncSession, user: dict) -> bool:
    """
    Determine if the user is a system admin.

    Checks two settings:
    - 'system_admin_phone_numbers': comma-separated E.164 phone numbers
    - 'system_admin_emails': comma-separated email addresses (for Google SSO admins)
    """
    try:
        # Check by phone number
        phone_setting = await data_service.get_setting(session, "system_admin_phone_numbers")
        if phone_setting and user.get("phone_number"):
            phones = {p.strip() for p in phone_setting.split(",") if p.strip()}
            if user["phone_number"] in phones:
                return True

        # Check by email (for Google SSO users who may not have a phone number)
        email_setting = await data_service.get_setting(session, "system_admin_emails")
        if email_setting and user.get("email"):
            emails = {e.strip().lower() for e in email_setting.split(",") if e.strip()}
            if user["email"].strip().lower() in emails:
                return True

        return False
    except Exception:
        return False


async def require_court_owner_or_admin(
    session: AsyncSession, court_id: int, user: dict
) -> Court:
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
    session: AsyncSession, user_id: int, league_id: int, required_role: Optional[str]
) -> bool:
    """
    Check if a user (by user_id) has a role within a league via players -> league_members.
    required_role: 'admin' for admin; None for any membership.
    """
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


def make_require_league_member_with_403_auth():
    """
    Require league membership, returning 403 for both unauthenticated and non-member users.
    This converts 401 (Unauthorized) to 403 (Forbidden) to avoid leaking information about authentication status.
    """

    async def _dep(
        league_id: int,
        session: AsyncSession = Depends(get_db_session),
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(
            HTTPBearer(auto_error=False)
        ),
    ) -> dict:
        # Check authentication - return 403 if not authenticated
        if credentials is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        token = credentials.credentials

        # Verify token
        payload = auth_service.verify_token(token)
        if payload is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        # Get user_id from token
        user_id = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        # Get user from database
        user = await user_service.get_user_by_id(session, user_id)
        if user is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        # Check league membership - return 403 if not a member
        if await _is_system_admin(session, user):
            return user
        if not await _has_league_role(
            session, user_id=user["id"], league_id=league_id, required_role=None
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
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
