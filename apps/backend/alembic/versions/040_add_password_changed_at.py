"""Add password_changed_at column to users table.

Non-destructive migration: adds a nullable TIMESTAMPTZ column to record
when a user last changed their password via the change-password endpoint.
No data migration required.

Revision ID: 040
Revises: 039
"""

import sqlalchemy as sa
from alembic import op


revision = "040"
down_revision = "039"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    """Check whether a column exists on a table (idempotent guard)."""
    bind = op.get_bind()
    insp = sa.inspect(bind)
    columns = [c["name"] for c in insp.get_columns(table)]
    return column in columns


def upgrade() -> None:
    """Add password_changed_at TIMESTAMPTZ NULL to users."""
    if not _column_exists("users", "password_changed_at"):
        op.add_column(
            "users",
            sa.Column(
                "password_changed_at",
                sa.DateTime(timezone=True),
                nullable=True,
            ),
        )


def downgrade() -> None:
    """Drop password_changed_at from users."""
    if _column_exists("users", "password_changed_at"):
        op.drop_column("users", "password_changed_at")
