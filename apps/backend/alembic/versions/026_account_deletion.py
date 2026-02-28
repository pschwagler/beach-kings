"""account_deletion

Revision ID: 026
Revises: 025
Create Date: 2026-02-27 00:00:00.000000

Add deletion_scheduled_at column to users table for 30-day account deletion.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "026"
down_revision: Union[str, None] = "025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists on a table."""
    result = conn.execute(
        text(
            "SELECT EXISTS ("
            "  SELECT FROM information_schema.columns "
            "  WHERE table_name = :table_name AND column_name = :column_name"
            ")"
        ),
        {"table_name": table_name, "column_name": column_name},
    )
    return result.scalar()


def upgrade() -> None:
    """Add deletion_scheduled_at column and polling index to users table."""
    conn = op.get_bind()

    if _column_exists(conn, "users", "deletion_scheduled_at"):
        return

    op.add_column(
        "users",
        sa.Column("deletion_scheduled_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index(
        "idx_users_deletion_scheduled",
        "users",
        ["deletion_scheduled_at"],
        postgresql_where=text("deletion_scheduled_at IS NOT NULL"),
    )


def downgrade() -> None:
    """Remove deletion_scheduled_at column and index from users table."""
    conn = op.get_bind()
    if _column_exists(conn, "users", "deletion_scheduled_at"):
        op.drop_index("idx_users_deletion_scheduled", table_name="users")
        op.drop_column("users", "deletion_scheduled_at")
