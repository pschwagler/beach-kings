"""
Authentication dependencies for FastAPI routes.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from backend.services import auth_service, user_service, data_service
from backend.database import db

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """
    Dependency to get the current authenticated user from JWT token.
    
    Args:
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
    user = user_service.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))
) -> Optional[dict]:
    """
    Optional dependency to get the current authenticated user.
    Returns None if no token is provided or token is invalid.
    
    Args:
        credentials: Optional HTTP Bearer token credentials
        
    Returns:
        User dictionary or None
    """
    if credentials is None:
        return None
    
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


async def require_user(user: dict = Depends(get_current_user)) -> dict:
    """Require any authenticated user."""
    return user


def _is_system_admin(user: dict) -> bool:
    """
    Determine if the user is a system admin.
    Uses settings key 'system_admin_phone_numbers' with comma-separated E.164 numbers.
    """
    try:
        setting = data_service.get_setting("system_admin_phone_numbers")
        if not setting:
            return False
        phones = {p.strip() for p in setting.split(",") if p.strip()}
        return user.get("phone_number") in phones
    except Exception:
        return False


def _has_league_role(user_id: int, league_id: int, required_role: Optional[str]) -> bool:
    """
    Check if a user (by user_id) has a role within a league via players -> league_members.
    required_role: 'admin' for admin; None for any membership.
    """
    query = """
        SELECT 1
        FROM league_members lm
        INNER JOIN players p ON p.id = lm.player_id
        WHERE lm.league_id = ?
          AND p.user_id = ?
          {role_clause}
        LIMIT 1
    """
    role_clause = "AND lm.role = 'admin'" if required_role == "admin" else ""
    query = query.format(role_clause=role_clause)
    with db.get_db() as conn:
        cur = conn.execute(query, (league_id, user_id))
        return cur.fetchone() is not None


async def require_system_admin(user: dict = Depends(get_current_user)) -> dict:
    """Require platform-wide admin."""
    if not _is_system_admin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def make_require_league_admin():
    async def _dep(league_id: int, user: dict = Depends(get_current_user)) -> dict:
        if _is_system_admin(user):
            return user
        if not _has_league_role(user_id=user["id"], league_id=league_id, required_role="admin"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="League admin access required")
        return user
    return _dep


def make_require_league_member():
    async def _dep(league_id: int, user: dict = Depends(get_current_user)) -> dict:
        if _is_system_admin(user):
            return user
        if not _has_league_role(user_id=user["id"], league_id=league_id, required_role=None):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="League membership required")
        return user
    return _dep


