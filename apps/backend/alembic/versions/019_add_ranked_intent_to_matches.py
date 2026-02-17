"""add_ranked_intent_to_matches

Revision ID: 019
Revises: 018
Create Date: 2026-02-16

Add ranked_intent Boolean column to matches table. Stores the user's
original ranked/unranked choice so that is_ranked (the effective status)
can be recomputed without losing intent after placeholder claims.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "019"
down_revision: Union[str, None] = "018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add ranked_intent column with server default True."""
    op.add_column(
        "matches",
        sa.Column(
            "ranked_intent",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    """Remove ranked_intent column."""
    op.drop_column("matches", "ranked_intent")
