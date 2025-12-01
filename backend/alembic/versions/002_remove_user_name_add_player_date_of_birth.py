"""002_remove_user_name_add_player_date_of_birth

Revision ID: 002
Revises: 001
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

Remove name column from users table and change age to date_of_birth in players table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Remove name from users and change age to date_of_birth in players."""
    # Remove name column from users table
    op.drop_column('users', 'name')
    
    # Change age column to date_of_birth in players table
    # First, add the new date_of_birth column (nullable for existing data)
    op.add_column('players', sa.Column('date_of_birth', sa.Date(), nullable=True))
    
    # Note: We're not migrating existing age data to date_of_birth
    # If you have existing age values, you could add a data migration here
    # For now, we'll just drop the age column
    
    # Drop the old age column
    op.drop_column('players', 'age')


def downgrade() -> None:
    """Restore name to users and change date_of_birth back to age in players."""
    # Restore name column to users table
    op.add_column('users', sa.Column('name', sa.String(), nullable=True))
    
    # Change date_of_birth back to age in players table
    op.add_column('players', sa.Column('age', sa.Integer(), nullable=True))
    
    # Drop the date_of_birth column
    op.drop_column('players', 'date_of_birth')

