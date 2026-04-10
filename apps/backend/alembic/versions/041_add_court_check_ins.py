"""Add court_check_ins table for live presence at courts.

Players can check in to a court; check-ins auto-expire after 4 hours.
Only one active check-in per player per court (unique constraint).

Revision ID: 041
Revises: 040
"""

import sqlalchemy as sa
from alembic import op


revision = "041"
down_revision = "040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "court_check_ins",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "court_id",
            sa.Integer,
            sa.ForeignKey("courts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "player_id",
            sa.Integer,
            sa.ForeignKey("players.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "checked_in_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "court_id", "player_id", name="uq_court_check_ins_court_player"
        ),
    )
    op.create_index("idx_court_check_ins_court", "court_check_ins", ["court_id"])
    op.create_index("idx_court_check_ins_expires", "court_check_ins", ["expires_at"])


def downgrade() -> None:
    op.drop_index("idx_court_check_ins_expires", table_name="court_check_ins")
    op.drop_index("idx_court_check_ins_court", table_name="court_check_ins")
    op.drop_table("court_check_ins")
