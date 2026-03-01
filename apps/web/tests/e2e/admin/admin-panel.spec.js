import { test, expect } from '../fixtures/test-fixtures.js';

/**
 * E2E tests for the admin panel access and basic functionality.
 *
 * Uses `adminUser` (system admin) fixture.
 * Admin panel is at /admin-view.
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

      // Admin panel container and title should be visible
      await expect(page.locator('.admin-view-container')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('h1')).toContainText('Admin Panel', { timeout: 10000 });

      // Dashboard tab (default) should load with Platform Stats
      await expect(page.locator('h2', { hasText: 'Platform Stats' }))
        .toBeVisible({ timeout: 10000 });
    } finally {
      await context.close();
    }
  });

  test('admin panel has all tab buttons', async ({
    browser,
    adminUser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, adminUser, '/admin-view');
      await expect(page.locator('.admin-view-container')).toBeVisible({ timeout: 15000 });

      // All four tabs should be present
      await expect(page.locator('.admin-tab-btn', { hasText: 'Dashboard' })).toBeVisible();
      await expect(page.locator('.admin-tab-btn', { hasText: 'Settings' })).toBeVisible();
      await expect(page.locator('.admin-tab-btn', { hasText: 'Courts' })).toBeVisible();
      await expect(page.locator('.admin-tab-btn', { hasText: 'Feedback' })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('tab switching works', async ({
    browser,
    adminUser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, adminUser, '/admin-view');
      await expect(page.locator('.admin-view-container')).toBeVisible({ timeout: 15000 });

      // Click Courts tab
      await page.locator('.admin-tab-btn', { hasText: 'Courts' }).click();

      // Courts sub-tab pills should appear
      await expect(page.locator('.admin-courts-pill').first()).toBeVisible({ timeout: 10000 });

      // URL should update
      await expect(page).toHaveURL(/tab=courts/);
    } finally {
      await context.close();
    }
  });
});
