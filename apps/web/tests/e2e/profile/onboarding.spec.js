import { test, expect } from '../fixtures/test-fixtures.js';

/**
 * E2E tests for the profile completion (onboarding) modal.
 *
 * Uses the `incompleteUser` fixture — a verified user whose profile
 * has NOT been completed — to trigger the "Complete Your Profile" modal
 * on first visit to /home.
 */

/**
 * Inject auth tokens into localStorage and navigate to /home,
 * waiting for the /api/auth/me response so the AuthProvider is ready.
 */
async function authenticateAndGoto(page, user, path = '/home') {
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

test.describe('Profile Completion Modal', () => {
  test('modal shown for user with incomplete profile', async ({
    page,
    incompleteUser,
  }) => {
    await authenticateAndGoto(page, incompleteUser);

    // Modal overlay should appear
    const overlay = page.locator('.auth-modal-overlay');
    await expect(overlay).toBeVisible({ timeout: 15000 });

    // Modal should contain "Complete Your Profile" heading
    const modal = page.locator('.auth-modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('h2')).toContainText('Complete Your Profile');

    // Required fields should be present
    await expect(modal.locator('select[name="gender"]')).toBeVisible();
    await expect(modal.locator('select[name="level"]')).toBeVisible();
    await expect(modal.locator('input[name="city"]')).toBeVisible();
    await expect(modal.locator('select[name="location_id"]')).toBeVisible();

    // Submit button should be present
    await expect(modal.locator('button.auth-modal__submit')).toContainText('Save Profile');
  });

  test('complete profile form dismisses modal', async ({
    page,
    incompleteUser,
  }) => {
    await authenticateAndGoto(page, incompleteUser);

    // Wait for modal
    const modal = page.locator('.auth-modal');
    await expect(modal).toBeVisible({ timeout: 15000 });

    // Fill gender
    await modal.locator('select[name="gender"]').selectOption('male');

    // Mock geocoding API (returns GeoJSON FeatureCollection format)
    await page.route('**/api/geocode/autocomplete*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          features: [{
            properties: {
              city: 'San Diego',
              state: 'California',
              state_code: 'CA',
              name: 'San Diego',
              formatted: 'San Diego, CA, United States',
            },
            geometry: {
              coordinates: [-117.1611, 32.7157],
            },
          }],
        }),
      });
    });

    // Fill city via autocomplete — use pressSequentially to trigger debounce
    const cityInput = modal.locator('input[name="city"]');
    await cityInput.fill('');
    await cityInput.pressSequentially('San Diego', { delay: 50 });

    // Wait for autocomplete suggestions and select the first one
    const suggestions = modal.locator('.city-autocomplete-suggestions li');
    await expect(suggestions.first()).toBeVisible({ timeout: 10000 });
    await suggestions.first().click();

    // Wait for locations to load after city is selected
    const locationSelect = modal.locator('select[name="location_id"]');
    await expect(locationSelect).toBeEnabled({ timeout: 10000 });

    // Select a location
    await locationSelect.selectOption('socal_sd');

    // Fill skill level
    await modal.locator('select[name="level"]').selectOption('intermediate');

    // Submit
    await modal.locator('button.auth-modal__submit').click();

    // Modal should disappear after successful save
    await expect(modal).toBeHidden({ timeout: 15000 });

    // Home tab content should now be visible (user is no longer blocked)
    await expect(page.locator('nav')).toBeVisible();
  });

  test('profile data persists after completion', async ({
    page,
    incompleteUser,
  }) => {
    await authenticateAndGoto(page, incompleteUser);

    // Complete the profile first
    const modal = page.locator('.auth-modal');
    await expect(modal).toBeVisible({ timeout: 15000 });

    await modal.locator('select[name="gender"]').selectOption('female');

    // Mock geocoding API (returns GeoJSON FeatureCollection format)
    await page.route('**/api/geocode/autocomplete*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          features: [{
            properties: {
              city: 'San Diego',
              state: 'California',
              state_code: 'CA',
              name: 'San Diego',
              formatted: 'San Diego, CA, United States',
            },
            geometry: {
              coordinates: [-117.1611, 32.7157],
            },
          }],
        }),
      });
    });

    const cityInput = modal.locator('input[name="city"]');
    await cityInput.fill('');
    await cityInput.pressSequentially('San Diego', { delay: 50 });
    const suggestions = modal.locator('.city-autocomplete-suggestions li');
    await expect(suggestions.first()).toBeVisible({ timeout: 10000 });
    await suggestions.first().click();

    const locationSelect = modal.locator('select[name="location_id"]');
    await expect(locationSelect).toBeEnabled({ timeout: 10000 });
    await locationSelect.selectOption('socal_sd');

    await modal.locator('select[name="level"]').selectOption('advanced');
    await modal.locator('button.auth-modal__submit').click();
    await expect(modal).toBeHidden({ timeout: 15000 });

    // Reload the page
    const authMePromise = page.waitForResponse(
      resp => resp.url().includes('/api/auth/me'),
      { timeout: 15000 },
    );
    await page.reload();
    await authMePromise;

    // Modal should NOT reappear — profile is complete
    await expect(page.locator('nav')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000); // wait past the 500ms modal delay
    await expect(modal).toBeHidden();

    // Navigate to profile tab to verify saved data
    await page.click('[data-testid="profile-tab"]');
    await page.waitForSelector('.profile-page__form', { timeout: 15000 });

    // Check saved values
    await expect(page.locator('select[name="gender"]')).toHaveValue('female');
    await expect(page.locator('select[name="level"]')).toHaveValue('advanced');
    await expect(page.locator('select[name="location_id"]')).toHaveValue('socal_sd');
  });
});
