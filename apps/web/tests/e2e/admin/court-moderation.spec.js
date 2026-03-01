import { test, expect } from '../fixtures/test-fixtures.js';
import { createApiClient } from '../fixtures/api.js';

/**
 * E2E tests for admin court moderation (approve/reject pending courts).
 *
 * Uses `adminUser` (system admin) + a test user who submits a court.
 * Admin panel is at /admin-view?tab=courts with "Pending Submissions" sub-tab.
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

/**
 * Navigate to admin courts tab and switch to the Pending Submissions sub-tab.
 */
async function gotoPendingSubmissions(page, user) {
  await authenticateAndGoto(page, user, '/admin-view?tab=courts');

  // Admin panel should load
  await expect(page.locator('h1')).toContainText('Admin Panel', { timeout: 15000 });

  // Click "Pending Submissions" pill
  const pendingPill = page.locator('.admin-courts-pill', { hasText: 'Pending Submissions' });
  await expect(pendingPill).toBeVisible({ timeout: 10000 });
  await pendingPill.click();

  // Wait for pending submissions panel to load
  await expect(page.locator('h2', { hasText: 'Pending Submissions' }))
    .toBeVisible({ timeout: 10000 });
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
      await gotoPendingSubmissions(page, adminUser);

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
      await gotoPendingSubmissions(page, adminUser);

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
      await gotoPendingSubmissions(page, adminUser);

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
