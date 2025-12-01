"""003_add_signup_order_to_signup_players

Revision ID: 003
Revises: 002
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

Add signup_order column to signup_players table to track the order in which players signed up.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '003'
down_revision: Union[str, None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add signup_order column to signup_players table."""
    # Add signup_order column (nullable initially for existing data)
    op.add_column('signup_players', sa.Column('signup_order', sa.Integer(), nullable=True))
    
    # For existing data, we'll set signup_order based on signed_up_at timestamp
    # This will be done in a data migration step
    op.execute("""
        WITH ordered_signups AS (
            SELECT 
                signup_id,
                player_id,
                ROW_NUMBER() OVER (PARTITION BY signup_id ORDER BY signed_up_at ASC) as rn
            FROM signup_players
        )
        UPDATE signup_players sp
        SET signup_order = os.rn
        FROM ordered_signups os
        WHERE sp.signup_id = os.signup_id AND sp.player_id = os.player_id
    """)


def downgrade() -> None:
    """Remove signup_order column from signup_players table."""
    op.drop_column('signup_players', 'signup_order')

