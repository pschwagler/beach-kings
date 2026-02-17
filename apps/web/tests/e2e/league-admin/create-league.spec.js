import { test, expect } from '../fixtures/test-fixtures.js';

/**
 * E2E tests for league creation via the Create League modal.
 *
 * Uses `testUser` + `authedPage`. The modal opens from the Leagues tab
 * on the home page.
 */

test.describe('Create League', () => {
  test('create a league via UI', async ({ authedPage }) => {
    const page = authedPage;

    // Navigate to Leagues tab
    await page.click('[data-testid="leagues-tab"]');
    await page.waitForTimeout(1000);

    // Click "Create League" button
    const createBtn = page.locator('.leagues-tab-create-btn');
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    // Modal should appear
    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Fill league name
    const leagueName = `E2E League ${Date.now()}`;
    await page.fill('#league-name', leagueName);

    // Fill description
    await page.fill('#league-description', 'Created by E2E test');

    // Leave "Open to everyone" as default (is_open: true)

    // Submit (scope to modal to avoid matching sidebar button)
    await modal.getByRole('button', { name: 'Create League' }).click();

    // Should navigate to the new league's detail page
    await page.waitForURL(/\/league\/\d+/, { timeout: 15000 });

    // Details tab should be active
    await page.waitForSelector('[data-testid="details-tab"]', { timeout: 10000 });

    // League name should be visible
    await expect(page.locator('.league-content-header-text')).toContainText(leagueName);
  });

  test('create league validates required fields', async ({ authedPage }) => {
    const page = authedPage;

    await page.click('[data-testid="leagues-tab"]');
    await page.waitForTimeout(1000);

    const createBtn = page.locator('.leagues-tab-create-btn');
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Leave name empty and submit (scope to modal)
    await modal.getByRole('button', { name: 'Create League' }).click();

    // Validation error should appear
    await expect(page.locator('.form-error')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.form-error')).toContainText('League name is required');

    // Modal should still be open
    await expect(modal).toBeVisible();
  });
});
