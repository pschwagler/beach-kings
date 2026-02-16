"""
Shared pytest configuration for backend tests.

Uses PostgreSQL for consistency with production environment.

SAFETY: This module REFUSES to run against any database whose name does not
contain the substring "test".  This prevents accidental truncation / drop of
the development or production database when environment variables are missing
or misconfigured.
"""

import os
import asyncio
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
from sqlalchemy import text
from backend.database.db import Base


def _resolve_test_database_url() -> str:
    """Build the test database URL with safety checks.

    Raises ``RuntimeError`` if the resolved URL does not point to a database
    whose name contains "test".
    """
    url = os.getenv(
        "TEST_DATABASE_URL",
        os.getenv("DATABASE_URL", ""),
    )

    # If neither env var is set, construct from individual POSTGRES_* vars
    # but ONLY use the test-safe defaults (port 5433, db beachkings_test).
    if not url:
        url = (
            f"postgresql+asyncpg://"
            f"{os.getenv('POSTGRES_USER', 'beachkings')}:"
            f"{os.getenv('POSTGRES_PASSWORD', 'beachkings')}@"
            f"{os.getenv('POSTGRES_HOST', 'localhost')}:"
            f"{os.getenv('POSTGRES_PORT', '5433')}/"
            f"{os.getenv('POSTGRES_DB', 'beachkings_test')}"
        )

    # ── Safety gate: database name MUST contain "test" ──────────────────
    # Extract the database name (last segment after the final '/').
    db_name = url.rsplit("/", 1)[-1].split("?")[0]  # strip query params
    if "test" not in db_name.lower():
        raise RuntimeError(
            f"\n{'=' * 70}\n"
            f"  SAFETY: Refusing to run tests against database '{db_name}'.\n"
            f"  The database name must contain 'test' to prevent accidental\n"
            f"  data loss in development or production databases.\n\n"
            f"  Resolved URL: {url}\n\n"
            f"  Fix: set TEST_DATABASE_URL to a test database, e.g.:\n"
            f"    export TEST_DATABASE_URL=postgresql+asyncpg://.../{db_name}_test\n"
            f"  Or use 'make test' which runs tests in Docker with the correct URL.\n"
            f"{'=' * 70}"
        )

    return url


# Test database configuration — validated at import time so pytest fails
# immediately with a clear message rather than silently hitting the wrong DB.
TEST_DATABASE_URL = _resolve_test_database_url()


@pytest_asyncio.fixture(scope="function")
async def test_engine():
    """Create a test database engine for the entire test session."""
    # Use NullPool to avoid connection reuse issues across event loops
    # This is slower but prevents "Future attached to different loop" errors
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        poolclass=NullPool,  # No connection pooling - each operation gets a new connection
        pool_pre_ping=True,
    )

    # Recreate all tables (drop first to pick up schema changes)
    async with engine.begin() as conn:
        # Ensure models are imported so Base.metadata includes all tables
        from backend.database import models  # noqa: F401

        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    # Monkey-patch AsyncSessionLocal to use the test engine
    # This ensures that code using db.AsyncSessionLocal() (like stats_queue._run_calculation)
    # uses the same database connection as the test fixtures
    from backend.database import db

    test_session_maker = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )
    # Store original for cleanup
    original_async_session_local = db.AsyncSessionLocal
    # Replace with test session maker
    db.AsyncSessionLocal = test_session_maker

    yield engine

    # Restore original AsyncSessionLocal
    db.AsyncSessionLocal = original_async_session_local

    # Cleanup - gracefully close connections
    try:
        # Explicitly close all connections before disposing
        # This helps prevent "event loop closed" errors
        await asyncio.sleep(0.05)  # Small delay to let connections finish

        # Drop all tables first (using a fresh connection)
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.drop_all)
        except Exception:
            pass  # Ignore errors during cleanup

        # Dispose engine properly
        await engine.dispose(close=True)
    except Exception:
        pass  # Ignore cleanup errors


@pytest_asyncio.fixture
async def db_session(test_engine):
    """
    Create a test database session with automatic cleanup.
    Tables are truncated before each test to ensure clean state.
    """
    async_session_maker = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    # Truncate all tables before test to ensure clean state
    # Use a separate connection to ensure truncation is visible
    # Wrap in try/except to handle connection errors gracefully
    try:
        # Create a fresh connection for truncation
        async with test_engine.connect() as truncate_conn:
            async with truncate_conn.begin():
                # Get all table names from the database
                result = await truncate_conn.execute(
                    text("""
                        SELECT tablename FROM pg_tables 
                        WHERE schemaname = 'public' 
                        AND tablename NOT LIKE 'pg_%'
                        AND tablename NOT LIKE 'alembic_%'
                        ORDER BY tablename
                    """)
                )
                tables = [row[0] for row in result.fetchall()]

                if tables:
                    # Use CASCADE to handle foreign key constraints
                    # Disable triggers temporarily for faster truncation
                    await truncate_conn.execute(text("SET session_replication_role = 'replica'"))

                    # Truncate all tables with CASCADE to handle dependencies
                    table_list = ", ".join(f'"{table}"' for table in tables)
                    await truncate_conn.execute(
                        text(f"TRUNCATE TABLE {table_list} RESTART IDENTITY CASCADE")
                    )

                    await truncate_conn.execute(text("SET session_replication_role = 'origin'"))
            # Connection is closed when exiting the context
    except Exception:
        # If truncation fails completely, just continue - test isolation may be affected
        # but connection cleanup errors shouldn't prevent tests from running
        pass

    # Yield session for test
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            # Ensure session is properly closed
            # Use try/except to handle cases where session is already closed
            try:
                await session.rollback()
            except Exception:
                pass
            try:
                await session.close()
            except Exception:
                pass
