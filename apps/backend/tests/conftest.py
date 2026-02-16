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


async def _patch_missing_columns(conn):
    """Add columns to existing tables that create_all cannot alter.

    Each entry: (table, column, DDL fragment).
    Only runs ALTER if the table exists but the column does not.
    """
    patches = [
        # Migration 019
        ("matches", "ranked_intent", "BOOLEAN NOT NULL DEFAULT TRUE"),
        # Migration 020 — court discovery columns on the courts table
        ("courts", "description", "TEXT"),
        ("courts", "court_count", "INTEGER"),
        ("courts", "surface_type", "VARCHAR(50)"),
        ("courts", "is_free", "BOOLEAN"),
        ("courts", "cost_info", "TEXT"),
        ("courts", "has_lights", "BOOLEAN"),
        ("courts", "has_restrooms", "BOOLEAN"),
        ("courts", "has_parking", "BOOLEAN"),
        ("courts", "parking_info", "TEXT"),
        ("courts", "nets_provided", "BOOLEAN"),
        ("courts", "hours", "TEXT"),
        ("courts", "phone", "VARCHAR(30)"),
        ("courts", "website", "VARCHAR(500)"),
        ("courts", "latitude", "FLOAT"),
        ("courts", "longitude", "FLOAT"),
        ("courts", "average_rating", "FLOAT"),
        ("courts", "review_count", "INTEGER DEFAULT 0"),
        ("courts", "status", "VARCHAR(20) DEFAULT 'approved'"),
        ("courts", "is_active", "BOOLEAN DEFAULT TRUE"),
        ("courts", "slug", "VARCHAR(200)"),
        ("courts", "created_by", "INTEGER"),
        ("courts", "updated_by", "INTEGER"),
    ]
    for table, column, ddl in patches:
        tbl_exists = await conn.execute(text(
            "SELECT 1 FROM information_schema.tables WHERE table_name = :t"
        ), {"t": table})
        if tbl_exists.scalar() is None:
            continue  # table doesn't exist yet; create_all will handle it
        col_exists = await conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ), {"t": table, "c": column})
        if col_exists.scalar() is None:
            await conn.execute(text(
                f'ALTER TABLE {table} ADD COLUMN "{column}" {ddl}'
            ))


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

    # Create all tables
    async with engine.begin() as conn:
        # Ensure models are imported so Base.metadata includes all tables
        from backend.database import models  # noqa: F401

        # Patch: add new columns to existing tables that create_all won't alter.
        # create_all creates missing tables but doesn't add columns to existing
        # ones from persistent test volumes — we add them manually first.
        await _patch_missing_columns(conn)

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
