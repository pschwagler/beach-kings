import { test, expect, navigateWithAuth } from '../fixtures/test-fixtures.js';

/**
 * E2E tests for tab deep links.
 *
 * Verifies that navigating directly to /home?tab=<tab> renders the correct
 * tab on first load, without falling back to the default Home tab.
 *
 * Uses `testUser` + `authedPage` (tokens already injected).
 */

test.describe('Home Tab Deep Links', () => {
  test('navigating to /home?tab=friends renders Friends tab', async ({ authedPage }) => {
    await navigateWithAuth(authedPage, '/home?tab=friends');
    await expect(authedPage.locator('[data-testid="friends-section"]')).toBeVisible({ timeout: 15000 });
  });

  test('navigating to /home?tab=profile renders Profile tab', async ({ authedPage }) => {
    await navigateWithAuth(authedPage, '/home?tab=profile');
    await expect(authedPage.locator('.profile-page__form')).toBeVisible({ timeout: 15000 });
  });

  test('navigating to /home?tab=my-games renders My Games tab', async ({ authedPage }) => {
    await navigateWithAuth(authedPage, '/home?tab=my-games');
    await expect(authedPage.locator('.my-games-tab-container')).toBeVisible({ timeout: 15000 });
  });

  test('navigating to /home?tab=notifications renders Notifications tab', async ({ authedPage }) => {
    await navigateWithAuth(authedPage, '/home?tab=notifications');
    await expect(authedPage.locator('.notifications-tab-header')).toBeVisible({ timeout: 15000 });
  });

  test('invalid tab value falls back to Home tab', async ({ authedPage }) => {
    await navigateWithAuth(authedPage, '/home?tab=garbage');
    // Should render the Home tab content (stats row is unique to HomeTab)
    await expect(authedPage.locator('.home-stats-row')).toBeVisible({ timeout: 15000 });
  });
});
