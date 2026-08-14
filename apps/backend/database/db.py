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
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv

load_dotenv()

# Database URL from environment variable
# Format: postgresql+asyncpg://user:password@host:port/dbname
# Defaults to localhost for local dev, or uses service name 'postgres' in Docker
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"postgresql+asyncpg://{os.getenv('POSTGRES_USER', 'beachkings')}:{os.getenv('POSTGRES_PASSWORD', 'beachkings')}@{os.getenv('POSTGRES_HOST', 'localhost')}:{os.getenv('POSTGRES_PORT', '5432')}/{os.getenv('POSTGRES_DB', 'beachkings')}",
)


def engine_options(environment: str | None = None) -> dict:
    """Return engine options for the requested runtime environment.

    Tests frequently create a fresh event loop per case. NullPool prevents an
    asyncpg connection created by one loop from being reused by another, while
    normal runtime environments retain the production-sized queue pool.
    """
    options = {
        "echo": os.getenv("SQL_ECHO", "false").lower() == "true",
        "future": True,
        "pool_pre_ping": True,
    }
    if (environment or os.getenv("ENV", "development")).strip().lower() == "test":
        options["poolclass"] = NullPool
    else:
        options.update(pool_size=10, max_overflow=20)
    return options


# Create async engine
engine: AsyncEngine = create_async_engine(DATABASE_URL, **engine_options())

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
