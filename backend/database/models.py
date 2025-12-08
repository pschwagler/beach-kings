"""
SQLAlchemy ORM models for the Beach Volleyball ELO system.
"""

from datetime import datetime
from typing import List
import enum
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, Float, Date, DateTime, Enum,
    ForeignKey, UniqueConstraint, CheckConstraint, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.database.db import Base


class SessionStatus(str, enum.Enum):
    """Session status enum."""
    ACTIVE = "ACTIVE"
    SUBMITTED = "SUBMITTED"
    EDITED = "EDITED"


class OpenSignupsMode(str, enum.Enum):
    """Weekly schedule signup opening mode."""
    AUTO_AFTER_LAST_SESSION = "auto_after_last_session"
    SPECIFIC_DAY_TIME = "specific_day_time"
    ALWAYS_OPEN = "always_open"


class SignupEventType(str, enum.Enum):
    """Signup event type."""
    SIGNUP = "signup"
    DROPOUT = "dropout"


class Region(Base):
    """Geographic regions."""
    __tablename__ = "regions"
    
    id = Column(String, primary_key=True)  # lowercase_snake_case identifier (e.g., "hawaii", "california")
    name = Column(String, nullable=False, unique=True)  # Display name (e.g., "Hawaii", "California")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    locations = relationship("Location", back_populates="region")
    
    __table_args__ = (
        Index("idx_regions_name", "name"),
    )


class Location(Base):
    """Metropolitan areas."""
    __tablename__ = "locations"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    location_id = Column(String, nullable=True, unique=True)  # Identifier from CSV hub_id column (e.g., "hi_oahu", "socal_la")
    name = Column(String, nullable=False)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    country = Column(String, default="USA")
    region_id = Column(String, ForeignKey("regions.id"), nullable=True)  # Foreign key to Region
    tier = Column(Integer, nullable=True)  # Tier level (1-4)
    latitude = Column(Float, nullable=True)  # Latitude coordinate
    longitude = Column(Float, nullable=True)  # Longitude coordinate
    seasonality = Column(String, nullable=True)  # When location is active (e.g., "Year-Round", "Jun-Aug")
    radius_miles = Column(Float, nullable=True)  # Radius in miles
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("players.id"), nullable=True)  # Player who created the location
    updated_by = Column(Integer, ForeignKey("players.id"), nullable=True)  # Player who last updated the location
    
    # Relationships
    region = relationship("Region", back_populates="locations")
    players = relationship("Player", primaryjoin="Location.id == Player.default_location_id", back_populates="default_location")
    leagues = relationship("League", back_populates="location")
    courts = relationship("Court", back_populates="location")
    creator = relationship("Player", foreign_keys=[created_by], backref="created_locations")
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_locations")
    
    __table_args__ = (
        Index("idx_locations_name", "name"),
        Index("idx_locations_location_id", "location_id"),
        Index("idx_locations_region_id", "region_id"),
    )


class User(Base):
    """User accounts with phone-based authentication."""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    phone_number = Column(String, nullable=False, unique=True)
    password_hash = Column(String, nullable=False)
    email = Column(String, nullable=True)
    is_verified = Column(Boolean, default=True, nullable=False)
    failed_verification_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(String, nullable=True)  # ISO timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    players = relationship("Player", back_populates="user")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    password_reset_tokens = relationship("PasswordResetToken", back_populates="user", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index("idx_users_phone", "phone_number"),
        Index("idx_users_phone_verified", "phone_number", "is_verified"),
    )


class Player(Base):
    """Player profiles."""
    __tablename__ = "players"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    full_name = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    nickname = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    level = Column(String, nullable=True)
    date_of_birth = Column(Date, nullable=True)
    height = Column(String, nullable=True)
    preferred_side = Column(String, nullable=True)
    default_location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    city_latitude = Column(Float, nullable=True)  # City latitude coordinate
    city_longitude = Column(Float, nullable=True)  # City longitude coordinate
    distance_to_location = Column(Float, nullable=True)  # Distance in miles
    profile_picture_url = Column(String, nullable=True)
    avatar = Column(String, nullable=True)  # Can store initials (e.g., "JD") or image URL
    avp_playerProfileId = Column(Integer, nullable=True)
    status = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="players")
    default_location = relationship("Location", foreign_keys=[default_location_id], back_populates="players")
    league_memberships = relationship("LeagueMember", foreign_keys="LeagueMember.player_id", back_populates="player")
    season_stats = relationship("PlayerSeasonStats", back_populates="player")
    elo_history = relationship("EloHistory", back_populates="player")
    global_stats = relationship("PlayerGlobalStats", back_populates="player", uselist=False)
    signup_registrations = relationship("SignupPlayer", back_populates="player")
    
    __table_args__ = (
        Index("idx_players_name", "full_name"),
        Index("idx_players_user", "user_id"),
        Index("idx_players_location", "default_location_id"),
        Index("idx_players_avp_id", "avp_playerProfileId"),
    )


