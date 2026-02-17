import { test, expect } from '@playwright/test';

/**
 * E2E tests for public court pages (no auth required).
 *
 * These tests rely on court data seeded by the backend on startup
 * (from apps/backend/seed/courts.csv). The test backend auto-seeds
 * ~226 approved courts including courts at the socal_sd location.
 *
 * Known court slug for testing: "south-mission-beach-volleyball-courts-san-diego"
 * (14 sand courts, socal_sd location, free, nets provided)
 */

const KNOWN_COURT_SLUG = 'south-mission-beach-volleyball-courts-san-diego';
const KNOWN_COURT_NAME = 'South Mission Beach Volleyball Courts';

test.describe('Court Directory', () => {
  test('court directory loads and shows courts', async ({ page }) => {
    await page.goto('/courts');

    // Navbar should be present
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });

    // Page title
    const title = page.locator('.court-directory__title');
    await expect(title).toBeVisible({ timeout: 15000 });
    await expect(title).toContainText('Beach Volleyball Courts');

    // Court cards should be visible (seeded data)
    const courtCards = page.locator('.court-card');
    await expect(courtCards.first()).toBeVisible({ timeout: 15000 });

    // Each court card has a name
    const firstCardName = courtCards.first().locator('.court-card__name');
    await expect(firstCardName).toBeVisible();
  });

  test('court directory filter works', async ({ page }) => {
    await page.goto('/courts');

    // Wait for courts to load
    await expect(page.locator('.court-card').first()).toBeVisible({ timeout: 15000 });

    // Get initial count text
    const countLocator = page.locator('.court-list__count');
    await expect(countLocator).toBeVisible({ timeout: 10000 });

    // Open filters
    const filterToggle = page.locator('.court-list__filter-toggle');
    if (await filterToggle.isVisible()) {
      await filterToggle.click();
    }

    // Use the search input to filter
    const searchInput = page.locator('.court-list__search-input');
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill('Mission Beach');

    // Wait for filtered results
    await page.waitForTimeout(500); // debounce delay

    // Count should update and results should be narrowed
    await expect(countLocator).toBeVisible();
    const courtCards = page.locator('.court-card');
    await expect(courtCards.first()).toBeVisible({ timeout: 10000 });

    // At least one result should contain "Mission Beach"
    await expect(courtCards.first().locator('.court-card__name'))
      .toContainText('Mission Beach');
  });
});

test.describe('Court Detail', () => {
  test('court detail page renders', async ({ page }) => {
    await page.goto(`/courts/${KNOWN_COURT_SLUG}`);

    // Navbar should be present
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });

    // Court name should be visible
    const courtName = page.locator('.court-detail__name');
    await expect(courtName).toBeVisible({ timeout: 15000 });
    await expect(courtName).toContainText(KNOWN_COURT_NAME);

    // Address should be visible
    await expect(page.locator('.court-detail__address')).toBeVisible();

    // Badges (amenities) should be visible
    await expect(page.locator('.court-detail__badges')).toBeVisible();

    // Review section should be visible
    await expect(page.locator('.court-detail__reviews')).toBeVisible();
  });

  test('nearby courts section renders', async ({ page }) => {
    await page.goto(`/courts/${KNOWN_COURT_SLUG}`);

    // Wait for page to load
    await expect(page.locator('.court-detail__name')).toBeVisible({ timeout: 15000 });

    // Nearby courts section should appear (fetched client-side)
    const nearbySection = page.locator('.court-detail__nearby');
    await expect(nearbySection).toBeVisible({ timeout: 15000 });

    // Should have a heading
    await expect(nearbySection.locator('.court-detail__section-title'))
      .toContainText('Nearby Courts');

    // Should show at least one nearby court card
    await expect(nearbySection.locator('.court-detail__nearby-card').first())
      .toBeVisible({ timeout: 10000 });
  });

  test('invalid court slug shows not-found state', async ({ page }) => {
    await page.goto('/courts/this-court-does-not-exist-99999');

    // Should show not-found state
    await expect(page.getByRole('heading', { name: 'Court Not Found' })).toBeVisible({ timeout: 15000 });
  });
});
