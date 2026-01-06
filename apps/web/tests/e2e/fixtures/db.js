import pg from 'pg';
const { Client } = pg;

/**
 * Get a database connection for testing
 */
export function getDbClient() {
  const connectionString = process.env.TEST_DATABASE_URL || 
    `postgresql://${process.env.POSTGRES_USER || 'beachkings'}:${process.env.POSTGRES_PASSWORD || 'beachkings'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5433'}/${process.env.TEST_POSTGRES_DB || 'beachkings_test'}`;
  
  return new Client({
    connectionString,
  });
}

/**
 * Execute a SQL query
 */
export async function executeQuery(query, params = []) {
  const client = getDbClient();
  try {
    await client.connect();
    const result = await client.query(query, params);
    return result;
  } finally {
    await client.end();
  }
}

/**
 * Clean up test users by phone number pattern
 */
export async function cleanupTestUsers(phonePattern = '%+1555%') {
  const client = getDbClient();
  try {
    await client.connect();
    // Delete in order to respect foreign key constraints
    
    // First, delete elo_history (references matches)
    await client.query(`
      DELETE FROM elo_history WHERE match_id IN (
        SELECT id FROM matches WHERE created_by IN (
          SELECT id FROM players WHERE user_id IN (
            SELECT id FROM users WHERE phone_number LIKE $1
          )
        )
      )
    `, [phonePattern]);
    
    await client.query(`
      DELETE FROM elo_history WHERE match_id IN (
        SELECT id FROM matches WHERE session_id IN (
          SELECT id FROM sessions WHERE created_by IN (
            SELECT id FROM players WHERE user_id IN (
              SELECT id FROM users WHERE phone_number LIKE $1
            )
          )
        )
      )
    `, [phonePattern]);
    
    // Then delete matches (they reference sessions)
    await client.query(`
      DELETE FROM matches WHERE created_by IN (
        SELECT id FROM players WHERE user_id IN (
          SELECT id FROM users WHERE phone_number LIKE $1
        )
      )
    `, [phonePattern]);
    
    // Delete matches that reference sessions created by test users
    await client.query(`
      DELETE FROM matches WHERE session_id IN (
        SELECT id FROM sessions WHERE created_by IN (
          SELECT id FROM players WHERE user_id IN (
            SELECT id FROM users WHERE phone_number LIKE $1
          )
        )
      )
    `, [phonePattern]);
    
    // Then delete sessions (they reference players via created_by)
    await client.query(`
      DELETE FROM sessions WHERE created_by IN (
        SELECT id FROM players WHERE user_id IN (
          SELECT id FROM users WHERE phone_number LIKE $1
        )
      )
    `, [phonePattern]);
    
    // Delete league members
    await client.query(`
      DELETE FROM league_members WHERE player_id IN (
        SELECT id FROM players WHERE user_id IN (
          SELECT id FROM users WHERE phone_number LIKE $1
        )
      )
    `, [phonePattern]);
    
    // Delete players
    await client.query(`
      DELETE FROM players WHERE user_id IN (
        SELECT id FROM users WHERE phone_number LIKE $1
      )
    `, [phonePattern]);
    
    await client.query(`
      DELETE FROM verification_codes WHERE phone_number LIKE $1
    `, [phonePattern]);
    
    await client.query(`
      DELETE FROM users WHERE phone_number LIKE $1
    `, [phonePattern]);
  } finally {
    await client.end();
  }
}

/**
 * Get a user by phone number
 */
export async function getUserByPhone(phoneNumber) {
  const result = await executeQuery(
    'SELECT * FROM users WHERE phone_number = $1',
    [phoneNumber]
  );
  return result.rows[0] || null;
}

/**
 * Get a player by user ID
 */
export async function getPlayerByUserId(userId) {
  const result = await executeQuery(
    'SELECT * FROM players WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Get verification code for a phone number
 * Returns the most recent unused (not expired) verification code
 * Note: expires_at is stored as ISO timestamp string, so we compare as strings
 */
export async function getVerificationCode(phoneNumber) {
  // expires_at is stored as ISO timestamp string, so we compare it as a string
  const now = new Date().toISOString();
  const result = await executeQuery(
    `SELECT code FROM verification_codes 
     WHERE phone_number = $1 
     AND used = false 
     AND expires_at > $2
     ORDER BY created_at DESC 
     LIMIT 1`,
    [phoneNumber, now]
  );
  return result.rows[0]?.code || null;
}

/**
 * Reset database state - truncate all tables (use with caution)
 */
export async function resetDatabase() {
  const client = getDbClient();
  try {
    await client.connect();
    // Disable foreign key checks temporarily (PostgreSQL doesn't have this, so we delete in order)
    // Delete in reverse dependency order
    await client.query('TRUNCATE TABLE matches, sessions, seasons, league_members, leagues, players, verification_codes, users RESTART IDENTITY CASCADE');
  } finally {
    await client.end();
  }
}
