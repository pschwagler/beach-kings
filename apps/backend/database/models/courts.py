"""Courts models."""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    Float,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    CheckConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.database.db import Base


class Court(Base):
    """Court locations with discovery & review support."""

    __tablename__ = "courts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    address = Column(String, nullable=True)
    location_id = Column(String, ForeignKey("locations.id"), nullable=False)
    geoJson = Column(Text, nullable=True)
    # Discovery fields
    description = Column(Text, nullable=True)
    court_count = Column(Integer, nullable=True)
    surface_type = Column(String(50), nullable=True)  # 'sand', 'indoor_sand'
    is_free = Column(Boolean, nullable=True)
    cost_info = Column(Text, nullable=True)
    has_lights = Column(Boolean, nullable=True)
    has_restrooms = Column(Boolean, nullable=True)
    has_parking = Column(Boolean, nullable=True)
    parking_info = Column(Text, nullable=True)
    nets_provided = Column(Boolean, nullable=True)
    hours = Column(Text, nullable=True)
    phone = Column(String(30), nullable=True)
    website = Column(String(500), nullable=True)
    wind_exposure = Column(String(20), nullable=True)
    wind_notes = Column(String(140), nullable=True)
    sand_depth = Column(String(20), nullable=True)
    sand_notes = Column(String(140), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    average_rating = Column(Float, nullable=True)
    review_count = Column(Integer, nullable=True, server_default="0")
    status = Column(
        String(20), nullable=True, server_default="approved"
    )  # pending/approved/rejected
    is_active = Column(Boolean, nullable=True, server_default="true")
    is_placeholder = Column(Boolean, default=False, server_default="false", nullable=False)
    slug = Column(String(200), nullable=True, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(
        Integer, ForeignKey("players.id"), nullable=True
    )  # Player who created the court
    updated_by = Column(
        Integer, ForeignKey("players.id"), nullable=True
    )  # Player who last updated the court

    # Relationships
    location = relationship("Location", back_populates="courts")
    sessions = relationship("Session", back_populates="court")
    weekly_schedules = relationship("WeeklySchedule", back_populates="court")
    signups = relationship("Signup", back_populates="court")
    reviews = relationship("CourtReview", back_populates="court", cascade="all, delete-orphan")
    photos = relationship("CourtPhoto", back_populates="court", cascade="all, delete-orphan")
    edit_suggestions = relationship(
        "CourtEditSuggestion", back_populates="court", cascade="all, delete-orphan"
    )
    league_home_courts = relationship(
        "LeagueHomeCourt", back_populates="court", cascade="all, delete-orphan"
    )
    player_home_courts = relationship(
        "PlayerHomeCourt", back_populates="court", cascade="all, delete-orphan"
    )
    creator = relationship("Player", foreign_keys=[created_by], backref="created_courts")
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_courts")

    __table_args__ = (
        CheckConstraint(
            "wind_exposure IS NULL OR wind_exposure IN ('sheltered', 'mixed', 'exposed')",
            name="ck_courts_wind_exposure",
        ),
        CheckConstraint(
            "sand_depth IS NULL OR sand_depth IN ('shallow', 'typical', 'deep')",
            name="ck_courts_sand_depth",
        ),
        Index("idx_courts_location", "location_id"),
        Index("idx_courts_slug", "slug", unique=True),
        Index("idx_courts_status", "status"),
        Index("idx_courts_lat_lng", "latitude", "longitude"),
        Index("idx_courts_is_active", "is_active"),
    )


class CourtTag(Base):
    """Curated tags for court reviews (quality, vibe, facility)."""

    __tablename__ = "court_tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), nullable=False)
    slug = Column(String(50), nullable=False, unique=True)
    category = Column(String(30), nullable=False)  # 'quality', 'vibe', 'facility'
    sort_order = Column(Integer, nullable=False, server_default="0")

    # Relationships
    review_tags = relationship("CourtReviewTag", back_populates="tag")

    __table_args__ = (Index("idx_court_tags_category", "category"),)


class CourtReview(Base):
    """User reviews for courts (one per user per court)."""

    __tablename__ = "court_reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    court_id = Column(Integer, ForeignKey("courts.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    rating = Column(Integer, nullable=False)  # 1-5 stars
    review_text = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    moderation_visibility = Column(String(20), nullable=False, server_default="visible")

    # Relationships
    court = relationship("Court", back_populates="reviews")
    player = relationship("Player", foreign_keys=[player_id], backref="court_reviews")
    review_tags = relationship(
        "CourtReviewTag", back_populates="review", cascade="all, delete-orphan"
    )
    photos = relationship(
        "CourtReviewPhoto", back_populates="review", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("court_id", "player_id", name="uq_court_reviews_court_player"),
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_court_reviews_rating_range"),
        Index("idx_court_reviews_court", "court_id"),
        Index("idx_court_reviews_player", "player_id"),
        Index("idx_court_reviews_created", "created_at"),
    )


class CourtReviewTag(Base):
    """Join table linking reviews to curated tags."""

    __tablename__ = "court_review_tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    review_id = Column(Integer, ForeignKey("court_reviews.id", ondelete="CASCADE"), nullable=False)
    tag_id = Column(Integer, ForeignKey("court_tags.id", ondelete="CASCADE"), nullable=False)

    # Relationships
    review = relationship("CourtReview", back_populates="review_tags")
    tag = relationship("CourtTag", back_populates="review_tags")

    __table_args__ = (
        UniqueConstraint("review_id", "tag_id", name="uq_court_review_tags_review_tag"),
        Index("idx_court_review_tags_review", "review_id"),
        Index("idx_court_review_tags_tag", "tag_id"),
    )


class CourtReviewPhoto(Base):
    """Photos attached to court reviews (max 3 per review)."""

    __tablename__ = "court_review_photos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    review_id = Column(Integer, ForeignKey("court_reviews.id", ondelete="CASCADE"), nullable=False)
    s3_key = Column(String(500), nullable=False)
    url = Column(String(500), nullable=False)
    sort_order = Column(Integer, nullable=False, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    moderation_visibility = Column(String(20), nullable=False, server_default="visible")

    # Relationships
    review = relationship("CourtReview", back_populates="photos")

    __table_args__ = (Index("idx_court_review_photos_review", "review_id"),)


class CourtPhoto(Base):
    """Standalone court photos (not tied to reviews)."""

    __tablename__ = "court_photos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    court_id = Column(Integer, ForeignKey("courts.id", ondelete="CASCADE"), nullable=False)
    s3_key = Column(String(500), nullable=False)
    url = Column(String(500), nullable=False)
    uploaded_by = Column(Integer, ForeignKey("players.id", ondelete="SET NULL"), nullable=True)
    sort_order = Column(Integer, nullable=False, server_default="0")
    caption = Column(String(280), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    moderation_visibility = Column(String(20), nullable=False, server_default="visible")

    # Relationships
    court = relationship("Court", back_populates="photos")
    uploader = relationship("Player", foreign_keys=[uploaded_by])

    __table_args__ = (Index("idx_court_photos_court", "court_id"),)


class CourtEditSuggestion(Base):
    """User-submitted edit suggestions for court info."""

    __tablename__ = "court_edit_suggestions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    court_id = Column(Integer, ForeignKey("courts.id", ondelete="CASCADE"), nullable=False)
    suggested_by = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    changes = Column(JSONB, nullable=False)  # JSON object of field -> new_value
    applied_changes = Column(JSONB, nullable=True)
    note = Column(String(280), nullable=True)
    status = Column(String(20), nullable=False, server_default="pending")
    reviewed_by = Column(Integer, ForeignKey("players.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    court = relationship("Court", back_populates="edit_suggestions")
    suggester = relationship(
        "Player", foreign_keys=[suggested_by], backref="court_edit_suggestions"
    )
    reviewer = relationship(
        "Player", foreign_keys=[reviewed_by], backref="reviewed_court_suggestions"
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'approved', 'partially_applied', 'rejected')",
            name="ck_court_edit_suggestions_status",
        ),
        Index("idx_court_edit_suggestions_court", "court_id"),
        Index("idx_court_edit_suggestions_status", "status"),
    )


class PlayerHomeCourt(Base):
    """Courts designated as home courts for a player."""

    __tablename__ = "player_home_courts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    court_id = Column(Integer, ForeignKey("courts.id", ondelete="CASCADE"), nullable=False)
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    player = relationship("Player", back_populates="home_courts")
    court = relationship("Court", back_populates="player_home_courts")

    __table_args__ = (
        UniqueConstraint("player_id", "court_id", name="uq_player_home_courts_player_court"),
        Index("idx_player_home_courts_player", "player_id"),
    )


class CourtCheckIn(Base):
    """Active check-ins at a court (auto-expire after 4 hours)."""

    __tablename__ = "court_check_ins"

    id = Column(Integer, primary_key=True, autoincrement=True)
    court_id = Column(Integer, ForeignKey("courts.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    checked_in_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)

    # Relationships
    court = relationship("Court", backref="check_ins")
    player = relationship("Player", backref="court_check_ins")

    __table_args__ = (
        UniqueConstraint("court_id", "player_id", name="uq_court_check_ins_court_player"),
        Index("idx_court_check_ins_court", "court_id"),
        Index("idx_court_check_ins_expires", "expires_at"),
    )
