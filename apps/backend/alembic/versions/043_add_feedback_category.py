"""Add category column to feedback table.

Distinguishes between general feedback and support requests.
Defaults to "feedback" for existing rows.

Revision ID: 043
Revises: 042
"""

import sqlalchemy as sa
from alembic import op


revision = "043"
down_revision = "042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "feedback",
        sa.Column(
            "category",
            sa.String(50),
            nullable=False,
            server_default="feedback",
        ),
    )


def downgrade() -> None:
    op.drop_column("feedback", "category")