class League(Base):
    """League groups."""
    __tablename__ = "leagues"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    is_open = Column(Boolean, default=True, nullable=False)
    whatsapp_group_id = Column(String, nullable=True)
    gender = Column(String, nullable=True)  # 'male', 'female', 'mixed'
    level = Column(String, nullable=True)  # 'beginner', 'intermediate', 'advanced', 'Open', etc.
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("players.id"), nullable=True)  # Player who created the league
    updated_by = Column(Integer, ForeignKey("players.id"), nullable=True)  # Player who last updated the league
    
    # Relationships
    location = relationship("Location", back_populates="leagues")
    members = relationship("LeagueMember", back_populates="league", cascade="all, delete-orphan")
    seasons = relationship("Season", foreign_keys="Season.league_id", back_populates="league")
    config = relationship("LeagueConfig", back_populates="league", uselist=False, cascade="all, delete-orphan")
    creator = relationship("Player", foreign_keys=[created_by], backref="created_leagues")
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_leagues")
    messages = relationship("LeagueMessage", back_populates="league", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index("idx_leagues_location", "location_id"),
    )


class LeagueConfig(Base):
    """Configuration for each league (one-to-one)."""
    __tablename__ = "league_configs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=False, unique=True)
    point_system = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("players.id"), nullable=True)  # Player who created the config
    updated_by = Column(Integer, ForeignKey("players.id"), nullable=True)  # Player who last updated the config
    
    # Relationships
    league = relationship("League", back_populates="config")
    creator = relationship("Player", foreign_keys=[created_by], backref="created_league_configs")
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_league_configs")
    
    __table_args__ = (
        Index("idx_league_configs_league", "league_id"),
    )


class LeagueMember(Base):
    """Join table (Player ↔ League)."""
    __tablename__ = "league_members"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    role = Column(String, default="member", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("players.id"), nullable=True)  # Player who added this member
    
    # Relationships
    league = relationship("League", back_populates="members")
    player = relationship("Player", foreign_keys=[player_id], back_populates="league_memberships")
    creator = relationship("Player", foreign_keys=[created_by], backref="created_league_members")
    
    __table_args__ = (
        UniqueConstraint("league_id", "player_id"),
        Index("idx_league_members_league", "league_id"),
        Index("idx_league_members_player", "player_id"),
    )


class Season(Base):
    """Seasons within leagues."""
    __tablename__ = "seasons"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=False)
    name = Column(String, nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    point_system = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("players.id"), nullable=True)  # Player who created the season
    updated_by = Column(Integer, ForeignKey("players.id"), nullable=True)  # Player who last updated the season
    
    # Relationships
    league = relationship("League", foreign_keys=[league_id], back_populates="seasons")
    sessions = relationship("Session", back_populates="season")
    player_stats = relationship("PlayerSeasonStats", back_populates="season")
    weekly_schedules = relationship("WeeklySchedule", back_populates="season")
    signups = relationship("Signup", back_populates="season")
    creator = relationship("Player", foreign_keys=[created_by], backref="created_seasons")
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_seasons")
    
    __table_args__ = (
        Index("idx_seasons_league", "league_id"),
        Index("idx_seasons_active", "is_active"),
    )


class Court(Base):
    """Court locations."""
    __tablename__ = "courts"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    address = Column(String, nullable=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    geoJson = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("players.id"), nullable=True)  # Player who created the court
    updated_by = Column(Integer, ForeignKey("players.id"), nullable=True)  # Player who last updated the court
    
    # Relationships
    location = relationship("Location", back_populates="courts")
    sessions = relationship("Session", back_populates="court")
    weekly_schedules = relationship("WeeklySchedule", back_populates="court")
    signups = relationship("Signup", back_populates="court")
    creator = relationship("Player", foreign_keys=[created_by], backref="created_courts")
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_courts")
    
    __table_args__ = (
        Index("idx_courts_location", "location_id"),
    )


