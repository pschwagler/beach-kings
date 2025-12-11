"""add_regions_and_enhance_locations

Revision ID: 003
Revises: 002
Create Date: 2025-12-XX XX:XX:XX.XXXXXX

Add regions table and enhance locations table with new fields from CSV data.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '003'
down_revision: Union[str, None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create regions table (if it doesn't already exist)
    # Note: This table might already exist if Base.metadata.create_all() was called
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()
    
    if 'regions' not in tables:
        op.create_table(
            'regions',
            sa.Column('id', sa.String(), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
    
    # Add constraints/indexes only if they don't exist
    # Use raw SQL with IF NOT EXISTS to avoid transaction aborts
    op.execute(sa.text("""
        DO $$ 
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_regions_name'
            ) THEN
                ALTER TABLE regions ADD CONSTRAINT uq_regions_name UNIQUE (name);
            END IF;
        END $$;
    """))
    
    # Create index if it doesn't exist
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS idx_regions_name ON regions (name);
    """))
    
    # Add new columns to locations table (only if they don't exist)
    columns = [col['name'] for col in inspector.get_columns('locations')]
    
    if 'location_id' not in columns:
        op.add_column('locations', sa.Column('location_id', sa.String(), nullable=True))
    if 'region_id' not in columns:
        op.add_column('locations', sa.Column('region_id', sa.String(), nullable=True))
    if 'tier' not in columns:
        op.add_column('locations', sa.Column('tier', sa.Integer(), nullable=True))
    if 'latitude' not in columns:
        op.add_column('locations', sa.Column('latitude', sa.Float(), nullable=True))
    if 'longitude' not in columns:
        op.add_column('locations', sa.Column('longitude', sa.Float(), nullable=True))
    if 'seasonality' not in columns:
        op.add_column('locations', sa.Column('seasonality', sa.String(), nullable=True))
    if 'radius_miles' not in columns:
        op.add_column('locations', sa.Column('radius_miles', sa.Float(), nullable=True))
    
    # Add foreign key constraint for region_id (must be after regions table is created)
    # Note: This will only work if all existing region_id values are NULL or match existing regions
    # If there's existing data, you may need to populate regions first or set region_id to NULL for existing rows
    op.execute(sa.text("""
        DO $$ 
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_locations_region_id'
            ) THEN
                ALTER TABLE locations 
                ADD CONSTRAINT fk_locations_region_id 
                FOREIGN KEY (region_id) REFERENCES regions(id);
            END IF;
        END $$;
    """))
    
    # Add indexes (only if they don't exist)
    # Use raw SQL with IF NOT EXISTS to avoid transaction aborts
    # Note: unique=True on nullable column allows multiple NULLs in PostgreSQL, which is what we want
    # If there are existing duplicate non-NULL location_id values, this will fail - handle those first
    op.execute(sa.text("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_location_id ON locations (location_id);
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS idx_locations_region_id ON locations (region_id);
    """))


def downgrade() -> None:
    # Drop indexes
    op.drop_index('idx_locations_region_id', table_name='locations')
    op.drop_index('idx_locations_location_id', table_name='locations')
    
    # Drop foreign key constraint
    op.drop_constraint('fk_locations_region_id', 'locations', type_='foreignkey')
    
    # Remove columns from locations table
    op.drop_column('locations', 'radius_miles')
    op.drop_column('locations', 'seasonality')
    op.drop_column('locations', 'longitude')
    op.drop_column('locations', 'latitude')
    op.drop_column('locations', 'tier')
    op.drop_column('locations', 'region_id')
    op.drop_column('locations', 'location_id')
    
    # Drop regions table
    op.drop_index('idx_regions_name', table_name='regions')
    op.drop_constraint('uq_regions_name', 'regions', type_='unique')
    op.drop_table('regions')






