"""Migrate league gender values to match KoB tournament conventions.

Converts legacy gender strings on the leagues table:
  'male'   → 'mens'
  'female' → 'womens'
  'mixed'  → 'coed'

This aligns the leagues table with the KoB tournament gender vocabulary
and the frontend LeagueGender type ('mens' | 'womens' | 'coed').

Revision ID: 038
Revises: 037
"""

from alembic import op


revision = "038"
down_revision = "037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Convert old gender values to new LeagueGender-compatible values."""
    op.execute(
        """
        UPDATE leagues
        SET gender = CASE gender
            WHEN 'male'   THEN 'mens'
            WHEN 'female' THEN 'womens'
            WHEN 'mixed'  THEN 'coed'
            ELSE gender
        END
        WHERE gender IN ('male', 'female', 'mixed')
        """
    )


def downgrade() -> None:
    """Revert new gender values back to legacy strings."""
    op.execute(
        """
        UPDATE leagues
        SET gender = CASE gender
            WHEN 'mens'   THEN 'male'
            WHEN 'womens' THEN 'female'
            WHEN 'coed'   THEN 'mixed'
            ELSE gender
        END
        WHERE gender IN ('mens', 'womens', 'coed')
        """
    )
