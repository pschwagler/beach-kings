"""Location and region route handlers."""

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.db import get_db_session
from backend.services import data_service
from backend.services import location_service
from backend.api.auth_dependencies import (
    get_current_user_optional,
    require_system_admin,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/api/locations")
async def create_location(
    request: Request,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Create a location (system_admin)."""
    try:
        body = await request.json()
        location = await data_service.create_location(
            session=session,
            location_id=body["id"],  # id is the primary key (hub_id from CSV)
            name=body["name"],
            city=body.get("city"),
            state=body.get("state"),
            country=body.get("country", "USA"),
        )
        return location
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Missing required field: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating location: {str(e)}")


@router.get("/api/locations")
async def list_locations(session: AsyncSession = Depends(get_db_session)):
    """List locations (public)."""
    try:
        return await data_service.list_locations(session)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing locations: {str(e)}")


@router.get("/api/regions")
async def list_regions(session: AsyncSession = Depends(get_db_session)):
    """List regions (public)."""
    try:
        return await data_service.list_regions(session)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing regions: {str(e)}")


@router.get("/api/locations/distances")
async def get_location_distances(
    lat: float, lon: float, session: AsyncSession = Depends(get_db_session)
):
    """
    Get all locations with distances from given coordinates, sorted by closest first.
    Public endpoint.

    Args:
        lat: Latitude
        lon: Longitude

    Returns:
        Array of objects: [{"id": str, "name": str, "distance_miles": float}, ...]
    """
    try:
        return await location_service.get_all_location_distances(session, lat, lon)
    except Exception as e:
        logger.error(f"Error getting location distances: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting location distances: {str(e)}")


@router.get("/api/geocode/autocomplete")
async def geocode_autocomplete(
    text: str,
    current_user: dict = Depends(get_current_user_optional),  # Optional auth for rate limiting
):
    """
    Proxy autocomplete requests to Geoapify API.
    Keeps API key secure on backend.

    Args:
        text: Search text for city autocomplete

    Returns:
        Geoapify autocomplete response
    """
    try:
        return await location_service.autocomplete(text)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code, detail=f"Geoapify API error: {e.response.text}"
        )
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Geoapify API request error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching autocomplete: {str(e)}")


@router.put("/api/locations/{location_id}")
async def update_location(
    location_id: str,
    request: Request,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Update a location (system_admin)."""
    try:
        body = await request.json()
        location = await data_service.update_location(
            session=session,
            location_id=location_id,
            name=body.get("name"),
            city=body.get("city"),
            state=body.get("state"),
            country=body.get("country"),
        )
        if not location:
            raise HTTPException(status_code=404, detail="Location not found")
        return location
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating location: {str(e)}")


@router.delete("/api/locations/{location_id}")
async def delete_location(
    location_id: str,
    user: dict = Depends(require_system_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """Delete a location (system_admin)."""
    try:
        success = await data_service.delete_location(session, location_id)
        if not success:
            raise HTTPException(status_code=404, detail="Location not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting location: {str(e)}")
