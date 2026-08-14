"""Add caption column to court_photos.

Adds an optional caption that uploaders can attach to a standalone court
photo. The column is nullable so it is backward-compatible with existing
rows.

Revision ID: 047
Revises: 046
"""

import sqlalchemy as sa
from alembic import op


revision = "047"
down_revision = "046"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    """Return True when `column` already exists in `table`."""
    bind = op.get_bind()
    result = bind.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    )
    return result.fetchone() is not None


def upgrade() -> None:
    if not _column_exists("court_photos", "caption"):
        op.add_column(
            "court_photos",
            sa.Column("caption", sa.String(length=280), nullable=True),
        )


def downgrade() -> None:
    if _column_exists("court_photos", "caption"):
        op.drop_column("court_photos", "caption")
