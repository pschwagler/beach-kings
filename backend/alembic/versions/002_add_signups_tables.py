"""002_add_signups_tables

Revision ID: 002
Revises: 001
Create Date: 2025-01-27 12:00:00.000000

Add weekly_schedules, signups, signup_players, and signup_events tables.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create signup-related tables."""
    # Create enum types
    op.execute("CREATE TYPE opensignupsmode AS ENUM ('auto_after_last_session', 'specific_day_time', 'always_open')")
    op.execute("CREATE TYPE signupeventtype AS ENUM ('signup', 'dropout')")
    
    # Create weekly_schedules table
    op.create_table(
        'weekly_schedules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('season_id', sa.Integer(), nullable=False),
        sa.Column('day_of_week', sa.Integer(), nullable=False),
        sa.Column('start_time', sa.String(), nullable=False),
        sa.Column('duration_hours', sa.Float(), nullable=False, server_default='2.0'),
        sa.Column('court_id', sa.Integer(), nullable=True),
        sa.Column('open_signups_mode', postgresql.ENUM('auto_after_last_session', 'specific_day_time', 'always_open', name='opensignupsmode'), nullable=False, server_default='auto_after_last_session'),
        sa.Column('open_signups_day_of_week', sa.Integer(), nullable=True),
        sa.Column('open_signups_time', sa.String(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('updated_by', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['court_id'], ['courts.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['players.id'], ),
        sa.ForeignKeyConstraint(['season_id'], ['seasons.id'], ),
        sa.ForeignKeyConstraint(['updated_by'], ['players.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_weekly_schedules_season', 'weekly_schedules', ['season_id'], unique=False)
    op.create_index('idx_weekly_schedules_day', 'weekly_schedules', ['day_of_week'], unique=False)
    
    # Create signups table
    op.create_table(
        'signups',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('season_id', sa.Integer(), nullable=False),
        sa.Column('scheduled_datetime', sa.DateTime(timezone=True), nullable=False),
        sa.Column('duration_hours', sa.Float(), nullable=False),
        sa.Column('court_id', sa.Integer(), nullable=True),
        sa.Column('open_signups_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('weekly_schedule_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('updated_by', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['court_id'], ['courts.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['players.id'], ),
        sa.ForeignKeyConstraint(['season_id'], ['seasons.id'], ),
        sa.ForeignKeyConstraint(['updated_by'], ['players.id'], ),
        sa.ForeignKeyConstraint(['weekly_schedule_id'], ['weekly_schedules.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_signups_season', 'signups', ['season_id'], unique=False)
    op.create_index('idx_signups_scheduled_datetime', 'signups', ['scheduled_datetime'], unique=False)
    op.create_index('idx_signups_open_signups_at', 'signups', ['open_signups_at'], unique=False)
    op.create_index('idx_signups_weekly_schedule', 'signups', ['weekly_schedule_id'], unique=False)
    
    # Create signup_players table
    op.create_table(
        'signup_players',
        sa.Column('signup_id', sa.Integer(), nullable=False),
        sa.Column('player_id', sa.Integer(), nullable=False),
        sa.Column('signed_up_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['signup_id'], ['signups.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('signup_id', 'player_id'),
        sa.UniqueConstraint('signup_id', 'player_id')
    )
    op.create_index('idx_signup_players_signup', 'signup_players', ['signup_id'], unique=False)
    op.create_index('idx_signup_players_player', 'signup_players', ['player_id'], unique=False)
    
    # Create signup_events table
    op.create_table(
        'signup_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('signup_id', sa.Integer(), nullable=False),
        sa.Column('player_id', sa.Integer(), nullable=False),
        sa.Column('event_type', postgresql.ENUM('signup', 'dropout', name='signupeventtype'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['players.id'], ),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['signup_id'], ['signups.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_signup_events_signup', 'signup_events', ['signup_id'], unique=False)
    op.create_index('idx_signup_events_player', 'signup_events', ['player_id'], unique=False)
    op.create_index('idx_signup_events_created_at', 'signup_events', ['created_at'], unique=False)


def downgrade() -> None:
    """Drop signup-related tables."""
    op.drop_index('idx_signup_events_created_at', table_name='signup_events')
    op.drop_index('idx_signup_events_player', table_name='signup_events')
    op.drop_index('idx_signup_events_signup', table_name='signup_events')
    op.drop_table('signup_events')
    op.drop_index('idx_signup_players_player', table_name='signup_players')
    op.drop_index('idx_signup_players_signup', table_name='signup_players')
    op.drop_table('signup_players')
    op.drop_index('idx_signups_weekly_schedule', table_name='signups')
    op.drop_index('idx_signups_open_signups_at', table_name='signups')
    op.drop_index('idx_signups_scheduled_datetime', table_name='signups')
    op.drop_index('idx_signups_season', table_name='signups')
    op.drop_table('signups')
    op.drop_index('idx_weekly_schedules_day', table_name='weekly_schedules')
    op.drop_index('idx_weekly_schedules_season', table_name='weekly_schedules')
    op.drop_table('weekly_schedules')
    
    # Drop enum types
    op.execute("DROP TYPE IF EXISTS signupeventtype")
    op.execute("DROP TYPE IF EXISTS opensignupsmode")

