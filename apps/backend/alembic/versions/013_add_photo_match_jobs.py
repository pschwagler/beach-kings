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
    # Create enum type for PhotoMatchJobStatus
    op.execute("CREATE TYPE photomatchjobstatus AS ENUM ('pending', 'running', 'completed', 'failed')")
    
    # Create photo_match_jobs table
    op.create_table(
        'photo_match_jobs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('league_id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.String(), nullable=False),
        sa.Column('status', postgresql.ENUM('pending', 'running', 'completed', 'failed', 
                  name='photomatchjobstatus', create_type=False), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), 
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('result_data', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['league_id'], ['leagues.id']),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index('idx_photo_match_jobs_status', 'photo_match_jobs', ['status'])
    op.create_index('idx_photo_match_jobs_session', 'photo_match_jobs', ['session_id'])
    op.create_index('idx_photo_match_jobs_created_at', 'photo_match_jobs', ['created_at'])


def downgrade():
    # Drop indexes
    op.drop_index('idx_photo_match_jobs_created_at', table_name='photo_match_jobs')
    op.drop_index('idx_photo_match_jobs_session', table_name='photo_match_jobs')
    op.drop_index('idx_photo_match_jobs_status', table_name='photo_match_jobs')
    
    # Drop table
    op.drop_table('photo_match_jobs')
    
    # Drop enum type
    op.execute('DROP TYPE photomatchjobstatus')
