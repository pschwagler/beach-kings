import { test, expect } from '@playwright/test';

/**
 * E2E tests for static/public pages that require no auth and no seeded data.
 * Verifies pages render correctly with Navbar, headings, and core content.
 */

test.describe('Static Pages', () => {
  test('privacy policy renders with navbar', async ({ page }) => {
    await page.goto('/privacy-policy');

    // Navbar should be present (required on all pages)
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });

    // Page title and content
    await expect(page.locator('.legal-page-title')).toHaveText('Privacy Policy');
    await expect(page.locator('.legal-page-date')).toContainText('Last updated');

    // Core sections exist
    await expect(page.locator('.legal-section').first()).toBeVisible();
    await expect(page.locator('.legal-section h3', { hasText: 'Information We Collect' })).toBeVisible();
  });

  test('terms of service renders with navbar', async ({ page }) => {
    await page.goto('/terms-of-service');

    // Navbar should be present
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });

    // Page title and content
    await expect(page.locator('.legal-page-title')).toHaveText('Terms of Service');
    await expect(page.locator('.legal-page-date')).toContainText('Last updated');

    // Core sections exist
    await expect(page.locator('.legal-section').first()).toBeVisible();
    await expect(page.locator('text=Acceptance of Terms')).toBeVisible();
  });

  test('contribute page renders with navbar', async ({ page }) => {
    await page.goto('/contribute');

    // Navbar should be present
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });

    // Page title and content
    await expect(page.locator('.legal-page-title')).toHaveText('Contribute');
    await expect(page.locator('text=open source project')).toBeVisible();
  });

  test('location directory renders with navbar', async ({ page }) => {
    await page.goto('/beach-volleyball');

    // Navbar should be present
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });

    // Page title
    const title = page.locator('.location-directory__title');
    await expect(title).toBeVisible({ timeout: 10000 });
    await expect(title).toHaveText('Beach Volleyball Locations');

    // Subtitle
    await expect(page.locator('.location-directory__subtitle'))
      .toContainText('Find leagues, players, and courts near you');

    // Auth prompt for anonymous visitors
    await expect(page.locator('.location-directory__auth-prompt')).toBeVisible();
  });
});
