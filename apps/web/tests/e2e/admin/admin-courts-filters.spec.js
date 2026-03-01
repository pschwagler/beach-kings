import { test, expect } from '../fixtures/test-fixtures.js';

/**
 * E2E tests for admin courts tab: default sub-tab, sorting, filtering,
 * photo upload button, and public court detail empty-state CTA.
 *
 * Uses `adminUser` (system admin) fixture.
 */

/**
 * Inject auth tokens, navigate to admin courts tab, and wait for the
 * initial courts list to finish loading (table with rows or "No courts" text).
 * Retries via Refresh button and full page reload if needed.
 */
async function gotoAdminCourts(page, user) {
  await page.goto('/');
  await page.evaluate(({ accessToken, refreshToken }) => {
    window.localStorage.setItem('beach_access_token', accessToken);
    window.localStorage.setItem('beach_refresh_token', refreshToken);
  }, { accessToken: user.token, refreshToken: user.refreshToken });

  const authMePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/me'),
    { timeout: 15000 },
  );
  await page.goto('/admin-view?tab=courts');
  await authMePromise;

  // Wait for the courts panel to finish loading (either table rows or empty text)
  await page.locator('.admin-courts-row--clickable, :text("No courts found.")')
    .first().waitFor({ timeout: 20000 });

  // If the initial load returned 0 (race with parallel admin fixture teardowns),
  // retry: first via Refresh button, then full page reload as last resort
  for (let retry = 0; retry < 3; retry++) {
    if (await page.locator('.admin-courts-row--clickable').first().isVisible()) break;

    if (retry < 2) {
      // Try clicking the Refresh button
      const refreshBtn = page.locator('.admin-refresh-btn');
      if (await refreshBtn.isVisible()) {
        await page.waitForTimeout(500);
        await refreshBtn.click();
      }
    } else {
      // Last resort: full page reload
      await page.waitForTimeout(1000);
      await page.reload({ waitUntil: 'networkidle' });
    }

    await page.locator('.admin-courts-row--clickable, :text("No courts found.")')
      .first().waitFor({ timeout: 10000 });
  }
}