class Friend(Base):
    """Join table (Player ↔ Player)."""
    __tablename__ = "friends"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    player1_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    player2_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("players.id"), nullable=True)  # Player who initiated the friendship
    
    # Relationships
    creator = relationship("Player", foreign_keys=[created_by], backref="created_friendships")
    
    __table_args__ = (
        UniqueConstraint("player1_id", "player2_id"),
        CheckConstraint("player1_id < player2_id"),
        Index("idx_friends_player1", "player1_id"),
        Index("idx_friends_player2", "player2_id"),
    )


class PlayerSeasonStats(Base):
    """Season-specific player stats."""
    __tablename__ = "player_season_stats"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False)
    current_elo = Column(Float, default=1200.0, nullable=False)
    games = Column(Integer, default=0, nullable=False)
    wins = Column(Integer, default=0, nullable=False)
    points = Column(Integer, default=0, nullable=False)
    win_rate = Column(Float, default=0.0, nullable=False)
    avg_point_diff = Column(Float, default=0.0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    player = relationship("Player", back_populates="season_stats")
    season = relationship("Season", back_populates="player_stats")
    
    __table_args__ = (
        UniqueConstraint("player_id", "season_id"),
        Index("idx_player_season_stats_player", "player_id"),
        Index("idx_player_season_stats_season", "season_id"),
    )


class Session(Base):
    """Gaming sessions grouped by date/time."""
    __tablename__ = "sessions"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(String, nullable=False)  # Using String for date to match existing schema
    name = Column(String, nullable=False)
    status = Column(Enum(SessionStatus), default=SessionStatus.ACTIVE, nullable=False)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=True)
    court_id = Column(Integer, ForeignKey("courts.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("players.id"), nullable=True)  # Player who created the session
    updated_by = Column(Integer, ForeignKey("players.id"), nullable=True)  # Player who last updated/submitted the session
    
    # Relationships
    season = relationship("Season", back_populates="sessions")
    court = relationship("Court", back_populates="sessions")
    matches = relationship("Match", back_populates="session")
    creator = relationship("Player", foreign_keys=[created_by], backref="created_sessions")
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_sessions")
    
    __table_args__ = (
        Index("idx_sessions_date", "date"),
        Index("idx_sessions_status", "status"),
        Index("idx_sessions_season", "season_id"),
        Index("idx_sessions_court", "court_id"),
    )


class Match(Base):
    """All match results."""
    __tablename__ = "matches"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=True)
    date = Column(String, nullable=False)
    team1_player1_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    team1_player2_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    team2_player1_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    team2_player2_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    team1_score = Column(Integer, nullable=False)
    team2_score = Column(Integer, nullable=False)
    winner = Column(Integer, nullable=False)  # 1 = team1, 2 = team2, -1 = tie
    is_public = Column(Boolean, default=True, nullable=False)
    is_ranked = Column(Boolean, default=True, nullable=False)  # Whether match counts toward rankings
    created_by = Column(Integer, ForeignKey("players.id"), nullable=True)  # Player who created the match
    updated_by = Column(Integer, ForeignKey("players.id"), nullable=True)  # Player who last updated the match
    
    # Relationships
    session = relationship("Session", back_populates="matches")
    team1_player1 = relationship("Player", foreign_keys=[team1_player1_id], lazy="select")
    team1_player2 = relationship("Player", foreign_keys=[team1_player2_id], lazy="select")
    team2_player1 = relationship("Player", foreign_keys=[team2_player1_id], lazy="select")
    team2_player2 = relationship("Player", foreign_keys=[team2_player2_id], lazy="select")
    creator = relationship("Player", foreign_keys=[created_by], backref="created_matches")
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_matches")
    
    @property
    def team1_player1_name(self) -> str:
        """Get team1 player1 name."""
        return self.team1_player1.full_name if self.team1_player1 else ""
    
    @property
    def team1_player2_name(self) -> str:
        """Get team1 player2 name."""
        return self.team1_player2.full_name if self.team1_player2 else ""
    
    @property
    def team2_player1_name(self) -> str:
        """Get team2 player1 name."""
        return self.team2_player1.full_name if self.team2_player1 else ""
    
    @property
    def team2_player2_name(self) -> str:
        """Get team2 player2 name."""
        return self.team2_player2.full_name if self.team2_player2 else ""
    
    @property
    def players(self) -> List[List[str]]:
        """Get players as list of teams (for calculation service compatibility)."""
        return [
            [self.team1_player1_name, self.team1_player2_name],
            [self.team2_player1_name, self.team2_player2_name]
        ]
    
    @property
    def original_scores(self) -> List[int]:
        """Get original scores (for calculation service compatibility)."""
        return [self.team1_score, self.team2_score]
    
    __table_args__ = (
        Index("idx_matches_session", "session_id"),
        Index("idx_matches_date", "date"),
        Index("idx_matches_team1_p1", "team1_player1_id"),
        Index("idx_matches_team1_p2", "team1_player2_id"),
        Index("idx_matches_team2_p1", "team2_player1_id"),
        Index("idx_matches_team2_p2", "team2_player2_id"),
    )


class PartnershipStats(Base):
    """How each player performs WITH each partner (global stats)."""
    __tablename__ = "partnership_stats"
    
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    partner_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    games = Column(Integer, default=0, nullable=False)
    wins = Column(Integer, default=0, nullable=False)
    points = Column(Integer, default=0, nullable=False)
    win_rate = Column(Float, default=0.0, nullable=False)
    avg_point_diff = Column(Float, default=0.0, nullable=False)
    
    # Relationships
    player = relationship("Player", foreign_keys=[player_id])
    partner = relationship("Player", foreign_keys=[partner_id])
    
    __table_args__ = (
        Index("idx_partnership_stats_player", "player_id"),
        Index("idx_partnership_stats_partner", "partner_id"),
    )


class OpponentStats(Base):
    """How each player performs AGAINST each opponent (global stats)."""
    __tablename__ = "opponent_stats"
    
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    opponent_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    games = Column(Integer, default=0, nullable=False)
    wins = Column(Integer, default=0, nullable=False)
    points = Column(Integer, default=0, nullable=False)
    win_rate = Column(Float, default=0.0, nullable=False)
    avg_point_diff = Column(Float, default=0.0, nullable=False)
    
    # Relationships
    player = relationship("Player", foreign_keys=[player_id])
    opponent = relationship("Player", foreign_keys=[opponent_id])
    
    __table_args__ = (
        Index("idx_opponent_stats_player", "player_id"),
        Index("idx_opponent_stats_opponent", "opponent_id"),
    )


class EloHistory(Base):
    """Track ELO changes over time for charting (global)."""
    __tablename__ = "elo_history"
    
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=False, primary_key=True)
    date = Column(String, nullable=False)
    elo_after = Column(Float, nullable=False)
    elo_change = Column(Float, nullable=False)
    
    # Relationships
    player = relationship("Player", back_populates="elo_history")
    match = relationship("Match")
    
    __table_args__ = (
        Index("idx_elo_history_player", "player_id"),
        Index("idx_elo_history_match", "match_id"),
    )


