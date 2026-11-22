"""Add runtime feature flags and audit history.

Revision ID: 081
Revises: 079
"""

import sqlalchemy as sa
from alembic import op

revision = "081"
down_revision = "079"
branch_labels = None
depends_on = None


def upgrade():
    flags = op.create_table(
        "feature_flags",
        sa.Column("key", sa.String(80), primary_key=True),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("rollout_percent", sa.Integer(), nullable=False),
        sa.Column("user_ids", sa.JSON(), nullable=False),
        sa.Column("platforms", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("rollout_percent BETWEEN 0 AND 100", name="ck_flag_percent"),
    )
    op.create_table(
        "feature_flag_changes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("flag_key", sa.String(80), sa.ForeignKey("feature_flags.key"), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("before", sa.JSON(), nullable=True),
        sa.Column("after", sa.JSON(), nullable=False),
        sa.Column(
            "occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_feature_flag_changes_flag_key", "feature_flag_changes", ["flag_key"])
    op.bulk_insert(
        flags,
        [
            {
                "key": key,
                "description": description,
                "enabled": enabled,
                "rollout_percent": percent,
                "user_ids": op.inline_literal("[]", type_=sa.String()),
                "platforms": op.inline_literal('["web", "ios", "android"]', type_=sa.String()),
                "revision": 1,
            }
            for key, description, enabled, percent in [
                (
                    "kob_tournaments",
                    "Access to existing King/Queen of the Beach tournaments.",
                    True,
                    100,
                ),
                (
                    "kob_tournament_creation",
                    "Create new KOB tournaments; disable to pause creation while preserving existing events.",
                    True,
                    100,
                ),
            ]
        ],
        multiinsert=False,
    )


def downgrade():
    op.drop_table("feature_flag_changes")
    op.drop_table("feature_flags")
