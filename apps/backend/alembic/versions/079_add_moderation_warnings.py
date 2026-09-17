"""Store deliberately player-facing moderation warnings.

Revision ID: 079
Revises: 078
"""

from alembic import op
import sqlalchemy as sa

revision = "079"
down_revision = "078"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "moderation_warnings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "case_id",
            sa.Integer(),
            sa.ForeignKey("moderation_cases.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "player_id",
            sa.Integer(),
            sa.ForeignKey("players.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "idx_moderation_warnings_player", "moderation_warnings", ["player_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("idx_moderation_warnings_player", table_name="moderation_warnings")
    op.drop_table("moderation_warnings")
