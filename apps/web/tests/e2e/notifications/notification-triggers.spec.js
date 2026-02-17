import { test, expect, authenticateAndGotoHome } from '../fixtures/test-fixtures.js';
import {
  getPlayerIdForToken,
  sendFriendRequestApi,
  getFriendRequestsApi,
  acceptFriendRequestApi,
  createTestLeague,
} from '../utils/test-helpers.js';
import { createApiClient } from '../fixtures/api.js';

/**
 * E2E tests verifying that specific actions create notifications.
 *
 * Each test performs an action (friend request, accept, league join) via API,
 * then checks the recipient's notification inbox for the expected notification.
 */

test.describe('Notification Triggers', () => {
  test('friend request creates notification for receiver', async ({
    page,
    testUser,
    secondTestUser,
  }) => {
    // Send friend request: secondTestUser → testUser
    const testUserPlayerId = await getPlayerIdForToken(testUser.token);
    await sendFriendRequestApi(secondTestUser.token, testUserPlayerId);

    // Login as testUser (the receiver)
    await authenticateAndGotoHome(page, testUser);

    // Open notifications tab
    await page.click('[data-testid="notifications-tab"]');
    await page.waitForSelector('.notifications-tab-content', { timeout: 15000 });

    // Should see a friend request notification
    const notifItem = page.locator('.notifications-tab-item');
    await expect(notifItem.first()).toBeVisible({ timeout: 10000 });

    // Title should mention "Friend Request"
    await expect(
      notifItem.first().locator('.notifications-tab-item-title'),
    ).toContainText('Friend Request');

    // Message should contain the sender's name
    await expect(
      notifItem.first().locator('.notifications-tab-item-message'),
    ).toContainText(secondTestUser.fullName);
  });

  test('friend accept creates notification for sender', async ({
    page,
    testUser,
    secondTestUser,
  }) => {
    // Send friend request: testUser → secondTestUser
    const secondPlayerId = await getPlayerIdForToken(secondTestUser.token);
    await sendFriendRequestApi(testUser.token, secondPlayerId);

    // Accept the request as secondTestUser
    const requests = await getFriendRequestsApi(secondTestUser.token, 'incoming');
    const testUserPlayerId = await getPlayerIdForToken(testUser.token);
    const request = requests.find(r => r.sender_player_id === testUserPlayerId);
    if (!request) throw new Error('No incoming friend request found');
    await acceptFriendRequestApi(secondTestUser.token, request.id);

    // Login as testUser (the original sender) to check notifications
    await authenticateAndGotoHome(page, testUser);

    // Open notifications tab
    await page.click('[data-testid="notifications-tab"]');
    await page.waitForSelector('.notifications-tab-content', { timeout: 15000 });

    // Should see a "friend accepted" notification
    const notifItems = page.locator('.notifications-tab-item');
    await expect(notifItems.first()).toBeVisible({ timeout: 10000 });

    // Look for the acceptance notification
    const acceptedNotif = page.locator('.notifications-tab-item-title', {
      hasText: 'Accepted',
    });
    await expect(acceptedNotif.first()).toBeVisible({ timeout: 10000 });
  });

  test('league join creates notification for admin', async ({
    page,
    testUser,
    secondTestUser,
  }) => {
    // testUser creates an open league
    const league = await createTestLeague(testUser.token, {
      name: `Notif League ${Date.now()}`,
      is_open: true,
    });

    // secondTestUser joins the league via API
    const api = createApiClient(secondTestUser.token);
    await api.post(`/api/leagues/${league.id}/join`);

    // Login as testUser (league admin) to check notifications
    await authenticateAndGotoHome(page, testUser);

    // Open notifications tab
    await page.click('[data-testid="notifications-tab"]');
    await page.waitForSelector('.notifications-tab-content', { timeout: 15000 });

    // Should see a notification about the new member
    const notifItems = page.locator('.notifications-tab-item');
    await expect(notifItems.first()).toBeVisible({ timeout: 10000 });

    // Message should contain the joining user's name
    const joinNotif = page.locator('.notifications-tab-item-message', {
      hasText: secondTestUser.fullName,
    });
    await expect(joinNotif.first()).toBeVisible({ timeout: 10000 });
  });
});
