#!/usr/bin/env python3
"""
Migration script to add sessions table and session_id column to matches table.
Run this script to update an existing database to support the new sessions feature.
"""

import sqlite3
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Database file location
DB_PATH = Path(__file__).parent / "volleyball.db"


def migrate():
    """Run the migration to add sessions support."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if sessions table already exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
        )
        sessions_exists = cursor.fetchone() is not None
        
        if not sessions_exists:
            logger.info("Creating sessions table")
            cursor.execute("""
                CREATE TABLE sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT NOT NULL,
                    name TEXT NOT NULL,
                    is_pending INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Create indexes
            cursor.execute(
                "CREATE INDEX idx_sessions_date ON sessions(date DESC)"
            )
            cursor.execute(
                "CREATE INDEX idx_sessions_pending ON sessions(is_pending)"
            )
        
        # Check if session_id column exists in matches
        cursor.execute("PRAGMA table_info(matches)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'session_id' not in columns:
            logger.info("Adding session_id column to matches table")
            cursor.execute(
                "ALTER TABLE matches ADD COLUMN session_id INTEGER"
            )
            
            # Create index
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_matches_session ON matches(session_id)"
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

