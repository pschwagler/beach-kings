"""Keep durable scoresheet import receipts for safe confirmation retries."""

from alembic import op
import sqlalchemy as sa

revision = "084"
down_revision = "083"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("photo_match_jobs", sa.Column("import_result", sa.JSON(), nullable=True))


def downgrade():
    # Receipts must survive code rollbacks to prevent duplicate imports.
    pass
