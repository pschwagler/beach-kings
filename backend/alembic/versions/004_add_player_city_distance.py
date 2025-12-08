"""add_player_city_distance

Revision ID: 004
Revises: 003
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

Add city, state, and distance_to_location columns to players table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '004'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new columns to players table (only if they don't exist)
    # Use inspector to check existing columns before adding
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [col['name'] for col in inspector.get_columns('players')]
    
    if 'city' not in columns:
        op.add_column('players', sa.Column('city', sa.String(), nullable=True))
    if 'state' not in columns:
        op.add_column('players', sa.Column('state', sa.String(), nullable=True))
    if 'city_latitude' not in columns:
        op.add_column('players', sa.Column('city_latitude', sa.Float(), nullable=True))
    if 'city_longitude' not in columns:
        op.add_column('players', sa.Column('city_longitude', sa.Float(), nullable=True))
    if 'distance_to_location' not in columns:
        op.add_column('players', sa.Column('distance_to_location', sa.Float(), nullable=True))


def downgrade() -> None:
    # Remove columns from players table
    op.drop_column('players', 'distance_to_location')
    op.drop_column('players', 'city_longitude')
    op.drop_column('players', 'city_latitude')
    op.drop_column('players', 'state')
    op.drop_column('players', 'city')


