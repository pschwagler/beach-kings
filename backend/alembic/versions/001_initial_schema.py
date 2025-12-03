"""001_initial_schema

Revision ID: 001
Revises: 
Create Date: 2025-11-17 17:15:00.000000

Complete consolidated database schema - creates all tables from scratch.
This is the only migration file needed for fresh deployments.

Creates all tables based on current models including:
- Core tables: users, players, locations, courts, leagues, seasons, sessions, matches
- Stats tables: player_season_stats, partnership_stats, opponent_stats, elo_history
- Stats calculation tables: stats_calculation_jobs, partnership_stats_season, opponent_stats_season
- Signup tables: weekly_schedules, signups, signup_players, signup_events
- Supporting tables: friends, league_configs, league_members, league_messages, feedback
- Auth tables: verification_codes, refresh_tokens, password_reset_tokens, settings
- All enum types and indexes
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all tables from scratch."""
    # Import models to register them with Base.metadata
    from backend.database.db import Base
    from backend.database import models  # noqa: F401
    
    # Create all tables - Alembic will handle dependencies automatically
    # This is safe for initial migration since we're starting fresh
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, checkfirst=True)


def downgrade() -> None:
    """Drop all tables."""
    from backend.database.db import Base
    from backend.database import models  # noqa: F401
    
    # Drop all tables
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind, checkfirst=True)
