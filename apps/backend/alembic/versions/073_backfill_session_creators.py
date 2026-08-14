"""Backfill legacy sessions with the designated owner player.

The product owner selected player ID 1 as the creator for sessions imported
before creator attribution was consistently recorded.
"""

import sqlalchemy as sa
from alembic import op

revision = "073"
down_revision = "072"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    unattributed_sessions = connection.execute(
        sa.text("SELECT 1 FROM sessions WHERE created_by IS NULL LIMIT 1")
    ).scalar_one_or_none()
    if unattributed_sessions is None:
        return

    owner_exists = connection.execute(
        sa.text("SELECT 1 FROM players WHERE id = :player_id"),
        {"player_id": 1},
    ).scalar_one_or_none()
    if owner_exists is None:
        raise RuntimeError("Cannot backfill session creators: player ID 1 does not exist")

    connection.execute(
        sa.text(
            """
            UPDATE sessions
            SET created_by = :player_id
            WHERE created_by IS NULL
            """
        ),
        {"player_id": 1},
    )


def downgrade() -> None:
    # The previous NULL creator values cannot be distinguished from sessions
    # genuinely created by player 1, so reversing this data repair is unsafe.
    pass
