"""
Alembic environment configuration for async migrations.

This file is the standard Alembic entry point for CLI commands (alembic upgrade, etc.).
Alembic CLI automatically executes this file when running migration commands.

This file also contains all migration logic and can be imported programmatically.
"""

from logging.config import fileConfig
import asyncio
import logging
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context, config as alembic_config, command

# Import all models so Alembic can detect them
from backend.database.db import Base, DATABASE_URL
from backend.database import models  # noqa: F401

# Import all migration files so Alembic can detect them
# This ensures all migrations in the versions directory are discoverable
import backend.alembic.versions  # noqa: F401

logger = logging.getLogger(__name__)

# This is the Alembic Config object, which provides
# access to the values within the .ini file in use.
# Only available when run by Alembic CLI (not when imported programmatically)
config = None
try:
    config = context.config
    # Interpret the config file for Python logging.
    if config.config_file_name is not None:
        fileConfig(config.config_file_name)
except AttributeError:
    # Not running via Alembic CLI - that's fine for programmatic use
    pass

# Metadata for autogenerate support
target_metadata = Base.metadata


def run_migrations_offline(alembic_cfg=None) -> None:
    """Run migrations in 'offline' mode (generates SQL without connecting).

    Args:
        alembic_cfg: Optional Alembic Config object. If not provided, uses context.config.
    """
    config_obj = alembic_cfg if alembic_cfg is not None else config
    if config_obj is None:
        raise ValueError("Alembic config is required for offline migrations")
    url = config_obj.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Execute migrations using the provided connection."""
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations(alembic_cfg=None) -> None:
    """Run migrations in async mode.

    Args:
        alembic_cfg: Optional Alembic Config object. If not provided, uses context.config.
    """
    config_obj = alembic_cfg if alembic_cfg is not None else config
    if config_obj is None:
        raise ValueError("Alembic config is required for async migrations")

    # Override sqlalchemy.url with our async URL
    configuration = config_obj.get_section(config_obj.config_ini_section)
    configuration["sqlalchemy.url"] = DATABASE_URL

    logger.info("Creating database connection...")
    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    try:
        logger.info("Executing migrations...")
        async with connectable.connect() as connection:
            await connection.run_sync(do_run_migrations)
        logger.info("Migrations executed successfully")
    except Exception as e:
        logger.error(f"Error during migration execution: {e}", exc_info=True)
        raise
    finally:
        await connectable.dispose()
        logger.info("Database connection closed")


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (called by Alembic CLI)."""
    logger.info("Starting database migrations...")
    logger.info(
        f"Database URL: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else 'configured'}"
    )
    try:
        asyncio.run(run_async_migrations())
        logger.info("✓ Migrations completed successfully")
    except Exception as e:
        logger.error(f"✗ Migration failed: {e}", exc_info=True)
        raise


async def run_migrations_online_programmatic() -> None:
    """Run migrations programmatically (called from main.py).

    Uses Alembic's command API to properly initialize context.
    Raises exceptions if migrations fail.
    """
    # Get the backend directory (where alembic.ini is located)
    backend_dir = Path(__file__).parent.parent
    alembic_ini_path = backend_dir / "alembic.ini"

    if not alembic_ini_path.exists():
        raise FileNotFoundError(f"Alembic config file not found: {alembic_ini_path}")

    # Initialize Alembic config
    alembic_cfg = alembic_config.Config(str(alembic_ini_path))
    alembic_cfg.set_main_option("sqlalchemy.url", DATABASE_URL)

    # Use command API which properly initializes context
    # Run in thread since command.upgrade is sync, and change to backend directory
    original_cwd = os.getcwd()
    try:
        os.chdir(str(backend_dir))

        def run_upgrade():
            try:
                # Run upgrade - Alembic will log which migrations it's running
                command.upgrade(alembic_cfg, "head")
                logger.info("✓ Migrations completed successfully")
            except Exception as e:
                logger.error(f"Migration execution failed: {e}", exc_info=True)
                raise

        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor() as executor:
            await loop.run_in_executor(executor, run_upgrade)
    except FileNotFoundError:
        raise
    except Exception as e:
        logger.error(f"Failed to run migrations: {e}", exc_info=True)
        raise
    finally:
        os.chdir(original_cwd)


# Alembic CLI entry point - this code runs when you execute:
# - alembic upgrade head
# - alembic downgrade -1
# - alembic revision --autogenerate
# etc.
# Only execute when run by Alembic CLI (config is set)
if config is not None:
    try:
        if context.is_offline_mode():
            run_migrations_offline()
        else:
            run_migrations_online()
    except AttributeError:
        # Not running via Alembic CLI - skip CLI entry point
        pass
