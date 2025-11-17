#!/usr/bin/env python3
"""
Migration script to rename is_active column to is_pending in sessions table.
Run this script to update an existing database.
"""

import sqlite3
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Database file location
DB_PATH = Path(__file__).parent / "volleyball.db"


def migrate():
    """Run the migration to rename is_active to is_pending."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if sessions table exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
        )
        sessions_exists = cursor.fetchone() is not None
        
        if not sessions_exists:
            return
        
        # Check if is_active column exists
        cursor.execute("PRAGMA table_info(sessions)")
        columns = {row[1]: row for row in cursor.fetchall()}
        
        has_is_active = 'is_active' in columns
        has_is_pending = 'is_pending' in columns
        
        if has_is_pending and not has_is_active:
            return
        
        if has_is_active and not has_is_pending:
            logger.info("Renaming is_active column to is_pending in sessions table")
            
            # SQLite doesn't support direct column rename in older versions
            # Need to create new table and copy data
            
            # Create new sessions table with is_pending
            cursor.execute("""
                CREATE TABLE sessions_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT NOT NULL,
                    name TEXT NOT NULL,
                    is_pending INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Copy data from old table
            cursor.execute("""
                INSERT INTO sessions_new (id, date, name, is_pending, created_at)
                SELECT id, date, name, is_active, created_at
                FROM sessions
            """)
            
            # Drop old table
            cursor.execute("DROP TABLE sessions")
            
            # Rename new table to sessions
            cursor.execute("ALTER TABLE sessions_new RENAME TO sessions")
            
            # Recreate indexes
            cursor.execute("CREATE INDEX idx_sessions_date ON sessions(date DESC)")
            cursor.execute("CREATE INDEX idx_sessions_pending ON sessions(is_pending)")
        else:
            logger.warning("Both is_active and is_pending exist in sessions table. Manual intervention needed.")
            return
        
        conn.commit()
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Migration failed: {e}", exc_info=True)
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()


