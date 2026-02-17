import { test, expect } from '../fixtures/test-fixtures.js';

/**
 * E2E tests for the admin panel access and basic functionality.
 *
 * Uses `adminUser` (system admin) and `testUser` (non-admin).
 * Admin panel is at /admin-view.
 *
 * NOTE: The admin panel has two auth checks:
 * - require_system_admin: for court moderation (configurable via DB settings)
 * - require_admin_phone: for config/feedback (hardcoded to +17167831211)
 * The adminUser fixture grants require_system_admin access.
 * The config/feedback sections may show access errors unless the phone matches.
 */

/**
 * Inject auth tokens and navigate to a path, waiting for /api/auth/me.
 */
async function authenticateAndGoto(page, user, path) {
  await page.goto('/');
  await page.evaluate(({ accessToken, refreshToken }) => {
    window.localStorage.setItem('beach_access_token', accessToken);
    window.localStorage.setItem('beach_refresh_token', refreshToken);
  }, { accessToken: user.token, refreshToken: user.refreshToken });

  const authMePromise = page.waitForResponse(
    resp => resp.url().includes('/api/auth/me'),
    { timeout: 15000 },
  );
  await page.goto(path);
  await authMePromise;
}

test.describe('Admin Panel', () => {
  test('admin panel loads for system admin', async ({
    browser,
    adminUser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, adminUser, '/admin-view');

      // The page should load without showing an access denied error
      // The admin container should be visible
      await expect(page.locator('.admin-view-container')).toBeVisible({ timeout: 15000 });

      // Court Submissions section should be accessible (uses require_system_admin)
      await expect(page.locator('h2', { hasText: 'Court Submissions' }))
        .toBeVisible({ timeout: 10000 });
    } finally {
      await context.close();
    }
  });

  test('non-admin sees access denied', async ({
    browser,
    testUser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, testUser, '/admin-view');

      // Should show access denied or error message
      await expect(page.locator('.error-message')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('.error-message')).toContainText('Access denied');
    } finally {
      await context.close();
    }
  });

  test('unauthenticated user sees login prompt', async ({ page }) => {
    // Visit admin panel without auth
    await page.goto('/admin-view');

    // Should show a login required error or redirect
    // The page renders in admin-view-container with an error
    await expect(page.locator('.admin-view-container')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.error-message')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.error-message')).toContainText('log in');
  });
});
