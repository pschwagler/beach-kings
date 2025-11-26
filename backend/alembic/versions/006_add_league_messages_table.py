"""add_league_messages_table

Revision ID: 006
Revises: 005
Create Date: 2025-11-25 19:55:54.310363

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '006'
down_revision: Union[str, None] = '005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop old table if it exists (from failed migration with player_id)
    op.execute("DROP TABLE IF EXISTS league_messages CASCADE")
    
    op.create_table(
        'league_messages',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('league_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('message_text', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(['league_id'], ['leagues.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_league_messages_league_id', 'league_messages', ['league_id'], unique=False)
    op.create_index('idx_league_messages_created_at', 'league_messages', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('idx_league_messages_created_at', table_name='league_messages')
    op.drop_index('idx_league_messages_league_id', table_name='league_messages')
    op.drop_table('league_messages')



