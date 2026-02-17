import { test, expect } from '../fixtures/test-fixtures.js';
import { createTestLeague } from '../utils/test-helpers.js';

/**
 * E2E tests for season creation and editing within a league.
 *
 * Uses `testUser` + `authedPage` + a league created via API.
 * The season UI is on the league's Details tab.
 */

test.describe('Manage Seasons', () => {
  test('create a season via UI', async ({ authedPage, testUser }) => {
    const page = authedPage;

    // Create a league via API
    const league = await createTestLeague(testUser.token, {
      name: `Season Test League ${Date.now()}`,
    });

    // Navigate to league details tab
    await page.goto(`/league/${league.id}?tab=details`);
    await page.waitForSelector('[data-testid="details-tab"]', { timeout: 15000 });

    // Click "New Season" in Seasons section
    const newSeasonBtn = page.locator('.league-seasons-section .league-text-button');
    await expect(newSeasonBtn).toBeVisible({ timeout: 10000 });
    await newSeasonBtn.click();

    // Modal should appear
    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Fill season name
    const seasonName = `E2E Season ${Date.now()}`;
    await page.fill('#season-name', seasonName);

    // Start date and end date should be pre-filled with defaults
    // Just verify they're present
    await expect(page.locator('#season-start-date')).toBeVisible();
    await expect(page.locator('#season-end-date')).toBeVisible();

    // Submit
    await page.getByRole('button', { name: 'Create Season' }).click();

    // Modal should close
    await expect(modal).toBeHidden({ timeout: 15000 });

    // Season should appear in the seasons list
    await expect(page.locator('.league-season-item')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.league-season-name')).toContainText(seasonName);

    // Should show "Active" badge
    await expect(page.locator('.league-season-active')).toBeVisible();
  });

  test('edit a season', async ({ authedPage, testUser }) => {
    const page = authedPage;

    // Create a league + season via API
    const league = await createTestLeague(testUser.token, {
      name: `Edit Season League ${Date.now()}`,
    });

    // Create season via API using test helper
    const { createTestSeason } = await import('../utils/test-helpers.js');
    const season = await createTestSeason(testUser.token, league.id, {
      name: `Original Season ${Date.now()}`,
    });

    // Navigate to league details tab
    await page.goto(`/league/${league.id}?tab=details`);
    await page.waitForSelector('[data-testid="details-tab"]', { timeout: 15000 });

    // Wait for seasons section to load
    await expect(page.locator('.league-season-item')).toBeVisible({ timeout: 10000 });

    // Click the edit button on the season
    const editBtn = page.locator('.edit-season-button');
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();

    // Edit modal should appear
    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Change the end date (extend by a month)
    const endDateInput = page.locator('#season-end-date');
    await endDateInput.clear();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 120);
    const futureDateStr = futureDate.toISOString().split('T')[0];
    await endDateInput.fill(futureDateStr);

    // Save
    await page.getByRole('button', { name: 'Update Season' }).click();

    // Modal should close
    await expect(modal).toBeHidden({ timeout: 15000 });

    // Season dates should reflect the update
    await expect(page.locator('.league-season-dates')).toBeVisible();
  });
});
