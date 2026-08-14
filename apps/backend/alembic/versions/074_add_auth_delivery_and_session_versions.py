"""Add durable auth delivery and revocable session versions.

Revision ID: 074
Revises: 073
"""

import sqlalchemy as sa
from alembic import op


revision = "074"
down_revision = "073"
branch_labels = None
depends_on = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _has_column(table: str, column: str) -> bool:
    return column in {item["name"] for item in _inspector().get_columns(table)}


def _has_index(table: str, name: str) -> bool:
    return name in {item["name"] for item in _inspector().get_indexes(table)}


def upgrade() -> None:
    if not _has_column("users", "session_version"):
        op.add_column(
            "users",
            sa.Column("session_version", sa.Integer(), nullable=False, server_default="0"),
        )
    if not _has_column("refresh_tokens", "session_version"):
        op.add_column(
            "refresh_tokens",
            sa.Column("session_version", sa.Integer(), nullable=False, server_default="0"),
        )

    if not _inspector().has_table("auth_delivery_jobs"):
        op.create_table(
            "auth_delivery_jobs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "verification_code_id",
                sa.Integer(),
                sa.ForeignKey("verification_codes.id", ondelete="CASCADE"),
            ),
            sa.Column("channel", sa.String(10), nullable=False),
            sa.Column("purpose", sa.String(30), nullable=False),
            sa.Column("idempotency_key", sa.String(255), nullable=False, unique=True),
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
            sa.Column("last_error_code", sa.String(100)),
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
            sa.CheckConstraint("channel IN ('sms', 'email')", name="ck_auth_delivery_channel"),
            sa.CheckConstraint(
                "purpose IN ('signup', 'login', 'password_reset', 'phone_add')",
                name="ck_auth_delivery_purpose",
            ),
            sa.CheckConstraint(
                "status IN ('pending', 'processing', 'delivered', 'failed', 'canceled')",
                name="ck_auth_delivery_status",
            ),
        )
    for name, columns in (
        ("idx_auth_delivery_claim", ["status", "available_at"]),
        ("idx_auth_delivery_terminal", ["status", "updated_at"]),
    ):
        if not _has_index("auth_delivery_jobs", name):
            op.create_index(name, "auth_delivery_jobs", columns)


def downgrade() -> None:
    op.drop_table("auth_delivery_jobs")
    op.drop_column("refresh_tokens", "session_version")
    op.drop_column("users", "session_version")
