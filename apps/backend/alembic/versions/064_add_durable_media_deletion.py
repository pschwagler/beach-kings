"""Add a durable outbox for account-owned S3 media deletion.

Revision ID: 064
Revises: 063
"""

import sqlalchemy as sa
from alembic import op


revision = "064"
down_revision = "063"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table("media_deletion_jobs"):
        op.create_table(
            "media_deletion_jobs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("object_key", sa.String(500), nullable=False, unique=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "available_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column("claimed_at", sa.DateTime(timezone=True)),
            sa.Column("completed_at", sa.DateTime(timezone=True)),
            sa.Column("last_error", sa.String(500)),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.CheckConstraint(
                "status IN ('pending', 'processing', 'completed')",
                name="ck_media_deletion_jobs_status",
            ),
        )
        op.create_index(
            "idx_media_deletion_jobs_claim",
            "media_deletion_jobs",
            ["status", "available_at"],
        )


def downgrade() -> None:
    op.drop_table("media_deletion_jobs")
