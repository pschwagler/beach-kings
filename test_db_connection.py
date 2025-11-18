#!/usr/bin/env python3
"""Test database connection and basic operations."""

import asyncio
from backend.database import db
from backend.database.models import User, Setting


async def test_connection():
    """Test basic database connection and operations."""
    print("Testing database connection...")
    
    try:
        # Test connection
        async with db.AsyncSessionLocal() as session:
            # Simple query to test connection
            from sqlalchemy import text
            result = await session.execute(text("SELECT 1"))
            print("✅ Database connection successful!")
            
            # Test table creation
            print("\nInitializing database tables...")
            await db.init_database()
            print("✅ Tables created/verified!")
            
            # Test a simple insert/query
            print("\nTesting basic operations...")
            from sqlalchemy import select
            
            test_setting = Setting(key="test_key", value="test_value")
            session.add(test_setting)
            await session.commit()
            
            result = await session.execute(
                select(Setting).where(Setting.key == "test_key")
            )
            setting = result.scalar_one_or_none()
            if setting:
                print(f"✅ Insert/Query test successful! Found: {setting.value}")
                # Cleanup
                await session.delete(setting)
                await session.commit()
            
            print("\n✅ All tests passed!")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_connection())

