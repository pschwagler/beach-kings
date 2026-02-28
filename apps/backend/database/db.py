"""
PostgreSQL database connection and management using SQLAlchemy async mode.
"""

import os
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
    AsyncEngine,
)
from sqlalchemy.orm import DeclarativeBase
from dotenv import load_dotenv

load_dotenv()

# Database URL from environment variable
# Format: postgresql+asyncpg://user:password@host:port/dbname
# Defaults to localhost for local dev, or uses service name 'postgres' in Docker
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"postgresql+asyncpg://{os.getenv('POSTGRES_USER', 'beachkings')}:{os.getenv('POSTGRES_PASSWORD', 'beachkings')}@{os.getenv('POSTGRES_HOST', 'localhost')}:{os.getenv('POSTGRES_PORT', '5432')}/{os.getenv('POSTGRES_DB', 'beachkings')}",
)

# Create async engine
engine: AsyncEngine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("SQL_ECHO", "false").lower() == "true",  # Log SQL queries in debug mode
    future=True,
    pool_pre_ping=True,  # Verify connections before using them
    pool_size=10,
    max_overflow=20,
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""

    pass


# Import models to register them with Base.metadata
# This must be after Base is defined to avoid circular imports
from backend.database import models  # noqa: F401, E402


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency function for FastAPI to get database session.

    Usage in FastAPI routes:
        async def my_route(session: AsyncSession = Depends(get_db_session)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_database():
    """Initialize the database by creating all tables."""
    async with engine.begin() as conn:
        # Create all tables (checkfirst=True means it won't error if tables already exist)
        def create_tables(sync_conn):
            Base.metadata.create_all(bind=sync_conn, checkfirst=True)

        await conn.run_sync(create_tables)


async def flush_all_tables():
    """
    DISABLED: This function has been disabled.

    TODO: Re-implement to be season-specific and add proper validations.
    This function should only delete sessions & matches for a specific season,
    not all data across all tables.
    """
    raise NotImplementedError(
        "flush_all_tables has been disabled. "
        "This function needs to be re-implemented to be season-specific with proper validations. "
        "It should only delete sessions and matches for a specific season, not all data."
    )


