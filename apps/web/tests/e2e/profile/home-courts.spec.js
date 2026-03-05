import { test, expect } from '../fixtures/test-fixtures.js';
import { createApiClient } from '../fixtures/api.js';

/**
 * E2E tests for player home courts on /home?tab=profile.
 *
 * Validates:
 * - Adding multiple courts via the browser modal (the multi-add bug)
 * - All courts appear as pills after add
 * - Removing a court
 * - Set primary court
 * - API state matches UI state
 */

/** Navigate to Profile tab and wait for form. */
async function openProfileTab(page) {
  await page.click('[data-testid="profile-tab"]');
  await page.waitForSelector('.profile-page__home-courts-section', { timeout: 15000 });
}

/** Get home courts from API for a player. */
async function getHomeCourtIds(token, playerId) {
  const api = createApiClient(token);
  const resp = await api.get(`/api/players/${playerId}/home-courts`);
  return resp.data.map((c) => c.id);
}

test.describe('Home Courts', () => {
  test('add multiple courts via browser modal and verify all appear', async ({ authedPage, testUser }) => {
    const page = authedPage;
    await openProfileTab(page);

    // Verify no home courts initially
    const pillsBefore = page.locator('.court-selector__pill');
    await expect(pillsBefore).toHaveCount(0);

    // Click "Add a court..." to open dropdown
    await page.click('.court-selector__add-trigger');

    // Click "Browse all courts" to open browser modal
    await page.click('.court-selector__option--browse');

    // Wait for browser modal to load courts
    await page.waitForSelector('.court-browser', { timeout: 15000 });
    await page.waitForSelector('.court-card', { timeout: 15000 });

    // Select the first 2 courts by clicking them
    const courtCards = page.locator('.court-card--selectable');
    const courtCount = await courtCards.count();
    expect(courtCount).toBeGreaterThanOrEqual(2);

    // Capture court names for verification
    const courtName1 = await courtCards.nth(0).locator('.court-card__name').textContent();
    const courtName2 = await courtCards.nth(1).locator('.court-card__name').textContent();

    await courtCards.nth(0).click();
    await courtCards.nth(1).click();

    // Verify selected count in the Done button
    const doneBtn = page.locator('.court-browser__footer button', { hasText: /Done/ });
    await expect(doneBtn).toContainText('Done (2)');

    // Confirm selection
    await doneBtn.click();

    // Wait for modal to close
    await expect(page.locator('.court-browser')).toBeHidden({ timeout: 5000 });

    // Both courts should appear as pills
    const pillsAfter = page.locator('.court-selector__pill');
    await expect(pillsAfter).toHaveCount(2, { timeout: 10000 });

    // Verify court names in pills
    const pillNames = page.locator('.court-selector__pill-name');
    const names = await pillNames.allTextContents();
    expect(names).toContain(courtName1.trim());
    expect(names).toContain(courtName2.trim());

    // Verify API state matches — wait briefly for async API calls to complete
    await page.waitForTimeout(1000);
    const apiCourts = await getHomeCourtIds(testUser.token, testUser.playerId);
    expect(apiCourts.length).toBe(2);
  });

  test('remove a home court via pill X button', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const api = createApiClient(testUser.token);

    // Seed 2 home courts via API first
    const courtsResp = await api.get('/api/courts', { params: { location_id: 'socal_sd' } });
    const courts = Array.isArray(courtsResp.data) ? courtsResp.data : (courtsResp.data.items || []);
    expect(courts.length).toBeGreaterThanOrEqual(2);

    await api.post(`/api/players/${testUser.playerId}/home-courts`, { court_id: courts[0].id });
    await api.post(`/api/players/${testUser.playerId}/home-courts`, { court_id: courts[1].id });

    await openProfileTab(page);

    // Should see 2 pills
    const pills = page.locator('.court-selector__pill');
    await expect(pills).toHaveCount(2, { timeout: 10000 });

    // Click the X button on the first pill
    const firstPillRemove = pills.nth(0).locator('.court-selector__pill-remove');
    await firstPillRemove.click();

    // Should now see 1 pill
    await expect(pills).toHaveCount(1, { timeout: 5000 });

    // Verify API state
    await page.waitForTimeout(500);
    const apiCourts = await getHomeCourtIds(testUser.token, testUser.playerId);
    expect(apiCourts.length).toBe(1);
  });

  test('set primary court reorders pills', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const api = createApiClient(testUser.token);

    // Seed 2 home courts via API
    const courtsResp = await api.get('/api/courts', { params: { location_id: 'socal_sd' } });
    const courts = Array.isArray(courtsResp.data) ? courtsResp.data : (courtsResp.data.items || []);
    expect(courts.length).toBeGreaterThanOrEqual(2);

    await api.post(`/api/players/${testUser.playerId}/home-courts`, { court_id: courts[0].id });
    await api.post(`/api/players/${testUser.playerId}/home-courts`, { court_id: courts[1].id });

    await openProfileTab(page);

    // Should see 2 pills
    const pills = page.locator('.court-selector__pill');
    await expect(pills).toHaveCount(2, { timeout: 10000 });

    // Get name of second court
    const secondName = await pills.nth(1).locator('.court-selector__pill-name').textContent();

    // Click the star on the second pill to set as primary
    const secondStar = pills.nth(1).locator('.court-selector__pill-star');
    await secondStar.click();

    // The second court should now be first (primary)
    const firstPillName = page.locator('.court-selector__pill').nth(0).locator('.court-selector__pill-name');
    await expect(firstPillName).toHaveText(secondName.trim(), { timeout: 5000 });

    // First pill should have the primary class
    const firstPill = page.locator('.court-selector__pill').nth(0);
    await expect(firstPill).toHaveClass(/court-selector__pill--primary/);

    // Verify API state — first position should be the previously-second court
    await page.waitForTimeout(500);
    const apiResp = await api.get(`/api/players/${testUser.playerId}/home-courts`);
    expect(apiResp.data[0].id).toBe(courts[1].id);
  });

  test('adding courts that already exist does not produce errors', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const api = createApiClient(testUser.token);

    // Seed 1 home court via API
    const courtsResp = await api.get('/api/courts', { params: { location_id: 'socal_sd' } });
    const courts = Array.isArray(courtsResp.data) ? courtsResp.data : (courtsResp.data.items || []);
    await api.post(`/api/players/${testUser.playerId}/home-courts`, { court_id: courts[0].id });

    await openProfileTab(page);

    // Should see 1 pill
    await expect(page.locator('.court-selector__pill')).toHaveCount(1, { timeout: 10000 });

    // Open browser modal and select both the existing court + a new one
    await page.click('.court-selector__add-trigger');
    await page.click('.court-selector__option--browse');
    await page.waitForSelector('.court-card', { timeout: 15000 });

    // The first court should already be selected (shown in the "Selected" summary)
    await expect(page.locator('.court-browser__selected-pill')).toHaveCount(1);

    // Select the second court (the first should already be checked)
    const courtCards = page.locator('.court-card--selectable');
    // Find the one that is NOT already selected
    const unselectedCard = page.locator('.court-card--selectable:not(.court-card--selected)').first();
    await unselectedCard.click();

    // Confirm
    await page.locator('.court-browser__footer button', { hasText: /Done/ }).click();
    await expect(page.locator('.court-browser')).toBeHidden({ timeout: 5000 });

    // Should see 2 pills (no duplicates, no errors)
    await expect(page.locator('.court-selector__pill')).toHaveCount(2, { timeout: 10000 });

    // No error toast should be visible
    await expect(page.locator('.toast--error')).toHaveCount(0);
  });
});
