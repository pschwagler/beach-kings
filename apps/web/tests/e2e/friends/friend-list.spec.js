import { test, expect, navigateWithAuth, authenticateAndGotoHome } from '../fixtures/test-fixtures.js';
import {
  getPlayerIdForToken,
  makeFriendsViaApi,
  createTestLeague,
  addPlayerToLeague,
} from '../utils/test-helpers.js';

/**
 * E2E tests for the friends list, unfriend flow, suggestions, and mutual friends.
 *
 * Uses testUser, secondTestUser, and (for mutual friends) thirdTestUser.
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

test.describe('Friends List', () => {
  test('shows accepted friend in friends list', async ({
    authedPage,
    testUser,
    secondTestUser,
  }) => {
    // Make them friends via API
    await makeFriendsViaApi(testUser.token, secondTestUser.token);

    // User A clicks the Friends tab
    await openFriendsTab(authedPage);

    // Should see User B in "My Friends"
    const friendCard = authedPage.locator('[data-testid="friend-card"]', {
      hasText: secondTestUser.fullName,
    });
    await expect(friendCard).toBeVisible({ timeout: 10000 });
    await expect(friendCard.locator('[data-testid="friend-name"]'))
      .toContainText(secondTestUser.fullName);
  });

  test('unfriend via Friends tab', async ({
    authedPage,
    testUser,
    secondTestUser,
  }) => {
    // Make them friends via API
    await makeFriendsViaApi(testUser.token, secondTestUser.token);

    // User A clicks the Friends tab
    await openFriendsTab(authedPage);

    // Find the friend card
    const friendCard = authedPage.locator('[data-testid="friend-card"]', {
      hasText: secondTestUser.fullName,
    });
    await expect(friendCard).toBeVisible({ timeout: 10000 });

    // Click the three-dot menu
    await friendCard.locator('[data-testid="friend-menu"]').click();

    // Click "Remove Friend" in the dropdown
    await friendCard.locator('[data-testid="friend-remove-option"]').click();

    // Confirm removal — click the "Remove" button in the confirmation
    await friendCard.getByRole('button', { name: 'Remove' }).click();

    // Friend should be removed from the list
    await expect(friendCard).toBeHidden({ timeout: 10000 });
  });

  test('friend suggestions appear for league members', async ({
    authedPage,
    testUser,
    secondTestUser,
  }) => {
    // Create a league with User A as admin, add User B as member
    const league = await createTestLeague(testUser.token, {
      name: `Suggestions League ${Date.now()}`,
    });
    await addPlayerToLeague(testUser.token, league.id, secondTestUser.fullName);

    // User A clicks the Friends tab
    await openFriendsTab(authedPage);

    // "People You May Know" section should show User B
    const suggestionCard = authedPage.locator('[data-testid="friend-suggestion-card"]', {
      hasText: secondTestUser.fullName,
    });
    await expect(suggestionCard).toBeVisible({ timeout: 10000 });
    await expect(suggestionCard.locator('[data-testid="friend-suggestion-name"]'))
      .toContainText(secondTestUser.fullName);
  });

  test('mutual friends shown on public profile', async ({
    page,
    testUser,
    secondTestUser,
    thirdTestUser,
  }) => {
    // A ↔ B friends, A ↔ C friends
    await makeFriendsViaApi(testUser.token, secondTestUser.token);
    await makeFriendsViaApi(testUser.token, thirdTestUser.token);

    const playerIdC = await getPlayerIdForToken(thirdTestUser.token);
    const slug = slugify(thirdTestUser.fullName);

    // User B views User C's public profile
    const browser = page.context().browser();
    const ctx = await browser.newContext();
    const pageB = await ctx.newPage();

    try {
      // Authenticate User B and navigate to User C's profile (wait for auth)
      await authenticateAndGotoHome(pageB, secondTestUser);
      await navigateWithAuth(pageB, `/player/${playerIdC}/${slug}`);

      // Wait for the page to fully load
      await expect(pageB.locator('[data-testid="player-name"]')).toBeVisible({ timeout: 15000 });

      // Should see mutual friends section with "Mutual Friend" heading
      const mutualHeading = pageB.locator('.public-player__section-title', {
        hasText: 'Mutual Friend',
      });
      await expect(mutualHeading).toBeVisible({ timeout: 10000 });

      // User A's name should appear in the mutual friends list
      const mutualFriend = pageB.locator('[data-testid="mutual-friend-name"]', {
        hasText: testUser.fullName,
      });
      await expect(mutualFriend).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});
