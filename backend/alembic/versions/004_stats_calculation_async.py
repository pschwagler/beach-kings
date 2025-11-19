"""004_stats_calculation_async

Revision ID: 004
Revises: 003
Create Date: 2025-01-27 14:00:00.000000

Add is_ranked to matches, convert stats tables to composite PKs, add season-specific stats tables, add stats calculation job queue.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '004'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add is_ranked to matches, convert stats tables to composite PKs, add new tables."""
    
    # Add is_ranked column to matches
    op.add_column('matches', sa.Column('is_ranked', sa.Boolean(), nullable=False, server_default='true'))
    
    # Convert elo_history to composite primary key
    # First, drop the existing primary key and id column
    op.drop_constraint('elo_history_pkey', 'elo_history', type_='primary')
    op.drop_column('elo_history', 'id')
    # Add composite primary key
    op.create_primary_key('elo_history_pkey', 'elo_history', ['player_id', 'match_id'])
    
    # Convert partnership_stats to composite primary key
    op.drop_constraint('partnership_stats_pkey', 'partnership_stats', type_='primary')
    op.drop_column('partnership_stats', 'id')
    op.create_primary_key('partnership_stats_pkey', 'partnership_stats', ['player_id', 'partner_id'])
    
    # Convert opponent_stats to composite primary key
    op.drop_constraint('opponent_stats_pkey', 'opponent_stats', type_='primary')
    op.drop_column('opponent_stats', 'id')
    op.create_primary_key('opponent_stats_pkey', 'opponent_stats', ['player_id', 'opponent_id'])
    
    # Create partnership_stats_season table
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
    
    # Create opponent_stats_season table
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
    
    # Create stats_calculation_jobs table
    op.create_table(
        'stats_calculation_jobs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('calc_type', sa.String(), nullable=False),
        sa.Column('season_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.Enum('pending', 'running', 'completed', 'failed', name='statscalculationjobstatus'), nullable=False, server_default='pending'),
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

