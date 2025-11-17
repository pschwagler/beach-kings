"""
Migration: Add unique constraint on phone_number and store signup data in verification_codes.

This migration:
1. Deletes all unverified users (they will need to sign up again)
2. Adds UNIQUE constraint to phone_number in users table
3. Adds signup data fields to verification_codes table
4. Updates users table to make password_hash required and is_verified always 1
"""

import sqlite3
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# Get database path
DB_PATH = Path(__file__).parent / "volleyball.db"

def migrate():
    """Run the migration."""
    if not DB_PATH.exists():
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if users table has unique constraint already
        cursor.execute("PRAGMA index_list(users)")
        indexes = cursor.fetchall()
        has_unique_phone = any('phone_number' in idx[1] and idx[2] == 1 for idx in indexes)
        
        if not has_unique_phone:
            # Step 1: Delete all unverified users
            cursor.execute("DELETE FROM users WHERE is_verified = 0")
            deleted_count = cursor.rowcount
            if deleted_count > 0:
                logger.info(f"Deleted {deleted_count} unverified user(s)")
            
            # Step 2: Create new users table with unique constraint
            # SQLite doesn't support ALTER TABLE ADD CONSTRAINT, so we need to recreate
            logger.info("Updating users table with unique constraint on phone_number")
            cursor.execute("""
                CREATE TABLE users_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone_number TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    name TEXT,
                    email TEXT,
                    is_verified INTEGER NOT NULL DEFAULT 1,
                    failed_verification_attempts INTEGER NOT NULL DEFAULT 0,
                    locked_until TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Copy verified users to new table (ensuring password_hash is not null)
            cursor.execute("""
                INSERT INTO users_new 
                (id, phone_number, password_hash, name, email, is_verified, 
                 failed_verification_attempts, locked_until, created_at, updated_at)
                SELECT 
                    id, phone_number, 
                    COALESCE(password_hash, '') as password_hash,  -- Set empty string if null
                    name, email, 1 as is_verified,  -- All existing users are verified
                    failed_verification_attempts, locked_until, created_at, updated_at
                FROM users
                WHERE is_verified = 1 AND password_hash IS NOT NULL
            """)
            
            # Drop old table and rename new one
            cursor.execute("DROP TABLE users")
            cursor.execute("ALTER TABLE users_new RENAME TO users")
            
            # Recreate indexes
            cursor.execute("DROP INDEX IF EXISTS idx_users_phone")
            cursor.execute("DROP INDEX IF EXISTS idx_users_phone_verified")
            cursor.execute("CREATE INDEX idx_users_phone ON users(phone_number)")
        
        # Step 3: Add signup data fields to verification_codes
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(verification_codes)")
        columns = [row[1] for row in cursor.fetchall()]
        
        changes_made = False
        if 'password_hash' not in columns:
            logger.info("Adding password_hash column to verification_codes table")
            cursor.execute("ALTER TABLE verification_codes ADD COLUMN password_hash TEXT")
            changes_made = True
        
        if 'name' not in columns:
            logger.info("Adding name column to verification_codes table")
            cursor.execute("ALTER TABLE verification_codes ADD COLUMN name TEXT")
            changes_made = True
        
        if 'email' not in columns:
            logger.info("Adding email column to verification_codes table")
            cursor.execute("ALTER TABLE verification_codes ADD COLUMN email TEXT")
            changes_made = True
        
        if changes_made or not has_unique_phone:
            conn.commit()
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Migration failed: {e}", exc_info=True)
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()



