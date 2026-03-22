"""remove_is_active_from_seasons

Revision ID: 007
Revises: 006
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

Remove is_active column from seasons table.
Active status is now determined by date ranges (current_date >= start_date AND current_date <= end_date).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    """Check if a column exists on a table (used for idempotent migrations)."""
    from sqlalchemy import text

    conn = op.get_bind()
    result = conn.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :table AND column_name = :column"
        ),
        {"table": table, "column": column},
    )
    return result.scalar() is not None


def upgrade() -> None:
    # Guard: column may not exist if create_all() used current models
    if not _column_exists("seasons", "is_active"):
        return
    # Drop the index on is_active first
    op.drop_index("idx_seasons_active", table_name="seasons")
    # Drop the is_active column from seasons
    op.drop_column("seasons", "is_active")


def downgrade() -> None:
    # Add back the is_active column with default value
    op.add_column(
        "seasons", sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1")
    )
    # Recreate the index
    op.create_index("idx_seasons_active", "seasons", ["is_active"])
