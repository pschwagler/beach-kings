"""005_add_avatar_to_players

Revision ID: 005
Revises: 004
Create Date: 2025-01-27 16:00:00.000000

Add avatar field to players table for storing initials or image URLs.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '005'
down_revision: Union[str, None] = '004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add avatar column to players table."""
    
    bind = op.get_bind()
    inspector = inspect(bind)
    
    # Add avatar column to players (idempotent)
    if 'avatar' not in [col['name'] for col in inspector.get_columns('players')]:
        op.add_column('players', sa.Column('avatar', sa.String(), nullable=True))


def downgrade() -> None:
    """Remove avatar column from players table."""
    
    bind = op.get_bind()
    inspector = inspect(bind)
    
    # Remove avatar column from players (idempotent)
    if 'avatar' in [col['name'] for col in inspector.get_columns('players')]:
        op.drop_column('players', 'avatar')


