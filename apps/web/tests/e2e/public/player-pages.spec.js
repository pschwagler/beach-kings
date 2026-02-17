import { test, expect } from '../fixtures/test-fixtures.js';

/**
 * E2E tests for public player profile pages.
 *
 * The public player API only returns players with at least 1 game played,
 * so we use the sessionWithMatches fixture to ensure test players have games.
 *
 * These tests verify the unauthenticated (anonymous) view of player profiles.
 */

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

test.describe('Public Player Pages', () => {
  test('public player profile renders for anonymous visitor', async ({
    page,
    sessionWithMatches,
  }) => {
    const { playerNames, playerIds } = sessionWithMatches;
    const playerName = playerNames[0];
    const playerId = playerIds[playerName];
    const slug = slugify(playerName);

    // Navigate as anonymous user (no auth tokens)
    await page.goto(`/player/${playerId}/${slug}`);

    // Navbar should be present
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });

    // Player name should be visible
    const nameLocator = page.locator('[data-testid="player-name"]');
    await expect(nameLocator).toBeVisible({ timeout: 15000 });
    await expect(nameLocator).toContainText(playerName);

    // Stats section should be visible
    await expect(page.locator('[data-testid="player-stats"]')).toBeVisible();

    // Auth prompt CTA should appear for anonymous visitors
    await expect(page.locator('[data-testid="player-footer"]')).toBeVisible();
  });

  test('profile renders with wrong slug', async ({
    page,
    sessionWithMatches,
  }) => {
    const { playerNames, playerIds } = sessionWithMatches;
    const playerName = playerNames[0];
    const playerId = playerIds[playerName];

    // Navigate with a wrong slug — page should still render the correct player
    await page.goto(`/player/${playerId}/wrong-slug-here`);

    // Player name should still be visible (no redirect, just canonical in metadata)
    const nameLocator = page.locator('[data-testid="player-name"]');
    await expect(nameLocator).toBeVisible({ timeout: 15000 });
    await expect(nameLocator).toContainText(playerName);
  });

  test('invalid player ID shows 404', async ({ page }) => {
    await page.goto('/player/99999/nobody');

    // Next.js should show a 404 page
    await expect(page.locator('text=This page could not be found')).toBeVisible({ timeout: 15000 });
  });
});
