"""kob_match_player_fk_set_null

Revision ID: 031
Revises: 030
Create Date: 2026-03-02 00:00:00.000000

Make kob_matches player FK columns nullable with ON DELETE SET NULL,
so that player account deletion doesn't fail with FK violations.
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "031"
down_revision: Union[str, None] = "030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The four player FK columns on kob_matches
_FK_COLUMNS = [
    "team1_player1_id",
    "team1_player2_id",
    "team2_player1_id",
    "team2_player2_id",
]


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


def upgrade() -> None:
    """Make player FK columns nullable and add ON DELETE SET NULL."""
    conn = op.get_bind()
    if not _table_exists(conn, "kob_matches"):
        return

    for col in _FK_COLUMNS:
        # Drop existing FK constraint (naming convention: fk_kob_matches_<col>_players)
        # PostgreSQL auto-names them, so find the actual constraint name.
        result = conn.execute(
            text(
                "SELECT constraint_name FROM information_schema.table_constraints tc "
                "JOIN information_schema.constraint_column_usage ccu "
                "  ON tc.constraint_name = ccu.constraint_name "
                "WHERE tc.table_name = 'kob_matches' "
                "  AND tc.constraint_type = 'FOREIGN KEY' "
                "  AND ccu.column_name = 'id' "
                "  AND ccu.table_name = 'players' "
                "  AND tc.constraint_name IN ("
                "    SELECT constraint_name FROM information_schema.key_column_usage "
                "    WHERE table_name = 'kob_matches' AND column_name = :col"
                "  )"
            ),
            {"col": col},
        )
        row = result.fetchone()
        if row:
            constraint_name = row[0]
            op.drop_constraint(constraint_name, "kob_matches", type_="foreignkey")

        # Make column nullable
        op.alter_column("kob_matches", col, nullable=True)

        # Re-create FK with ON DELETE SET NULL
        op.create_foreign_key(
            f"fk_kob_matches_{col}_players",
            "kob_matches",
            "players",
            [col],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    """Revert to NOT NULL with no ondelete clause."""
    conn = op.get_bind()
    if not _table_exists(conn, "kob_matches"):
        return

    for col in _FK_COLUMNS:
        op.drop_constraint(
            f"fk_kob_matches_{col}_players", "kob_matches", type_="foreignkey"
        )
        # Note: ALTER COLUMN SET NOT NULL will fail if any NULLs exist
        op.alter_column("kob_matches", col, nullable=False)
        op.create_foreign_key(
            None, "kob_matches", "players", [col], ["id"]
        )
