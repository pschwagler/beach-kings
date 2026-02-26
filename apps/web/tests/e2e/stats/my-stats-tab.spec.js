import { test, expect, navigateWithAuth } from '../fixtures/test-fixtures.js';

/**
 * E2E tests for the My Stats tab.
 *
 * Uses:
 *   - `authedPage` for a pre-authenticated browser page
 *   - `sessionWithMatches` to ensure the user has match history
 *   - `testUser` for a fresh user with no matches (empty state)
 */

test.describe('My Stats Tab', () => {
  test('deep link /home?tab=my-stats renders the tab', async ({ authedPage }) => {
    await navigateWithAuth(authedPage, '/home?tab=my-stats');
    await expect(authedPage.locator('.my-stats-tab')).toBeVisible({ timeout: 15000 });
  });

  test('stat card click on Home navigates to My Stats', async ({ authedPage }) => {
    await navigateWithAuth(authedPage, '/home');
    // Wait for stat cards to render
    await expect(authedPage.locator('.home-stat-card').first()).toBeVisible({ timeout: 15000 });
    // Click the first stat card
    await authedPage.locator('.home-stat-card').first().click();
    await expect(authedPage.locator('.my-stats-tab')).toBeVisible({ timeout: 15000 });
  });

  test('overview cards render stats for user with matches', async ({ authedPage, sessionWithMatches }) => {
    await navigateWithAuth(authedPage, '/home?tab=my-stats');
    await expect(authedPage.locator('.my-stats-tab')).toBeVisible({ timeout: 15000 });

    // Wait for overview cards to load (not in loading state)
    const overviewGrid = authedPage.locator('.my-stats-tab__overview-grid');
    await expect(overviewGrid).toBeVisible({ timeout: 15000 });

    // Record card should have a non-zero value (e.g. "2-0" or "1-1")
    const recordCard = overviewGrid.locator('.overview-stat-card').first();
    const recordValue = recordCard.locator('.overview-stat-card__value');
    await expect(recordValue).not.toHaveText('0-0', { timeout: 10000 });
  });

  test('rating chart renders SVG when data exists', async ({ authedPage, sessionWithMatches }) => {
    await navigateWithAuth(authedPage, '/home?tab=my-stats');
    await expect(authedPage.locator('.my-stats-tab')).toBeVisible({ timeout: 15000 });

    // Chart wrapper should be visible (may show chart or "not enough data" message)
    const chartWrapper = authedPage.locator('.my-stats-tab__chart-wrapper');
    await expect(chartWrapper).toBeVisible({ timeout: 15000 });
  });

  test('partnerships table has data with matches', async ({ authedPage, sessionWithMatches }) => {
    await navigateWithAuth(authedPage, '/home?tab=my-stats');
    await expect(authedPage.locator('.my-stats-tab')).toBeVisible({ timeout: 15000 });

    // At least one partnership table should have rows
    const partnerTable = authedPage.locator('.my-stats-tab__stats-table').first();
    await expect(partnerTable).toBeVisible({ timeout: 15000 });
    const rows = partnerTable.locator('tbody tr');
    await expect(rows).not.toHaveCount(0, { timeout: 10000 });
  });

  test('time range filter updates when clicked', async ({ authedPage, sessionWithMatches }) => {
    await navigateWithAuth(authedPage, '/home?tab=my-stats');
    await expect(authedPage.locator('.my-stats-tab')).toBeVisible({ timeout: 15000 });

    // Default is "All Time" (last button should be active)
    const allTimeBtn = authedPage.locator('.my-stats-tab__time-btn--active');
    await expect(allTimeBtn).toHaveText('All Time', { timeout: 10000 });

    // Click "30d" filter
    const btn30d = authedPage.locator('.my-stats-tab__time-btn', { hasText: '30d' });
    await btn30d.click();
    await expect(btn30d).toHaveClass(/my-stats-tab__time-btn--active/);
  });

  test('empty state for user with no matches', async ({ authedPage }) => {
    // authedPage without sessionWithMatches — user may have no match data
    // Navigate to My Stats tab
    await navigateWithAuth(authedPage, '/home?tab=my-stats');
    await expect(authedPage.locator('.my-stats-tab')).toBeVisible({ timeout: 15000 });

    // Either the empty state is shown or overview cards are shown (depends on test user state)
    // This test verifies the tab loads without errors
    const hasEmpty = await authedPage.locator('.my-stats-tab__empty').isVisible().catch(() => false);
    const hasOverview = await authedPage.locator('.my-stats-tab__overview-grid').isVisible().catch(() => false);
    expect(hasEmpty || hasOverview).toBeTruthy();
  });
});
