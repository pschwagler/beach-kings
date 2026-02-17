import { test, expect } from '../fixtures/test-fixtures.js';
import { createTestLeague, createTestSeason } from '../utils/test-helpers.js';

/**
 * E2E tests for weekly schedule CRUD within a league.
 *
 * Uses `testUser` (league admin) + `authedPage`.
 * Schedule management is on the Sign Ups tab.
 */

test.describe('Weekly Schedules', () => {
  test('create weekly schedule', async ({ authedPage, testUser }) => {
    const page = authedPage;

    // Create league + season via API
    const league = await createTestLeague(testUser.token, {
      name: `Schedule League ${Date.now()}`,
    });
    await createTestSeason(testUser.token, league.id, {
      name: `Schedule Season ${Date.now()}`,
    });

    // Navigate to Sign Ups tab
    await page.goto(`/league/${league.id}?tab=signups`);
    await page.waitForSelector('[data-testid="signups-tab"][aria-current="page"]', { timeout: 15000 });

    // Click "Create Weekly Scheduled Session"
    const createBtn = page.locator('button.league-text-button', {
      hasText: 'Create Weekly Scheduled Session',
    });
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    // Modal should appear
    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Fill day of week (Wednesday = 2)
    await page.locator('#day-of-week').selectOption('2');

    // Set start time
    await page.fill('#start-time', '18:30');

    // Set duration
    await page.fill('#duration-hours', '2.5');

    // Start and end dates should be pre-filled

    // Submit
    await page.locator('button.league-text-button.primary', {
      hasText: 'Create Schedule',
    }).click();

    // Modal should close
    await expect(modal).toBeHidden({ timeout: 15000 });

    // Schedule should appear in the list
    const scheduleRow = page.locator('.league-schedule-row');
    await expect(scheduleRow.first()).toBeVisible({ timeout: 10000 });
    await expect(scheduleRow.first().locator('.league-schedule-title'))
      .toContainText('Wednesday');
  });

  test('edit weekly schedule', async ({ authedPage, testUser }) => {
    const page = authedPage;

    // Create league + season + schedule via API
    const league = await createTestLeague(testUser.token, {
      name: `Edit Schedule League ${Date.now()}`,
    });
    const season = await createTestSeason(testUser.token, league.id, {
      name: `Edit Schedule Season ${Date.now()}`,
    });

    // Create a schedule via API
    const { createApiClient } = await import('../fixtures/api.js');
    const api = createApiClient(testUser.token);
    await api.post(`/api/seasons/${season.id}/weekly-schedules`, {
      day_of_week: 1, // Tuesday
      start_time: '17:00',
      duration_hours: 2,
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
    });

    // Navigate to Sign Ups tab
    await page.goto(`/league/${league.id}?tab=signups`);
    await page.waitForSelector('[data-testid="signups-tab"][aria-current="page"]', { timeout: 15000 });

    // Wait for schedule row
    const scheduleRow = page.locator('.league-schedule-row');
    await expect(scheduleRow.first()).toBeVisible({ timeout: 10000 });

    // Click Edit
    await scheduleRow.first().locator('button.league-text-button', {
      hasText: 'Edit',
    }).click();

    // Edit modal should appear
    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Change start time
    await page.fill('#start-time', '19:00');

    // Click Update
    await page.locator('button.league-text-button.primary', {
      hasText: 'Update Schedule',
    }).click();

    // May show confirmation step — click confirm if visible
    const confirmBtn = page.locator('button.league-text-button.primary', {
      hasText: 'Confirm Update',
    });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Modal should close
    await expect(modal).toBeHidden({ timeout: 15000 });
  });

  test('delete weekly schedule', async ({ authedPage, testUser }) => {
    const page = authedPage;

    // Create league + season + schedule via API
    const league = await createTestLeague(testUser.token, {
      name: `Delete Schedule League ${Date.now()}`,
    });
    const season = await createTestSeason(testUser.token, league.id, {
      name: `Delete Schedule Season ${Date.now()}`,
    });

    const { createApiClient } = await import('../fixtures/api.js');
    const api = createApiClient(testUser.token);
    await api.post(`/api/seasons/${season.id}/weekly-schedules`, {
      day_of_week: 4, // Friday
      start_time: '16:00',
      duration_hours: 2,
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
    });

    // Navigate to Sign Ups tab
    await page.goto(`/league/${league.id}?tab=signups`);
    await page.waitForSelector('[data-testid="signups-tab"][aria-current="page"]', { timeout: 15000 });

    // Wait for schedule row
    const scheduleRow = page.locator('.league-schedule-row');
    await expect(scheduleRow.first()).toBeVisible({ timeout: 10000 });

    // Click delete button (Trash icon)
    await scheduleRow.first().locator('.league-schedule-remove').click();

    // Confirmation modal should appear
    const confirmModal = page.locator('.modal-overlay');
    await expect(confirmModal).toBeVisible({ timeout: 10000 });

    // Click "Delete Schedule"
    await confirmModal.getByRole('button', { name: 'Delete Schedule' }).click();

    // Modal should close and schedule should be removed
    await expect(confirmModal).toBeHidden({ timeout: 15000 });

    // Empty state should show (scope to weekly schedule section to avoid strict mode)
    await expect(page.locator('.league-empty-state', { hasText: 'No weekly schedules' }))
      .toBeVisible({ timeout: 10000 });
  });
});
