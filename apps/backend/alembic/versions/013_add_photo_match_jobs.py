"""Add photo_match_jobs table

Revision ID: 013
Revises: 012
Create Date: 2026-01-20

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '013'
down_revision = '012'
branch_labels = None
depends_on = None


def upgrade():
    # Create enum type for PhotoMatchJobStatus (idempotent)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'photomatchjobstatus') THEN
                CREATE TYPE photomatchjobstatus AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
            END IF;
        END
        $$;
    """)
    
    # Create photo_match_jobs table (idempotent)
    op.execute("""
        CREATE TABLE IF NOT EXISTS photo_match_jobs (
            id SERIAL PRIMARY KEY,
            league_id INTEGER NOT NULL REFERENCES leagues(id),
            session_id VARCHAR NOT NULL,
            status photomatchjobstatus NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            error_message TEXT,
            result_data TEXT
        )
    """)
    
    # Create indexes (idempotent)
    op.execute("CREATE INDEX IF NOT EXISTS idx_photo_match_jobs_status ON photo_match_jobs(status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_photo_match_jobs_session ON photo_match_jobs(session_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_photo_match_jobs_created_at ON photo_match_jobs(created_at)")


def downgrade():
    # Drop indexes
    op.drop_index('idx_photo_match_jobs_created_at', table_name='photo_match_jobs')
    op.drop_index('idx_photo_match_jobs_session', table_name='photo_match_jobs')
    op.drop_index('idx_photo_match_jobs_status', table_name='photo_match_jobs')
    
    # Drop table
    op.drop_table('photo_match_jobs')
    
    # Drop enum type
    op.execute('DROP TYPE photomatchjobstatus')
