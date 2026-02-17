import { test, expect, authenticateAndGotoHome } from '../fixtures/test-fixtures.js';
import {
  getPlayerIdForToken,
  sendFriendRequestApi,
} from '../utils/test-helpers.js';

/**
 * E2E tests for the notification bell, inbox dropdown, and full notifications tab.
 *
 * Uses testUser + secondTestUser. Friend requests trigger notifications,
 * giving us a reliable way to seed notification state.
 */

test.describe('Notification Bell & Inbox', () => {
  test('notification bell shows unread count after friend request', async ({
    page,
    testUser,
    secondTestUser,
  }) => {
    // Send a friend request from secondTestUser → testUser (creates a notification)
    const testUserPlayerId = await getPlayerIdForToken(testUser.token);
    await sendFriendRequestApi(secondTestUser.token, testUserPlayerId);

    // Login as testUser and navigate to home
    await authenticateAndGotoHome(page, testUser);

    // Bell should be visible in navbar
    const bellButton = page.locator('[data-testid="notification-bell"]');
    await expect(bellButton).toBeVisible({ timeout: 10000 });

    // Badge should show unread count > 0
    const badge = page.locator('[data-testid="notification-badge"]');
    await expect(badge).toBeVisible({ timeout: 10000 });
  });

  test('clicking bell opens notification inbox', async ({
    page,
    testUser,
    secondTestUser,
  }) => {
    // Seed a notification
    const testUserPlayerId = await getPlayerIdForToken(testUser.token);
    await sendFriendRequestApi(secondTestUser.token, testUserPlayerId);

    await authenticateAndGotoHome(page, testUser);

    // Click the bell
    const bellButton = page.locator('[data-testid="notification-bell"]');
    await expect(bellButton).toBeVisible({ timeout: 10000 });
    await bellButton.click();

    // Inbox panel should open
    const inbox = page.locator('.notification-inbox');
    await expect(inbox).toBeVisible({ timeout: 10000 });

    // Should contain at least one notification item
    const item = inbox.locator('.notification-inbox-item');
    await expect(item.first()).toBeVisible({ timeout: 10000 });

    // Notification should mention friend request
    await expect(item.first().locator('.notification-inbox-item-title'))
      .toContainText('Friend Request');
  });

  test('clicking notification marks it as read', async ({
    page,
    testUser,
    secondTestUser,
  }) => {
    // Seed a notification
    const testUserPlayerId = await getPlayerIdForToken(testUser.token);
    await sendFriendRequestApi(secondTestUser.token, testUserPlayerId);

    await authenticateAndGotoHome(page, testUser);

    // Open the notifications full tab (has individual mark-as-read buttons)
    await page.click('[data-testid="notifications-tab"]');
    await page.waitForSelector('[data-testid="notifications-list"]', { timeout: 15000 });

    // Unread notification should be present
    const unreadItem = page.locator('.notifications-tab-item.unread');
    await expect(unreadItem.first()).toBeVisible({ timeout: 10000 });

    // Click the mark-as-read button on the first unread item
    const markReadBtn = unreadItem.first().locator('[data-testid="notification-mark-read"]');
    await expect(markReadBtn).toBeVisible();
    await markReadBtn.click();

    // The item should lose its unread class (no longer has blue dot)
    await expect(unreadItem.first().locator('[data-testid="notification-unread-dot"]'))
      .toBeHidden({ timeout: 10000 });
  });

  test('mark all as read clears all unread notifications', async ({
    page,
    testUser,
    secondTestUser,
    thirdTestUser,
  }) => {
    // Seed multiple notifications
    const testUserPlayerId = await getPlayerIdForToken(testUser.token);
    await sendFriendRequestApi(secondTestUser.token, testUserPlayerId);
    await sendFriendRequestApi(thirdTestUser.token, testUserPlayerId);

    await authenticateAndGotoHome(page, testUser);

    // Navigate to full notifications tab
    await page.click('[data-testid="notifications-tab"]');
    await page.waitForSelector('[data-testid="notifications-list"]', { timeout: 15000 });

    // Unread items should exist
    const unreadItems = page.locator('.notifications-tab-item.unread');
    await expect(unreadItems.first()).toBeVisible({ timeout: 10000 });

    // Click "Mark all as read"
    const markAllBtn = page.locator('[data-testid="notifications-mark-all"]');
    await expect(markAllBtn).toBeVisible({ timeout: 10000 });
    await markAllBtn.click();

    // All unread indicators should disappear
    await expect(page.locator('.notifications-tab-item.unread')).toHaveCount(0, { timeout: 10000 });

    // Badge on bell should disappear
    await expect(page.locator('[data-testid="notification-badge"]')).toBeHidden({ timeout: 10000 });
  });

  test('notification link navigates to correct page', async ({
    page,
    testUser,
    secondTestUser,
  }) => {
    // Friend request notification links to /home?tab=friends
    const testUserPlayerId = await getPlayerIdForToken(testUser.token);
    await sendFriendRequestApi(secondTestUser.token, testUserPlayerId);

    await authenticateAndGotoHome(page, testUser);

    // Open bell inbox
    const bellButton = page.locator('[data-testid="notification-bell"]');
    await bellButton.click();

    const inbox = page.locator('.notification-inbox');
    await expect(inbox).toBeVisible({ timeout: 10000 });

    // Click the notification item (should navigate to friends tab)
    const item = inbox.locator('.notification-inbox-item').first();
    await item.click();

    // Should navigate — friends tab content should appear
    await page.waitForSelector('[data-testid="friends-section"]', { timeout: 15000 });
  });
});
