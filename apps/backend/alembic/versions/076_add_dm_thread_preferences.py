"""Add viewer-owned direct-message thread preferences.

Revision ID: 076
Revises: 075
"""

import sqlalchemy as sa
from alembic import op


revision = "076"
down_revision = "075"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "direct_message_thread_preferences",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "owner_player_id",
            sa.Integer(),
            sa.ForeignKey("players.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "other_player_id",
            sa.Integer(),
            sa.ForeignKey("players.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("hidden_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.UniqueConstraint(
            "owner_player_id", "other_player_id", name="uq_dm_thread_preferences_pair"
        ),
        sa.CheckConstraint(
            "owner_player_id <> other_player_id", name="ck_dm_thread_preferences_not_self"
        ),
    )
    op.create_index(
        "idx_dm_thread_preferences_owner_hidden",
        "direct_message_thread_preferences",
        ["owner_player_id", "hidden_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "idx_dm_thread_preferences_owner_hidden",
        table_name="direct_message_thread_preferences",
    )
    op.drop_table("direct_message_thread_preferences")
