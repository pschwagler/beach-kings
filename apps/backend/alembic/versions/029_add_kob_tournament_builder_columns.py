"""add_kob_tournament_builder_columns

Revision ID: 029
Revises: 028
Create Date: 2026-03-01 00:00:00.000000

Add games_per_match, num_rr_cycles, and score_cap columns to kob_tournaments
for the tournament builder feature.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "029"
down_revision: Union[str, None] = "028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists on a table."""
    result = conn.execute(
        text(
            "SELECT EXISTS ("
            "  SELECT FROM information_schema.columns "
            "  WHERE table_name = :table_name AND column_name = :column_name"
            ")"
        ),
        {"table_name": table_name, "column_name": column_name},
    )
    return result.scalar()


def upgrade() -> None:
    """Add tournament builder columns to kob_tournaments."""
    conn = op.get_bind()

    if not _column_exists(conn, "kob_tournaments", "games_per_match"):
        op.add_column(
            "kob_tournaments",
            sa.Column(
                "games_per_match",
                sa.Integer,
                nullable=False,
                server_default="1",
            ),
        )

    if not _column_exists(conn, "kob_tournaments", "num_rr_cycles"):
        op.add_column(
            "kob_tournaments",
            sa.Column(
                "num_rr_cycles",
                sa.Integer,
                nullable=False,
                server_default="1",
            ),
        )

    if not _column_exists(conn, "kob_tournaments", "score_cap"):
        op.add_column(
            "kob_tournaments",
            sa.Column("score_cap", sa.Integer, nullable=True),
        )


def downgrade() -> None:
    """Remove tournament builder columns from kob_tournaments."""
    conn = op.get_bind()

    if _column_exists(conn, "kob_tournaments", "score_cap"):
        op.drop_column("kob_tournaments", "score_cap")

    if _column_exists(conn, "kob_tournaments", "num_rr_cycles"):
        op.drop_column("kob_tournaments", "num_rr_cycles")

    if _column_exists(conn, "kob_tournaments", "games_per_match"):
        op.drop_column("kob_tournaments", "games_per_match")
