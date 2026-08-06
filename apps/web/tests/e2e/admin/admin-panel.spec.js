import { test, expect } from '../fixtures/test-fixtures.js';

/**
 * E2E tests for the admin panel access and basic functionality.
 *
 * Uses `adminUser` (system admin) fixture.
 * Admin panel is at /admin-view.
 */

/**
 * Inject auth tokens and navigate to a path, waiting for /api/auth/me.
 */
async function authenticateAndGoto(page, user, path) {
  await page.goto('/');
  await page.evaluate(({ accessToken, refreshToken }) => {
    window.localStorage.setItem('beach_access_token', accessToken);
    window.localStorage.setItem('beach_refresh_token', refreshToken);
  }, { accessToken: user.token, refreshToken: user.refreshToken });

  const authMePromise = page.waitForResponse(
    resp => resp.url().includes('/api/auth/me'),
    { timeout: 15000 },
  );
  await page.goto(path);
  await authMePromise;
}

test.describe('Admin Panel', () => {
  test('admin panel loads for system admin', async ({
    browser,
    adminUser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, adminUser, '/admin-view');

      // Admin panel container and title should be visible
      await expect(page.locator('.admin-view-container')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('h1')).toContainText('Admin Panel', { timeout: 10000 });

      // Dashboard tab (default) should load with Platform Stats
      await expect(page.locator('h2', { hasText: 'Platform Stats' }))
        .toBeVisible({ timeout: 10000 });
    } finally {
      await context.close();
    }
  });

  test('admin panel has all tab buttons', async ({
    browser,
    adminUser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, adminUser, '/admin-view');
      await expect(page.locator('.admin-view-container')).toBeVisible({ timeout: 15000 });

      const adminNavigation = page.getByRole('navigation', { name: 'Admin navigation' });
      const destinations = ['Dashboard', 'Settings', 'Courts', 'Feedback', 'Moderation'];

      await expect(adminNavigation).toBeVisible();
      for (const destination of destinations) {
        await expect(adminNavigation.getByRole('button', { name: destination })).toBeVisible();
      }
      await expect(adminNavigation.getByRole('button', { name: 'Dashboard' }))
        .toHaveAttribute('aria-current', 'page');
    } finally {
      await context.close();
    }
  });

  test('tab switching works', async ({
    browser,
    adminUser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, adminUser, '/admin-view');
      await expect(page.locator('.admin-view-container')).toBeVisible({ timeout: 15000 });

      const adminNavigation = page.getByRole('navigation', { name: 'Admin navigation' });

      // Click Courts tab
      await adminNavigation.getByRole('button', { name: 'Courts' }).click();

      // Courts sub-tab pills should appear
      await expect(page.locator('.admin-courts-pill').first()).toBeVisible({ timeout: 10000 });

      // URL should update
      await expect(page).toHaveURL(/tab=courts/);
      await expect(adminNavigation.getByRole('button', { name: 'Courts' }))
        .toHaveAttribute('aria-current', 'page');
    } finally {
      await context.close();
    }
  });

  test('phone-width admin navigation keeps every destination visible and usable', async ({
    browser,
    adminUser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const destinations = [
      { name: 'Dashboard', tab: 'dashboard', content: page.getByRole('heading', { name: 'Platform Stats' }) },
      { name: 'Settings', tab: 'settings', content: page.getByText('SMS Enabled') },
      { name: 'Courts', tab: 'courts', content: page.getByRole('heading', { name: 'Court review desk' }) },
      { name: 'Feedback', tab: 'feedback', content: page.getByRole('heading', { name: 'Feedback', exact: true }) },
      { name: 'Moderation', tab: 'moderation', content: page.getByRole('heading', { name: 'Moderation control desk' }) },
    ];

    try {
      await page.setViewportSize({ width: 320, height: 844 });
      await authenticateAndGoto(page, adminUser, '/admin-view');
      await expect(page.locator('.admin-view-container')).toBeVisible({ timeout: 15000 });

      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        const adminNavigation = page.getByRole('navigation', { name: 'Admin navigation' });

        for (const { name, tab, content } of destinations) {
          const destination = adminNavigation.getByRole('button', { name });
          await expect(destination).toBeVisible();
          await destination.click();
          await expect(page).toHaveURL(new RegExp(`tab=${tab}`));
          await expect(destination).toHaveAttribute('aria-current', 'page');
          await expect(content).toBeVisible({ timeout: 10000 });

          const navLayout = await adminNavigation.evaluate((navigation) => {
            const bounds = navigation.getBoundingClientRect();
            const buttons = [...navigation.querySelectorAll('button')];
            return {
              clientWidth: navigation.clientWidth,
              scrollWidth: navigation.scrollWidth,
              buttonsFit: buttons.every((button) => {
                const buttonBounds = button.getBoundingClientRect();
                return buttonBounds.left >= bounds.left - 1
                  && buttonBounds.right <= bounds.right + 1
                  && buttonBounds.height >= 44;
              }),
            };
          });
          expect(navLayout.scrollWidth).toBeLessThanOrEqual(navLayout.clientWidth + 1);
          expect(navLayout.buttonsFit).toBe(true);
          expect(await page.evaluate(() => document.documentElement.scrollWidth))
            .toBeLessThanOrEqual(width + 1);

          if (tab === 'courts') {
            await page.getByRole('tab', { name: /Court directory/ }).click();
            await expect(page.getByRole('heading', { name: 'All courts' }))
              .toBeVisible({ timeout: 10000 });
          }
        }
      }
    } finally {
      await context.close();
    }
  });
});
