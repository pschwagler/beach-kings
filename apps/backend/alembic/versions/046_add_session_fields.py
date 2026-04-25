"""Add start_time, session_type, max_players, and notes columns to sessions.

These fields support the expanded Create Session form in the mobile app
(P1.8). All columns are nullable and have no default so the migration is
backward-compatible with existing sessions.

Revision ID: 046
Revises: 045
"""

import sqlalchemy as sa
from alembic import op


revision = "046"
down_revision = "045"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    """Return True when `column` already exists in `table`."""
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
    if not _column_exists("sessions", "start_time"):
        op.add_column(
            "sessions",
            sa.Column("start_time", sa.String(), nullable=True),
        )
    if not _column_exists("sessions", "session_type"):
        op.add_column(
            "sessions",
            sa.Column("session_type", sa.String(), nullable=True),
        )
    if not _column_exists("sessions", "max_players"):
        op.add_column(
            "sessions",
            sa.Column("max_players", sa.Integer(), nullable=True),
        )
    if not _column_exists("sessions", "notes"):
        op.add_column(
            "sessions",
            sa.Column("notes", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("sessions", "notes")
    op.drop_column("sessions", "max_players")
    op.drop_column("sessions", "session_type")
    op.drop_column("sessions", "start_time")
