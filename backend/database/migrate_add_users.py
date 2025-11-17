#!/usr/bin/env python3
"""
Migration script to add users and verification_codes tables.
Run this script to update an existing database to support user authentication.
"""

import sqlite3
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Database file location
DB_PATH = Path(__file__).parent / "volleyball.db"


def migrate():
    """Run the migration to add users and verification_codes tables."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if users table already exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
        )
        users_exists = cursor.fetchone() is not None
        
        if not users_exists:
            logger.info("Creating users table")
            cursor.execute("""
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone_number TEXT NOT NULL,
                    password_hash TEXT,
                    name TEXT,
                    email TEXT,
                    is_verified INTEGER NOT NULL DEFAULT 0,
                    failed_verification_attempts INTEGER NOT NULL DEFAULT 0,
                    locked_until TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Create indexes
            cursor.execute(
                "CREATE INDEX idx_users_phone ON users(phone_number)"
            )
            cursor.execute(
                "CREATE INDEX idx_users_phone_verified ON users(phone_number, is_verified)"
            )
        else:
            # Check if new columns need to be added
            cursor.execute("PRAGMA table_info(users)")
            columns = [row[1] for row in cursor.fetchall()]
            
            if "failed_verification_attempts" not in columns:
                logger.info("Adding failed_verification_attempts column to users table")
                cursor.execute(
                    "ALTER TABLE users ADD COLUMN failed_verification_attempts INTEGER NOT NULL DEFAULT 0"
                )
            
            if "locked_until" not in columns:
                logger.info("Adding locked_until column to users table")
                cursor.execute(
                    "ALTER TABLE users ADD COLUMN locked_until TEXT"
                )
        
        # Check if verification_codes table already exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='verification_codes'"
        )
        verification_codes_exists = cursor.fetchone() is not None
        
        if not verification_codes_exists:
            logger.info("Creating verification_codes table")
            cursor.execute("""
                CREATE TABLE verification_codes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone_number TEXT NOT NULL,
                    code TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    used INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Create indexes
            cursor.execute(
                "CREATE INDEX idx_verification_codes_phone ON verification_codes(phone_number)"
            )
            cursor.execute(
                "CREATE INDEX idx_verification_codes_expires ON verification_codes(expires_at)"
            )
        
        # Check if refresh_tokens table already exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='refresh_tokens'"
        )
        refresh_tokens_exists = cursor.fetchone() is not None
        
        if not refresh_tokens_exists:
            logger.info("Creating refresh_tokens table")
            cursor.execute("""
                CREATE TABLE refresh_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    token TEXT NOT NULL UNIQUE,
                    expires_at TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            
            # Create indexes
            cursor.execute(
                "CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id)"
            )
            cursor.execute(
                "CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token)"
            )
            cursor.execute(
                "CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at)"
            )
        
        conn.commit()
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Migration failed: {e}", exc_info=True)
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()


