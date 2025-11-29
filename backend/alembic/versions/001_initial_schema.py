"""001_initial_schema

Revision ID: 001
Revises: 
Create Date: 2025-11-17 17:15:00.000000

Initial database schema - creates all tables from scratch.
This consolidated migration includes all schema changes from migrations 001-006:
- Initial schema (users, players, seasons, matches, etc.)
- Signups tables (weekly_schedules, signups, signup_players, signup_events)
- Stats calculation tables (stats_calculation_jobs, partnership_stats_season, opponent_stats_season)
- League messages table
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
