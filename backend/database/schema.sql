-- Beach Volleyball ELO Database Schema
-- League-based schema with seasons and player-user relationships

-- Locations table: Metropolitan areas (created first as it's referenced by other tables)
CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,  -- e.g., "Los Angeles, CA"
    city TEXT,
    state TEXT,
    country TEXT DEFAULT 'USA',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Players table: Player profiles (can be seeded from AVP data)
CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    user_id INTEGER,  -- NULLABLE - for claiming by users
    nickname TEXT,
    gender TEXT,  -- 'male', 'female', etc.
    level TEXT,  -- 'beginner', 'intermediate', 'advanced', 'AA', 'Open'
    age INTEGER,
    height TEXT,  -- Can be text like "6'2\"" or number
    preferred_side TEXT,  -- 'left', 'right', etc.
    default_location_id INTEGER,  -- NULLABLE
    profile_picture_url TEXT,
    avp_playerProfileId INTEGER,  -- From seeded AVP data
    status TEXT,  -- User status update
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (default_location_id) REFERENCES locations(id)
);

-- Leagues table: League groups
CREATE TABLE IF NOT EXISTS leagues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    location_id INTEGER,  -- NULLABLE
    is_open INTEGER NOT NULL DEFAULT 1,  -- 1 = open to new players, 0 = invite-only
    whatsapp_group_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(id)
);

-- League configs table: Configuration for each league (one-to-one)
CREATE TABLE IF NOT EXISTS league_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    league_id INTEGER NOT NULL UNIQUE,
    point_system TEXT,  -- JSON or text configuration
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (league_id) REFERENCES leagues(id)
);

-- League members table: Join table (Player ↔ League)
CREATE TABLE IF NOT EXISTS league_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    league_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',  -- 'admin' or 'member'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (league_id) REFERENCES leagues(id),
    FOREIGN KEY (player_id) REFERENCES players(id),
    UNIQUE(league_id, player_id)
);

-- Seasons table: Seasons within leagues
CREATE TABLE IF NOT EXISTS seasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    league_id INTEGER NOT NULL,
    name TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    point_system TEXT,  -- JSON or text - can override league config
    is_active INTEGER NOT NULL DEFAULT 1,  -- 1 = active, 0 = inactive
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (league_id) REFERENCES leagues(id)
);

-- Courts table: Court locations
CREATE TABLE IF NOT EXISTS courts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    location_id INTEGER NOT NULL,
    geoJson TEXT,  -- GeoJSON format
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(id)
);

-- Friends table: Join table (Player ↔ Player)
CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player1_id INTEGER NOT NULL,
    player2_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player1_id) REFERENCES players(id),
    FOREIGN KEY (player2_id) REFERENCES players(id),
    CHECK (player1_id < player2_id),
    UNIQUE(player1_id, player2_id)
);

-- Player season stats table: Season-specific player stats
CREATE TABLE IF NOT EXISTS player_season_stats (
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
);

-- Sessions table: Gaming sessions grouped by date/time (updated)
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    is_pending INTEGER NOT NULL DEFAULT 1,  -- 1 = pending, 0 = submitted
    season_id INTEGER,  -- NULLABLE - for legacy sessions
    court_id INTEGER,  -- NULLABLE
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (season_id) REFERENCES seasons(id),
    FOREIGN KEY (court_id) REFERENCES courts(id)
);

-- Matches table: All match results (store player IDs only)
CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,  -- NULL for legacy matches
    date TEXT NOT NULL,
    team1_player1_id INTEGER NOT NULL,
    team1_player2_id INTEGER NOT NULL,
    team2_player1_id INTEGER NOT NULL,
    team2_player2_id INTEGER NOT NULL,
    team1_score INTEGER NOT NULL,
    team2_score INTEGER NOT NULL,
    winner INTEGER NOT NULL,  -- 1 = team1, 2 = team2, -1 = tie
    is_public INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Partnership stats: How each player performs WITH each partner (denormalized with names)
CREATE TABLE IF NOT EXISTS partnership_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    partner_id INTEGER NOT NULL,
    partner_name TEXT NOT NULL,
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    points INTEGER NOT NULL DEFAULT 0,
    win_rate REAL NOT NULL DEFAULT 0.0,
    avg_point_diff REAL NOT NULL DEFAULT 0.0
);

