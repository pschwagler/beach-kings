import { cleanupTestUsers, E2E_PHONE_LIKE_PATTERN } from '../fixtures/db.js';
import { LOCAL_E2E, verifyLocalE2ESafety } from './safety-gate.js';

/**
 * Global setup for Playwright tests
 * This runs once before all tests
 */

async function globalSetup(config) {
  console.log('Running global setup...');

  // This must run before cleanup or seeding. Any endpoint, container,
  // environment, or database mismatch aborts the run before a mutation.
  const safety = await verifyLocalE2ESafety();
  console.log(`✓ Local-only safety gate passed (${safety.database}, ENV=${safety.environment})`);

  // Check if test database is available
  const testDbUrl = process.env.TEST_DATABASE_URL || LOCAL_E2E.databaseUrl;

  console.log(`Test database URL: ${testDbUrl.replace(/:[^:@]+@/, ':****@')}`);

  // Verify database connection and seed required data
  try {
    const pg = await import('pg');
    const { Client } = pg.default || pg;
    const client = new Client({ connectionString: testDbUrl });
    await client.connect();
    await client.query('SELECT 1');
    console.log('✓ Test database connection successful');

    // Clean up orphaned test users from prior crashed runs.
    // This prevents AxiosError 400 on signup when phone numbers are already taken.
    try {
      await cleanupTestUsers(E2E_PHONE_LIKE_PATTERN);
      console.log('✓ Orphaned test users cleaned up');
    } catch (cleanupErr) {
      throw new Error(`Namespaced test-user cleanup failed: ${cleanupErr.message}`);
    }

    // Seed (or normalize) the test location required for profile completion.
    // The upsert runs unconditionally so an existing bootstrap row with a
    // stale slug (e.g. 'mission-beach') is corrected to 'mission-beach-ca'.
    await client.query(`
      INSERT INTO regions (id, name)
      VALUES ('california', 'California')
      ON CONFLICT (id) DO NOTHING
    `);
    await client.query(`
      INSERT INTO locations (id, name, city, state, region_id, tier, latitude, longitude, seasonality, radius_miles, slug)
      VALUES ('socal_sd', 'CA - San Diego', 'Mission Beach', 'CA', 'california', 1, 32.7698, -117.2514, 'Year-Round', 30, 'mission-beach-ca')
      ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug
    `);
    console.log('✓ Test location seeded');

    // Seed test courts if they don't exist (required for court-pages + court-reviews tests)
    const courtResult = await client.query(
      "SELECT id FROM courts WHERE slug = 'south-mission-beach-volleyball-courts-san-diego'"
    );
    if (courtResult.rows.length === 0) {
      await client.query(`
        INSERT INTO courts (name, slug, address, location_id, court_count, surface_type, is_free, has_lights, has_restrooms, has_parking, nets_provided, latitude, longitude, status, description)
        VALUES ('South Mission Beach Volleyball Courts', 'south-mission-beach-volleyball-courts-san-diego',
         'South Mission Beach, San Diego, CA 92109', 'socal_sd', 14, 'sand',
         true, false, true, true, true, 32.7598, -117.2534, 'approved',
         'Popular beach volleyball courts at South Mission Beach.')
      `);
      await client.query(`
        INSERT INTO courts (name, slug, address, location_id, court_count, surface_type, is_free, has_lights, has_restrooms, has_parking, nets_provided, latitude, longitude, status, description)
        VALUES ('Ocean Beach Volleyball Courts', 'ocean-beach-volleyball-courts-san-diego',
         'Ocean Beach, San Diego, CA 92107', 'socal_sd', 4, 'sand',
         true, false, true, true, false, 32.7498, -117.2534, 'approved',
         'Ocean Beach volleyball courts near the pier.')
      `);
      console.log('✓ Test courts seeded');
    }

    await client.end();
  } catch (error) {
    console.error('✗ Test database connection failed:', error.message);
    throw error;
  }
  
  // Wait for API to be ready (retry loop so cold-start backends don't cause all tests to fail)
  const apiUrl = process.env.TEST_API_URL || 'http://localhost:8001';
  const MAX_RETRIES = 30;
  const RETRY_DELAY_MS = 2000;
  let backendReady = false;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await fetch(`${apiUrl}/api/leagues`);
      if (response.ok) {
        backendReady = true;
        break;
      }
    } catch {
      // backend not yet reachable
    }
    if (i < MAX_RETRIES - 1) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  if (!backendReady) {
    throw new Error(
      `Backend API not ready after ${(MAX_RETRIES * RETRY_DELAY_MS) / 1000}s. ` +
      `Make sure the backend is running on ${apiUrl}`
    );
  }
  console.log('✓ API connection successful');
  
  console.log('Global setup complete');
}

export default globalSetup;
