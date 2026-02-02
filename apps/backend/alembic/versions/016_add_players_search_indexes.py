"""Add pg_trgm GIN indexes on players for scalable name search

Revision ID: 016
Revises: 015
Create Date: 2026-02-02

Adds pg_trgm extension and GIN indexes on players.full_name and players.nickname
for efficient ILIKE search at 10k+ scale.
"""
from alembic import op


revision = '016'
down_revision = '015'
branch_labels = None
depends_on = None


def upgrade():
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
    op.execute("DROP INDEX IF EXISTS idx_players_nickname_gin")
    op.execute("DROP INDEX IF EXISTS idx_players_full_name_gin")
    # Do not drop extension pg_trgm; other objects might use it