class PlayerGlobalStats(Base):
    """Global aggregate stats for each player (across all leagues/seasons)."""
    __tablename__ = "player_global_stats"
    
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    current_rating = Column(Float, default=1200.0, nullable=False)
    total_games = Column(Integer, default=0, nullable=False)
    total_wins = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    player = relationship("Player", back_populates="global_stats")
    
    __table_args__ = (
        Index("idx_player_global_stats_player", "player_id"),
    )


class Setting(Base):
    """Application configuration."""
    __tablename__ = "settings"
    
    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by = Column(Integer, ForeignKey("players.id"), nullable=True)  # Player who last updated the setting
    
    # Relationships
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_settings")


class VerificationCode(Base):
    """SMS verification codes with signup data."""
    __tablename__ = "verification_codes"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    phone_number = Column(String, nullable=False)
    code = Column(String, nullable=False)
    expires_at = Column(String, nullable=False)  # ISO timestamp
    used = Column(Boolean, default=False, nullable=False)
    password_hash = Column(String, nullable=True)
    name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    __table_args__ = (
        Index("idx_verification_codes_phone", "phone_number"),
        Index("idx_verification_codes_expires", "expires_at"),
    )


class RefreshToken(Base):
    """JWT refresh tokens for token rotation."""
    __tablename__ = "refresh_tokens"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String, nullable=False, unique=True)
    expires_at = Column(String, nullable=False)  # ISO timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", back_populates="refresh_tokens")
    
    __table_args__ = (
        Index("idx_refresh_tokens_user", "user_id"),
        Index("idx_refresh_tokens_token", "token"),
        Index("idx_refresh_tokens_expires", "expires_at"),
    )


