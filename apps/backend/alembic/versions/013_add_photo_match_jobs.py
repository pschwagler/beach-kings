"""Add photo_match_jobs, session code/participants, and players search indexes

Revision ID: 013
Revises: 012
Create Date: 2026-01-20

Squashed: photo_match_jobs (013), PENDING enum (014), session code &
session_participants (015), pg_trgm GIN indexes on players (016).
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '013'
down_revision = '012'
branch_labels = None
depends_on = None


def upgrade():
    # --- 013: photo_match_jobs ---
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'photomatchjobstatus') THEN
                CREATE TYPE photomatchjobstatus AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
            END IF;
        END
        $$;
    """)

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

    op.execute("CREATE INDEX IF NOT EXISTS idx_photo_match_jobs_status ON photo_match_jobs(status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_photo_match_jobs_session ON photo_match_jobs(session_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_photo_match_jobs_created_at ON photo_match_jobs(created_at)")

    # --- 014: ensure PENDING in enum (idempotent for existing DBs) ---
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

    # --- 015: session code and session_participants ---
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

    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_code
        ON sessions(code)
        WHERE code IS NOT NULL
    """)

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

    op.execute("CREATE INDEX IF NOT EXISTS idx_session_participants_session_id ON session_participants(session_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_session_participants_player_id ON session_participants(player_id)")

    # --- 016: pg_trgm GIN indexes on players ---
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_players_full_name_gin
        ON players USING gin (full_name gin_trgm_ops)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_players_nickname_gin
        ON players USING gin (nickname gin_trgm_ops)
    """)


def downgrade():
    # --- 016 ---
    op.execute("DROP INDEX IF EXISTS idx_players_nickname_gin")
    op.execute("DROP INDEX IF EXISTS idx_players_full_name_gin")

    # --- 015 ---
    op.drop_table('session_participants')
    op.drop_index('idx_sessions_code', table_name='sessions')
    op.drop_column('sessions', 'code')

    # --- 013 (014 has no downgrade) ---
    op.drop_index('idx_photo_match_jobs_created_at', table_name='photo_match_jobs')
    op.drop_index('idx_photo_match_jobs_session', table_name='photo_match_jobs')
    op.drop_index('idx_photo_match_jobs_status', table_name='photo_match_jobs')
    op.drop_table('photo_match_jobs')
    op.execute('DROP TYPE photomatchjobstatus')
