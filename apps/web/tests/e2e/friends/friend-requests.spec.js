import { test, expect, navigateWithAuth, authenticateAndGotoHome } from '../fixtures/test-fixtures.js';
import {
  getPlayerIdForToken,
  sendFriendRequestApi,
} from '../utils/test-helpers.js';

/**
 * E2E tests for the friend request lifecycle:
 * send, accept, decline, cancel, and pending state on profile.
 *
 * Uses testUser (User A) and secondTestUser (User B).
 * Each test that needs User B's browser creates a new context with tokens injected.
 */

/**
 * Click the Friends tab in the sidebar and wait for its content to load.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openFriendsTab(page) {
  await page.click('[data-testid="friends-tab"]');
  await page.waitForSelector('[data-testid="friends-section"]', { timeout: 15000 });
}

/**
 * Build the public profile URL slug for a player name.
 *
 * @param {string} name - Player's full name
 * @returns {string} URL-safe slug
 */
function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

test.describe('Friend Requests', () => {
  test('send request from player profile', async ({
    page,
    testUser,
    secondTestUser,
  }) => {
    const playerIdB = await getPlayerIdForToken(secondTestUser.token);
    const slug = slugify(secondTestUser.fullName);

    // Navigate to User B's public profile as User A (authed)
    await authenticateAndGotoHome(page, testUser);

    // Wait for auth to resolve on profile page navigation
    await navigateWithAuth(page, `/player/${playerIdB}/${slug}`);

    // The friend icon should be visible (UserPlus for "add friend")
    const friendIcon = page.locator('[data-testid="friend-add-btn"]');
    await expect(friendIcon).toBeVisible({ timeout: 10000 });

    // Click to send friend request
    await friendIcon.click();

    // Icon should change to pending (Clock)
    const pendingIcon = page.locator('[data-testid="friend-pending-btn"]');
    await expect(pendingIcon).toBeVisible({ timeout: 10000 });
  });

  test('accept incoming request', async ({
    page,
    testUser,
    secondTestUser,
  }) => {
    // User A sends request to User B via API
    const playerIdB = await getPlayerIdForToken(secondTestUser.token);
    await sendFriendRequestApi(testUser.token, playerIdB);

    // Open User B's browser on the Friends tab
    const browser = page.context().browser();
    const ctx = await browser.newContext();
    const pageB = await ctx.newPage();

    try {
      await authenticateAndGotoHome(pageB, secondTestUser);
      await openFriendsTab(pageB);

      // User B should see the incoming request
      const requestCard = pageB.locator('[data-testid="friend-request-card"]').first();
      await expect(requestCard).toBeVisible({ timeout: 10000 });

      const requestName = requestCard.locator('[data-testid="friend-request-name"]');
      await expect(requestName).toContainText(testUser.fullName);

      // Click Accept
      await requestCard.getByRole('button', { name: 'Accept' }).click();

      // Friend should now appear in "My Friends" list
      const friendCard = pageB.locator('[data-testid="friend-card"]').first();
      await expect(friendCard).toBeVisible({ timeout: 10000 });
      await expect(friendCard.locator('[data-testid="friend-name"]'))
        .toContainText(testUser.fullName);
    } finally {
      await ctx.close();
    }
  });

  test('decline incoming request', async ({
    page,
    testUser,
    secondTestUser,
  }) => {
    // User A sends request to User B via API
    const playerIdB = await getPlayerIdForToken(secondTestUser.token);
    await sendFriendRequestApi(testUser.token, playerIdB);

    // Open User B's browser on the Friends tab
    const browser = page.context().browser();
    const ctx = await browser.newContext();
    const pageB = await ctx.newPage();

    try {
      await authenticateAndGotoHome(pageB, secondTestUser);
      await openFriendsTab(pageB);

      // User B should see the incoming request
      const requestCard = pageB.locator('[data-testid="friend-request-card"]').first();
      await expect(requestCard).toBeVisible({ timeout: 10000 });
      await expect(requestCard.locator('[data-testid="friend-request-name"]'))
        .toContainText(testUser.fullName);

      // Click Decline
      await requestCard.getByRole('button', { name: 'Decline' }).click();

      // Request card should disappear
      await expect(pageB.locator('[data-testid="friend-request-card"]')).toHaveCount(0, { timeout: 10000 });

      // User should NOT appear in friends list
      await expect(pageB.locator('[data-testid="friend-name"]', { hasText: testUser.fullName }))
        .toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test('cancel outgoing request', async ({
    authedPage,
    testUser,
    secondTestUser,
  }) => {
    // User A sends request to User B via API
    const playerIdB = await getPlayerIdForToken(secondTestUser.token);
    await sendFriendRequestApi(testUser.token, playerIdB);

    // User A clicks the Friends tab
    await openFriendsTab(authedPage);

    // User A should see the sent request in "Sent Requests"
    const sentTitle = authedPage.locator('.friends-tab__section-title', { hasText: 'Sent Requests' });
    await expect(sentTitle).toBeVisible({ timeout: 10000 });

    const sentCard = authedPage.locator('[data-testid="sent-request-card"]', {
      hasText: secondTestUser.fullName,
    });
    await expect(sentCard).toBeVisible({ timeout: 10000 });

    // Click Cancel
    await sentCard.getByRole('button', { name: 'Cancel' }).click();

    // Sent request should disappear
    await expect(sentCard).toBeHidden({ timeout: 10000 });
  });

  test('pending state shown on profile after sending request', async ({
    authedPage,
    testUser,
    secondTestUser,
  }) => {
    // User A sends request to User B via API
    const playerIdB = await getPlayerIdForToken(secondTestUser.token);
    await sendFriendRequestApi(testUser.token, playerIdB);

    // User A navigates to User B's public profile (wait for auth)
    const slug = slugify(secondTestUser.fullName);
    await navigateWithAuth(authedPage, `/player/${playerIdB}/${slug}`);

    // Wait for the page to load (the player name should be visible)
    await expect(authedPage.locator('[data-testid="player-name"]')).toBeVisible({ timeout: 15000 });

    // Friend icon should show pending (Clock)
    const pendingIcon = authedPage.locator('[data-testid="friend-pending-btn"]');
    await expect(pendingIcon).toBeVisible({ timeout: 10000 });
  });
});
