"""add_league_home_courts

Revision ID: 032
Revises: 031
Create Date: 2026-03-03 00:00:00.000000

Add league_home_courts table to associate courts with leagues.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "032"
down_revision: Union[str, None] = "031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create league_home_courts table."""
    op.create_table(
        "league_home_courts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("league_id", sa.Integer(), nullable=False),
        sa.Column("court_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["league_id"], ["leagues.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["court_id"], ["courts.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "league_id", "court_id", name="uq_league_home_courts_league_court"
        ),
    )
    op.create_index(
        "idx_league_home_courts_league", "league_home_courts", ["league_id"]
    )


def downgrade() -> None:
    """Drop league_home_courts table."""
    op.drop_index("idx_league_home_courts_league", table_name="league_home_courts")
    op.drop_table("league_home_courts")
