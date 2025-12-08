"""
Geocoding service using Geoapify API to convert city names to coordinates.
"""
import os
import logging
from typing import Optional, Dict
import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

GEOAPIFY_API_KEY = os.getenv("GEOAPIFY_API_KEY")


async def geocode_city(city: str, state: Optional[str] = None) -> Optional[Dict]:
    """
    Geocode a city name to coordinates using Geoapify API.
    
    Args:
        city: City name
        state: Optional state name or abbreviation
    
    Returns:
        Dictionary with keys: "lat", "lon", "city", "state"
        Returns None on error
    """
    if not GEOAPIFY_API_KEY:
        logger.error("GEOAPIFY_API_KEY not configured")
        return None
    
    if not city or not city.strip():
        logger.error("City name is required")
        return None
    
    # Build search text
    search_text = city.strip()
    if state:
        search_text = f"{search_text}, {state.strip()}"
    else:
        search_text = f"{search_text}, USA"
    
    try:
        # Use Geoapify Autocomplete API (same as frontend for consistency)
        url = "https://api.geoapify.com/v1/geocode/autocomplete"
        params = {
            "text": search_text,
            "apiKey": GEOAPIFY_API_KEY,
            "limit": 1,
            "type": "city",
            "filter": "countrycode:us",  # Filter to US cities only
            "lang": "en"  # English language
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            
            if not data.get("features") or len(data["features"]) == 0:
                logger.warning(f"No results found for city: {search_text}")
                return None
            
            feature = data["features"][0]
            properties = feature.get("properties", {})
            geometry = feature.get("geometry", {})
            coordinates = geometry.get("coordinates", [])
            
            if not coordinates or len(coordinates) < 2:
                logger.warning(f"Invalid coordinates in response for: {search_text}")
                return None
            
            # Extract coordinates (GeoJSON format: [lon, lat])
            lon = coordinates[0]
            lat = coordinates[1]
            
            # Extract city and state from response
            result_city = properties.get("city") or properties.get("name") or city
            
            # Special handling for New York City: use district as city if available
            district = properties.get("district") or properties.get("suburb")
            if result_city == "New York" and district:
                result_city = district
            
            result_state = properties.get("state") or state
            
            # If state is not in response, try to get it from state_code
            if not result_state:
                result_state = properties.get("state_code")
            
            return {
                "lat": lat,
                "lon": lon,
                "city": result_city,
                "state": result_state
            }
            
    except httpx.HTTPStatusError as e:
        logger.error(f"Geoapify API error: {e.response.status_code} - {e.response.text}")
        return None
    except httpx.RequestError as e:
        logger.error(f"Geoapify API request error: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error geocoding city '{city}': {str(e)}")
        return None
