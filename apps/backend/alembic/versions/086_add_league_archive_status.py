"""Add reversible league archive status.

Revision ID: 086
Revises: 085
"""

import sqlalchemy as sa
from alembic import op

revision = "086"
down_revision = "085"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "leagues",
        sa.Column("is_archived", sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade():
    op.drop_column("leagues", "is_archived")
