#!/usr/bin/env python3
"""
Migration script to add is_public column to matches table.
Run this script to update an existing database to support match visibility control.
"""

import sqlite3
import logging
import traceback
from pathlib import Path

logger = logging.getLogger(__name__)

# Database file location
DB_PATH = Path(__file__).parent / "volleyball.db"


def column_exists(cursor, table_name, column_name):
    """Check if a column exists in a table."""
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = [row[1] for row in cursor.fetchall()]
    return column_name in columns


def migrate():
    """Run the migration to add is_public column to matches."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if is_public column already exists
        if not column_exists(cursor, "matches", "is_public"):
            logger.info("Adding is_public column to matches table")
            cursor.execute("""
                ALTER TABLE matches 
                ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1
            """)
            conn.commit()
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Migration failed: {e}", exc_info=True)
        traceback.print_exc()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()

