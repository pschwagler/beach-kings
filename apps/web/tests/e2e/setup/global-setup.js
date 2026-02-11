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
        INSERT INTO locations (id, name, city, state, region_id, tier, latitude, longitude, seasonality, radius_miles)
        VALUES ('socal_sd', 'CA - San Diego', 'Mission Beach', 'CA', 'california', 1, 32.7698, -117.2514, 'Year-Round', 30)
        ON CONFLICT (id) DO NOTHING
      `);
      console.log('✓ Test location seeded');
    }

    await client.end();
  } catch (error) {
    console.error('✗ Test database connection failed:', error.message);
    console.error('Make sure the test database is running. You can start it with:');
    console.error('  docker-compose -f docker-compose.test.yml up -d postgres-test');
    // Don't throw - allow tests to run even if DB check fails (tests will fail if DB is actually down)
    console.warn('⚠ Continuing anyway - tests will fail if database is unavailable');
  }
  
  // Check if API is available
  const apiUrl = process.env.TEST_API_URL || 'http://localhost:8001';
  try {
    const response = await fetch(`${apiUrl}/api/leagues`).catch(() => null);
    if (!response) {
      console.warn('⚠ API health check failed, but continuing...');
      console.warn('Make sure the backend API is running on', apiUrl);
    } else {
      console.log('✓ API connection successful');
    }
  } catch (error) {
    console.warn('⚠ API health check failed, but continuing...');
    console.warn('Make sure the backend API is running on', apiUrl);
  }
  
  console.log('Global setup complete');
}

export default globalSetup;
