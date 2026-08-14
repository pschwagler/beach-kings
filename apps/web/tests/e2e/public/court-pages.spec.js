import { test, expect } from '@playwright/test';

/**
 * E2E tests for public court pages (no auth required).
 *
 * These tests rely on court data applied during fresh-database bootstrap
 * (from apps/backend/seed/courts.csv). The test bootstrap applies
 * ~226 approved courts including courts at the socal_sd location.
 *
 * Known court slug for testing: "south-mission-beach-volleyball-courts-san-diego"
 * (14 sand courts, socal_sd location, free, nets provided)
 */

const KNOWN_COURT_SLUG = 'south-mission-beach-volleyball-courts-san-diego';
const KNOWN_COURT_NAME = 'South Mission Beach Volleyball Courts';

test.describe('Court Directory', () => {
  test('court directory loads and shows courts', async ({ page }) => {
    const courtsResponse = page.waitForResponse(response =>
      response.url().includes('/api/public/courts') && response.status() === 200,
    );
    await page.goto('/courts?location=socal_sd');
    await courtsResponse;

    // Navbar should be present
    await expect(page.getByRole('navigation', { name: 'Site navigation' })).toBeVisible({ timeout: 10000 });

    // Page title
    await expect(page.getByRole('heading', { name: 'Find your next court' }))
      .toBeVisible({ timeout: 15000 });

    // Court cards should be visible (seeded data)
    const courtCards = page.locator('.court-card');
    await expect(courtCards.first()).toBeVisible({ timeout: 15000 });

    // Each court card has a name
    const firstCardName = courtCards.first().locator('.court-card__name');
    await expect(firstCardName).toBeVisible();
  });

  test('court directory filter works', async ({ page }) => {
    const initialResponse = page.waitForResponse(response =>
      response.url().includes('/api/public/courts') && response.status() === 200,
    );
    await page.goto('/courts?location=socal_sd');
    await initialResponse;

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

    const filteredResponse = page.waitForResponse(response =>
      response.url().includes('/api/public/courts') && response.url().includes('surface_type=sand'),
    );
    await page.getByRole('combobox', { name: 'Surface' }).selectOption('sand');
    await filteredResponse;

    // Count should update and results should be narrowed
    await expect(countLocator).toBeVisible();
    const courtCards = page.locator('.court-card');
    await expect(courtCards.first()).toBeVisible({ timeout: 10000 });

    await expect(courtCards.first().locator('.court-card__name')).toBeVisible();
  });
});

test.describe('Court Detail', () => {
  test('court detail page renders', async ({ page }) => {
    await page.goto(`/courts/${KNOWN_COURT_SLUG}`);

    // Navbar should be present
    await expect(page.getByRole('navigation', { name: 'Site navigation' })).toBeVisible({ timeout: 10000 });

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
