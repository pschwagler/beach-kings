import { test, expect } from '../fixtures/test-fixtures.js';

/**
 * E2E tests for public league and discovery pages.
 *
 * Uses leagueWithPlayers fixture for league page tests.
 * Find Leagues and Find Players pages are tested without fixtures
 * (they work with whatever data exists in the test DB).
 */

test.describe('Public League Page', () => {
  test('public league page renders for anonymous visitor', async ({
    page,
    leagueWithPlayers,
  }) => {
    const { leagueId } = leagueWithPlayers;

    // Navigate as anonymous user (no auth tokens)
    await page.goto(`/league/${leagueId}`);

    // Navbar should be present
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });

    // League name should be visible in the public view
    const leagueName = page.locator('.public-league__name');
    await expect(leagueName).toBeVisible({ timeout: 15000 });

    // Members section should be visible (the fixture creates members)
    await expect(page.locator('.public-league__members')).toBeVisible({ timeout: 10000 });

    // Auth prompt CTA should appear for anonymous visitors
    await expect(page.locator('.public-league__footer')).toBeVisible();
  });

  test('invalid league ID shows error state', async ({ page }) => {
    await page.goto('/league/99999');

    // Should show not-found state
    await expect(page.getByRole('heading', { name: 'League Not Found' })).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Find Leagues Page', () => {
  test('find leagues page renders with navbar', async ({ page }) => {
    await page.goto('/find-leagues');

    // Navbar should be present
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });

    // Page title
    await expect(page.locator('h1', { hasText: 'Find New Leagues' }))
      .toBeVisible({ timeout: 15000 });

    // Auth prompt for anonymous visitors
    await expect(page.locator('.find-leagues-auth-prompt')).toBeVisible();
  });

  test('find leagues page shows leagues from fixtures', async ({
    page,
    leagueWithPlayers,
  }) => {
    await page.goto('/find-leagues');

    // Wait for the table to load
    await expect(page.locator('h1', { hasText: 'Find New Leagues' }))
      .toBeVisible({ timeout: 15000 });

    // There should be at least one league row (from the fixture)
    const leagueRows = page.locator('.leagues-table-row');
    await expect(leagueRows.first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Find Players Page', () => {
  test('find players page renders with navbar', async ({ page }) => {
    await page.goto('/find-players');

    // Navbar should be present
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });

    // Page title
    await expect(page.locator('h1', { hasText: 'Find Players' }))
      .toBeVisible({ timeout: 15000 });
  });

  test('find players page shows player cards when data exists', async ({
    page,
    sessionWithMatches,
  }) => {
    // sessionWithMatches creates players with games, making them publicly visible
    await page.goto('/find-players');

    // Wait for the page to load
    await expect(page.locator('h1', { hasText: 'Find Players' }))
      .toBeVisible({ timeout: 15000 });

    // Player cards should be visible (players from sessionWithMatches have games)
    const playerCards = page.locator('.find-players__card');
    await expect(playerCards.first()).toBeVisible({ timeout: 15000 });

    // Count should show results
    await expect(page.locator('.find-players__count')).toContainText('player');
  });
});
