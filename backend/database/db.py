"""
SQLite database connection and management.
"""

import sqlite3
from pathlib import Path
from contextlib import contextmanager

# Database file location
DB_PATH = Path(__file__).parent / "volleyball.db"


def get_connection():
    """Get a database connection with timeout and WAL mode for better concurrency."""
    # Set timeout to 30 seconds to handle concurrent access better
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row  # Enable column access by name
    
    # Enable WAL mode for better concurrency (allows multiple readers and one writer)
    # This significantly improves performance and reduces lock contention
    try:
        conn.execute("PRAGMA journal_mode=WAL")
    except sqlite3.OperationalError:
        # WAL mode might not be available in some configurations, continue without it
        pass
    
    return conn


@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_database():
    """Initialize the database with schema."""
    schema_path = Path(__file__).parent / "schema.sql"
    with open(schema_path, 'r') as f:
        schema_sql = f.read()
    
    with get_db() as conn:
        conn.executescript(schema_sql)


def flush_all_tables():
    """Delete all data from all tables (for flush & repopulate pattern)."""
    with get_db() as conn:
        # Delete in reverse dependency order
        conn.execute("DELETE FROM elo_history")
        conn.execute("DELETE FROM opponent_stats")
        conn.execute("DELETE FROM partnership_stats")
        conn.execute("DELETE FROM matches")
        conn.execute("DELETE FROM sessions")
        conn.execute("DELETE FROM players")


def is_database_empty():
    """Check if the database has any players."""
    with get_db() as conn:
        cursor = conn.execute("SELECT COUNT(*) FROM players")
        count = cursor.fetchone()[0]
        return count == 0


def execute_many(query, data):
    """Execute a query with many rows of data."""
    with get_db() as conn:
        conn.executemany(query, data)

