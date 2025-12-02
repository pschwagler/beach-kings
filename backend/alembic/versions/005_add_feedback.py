"""005_add_feedback

Revision ID: 005
Revises: 004
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

Add feedback table for user feedback submissions.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '005'
down_revision: Union[str, None] = '004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add feedback table (idempotent - safe to run multiple times)."""
    conn = op.get_bind()
    inspector = inspect(conn)
    
    # Check if table exists
    if 'feedback' not in inspector.get_table_names():
        op.create_table(
            'feedback',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=True),
            sa.Column('feedback_text', sa.Text(), nullable=False),
            sa.Column('email', sa.String(), nullable=True),
            sa.Column('is_resolved', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
    
    # Check and create indexes if they don't exist
    existing_indexes = [idx['name'] for idx in inspector.get_indexes('feedback')] if 'feedback' in inspector.get_table_names() else []
    
    if 'idx_feedback_created_at' not in existing_indexes:
        op.create_index('idx_feedback_created_at', 'feedback', ['created_at'], unique=False)
    
    if 'idx_feedback_user_id' not in existing_indexes:
        op.create_index('idx_feedback_user_id', 'feedback', ['user_id'], unique=False)


def downgrade() -> None:
    """Remove feedback table."""
    conn = op.get_bind()
    inspector = inspect(conn)
    
    # Only drop if table exists
    if 'feedback' in inspector.get_table_names():
        # Drop indexes first
        existing_indexes = [idx['name'] for idx in inspector.get_indexes('feedback')]
        
        if 'idx_feedback_user_id' in existing_indexes:
            op.drop_index('idx_feedback_user_id', table_name='feedback')
        
        if 'idx_feedback_created_at' in existing_indexes:
            op.drop_index('idx_feedback_created_at', table_name='feedback')
        
        op.drop_table('feedback')

