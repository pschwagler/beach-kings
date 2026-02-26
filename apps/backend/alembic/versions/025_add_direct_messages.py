"""add_direct_messages

Revision ID: 025
Revises: 024
Create Date: 2026-02-25 00:00:00.000000

Add direct_messages table for 1:1 messaging between friends.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "025"
down_revision: Union[str, None] = "024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, table_name: str) -> bool:
    """Check if a table exists."""
    result = conn.execute(
        text(
            "SELECT EXISTS ("
            "  SELECT FROM information_schema.tables "
            "  WHERE table_name = :table_name"
            ")"
        ),
        {"table_name": table_name},
    )
    return result.scalar()


def upgrade() -> None:
    """Create direct_messages table with indexes."""
    conn = op.get_bind()

    if _table_exists(conn, "direct_messages"):
        return

    op.create_table(
        "direct_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sender_player_id", sa.Integer(), nullable=False),
        sa.Column("receiver_player_id", sa.Integer(), nullable=False),
        sa.Column("message_text", sa.Text(), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["sender_player_id"], ["players.id"]),
        sa.ForeignKeyConstraint(["receiver_player_id"], ["players.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # Thread query index: fetch messages between two players ordered by time
    op.create_index(
        "idx_dm_thread",
        "direct_messages",
        ["sender_player_id", "receiver_player_id", "created_at"],
    )

    # Unread messages index: count unread per receiver, conversation list
    op.create_index(
        "idx_dm_receiver_unread",
        "direct_messages",
        ["receiver_player_id", "is_read", "created_at"],
    )

    # Sender conversation list index
    op.create_index(
        "idx_dm_sender_created",
        "direct_messages",
        ["sender_player_id", "created_at"],
    )


def downgrade() -> None:
    """Drop direct_messages table."""
    op.drop_index("idx_dm_sender_created", table_name="direct_messages")
    op.drop_index("idx_dm_receiver_unread", table_name="direct_messages")
    op.drop_index("idx_dm_thread", table_name="direct_messages")
    op.drop_table("direct_messages")
