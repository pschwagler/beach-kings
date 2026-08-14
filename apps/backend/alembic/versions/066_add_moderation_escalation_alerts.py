"""Add moderation escalation alerts.

Revision ID: 066
Revises: 065

This migration is intentionally moderation-only. Do not change its behavior
after it has been applied; deleted-player lifecycle state belongs in 067.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "066"
down_revision = "065"
branch_labels = None
depends_on = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _has_column(table: str, column: str) -> bool:
    return column in {item["name"] for item in _inspector().get_columns(table)}


def _has_index(table: str, index: str) -> bool:
    return index in {item["name"] for item in _inspector().get_indexes(table)}


def upgrade() -> None:
    for column in (
        sa.Column("incident_type", sa.String(length=40)),
        sa.Column("urgent_since_at", sa.DateTime(timezone=True)),
        sa.Column("dispositioned_at", sa.DateTime(timezone=True)),
    ):
        if not _has_column("moderation_cases", column.name):
            op.add_column("moderation_cases", column)

    # Existing urgent cases need a stable reminder anchor. Existing substantive
    # decisions cannot be inferred reliably, so disposition remains unset.
    op.execute(
        """
        UPDATE moderation_cases
        SET urgent_since_at = COALESCE(urgent_since_at, created_at)
        WHERE severity = 'urgent' AND urgent_since_at IS NULL
        """
    )

    if not _inspector().has_table("moderation_alert_jobs"):
        op.create_table(
            "moderation_alert_jobs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("idempotency_key", sa.String(length=255), nullable=False, unique=True),
            sa.Column("alert_kind", sa.String(length=40), nullable=False),
            sa.Column(
                "case_id",
                sa.Integer(),
                sa.ForeignKey("moderation_cases.id", ondelete="SET NULL"),
            ),
            sa.Column(
                "payload_json",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "available_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column("claimed_at", sa.DateTime(timezone=True)),
            sa.Column("delivered_at", sa.DateTime(timezone=True)),
            sa.Column("last_error_code", sa.String(length=100)),
            sa.Column("last_error_detail", sa.String(length=500)),
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
                "status IN ('pending', 'processing', 'delivered', 'failed', 'cancelled')",
                name="ck_moderation_alert_jobs_status",
            ),
        )
    for name, columns in (
        ("idx_moderation_alert_jobs_claim", ["status", "available_at"]),
        ("idx_moderation_alert_jobs_terminal", ["status", "updated_at"]),
    ):
        if not _has_index("moderation_alert_jobs", name):
            op.create_index(name, "moderation_alert_jobs", columns)


def downgrade() -> None:
    op.drop_table("moderation_alert_jobs")
    op.drop_column("moderation_cases", "dispositioned_at")
    op.drop_column("moderation_cases", "urgent_since_at")
    op.drop_column("moderation_cases", "incident_type")
