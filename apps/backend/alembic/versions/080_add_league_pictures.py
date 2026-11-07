"""Add bounded member-only league pictures.

Revision ID: 080_league_pictures
Revises: 079
"""

from alembic import op
import sqlalchemy as sa

revision = "080_league_pictures"
down_revision = "079"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "league_pictures",
        sa.Column(
            "league_id",
            sa.Integer(),
            sa.ForeignKey("leagues.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("image_bytes", sa.LargeBinary(), nullable=False),
        sa.Column("revision", sa.String(32), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "length(image_bytes) > 0 AND length(image_bytes) <= 524288",
            name="ck_league_picture_size",
        ),
    )


def downgrade() -> None:
    op.drop_table("league_pictures")
