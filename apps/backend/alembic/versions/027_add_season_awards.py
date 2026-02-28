"""add_season_awards

Revision ID: 027
Revises: 026
Create Date: 2026-02-28 00:00:00.000000

Add season_awards table and awards_finalized_at column on seasons.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "027"
down_revision: Union[str, None] = "026"
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
    """Add season_awards table and awards_finalized_at column to seasons."""
    conn = op.get_bind()

    # Add awards_finalized_at to seasons
    if not _column_exists(conn, "seasons", "awards_finalized_at"):
        op.add_column(
            "seasons",
            sa.Column("awards_finalized_at", sa.DateTime(timezone=True), nullable=True),
        )

    # Create season_awards table
    if not _table_exists(conn, "season_awards"):
        op.create_table(
            "season_awards",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column(
                "season_id",
                sa.Integer,
                sa.ForeignKey("seasons.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "player_id",
                sa.Integer,
                sa.ForeignKey("players.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("award_type", sa.String(50), nullable=False),
            sa.Column("award_key", sa.String(50), nullable=False),
            sa.Column("rank", sa.Integer, nullable=True),
            sa.Column("value", sa.Float, nullable=True),
            sa.Column("season_name", sa.String, nullable=True),
            sa.Column(
                "league_id",
                sa.Integer,
                sa.ForeignKey("leagues.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
            ),
        )

        # Unique constraint: one award_key per season
        op.create_unique_constraint(
            "uq_season_awards_season_key",
            "season_awards",
            ["season_id", "award_key"],
        )

        # Indexes for common lookups
        op.create_index("idx_season_awards_player", "season_awards", ["player_id"])
        op.create_index("idx_season_awards_season", "season_awards", ["season_id"])
        op.create_index("idx_season_awards_league", "season_awards", ["league_id"])


def downgrade() -> None:
    """Remove season_awards table and awards_finalized_at column."""
    conn = op.get_bind()

    if _table_exists(conn, "season_awards"):
        op.drop_table("season_awards")

    if _column_exists(conn, "seasons", "awards_finalized_at"):
        op.drop_column("seasons", "awards_finalized_at")
