"""Backfill league creator metadata from the earliest admin membership.

Revision ID: 077
Revises: 076
"""

import sqlalchemy as sa
from alembic import op


revision = "077"
down_revision = "076"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE leagues AS league
            SET created_by = creator.player_id
            FROM (
                SELECT DISTINCT ON (league_id) league_id, player_id
                FROM league_members
                WHERE role = 'admin'
                ORDER BY league_id, created_at ASC, id ASC
            ) AS creator
            WHERE league.id = creator.league_id
              AND league.created_by IS NULL
            """
        )
    )


def downgrade() -> None:
    # Existing creator metadata predates this migration, so it cannot be
    # distinguished safely from backfilled values during rollback.
    pass
