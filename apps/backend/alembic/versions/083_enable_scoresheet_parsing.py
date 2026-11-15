"""Seed the scoresheet parsing pause switch, enabled by default.

Revision ID: 083
Revises: 082
"""

from alembic import op
import sqlalchemy as sa

revision = "083"
down_revision = "082"
branch_labels = None
depends_on = None


def upgrade():
    # Preserve an operator's existing choice if the flag was created manually.
    op.execute(
        sa.text("""
        INSERT INTO feature_flags
            (key, description, enabled, rollout_percent, user_ids, platforms, revision)
        VALUES ('scoresheet_parsing', 'Read and review league scoresheets from photos.',
                true, 100, '[]'::json, '["web", "ios", "android"]'::json, 1)
        ON CONFLICT (key) DO NOTHING
    """)
    )


def downgrade():
    # Retain operator configuration and audit history on application rollback.
    pass
