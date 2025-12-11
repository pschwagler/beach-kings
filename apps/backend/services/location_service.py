"""
Location matching service to find the closest location to a user's coordinates.
"""
import os
import logging
from typing import Optional, Dict, List
import httpx
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


async def get_all_location_distances(session: AsyncSession, lat: float, lon: float) -> List[Dict]:
    """
    Get all locations with distances from given coordinates, sorted by closest first.
    
    Args:
        session: Database session
        lat: Latitude
        lon: Longitude
    
    Returns:
        List of dictionaries with keys: "id", "name", "distance_miles"
    """
    try:
        # Query all locations that have coordinates
        result = await session.execute(
            select(Location)
            .where(Location.latitude.isnot(None))
            .where(Location.longitude.isnot(None))
        )
        locations = result.scalars().all()
        
        if not locations:
            return []
        
        # Calculate distance to each location
        locations_with_distances = []
        for location in locations:
            if location.latitude is None or location.longitude is None:
                continue
            
            distance = calculate_distance_miles(
                lat,
                lon,
                location.latitude,
                location.longitude
            )
            
            locations_with_distances.append({
                "id": location.id,
                "name": location.name,
                "distance_miles": round(distance, 2)
            })
        
        # Sort by distance (closest first)
        locations_with_distances.sort(key=lambda x: x["distance_miles"])
        
        return locations_with_distances
        
    except Exception as e:
        logger.error(f"Error getting location distances: {str(e)}")
        raise


async def autocomplete(text: str) -> Dict:
    """
    Proxy autocomplete requests to Geoapify API.
    Keeps API key secure on backend.
    
    Args:
        text: Search text for city autocomplete
    
    Returns:
        Geoapify autocomplete response dictionary
    """
    if not text or len(text.strip()) < 2:
        return {"features": []}
    
    try:
        geoapify_key = os.getenv("GEOAPIFY_API_KEY")
        if not geoapify_key:
            raise ValueError("Geoapify API key not configured")
        
        url = "https://api.geoapify.com/v1/geocode/autocomplete"
        params = {
            "text": text.strip(),
            "apiKey": geoapify_key,
            "limit": 10,
            "type": "city",
            "filter": "countrycode:us",  # Filter to US cities only
            "lang": "en"  # English language
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()
            
    except httpx.HTTPStatusError as e:
        logger.error(f"Geoapify API error: {e.response.status_code} - {e.response.text}")
        raise
    except httpx.RequestError as e:
        logger.error(f"Geoapify API request error: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Error fetching autocomplete: {str(e)}")
        raise

