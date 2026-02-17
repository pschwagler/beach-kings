import { test, expect } from '../fixtures/test-fixtures.js';
import { createApiClient } from '../fixtures/api.js';

/**
 * E2E tests for admin court moderation (approve/reject pending courts).
 *
 * Uses `adminUser` (system admin) + a test user who submits a court.
 * Admin panel is at /admin-view with court submissions section.
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

/**
 * Submit a pending court via API (as a regular user).
 */
async function submitPendingCourt(token, name) {
  const api = createApiClient(token);
  const response = await api.post('/api/courts/submit', {
    name,
    address: '123 Test Beach, San Diego, CA 92109',
    location_id: 'socal_sd',
    surface_type: 'sand',
    court_count: 2,
    is_free: true,
  });
  return response.data;
}

test.describe('Court Moderation', () => {
  test('view pending court submissions', async ({
    browser,
    adminUser,
    testUser,
  }) => {
    // Submit a court as regular user
    const courtName = `Pending Court ${Date.now()}`;
    await submitPendingCourt(testUser.token, courtName);

    // Navigate to admin view as admin
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, adminUser, '/admin-view');

      // Admin panel should load
      await expect(page.locator('h1')).toContainText('Admin Configuration', { timeout: 15000 });

      // Court Submissions section should be visible
      await expect(page.locator('h2', { hasText: 'Court Submissions' }))
        .toBeVisible({ timeout: 10000 });

      // The submitted court should appear in the table
      await expect(page.locator('.admin-feedback-table', { hasText: courtName }))
        .toBeVisible({ timeout: 10000 });
    } finally {
      await context.close();
    }
  });

  test('approve a court submission', async ({
    browser,
    adminUser,
    testUser,
  }) => {
    // Submit a court
    const courtName = `Approve Court ${Date.now()}`;
    await submitPendingCourt(testUser.token, courtName);

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, adminUser, '/admin-view');
      await expect(page.locator('h1')).toContainText('Admin Configuration', { timeout: 15000 });

      // Wait for the table with the court
      const courtRow = page.locator('tr', { hasText: courtName });
      await expect(courtRow).toBeVisible({ timeout: 15000 });

      // Click Approve button
      const approveBtn = courtRow.locator('[aria-label="Approve court"]');
      await expect(approveBtn).toBeVisible();
      await approveBtn.click();

      // Court should be removed from the pending list
      await expect(courtRow).toBeHidden({ timeout: 15000 });
    } finally {
      await context.close();
    }
  });

  test('reject a court submission', async ({
    browser,
    adminUser,
    testUser,
  }) => {
    // Submit another court
    const courtName = `Reject Court ${Date.now()}`;
    await submitPendingCourt(testUser.token, courtName);

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, adminUser, '/admin-view');
      await expect(page.locator('h1')).toContainText('Admin Configuration', { timeout: 15000 });

      // Wait for the table with the court
      const courtRow = page.locator('tr', { hasText: courtName });
      await expect(courtRow).toBeVisible({ timeout: 15000 });

      // Click Reject button
      const rejectBtn = courtRow.locator('[aria-label="Reject court"]');
      await expect(rejectBtn).toBeVisible();
      await rejectBtn.click();

      // Court should be removed from the pending list
      await expect(courtRow).toBeHidden({ timeout: 15000 });
    } finally {
      await context.close();
    }
  });
});
