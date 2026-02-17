"""
API routes - combined router from all domain modules.

Shared infrastructure (limiter, constants) lives here; every sub-router
imports what it needs from this package.
"""

import os

from fastapi import APIRouter, HTTPException
from slowapi import Limiter
from slowapi.util import get_remote_address

# ---------------------------------------------------------------------------
# Shared rate limiter
# ---------------------------------------------------------------------------
IS_TEST_ENV = os.getenv("ENV", "").lower() == "test"
if IS_TEST_ENV:
    limiter = Limiter(key_func=get_remote_address)

    def no_op_limit(*args, **kwargs):
        """No-op decorator for test mode - doesn't apply any rate limiting."""
        def decorator(func):
            return func
        return decorator

    limiter.limit = lambda *args, **kwargs: no_op_limit()
else:
    limiter = Limiter(key_func=get_remote_address)

# ---------------------------------------------------------------------------
# Shared constants
# ---------------------------------------------------------------------------
INVALID_CREDENTIALS_RESPONSE = HTTPException(
    status_code=401, detail="Username or password is incorrect"
)
INVALID_VERIFICATION_CODE_RESPONSE = HTTPException(
    status_code=401, detail="Invalid or expired verification code"
)

# ---------------------------------------------------------------------------
# Import sub-routers and combine
# ---------------------------------------------------------------------------
from backend.api.routes.leagues import router as leagues_router
from backend.api.routes.seasons import router as seasons_router
from backend.api.routes.sessions import router as sessions_router
from backend.api.routes.matches import router as matches_router
from backend.api.routes.players import router as players_router
from backend.api.routes.courts import router as courts_router
from backend.api.routes.locations import router as locations_router
from backend.api.routes.auth import router as auth_router
from backend.api.routes.users import router as users_router
from backend.api.routes.friends import router as friends_router
from backend.api.routes.notifications import router as notifications_router
from backend.api.routes.signups import router as signups_router
from backend.api.routes.admin import router as admin_router
from backend.api.routes.calc import router as calc_router

router = APIRouter()
router.include_router(leagues_router)
router.include_router(seasons_router)
router.include_router(sessions_router)
router.include_router(matches_router)
router.include_router(players_router)
router.include_router(courts_router)
router.include_router(locations_router)
router.include_router(auth_router)
router.include_router(users_router)
router.include_router(friends_router)
router.include_router(notifications_router)
router.include_router(signups_router)
router.include_router(admin_router)
router.include_router(calc_router)