class PasswordResetToken(Base):
    """Tokens for password reset after verification."""
    __tablename__ = "password_reset_tokens"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String, nullable=False, unique=True)
    expires_at = Column(String, nullable=False)  # ISO timestamp
    used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", back_populates="password_reset_tokens")
    
    __table_args__ = (
        Index("idx_password_reset_tokens_user", "user_id"),
        Index("idx_password_reset_tokens_token", "token"),
        Index("idx_password_reset_tokens_expires", "expires_at"),
    )


class WeeklySchedule(Base):
    """Templates for recurring weekly signups."""
    __tablename__ = "weekly_schedules"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False)
    day_of_week = Column(Integer, nullable=False)  # 0-6, Monday=0
    start_time = Column(String, nullable=False)  # Time as string (HH:MM format)
    duration_hours = Column(Float, default=2.0, nullable=False)
    court_id = Column(Integer, ForeignKey("courts.id"), nullable=True)
    open_signups_mode = Column(Enum(OpenSignupsMode), default=OpenSignupsMode.AUTO_AFTER_LAST_SESSION, nullable=False)
    open_signups_day_of_week = Column(Integer, nullable=True)  # For specific_day_time mode
    open_signups_time = Column(String, nullable=True)  # Time as string (HH:MM format) for specific_day_time mode
    end_date = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("players.id"), nullable=True)
    updated_by = Column(Integer, ForeignKey("players.id"), nullable=True)
    
    # Relationships
    season = relationship("Season", back_populates="weekly_schedules")
    court = relationship("Court", back_populates="weekly_schedules")
    signups = relationship("Signup", back_populates="weekly_schedule")
    creator = relationship("Player", foreign_keys=[created_by], backref="created_weekly_schedules")
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_weekly_schedules")
    
    __table_args__ = (
        Index("idx_weekly_schedules_season", "season_id"),
        Index("idx_weekly_schedules_day", "day_of_week"),
    )


class Signup(Base):
    """Individual signup opportunities."""
    __tablename__ = "signups"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False)
    scheduled_datetime = Column(DateTime(timezone=True), nullable=False)  # UTC
    duration_hours = Column(Float, nullable=False)
    court_id = Column(Integer, ForeignKey("courts.id"), nullable=True)
    open_signups_at = Column(DateTime(timezone=True), nullable=True)  # UTC. NULL means always open
    weekly_schedule_id = Column(Integer, ForeignKey("weekly_schedules.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("players.id"), nullable=True)
    updated_by = Column(Integer, ForeignKey("players.id"), nullable=True)
    
    # Relationships
    season = relationship("Season", back_populates="signups")
    court = relationship("Court", back_populates="signups")
    weekly_schedule = relationship("WeeklySchedule", back_populates="signups")
    players = relationship("SignupPlayer", back_populates="signup", cascade="all, delete-orphan")
    events = relationship("SignupEvent", back_populates="signup", cascade="all, delete-orphan")
    creator = relationship("Player", foreign_keys=[created_by], backref="created_signups")
    updater = relationship("Player", foreign_keys=[updated_by], backref="updated_signups")
    
    __table_args__ = (
        Index("idx_signups_season", "season_id"),
        Index("idx_signups_scheduled_datetime", "scheduled_datetime"),
        Index("idx_signups_open_signups_at", "open_signups_at"),
        Index("idx_signups_weekly_schedule", "weekly_schedule_id"),
    )


class SignupPlayer(Base):
    """Join table for players signed up."""
    __tablename__ = "signup_players"
    
    signup_id = Column(Integer, ForeignKey("signups.id", ondelete="CASCADE"), primary_key=True)
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), primary_key=True)
    signed_up_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)  # UTC
    
    # Relationships
    signup = relationship("Signup", back_populates="players")
    player = relationship("Player", back_populates="signup_registrations")
    
    __table_args__ = (
        UniqueConstraint("signup_id", "player_id"),
        Index("idx_signup_players_signup", "signup_id"),
        Index("idx_signup_players_player", "player_id"),
    )


