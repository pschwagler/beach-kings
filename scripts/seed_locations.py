#!/usr/bin/env python3
"""
Seed database with regions and locations from CSV file.
Reads backend/seed/locations.csv and populates the regions and locations tables.
"""

import asyncio
import csv
import os
import sys
from pathlib import Path

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from sqlalchemy import select
from backend.database.db import AsyncSessionLocal
from backend.database.models import Region, Location


async def seed_locations():
    """Seed regions and locations from CSV file."""
    csv_path = Path(project_root) / "backend" / "seed" / "locations.csv"
    
    if not csv_path.exists():
        print(f"❌ CSV file not found: {csv_path}")
        return
    
    print(f"📖 Reading locations from {csv_path}...")
    
    # Read CSV file
    regions_dict = {}  # Track regions by id
    locations_data = []
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            region_id = row['region_id']
            region_name = row['region']
            
            # Track unique regions
            if region_id not in regions_dict:
                regions_dict[region_id] = region_name
            
            # Collect location data
            locations_data.append({
                'id': row['hub_id'],  # This will be the primary key
                'name': row['display_name'],
                'city': row['center_city'],
                'state': row['state'],
                'region_id': region_id,
                'tier': int(row['tier']) if row['tier'] else None,
                'latitude': float(row['lat']) if row['lat'] else None,
                'longitude': float(row['lng']) if row['lng'] else None,
                'seasonality': row['seasonality'],
                'radius_miles': float(row['radius_miles']) if row['radius_miles'] else None,
            })
    
    print(f"✓ Found {len(regions_dict)} unique regions and {len(locations_data)} locations")
    
    async with AsyncSessionLocal() as session:
        # Seed regions
        print("\n🌍 Seeding regions...")
        regions_created = 0
        regions_existing = 0
        
        for region_id, region_name in regions_dict.items():
            # Check if region already exists
            result = await session.execute(
                select(Region).where(Region.id == region_id)
            )
            existing_region = result.scalar_one_or_none()
            
            if existing_region:
                print(f"   ⏭️  Region already exists: {region_name} ({region_id})")
                regions_existing += 1
            else:
                region = Region(
                    id=region_id,
                    name=region_name
                )
                session.add(region)
                print(f"   ✓ Created region: {region_name} ({region_id})")
                regions_created += 1
        
        await session.commit()
        print(f"✓ Regions: {regions_created} created, {regions_existing} already existed")
        
        # Seed locations
        print("\n📍 Seeding locations...")
        locations_created = 0
        locations_existing = 0
        
        for loc_data in locations_data:
            # Check if location already exists (by id, which is the primary key)
            if loc_data['id']:
                result = await session.execute(
                    select(Location).where(Location.id == loc_data['id'])
                )
                existing_location = result.scalar_one_or_none()
                
                if existing_location:
                    print(f"   ⏭️  Location already exists: {loc_data['name']} ({loc_data['id']})")
                    locations_existing += 1
                    continue
            
            # Create new location
            location = Location(
                id=loc_data['id'],  # Primary key: hub_id from CSV
                name=loc_data['name'],
                city=loc_data['city'],
                state=loc_data['state'],
                country="USA",
                region_id=loc_data['region_id'],
                tier=loc_data['tier'],
                latitude=loc_data['latitude'],
                longitude=loc_data['longitude'],
                seasonality=loc_data['seasonality'],
                radius_miles=loc_data['radius_miles']
            )
            session.add(location)
            print(f"   ✓ Created location: {loc_data['name']} ({loc_data['id']})")
            locations_created += 1
        
        await session.commit()
        print(f"✓ Locations: {locations_created} created, {locations_existing} already existed")
        
        print(f"\n✅ Seeding complete!")
        print(f"   Total regions: {len(regions_dict)}")
        print(f"   Total locations: {len(locations_data)}")


if __name__ == "__main__":
    asyncio.run(seed_locations())
