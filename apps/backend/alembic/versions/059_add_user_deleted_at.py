"""Add an irreversible account-deletion marker.

Revision ID: 059
Revises: 058
"""

import sqlalchemy as sa
from alembic import op


revision = "059"
down_revision = "058"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "deleted_at")
