"""Settings models."""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.database.db import Base


class Setting(Base):
    """Application configuration."""

    __tablename__ = "settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by = Column(
        Integer, ForeignKey("players.id"), nullable=True
    )  # Player who last updated the setting

    # Relationships
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_settings")
