"""Add PENDING to photomatchjobstatus enum if missing

Revision ID: 014
Revises: 013
Create Date: 2026-01-30

Fixes DBs (e.g. EC2) where the enum was created without PENDING, so INSERT
with status 'PENDING' no longer raises InvalidTextRepresentationError.
"""
from alembic import op
import sqlalchemy as sa


revision = '014'
down_revision = '013'
branch_labels = None
depends_on = None


def upgrade():
    # Add 'PENDING' to photomatchjobstatus only if not already present
    # (idempotent for envs where 013 already created the full enum)
    op.execute("""
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'photomatchjobstatus' AND e.enumlabel = 'PENDING'
          ) THEN
            ALTER TYPE photomatchjobstatus ADD VALUE 'PENDING';
          END IF;
        END
        $$;
    """)


def downgrade():
    # PostgreSQL does not support removing an enum value easily; leave enum as-is.
    pass
