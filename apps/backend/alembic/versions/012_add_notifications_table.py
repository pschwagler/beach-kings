"""add_notifications_table

Revision ID: 012
Revises: 011
Create Date: 2025-01-17 00:00:00.000000

Add notifications table for in-app notification system.
Stores user notifications with read/unread status and flexible metadata.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, table_name: str) -> bool:
    """Check if a table exists."""
    result = conn.execute(
        text(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = :table_name)"
        ),
        {"table_name": table_name},
    )
    return result.scalar()


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    result = conn.execute(
        text(
            "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = :table_name AND column_name = :column_name)"
        ),
        {"table_name": table_name, "column_name": column_name},
    )
    return result.scalar()


def _index_exists(conn, index_name: str) -> bool:
    """Check if an index exists."""
    result = conn.execute(
        text("SELECT EXISTS (SELECT FROM pg_indexes WHERE indexname = :index_name)"),
        {"index_name": index_name},
    )
    return result.scalar()


def upgrade() -> None:
    """Create notifications table with indexes."""
    conn = op.get_bind()

    # Create notifications table if it doesn't exist
    if not _table_exists(conn, "notifications"):
        op.create_table(
            "notifications",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("type", sa.String(), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("data", sa.Text(), nullable=True),
            sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("link_url", sa.String(length=500), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(
                ["user_id"],
                ["users.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
        )

        # Create indexes for efficient queries
        if not _index_exists(conn, "idx_notifications_user_unread"):
            op.create_index(
                "idx_notifications_user_unread",
                "notifications",
                ["user_id", "is_read", "created_at"],
                unique=False,
            )

        if not _index_exists(conn, "idx_notifications_user_created"):
            op.create_index(
                "idx_notifications_user_created",
                "notifications",
                ["user_id", "created_at"],
                unique=False,
            )


def downgrade() -> None:
    """Remove notifications table and indexes."""
    conn = op.get_bind()

    # Drop indexes if they exist
    if _index_exists(conn, "idx_notifications_user_created"):
        op.drop_index("idx_notifications_user_created", table_name="notifications")

    if _index_exists(conn, "idx_notifications_user_unread"):
        op.drop_index("idx_notifications_user_unread", table_name="notifications")

    # Drop table if it exists
    if _table_exists(conn, "notifications"):
        op.drop_table("notifications")
