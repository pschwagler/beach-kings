"""Preserve friend-request history and enforce social deduplication.

Revision ID: 058
Revises: 057

This migration never rewrites friend-request rows. It performs a read-only
audit before adding the unordered-pair pending constraint and aborts if manual
recovery would be required.
"""

import sqlalchemy as sa
from alembic import op


revision = "058"
down_revision = "057"
branch_labels = None
depends_on = None


def _pending_duplicate_pairs(conn):
    return (
        conn.execute(
            sa.text(
                """
            SELECT LEAST(sender_player_id, receiver_player_id) AS player1_id,
                   GREATEST(sender_player_id, receiver_player_id) AS player2_id,
                   COUNT(*) AS pending_count
            FROM friend_requests
            WHERE status = 'pending'
            GROUP BY 1, 2
            HAVING COUNT(*) > 1
            ORDER BY pending_count DESC, player1_id, player2_id
            LIMIT 20
            """
            )
        )
        .mappings()
        .all()
    )


def _directional_history_duplicates(conn):
    return (
        conn.execute(
            sa.text(
                """
            SELECT sender_player_id, receiver_player_id, COUNT(*) AS request_count
            FROM friend_requests
            GROUP BY sender_player_id, receiver_player_id
            HAVING COUNT(*) > 1
            ORDER BY request_count DESC, sender_player_id, receiver_player_id
            LIMIT 20
            """
            )
        )
        .mappings()
        .all()
    )


def upgrade() -> None:
    conn = op.get_bind()
    duplicates = _pending_duplicate_pairs(conn)
    if duplicates:
        pairs = ", ".join(
            f"({row['player1_id']}, {row['player2_id']}): {row['pending_count']}"
            for row in duplicates
        )
        raise RuntimeError(
            "Read-only friend-request audit found duplicate pending unordered "
            f"pairs: {pairs}. No rows were changed. Obtain explicit approval "
            "before resolving legacy request history, then rerun this migration."
        )

    op.drop_constraint(
        "uq_friend_request_sender_receiver",
        "friend_requests",
        type_="unique",
    )
    op.create_index(
        "uq_friend_requests_pending_pair",
        "friend_requests",
        [
            sa.text("LEAST(sender_player_id, receiver_player_id)"),
            sa.text("GREATEST(sender_player_id, receiver_player_id)"),
        ],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )

    op.add_column(
        "notifications",
        sa.Column("dedup_key", sa.String(length=255), nullable=True),
    )
    op.create_index(
        "idx_notifications_dedup_key",
        "notifications",
        ["dedup_key"],
        unique=False,
    )
    op.create_index(
        "uq_notifications_user_active_dedup",
        "notifications",
        ["user_id", "dedup_key"],
        unique=True,
        postgresql_where=sa.text("dedup_key IS NOT NULL AND dismissed_at IS NULL"),
    )


def downgrade() -> None:
    conn = op.get_bind()
    duplicates = _directional_history_duplicates(conn)
    if duplicates:
        pairs = ", ".join(
            f"({row['sender_player_id']}, {row['receiver_player_id']}): {row['request_count']}"
            for row in duplicates
        )
        raise RuntimeError(
            "Downgrade would discard the ability to retain repeated request "
            f"history for these directional pairs: {pairs}. No rows were changed."
        )

    op.drop_index("uq_notifications_user_active_dedup", table_name="notifications")
    op.drop_index("idx_notifications_dedup_key", table_name="notifications")
    op.drop_column("notifications", "dedup_key")

    op.drop_index("uq_friend_requests_pending_pair", table_name="friend_requests")
    op.create_unique_constraint(
        "uq_friend_request_sender_receiver",
        "friend_requests",
        ["sender_player_id", "receiver_player_id"],
    )
