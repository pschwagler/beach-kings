"""Add league_id FK to sessions for direct league ownership.

Sessions can now belong to a league directly (league_id) in addition to
belonging to a season (season_id). Both columns remain nullable so all
existing sessions and league-less pickup games continue to work unchanged.

Existing rows are backfilled: if a session has a season_id, its league_id
is derived from that season's league_id, giving historical sessions a direct
league reference without data loss.

Revision ID: 052
Revises: 051
"""

import sqlalchemy as sa
from alembic import op


revision = "052"
down_revision = "051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sessions", sa.Column("league_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_sessions_league_id",
        "sessions",
        "leagues",
        ["league_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("idx_sessions_league", "sessions", ["league_id"])
    op.execute(
        sa.text(
            "UPDATE sessions "
            "SET league_id = ("
            "  SELECT league_id FROM seasons WHERE seasons.id = sessions.season_id"
            ") "
            "WHERE season_id IS NOT NULL"
        )
    )


def downgrade() -> None:
    op.drop_index("idx_sessions_league", table_name="sessions")
    op.drop_constraint("fk_sessions_league_id", "sessions", type_="foreignkey")
    op.drop_column("sessions", "league_id")
