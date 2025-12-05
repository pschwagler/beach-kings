"""
Rate limiting service for per-phone-number rate limiting.

Provides functionality to check and enforce rate limits for phone numbers,
using an in-memory sliding window approach.
"""

import time
from fastapi import HTTPException, Request
from backend.services import auth_service

# In-memory storage for phone-based rate limiting
_phone_rate_limit_storage = {}


def reset_phone_rate_limit_storage():
    """Reset the phone rate limit storage. Useful for testing."""
    global _phone_rate_limit_storage
    _phone_rate_limit_storage.clear()


def get_phone_rate_limit_key(phone_number: str) -> str:
    """
    Create a rate limiting key from a phone number.
    Normalizes the phone number to ensure consistent rate limiting.
    
    Args:
        phone_number: Phone number to create key for
        
    Returns:
        Rate limit key string (e.g., "phone:+15551111111")
    """
    try:
        normalized = auth_service.normalize_phone_number(phone_number)
        return f"phone:{normalized}"
    except Exception:
        # If normalization fails, use the phone number as-is
        return f"phone:{phone_number}"


async def check_phone_rate_limit(request: Request, phone_number: str, limit_str: str = "10/minute"):
    """
    Manually check rate limit for a phone number after body parsing.
    Raises HTTPException with 429 if limit exceeded.
    
    Uses a simple in-memory sliding window approach that works reliably 
    in all environments.
    
    Args:
        request: FastAPI Request object
        phone_number: Phone number to check rate limit for
        limit_str: Rate limit string (e.g., "10/minute", "5/hour")
        
    Raises:
        HTTPException: With status code 429 if rate limit exceeded
    """
    # Create rate limit key from normalized phone number
    rate_limit_key = get_phone_rate_limit_key(phone_number)
    
    # Parse the limit string (e.g., "10/minute" -> count=10, period=60)
    parts = limit_str.split("/")
    if len(parts) != 2:
        raise ValueError(f"Invalid rate limit format: {limit_str}")
    
    count = int(parts[0])
    period_str = parts[1].lower().rstrip("s")  # Remove trailing 's' if present
    
    # Convert period to seconds
    period_map = {
        "second": 1,
        "minute": 60,
        "hour": 3600,
        "day": 86400
    }
    
    if period_str not in period_map:
        raise ValueError(f"Invalid time period: {parts[1]}")
    
    period = period_map[period_str]
    
    # Get current timestamp
    now = time.time()
    
    # Get or initialize hit times for this key
    if rate_limit_key not in _phone_rate_limit_storage:
        _phone_rate_limit_storage[rate_limit_key] = []
    
    hit_times = _phone_rate_limit_storage[rate_limit_key]
    
    # Remove expired entries (older than the period)
    hit_times[:] = [t for t in hit_times if now - t < period]
    
    # Check if we've exceeded the limit
    if len(hit_times) >= count:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded: {limit_str} per phone number. Please try again later."
        )
    
    # Add current hit
    hit_times.append(now)
    _phone_rate_limit_storage[rate_limit_key] = hit_times
