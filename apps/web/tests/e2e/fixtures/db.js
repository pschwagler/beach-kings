import pg from 'pg';
const { Client } = pg;

/**
 * Validate that a connection string targets a test database.
 * Throws if the database name does not contain "test".
 *
 * @param {string} connectionString - PostgreSQL connection URL
 */
function assertTestDatabase(connectionString) {
  // Extract DB name: last path segment, strip query params
  const dbName = connectionString.split('/').pop().split('?')[0];
  if (!dbName || !dbName.toLowerCase().includes('test')) {
    throw new Error(
      `SAFETY: Refusing to connect to database '${dbName}'. ` +
      `The database name must contain 'test' to prevent accidental data loss. ` +
      `Set TEST_DATABASE_URL to a test database or use 'make test'.`
    );
  }
}

/**
 * Get a database connection for testing.
 * SAFETY: Refuses to connect if the database name doesn't contain "test".
 */
export function getDbClient() {
  const connectionString = process.env.TEST_DATABASE_URL ||
    `postgresql://${process.env.POSTGRES_USER || 'beachkings'}:${process.env.POSTGRES_PASSWORD || 'beachkings'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5433'}/${process.env.TEST_POSTGRES_DB || 'beachkings_test'}`;

  assertTestDatabase(connectionString);

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
 * Clean up all test data created by a user identified by phone number.
 *
 * Collects user/player/league/session/match IDs upfront, then deletes in
 * foreign-key-safe order covering all ~30 tables that can reference
 * test-created entities.
 *
 * @param {string} phonePattern - Phone number or LIKE pattern (default matches +1555 test numbers)
 */
export async function cleanupTestUsers(phonePattern = '%+1555%') {
  const client = getDbClient();
  try {
    await client.connect();

    // ── Collect IDs upfront ──────────────────────────────────────────────
    const userRows = await client.query(
      `SELECT id FROM users WHERE phone_number LIKE $1`, [phonePattern]
    );
    const userIds = userRows.rows.map(r => r.id);
    if (userIds.length === 0) return; // nothing to clean

    const playerRows = await client.query(
      `SELECT id FROM players WHERE user_id = ANY($1)`, [userIds]
    );
    const playerIds = playerRows.rows.map(r => r.id);

    // Leagues created by test players
    let leagueIds = [];
    if (playerIds.length > 0) {
      const leagueRows = await client.query(
        `SELECT id FROM leagues WHERE created_by = ANY($1)`, [playerIds]
      );
      leagueIds = leagueRows.rows.map(r => r.id);
    }

    // Seasons in those leagues
    let seasonIds = [];
    if (leagueIds.length > 0) {
      const seasonRows = await client.query(
        `SELECT id FROM seasons WHERE league_id = ANY($1)`, [leagueIds]
      );
      seasonIds = seasonRows.rows.map(r => r.id);
    }

    // Sessions created by test players
    let sessionIds = [];
    if (playerIds.length > 0) {
      const sessionRows = await client.query(
        `SELECT id FROM sessions WHERE created_by = ANY($1)`, [playerIds]
      );
      sessionIds = sessionRows.rows.map(r => r.id);
    }

    // Matches in those sessions
    let matchIds = [];
    if (sessionIds.length > 0) {
      const matchRows = await client.query(
        `SELECT id FROM matches WHERE session_id = ANY($1)`, [sessionIds]
      );
      matchIds = matchRows.rows.map(r => r.id);
    }

    // ── Delete in FK-safe order ──────────────────────────────────────────

    // 1. Rating history / elo history (leaf tables referencing matches, players, seasons)
    if (matchIds.length > 0) {
      await client.query(`DELETE FROM elo_history WHERE match_id = ANY($1)`, [matchIds]);
      await client.query(`DELETE FROM season_rating_history WHERE match_id = ANY($1)`, [matchIds]);
    }
    if (playerIds.length > 0) {
      await client.query(`DELETE FROM elo_history WHERE player_id = ANY($1)`, [playerIds]);
      await client.query(`DELETE FROM season_rating_history WHERE player_id = ANY($1)`, [playerIds]);
    }

    // 2. Stats tables (reference players, seasons, leagues)
    if (playerIds.length > 0) {
      await client.query(`DELETE FROM player_global_stats WHERE player_id = ANY($1)`, [playerIds]);
      await client.query(`DELETE FROM player_season_stats WHERE player_id = ANY($1)`, [playerIds]);
      await client.query(`DELETE FROM player_league_stats WHERE player_id = ANY($1)`, [playerIds]);
      await client.query(`DELETE FROM partnership_stats WHERE player_id = ANY($1) OR partner_id = ANY($1)`, [playerIds]);
      await client.query(`DELETE FROM partnership_stats_season WHERE player_id = ANY($1) OR partner_id = ANY($1)`, [playerIds]);
      await client.query(`DELETE FROM partnership_stats_league WHERE player_id = ANY($1) OR partner_id = ANY($1)`, [playerIds]);
      await client.query(`DELETE FROM opponent_stats WHERE player_id = ANY($1) OR opponent_id = ANY($1)`, [playerIds]);
      await client.query(`DELETE FROM opponent_stats_season WHERE player_id = ANY($1) OR opponent_id = ANY($1)`, [playerIds]);
      await client.query(`DELETE FROM opponent_stats_league WHERE player_id = ANY($1) OR opponent_id = ANY($1)`, [playerIds]);
    }

    // 3. Matches
    if (matchIds.length > 0) {
      await client.query(`DELETE FROM matches WHERE id = ANY($1)`, [matchIds]);
    }

    // 4. Session participants & sessions
    if (sessionIds.length > 0) {
      await client.query(`DELETE FROM session_participants WHERE session_id = ANY($1)`, [sessionIds]);
      await client.query(`DELETE FROM sessions WHERE id = ANY($1)`, [sessionIds]);
    }

    // 5. Signup chain
    if (playerIds.length > 0) {
      await client.query(`
        DELETE FROM signup_events WHERE signup_id IN (
          SELECT id FROM signups WHERE created_by = ANY($1)
        )`, [playerIds]);
      await client.query(`
        DELETE FROM signup_players WHERE signup_id IN (
          SELECT id FROM signups WHERE created_by = ANY($1)
        )`, [playerIds]);
      await client.query(`DELETE FROM signups WHERE created_by = ANY($1)`, [playerIds]);
    }

    // 6. Stats calculation & photo match jobs
    if (leagueIds.length > 0) {
      await client.query(`DELETE FROM stats_calculation_jobs WHERE league_id = ANY($1)`, [leagueIds]);
      await client.query(`DELETE FROM photo_match_jobs WHERE league_id = ANY($1)`, [leagueIds]);
    }

    // 7. Weekly schedules (reference seasons)
    if (seasonIds.length > 0) {
      await client.query(`DELETE FROM weekly_schedules WHERE season_id = ANY($1)`, [seasonIds]);
    }

    // 8. League data
    if (leagueIds.length > 0) {
      await client.query(`DELETE FROM league_members WHERE league_id = ANY($1)`, [leagueIds]);
      await client.query(`DELETE FROM league_requests WHERE league_id = ANY($1)`, [leagueIds]);
      await client.query(`DELETE FROM league_messages WHERE league_id = ANY($1)`, [leagueIds]);
      await client.query(`DELETE FROM league_configs WHERE league_id = ANY($1)`, [leagueIds]);
    }
    // Also remove any league_members referencing test players in OTHER leagues
    if (playerIds.length > 0) {
      await client.query(`DELETE FROM league_members WHERE player_id = ANY($1)`, [playerIds]);
      await client.query(`DELETE FROM league_requests WHERE player_id = ANY($1)`, [playerIds]);
    }

    // 9. Seasons
    if (seasonIds.length > 0) {
      await client.query(`DELETE FROM seasons WHERE id = ANY($1)`, [seasonIds]);
    }

    // 10. Leagues
    if (leagueIds.length > 0) {
      await client.query(`DELETE FROM leagues WHERE id = ANY($1)`, [leagueIds]);
    }

    // 11. Social / notifications
    if (playerIds.length > 0) {
      await client.query(`DELETE FROM friends WHERE player1_id = ANY($1) OR player2_id = ANY($1)`, [playerIds]);
    }
    if (userIds.length > 0) {
      await client.query(`DELETE FROM notifications WHERE user_id = ANY($1)`, [userIds]);
      await client.query(`DELETE FROM feedback WHERE user_id = ANY($1)`, [userIds]);
      await client.query(`DELETE FROM league_messages WHERE user_id = ANY($1)`, [userIds]);
    }

    // 12. Auth tokens
    if (userIds.length > 0) {
      await client.query(`DELETE FROM refresh_tokens WHERE user_id = ANY($1)`, [userIds]);
      await client.query(`DELETE FROM password_reset_tokens WHERE user_id = ANY($1)`, [userIds]);
    }

    // 12b. Placeholder players + invites created by test users
    if (playerIds.length > 0) {
      // Find placeholder players created by test users
      const phRows = await client.query(
        'SELECT id FROM players WHERE created_by_player_id = ANY($1) AND is_placeholder = true',
        [playerIds]
      );
      const phIds = phRows.rows.map(r => r.id);
      if (phIds.length > 0) {
        await client.query('DELETE FROM player_invites WHERE player_id = ANY($1)', [phIds]);
        // Null out match FKs referencing placeholder players
        for (const col of ['team1_player1_id', 'team1_player2_id', 'team2_player1_id', 'team2_player2_id']) {
          await client.query(`UPDATE matches SET ${col} = NULL WHERE ${col} = ANY($1)`, [phIds]);
        }
        await client.query('DELETE FROM league_members WHERE player_id = ANY($1)', [phIds]);
        await client.query('DELETE FROM session_participants WHERE player_id = ANY($1)', [phIds]);
        await client.query('DELETE FROM players WHERE id = ANY($1)', [phIds]);
      }
      // Also clean invites referencing the test user's own player_ids
      await client.query(
        'DELETE FROM player_invites WHERE player_id = ANY($1) OR created_by_player_id = ANY($1)',
        [playerIds]
      );
    }

    // 13. Players (created by test users AND "orphan" players created via /api/players)
    //     Before deleting, remove any matches that reference these players but
    //     weren't already cleaned up (e.g. after a claim transferred matches
    //     from testUser's session to secondTestUser's player).
    if (playerIds.length > 0) {
      // Find stale match IDs referencing these players that we haven't deleted yet
      const staleMatchRows = await client.query(
        `SELECT id FROM matches
         WHERE team1_player1_id = ANY($1)
            OR team1_player2_id = ANY($1)
            OR team2_player1_id = ANY($1)
            OR team2_player2_id = ANY($1)`,
        [playerIds]
      );
      const staleMatchIds = staleMatchRows.rows.map(r => r.id);
      if (staleMatchIds.length > 0) {
        await client.query('DELETE FROM elo_history WHERE match_id = ANY($1)', [staleMatchIds]);
        await client.query('DELETE FROM season_rating_history WHERE match_id = ANY($1)', [staleMatchIds]);
        await client.query('DELETE FROM matches WHERE id = ANY($1)', [staleMatchIds]);
      }
      await client.query(`DELETE FROM players WHERE id = ANY($1)`, [playerIds]);
    }

    // 14. Verification codes & users
    await client.query(`DELETE FROM verification_codes WHERE phone_number LIKE $1`, [phonePattern]);
    await client.query(`DELETE FROM users WHERE phone_number LIKE $1`, [phonePattern]);
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
 * Reset database state - truncate all tables.
 * SAFETY: Only operates on databases whose name contains "test" (enforced by getDbClient).
 */
export async function resetDatabase() {
  const client = getDbClient();
  try {
    await client.connect();

    // Double-check: query the actual database name from the connection
    const result = await client.query('SELECT current_database()');
    const dbName = result.rows[0]?.current_database;
    if (!dbName || !dbName.toLowerCase().includes('test')) {
      throw new Error(
        `SAFETY: resetDatabase() connected to '${dbName}' which is not a test database. Aborting.`
      );
    }

    await client.query('TRUNCATE TABLE matches, sessions, seasons, league_members, leagues, players, verification_codes, users RESTART IDENTITY CASCADE');
  } finally {
    await client.end();
  }
}
