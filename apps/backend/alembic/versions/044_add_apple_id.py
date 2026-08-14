"""Add apple_id column to users table for Apple Sign-In.

Revision ID: 044
Revises: 043
"""

import sqlalchemy as sa
from alembic import op


revision = "044"
down_revision = "043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("apple_id", sa.String(), nullable=True),
    )
    op.create_index("idx_users_apple_id", "users", ["apple_id"], unique=True)


def downgrade() -> None:
    op.drop_index("idx_users_apple_id", table_name="users")
    op.drop_column("users", "apple_id")
