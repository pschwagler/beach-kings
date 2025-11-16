#!/usr/bin/env python3
"""
Migration script to add sessions table and session_id column to matches table.
Run this script to update an existing database to support the new sessions feature.
"""

import sqlite3
from pathlib import Path

# Database file location
DB_PATH = Path(__file__).parent / "volleyball.db"


def migrate():
    """Run the migration to add sessions support."""
    print(f"Migrating database at {DB_PATH}...")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if sessions table already exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
        )
        sessions_exists = cursor.fetchone() is not None
        
        if not sessions_exists:
            print("Creating sessions table...")
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
            print("✓ Sessions table created")
        else:
            print("✓ Sessions table already exists")
        
        # Check if session_id column exists in matches
        cursor.execute("PRAGMA table_info(matches)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'session_id' not in columns:
            print("Adding session_id column to matches table...")
            cursor.execute(
                "ALTER TABLE matches ADD COLUMN session_id INTEGER"
            )
            
            # Create index
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_matches_session ON matches(session_id)"
            )
            print("✓ session_id column added")
        else:
            print("✓ session_id column already exists")
        
        conn.commit()
        print("\n✅ Migration completed successfully!")
        
    except Exception as e:
        conn.rollback()
        print(f"\n❌ Migration failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()

