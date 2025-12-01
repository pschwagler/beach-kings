"""004_remove_signup_order_from_signup_players

Revision ID: 004
Revises: 003
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

Remove signup_order column from signup_players table.
Order will be calculated on frontend based on signed_up_at timestamp.
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
    """Remove signup_order column from signup_players table."""
    op.drop_column('signup_players', 'signup_order')


def downgrade() -> None:
    """Restore signup_order column to signup_players table."""
    op.add_column('signup_players', sa.Column('signup_order', sa.Integer(), nullable=True))