class SignupEvent(Base):
    """Audit log of signup/dropout actions."""
    __tablename__ = "signup_events"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    signup_id = Column(Integer, ForeignKey("signups.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(Enum(SignupEventType), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)  # UTC
    created_by = Column(Integer, ForeignKey("players.id"), nullable=True)  # For future admin/player signup capabilities
    
    # Relationships
    signup = relationship("Signup", back_populates="events")
    player = relationship("Player", foreign_keys=[player_id], backref="signup_events")
    creator = relationship("Player", foreign_keys=[created_by], backref="created_signup_events")
    
    __table_args__ = (
        Index("idx_signup_events_signup", "signup_id"),
        Index("idx_signup_events_player", "player_id"),
        Index("idx_signup_events_created_at", "created_at"),
    )


class PartnershipStatsSeason(Base):
    """How each player performs WITH each partner (season-specific stats)."""
    __tablename__ = "partnership_stats_season"
    
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    partner_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, primary_key=True)
    games = Column(Integer, default=0, nullable=False)
    wins = Column(Integer, default=0, nullable=False)
    points = Column(Integer, default=0, nullable=False)
    win_rate = Column(Float, default=0.0, nullable=False)
    avg_point_diff = Column(Float, default=0.0, nullable=False)
    
    # Relationships
    player = relationship("Player", foreign_keys=[player_id])
    partner = relationship("Player", foreign_keys=[partner_id])
    season = relationship("Season", foreign_keys=[season_id])
    
    __table_args__ = (
        Index("idx_partnership_stats_season_player", "player_id"),
        Index("idx_partnership_stats_season_partner", "partner_id"),
        Index("idx_partnership_stats_season_season", "season_id"),
    )


class OpponentStatsSeason(Base):
    """How each player performs AGAINST each opponent (season-specific stats)."""
    __tablename__ = "opponent_stats_season"
    
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    opponent_id = Column(Integer, ForeignKey("players.id"), nullable=False, primary_key=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, primary_key=True)
    games = Column(Integer, default=0, nullable=False)
    wins = Column(Integer, default=0, nullable=False)
    points = Column(Integer, default=0, nullable=False)
    win_rate = Column(Float, default=0.0, nullable=False)
    avg_point_diff = Column(Float, default=0.0, nullable=False)
    
    # Relationships
    player = relationship("Player", foreign_keys=[player_id])
    opponent = relationship("Player", foreign_keys=[opponent_id])
    season = relationship("Season", foreign_keys=[season_id])
    
    __table_args__ = (
        Index("idx_opponent_stats_season_player", "player_id"),
        Index("idx_opponent_stats_season_opponent", "opponent_id"),
        Index("idx_opponent_stats_season_season", "season_id"),
    )


class StatsCalculationJobStatus(str, enum.Enum):
    """Stats calculation job status enum."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class StatsCalculationJob(Base):
    """Queue for stats calculation jobs."""
    __tablename__ = "stats_calculation_jobs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    calc_type = Column(String, nullable=False)  # 'global' or 'season'
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=True)
    status = Column(Enum(StatsCalculationJobStatus), default=StatsCalculationJobStatus.PENDING, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)
    
    # Relationships
    season = relationship("Season", foreign_keys=[season_id])
    
    __table_args__ = (
        Index("idx_stats_calculation_jobs_status", "status"),
        Index("idx_stats_calculation_jobs_type_season", "calc_type", "season_id"),
        Index("idx_stats_calculation_jobs_created_at", "created_at"),
    )


class LeagueMessage(Base):
    """League messages/chat."""
    __tablename__ = "league_messages"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    league_id = Column(Integer, ForeignKey("leagues.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message_text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    league = relationship("League", back_populates="messages")
    user = relationship("User")
    
    __table_args__ = (
        Index("idx_league_messages_league_id", "league_id"),
        Index("idx_league_messages_created_at", "created_at"),
    )


class Feedback(Base):
    """User feedback submissions."""
    __tablename__ = "feedback"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Nullable for anonymous feedback
    feedback_text = Column(Text, nullable=False)
    email = Column(String, nullable=True)  # Optional contact email
    is_resolved = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User")
    
    __table_args__ = (
        Index("idx_feedback_created_at", "created_at"),
        Index("idx_feedback_user_id", "user_id"),
    )

