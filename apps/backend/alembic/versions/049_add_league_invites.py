"""Add league_invites table for admin-initiated player invitations.

Revision ID: 049
Revises: 048
"""

import sqlalchemy as sa
from alembic import op


revision = "049"
down_revision = "048"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "league_invites",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("league_id", sa.Integer(), sa.ForeignKey("leagues.id"), nullable=False),
        sa.Column("player_id", sa.Integer(), sa.ForeignKey("players.id"), nullable=False),
        sa.Column(
            "invited_by_player_id",
            sa.Integer(),
            sa.ForeignKey("players.id"),
            nullable=True,
        ),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("league_id", "player_id", name="uq_league_invite_league_player"),
    )
    op.create_index("idx_league_invites_league_id", "league_invites", ["league_id"])
    op.create_index("idx_league_invites_player_id", "league_invites", ["player_id"])
    op.create_index("idx_league_invites_invited_by", "league_invites", ["invited_by_player_id"])


def downgrade() -> None:
    op.drop_index("idx_league_invites_invited_by", table_name="league_invites")
    op.drop_index("idx_league_invites_player_id", table_name="league_invites")
    op.drop_index("idx_league_invites_league_id", table_name="league_invites")
    op.drop_table("league_invites")
