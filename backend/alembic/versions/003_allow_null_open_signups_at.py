"""003_allow_null_open_signups_at

Revision ID: 003
Revises: 002
Create Date: 2025-01-27 13:00:00.000000

Allow NULL for open_signups_at in signups table. NULL means signups are always open.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '003'
down_revision: Union[str, None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Allow NULL for open_signups_at column."""
    op.alter_column('signups', 'open_signups_at',
                    existing_type=sa.DateTime(timezone=True),
                    nullable=True)


def downgrade() -> None:
    """Revert open_signups_at to NOT NULL."""
    # Set NULL values to current timestamp before making it NOT NULL
    op.execute("UPDATE signups SET open_signups_at = NOW() WHERE open_signups_at IS NULL")
    op.alter_column('signups', 'open_signups_at',
                    existing_type=sa.DateTime(timezone=True),
                    nullable=False)


