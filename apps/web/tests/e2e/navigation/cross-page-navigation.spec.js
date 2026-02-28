import {
  test,
  expect,
  navigateWithAuth,
} from '../fixtures/test-fixtures.js';

/**
 * E2E tests for cross-page navigation between public pages.
 *
 * Verifies that clicking links between player, location, court, league,
 * and directory pages actually navigates and renders the target page.
 */

const LOCATION_SLUG = 'mission-beach-ca';
const LOCATION_URL = `/beach-volleyball/${LOCATION_SLUG}`;

/**
 * Build URL slug from a player name.
 *
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

test.describe('Cross-Page Navigation', () => {
  test('player profile → location hub', async ({
    authedPage,
    testUser,
  }) => {
    // testUser has location_id: socal_sd which has slug mission-beach-ca
    await navigateWithAuth(
      authedPage,
      `/player/${testUser.playerId}/${slugify(testUser.fullName)}`,
    );

    // Click the location link in the player meta section
    const locationLink = authedPage.locator('.public-player__location-link');
    await expect(locationLink).toBeVisible({ timeout: 15000 });
    await locationLink.click();

    // Should navigate to the location hub
    await expect(authedPage).toHaveURL(/\/beach-volleyball\//, { timeout: 10000 });
    await expect(authedPage.locator('.public-location__title')).toBeVisible({ timeout: 15000 });
  });

  test('location hub → court detail', async ({ page }) => {
    await page.goto(LOCATION_URL);

    // Click the first court card
    const courtCard = page.locator('.public-location__court-card').first();
    await expect(courtCard).toBeVisible({ timeout: 15000 });
    await courtCard.click();

    // Should navigate to a court detail page
    await expect(page).toHaveURL(/\/courts\//, { timeout: 10000 });
  });

  test('location hub → league page', async ({
    page,
    sessionWithMatches,
  }) => {
    // sessionWithMatches creates a league with location_id: socal_sd
    await page.goto(LOCATION_URL);
    await expect(page.locator('.public-location__title')).toBeVisible({ timeout: 15000 });

    // Click the first league card (may exist from current or prior test runs)
    const leagueCard = page.locator('.public-location__league-card').first();
    await expect(leagueCard).toBeVisible({ timeout: 10000 });
    await leagueCard.click();

    // Should navigate to a league page
    await expect(page).toHaveURL(/\/league\//, { timeout: 10000 });
  });

  test('location hub → location directory', async ({ page }) => {
    await page.goto(LOCATION_URL);

    // Click the "Explore more locations" link
    const exploreLink = page.locator('.public-location__explore-link');
    await expect(exploreLink).toBeVisible({ timeout: 15000 });
    await exploreLink.click();

    // Should navigate to the location directory
    await expect(page).toHaveURL('/beach-volleyball', { timeout: 10000 });
  });
});
