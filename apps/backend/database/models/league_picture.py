"""A bounded, private picture loaded only through the league member endpoint."""

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, LargeBinary, String
from sqlalchemy.sql import func

from backend.database.db import Base


class LeaguePicture(Base):
    __tablename__ = "league_pictures"

    league_id = Column(Integer, ForeignKey("leagues.id", ondelete="CASCADE"), primary_key=True)
    image_bytes = Column(LargeBinary, nullable=False)
    revision = Column(String(32), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "length(image_bytes) > 0 AND length(image_bytes) <= 524288",
            name="ck_league_picture_size",
        ),
    )
