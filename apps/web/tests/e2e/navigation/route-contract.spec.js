import { test, expect } from '@playwright/test';

const navbar = (page) => page.getByRole('navigation', { name: 'Site navigation' });

test.describe('Route and Navbar contract @smoke @p0', () => {
  const publicRoutes = [
    ['/', /Beach League|Beach Kings/i],
    ['/courts', /Find.*Court|Courts/i],
    ['/find-leagues', /Find New Leagues/i],
    ['/find-players', /Find Players/i],
    ['/beach-volleyball', /Beach Volleyball Locations/i],
    ['/beach-volleyball/mission-beach-ca', /Mission Beach/i],
    ['/privacy-policy', /Privacy Policy/i],
    ['/terms-of-service', /Terms of Service/i],
    ['/community-guidelines', /Community Guidelines/i],
    ['/support', /Support/i],
    ['/contribute', /Contribute/i],
  ];

  for (const [route, heading] of publicRoutes) {
    test(`${route} resolves with the global Navbar`, async ({ page }) => {
      await page.goto(route);
      await expect(navbar(page)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: 15_000 });
    });
  }

  test('unknown route renders recoverable 404 for anonymous visitors', async ({ page }) => {
    await page.goto('/definitely-not-a-beach-league-route');
    await expect(navbar(page)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Go home' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  const guarded = [
    ['/home', /Log In|Sign Up/i],
    ['/admin-view', /Sign in to continue/i],
    ['/kob/create', /Sign in to create a tournament/i],
    ['/kob/manage/999999999', /Sign in to manage tournaments/i],
  ];
  for (const [route, state] of guarded) {
    test(`${route} retains Navbar and exposes an actionable auth state`, async ({ page }) => {
      await page.goto(route);
      await expect(navbar(page)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(state).first()).toBeVisible({ timeout: 15_000 });
    });
  }

  test('external and contact links declare safe browser behavior @p2', async ({ page }) => {
    await page.goto('/contribute');
    for (const link of await page.locator('a[target="_blank"]').all()) {
      await expect(link).toHaveAttribute('rel', /noopener|noreferrer/);
    }

    await page.goto('/support');
    await expect(page.locator('a[href^="mailto:"]').first()).toHaveAttribute('href', /^mailto:/);
  });
});
