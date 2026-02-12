"""Add code column to sessions table

Revision ID: 015
Revises: 014
Create Date: 2026-02-12

The Session model has a `code` column (shareable invite code) but no migration
ever added it to the database. This fixes the mismatch.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'sessions' AND column_name = 'code'
            ) THEN
                ALTER TABLE sessions ADD COLUMN code VARCHAR(12);
            END IF;
        END
        $$;
    """)

    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_code ON sessions(code) WHERE code IS NOT NULL"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_sessions_code")
    op.execute("ALTER TABLE sessions DROP COLUMN IF EXISTS code")
