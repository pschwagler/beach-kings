"""Replace boolean is_public index with partial composite index for SEO queries

Revision ID: 016
Revises: 015
Create Date: 2026-02-12

The single-column boolean index on leagues.is_public has very low selectivity
(most leagues are public). Replace with a partial index on (location_id)
WHERE is_public = true, which directly supports the main query pattern:
"get public leagues at a given location."
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade():
    # Add partial composite index: public leagues by location
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_leagues_public_location
        ON leagues(location_id) WHERE is_public = true
    """)

    # Drop the low-selectivity boolean-only index
    op.execute("DROP INDEX IF EXISTS idx_leagues_is_public")


def downgrade():
    # Restore original boolean index
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_leagues_is_public ON leagues(is_public)"
    )

    # Drop the partial composite index
    op.execute("DROP INDEX IF EXISTS idx_leagues_public_location")
