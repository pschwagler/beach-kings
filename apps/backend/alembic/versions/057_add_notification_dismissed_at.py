"""Add non-destructive notification dismissal state.

Revision ID: 057
Revises: 056
"""

import sqlalchemy as sa
from alembic import op


revision = "057"
down_revision = "056"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notifications",
        sa.Column("dismissed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("notifications", "dismissed_at")
