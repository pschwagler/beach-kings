"""Add profile_is_private and show_game_history columns to users table.

Both columns are Boolean NOT NULL with a server default of false so
they are backward-compatible: every existing user row gets the safe
default without a data migration.

Revision ID: 054
Revises: 053
"""

import sqlalchemy as sa
from alembic import op


revision = "054"
down_revision = "053"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    """Return True when `column` already exists in `table` (idempotent guard)."""
    bind = op.get_bind()
    result = bind.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    )
    return result.fetchone() is not None


def upgrade() -> None:
    """Add profile_is_private and show_game_history to users (idempotent)."""
    if not _column_exists("users", "profile_is_private"):
        op.add_column(
            "users",
            sa.Column(
                "profile_is_private",
                sa.Boolean(),
                nullable=False,
                server_default="false",
            ),
        )
    if not _column_exists("users", "show_game_history"):
        op.add_column(
            "users",
            sa.Column(
                "show_game_history",
                sa.Boolean(),
                nullable=False,
                server_default="false",
            ),
        )


def downgrade() -> None:
    """Drop privacy columns from users."""
    op.drop_column("users", "show_game_history")
    op.drop_column("users", "profile_is_private")
