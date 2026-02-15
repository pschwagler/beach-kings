"""Add is_public to leagues and slug to locations for SEO

Revision ID: 014
Revises: 013
Create Date: 2026-02-11
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade():
    # --- Add is_public to leagues (default true = all existing leagues are public) ---
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'leagues' AND column_name = 'is_public'
            ) THEN
                ALTER TABLE leagues ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT true;
            END IF;
        END
        $$;
    """)

    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_leagues_is_public ON leagues(is_public)"
    )

    # --- Add slug to locations ---
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'locations' AND column_name = 'slug'
            ) THEN
                ALTER TABLE locations ADD COLUMN slug VARCHAR(100);
            END IF;
        END
        $$;
    """)

    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_slug ON locations(slug) WHERE slug IS NOT NULL"
    )

    # --- Populate slugs from city names: "Manhattan Beach" -> "manhattan-beach" ---
    op.execute("""
        UPDATE locations
        SET slug = LOWER(REPLACE(TRIM(city), ' ', '-'))
        WHERE city IS NOT NULL AND slug IS NULL
    """)


def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_locations_slug")
    op.execute("ALTER TABLE locations DROP COLUMN IF EXISTS slug")

    op.execute("DROP INDEX IF EXISTS idx_leagues_is_public")
    op.execute("ALTER TABLE leagues DROP COLUMN IF EXISTS is_public")
