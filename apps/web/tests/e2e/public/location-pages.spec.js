import { test, expect } from '../fixtures/test-fixtures.js';

/**
 * E2E tests for public location hub pages (/beach-volleyball/[slug]).
 *
 * Global-setup seeds location `socal_sd` with slug `mission-beach-ca`
 * and two courts in that location.
 *
 * NOTE: Next.js caches server-side `fetchBackend()` responses for 300s
 * (`next: { revalidate: 300 }`). Fixture-created data (players, leagues)
 * is verified via a direct API call rather than the SSR page, which may
 * serve a stale cached version.
 */

const LOCATION_SLUG = 'mission-beach-ca';
const LOCATION_URL = `/beach-volleyball/${LOCATION_SLUG}`;
const API_URL = process.env.TEST_API_URL || 'http://localhost:8001';

test.describe('Public Location Pages', () => {
  test('location page renders title, stats, and courts', async ({ page }) => {
    await page.goto(LOCATION_URL);

    // Navbar should be present (required on every page)
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });

    // Title should contain the city name
    const title = page.locator('.public-location__title');
    await expect(title).toBeVisible({ timeout: 15000 });
    await expect(title).toContainText('Mission Beach');

    // Stats bar should be visible
    await expect(page.locator('.public-location__stats')).toBeVisible();

    // Courts section (seeded by global-setup, always present)
    await expect(page.locator('.public-location__court-card').first()).toBeVisible();

    // Explore link should be visible
    await expect(page.locator('.public-location__explore-link')).toBeVisible();
  });

  test('API returns top players and leagues with fixture data', async ({
    testUser,
    sessionWithMatches,
  }) => {
    // testUser has location_id: socal_sd + seeded PlayerGlobalStats
    // sessionWithMatches creates a league with location_id: socal_sd
    //
    // Verify the public location API returns fixture data correctly.
    // SSR page may cache stale data, so we test the API directly.
    const resp = await fetch(`${API_URL}/api/public/locations/${LOCATION_SLUG}`);
    expect(resp.ok).toBe(true);
    const data = await resp.json();

    // Top players includes testUser
    expect(data.top_players.length).toBeGreaterThanOrEqual(1);
    const playerNames = data.top_players.map(p => p.full_name);
    expect(playerNames).toContain(testUser.fullName);

    // Leagues includes the fixture-created league
    expect(data.leagues.length).toBeGreaterThanOrEqual(1);

    // Stats reflect the fixture data
    expect(data.stats.total_players).toBeGreaterThanOrEqual(1);
    expect(data.stats.total_leagues).toBeGreaterThanOrEqual(1);
    expect(data.stats.total_courts).toBe(2);
  });

  test('invalid slug shows 404', async ({ page }) => {
    await page.goto('/beach-volleyball/nonexistent-location-xyz');

    // Next.js 404 page
    await expect(page.locator('text=This page could not be found')).toBeVisible({ timeout: 15000 });
  });
});
