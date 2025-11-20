"""004_stats_calculation_async

Revision ID: 004
Revises: 003
Create Date: 2025-01-27 14:00:00.000000

Add is_ranked to matches, convert stats tables to composite PKs, add season-specific stats tables, add stats calculation job queue.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '004'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add is_ranked to matches, convert stats tables to composite PKs, add new tables."""
    
    bind = op.get_bind()
    inspector = inspect(bind)
    
    # Add is_ranked column to matches (idempotent)
    if 'is_ranked' not in [col['name'] for col in inspector.get_columns('matches')]:
        op.add_column('matches', sa.Column('is_ranked', sa.Boolean(), nullable=False, server_default='true'))
    
    # Convert elo_history to composite primary key (idempotent)
    elo_history_cols = [col['name'] for col in inspector.get_columns('elo_history')]
    if 'id' in elo_history_cols:
        # Check if it still has the old primary key
        pk_constraint = inspector.get_pk_constraint('elo_history')
        if pk_constraint and 'id' in pk_constraint.get('constrained_columns', []):
            op.drop_constraint('elo_history_pkey', 'elo_history', type_='primary')
            op.drop_column('elo_history', 'id')
            op.create_primary_key('elo_history_pkey', 'elo_history', ['player_id', 'match_id'])
    
    # Convert partnership_stats to composite primary key (idempotent)
    partnership_cols = [col['name'] for col in inspector.get_columns('partnership_stats')]
    if 'id' in partnership_cols:
        pk_constraint = inspector.get_pk_constraint('partnership_stats')
        if pk_constraint and 'id' in pk_constraint.get('constrained_columns', []):
            op.drop_constraint('partnership_stats_pkey', 'partnership_stats', type_='primary')
            op.drop_column('partnership_stats', 'id')
            op.create_primary_key('partnership_stats_pkey', 'partnership_stats', ['player_id', 'partner_id'])
    
    # Convert opponent_stats to composite primary key (idempotent)
    opponent_cols = [col['name'] for col in inspector.get_columns('opponent_stats')]
    if 'id' in opponent_cols:
        pk_constraint = inspector.get_pk_constraint('opponent_stats')
        if pk_constraint and 'id' in pk_constraint.get('constrained_columns', []):
            op.drop_constraint('opponent_stats_pkey', 'opponent_stats', type_='primary')
            op.drop_column('opponent_stats', 'id')
            op.create_primary_key('opponent_stats_pkey', 'opponent_stats', ['player_id', 'opponent_id'])
    
    # Create partnership_stats_season table (idempotent)
    if 'partnership_stats_season' not in inspector.get_table_names():
        op.create_table(
            'partnership_stats_season',
            sa.Column('player_id', sa.Integer(), nullable=False),
            sa.Column('partner_id', sa.Integer(), nullable=False),
            sa.Column('season_id', sa.Integer(), nullable=False),
            sa.Column('games', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('wins', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('points', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('win_rate', sa.Float(), nullable=False, server_default='0.0'),
            sa.Column('avg_point_diff', sa.Float(), nullable=False, server_default='0.0'),
            sa.ForeignKeyConstraint(['player_id'], ['players.id'], ),
            sa.ForeignKeyConstraint(['partner_id'], ['players.id'], ),
            sa.ForeignKeyConstraint(['season_id'], ['seasons.id'], ),
            sa.PrimaryKeyConstraint('player_id', 'partner_id', 'season_id')
        )
        op.create_index('idx_partnership_stats_season_player', 'partnership_stats_season', ['player_id'])
        op.create_index('idx_partnership_stats_season_partner', 'partnership_stats_season', ['partner_id'])
        op.create_index('idx_partnership_stats_season_season', 'partnership_stats_season', ['season_id'])
    else:
        # Table exists, but check if indexes exist
        existing_indexes = [idx['name'] for idx in inspector.get_indexes('partnership_stats_season')]
        if 'idx_partnership_stats_season_player' not in existing_indexes:
            op.create_index('idx_partnership_stats_season_player', 'partnership_stats_season', ['player_id'])
        if 'idx_partnership_stats_season_partner' not in existing_indexes:
            op.create_index('idx_partnership_stats_season_partner', 'partnership_stats_season', ['partner_id'])
        if 'idx_partnership_stats_season_season' not in existing_indexes:
            op.create_index('idx_partnership_stats_season_season', 'partnership_stats_season', ['season_id'])
    
    # Create opponent_stats_season table (idempotent)
    if 'opponent_stats_season' not in inspector.get_table_names():
        op.create_table(
            'opponent_stats_season',
            sa.Column('player_id', sa.Integer(), nullable=False),
            sa.Column('opponent_id', sa.Integer(), nullable=False),
            sa.Column('season_id', sa.Integer(), nullable=False),
            sa.Column('games', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('wins', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('points', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('win_rate', sa.Float(), nullable=False, server_default='0.0'),
            sa.Column('avg_point_diff', sa.Float(), nullable=False, server_default='0.0'),
            sa.ForeignKeyConstraint(['player_id'], ['players.id'], ),
            sa.ForeignKeyConstraint(['opponent_id'], ['players.id'], ),
            sa.ForeignKeyConstraint(['season_id'], ['seasons.id'], ),
            sa.PrimaryKeyConstraint('player_id', 'opponent_id', 'season_id')
        )
        op.create_index('idx_opponent_stats_season_player', 'opponent_stats_season', ['player_id'])
        op.create_index('idx_opponent_stats_season_opponent', 'opponent_stats_season', ['opponent_id'])
        op.create_index('idx_opponent_stats_season_season', 'opponent_stats_season', ['season_id'])
    else:
        # Table exists, but check if indexes exist
        existing_indexes = [idx['name'] for idx in inspector.get_indexes('opponent_stats_season')]
        if 'idx_opponent_stats_season_player' not in existing_indexes:
            op.create_index('idx_opponent_stats_season_player', 'opponent_stats_season', ['player_id'])
        if 'idx_opponent_stats_season_opponent' not in existing_indexes:
            op.create_index('idx_opponent_stats_season_opponent', 'opponent_stats_season', ['opponent_id'])
        if 'idx_opponent_stats_season_season' not in existing_indexes:
            op.create_index('idx_opponent_stats_season_season', 'opponent_stats_season', ['season_id'])
    
    # Create stats_calculation_jobs table (idempotent)
    if 'stats_calculation_jobs' not in inspector.get_table_names():
        # Create enum type if it doesn't exist
        op.execute("""
            DO $$ BEGIN
                CREATE TYPE statscalculationjobstatus AS ENUM ('pending', 'running', 'completed', 'failed');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        """)
        op.create_table(
            'stats_calculation_jobs',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('calc_type', sa.String(), nullable=False),
            sa.Column('season_id', sa.Integer(), nullable=True),
            sa.Column('status', postgresql.ENUM('pending', 'running', 'completed', 'failed', name='statscalculationjobstatus'), nullable=False, server_default='pending'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(['season_id'], ['seasons.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('idx_stats_calculation_jobs_status', 'stats_calculation_jobs', ['status'])
        op.create_index('idx_stats_calculation_jobs_type_season', 'stats_calculation_jobs', ['calc_type', 'season_id'])
        op.create_index('idx_stats_calculation_jobs_created_at', 'stats_calculation_jobs', ['created_at'])
    else:
        # Table exists, but check if indexes exist
        existing_indexes = [idx['name'] for idx in inspector.get_indexes('stats_calculation_jobs')]
        if 'idx_stats_calculation_jobs_status' not in existing_indexes:
            op.create_index('idx_stats_calculation_jobs_status', 'stats_calculation_jobs', ['status'])
        if 'idx_stats_calculation_jobs_type_season' not in existing_indexes:
            op.create_index('idx_stats_calculation_jobs_type_season', 'stats_calculation_jobs', ['calc_type', 'season_id'])
        if 'idx_stats_calculation_jobs_created_at' not in existing_indexes:
            op.create_index('idx_stats_calculation_jobs_created_at', 'stats_calculation_jobs', ['created_at'])


def downgrade() -> None:
    """Revert changes."""
    
    # Drop new tables
    op.drop_index('idx_stats_calculation_jobs_created_at', table_name='stats_calculation_jobs')
    op.drop_index('idx_stats_calculation_jobs_type_season', table_name='stats_calculation_jobs')
    op.drop_index('idx_stats_calculation_jobs_status', table_name='stats_calculation_jobs')
    op.drop_table('stats_calculation_jobs')
    sa.Enum(name='statscalculationjobstatus').drop(op.get_bind(), checkfirst=True)
    
    op.drop_index('idx_opponent_stats_season_season', table_name='opponent_stats_season')
    op.drop_index('idx_opponent_stats_season_opponent', table_name='opponent_stats_season')
    op.drop_index('idx_opponent_stats_season_player', table_name='opponent_stats_season')
    op.drop_table('opponent_stats_season')
    
    op.drop_index('idx_partnership_stats_season_season', table_name='partnership_stats_season')
    op.drop_index('idx_partnership_stats_season_partner', table_name='partnership_stats_season')
    op.drop_index('idx_partnership_stats_season_player', table_name='partnership_stats_season')
    op.drop_table('partnership_stats_season')
    
    # Revert opponent_stats to auto-increment id
    op.drop_constraint('opponent_stats_pkey', 'opponent_stats', type_='primary')
    op.add_column('opponent_stats', sa.Column('id', sa.Integer(), nullable=False, autoincrement=True))
    op.create_primary_key('opponent_stats_pkey', 'opponent_stats', ['id'])
    
    # Revert partnership_stats to auto-increment id
    op.drop_constraint('partnership_stats_pkey', 'partnership_stats', type_='primary')
    op.add_column('partnership_stats', sa.Column('id', sa.Integer(), nullable=False, autoincrement=True))
    op.create_primary_key('partnership_stats_pkey', 'partnership_stats', ['id'])
    
    # Revert elo_history to auto-increment id
    op.drop_constraint('elo_history_pkey', 'elo_history', type_='primary')
    op.add_column('elo_history', sa.Column('id', sa.Integer(), nullable=False, autoincrement=True))
    op.create_primary_key('elo_history_pkey', 'elo_history', ['id'])
    
    # Remove is_ranked column from matches
    op.drop_column('matches', 'is_ranked')

