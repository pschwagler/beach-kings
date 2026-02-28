import { test, expect } from '../fixtures/test-fixtures.js';
import { executeQuery } from '../fixtures/db.js';
import { createApiClient } from '../fixtures/api.js';

/**
 * E2E tests for admin court photo management.
 *
 * Covers: viewing photos, cover badge, reorder via API, delete with
 * inline confirm, and confirm-cancel auto-reset.
 *
 * Uses `adminUser` fixture and seeds court_photos rows directly in the
 * DB with dummy URLs (no S3 dependency).
 */

/** Inject auth tokens and navigate to a path, waiting for /api/auth/me. */
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
 * Seed court_photos rows for a given court.
 * Returns the inserted photo IDs in sort_order.
 */
async function seedCourtPhotos(courtId, count = 3) {
  const ids = [];
  for (let i = 0; i < count; i++) {
    const result = await executeQuery(
      `INSERT INTO court_photos (court_id, s3_key, url, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        courtId,
        `test/court-${courtId}/photo-${i}.jpg`,
        `https://placehold.co/400x300?text=Photo+${i}`,
        i,
      ],
    );
    ids.push(result.rows[0].id);
  }
  return ids;
}

/** Delete test court_photos by IDs. */
async function cleanupCourtPhotos(photoIds) {
  if (photoIds.length === 0) return;
  await executeQuery(
    `DELETE FROM court_photos WHERE id = ANY($1)`,
    [photoIds],
  );
}

/**
 * Get the seeded test court ID (South Mission Beach, inserted by global-setup).
 */
async function getTestCourtId() {
  const result = await executeQuery(
    `SELECT id FROM courts WHERE slug = 'south-mission-beach-volleyball-courts-san-diego'`,
  );
  if (result.rows.length === 0) {
    throw new Error('Test court not found — ensure global-setup seeds it');
  }
  return result.rows[0].id;
}

/**
 * Navigate to admin All Courts tab, search for the test court, and
 * expand its row to reveal the inline edit form with Photos section.
 *
 * Returns the expanded edit form locator.
 */
async function expandTestCourtRow(page) {
  // Courts main tab is already active via ?tab=courts in the URL.
  // Switch to "All Courts" sub-tab.
  const allPill = page.locator('.admin-courts-pill', { hasText: 'All Courts' });
  await expect(allPill).toBeVisible({ timeout: 10000 });
  await allPill.click();

  // Wait for initial courts list to load, then search
  const searchInput = page.locator('.admin-courts-search');
  await expect(searchInput).toBeVisible({ timeout: 10000 });

  // Wait for initial load to finish (table or "No courts" text)
  await page.locator('.admin-feedback-table, :text("No courts found.")').first()
    .waitFor({ timeout: 15000 });

  // Type search and wait for the debounced API response
  const searchResponsePromise = page.waitForResponse(
    resp => resp.url().includes('/api/admin/courts') && resp.url().includes('search')
      && resp.status() === 200,
    { timeout: 15000 },
  );
  await searchInput.fill('South Mission Beach');
  await searchResponsePromise;

  // Wait for table row to appear
  const courtRow = page.locator('.admin-courts-row--clickable', {
    hasText: 'South Mission Beach',
  });
  await expect(courtRow).toBeVisible({ timeout: 15000 });

  // Click to expand
  await courtRow.click();

  // Wait for the edit form to appear
  const editForm = page.locator('.admin-court-edit-form');
  await expect(editForm).toBeVisible({ timeout: 10000 });

  return editForm;
}

