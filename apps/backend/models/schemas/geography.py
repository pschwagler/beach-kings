"""Geography models."""

from typing import Optional
from pydantic import BaseModel, ConfigDict


class RegionBase(BaseModel):
    """Base region model."""

    name: str


class RegionCreate(RegionBase):
    """Request to create a region."""

    id: str


class RegionResponse(RegionBase):
    """Region response."""

    model_config = ConfigDict(extra="ignore")

    id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class LocationBase(BaseModel):
    """Base location model."""

    name: str
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = "USA"
    region_id: Optional[str] = None
    tier: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    seasonality: Optional[str] = None
    radius_miles: Optional[float] = None


class LocationCreate(LocationBase):
    """Request to create a location."""

    id: str


class LocationResponse(LocationBase):
    """Location response."""

    model_config = ConfigDict(extra="ignore")

    id: str  # Primary key: hub_id from CSV (e.g., "socal_la", "hi_oahu")
    slug: Optional[str] = None  # SEO-friendly URL slug (e.g., "manhattan-beach")
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class CourtBase(BaseModel):
    """Base court model."""

    name: str
    address: Optional[str] = None
    location_id: str
    geoJson: Optional[str] = None


class CourtCreate(CourtBase):
    """Request to create a court."""

    pass


class CourtResponse(CourtBase):
    """Court response."""

    id: int
    is_placeholder: bool = False
    created_at: str
    updated_at: str
