#!/usr/bin/env python3
"""
Database migration runner.
Runs all migrations in the correct order.
"""

import logging
from backend.database.migrate_schema_to_leagues import migrate as migrate_leagues
from backend.database.migrate_add_sessions import migrate as migrate_sessions
from backend.database.migrate_rename_is_active import migrate as migrate_rename_is_active
from backend.database.migrate_add_users import migrate as migrate_users
from backend.database.migrate_add_password_reset_tokens import migrate as migrate_password_reset
from backend.database.migrate_unique_phone_and_signup_data import migrate as migrate_unique_phone
from backend.database.migrate_add_is_public_to_matches import migrate as migrate_is_public

logger = logging.getLogger(__name__)


def migrate_db():
    """
    Run all database migrations in order.
    
    This function should be called on application startup to ensure
    the database schema is up to date.
    """
    logger.info("Running database migrations...")
    
    # Run migrations in order
    migrations = [
        ("League schema", migrate_leagues),
        ("Sessions", migrate_sessions),
        ("Rename is_active", migrate_rename_is_active),
        ("Users", migrate_users),
        ("Password reset tokens", migrate_password_reset),
        ("Unique phone and signup data", migrate_unique_phone),
        ("Matches is_public", migrate_is_public),
    ]
    
    for name, migrate_func in migrations:
        try:
            logger.info(f"Running migration: {name}...")
            migrate_func()
            logger.info(f"✓ {name} migration completed")
        except Exception as e:
            logger.error(f"✗ {name} migration failed: {e}", exc_info=True)
            # Continue with other migrations even if one fails
            # (some migrations may be idempotent and fail if already applied)
    
    logger.info("✓ All migrations completed")


if __name__ == "__main__":
    migrate_db()

