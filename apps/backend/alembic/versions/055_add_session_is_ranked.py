"""Add is_ranked column to sessions table.

Tracks ranked intent at the session level. Matches created within the
session inherit this value as their ranked_intent. Defaults to true so
all existing sessions remain ranked (preserving historical behaviour).

Revision ID: 055
Revises: 054
"""

import sqlalchemy as sa
from alembic import op


revision = "055"
down_revision = "054"
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
    """Add is_ranked BOOLEAN NOT NULL DEFAULT true to sessions (idempotent)."""
    if not _column_exists("sessions", "is_ranked"):
        op.add_column(
            "sessions",
            sa.Column(
                "is_ranked",
                sa.Boolean(),
                nullable=False,
                server_default="true",
            ),
        )


def downgrade() -> None:
    """Drop is_ranked from sessions."""
    op.drop_column("sessions", "is_ranked")
