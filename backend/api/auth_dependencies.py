"""
Authentication dependencies for FastAPI routes.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from backend.services import auth_service, user_service, data_service
from backend.database.db import get_db_session
from backend.database.models import LeagueMember, Player

security = HTTPBearer()


async def get_current_user(
    session: AsyncSession = Depends(get_db_session),
    credentials: HTTPAuthorizationCredentials = Depends(security)
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
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))
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


async def _is_system_admin(session: AsyncSession, user: dict) -> bool:
    """
    Determine if the user is a system admin.
    Uses settings key 'system_admin_phone_numbers' with comma-separated E.164 numbers.
    """
    try:
        setting = await data_service.get_setting(session, "system_admin_phone_numbers")
        if not setting:
            return False
        phones = {p.strip() for p in setting.split(",") if p.strip()}
        return user.get("phone_number") in phones
    except Exception:
        return False


async def _has_league_role(session: AsyncSession, user_id: int, league_id: int, required_role: Optional[str]) -> bool:
    """
    Check if a user (by user_id) has a role within a league via players -> league_members.
    required_role: 'admin' for admin; None for any membership.
    """
    query = select(1).select_from(
        LeagueMember.__table__.join(Player.__table__, LeagueMember.player_id == Player.id)
    ).where(
        LeagueMember.league_id == league_id,
        Player.user_id == user_id
    )
    
    if required_role == "admin":
        query = query.where(LeagueMember.role == "admin")
    
    query = query.limit(1)
    
    result = await session.execute(query)
    return result.scalar_one_or_none() is not None


async def require_system_admin(
    user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
) -> dict:
    """Require platform-wide admin."""
    if not await _is_system_admin(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def make_require_league_admin():
    async def _dep(
        league_id: int,
        user: dict = Depends(get_current_user),
        session: AsyncSession = Depends(get_db_session)
    ) -> dict:
        if await _is_system_admin(session, user):
            return user
        if not await _has_league_role(session, user_id=user["id"], league_id=league_id, required_role="admin"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="League admin access required")
        return user
    return _dep


def make_require_league_member():
    async def _dep(
        league_id: int,
        user: dict = Depends(get_current_user),
        session: AsyncSession = Depends(get_db_session)
    ) -> dict:
        if await _is_system_admin(session, user):
            return user
        if not await _has_league_role(session, user_id=user["id"], league_id=league_id, required_role=None):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="League membership required")
        return user
    return _dep


