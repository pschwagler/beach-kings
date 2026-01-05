"""
PostgreSQL database connection and management using SQLAlchemy async mode.
"""

import os
import asyncio
from typing import AsyncGenerator
from contextlib import contextmanager
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
    AsyncEngine
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Database URL from environment variable
# Format: postgresql+asyncpg://user:password@host:port/dbname
# Defaults to localhost for local dev, or uses service name 'postgres' in Docker
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"postgresql+asyncpg://{os.getenv('POSTGRES_USER', 'beachkings')}:{os.getenv('POSTGRES_PASSWORD', 'beachkings')}@{os.getenv('POSTGRES_HOST', 'localhost')}:{os.getenv('POSTGRES_PORT', '5432')}/{os.getenv('POSTGRES_DB', 'beachkings')}"
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


# Temporary compatibility layer for old sync functions
# This allows old sync functions to work until they're fully converted
def get_db():
    # TODO: remove this
    """
    DEPRECATED: Compatibility layer for old sync functions.
    This creates a sync connection from the async engine.
    Use get_db_session() with async functions instead.
    """
    # Create a sync engine from the async URL (remove +asyncpg)
    sync_url = DATABASE_URL.replace("+asyncpg", "")
    sync_engine = create_engine(sync_url, pool_pre_ping=True)
    SyncSessionLocal = sessionmaker(bind=sync_engine)
    
    @contextmanager
    def _get_db():
        session = SyncSessionLocal()
        try:
            # Wrap the session to make it work like the old SQLite connection
            class ConnectionWrapper:
                def __init__(self, sess):
                    self.session = sess
                    self._closed = False
                
                def execute(self, query, params=None):
                    # Convert SQLite-style ? placeholders to PostgreSQL $1, $2, etc.
                    if params:
                        # Simple conversion for common cases
                        query = query.replace("?", "%s")
                        result = self.session.execute(text(query), params)
                    else:
                        result = self.session.execute(text(query))
                    return result
                
                def executemany(self, query, params_list):
                    query = query.replace("?", "%s")
                    self.session.execute(text(query), params_list)
                
                def commit(self):
                    self.session.commit()
                
                def close(self):
                    if not self._closed:
                        self.session.close()
                        self._closed = True
                
                def __enter__(self):
                    return self
                
                def __exit__(self, exc_type, exc_val, exc_tb):
                    if exc_type:
                        self.session.rollback()
                    else:
                        self.session.commit()
                    self.close()
            
            yield ConnectionWrapper(session)
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()
    
    return _get_db()
