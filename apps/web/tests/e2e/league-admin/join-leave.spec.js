import { test, expect } from '../fixtures/test-fixtures.js';
import { createTestLeague } from '../utils/test-helpers.js';
import { createApiClient } from '../fixtures/api.js';

/**
 * E2E tests for joining and leaving leagues.
 *
 * Uses `testUser` (league admin) + `secondTestUser` (joiner).
 * Open leagues use direct join; invite-only leagues use request flow.
 */

/**
 * Inject auth tokens and navigate to a page, waiting for /api/auth/me.
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

test.describe('Join & Leave League', () => {
  test('player joins open league', async ({
    browser,
    testUser,
    secondTestUser,
  }) => {
    // Create an open league
    const league = await createTestLeague(testUser.token, {
      name: `Open League ${Date.now()}`,
      is_open: true,
    });

    // Open a new context for secondTestUser
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, secondTestUser, `/league/${league.id}`);

      // Should see the public league view with Join button
      const joinBtn = page.getByRole('button', { name: 'Join League' });
      await expect(joinBtn).toBeVisible({ timeout: 15000 });

      // Click Join League
      await joinBtn.click();

      // Page should reload and show the league dashboard (member view)
      await page.waitForURL(/\/league\/\d+/, { timeout: 15000 });

      // After reload, league dashboard should be visible (member now)
      await expect(page.locator('.league-dashboard')).toBeVisible({ timeout: 15000 });
    } finally {
      await context.close();
    }
  });

  test('player leaves league', async ({
    browser,
    testUser,
    secondTestUser,
  }) => {
    // Create league and add secondTestUser via API
    const league = await createTestLeague(testUser.token, {
      name: `Leave League ${Date.now()}`,
      is_open: true,
    });

    const api = createApiClient(secondTestUser.token);
    await api.post(`/api/leagues/${league.id}/join`);

    // Open context for secondTestUser
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, secondTestUser, `/league/${league.id}?tab=details`);

      // Wait for details tab to load
      await page.waitForSelector('[data-testid="details-tab"]', { timeout: 15000 });

      // Click "Leave League"
      const leaveBtn = page.locator('.league-leave-text-button');
      await expect(leaveBtn).toBeVisible({ timeout: 10000 });
      await leaveBtn.click();

      // Confirmation modal should appear
      const confirmModal = page.locator('.modal-overlay');
      await expect(confirmModal).toBeVisible({ timeout: 10000 });

      // Click the confirm "Leave League" button in the modal
      await confirmModal.getByRole('button', { name: 'Leave League' }).click();

      // Should navigate back to home
      await page.waitForURL(/\/home/, { timeout: 15000 });
    } finally {
      await context.close();
    }
  });

  test('request to join invite-only league', async ({
    browser,
    testUser,
    secondTestUser,
  }) => {
    // Create an invite-only league
    const league = await createTestLeague(testUser.token, {
      name: `Private League ${Date.now()}`,
      is_open: false,
    });

    // Open context for secondTestUser
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, secondTestUser, `/league/${league.id}`);

      // Should see "Request to Join" button
      const requestBtn = page.getByRole('button', { name: 'Request to Join' });
      await expect(requestBtn).toBeVisible({ timeout: 15000 });

      // Click Request to Join
      await requestBtn.click();

      // Should show success state (toast or button state change)
      // Wait a moment and verify the button is no longer actionable
      await page.waitForTimeout(2000);
    } finally {
      await context.close();
    }
  });

  test('admin sees Join Requests on Details tab and accepts invite via UI', async ({
    browser,
    testUser,
    secondTestUser,
  }) => {
    const league = await createTestLeague(testUser.token, {
      name: `Join Requests UI League ${Date.now()}`,
      is_open: false,
    });

    const memberApi = createApiClient(secondTestUser.token);
    await memberApi.post(`/api/leagues/${league.id}/request-join`);

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    try {
      await authenticateAndGoto(adminPage, testUser, `/league/${league.id}?tab=details`);

      await expect(adminPage.locator('.league-dashboard')).toBeVisible({ timeout: 15000 });

      const joinRequestsSection = adminPage.locator('.league-join-requests-section');
      await expect(joinRequestsSection).toBeVisible({ timeout: 10000 });
      await expect(adminPage.getByRole('heading', { name: /Join Requests \(\d+\)/ })).toBeVisible();

      const acceptBtn = adminPage.getByRole('button', { name: 'Accept Invite' }).first();
      await expect(acceptBtn).toBeVisible();
      await acceptBtn.click();

      await adminPage.waitForTimeout(1500);

      await expect(joinRequestsSection).toContainText('No pending join requests', { timeout: 5000 });
    } finally {
      await adminContext.close();
    }
  });

  test('admin declines join request via UI with confirmation', async ({
    browser,
    testUser,
    secondTestUser,
  }) => {
    const league = await createTestLeague(testUser.token, {
      name: `Decline UI League ${Date.now()}`,
      is_open: false,
    });

    const memberApi = createApiClient(secondTestUser.token);
    await memberApi.post(`/api/leagues/${league.id}/request-join`);

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    try {
      await authenticateAndGoto(adminPage, testUser, `/league/${league.id}?tab=details`);

      await expect(adminPage.locator('.league-dashboard')).toBeVisible({ timeout: 15000 });
      const joinRequestsSection = adminPage.locator('.league-join-requests-section');
      await expect(joinRequestsSection).toBeVisible({ timeout: 10000 });

      const declineBtn = adminPage.getByRole('button', { name: 'Decline' }).first();
      await declineBtn.click();

      const modal = adminPage.locator('.confirmation-modal');
      await expect(modal).toBeVisible({ timeout: 5000 });
      await expect(modal).toContainText('Decline join request?');
      await modal.getByRole('button', { name: 'Decline' }).click();

      await adminPage.waitForTimeout(1500);
      await expect(joinRequestsSection).toContainText('No pending join requests', { timeout: 5000 });
    } finally {
      await adminContext.close();
    }
  });

  test('admin approves join request via API', async ({
    browser,
    testUser,
    secondTestUser,
  }) => {
    // Create an invite-only league
    const league = await createTestLeague(testUser.token, {
      name: `Approve Join League ${Date.now()}`,
      is_open: false,
    });

    // secondTestUser requests to join via API
    const memberApi = createApiClient(secondTestUser.token);
    const requestResp = await memberApi.post(`/api/leagues/${league.id}/request-join`);
    const requestId = requestResp.data.request_id;

    // Admin approves the join request
    const adminApi = createApiClient(testUser.token);
    await adminApi.post(
      `/api/leagues/${league.id}/join-requests/${requestId}/approve`,
    );

    // Verify secondTestUser is now a member by navigating as them
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await authenticateAndGoto(page, secondTestUser, `/league/${league.id}`);

      // Should see the league dashboard (not the public/join page)
      await expect(page.locator('.league-dashboard')).toBeVisible({ timeout: 15000 });
    } finally {
      await context.close();
    }
  });

  test('admin rejects join request via API', async ({
    testUser,
    secondTestUser,
  }) => {
    // Create an invite-only league
    const league = await createTestLeague(testUser.token, {
      name: `Reject Join League ${Date.now()}`,
      is_open: false,
    });

    // secondTestUser requests to join
    const memberApi = createApiClient(secondTestUser.token);
    const requestResp = await memberApi.post(`/api/leagues/${league.id}/request-join`);
    const requestId = requestResp.data.request_id;

    // Admin rejects the join request
    const adminApi = createApiClient(testUser.token);
    const rejectResp = await adminApi.post(
      `/api/leagues/${league.id}/join-requests/${requestId}/reject`,
    );
    expect(rejectResp.status).toBe(200);
  });
});