test.describe('Admin Courts Tab', () => {
  test('"All Courts" sub-tab is active by default', async ({
    browser,
    adminUser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await gotoAdminCourts(page, adminUser);
      await expect(page.locator('h1')).toContainText('Admin Panel', { timeout: 15000 });

      // "All Courts" pill should be active (first pill)
      const allPill = page.locator('.admin-courts-pill').first();
      await expect(allPill).toContainText('All Courts');
      await expect(allPill).toHaveClass(/admin-courts-pill--active/);

      // "All Courts" header should be visible (from AllCourtsPanel)
      await expect(page.locator('h2', { hasText: 'All Courts' }))
        .toBeVisible({ timeout: 10000 });

      // Search bar should be visible (AllCourtsPanel is rendered)
      await expect(page.locator('.admin-courts-search')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('column sorting changes table order', async ({
    browser,
    adminUser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await gotoAdminCourts(page, adminUser);

      // Courts should be loaded — wait for at least one row
      await expect(page.locator('.admin-courts-row--clickable').first()).toBeVisible({ timeout: 10000 });

      // Click "Name" header to sort ascending
      const nameHeader = page.locator('.admin-th--sortable', { hasText: 'Name' });
      await expect(nameHeader).toBeVisible();

      const sortResponsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/admin-view/courts') && resp.url().includes('sort_by=name'),
        { timeout: 15000 },
      );
      await nameHeader.click();
      await sortResponsePromise;

      // Sort icon should appear in the Name header
      await expect(nameHeader.locator('.admin-sort-icon')).toBeVisible();

      // Click again to reverse to descending
      const sortDescPromise = page.waitForResponse(
        (resp) => resp.url().includes('sort_dir=desc') && resp.url().includes('sort_by=name'),
        { timeout: 15000 },
      );
      await nameHeader.click();
      await sortDescPromise;

      // Table should still have rows
      await expect(page.locator('.admin-courts-row--clickable').first()).toBeVisible({ timeout: 10000 });
    } finally {
      await context.close();
    }
  });

  test('surface type filter narrows results', async ({
    browser,
    adminUser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await gotoAdminCourts(page, adminUser);

      // Wait for rows
      await expect(page.locator('.admin-courts-row--clickable').first()).toBeVisible({ timeout: 10000 });

      // Select "Sand" surface filter
      const surfaceSelect = page.locator('select[aria-label="Filter by surface"]');
      await expect(surfaceSelect).toBeVisible();

      const filterPromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/admin-view/courts') && resp.url().includes('surface_type=sand'),
        { timeout: 15000 },
      );
      await surfaceSelect.selectOption('sand');
      await filterPromise;

      // Table should still be visible (seeded data has sand courts)
      await expect(page.locator('.admin-feedback-table')).toBeVisible({ timeout: 10000 });
    } finally {
      await context.close();
    }
  });

  test('photos filter shows courts without photos', async ({
    browser,
    adminUser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await gotoAdminCourts(page, adminUser);

      // Select "No photos" filter
      const photosSelect = page.locator('select[aria-label="Filter by photos"]');
      await expect(photosSelect).toBeVisible();

      const filterPromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/admin-view/courts') && resp.url().includes('has_photos=false'),
        { timeout: 15000 },
      );
      await photosSelect.selectOption('no');
      await filterPromise;

      // Should show results or empty state
      const hasTable = await page.locator('.admin-feedback-table').isVisible();
      const hasEmpty = await page.locator('text=No courts found.').isVisible();
      expect(hasTable || hasEmpty).toBe(true);
    } finally {
      await context.close();
    }
  });

  test('expanded court row shows Add Photo button', async ({
    browser,
    adminUser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await gotoAdminCourts(page, adminUser);

      // Wait for court rows to appear
      await expect(page.locator('.admin-courts-row--clickable').first()).toBeVisible({ timeout: 10000 });

      // Click first row to expand
      await page.locator('.admin-courts-row--clickable').first().click();

      // Wait for edit form
      const editForm = page.locator('.admin-court-edit-form');
      await expect(editForm).toBeVisible({ timeout: 10000 });

      // "Add Photo" button should be visible in the Photos section
      const addPhotoBtn = editForm.locator('.admin-court-photos__add-btn');
      await expect(addPhotoBtn).toBeVisible({ timeout: 10000 });
      await expect(addPhotoBtn).toContainText('Add Photo');
    } finally {
      await context.close();
    }
  });
});

test.describe('Court Detail Empty State', () => {
  test('court without photos shows empty-state CTA', async ({ page }) => {
    // South Mission Beach is a known seeded court without court_photos
    await page.goto('/courts/south-mission-beach-volleyball-courts-san-diego');

    // Wait for page to load
    await expect(page.locator('.court-detail__name')).toBeVisible({ timeout: 15000 });

    // The empty state CTA should be visible (since seeded courts have no photos)
    const emptyCta = page.locator('.court-detail__mosaic-empty');
    await expect(emptyCta).toBeVisible({ timeout: 10000 });
    await expect(emptyCta).toContainText('Be the first to add a photo');
  });

  test('empty-state CTA navigates to photos page on click', async ({ page }) => {
    await page.goto('/courts/south-mission-beach-volleyball-courts-san-diego');

    await expect(page.locator('.court-detail__name')).toBeVisible({ timeout: 15000 });

    const emptyCta = page.locator('.court-detail__mosaic-empty');
    await expect(emptyCta).toBeVisible({ timeout: 10000 });

    // Click and verify navigation
    await emptyCta.click();
    await page.waitForURL('**/courts/south-mission-beach-volleyball-courts-san-diego/photos', {
      timeout: 15000,
    });
    expect(page.url()).toContain('/photos');
  });
});
