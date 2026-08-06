"""Add installation-scoped push registration and durable delivery jobs.

Revision ID: 061
Revises: 060
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "061"
down_revision = "060"
branch_labels = None
depends_on = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _has_column(table: str, column: str) -> bool:
    return column in {item["name"] for item in _inspector().get_columns(table)}


def _has_index(table: str, name: str) -> bool:
    return name in {item["name"] for item in _inspector().get_indexes(table)}


def upgrade() -> None:
    if not _has_column("device_tokens", "installation_id"):
        op.add_column("device_tokens", sa.Column("installation_id", sa.String(128)))
    if not _has_column("device_tokens", "unregister_secret_hash"):
        op.add_column("device_tokens", sa.Column("unregister_secret_hash", sa.String(64)))
    if not _has_column("device_tokens", "last_registered_at"):
        op.add_column(
            "device_tokens",
            sa.Column(
                "last_registered_at", sa.DateTime(timezone=True), server_default=sa.func.now()
            ),
        )
    if not _has_index("device_tokens", "uq_device_tokens_installation_id"):
        op.create_index(
            "uq_device_tokens_installation_id",
            "device_tokens",
            ["installation_id"],
            unique=True,
        )

    if not _inspector().has_table("push_delivery_jobs"):
        op.create_table(
            "push_delivery_jobs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "device_token_id",
                sa.Integer(),
                sa.ForeignKey("device_tokens.id", ondelete="SET NULL"),
            ),
            sa.Column(
                "notification_id",
                sa.Integer(),
                sa.ForeignKey("notifications.id", ondelete="SET NULL"),
            ),
            sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("idempotency_key", sa.String(255), nullable=False, unique=True),
            sa.Column("status", sa.String(24), nullable=False, server_default="pending"),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "available_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column("claimed_at", sa.DateTime(timezone=True)),
            sa.Column("expo_ticket_id", sa.String(255)),
            sa.Column("last_error_code", sa.String(100)),
            sa.Column("last_error_detail", sa.String(500)),
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
    for name, columns in (
        ("idx_push_delivery_jobs_claim", ["status", "available_at"]),
        ("idx_push_delivery_jobs_ticket", ["expo_ticket_id"]),
        ("idx_push_delivery_jobs_terminal", ["status", "updated_at"]),
    ):
        if not _has_index("push_delivery_jobs", name):
            op.create_index(name, "push_delivery_jobs", columns)


def downgrade() -> None:
    op.drop_table("push_delivery_jobs")
    op.drop_index("uq_device_tokens_installation_id", table_name="device_tokens")
    op.drop_column("device_tokens", "last_registered_at")
    op.drop_column("device_tokens", "unregister_secret_hash")
    op.drop_column("device_tokens", "installation_id")
