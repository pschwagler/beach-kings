import { cleanupTestUsers } from '../fixtures/db.js';

/**
 * Global setup for Playwright tests
 * This runs once before all tests
 */

async function globalSetup(config) {
  console.log('Running global setup...');

  // Check if test database is available
  const testDbUrl = process.env.TEST_DATABASE_URL ||
    `postgresql://${process.env.POSTGRES_USER || 'beachkings'}:${process.env.POSTGRES_PASSWORD || 'beachkings'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5433'}/${process.env.TEST_POSTGRES_DB || 'beachkings_test'}`;

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
      await cleanupTestUsers('%+1555%');
      console.log('✓ Orphaned test users cleaned up');
    } catch (cleanupErr) {
      console.warn('⚠ Test user cleanup failed:', cleanupErr.message);
    }

    // Seed test location if it doesn't exist (required for profile completion)
    const locationResult = await client.query(
      "SELECT id FROM locations WHERE id = 'socal_sd'"
    );
    if (locationResult.rows.length === 0) {
      // First ensure the region exists
      await client.query(`
        INSERT INTO regions (id, name)
        VALUES ('california', 'California')
        ON CONFLICT (id) DO NOTHING
      `);
      // Then insert the location
      await client.query(`
        INSERT INTO locations (id, name, city, state, region_id, tier, latitude, longitude, seasonality, radius_miles, slug)
        VALUES ('socal_sd', 'CA - San Diego', 'Mission Beach', 'CA', 'california', 1, 32.7698, -117.2514, 'Year-Round', 30, 'mission-beach-ca')
        ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug
      `);
      console.log('✓ Test location seeded');
    }

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
    console.error('Make sure the test database is running. You can start it with:');
    console.error('  docker-compose -f docker-compose.test.yml up -d postgres-test');
    // Don't throw - allow tests to run even if DB check fails (tests will fail if DB is actually down)
    console.warn('⚠ Continuing anyway - tests will fail if database is unavailable');
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
