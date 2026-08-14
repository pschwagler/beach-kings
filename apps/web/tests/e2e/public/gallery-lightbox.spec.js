import { test, expect } from '@playwright/test';
import { executeQuery } from '../fixtures/db.js';

const PHOTO_KEYS = ['e2e-20260813/gallery-one', 'e2e-20260813/gallery-two'];
const SLUG = 'e2e-20260813-gallery-court';

test.describe('Public court gallery and lightbox @p1', () => {
  test.beforeAll(async () => {
    await executeQuery(`
      INSERT INTO regions (id, name) VALUES ('california', 'California')
      ON CONFLICT (id) DO NOTHING
    `);
    await executeQuery(`
      INSERT INTO locations (
        id, name, city, state, region_id, tier, latitude, longitude,
        seasonality, radius_miles, slug
      ) VALUES (
        'socal_sd', 'CA - San Diego', 'Mission Beach', 'CA', 'california',
        1, 32.7698, -117.2514, 'Year-Round', 30, 'mission-beach-ca'
      ) ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug
    `);
    await executeQuery(`
      INSERT INTO courts (
        name, slug, address, location_id, court_count, surface_type,
        is_free, status, description
      ) VALUES (
        'E2E Gallery Court', $1, 'Local E2E fixture', 'socal_sd', 2, 'sand',
        true, 'approved', 'Namespaced E2E gallery fixture'
      ) ON CONFLICT (slug) DO UPDATE SET status = 'approved'
    `, [SLUG]);
    await executeQuery('DELETE FROM court_photos WHERE s3_key = ANY($1)', [PHOTO_KEYS]);
    await executeQuery(`
      INSERT INTO court_photos (court_id, s3_key, url, sort_order, caption)
      SELECT id, $2, '/beach-kings.png', 0, 'E2E gallery first'
      FROM courts WHERE slug = $1
    `, [SLUG, PHOTO_KEYS[0]]);
    await executeQuery(`
      INSERT INTO court_photos (court_id, s3_key, url, sort_order, caption)
      SELECT id, $2, '/og-default.png', 1, 'E2E gallery second'
      FROM courts WHERE slug = $1
    `, [SLUG, PHOTO_KEYS[1]]);
  });

  test.afterAll(async () => {
    await executeQuery('DELETE FROM court_photos WHERE s3_key = ANY($1)', [PHOTO_KEYS]);
    await executeQuery('DELETE FROM courts WHERE slug = $1', [SLUG]);
  });

  test('gallery supports open, keyboard navigation, close, and court recovery', async ({ page }) => {
    await page.goto(`/courts/${SLUG}/photos`);
    await expect(page.getByRole('navigation', { name: 'Site navigation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'E2E Gallery Court' })).toBeVisible();

    const photos = page.locator('.court-photos__grid-img');
    await expect(photos).toHaveCount(2);
    await photos.first().click();
    await expect(page.getByRole('img', { name: 'Photo 1 of 2' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('img', { name: 'Photo 2 of 2' })).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('img', { name: 'Photo 1 of 2' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Close lightbox' })).toBeHidden();

    await page.getByRole('link', { name: /Return to court/ }).click();
    await expect(page).toHaveURL(new RegExp(`/courts/${SLUG}$`));
  });

  test('failed image remains dismissible', async ({ page }) => {
    await page.route('**/og-default.png', (route) => route.abort('failed'));
    await page.goto(`/courts/${SLUG}/photos`);
    await page.locator('.court-photos__grid-img').nth(1).click();
    await expect(page.getByRole('button', { name: 'Close lightbox' })).toBeVisible();
    await page.getByRole('button', { name: 'Close lightbox' }).click();
    await expect(page.getByRole('button', { name: 'Close lightbox' })).toBeHidden();
  });

  test('unknown court gallery resolves to not-found state with Navbar @smoke @p0', async ({ page }) => {
    await page.goto('/courts/not-a-real-court/photos');
    await expect(page.getByRole('navigation', { name: 'Site navigation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Court Not Found' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse all courts' })).toBeVisible();
  });
});
