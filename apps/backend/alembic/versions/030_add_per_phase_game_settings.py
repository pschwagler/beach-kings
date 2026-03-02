"""add_per_phase_game_settings

Revision ID: 030
Revises: 029
Create Date: 2026-03-01 00:00:00.000000

Add per-phase playoff settings to kob_tournaments and multi-game/bracket
columns to kob_matches for Bo3 scoring and draft bracket support.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "030"
down_revision: Union[str, None] = "029"
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
    """Add per-phase playoff settings and bracket columns."""
    conn = op.get_bind()

    # -- kob_tournaments: playoff-specific overrides --

    if not _column_exists(conn, "kob_tournaments", "playoff_format"):
        op.add_column(
            "kob_tournaments",
            sa.Column("playoff_format", sa.String(20), nullable=True),
        )

    if not _column_exists(conn, "kob_tournaments", "playoff_game_to"):
        op.add_column(
            "kob_tournaments",
            sa.Column("playoff_game_to", sa.Integer, nullable=True),
        )

    if not _column_exists(conn, "kob_tournaments", "playoff_games_per_match"):
        op.add_column(
            "kob_tournaments",
            sa.Column("playoff_games_per_match", sa.Integer, nullable=True),
        )

    if not _column_exists(conn, "kob_tournaments", "playoff_score_cap"):
        op.add_column(
            "kob_tournaments",
            sa.Column("playoff_score_cap", sa.Integer, nullable=True),
        )

    # -- kob_matches: multi-game scores + bracket position --

    if not _column_exists(conn, "kob_matches", "game_scores"):
        op.add_column(
            "kob_matches",
            sa.Column(
                "game_scores",
                sa.dialects.postgresql.JSONB,
                nullable=True,
            ),
        )

    if not _column_exists(conn, "kob_matches", "bracket_position"):
        op.add_column(
            "kob_matches",
            sa.Column("bracket_position", sa.String(30), nullable=True),
        )


def downgrade() -> None:
    """Remove per-phase playoff settings and bracket columns."""
    conn = op.get_bind()

    if _column_exists(conn, "kob_matches", "bracket_position"):
        op.drop_column("kob_matches", "bracket_position")

    if _column_exists(conn, "kob_matches", "game_scores"):
        op.drop_column("kob_matches", "game_scores")

    if _column_exists(conn, "kob_tournaments", "playoff_score_cap"):
        op.drop_column("kob_tournaments", "playoff_score_cap")

    if _column_exists(conn, "kob_tournaments", "playoff_games_per_match"):
        op.drop_column("kob_tournaments", "playoff_games_per_match")

    if _column_exists(conn, "kob_tournaments", "playoff_game_to"):
        op.drop_column("kob_tournaments", "playoff_game_to")

    if _column_exists(conn, "kob_tournaments", "playoff_format"):
        op.drop_column("kob_tournaments", "playoff_format")
