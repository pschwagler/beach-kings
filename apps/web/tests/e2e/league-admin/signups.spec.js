import { test, expect } from '../fixtures/test-fixtures.js';
import { createTestLeague, createTestSeason } from '../utils/test-helpers.js';
import { createApiClient } from '../fixtures/api.js';

/**
 * E2E tests for session signup flows (create, sign up, drop out, view players).
 *
 * Uses `testUser` (admin) + `secondTestUser` (player).
 * Signup management is on the league's Sign Ups tab.
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

test.describe('Session Signups', () => {
  test('create signup event', async ({ authedPage, testUser }) => {
    const page = authedPage;

    // Create league + season
    const league = await createTestLeague(testUser.token, {
      name: `Signup League ${Date.now()}`,
    });
    await createTestSeason(testUser.token, league.id, {
      name: `Signup Season ${Date.now()}`,
    });

    // Navigate to Sign Ups tab
    await page.goto(`/league/${league.id}?tab=signups`);
    await page.waitForSelector('[data-testid="signups-tab"][aria-current="page"]', { timeout: 15000 });

    // Click "Schedule New Session"
    const createBtn = page.locator('button.league-text-button', {
      hasText: 'Schedule New Session',
    });
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    // Signup modal should appear
    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Set date to tomorrow
    const tomorrow = new Date(Date.now() + 86400000);
    const dateStr = tomorrow.toISOString().split('T')[0];
    await page.fill('#scheduled-date', dateStr);

    // Set time
    await page.fill('#scheduled-time', '18:00');

    // Submit
    await page.locator('button.league-text-button.primary', {
      hasText: 'Schedule Session',
    }).click();

    // Modal should close
    await expect(modal).toBeHidden({ timeout: 15000 });

    // Signup should appear in the upcoming list
    const signupRow = page.locator('.league-signup-row');
    await expect(signupRow.first()).toBeVisible({ timeout: 10000 });
  });

  test('player signs up for event', async ({
    browser,
    testUser,
    secondTestUser,
  }) => {
    // Create league + season + signup via API
    const league = await createTestLeague(testUser.token, {
      name: `Player Signup League ${Date.now()}`,
      is_open: true,
    });
    const season = await createTestSeason(testUser.token, league.id, {
      name: `Player Signup Season ${Date.now()}`,
    });

    // secondTestUser joins the league
    const memberApi = createApiClient(secondTestUser.token);
    await memberApi.post(`/api/leagues/${league.id}/join`);

    // Create a signup event via API
    const adminApi = createApiClient(testUser.token);
    const tomorrow = new Date(Date.now() + 86400000);
    const dateStr = tomorrow.toISOString().split('T')[0];
    await adminApi.post(`/api/seasons/${season.id}/signups`, {
      scheduled_datetime: `${dateStr}T18:00:00`,
      duration_hours: 2,
    });

    // Login as secondTestUser and navigate to Sign Ups tab
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, secondTestUser, `/league/${league.id}?tab=signups`);
      await page.waitForSelector('[data-testid="signups-tab"][aria-current="page"]', { timeout: 15000 });

      // Wait for signup row to appear
      const signupRow = page.locator('.league-signup-row');
      await expect(signupRow.first()).toBeVisible({ timeout: 10000 });

      // Click "Sign Up"
      const signUpBtn = signupRow.first().locator('button.league-text-button.primary', {
        hasText: 'Sign Up',
      });
      await expect(signUpBtn).toBeVisible({ timeout: 10000 });
      await signUpBtn.click();

      // "You're signed up" badge should appear
      await expect(signupRow.first().locator('.signed-up-badge'))
        .toBeVisible({ timeout: 10000 });

      // "Drop Out" button should now be visible
      await expect(signupRow.first().locator('button', { hasText: 'Drop Out' }))
        .toBeVisible({ timeout: 10000 });
    } finally {
      await context.close();
    }
  });

  test('player drops out of event', async ({
    browser,
    testUser,
    secondTestUser,
  }) => {
    // Create league + season + signup, secondTestUser joins and signs up
    const league = await createTestLeague(testUser.token, {
      name: `Drop Out League ${Date.now()}`,
      is_open: true,
    });
    const season = await createTestSeason(testUser.token, league.id, {
      name: `Drop Out Season ${Date.now()}`,
    });

    const memberApi = createApiClient(secondTestUser.token);
    await memberApi.post(`/api/leagues/${league.id}/join`);

    const adminApi = createApiClient(testUser.token);
    const tomorrow = new Date(Date.now() + 86400000);
    const dateStr = tomorrow.toISOString().split('T')[0];
    const signupResp = await adminApi.post(
      `/api/seasons/${season.id}/signups`,
      {
        scheduled_datetime: `${dateStr}T18:00:00`,
        duration_hours: 2,
      },
    );

    // Sign up the player via API
    const signupId = signupResp.data.id;
    await memberApi.post(`/api/signups/${signupId}/signup`);

    // Login as secondTestUser
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, secondTestUser, `/league/${league.id}?tab=signups`);
      await page.waitForSelector('[data-testid="signups-tab"][aria-current="page"]', { timeout: 15000 });

      const signupRow = page.locator('.league-signup-row');
      await expect(signupRow.first()).toBeVisible({ timeout: 10000 });

      // Should see "You're signed up" badge
      await expect(signupRow.first().locator('.signed-up-badge'))
        .toBeVisible({ timeout: 10000 });

      // Click "Drop Out"
      const dropOutBtn = signupRow.first().locator('button', { hasText: 'Drop Out' });
      await expect(dropOutBtn).toBeVisible({ timeout: 10000 });
      await dropOutBtn.click();

      // Badge should disappear
      await expect(signupRow.first().locator('.signed-up-badge'))
        .toBeHidden({ timeout: 10000 });

      // "Sign Up" button should reappear
      await expect(signupRow.first().locator('button', { hasText: 'Sign Up' }))
        .toBeVisible({ timeout: 10000 });
    } finally {
      await context.close();
    }
  });

  test('view signup player list', async ({ authedPage, testUser }) => {
    const page = authedPage;

    // Create league + season + signup with a player
    const league = await createTestLeague(testUser.token, {
      name: `View Players League ${Date.now()}`,
    });
    const season = await createTestSeason(testUser.token, league.id, {
      name: `View Players Season ${Date.now()}`,
    });

    const api = createApiClient(testUser.token);
    const tomorrow = new Date(Date.now() + 86400000);
    const dateStr = tomorrow.toISOString().split('T')[0];
    const signupResp = await api.post(
      `/api/seasons/${season.id}/signups`,
      {
        scheduled_datetime: `${dateStr}T18:00:00`,
        duration_hours: 2,
      },
    );

    // Admin signs up for own event
    const signupId = signupResp.data.id;
    await api.post(`/api/signups/${signupId}/signup`);

    // Navigate to Sign Ups tab
    await page.goto(`/league/${league.id}?tab=signups`);
    await page.waitForSelector('[data-testid="signups-tab"][aria-current="page"]', { timeout: 15000 });

    const signupRow = page.locator('.league-signup-row');
    await expect(signupRow.first()).toBeVisible({ timeout: 10000 });

    // Expand the signup to see players (click the row or expand button)
    const expandBtn = signupRow.first().locator('button.league-text-button').first();
    await expandBtn.click();

    // Player list should appear
    const playerList = page.locator('.league-signup-players');
    await expect(playerList).toBeVisible({ timeout: 10000 });

    // Should show at least one player
    await expect(playerList.locator('.league-signup-player-item').first())
      .toBeVisible({ timeout: 5000 });
  });
});
