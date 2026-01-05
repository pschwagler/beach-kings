/**
 * Per-test setup
 * This can be used as a Playwright fixture for test-specific setup
 */

import { test as base } from '@playwright/test';
import { cleanupTestUsers } from '../fixtures/db.js';

/**
 * Extended test with cleanup fixture
 */
export const test = base.extend({
  // Auto-cleanup test users after each test
  autoCleanup: async ({}, use) => {
    // Before test - no setup needed
    await use();
    
    // After test - cleanup test users
    // This will clean up users with phone numbers matching the test pattern
    try {
      await cleanupTestUsers('%+1555%');
    } catch (error) {
      console.warn('Failed to cleanup test users:', error.message);
    }
  },
});

export { expect } from '@playwright/test';

