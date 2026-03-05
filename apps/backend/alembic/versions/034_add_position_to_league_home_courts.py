"""add_position_to_league_home_courts

Revision ID: 034
Revises: 033
Create Date: 2026-03-03 00:00:00.000000

Add position column to league_home_courts for ordering.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "034"
down_revision: Union[str, None] = "033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add position column to league_home_courts (idempotent)."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c["name"] for c in inspector.get_columns("league_home_courts")]

    if "position" not in columns:
        op.add_column(
            "league_home_courts",
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    """Remove position column from league_home_courts."""
    op.drop_column("league_home_courts", "position")
