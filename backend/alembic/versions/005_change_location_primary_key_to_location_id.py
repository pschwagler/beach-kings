"""change_location_primary_key_to_location_id

Revision ID: 005
Revises: 004
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

Change Location primary key from id (Integer) to id (String, using hub_id from CSV).
Rename players.default_location_id to location_id.
Update all foreign key references in players, leagues, and courts tables to use String type.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = '005'
down_revision: Union[str, None] = '004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    
    # Step 1: Ensure all locations have a location_id (hub_id from CSV)
    # This should already be populated from the seed script, but verify
    op.execute(text("""
        UPDATE locations 
        SET location_id = 'temp_' || id::text 
        WHERE location_id IS NULL
    """))
    
    # Step 2: Update foreign key columns to String type
    # First, we need to map existing integer IDs to location_id strings
    
    # Create a temporary mapping table
    op.execute(text("""
        CREATE TEMP TABLE location_id_mapping AS
        SELECT id AS old_id, location_id AS new_id
        FROM locations
    """))
    
    # Step 3: Update players.default_location_id
    # First, add a temporary column to store the string values
    op.add_column('players', sa.Column('location_id_temp', sa.String(), nullable=True))
    
    # Populate the temporary column with mapped location_id strings
    op.execute(text("""
        UPDATE players p
        SET location_id_temp = (
            SELECT new_id::text
            FROM location_id_mapping m
            WHERE m.old_id = p.default_location_id
        )
        WHERE p.default_location_id IS NOT NULL
    """))
    
    # Drop the old column
    op.drop_constraint('fk_players_default_location_id', 'players', type_='foreignkey', if_exists=True)
    op.drop_column('players', 'default_location_id')
    
    # Rename temporary column to location_id
    op.alter_column('players', 'location_id_temp', new_column_name='location_id')
    
    # Step 4: Update leagues.location_id
    # Add temporary column
    op.add_column('leagues', sa.Column('location_id_temp', sa.String(), nullable=True))
    
    # Populate temporary column
    op.execute(text("""
        UPDATE leagues l
        SET location_id_temp = (
            SELECT new_id::text
            FROM location_id_mapping m
            WHERE m.old_id = l.location_id
        )
        WHERE l.location_id IS NOT NULL
    """))
    
    # Drop old column and rename
    op.drop_column('leagues', 'location_id')
    op.alter_column('leagues', 'location_id_temp', new_column_name='location_id')
    
    # Step 5: Update courts.location_id
    # Add temporary column (nullable first, we'll make it NOT NULL after populating)
    op.add_column('courts', sa.Column('location_id_temp', sa.String(), nullable=True))
    
    # Populate temporary column
    op.execute(text("""
        UPDATE courts c
        SET location_id_temp = (
            SELECT new_id::text
            FROM location_id_mapping m
            WHERE m.old_id = c.location_id
        )
        WHERE c.location_id IS NOT NULL
    """))
    
    # Verify all courts have a mapped location_id (courts.location_id is NOT NULL)
    # This will raise an error if any courts don't have a match
    op.execute(text("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM courts WHERE location_id_temp IS NULL) THEN
                RAISE EXCEPTION 'Some courts have unmapped location_id values';
            END IF;
        END $$;
    """))
    
    # Drop old column and rename
    op.drop_constraint('fk_courts_location_id', 'courts', type_='foreignkey', if_exists=True)
    op.drop_column('courts', 'location_id')
    op.alter_column('courts', 'location_id_temp', new_column_name='location_id')
    
    # Make it NOT NULL
    op.alter_column('courts', 'location_id', nullable=False)
    
    # Step 6: Drop remaining foreign key constraints (players.default_location_id and courts.location_id already dropped)
    op.drop_constraint('fk_players_location_id', 'players', type_='foreignkey', if_exists=True)
    op.drop_constraint('fk_leagues_location_id', 'leagues', type_='foreignkey', if_exists=True)
    
    # Step 7: Make location_id NOT NULL
    op.alter_column('locations', 'location_id',
                    nullable=False,
                    existing_nullable=True)
    
    # Step 8: Drop the old primary key constraint and old id column
    op.drop_constraint('locations_pkey', 'locations', type_='primary')
    op.drop_column('locations', 'id')
    
    # Step 9: Rename location_id to id (now the primary key)
    op.alter_column('locations', 'location_id', new_column_name='id')
    op.create_primary_key('locations_pkey', 'locations', ['id'])
    
    # Step 10: Recreate foreign key constraints pointing to id
    op.create_foreign_key(
        'fk_players_location_id',
        'players', 'locations',
        ['location_id'], ['id']
    )
    
    op.create_foreign_key(
        'fk_leagues_location_id',
        'leagues', 'locations',
        ['location_id'], ['id']
    )
    
    op.create_foreign_key(
        'fk_courts_location_id',
        'courts', 'locations',
        ['location_id'], ['id']
    )
    
    # Step 11: Clean up any temporary ids we created
    op.execute(text("""
        DELETE FROM locations 
        WHERE id LIKE 'temp_%'
    """))


def downgrade() -> None:
    # This is a complex downgrade - we'd need to recreate integer IDs
    # For now, we'll just note that downgrade is not fully supported
    # In practice, you'd need to:
    # 1. Add back id column with autoincrement
    # 2. Populate it with sequential integers
    # 3. Update foreign keys back to integers
    # 4. Change primary key back to id
    # 5. Drop location_id primary key constraint
    
    raise NotImplementedError("Downgrade not implemented - this migration changes primary key structure")







