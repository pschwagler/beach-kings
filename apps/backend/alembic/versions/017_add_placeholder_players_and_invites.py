"""add_placeholder_players_and_invites

Revision ID: 017
Revises: 016
Create Date: 2026-02-15

Add placeholder player support:
- Add is_placeholder and created_by_player_id columns to players table
- Create player_invites table for invite link management
- Insert system "Unknown Player" record for placeholder deletion
- Add PLACEHOLDER_CLAIMED notification type support (string-based, no DDL needed)
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "017"
down_revision: Union[str, None] = "016"
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


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    result = conn.execute(
        text(
            "SELECT EXISTS (SELECT FROM information_schema.columns "
            "WHERE table_name = :table_name AND column_name = :column_name)"
        ),
        {"table_name": table_name, "column_name": column_name},
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
    """Add placeholder player columns, player_invites table, and Unknown Player record."""
    conn = op.get_bind()

    # --- 1. Add columns to players table ---

    if not _column_exists(conn, "players", "is_placeholder"):
        op.add_column(
            "players",
            sa.Column(
                "is_placeholder",
                sa.Boolean(),
                nullable=False,
                server_default="false",
            ),
        )

    if not _column_exists(conn, "players", "created_by_player_id"):
        op.add_column(
            "players",
            sa.Column(
                "created_by_player_id",
                sa.Integer(),
                sa.ForeignKey("players.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )

    # Index for querying placeholders by creator
    if not _index_exists(conn, "idx_players_created_by"):
        op.create_index(
            "idx_players_created_by",
            "players",
            ["created_by_player_id"],
            unique=False,
        )

    # Partial index for finding placeholder players efficiently
    if not _index_exists(conn, "idx_players_placeholders"):
        op.execute(
            "CREATE INDEX idx_players_placeholders ON players(created_by_player_id) "
            "WHERE is_placeholder = true"
        )

    # --- 2. Create player_invites table ---

    if not _table_exists(conn, "player_invites"):
        op.create_table(
            "player_invites",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("player_id", sa.Integer(), nullable=False),
            sa.Column("invite_token", sa.String(64), nullable=False),
            sa.Column("created_by_player_id", sa.Integer(), nullable=False),
            sa.Column("phone_number", sa.String(), nullable=True),
            sa.Column(
                "status",
                sa.String(),
                nullable=False,
                server_default="pending",
            ),
            sa.Column("claimed_by_user_id", sa.Integer(), nullable=True),
            sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(
                ["created_by_player_id"], ["players.id"], ondelete="SET NULL"
            ),
            sa.ForeignKeyConstraint(
                ["claimed_by_user_id"], ["users.id"], ondelete="SET NULL"
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("invite_token", name="uq_player_invites_token"),
            sa.UniqueConstraint("player_id", name="uq_player_invites_player"),
            sa.CheckConstraint(
                "status IN ('pending', 'claimed')",
                name="ck_player_invites_status",
            ),
        )

        # Indexes for efficient lookups
        if not _index_exists(conn, "idx_player_invites_token"):
            op.create_index(
                "idx_player_invites_token",
                "player_invites",
                ["invite_token"],
                unique=True,
            )

        if not _index_exists(conn, "idx_player_invites_player"):
            op.create_index(
                "idx_player_invites_player",
                "player_invites",
                ["player_id"],
                unique=True,
            )

        if not _index_exists(conn, "idx_player_invites_created_by"):
            op.create_index(
                "idx_player_invites_created_by",
                "player_invites",
                ["created_by_player_id"],
                unique=False,
            )

    # --- 3. Insert system "Unknown Player" record ---
    # Only insert if it doesn't already exist

    result = conn.execute(
        text(
            "SELECT id FROM players WHERE full_name = 'Unknown Player' "
            "AND user_id IS NULL AND is_placeholder = false"
        )
    )
    if result.fetchone() is None:
        conn.execute(
            text(
                "INSERT INTO players (full_name, user_id, is_placeholder, status) "
                "VALUES ('Unknown Player', NULL, false, 'system')"
            )
        )


def downgrade() -> None:
    """Remove placeholder player columns, player_invites table, and Unknown Player record."""
    conn = op.get_bind()

    # Remove Unknown Player record
    conn.execute(
        text(
            "DELETE FROM players WHERE full_name = 'Unknown Player' "
            "AND user_id IS NULL AND status = 'system'"
        )
    )

    # Drop player_invites table
    if _table_exists(conn, "player_invites"):
        if _index_exists(conn, "idx_player_invites_created_by"):
            op.drop_index("idx_player_invites_created_by", table_name="player_invites")
        if _index_exists(conn, "idx_player_invites_player"):
            op.drop_index("idx_player_invites_player", table_name="player_invites")
        if _index_exists(conn, "idx_player_invites_token"):
            op.drop_index("idx_player_invites_token", table_name="player_invites")
        op.drop_table("player_invites")

    # Drop player columns
    if _index_exists(conn, "idx_players_placeholders"):
        op.execute("DROP INDEX idx_players_placeholders")
    if _index_exists(conn, "idx_players_created_by"):
        op.drop_index("idx_players_created_by", table_name="players")

    if _column_exists(conn, "players", "created_by_player_id"):
        op.drop_column("players", "created_by_player_id")
    if _column_exists(conn, "players", "is_placeholder"):
        op.drop_column("players", "is_placeholder")
