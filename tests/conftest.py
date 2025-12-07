"""
Shared pytest configuration for root-level tests.

Uses PostgreSQL for consistency with production environment.
"""

import os
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from backend.database.db import Base

# Test database configuration
# Use TEST_DATABASE_URL if provided, otherwise use main DATABASE_URL
# If using same database as production, tests will truncate tables for isolation
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    os.getenv(
        "DATABASE_URL",
        f"postgresql+asyncpg://{os.getenv('POSTGRES_USER', 'beachkings')}:{os.getenv('POSTGRES_PASSWORD', 'beachkings')}@{os.getenv('POSTGRES_HOST', 'localhost')}:{os.getenv('POSTGRES_PORT', '5432')}/{os.getenv('POSTGRES_DB', 'beachkings')}"
    )
)

# Global test engine (created once per test session)
_test_engine = None


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """
    Create a test database engine for the entire test session.
    Creates/drops tables once at the start/end of test session.
    """
    global _test_engine
    
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )
    
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    _test_engine = engine
    yield engine
    
    # Cleanup: drop all tables and close engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()
    _test_engine = None


@pytest_asyncio.fixture
async def session(test_engine):
    """
    Create a test database session with automatic cleanup.
    Tables are truncated before each test to ensure clean state.
    """
    async_session_maker = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    # Clean up before test
    async with async_session_maker() as cleanup_session:
        async with cleanup_session.begin():
            # Get all table names
            result = await cleanup_session.execute(
                text("""
                    SELECT tablename FROM pg_tables 
                    WHERE schemaname = 'public' AND tablename NOT LIKE 'pg_%'
                """)
            )
            tables = [row[0] for row in result.fetchall()]
            
            if tables:
                # Disable foreign key checks temporarily and truncate
                await cleanup_session.execute(text("SET session_replication_role = 'replica'"))
                for table in tables:
                    await cleanup_session.execute(text(f'TRUNCATE TABLE "{table}" RESTART IDENTITY CASCADE'))
                await cleanup_session.execute(text("SET session_replication_role = 'origin'"))
            await cleanup_session.commit()
    
    # Yield session for test
    async with async_session_maker() as session:
        yield session
