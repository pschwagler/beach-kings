"""Add first_name and last_name columns to players table.

Splits the single full_name field into separate first_name/last_name
for reliable abbreviated display formats (e.g. "F. Last", "First L.").
full_name is kept as the canonical display name and stays in sync on writes.

Backfills existing rows by splitting full_name on the first space.

Revision ID: 042
Revises: 041
"""

import sqlalchemy as sa
from alembic import op


revision = "042"
down_revision = "041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add columns as nullable first
    op.add_column("players", sa.Column("first_name", sa.String, nullable=True))
    op.add_column("players", sa.Column("last_name", sa.String, nullable=True))

    # 2. Backfill from existing full_name
    op.execute(
        """
        UPDATE players SET
            first_name = SPLIT_PART(full_name, ' ', 1),
            last_name  = CASE
                WHEN POSITION(' ' IN full_name) > 0
                THEN SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1)
                ELSE ''
            END
        """
    )

    # 3. Set NOT NULL with empty-string server default
    op.alter_column(
        "players", "first_name", nullable=False, server_default=sa.text("''")
    )
    op.alter_column(
        "players", "last_name", nullable=False, server_default=sa.text("''")
    )

    # 4. Index for first_name prefix searches
    op.create_index("idx_players_first_name", "players", ["first_name"])


def downgrade() -> None:
    op.drop_index("idx_players_first_name", table_name="players")
    op.drop_column("players", "last_name")
    op.drop_column("players", "first_name")
