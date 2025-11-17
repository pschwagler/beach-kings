"""
Migration: Add password_reset_tokens table.

This migration adds the password_reset_tokens table for secure password reset flow.
"""

import sqlite3
import logging
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
        # Check if table already exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='password_reset_tokens'"
        )
        table_exists = cursor.fetchone() is not None
        
        if not table_exists:
            logger.info("Creating password_reset_tokens table")
            # Create password_reset_tokens table
            cursor.execute("""
                CREATE TABLE password_reset_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    token TEXT NOT NULL UNIQUE,
                    expires_at TEXT NOT NULL,
                    used INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            
            # Create indexes
            cursor.execute("CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id)")
            cursor.execute("CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token)")
            cursor.execute("CREATE INDEX idx_password_reset_tokens_expires ON password_reset_tokens(expires_at)")
            conn.commit()
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Migration failed: {e}", exc_info=True)
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()



