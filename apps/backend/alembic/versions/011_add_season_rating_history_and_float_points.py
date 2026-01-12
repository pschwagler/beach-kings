"""add_season_rating_history_and_float_points

Revision ID: 011
Revises: 010
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

Add season_rating_history table and change player_season_stats.points to Float.
This allows season ratings to be stored with precision and tracked over time.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = '011'
down_revision: Union[str, None] = '010'
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


def upgrade() -> None:
    """Add season_rating_history table and change points column to Float."""
    conn = op.get_bind()
    
    # Change player_season_stats.points from Integer to Float
    if _column_exists(conn, 'player_season_stats', 'points'):
        # First, convert existing integer values to float
        op.execute(text("""
            ALTER TABLE player_season_stats 
            ALTER COLUMN points TYPE REAL USING points::REAL
        """))
    
    # Create season_rating_history table if it doesn't exist
    if not _table_exists(conn, 'season_rating_history'):
        op.create_table(
            'season_rating_history',
            sa.Column('player_id', sa.Integer(), nullable=False),
            sa.Column('season_id', sa.Integer(), nullable=False),
            sa.Column('match_id', sa.Integer(), nullable=False),
            sa.Column('date', sa.String(), nullable=False),
            sa.Column('rating_after', sa.Float(), nullable=False),
            sa.Column('rating_change', sa.Float(), nullable=False),
            sa.ForeignKeyConstraint(['player_id'], ['players.id'], ),
            sa.ForeignKeyConstraint(['season_id'], ['seasons.id'], ),
            sa.ForeignKeyConstraint(['match_id'], ['matches.id'], ),
            sa.PrimaryKeyConstraint('player_id', 'season_id', 'match_id')
        )
    
    # Create indexes if table exists
    if _table_exists(conn, 'season_rating_history'):
        from sqlalchemy import inspect
        inspector = inspect(conn)
        indexes = [idx['name'] for idx in inspector.get_indexes('season_rating_history')]
        
        if 'idx_season_rating_history_player' not in indexes:
            op.create_index('idx_season_rating_history_player', 'season_rating_history', ['player_id'], unique=False)
        if 'idx_season_rating_history_season' not in indexes:
            op.create_index('idx_season_rating_history_season', 'season_rating_history', ['season_id'], unique=False)
        if 'idx_season_rating_history_match' not in indexes:
            op.create_index('idx_season_rating_history_match', 'season_rating_history', ['match_id'], unique=False)


def downgrade() -> None:
    """Remove season_rating_history table and change points back to Integer."""
    conn = op.get_bind()
    
    # Drop indexes first
    from sqlalchemy import inspect
    inspector = inspect(conn)
    if _table_exists(conn, 'season_rating_history'):
        indexes = [idx['name'] for idx in inspector.get_indexes('season_rating_history')]
        if 'idx_season_rating_history_match' in indexes:
            op.drop_index('idx_season_rating_history_match', table_name='season_rating_history')
        if 'idx_season_rating_history_season' in indexes:
            op.drop_index('idx_season_rating_history_season', table_name='season_rating_history')
        if 'idx_season_rating_history_player' in indexes:
            op.drop_index('idx_season_rating_history_player', table_name='season_rating_history')
    
    # Drop table
    if _table_exists(conn, 'season_rating_history'):
        op.drop_table('season_rating_history')
    
    # Change player_season_stats.points back to Integer (round float values)
    if _column_exists(conn, 'player_season_stats', 'points'):
        op.execute(text("""
            ALTER TABLE player_season_stats 
            ALTER COLUMN points TYPE INTEGER USING ROUND(points)::INTEGER
        """))

