"""add_player_home_courts

Revision ID: 033
Revises: 032
Create Date: 2026-03-03 00:00:00.000000

Add player_home_courts table to associate courts with players.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "033"
down_revision: Union[str, None] = "032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create player_home_courts table (idempotent)."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if "player_home_courts" not in inspector.get_table_names():
        op.create_table(
            "player_home_courts",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("player_id", sa.Integer(), nullable=False),
            sa.Column("court_id", sa.Integer(), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=True,
            ),
            sa.ForeignKeyConstraint(
                ["player_id"], ["players.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["court_id"], ["courts.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "player_id", "court_id", name="uq_player_home_courts_player_court"
            ),
        )
        op.create_index(
            "idx_player_home_courts_player", "player_home_courts", ["player_id"]
        )


def downgrade() -> None:
    """Drop player_home_courts table."""
    op.drop_index("idx_player_home_courts_player", table_name="player_home_courts")
    op.drop_table("player_home_courts")
