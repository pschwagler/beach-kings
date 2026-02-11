"""add_scoring_system_to_seasons

Revision ID: 010
Revises: 009
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

Add scoring_system text column to seasons table with check constraint.
This allows seasons to use either Points System or Season Rating scoring.
Uses text column instead of enum to avoid enum mapping issues.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    result = conn.execute(
        text(
            "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = :table_name AND column_name = :column_name)"
        ),
        {"table_name": table_name, "column_name": column_name},
    )
    return result.scalar()


def _constraint_exists(conn, constraint_name: str) -> bool:
    """Check if a constraint exists."""
    result = conn.execute(
        text("SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = :constraint_name)"),
        {"constraint_name": constraint_name},
    )
    return result.scalar()


def upgrade() -> None:
    """Add scoring_system column as text with check constraint."""
    conn = op.get_bind()

    # Add scoring_system column to seasons table if it doesn't exist
    if not _column_exists(conn, "seasons", "scoring_system"):
        op.add_column(
            "seasons",
            sa.Column(
                "scoring_system", sa.String(50), nullable=False, server_default="points_system"
            ),
        )

    # Add check constraint to ensure only valid values
    if not _constraint_exists(conn, "check_scoring_system_valid"):
        op.create_check_constraint(
            "check_scoring_system_valid",
            "seasons",
            "scoring_system IN ('points_system', 'season_rating')",
        )

    # Migrate existing point_system data to new JSON format if needed
    # For existing seasons, ensure point_system JSON has the correct structure
    # Use json_build_object (not jsonb_build_object) since column is Text type
    op.execute(
        text("""
        UPDATE seasons 
        SET point_system = json_build_object(
            'type', 'points_system',
            'points_per_win', 3,
            'points_per_loss', 1
        )::text
        WHERE point_system IS NULL OR point_system = ''
    """)
    )


def downgrade() -> None:
    """Remove scoring_system column and constraint."""
    conn = op.get_bind()

    # Drop constraint if it exists
    if _constraint_exists(conn, "check_scoring_system_valid"):
        op.drop_constraint("check_scoring_system_valid", "seasons", type_="check")

    # Remove scoring_system column from seasons table
    if _column_exists(conn, "seasons", "scoring_system"):
        op.drop_column("seasons", "scoring_system")
