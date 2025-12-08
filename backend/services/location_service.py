"""
Location matching service to find the closest location to a user's coordinates.
"""
import logging
from typing import Optional, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.database.models import Location
from backend.utils.geo_utils import calculate_distance_miles

logger = logging.getLogger(__name__)


async def find_closest_location(session: AsyncSession, user_lat: float, user_lon: float) -> Optional[Dict]:
    """
    Find the closest location to the user's coordinates.
    
    Args:
        session: Database session
        user_lat: User's latitude
        user_lon: User's longitude
    
    Returns:
        Dictionary with keys: "location_id", "distance_miles"
        Returns None if no locations found or all locations lack coordinates
    """
    logger.warning(f"Finding closest location for user_lat: {user_lat}, user_lon: {user_lon}")
    try:
        # Query all locations that have coordinates
        result = await session.execute(
            select(Location)
            .where(Location.latitude.isnot(None))
            .where(Location.longitude.isnot(None))
        )
        locations = result.scalars().all()
        
        if not locations:
            logger.warning("No locations with coordinates found")
            return None
        
        closest_location = None
        closest_distance = float('inf')
        
        # Calculate distance to each location
        for location in locations:
            if location.latitude is None or location.longitude is None:
                continue
            
            distance = calculate_distance_miles(
                user_lat,
                user_lon,
                location.latitude,
                location.longitude
            )
            
            if distance < closest_distance:
                closest_distance = distance
                closest_location = location
        
        if closest_location is None:
            return None
        
        return {
            "location_id": closest_location.id,
            "distance_miles": closest_distance
        }
        
    except Exception as e:
        logger.error(f"Error finding closest location: {str(e)}")
        return None
