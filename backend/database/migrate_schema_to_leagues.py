#!/usr/bin/env python3
"""
Migration script to migrate from old schema to league-based schema.
Run this script to update an existing database to support leagues, seasons, and player-user relationships.

This migration will:
1. Create new tables (locations, leagues, league_configs, league_members, seasons, courts, friends, player_season_stats)
2. Create a new players table with the updated structure
3. Migrate existing players data to new structure
4. Migrate existing player stats to player_season_stats (creating a default season)
5. Update sessions table with season_id and court_id foreign keys
"""

import sqlite3
from pathlib import Path
from datetime import datetime, date

# Database file location
DB_PATH = Path(__file__).parent / "volleyball.db"


def table_exists(cursor, table_name):
    """Check if a table exists."""
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,)
    )
    return cursor.fetchone() is not None


def column_exists(cursor, table_name, column_name):
    """Check if a column exists in a table."""
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = [row[1] for row in cursor.fetchall()]
    return column_name in columns


def migrate():
    """Run the migration to the league-based schema."""
    print(f"Migrating database at {DB_PATH}...")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Enable foreign keys
    cursor.execute("PRAGMA foreign_keys = ON")
    
    try:
        # Step 1: Create locations table
        if not table_exists(cursor, "locations"):
            print("Creating locations table...")
            cursor.execute("""
                CREATE TABLE locations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    city TEXT,
                    state TEXT,
                    country TEXT DEFAULT 'USA',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("CREATE INDEX idx_locations_name ON locations(name)")
            print("✓ Locations table created")
        else:
            print("✓ Locations table already exists")
        
        # Step 2: Create seasons table first (needed for leagues FK)
        if not table_exists(cursor, "seasons"):
            print("Creating seasons table...")
            cursor.execute("""
                CREATE TABLE seasons (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    league_id INTEGER NOT NULL,
                    name TEXT,
                    start_date DATE NOT NULL,
                    end_date DATE NOT NULL,
                    point_system TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (league_id) REFERENCES leagues(id)
                )
            """)
            cursor.execute("CREATE INDEX idx_seasons_league ON seasons(league_id)")
            cursor.execute("CREATE INDEX idx_seasons_active ON seasons(is_active)")
            print("✓ Seasons table created")
        else:
            print("✓ Seasons table already exists")
        
        # Step 3: Create leagues table (without active_season_id FK for now)
        if not table_exists(cursor, "leagues"):
            print("Creating leagues table...")
            cursor.execute("""
                CREATE TABLE leagues (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    location_id INTEGER,
                    is_open INTEGER NOT NULL DEFAULT 1,
                    whatsapp_group_id TEXT,
                    active_season_id INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (location_id) REFERENCES locations(id)
                )
            """)
            cursor.execute("CREATE INDEX idx_leagues_location ON leagues(location_id)")
            cursor.execute("CREATE INDEX idx_leagues_active_season ON leagues(active_season_id)")
            print("✓ Leagues table created")
        else:
            print("✓ Leagues table already exists")
        
        # Now add FK constraint for active_season_id
        # SQLite doesn't support adding FK constraints via ALTER TABLE easily,
        # but since we just created the table, we can recreate if needed
        # For now, the FK is handled at application level
        
        # Step 4: Create league_configs table
        if not table_exists(cursor, "league_configs"):
            print("Creating league_configs table...")
            cursor.execute("""
                CREATE TABLE league_configs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    league_id INTEGER NOT NULL UNIQUE,
                    point_system TEXT,
                    default_k_factor REAL NOT NULL DEFAULT 40,
                    default_initial_elo REAL NOT NULL DEFAULT 1200,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (league_id) REFERENCES leagues(id)
                )
            """)
            cursor.execute("CREATE INDEX idx_league_configs_league ON league_configs(league_id)")
            print("✓ League configs table created")
        else:
            print("✓ League configs table already exists")
        
        # Step 5: Create courts table
        if not table_exists(cursor, "courts"):
            print("Creating courts table...")
            cursor.execute("""
                CREATE TABLE courts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    address TEXT,
                    location_id INTEGER NOT NULL,
                    geoJson TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (location_id) REFERENCES locations(id)
                )
            """)
            cursor.execute("CREATE INDEX idx_courts_location ON courts(location_id)")
            print("✓ Courts table created")
        else:
            print("✓ Courts table already exists")
        
        # Step 6: Create friends table
        if not table_exists(cursor, "friends"):
            print("Creating friends table...")
            cursor.execute("""
                CREATE TABLE friends (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    player1_id INTEGER NOT NULL,
                    player2_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (player1_id) REFERENCES players(id),
                    FOREIGN KEY (player2_id) REFERENCES players(id),
                    CHECK (player1_id < player2_id),
                    UNIQUE(player1_id, player2_id)
                )
            """)
            cursor.execute("CREATE INDEX idx_friends_player1 ON friends(player1_id)")
            cursor.execute("CREATE INDEX idx_friends_player2 ON friends(player2_id)")
            print("✓ Friends table created")
        else:
            print("✓ Friends table already exists")
        
        # Step 7: Handle players table migration
        old_players_exists = table_exists(cursor, "players_old")
        players_table_has_new_schema = column_exists(cursor, "players", "full_name")
        
        if not players_table_has_new_schema and table_exists(cursor, "players"):
            print("Migrating players table...")
            
            # Check if old players table was already backed up
            if not old_players_exists:
                # Rename old players table
                cursor.execute("ALTER TABLE players RENAME TO players_old")
                print("✓ Renamed old players table to players_old")
            
            # Create new players table
            cursor.execute("""
                CREATE TABLE players (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    full_name TEXT NOT NULL,
                    user_id INTEGER,
                    nickname TEXT,
                    gender TEXT,
                    level TEXT,
                    age INTEGER,
                    height TEXT,
                    preferred_side TEXT,
                    default_location_id INTEGER,
                    profile_picture_url TEXT,
                    avp_playerProfileId INTEGER,
                    status TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    FOREIGN KEY (default_location_id) REFERENCES locations(id)
                )
            """)
            
            # Create new players table (already defined above)
            # Migrate player names only (stats will go to player_season_stats later)
            cursor.execute("""
                INSERT INTO players (id, full_name)
                SELECT id, name
                FROM players_old
            """)
            
            cursor.execute("CREATE INDEX idx_players_name ON players(full_name)")
            cursor.execute("CREATE INDEX idx_players_user ON players(user_id)")
            cursor.execute("CREATE INDEX idx_players_location ON players(default_location_id)")
            cursor.execute("CREATE INDEX idx_players_avp_id ON players(avp_playerProfileId)")
            print("✓ Players table migrated")
        else:
            if not table_exists(cursor, "players"):
                print("Creating new players table...")
                cursor.execute("""
                    CREATE TABLE players (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        full_name TEXT NOT NULL,
                        user_id INTEGER,
                        nickname TEXT,
                        gender TEXT,
                        level TEXT,
                        age INTEGER,
                        height TEXT,
                        preferred_side TEXT,
                        default_location_id INTEGER,
                        profile_picture_url TEXT,
                        avp_playerProfileId INTEGER,
                        status TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id),
                        FOREIGN KEY (default_location_id) REFERENCES locations(id)
                    )
                """)
                cursor.execute("CREATE INDEX idx_players_name ON players(full_name)")
                cursor.execute("CREATE INDEX idx_players_user ON players(user_id)")
                cursor.execute("CREATE INDEX idx_players_location ON players(default_location_id)")
                cursor.execute("CREATE INDEX idx_players_avp_id ON players(avp_playerProfileId)")
                print("✓ Players table created")
            else:
                print("✓ Players table already has new schema")
        
        # Step 8: Create league_members table
        if not table_exists(cursor, "league_members"):
            print("Creating league_members table...")
            cursor.execute("""
                CREATE TABLE league_members (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    league_id INTEGER NOT NULL,
                    player_id INTEGER NOT NULL,
                    role TEXT NOT NULL DEFAULT 'member',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (league_id) REFERENCES leagues(id),
                    FOREIGN KEY (player_id) REFERENCES players(id),
                    UNIQUE(league_id, player_id)
                )
            """)
            cursor.execute("CREATE INDEX idx_league_members_league ON league_members(league_id)")
            cursor.execute("CREATE INDEX idx_league_members_player ON league_members(player_id)")
            print("✓ League members table created")
        else:
            print("✓ League members table already exists")
        
        # Step 9: Create player_season_stats table
        if not table_exists(cursor, "player_season_stats"):
            print("Creating player_season_stats table...")
            cursor.execute("""
                CREATE TABLE player_season_stats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    player_id INTEGER NOT NULL,
                    season_id INTEGER NOT NULL,
                    current_elo REAL NOT NULL DEFAULT 1200,
                    games INTEGER NOT NULL DEFAULT 0,
                    wins INTEGER NOT NULL DEFAULT 0,
                    points INTEGER NOT NULL DEFAULT 0,
                    win_rate REAL NOT NULL DEFAULT 0.0,
                    avg_point_diff REAL NOT NULL DEFAULT 0.0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (player_id) REFERENCES players(id),
                    FOREIGN KEY (season_id) REFERENCES seasons(id),
                    UNIQUE(player_id, season_id)
                )
            """)
            cursor.execute("CREATE INDEX idx_player_season_stats_player ON player_season_stats(player_id)")
            cursor.execute("CREATE INDEX idx_player_season_stats_season ON player_season_stats(season_id)")
            print("✓ Player season stats table created")
        else:
            print("✓ Player season stats table already exists")
        
        # Step 10: Migrate existing player stats to player_season_stats
        if old_players_exists:
            print("Migrating player stats to player_season_stats...")
            
            # Create a default league and season for existing data
            cursor.execute("SELECT COUNT(*) FROM leagues WHERE name = 'Default League'")
            default_league_count = cursor.fetchone()[0]
            
            if default_league_count == 0:
                cursor.execute("""
                    INSERT INTO leagues (name, description, is_open)
                    VALUES ('Default League', 'Default league for pre-migration data', 0)
                """)
                default_league_id = cursor.lastrowid
                print(f"✓ Created default league (id: {default_league_id})")
            else:
                cursor.execute("SELECT id FROM leagues WHERE name = 'Default League'")
                default_league_id = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM seasons WHERE league_id = ? AND name = 'Default Season'", (default_league_id,))
            default_season_count = cursor.fetchone()[0]
            
            if default_season_count == 0:
                # Create a default season that spans all existing data
                today = date.today()
                cursor.execute("""
                    INSERT INTO seasons (league_id, name, start_date, end_date, is_active)
                    VALUES (?, 'Default Season', ?, ?, 1)
                """, (default_league_id, '2020-01-01', today.isoformat()))
                default_season_id = cursor.lastrowid
                print(f"✓ Created default season (id: {default_season_id})")
            else:
                cursor.execute("SELECT id FROM seasons WHERE league_id = ? AND name = 'Default Season'", (default_league_id,))
                default_season_id = cursor.fetchone()[0]
            
            # Migrate stats from old players table
            cursor.execute("""
                INSERT INTO player_season_stats (player_id, season_id, current_elo, games, wins, points, win_rate, avg_point_diff)
                SELECT p.id, ?, po.current_elo, po.games, po.wins, po.points, po.win_rate, po.avg_point_diff
                FROM players p
                INNER JOIN players_old po ON p.id = po.id
                WHERE NOT EXISTS (
                    SELECT 1 FROM player_season_stats pss
                    WHERE pss.player_id = p.id AND pss.season_id = ?
                )
            """, (default_season_id, default_season_id))
            
            migrated_count = cursor.rowcount
            print(f"✓ Migrated stats for {migrated_count} players")
        
        # Step 11: Update sessions table
        if not column_exists(cursor, "sessions", "season_id"):
            print("Adding season_id column to sessions table...")
            cursor.execute("ALTER TABLE sessions ADD COLUMN season_id INTEGER")
            cursor.execute("CREATE INDEX idx_sessions_season ON sessions(season_id)")
            cursor.execute("""
                UPDATE sessions 
                SET season_id = (
                    SELECT id FROM seasons WHERE name = 'Default Season' LIMIT 1
                )
                WHERE season_id IS NULL
            """)
            print("✓ Added season_id column to sessions table")
        else:
            print("✓ Sessions table already has season_id column")
        
        if not column_exists(cursor, "sessions", "court_id"):
            print("Adding court_id column to sessions table...")
            cursor.execute("ALTER TABLE sessions ADD COLUMN court_id INTEGER")
            cursor.execute("CREATE INDEX idx_sessions_court ON sessions(court_id)")
            print("✓ Added court_id column to sessions table")
        else:
            print("✓ Sessions table already has court_id column")
        
        # Note: We can't add FK constraints via ALTER TABLE in SQLite easily
        # The foreign key relationships are defined in the schema.sql for new databases
        # Existing foreign key checks will be enforced at application level
        
        conn.commit()
        print("\n✅ Migration completed successfully!")
        print("\nNote: The old players table has been renamed to 'players_old'.")
        print("You can drop it after verifying the migration:")
        print("  DROP TABLE players_old;")
        
    except Exception as e:
        conn.rollback()
        print(f"\n❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()

