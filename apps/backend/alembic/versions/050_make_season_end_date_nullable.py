"""Make seasons.end_date nullable for open-ended (rolling) seasons.

An open-ended season has ``end_date = NULL`` and stays active until an admin
closes it by setting an end date. Auto-created seasons — seeded on league
creation and on first game when no season is active — use NULL end_date so a
league always has a current season to log games into, with no dead-end "no
active season" error.

Revision ID: 050
Revises: 049
"""

import sqlalchemy as sa
from alembic import op


revision = "050"
down_revision = "049"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "seasons",
        "end_date",
        existing_type=sa.Date(),
        nullable=True,
    )


def downgrade() -> None:
    # Restoring NOT NULL requires every row to have an end_date. Backfill any
    # open-ended seasons with a far-future sentinel so the constraint can be
    # re-applied without data loss.
    op.execute("UPDATE seasons SET end_date = DATE '9999-12-31' WHERE end_date IS NULL")
    op.alter_column(
        "seasons",
        "end_date",
        existing_type=sa.Date(),
        nullable=False,
    )
