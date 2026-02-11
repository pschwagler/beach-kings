"""
Public API routes — no authentication required.

Provides read-only endpoints for SEO (sitemap, public pages).
All routes are prefixed with /api/public.
"""

from fastapi import APIRouter

public_router = APIRouter(prefix="/api/public", tags=["public"])
