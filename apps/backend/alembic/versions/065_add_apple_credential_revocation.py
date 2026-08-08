"""Add encrypted Apple credentials and durable revocation jobs.

Revision ID: 065
Revises: 064
"""

import sqlalchemy as sa
from alembic import op


revision = "065"
down_revision = "064"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("apple_credentials"):
        op.create_table(
            "apple_credentials",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
                unique=True,
            ),
            sa.Column("refresh_token_ciphertext", sa.Text(), nullable=False),
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
        )

    if not inspector.has_table("apple_revocation_jobs"):
        op.create_table(
            "apple_revocation_jobs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("refresh_token_ciphertext", sa.Text(), nullable=False),
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
                name="ck_apple_revocation_jobs_status",
            ),
        )
        op.create_index(
            "idx_apple_revocation_jobs_claim",
            "apple_revocation_jobs",
            ["status", "available_at"],
        )


def downgrade() -> None:
    op.drop_table("apple_revocation_jobs")
    op.drop_table("apple_credentials")
