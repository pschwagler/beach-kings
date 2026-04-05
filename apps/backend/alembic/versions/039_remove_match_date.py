"""Remove date column from matches table.

Date is a session-level concern. Every match belongs to a session, and the
session carries the authoritative date. The API always sets Match.date =
Session.date at creation time, so the column is redundant. All read queries
now source date from the joined Session row.

Revision ID: 039
Revises: 038
"""

import sqlalchemy as sa
from alembic import op


revision = "039"
down_revision = "038"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    """Check whether a column exists on a table (SQLite + PostgreSQL)."""
    bind = op.get_bind()
    insp = sa.inspect(bind)
    columns = [c["name"] for c in insp.get_columns(table)]
    return column in columns


def upgrade() -> None:
    # Pre-flight: verify every match with a session has a matching session date.
    bind = op.get_bind()
    orphan_count = bind.execute(
        sa.text(
            """
            SELECT COUNT(*)
            FROM matches m
            LEFT JOIN sessions s ON s.id = m.session_id
            WHERE m.session_id IS NOT NULL AND s.date IS NULL
            """
        )
    ).scalar()
    if orphan_count and orphan_count > 0:
        raise RuntimeError(
            f"Data integrity check failed: {orphan_count} match(es) reference a "
            "session with a NULL date. Fix session data before running this migration."
        )

    # Drop the index on date first (if it exists)
    try:
        op.drop_index("idx_matches_date", table_name="matches")
    except Exception:
        pass  # Index may not exist

    if _column_exists("matches", "date"):
        op.drop_column("matches", "date")


def downgrade() -> None:
    if not _column_exists("matches", "date"):
        op.add_column(
            "matches",
            sa.Column("date", sa.String(), nullable=True),
        )
        # Backfill from session date
        op.execute(
            """
            UPDATE matches
            SET date = sessions.date
            FROM sessions
            WHERE sessions.id = matches.session_id
            """
        )
        op.create_index("idx_matches_date", "matches", ["date"])
