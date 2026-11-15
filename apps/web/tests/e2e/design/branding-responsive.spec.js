import { test, expect, navigateWithAuth } from '../fixtures/test-fixtures.js';
import { createPickupSession } from '../utils/test-helpers.js';
import { mkdir } from 'node:fs/promises';

// Exercise actual page layouts, rather than comparing implementation CSS values.
test('branded navigation and page layouts fit desktop and narrow phones in both themes', async ({ authedPage: page, testUser, leagueWithPlayers }) => {
  test.setTimeout(120_000);
  const session = await createPickupSession(testUser.token, { name: 'Courtside games' });
  await mkdir('/tmp/beach-web-facelift', { recursive: true });
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    for (const width of [1440, 414, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [name, route] of [['home', '/home'], ['courts', '/courts'], ['league', `/league/${leagueWithPlayers.leagueId}`], ['session', `/session/${session.code}`]]) {
        await navigateWithAuth(page, route);
        await expect(page.getByRole('button', { name: 'Add Games', exact: true })).toBeVisible();
        if (name === 'league') {
          await expect(page.getByRole('heading', { name: /^Test League/, level: 1 })).toBeVisible();
          await expect(page.locator('.skeleton')).toHaveCount(0);
          const clippedControls = await page.locator('.rankings-filters-row').evaluate(row =>
            [...row.querySelectorAll('input, select, button')]
              .filter(control => control.getClientRects().length)
              .filter(control => {
                const rect = control.getBoundingClientRect();
                return rect.left < 0 || rect.right > innerWidth;
              })
              .map(control => control.getAttribute('data-testid') || control.id || control.textContent)
          );
          expect(clippedControls, `League controls clipped at ${width}px`).toEqual([]);
        }
        if (name === 'session') {
          await expect(page.locator('.session-page-title').first()).toHaveText('Courtside games');
          const close = page.locator('.session-players-drawer .modal-close-button');
          if (await close.isVisible()) await close.click();
          await expect(page.locator('.session-players-drawer-backdrop')).toHaveCount(0);
        }
        await expect(page.getByRole('navigation', { name: 'Site navigation' })).toBeVisible();
        await expect(page.locator('.navbar:visible .app-download-banner')).toHaveAttribute('href', /^https:\/\/apps\.apple\.com\//);
        await expect(page.locator('h1:visible,h2:visible').first()).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), { message: `${name} overflows at ${width}px in ${colorScheme}` }).toBe(true);
        const overlap = await page.locator('.navbar:visible .navbar-container').evaluate((nav) => {
          const rects = [...nav.querySelectorAll('button, a')].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').map(el => ({ name: el.getAttribute('aria-label') || el.textContent, rect: el.getBoundingClientRect() }));
          return [
            ...rects.filter(a => a.rect.left < 0 || a.rect.right > innerWidth).map(a => `${a.name} clipped at viewport edge`),
            ...rects.flatMap((a, i) => rects.slice(i + 1).filter(b => a.rect.left < b.rect.right - 1 && a.rect.right > b.rect.left + 1 && a.rect.top < b.rect.bottom - 1 && a.rect.bottom > b.rect.top + 1).map(b => `${a.name} / ${b.name}`)),
          ];
        });
        expect(overlap, `Navbar overlap at ${width}px`).toEqual([]);
        await page.screenshot({ path: `/tmp/beach-web-facelift/${name}-${colorScheme}-${width}.png`, fullPage: true });
      }
    }
  }
});

test('landing and legal content remain below the banner across themes and phone sizes', async ({ page }) => {
  test.setTimeout(90_000);
  await mkdir('/tmp/beach-web-facelift', { recursive: true });
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    for (const width of [1440, 414, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [name, route] of [['landing', '/'], ['privacy', '/privacy-policy']]) {
        await page.goto(route);
        const heading = page.locator('h1:visible').first();
        await expect(heading).toBeVisible();
        const nav = await page.locator('.navbar:visible').boundingBox();
        const title = await heading.boundingBox();
        expect(title.y, `${name} heading obscured by navbar`).toBeGreaterThanOrEqual(nav.y + nav.height);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.screenshot({ path: `/tmp/beach-web-facelift/${name}-${colorScheme}-${width}.png`, fullPage: true });
      }
    }
  }
});
