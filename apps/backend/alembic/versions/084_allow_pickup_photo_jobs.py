"""Allow owner-scoped pickup photo processing jobs.

Revision ID: 084
Revises: 083
"""

from alembic import op
import sqlalchemy as sa

revision = "084"
down_revision = "083"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("photo_match_jobs", "league_id", existing_type=sa.Integer(), nullable=True)
    op.add_column(
        "photo_match_jobs",
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
    )


def downgrade():
    # Existing pickup jobs and ownership must survive a code rollback.
    pass
