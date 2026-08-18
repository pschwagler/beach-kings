"""Add recoverable leases to durable stats calculation jobs.

Revision ID: 075
Revises: 074
"""

import sqlalchemy as sa
from alembic import op


revision = "075"
down_revision = "074"
branch_labels = None
depends_on = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _has_column(name: str) -> bool:
    return name in {
        column["name"] for column in _inspector().get_columns("stats_calculation_jobs")
    }


def _has_index(name: str) -> bool:
    return name in {index["name"] for index in _inspector().get_indexes("stats_calculation_jobs")}


def _requeue_running_jobs() -> None:
    """Make in-flight work discoverable by whichever queue version starts next."""
    op.execute(
        sa.text(
            """
            UPDATE stats_calculation_jobs
            SET status = 'PENDING',
                started_at = NULL,
                completed_at = NULL,
                available_at = now(),
                lease_expires_at = NULL,
                claim_token = NULL
            WHERE status = 'RUNNING'
            """
        )
    )


def upgrade() -> None:
    columns = (
        sa.Column(
            "available_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True)),
        sa.Column("claim_token", sa.String(36)),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    for column in columns:
        if not _has_column(column.name):
            op.add_column("stats_calculation_jobs", column)

    # Jobs that were RUNNING before leases existed have no expiry and would
    # otherwise be invisible forever. Requeue them after all lease columns exist.
    _requeue_running_jobs()

    if not _has_index("idx_stats_calculation_jobs_claim"):
        op.create_index(
            "idx_stats_calculation_jobs_claim",
            "stats_calculation_jobs",
            ["status", "available_at", "lease_expires_at"],
        )


def downgrade() -> None:
    # The pre-lease worker only discovers PENDING rows. Requeue active leases
    # before removing their ownership metadata so rollback cannot strand work.
    _requeue_running_jobs()

    if _has_index("idx_stats_calculation_jobs_claim"):
        op.drop_index("idx_stats_calculation_jobs_claim", table_name="stats_calculation_jobs")
    for name in ("attempts", "claim_token", "lease_expires_at", "available_at"):
        if _has_column(name):
            op.drop_column("stats_calculation_jobs", name)
