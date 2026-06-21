"""Add push_notification_preferences table for per-user push pref storage.

Revision ID: 053
Revises: 052
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


revision = "053"
down_revision = "052"
branch_labels = None
depends_on = None


def _table_exists(conn, table_name: str) -> bool:
    """Check if a table exists in the public schema."""
    result = conn.execute(
        text(
            "SELECT EXISTS ("
            "  SELECT FROM information_schema.tables"
            "  WHERE table_schema = 'public' AND table_name = :table_name"
            ")"
        ),
        {"table_name": table_name},
    )
    return result.scalar()


def upgrade() -> None:
    """Create push_notification_preferences table (idempotent)."""
    conn = op.get_bind()
    if _table_exists(conn, "push_notification_preferences"):
        return

    op.create_table(
        "push_notification_preferences",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Master kill-switch
        sa.Column("push_enabled", sa.Boolean(), nullable=False, server_default="true"),
        # Per-type toggles
        sa.Column("direct_messages", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("league_messages", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("friend_requests", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("match_invites", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("tournament_updates", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("ranking_changes", sa.Boolean(), nullable=False, server_default="false"),
        # Timestamps
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", name="uq_push_prefs_user_id"),
    )
    op.create_index(
        "idx_push_notification_preferences_user_id",
        "push_notification_preferences",
        ["user_id"],
        unique=True,
    )


def downgrade() -> None:
    """Drop push_notification_preferences table."""
    op.drop_index(
        "idx_push_notification_preferences_user_id",
        table_name="push_notification_preferences",
    )
    op.drop_table("push_notification_preferences")
