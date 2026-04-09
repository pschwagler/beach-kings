"""Add device_tokens table for push notification registration.

Stores Expo push tokens per user+device so the backend can deliver
push notifications via the Expo Push API when the user is offline.

Revision ID: 040
Revises: 039
"""

import sqlalchemy as sa
from alembic import op


revision = "040"
down_revision = "039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "device_tokens",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token", sa.String(255), nullable=False),
        sa.Column("platform", sa.String(10), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("token", name="uq_device_tokens_token"),
    )
    op.create_index("idx_device_tokens_user", "device_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_device_tokens_user", table_name="device_tokens")
    op.drop_table("device_tokens")
