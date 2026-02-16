"""fix_player_invites_created_by_nullable

Revision ID: 018
Revises: 017
Create Date: 2026-02-15

Fix nullable mismatch on player_invites.created_by_player_id:
The FK uses ondelete="SET NULL" but the column was NOT NULL, which would
cause a runtime error if the creator player were ever deleted. Drop the
NOT NULL constraint to match the FK behavior.
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "018"
down_revision: Union[str, None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop NOT NULL on player_invites.created_by_player_id."""
    op.alter_column(
        "player_invites",
        "created_by_player_id",
        existing_type=__import__("sqlalchemy").Integer(),
        nullable=True,
    )


def downgrade() -> None:
    """Restore NOT NULL on player_invites.created_by_player_id."""
    op.alter_column(
        "player_invites",
        "created_by_player_id",
        existing_type=__import__("sqlalchemy").Integer(),
        nullable=False,
    )
