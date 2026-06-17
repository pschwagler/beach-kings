"""Enforce at most one open-ended (rolling) season per league.

An open-ended season has ``end_date = NULL``. ``get_or_create_active_season``
creates one only when none is active, but a check-then-create is not atomic:
two simultaneous first-game submissions for the same league could each find no
active season and both insert one. This partial unique index makes the DB the
final arbiter — the loser of the race hits an IntegrityError and re-reads the
winning season instead of creating a duplicate.

Revision ID: 051
Revises: 050
"""

import sqlalchemy as sa
from alembic import op


revision = "051"
down_revision = "050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_seasons_open_per_league",
        "seasons",
        ["league_id"],
        unique=True,
        postgresql_where=sa.text("end_date IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_seasons_open_per_league", table_name="seasons")