-- Opponent stats: How each player performs AGAINST each opponent (denormalized with names)
CREATE TABLE IF NOT EXISTS opponent_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    opponent_id INTEGER NOT NULL,
    opponent_name TEXT NOT NULL,
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    points INTEGER NOT NULL DEFAULT 0,
    win_rate REAL NOT NULL DEFAULT 0.0,
    avg_point_diff REAL NOT NULL DEFAULT 0.0
);

-- ELO history: Track ELO changes over time for charting
CREATE TABLE IF NOT EXISTS elo_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    match_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    elo_after REAL NOT NULL,
    elo_change REAL NOT NULL
);

-- Settings table: Application configuration
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Users table: User accounts with phone-based authentication
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL UNIQUE,  -- E.164 format, UNIQUE (only verified users exist)
    password_hash TEXT NOT NULL,  -- Required for all accounts
    name TEXT,
    email TEXT,
    is_verified INTEGER NOT NULL DEFAULT 1,  -- Always 1 (accounts only created after verification)
    failed_verification_attempts INTEGER NOT NULL DEFAULT 0,  -- Track failed verification attempts
    locked_until TEXT,  -- ISO timestamp when account lock expires (NULL if not locked)
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Verification codes table: SMS verification codes with signup data
CREATE TABLE IF NOT EXISTS verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL,
    code TEXT NOT NULL,  -- 6-digit code
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,  -- 0 = unused, 1 = used
    -- Signup data stored temporarily until verification
    password_hash TEXT,  -- Hashed password from signup
    name TEXT,  -- User name from signup
    email TEXT,  -- User email from signup
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Refresh tokens table: JWT refresh tokens for token rotation
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,  -- The refresh token itself
    expires_at TEXT NOT NULL,  -- ISO timestamp when token expires
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Password reset tokens table: Tokens for password reset after verification
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,  -- The reset token itself
    expires_at TEXT NOT NULL,  -- ISO timestamp when token expires (e.g., 1 hour)
    used INTEGER NOT NULL DEFAULT 0,  -- 0 = unused, 1 = used
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for read performance

-- Existing table indexes
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_pending ON sessions(is_pending);
CREATE INDEX IF NOT EXISTS idx_sessions_season ON sessions(season_id);
CREATE INDEX IF NOT EXISTS idx_sessions_court ON sessions(court_id);
CREATE INDEX IF NOT EXISTS idx_matches_session ON matches(session_id);
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(date DESC);
CREATE INDEX IF NOT EXISTS idx_matches_team1_p1 ON matches(team1_player1_id);
CREATE INDEX IF NOT EXISTS idx_matches_team1_p2 ON matches(team1_player2_id);
CREATE INDEX IF NOT EXISTS idx_matches_team2_p1 ON matches(team2_player1_id);
CREATE INDEX IF NOT EXISTS idx_matches_team2_p2 ON matches(team2_player2_id);
CREATE INDEX IF NOT EXISTS idx_partnership_stats_player ON partnership_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_opponent_stats_player ON opponent_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_elo_history_player ON elo_history(player_id);
CREATE INDEX IF NOT EXISTS idx_players_name ON players(full_name);
CREATE INDEX IF NOT EXISTS idx_players_user ON players(user_id);
CREATE INDEX IF NOT EXISTS idx_players_location ON players(default_location_id);
CREATE INDEX IF NOT EXISTS idx_players_avp_id ON players(avp_playerProfileId);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_phone_verified ON users(phone_number, is_verified);
CREATE INDEX IF NOT EXISTS idx_verification_codes_phone ON verification_codes(phone_number);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- New table indexes
CREATE INDEX IF NOT EXISTS idx_locations_name ON locations(name);
CREATE INDEX IF NOT EXISTS idx_leagues_location ON leagues(location_id);
CREATE INDEX IF NOT EXISTS idx_league_configs_league ON league_configs(league_id);
CREATE INDEX IF NOT EXISTS idx_league_members_league ON league_members(league_id);
CREATE INDEX IF NOT EXISTS idx_league_members_player ON league_members(player_id);
CREATE INDEX IF NOT EXISTS idx_seasons_league ON seasons(league_id);
CREATE INDEX IF NOT EXISTS idx_seasons_active ON seasons(is_active);
CREATE INDEX IF NOT EXISTS idx_courts_location ON courts(location_id);
CREATE INDEX IF NOT EXISTS idx_friends_player1 ON friends(player1_id);
CREATE INDEX IF NOT EXISTS idx_friends_player2 ON friends(player2_id);
CREATE INDEX IF NOT EXISTS idx_player_season_stats_player ON player_season_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_season_stats_season ON player_season_stats(season_id);

