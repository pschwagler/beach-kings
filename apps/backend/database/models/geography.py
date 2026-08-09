"""Geography models."""

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.database.db import Base


class Region(Base):
    """Geographic regions."""

    __tablename__ = "regions"

    id = Column(
        String, primary_key=True
    )  # lowercase_snake_case identifier (e.g., "hawaii", "california")
    name = Column(
        String, nullable=False, unique=True
    )  # Display name (e.g., "Hawaii", "California")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    locations = relationship("Location", back_populates="region")

    __table_args__ = (Index("idx_regions_name", "name"),)


class Location(Base):
    """Metropolitan areas."""

    __tablename__ = "locations"

    id = Column(
        String, primary_key=True
    )  # Primary key: Identifier from CSV hub_id column (e.g., "hi_oahu", "socal_la")
    name = Column(String, nullable=False)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    country = Column(String, default="USA")
    region_id = Column(String, ForeignKey("regions.id"), nullable=True)  # Foreign key to Region
    tier = Column(Integer, nullable=True)  # Tier level (1-4)
    latitude = Column(Float, nullable=True)  # Latitude coordinate
    longitude = Column(Float, nullable=True)  # Longitude coordinate
    seasonality = Column(
        String, nullable=True
    )  # When location is active (e.g., "Year-Round", "Jun-Aug")
    radius_miles = Column(Float, nullable=True)  # Radius in miles
    slug = Column(
        String(100), nullable=True, unique=True
    )  # SEO-friendly URL slug (e.g., "manhattan-beach")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(
        Integer, ForeignKey("players.id"), nullable=True
    )  # Player who created the location
    updated_by = Column(
        Integer, ForeignKey("players.id"), nullable=True
    )  # Player who last updated the location

    # Relationships
    region = relationship("Region", back_populates="locations")
    players = relationship(
        "Player", primaryjoin="Location.id == Player.location_id", back_populates="location"
    )
    leagues = relationship("League", back_populates="location")
    courts = relationship("Court", back_populates="location")
    creator = relationship("Player", foreign_keys=[created_by], backref="created_locations")
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_locations")

    __table_args__ = (
        Index("idx_locations_name", "name"),
        Index("idx_locations_region_id", "region_id"),
    )
