"""Convert court_edit_suggestions.changes from Text to JSONB.

JSONB provides native JSON storage with indexing support and
eliminates manual json.dumps/loads in application code.

Revision ID: 021
Revises: 020
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB


revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Convert changes column from Text to JSONB, casting existing JSON strings."""
    op.execute(
        """
        ALTER TABLE court_edit_suggestions
        ALTER COLUMN changes TYPE JSONB
        USING changes::jsonb
        """
    )


def downgrade() -> None:
    """Revert changes column from JSONB back to Text."""
    op.execute(
        """
        ALTER TABLE court_edit_suggestions
        ALTER COLUMN changes TYPE TEXT
        USING changes::text
        """
    )
