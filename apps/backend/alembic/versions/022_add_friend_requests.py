"""add_friend_requests

Revision ID: 022
Revises: 021
Create Date: 2026-02-15 00:00:00.000000

Add friend_requests table for friend request workflow.
Existing friends table is unchanged.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "022"
down_revision: Union[str, None] = "021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, table_name: str) -> bool:
    """Check if a table exists."""
    result = conn.execute(
        text(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = :table_name)"
        ),
        {"table_name": table_name},
    )
    return result.scalar()


def _index_exists(conn, index_name: str) -> bool:
    """Check if an index exists."""
    result = conn.execute(
        text("SELECT EXISTS (SELECT FROM pg_indexes WHERE indexname = :index_name)"),
        {"index_name": index_name},
    )
    return result.scalar()


def upgrade() -> None:
    """Create friend_requests table with indexes and constraints."""
    conn = op.get_bind()

    if not _table_exists(conn, "friend_requests"):
        op.create_table(
            "friend_requests",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("sender_player_id", sa.Integer(), nullable=False),
            sa.Column("receiver_player_id", sa.Integer(), nullable=False),
            sa.Column(
                "status",
                sa.String(20),
                nullable=False,
                server_default="pending",
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["sender_player_id"], ["players.id"]),
            sa.ForeignKeyConstraint(["receiver_player_id"], ["players.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "sender_player_id",
                "receiver_player_id",
                name="uq_friend_request_sender_receiver",
            ),
        )

        # Index for fast "pending requests for receiver" lookups
        if not _index_exists(conn, "idx_friend_requests_receiver_status"):
            op.create_index(
                "idx_friend_requests_receiver_status",
                "friend_requests",
                ["receiver_player_id", "status"],
                unique=False,
            )

        # Index for sender lookups
        if not _index_exists(conn, "idx_friend_requests_sender"):
            op.create_index(
                "idx_friend_requests_sender",
                "friend_requests",
                ["sender_player_id"],
                unique=False,
            )


def downgrade() -> None:
    """Remove friend_requests table and indexes."""
    conn = op.get_bind()

    if _index_exists(conn, "idx_friend_requests_sender"):
        op.drop_index("idx_friend_requests_sender", table_name="friend_requests")

    if _index_exists(conn, "idx_friend_requests_receiver_status"):
        op.drop_index(
            "idx_friend_requests_receiver_status", table_name="friend_requests"
        )

    if _table_exists(conn, "friend_requests"):
        op.drop_table("friend_requests")
