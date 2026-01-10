"""add_start_date_to_weekly_schedules

Revision ID: 009
Revises: 008
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

Add start_date column to weekly_schedules table.
This column determines when to start generating signups for the weekly schedule.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = '009'
down_revision: Union[str, None] = '008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    result = conn.execute(text(
        "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = :table_name AND column_name = :column_name)"
    ), {"table_name": table_name, "column_name": column_name})
    return result.scalar()


def upgrade() -> None:
    # Get connection to check if column exists
    conn = op.get_bind()
    
    # Add start_date column to weekly_schedules table if it doesn't exist
    if not _column_exists(conn, 'weekly_schedules', 'start_date'):
        # Add column with a temporary server_default to allow NOT NULL constraint
        op.add_column('weekly_schedules', 
            sa.Column('start_date', sa.Date(), nullable=False, server_default=sa.text('CURRENT_DATE'))
        )
        
        # Update existing records to use season start_date or today, whichever is later
        # This ensures existing schedules have a valid start_date
        conn.execute(text("""
            UPDATE weekly_schedules ws
            SET start_date = GREATEST(
                COALESCE((SELECT start_date FROM seasons WHERE id = ws.season_id), CURRENT_DATE),
                CURRENT_DATE
            )
        """))
        
        # Remove the server_default after setting values
        op.alter_column('weekly_schedules', 'start_date', server_default=None)


def downgrade() -> None:
    # Remove start_date column from weekly_schedules table
    op.drop_column('weekly_schedules', 'start_date')

