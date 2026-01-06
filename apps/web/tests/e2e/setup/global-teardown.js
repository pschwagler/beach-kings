/**
 * Global teardown for Playwright tests
 * This runs once after all tests
 */

async function globalTeardown(config) {
  console.log('Running global teardown...');
  
  // Cleanup can be done here if needed
  // For example, closing database connections, cleaning up test data, etc.
  
  console.log('Global teardown complete');
}

export default globalTeardown;
