/**
 * Global teardown for Playwright tests
 * This runs once after all tests
 */

import { cleanupTestUsers, E2E_PHONE_LIKE_PATTERN } from '../fixtures/db.js';
import { verifyLocalE2ESafety } from './safety-gate.js';

async function globalTeardown(config) {
  console.log('Running global teardown...');

  // Re-run the fail-closed gate immediately before teardown mutations and
  // delete only records in the dedicated E2E phone namespace.
  await verifyLocalE2ESafety();
  await cleanupTestUsers(E2E_PHONE_LIKE_PATTERN);
  console.log('✓ Namespaced E2E records cleaned up');

  console.log('Global teardown complete');
}

export default globalTeardown;
