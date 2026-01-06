"""add_league_stats_tables

Revision ID: 008
Revises: 007
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

Add league-level stats tables: player_league_stats, partnership_stats_league, opponent_stats_league.
These tables store aggregated statistics across all seasons within a league.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect, text

# revision identifiers, used by Alembic.
revision: str = '008'
down_revision: Union[str, None] = '007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, table_name: str) -> bool:
    """Check if a table exists."""
    result = conn.execute(text(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = :table_name)"
    ), {"table_name": table_name})
    return result.scalar()


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    result = conn.execute(text(
        "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = :table_name AND column_name = :column_name)"
    ), {"table_name": table_name, "column_name": column_name})
    return result.scalar()


def _index_exists(conn, index_name: str) -> bool:
    """Check if an index exists."""
    result = conn.execute(text(
        "SELECT EXISTS (SELECT FROM pg_indexes WHERE indexname = :index_name)"
    ), {"index_name": index_name})
    return result.scalar()


def _constraint_exists(conn, constraint_name: str) -> bool:
    """Check if a constraint exists."""
    result = conn.execute(text(
        "SELECT EXISTS (SELECT FROM information_schema.table_constraints WHERE constraint_name = :constraint_name)"
    ), {"constraint_name": constraint_name})
    return result.scalar()


def upgrade() -> None:
    # Get connection to check if tables exist
    conn = op.get_bind()
    
    # Create player_league_stats table if it doesn't exist
    if not _table_exists(conn, 'player_league_stats'):
        op.create_table(
        'player_league_stats',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('player_id', sa.Integer(), nullable=False),
        sa.Column('league_id', sa.Integer(), nullable=False),
        sa.Column('games', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('wins', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('points', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('win_rate', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('avg_point_diff', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ),
        sa.ForeignKeyConstraint(['league_id'], ['leagues.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('player_id', 'league_id', name='uq_player_league_stats_player_league')
        )
        if not _index_exists(conn, 'idx_player_league_stats_player'):
            op.create_index('idx_player_league_stats_player', 'player_league_stats', ['player_id'])
        if not _index_exists(conn, 'idx_player_league_stats_league'):
            op.create_index('idx_player_league_stats_league', 'player_league_stats', ['league_id'])

    # Create partnership_stats_league table if it doesn't exist
    if not _table_exists(conn, 'partnership_stats_league'):
        op.create_table(
        'partnership_stats_league',
        sa.Column('player_id', sa.Integer(), nullable=False),
        sa.Column('partner_id', sa.Integer(), nullable=False),
        sa.Column('league_id', sa.Integer(), nullable=False),
        sa.Column('games', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('wins', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('points', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('win_rate', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('avg_point_diff', sa.Float(), nullable=False, server_default='0.0'),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ),
        sa.ForeignKeyConstraint(['partner_id'], ['players.id'], ),
        sa.ForeignKeyConstraint(['league_id'], ['leagues.id'], ),
        sa.PrimaryKeyConstraint('player_id', 'partner_id', 'league_id')
        )
        if not _index_exists(conn, 'idx_partnership_stats_league_player'):
            op.create_index('idx_partnership_stats_league_player', 'partnership_stats_league', ['player_id'])
        if not _index_exists(conn, 'idx_partnership_stats_league_partner'):
            op.create_index('idx_partnership_stats_league_partner', 'partnership_stats_league', ['partner_id'])
        if not _index_exists(conn, 'idx_partnership_stats_league_league'):
            op.create_index('idx_partnership_stats_league_league', 'partnership_stats_league', ['league_id'])

    # Create opponent_stats_league table if it doesn't exist
    if not _table_exists(conn, 'opponent_stats_league'):
        op.create_table(
        'opponent_stats_league',
        sa.Column('player_id', sa.Integer(), nullable=False),
        sa.Column('opponent_id', sa.Integer(), nullable=False),
        sa.Column('league_id', sa.Integer(), nullable=False),
        sa.Column('games', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('wins', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('points', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('win_rate', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('avg_point_diff', sa.Float(), nullable=False, server_default='0.0'),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ),
        sa.ForeignKeyConstraint(['opponent_id'], ['players.id'], ),
        sa.ForeignKeyConstraint(['league_id'], ['leagues.id'], ),
        sa.PrimaryKeyConstraint('player_id', 'opponent_id', 'league_id')
        )
        if not _index_exists(conn, 'idx_opponent_stats_league_player'):
            op.create_index('idx_opponent_stats_league_player', 'opponent_stats_league', ['player_id'])
        if not _index_exists(conn, 'idx_opponent_stats_league_opponent'):
            op.create_index('idx_opponent_stats_league_opponent', 'opponent_stats_league', ['opponent_id'])
        if not _index_exists(conn, 'idx_opponent_stats_league_league'):
            op.create_index('idx_opponent_stats_league_league', 'opponent_stats_league', ['league_id'])

    # Add league_id to stats_calculation_jobs table if it doesn't exist
    if not _column_exists(conn, 'stats_calculation_jobs', 'league_id'):
        op.add_column('stats_calculation_jobs', sa.Column('league_id', sa.Integer(), nullable=True))
        if not _constraint_exists(conn, 'fk_stats_calculation_jobs_league'):
            op.create_foreign_key('fk_stats_calculation_jobs_league', 'stats_calculation_jobs', 'leagues', ['league_id'], ['id'])
        if not _index_exists(conn, 'idx_stats_calculation_jobs_type_league'):
            op.create_index('idx_stats_calculation_jobs_type_league', 'stats_calculation_jobs', ['calc_type', 'league_id'])
    # Note: season_id column is kept for backward compatibility during migration


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_index('idx_opponent_stats_league_league', table_name='opponent_stats_league')
    op.drop_index('idx_opponent_stats_league_opponent', table_name='opponent_stats_league')
    op.drop_index('idx_opponent_stats_league_player', table_name='opponent_stats_league')
    op.drop_table('opponent_stats_league')
    
    op.drop_index('idx_partnership_stats_league_league', table_name='partnership_stats_league')
    op.drop_index('idx_partnership_stats_league_partner', table_name='partnership_stats_league')
    op.drop_index('idx_partnership_stats_league_player', table_name='partnership_stats_league')
    op.drop_table('partnership_stats_league')
    
    op.drop_index('idx_player_league_stats_league', table_name='player_league_stats')
    op.drop_index('idx_player_league_stats_player', table_name='player_league_stats')
    op.drop_table('player_league_stats')
    
    # Remove league_id from stats_calculation_jobs
    op.drop_index('idx_stats_calculation_jobs_type_league', table_name='stats_calculation_jobs')
    op.drop_constraint('fk_stats_calculation_jobs_league', 'stats_calculation_jobs', type_='foreignkey')
    op.drop_column('stats_calculation_jobs', 'league_id')
