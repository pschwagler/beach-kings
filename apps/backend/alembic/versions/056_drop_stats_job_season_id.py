"""Drop deprecated season_id from stats_calculation_jobs.

Stats calculation is keyed on (calc_type, league_id); a league job recomputes
every season in the league in one pass. The job-level season_id was a legacy
artifact from when stats were calculated per-season and is no longer read or
written (the calc_type == "season" path has been removed). Dropping the column
also removes its FK to seasons.id automatically.

Revision ID: 056
Revises: 055
"""

import sqlalchemy as sa
from alembic import op


revision = "056"
down_revision = "055"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    """Return True when `column` already exists in `table` (idempotent guard)."""
    bind = op.get_bind()
    result = bind.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    )
    return result.fetchone() is not None


def upgrade() -> None:
    """Drop stats_calculation_jobs.season_id (idempotent)."""
    if _column_exists("stats_calculation_jobs", "season_id"):
        op.drop_column("stats_calculation_jobs", "season_id")


def downgrade() -> None:
    """Re-add the nullable season_id column and its FK to seasons."""
    if not _column_exists("stats_calculation_jobs", "season_id"):
        op.add_column(
            "stats_calculation_jobs",
            sa.Column("season_id", sa.Integer(), nullable=True),
        )
        op.create_foreign_key(
            "stats_calculation_jobs_season_id_fkey",
            "stats_calculation_jobs",
            "seasons",
            ["season_id"],
            ["id"],
        )