test.describe('Admin Court Photos', () => {
  test.describe.configure({ mode: 'serial' });
  let courtId;
  let photoIds;

  test.beforeAll(async () => {
    courtId = await getTestCourtId();
  });

  test.afterAll(async () => {
    // Clean up any remaining photos (individual tests also clean up, but
    // this catches leftovers from failed tests).
    try {
      await executeQuery(
        `DELETE FROM court_photos WHERE court_id = $1 AND s3_key LIKE 'test/%'`,
        [courtId],
      );
    } catch { /* best-effort */ }
  });

  test('admin can view court photos in expanded row', async ({
    browser,
    adminUser,
  }) => {
    // Seed photos
    photoIds = await seedCourtPhotos(courtId, 3);

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, adminUser, '/admin-view?tab=courts');

      const editForm = await expandTestCourtRow(page);

      // Wait for photos to load (detail fetch happens on expand)
      const photosGrid = editForm.locator('.admin-court-photos__grid');
      await expect(photosGrid).toBeVisible({ timeout: 15000 });

      // Verify 3 thumbnails render
      const thumbs = editForm.locator('.admin-court-photos__thumb');
      await expect(thumbs).toHaveCount(3, { timeout: 10000 });
    } finally {
      await context.close();
      await cleanupCourtPhotos(photoIds);
    }
  });

  test('cover badge shows on first photo only', async ({
    browser,
    adminUser,
  }) => {
    photoIds = await seedCourtPhotos(courtId, 3);

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, adminUser, '/admin-view?tab=courts');

      const editForm = await expandTestCourtRow(page);

      // Wait for photos grid
      await expect(
        editForm.locator('.admin-court-photos__grid'),
      ).toBeVisible({ timeout: 15000 });

      // Exactly one cover badge should exist
      const badges = editForm.locator('.admin-court-photos__cover-badge');
      await expect(badges).toHaveCount(1);

      // Badge should be inside the first photo item
      const firstItem = editForm.locator('.admin-court-photos__item').first();
      await expect(firstItem.locator('.admin-court-photos__cover-badge')).toBeVisible();

      // Second item should NOT have a cover badge
      const secondItem = editForm.locator('.admin-court-photos__item').nth(1);
      await expect(secondItem.locator('.admin-court-photos__cover-badge')).toHaveCount(0);
    } finally {
      await context.close();
      await cleanupCourtPhotos(photoIds);
    }
  });

  test('photo reorder via API persists after reload', async ({
    browser,
    adminUser,
  }) => {
    photoIds = await seedCourtPhotos(courtId, 3);
    const [idA, idB, idC] = photoIds;

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, adminUser, '/admin-view?tab=courts');

      // Reorder via admin API: move last photo to first
      const api = createApiClient(adminUser.token);
      await api.put(`/api/admin/courts/${courtId}/photos/reorder`, {
        photo_ids: [idC, idA, idB],
      });

      // Reload and expand the court row
      await page.reload({ waitUntil: 'networkidle' });
      const editForm = await expandTestCourtRow(page);

      // Wait for photo grid
      await expect(
        editForm.locator('.admin-court-photos__grid'),
      ).toBeVisible({ timeout: 15000 });

      // The cover badge should be on the first photo (which is now idC).
      // Verify by checking that the first item's img src matches Photo 2
      // (the third photo seeded, index 2, now first after reorder).
      const firstThumb = editForm.locator('.admin-court-photos__item').first()
        .locator('.admin-court-photos__thumb');
      await expect(firstThumb).toHaveAttribute('src', /Photo\+2/);
    } finally {
      await context.close();
      await cleanupCourtPhotos(photoIds);
    }
  });

  test('photo delete with inline confirm', async ({
    browser,
    adminUser,
  }) => {
    photoIds = await seedCourtPhotos(courtId, 2);

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, adminUser, '/admin-view?tab=courts');

      const editForm = await expandTestCourtRow(page);

      await expect(
        editForm.locator('.admin-court-photos__grid'),
      ).toBeVisible({ timeout: 15000 });

      // Should start with 2 photos
      await expect(editForm.locator('.admin-court-photos__thumb')).toHaveCount(2);

      // Click delete on the first photo — should show "Confirm?"
      const firstDeleteBtn = editForm.locator('.admin-court-photos__delete').first();
      await firstDeleteBtn.click();

      // Button should enter confirm state
      await expect(firstDeleteBtn).toHaveClass(/admin-court-photos__delete--confirm/);
      await expect(firstDeleteBtn).toContainText('Confirm?');

      // Click again to execute the delete
      await firstDeleteBtn.click();

      // Photo should be removed — only 1 thumbnail left
      await expect(editForm.locator('.admin-court-photos__thumb')).toHaveCount(1, {
        timeout: 10000,
      });
    } finally {
      await context.close();
      // Only clean up the remaining photo (first was deleted via UI)
      await cleanupCourtPhotos([photoIds[1]]);
    }
  });

  test('photo delete cancel resets after timeout', async ({
    browser,
    adminUser,
  }) => {
    photoIds = await seedCourtPhotos(courtId, 2);

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, adminUser, '/admin-view?tab=courts');

      const editForm = await expandTestCourtRow(page);

      await expect(
        editForm.locator('.admin-court-photos__grid'),
      ).toBeVisible({ timeout: 15000 });

      // Click delete once — enters confirm state
      const firstDeleteBtn = editForm.locator('.admin-court-photos__delete').first();
      await firstDeleteBtn.click();

      await expect(firstDeleteBtn).toHaveClass(/admin-court-photos__delete--confirm/);
      await expect(firstDeleteBtn).toContainText('Confirm?');

      // Wait 3.5s for the auto-reset (timer is 3s)
      await page.waitForTimeout(3500);

      // Confirm state should have reset — no longer has --confirm class
      await expect(firstDeleteBtn).not.toHaveClass(/admin-court-photos__delete--confirm/);

      // Both photos should still be present
      await expect(editForm.locator('.admin-court-photos__thumb')).toHaveCount(2);
    } finally {
      await context.close();
      await cleanupCourtPhotos(photoIds);
    }
  });
});
