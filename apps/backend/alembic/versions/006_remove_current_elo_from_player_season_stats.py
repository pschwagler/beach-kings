"""remove_current_elo_from_player_season_stats

Revision ID: 006
Revises: 005
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

Remove current_elo column from player_season_stats table.
ELO ratings are now league/season agnostic and stored in player_global_stats.current_rating.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    """Check if a column exists on a table (used for idempotent migrations)."""
    from sqlalchemy import text

    conn = op.get_bind()
    result = conn.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :table AND column_name = :column"
        ),
        {"table": table, "column": column},
    )
    return result.scalar() is not None


def upgrade() -> None:
    # Drop the current_elo column from player_season_stats
    # Guard: column may not exist if create_all() used current models
    if not _column_exists("player_season_stats", "current_elo"):
        return
    op.drop_column("player_season_stats", "current_elo")


def downgrade() -> None:
    # Add back the current_elo column with default value
    op.add_column(
        "player_season_stats",
        sa.Column("current_elo", sa.Float(), nullable=False, server_default="1200.0"),
    )
