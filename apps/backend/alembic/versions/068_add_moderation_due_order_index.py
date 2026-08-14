"""Add the moderation queue due-order index."""

from alembic import op

revision = "068"
down_revision = "067"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "idx_moderation_cases_due_order",
        "moderation_cases",
        ["state", "dispositioned_at", "due_at", "created_at", "id"],
    )


def downgrade() -> None:
    op.drop_index("idx_moderation_cases_due_order", table_name="moderation_cases")
