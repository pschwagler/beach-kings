import { test, expect, authenticateAndGotoHome, navigateWithAuth } from '../fixtures/test-fixtures.js';
import {
  getPlayerIdForToken,
  makeFriendsViaApi,
  sendDirectMessageApi,
  getNotificationsApi,
  markThreadReadApi,
} from '../utils/test-helpers.js';

/**
 * E2E tests for DM navigation changes and summary notification behavior.
 *
 * Covers:
 * - Messages tab visible in mobile bottom bar
 * - Friends tab hidden on mobile (moved to More menu)
 * - Summary notification created on first DM
 * - Summary notification updated (not duplicated) on subsequent DMs
 * - Summary notification dismissed/updated after marking thread as read
 * - Messages tab unread badge reflects DM count
 */

test.describe('DM Navigation & Summary Notifications', () => {
  // -----------------------------------------------------------------------
  // Mobile navigation layout
  // -----------------------------------------------------------------------

  test.describe('Mobile Navigation', () => {
    test('Messages tab is visible in mobile bottom bar', async ({ authedPage }) => {
      // Set mobile viewport
      await authedPage.setViewportSize({ width: 375, height: 812 });
      await navigateWithAuth(authedPage, '/home');

      // Messages tab should be visible (no longer hidden by desktop-only class)
      const messagesTab = authedPage.locator('[data-testid="messages-tab"]');
      await expect(messagesTab).toBeVisible({ timeout: 10000 });
    });

    test('Friends tab is hidden on mobile bottom bar', async ({ authedPage }) => {
      await authedPage.setViewportSize({ width: 375, height: 812 });
      await navigateWithAuth(authedPage, '/home');

      // Friends tab should be hidden on mobile
      const friendsTab = authedPage.locator('[data-testid="friends-tab"]');
      await expect(friendsTab).toBeHidden({ timeout: 10000 });
    });

    test('Friends is accessible via More menu on mobile', async ({ authedPage }) => {
      await authedPage.setViewportSize({ width: 375, height: 812 });
      await navigateWithAuth(authedPage, '/home');

      // Open More menu
      const moreTab = authedPage.locator('[data-testid="more-tab"]');
      await expect(moreTab).toBeVisible({ timeout: 10000 });
      await moreTab.click();

      // Friends should appear in the More dropdown
      const friendsMenuItem = authedPage.locator('.league-sidebar-more-menu-item', { hasText: 'Friends' });
      await expect(friendsMenuItem).toBeVisible({ timeout: 5000 });
    });

    test('Messages is NOT in More menu on mobile', async ({ authedPage }) => {
      await authedPage.setViewportSize({ width: 375, height: 812 });
      await navigateWithAuth(authedPage, '/home');

      // Open More menu
      await authedPage.locator('[data-testid="more-tab"]').click();

      // Messages should NOT appear in the More dropdown
      const messagesMenuItem = authedPage.locator('.league-sidebar-more-menu-item', { hasText: 'Messages' });
      await expect(messagesMenuItem).toBeHidden({ timeout: 3000 });
    });

    test('Both Messages and Friends visible on desktop', async ({ page, testUser }) => {
      // Set desktop viewport before navigating
      await page.setViewportSize({ width: 1280, height: 900 });
      await authenticateAndGotoHome(page, testUser);

      const messagesTab = page.locator('[data-testid="messages-tab"]');
      const friendsTab = page.locator('[data-testid="friends-tab"]');

      await expect(messagesTab).toBeVisible({ timeout: 10000 });
      await expect(friendsTab).toBeVisible({ timeout: 10000 });
    });
  });

  // -----------------------------------------------------------------------
  // Summary notification behavior
  // -----------------------------------------------------------------------

  test.describe('Summary Notifications', () => {
    test('first DM creates summary notification with count 1', async ({
      page,
      testUser,
      secondTestUser,
    }) => {
      // Make them friends first
      await makeFriendsViaApi(testUser.token, secondTestUser.token);

      const receiverPlayerId = await getPlayerIdForToken(testUser.token);

      // Send one DM: secondTestUser → testUser
      await sendDirectMessageApi(secondTestUser.token, receiverPlayerId, 'Hello friend!');

      // Check testUser's notifications via API
      const notifs = await getNotificationsApi(testUser.token, { unread_only: true });
      const dmNotifs = notifs.notifications.filter(n => n.type === 'direct_message');

      expect(dmNotifs).toHaveLength(1);
      expect(dmNotifs[0].title).toContain('1 unread message');
      expect(dmNotifs[0].message).toContain(secondTestUser.fullName);
      expect(dmNotifs[0].message).toContain('Hello friend!');
      expect(dmNotifs[0].link_url).toBe('/home?tab=messages');
    });

    test('second DM updates same notification to count 2 (no duplicate)', async ({
      page,
      testUser,
      secondTestUser,
    }) => {
      await makeFriendsViaApi(testUser.token, secondTestUser.token);
      const receiverPlayerId = await getPlayerIdForToken(testUser.token);

      // Send two DMs
      await sendDirectMessageApi(secondTestUser.token, receiverPlayerId, 'First message');
      await sendDirectMessageApi(secondTestUser.token, receiverPlayerId, 'Second message');

      // Check: should be exactly ONE unread DM notification, with count 2
      const notifs = await getNotificationsApi(testUser.token, { unread_only: true });
      const dmNotifs = notifs.notifications.filter(n => n.type === 'direct_message');

      expect(dmNotifs).toHaveLength(1);
      expect(dmNotifs[0].title).toContain('2 unread messages');
      expect(dmNotifs[0].message).toContain('Second message');
    });

    test('reading thread dismisses notification when all DMs read', async ({
      page,
      testUser,
      secondTestUser,
    }) => {
      await makeFriendsViaApi(testUser.token, secondTestUser.token);
      const receiverPlayerId = await getPlayerIdForToken(testUser.token);
      const senderPlayerId = await getPlayerIdForToken(secondTestUser.token);

      // Send a DM
      await sendDirectMessageApi(secondTestUser.token, receiverPlayerId, 'Read me!');

      // Verify notification exists
      let notifs = await getNotificationsApi(testUser.token, { unread_only: true });
      let dmNotifs = notifs.notifications.filter(n => n.type === 'direct_message');
      expect(dmNotifs).toHaveLength(1);

      // Mark thread as read
      await markThreadReadApi(testUser.token, senderPlayerId);

      // Notification should now be dismissed (is_read = true)
      notifs = await getNotificationsApi(testUser.token, { unread_only: true });
      dmNotifs = notifs.notifications.filter(n => n.type === 'direct_message');
      expect(dmNotifs).toHaveLength(0);
    });

    test('reading one thread updates notification count for remaining unread', async ({
      page,
      testUser,
      secondTestUser,
      thirdTestUser,
    }) => {
      // Make testUser friends with both
      await makeFriendsViaApi(testUser.token, secondTestUser.token);
      await makeFriendsViaApi(testUser.token, thirdTestUser.token);

      const receiverPlayerId = await getPlayerIdForToken(testUser.token);
      const secondSenderPlayerId = await getPlayerIdForToken(secondTestUser.token);

      // Both send DMs to testUser
      await sendDirectMessageApi(secondTestUser.token, receiverPlayerId, 'From user 2');
      await sendDirectMessageApi(thirdTestUser.token, receiverPlayerId, 'From user 3');

      // Should have 1 notification with count 2
      let notifs = await getNotificationsApi(testUser.token, { unread_only: true });
      let dmNotifs = notifs.notifications.filter(n => n.type === 'direct_message');
      expect(dmNotifs).toHaveLength(1);
      expect(dmNotifs[0].title).toContain('2 unread messages');

      // Mark thread with secondTestUser as read
      await markThreadReadApi(testUser.token, secondSenderPlayerId);

      // Notification should update to count 1 (still unread from thirdTestUser)
      notifs = await getNotificationsApi(testUser.token, { unread_only: true });
      dmNotifs = notifs.notifications.filter(n => n.type === 'direct_message');
      expect(dmNotifs).toHaveLength(1);
      expect(dmNotifs[0].title).toContain('1 unread message');
    });
  });

  // -----------------------------------------------------------------------
  // Messages tab badge + notification UI
  // -----------------------------------------------------------------------

  test.describe('Messages Tab Badge', () => {
    test('Messages tab shows unread badge after receiving DM', async ({
      authedPage,
      testUser,
      secondTestUser,
    }) => {
      await makeFriendsViaApi(testUser.token, secondTestUser.token);
      const receiverPlayerId = await getPlayerIdForToken(testUser.token);

      // Send a DM to testUser (who is the authedPage user)
      await sendDirectMessageApi(secondTestUser.token, receiverPlayerId, 'Badge test');

      // Navigate to home to see the badge (refresh to pick up new unread count)
      await navigateWithAuth(authedPage, '/home');

      // The messages tab badge should show
      const badge = authedPage.locator('[data-testid="messages-tab"] .league-sidebar-nav-badge');
      await expect(badge).toBeVisible({ timeout: 15000 });
      await expect(badge).toHaveText('1');
    });

    test('notification appears in Notifications tab with summary text', async ({
      authedPage,
      testUser,
      secondTestUser,
    }) => {
      await makeFriendsViaApi(testUser.token, secondTestUser.token);
      const receiverPlayerId = await getPlayerIdForToken(testUser.token);

      // Send DM
      await sendDirectMessageApi(secondTestUser.token, receiverPlayerId, 'Check your notifications');

      // Navigate to notifications tab
      await navigateWithAuth(authedPage, '/home?tab=notifications');
      await authedPage.waitForSelector('.notifications-tab-content', { timeout: 15000 });

      // Should see the summary notification
      const notifTitle = authedPage.locator('[data-testid="notification-title"]', {
        hasText: 'unread message',
      });
      await expect(notifTitle.first()).toBeVisible({ timeout: 10000 });

      // Message should show sender name and preview
      const notifMessage = authedPage
        .locator('[data-testid="notification-item"]')
        .filter({ hasText: secondTestUser.fullName })
        .locator('[data-testid="notification-message"]');
      await expect(notifMessage.first()).toContainText('Check your notifications');
    });
  });
});
