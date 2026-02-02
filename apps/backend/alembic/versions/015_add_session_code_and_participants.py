"""Add session code and session_participants for non-league sessions

Revision ID: 015
Revises: 014
Create Date: 2026-01-30

Adds sessions.code (unique, nullable) for shareable session URLs and
session_participants for invited players (open sessions visibility).
"""
from alembic import op
import sqlalchemy as sa


revision = '015'
down_revision = '014'
branch_labels = None
depends_on = None


def upgrade():
    # Add code column to sessions table (idempotent)
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
    
    # Create unique index on code (idempotent)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_code 
        ON sessions(code) 
        WHERE code IS NOT NULL
    """)

    # Create session_participants table (idempotent)
    op.execute("""
        CREATE TABLE IF NOT EXISTS session_participants (
            id SERIAL PRIMARY KEY,
            session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            invited_by INTEGER REFERENCES players(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_session_participants_session_player UNIQUE (session_id, player_id)
        )
    """)
    
    # Create indexes (idempotent)
    op.execute("CREATE INDEX IF NOT EXISTS idx_session_participants_session_id ON session_participants(session_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_session_participants_player_id ON session_participants(player_id)")


def downgrade():
    op.drop_table('session_participants')
    op.drop_index('idx_sessions_code', table_name='sessions')
    op.drop_column('sessions', 'code')
