import {
  test,
  expect,
  navigateWithAuth,
} from '../fixtures/test-fixtures.js';
import {
  makeFriendsViaApi,
  sendFriendRequestApi,
} from '../utils/test-helpers.js';

/**
 * E2E tests for public player profile pages.
 *
 * The public player API only returns players with at least 1 game played,
 * so we use the sessionWithMatches fixture to ensure test players have games.
 */

/**
 * Build URL slug from a player name.
 *
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Navigate to a player's public profile page.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} playerId
 * @param {string} playerName
 */
function playerUrl(playerId, playerName) {
  return `/player/${playerId}/${slugify(playerName)}`;
}

test.describe('Public Player Pages', () => {
  test('public player profile renders for anonymous visitor', async ({
    page,
    sessionWithMatches,
  }) => {
    const { playerNames, playerIds } = sessionWithMatches;
    const playerName = playerNames[0];
    const playerId = playerIds[playerName];

    // Navigate as anonymous user (no auth tokens)
    await page.goto(playerUrl(playerId, playerName));

    // Navbar should be present
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });

    // Player name should be visible
    const nameLocator = page.locator('[data-testid="player-name"]');
    await expect(nameLocator).toBeVisible({ timeout: 15000 });
    await expect(nameLocator).toContainText(playerName);

    // Stats section should be visible
    await expect(page.locator('[data-testid="player-stats"]')).toBeVisible();

    // Auth prompt CTA should appear for anonymous visitors
    await expect(page.locator('[data-testid="player-footer"]')).toBeVisible();
  });

  test('profile renders with wrong slug', async ({
    page,
    sessionWithMatches,
  }) => {
    const { playerNames, playerIds } = sessionWithMatches;
    const playerName = playerNames[0];
    const playerId = playerIds[playerName];

    // Navigate with a wrong slug — page should still render the correct player
    await page.goto(`/player/${playerId}/wrong-slug-here`);

    // Player name should still be visible (no redirect, just canonical in metadata)
    const nameLocator = page.locator('[data-testid="player-name"]');
    await expect(nameLocator).toBeVisible({ timeout: 15000 });
    await expect(nameLocator).toContainText(playerName);
  });

  test('invalid player ID shows 404', async ({ page }) => {
    await page.goto('/player/99999/nobody');

    // Next.js should show a 404 page
    await expect(page.locator('text=This page could not be found')).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Authenticated Player Profile', () => {
  test('authed user views another player profile', async ({
    authedPage,
    sessionWithMatches,
  }) => {
    const { playerNames, playerIds } = sessionWithMatches;
    const playerName = playerNames[0];
    const playerId = playerIds[playerName];

    await navigateWithAuth(authedPage, playerUrl(playerId, playerName));

    // Player name visible
    const nameLocator = authedPage.locator('[data-testid="player-name"]');
    await expect(nameLocator).toBeVisible({ timeout: 15000 });
    await expect(nameLocator).toContainText(playerName);

    // Footer CTA should NOT appear for authenticated users
    await expect(authedPage.locator('[data-testid="player-footer"]')).not.toBeVisible();

    // Add-friend button should be visible (not self, not already friends)
    await expect(authedPage.locator('[data-testid="friend-add-btn"]')).toBeVisible({ timeout: 10000 });
  });

  test('self profile shows no friend buttons', async ({
    authedPage,
    testUser,
  }) => {
    await navigateWithAuth(
      authedPage,
      playerUrl(testUser.playerId, testUser.fullName),
    );

    await expect(authedPage.locator('[data-testid="player-name"]')).toBeVisible({ timeout: 15000 });

    // None of the friend/message buttons should be visible on own profile
    await expect(authedPage.locator('[data-testid="friend-add-btn"]')).not.toBeVisible();
    await expect(authedPage.locator('[data-testid="friend-active-btn"]')).not.toBeVisible();
    await expect(authedPage.locator('[data-testid="friend-pending-btn"]')).not.toBeVisible();
    await expect(authedPage.locator('[data-testid="player-message-btn"]')).not.toBeVisible();
  });

  test('add friend shows pending state', async ({
    authedPage,
    testUser,
    secondTestUser,
  }) => {
    await navigateWithAuth(
      authedPage,
      playerUrl(secondTestUser.playerId, secondTestUser.fullName),
    );

    // Click add-friend button
    const addBtn = authedPage.locator('[data-testid="friend-add-btn"]');
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();

    // Pending button should replace the add button
    await expect(authedPage.locator('[data-testid="friend-pending-btn"]')).toBeVisible({ timeout: 5000 });
    await expect(authedPage.locator('[data-testid="friend-add-btn"]')).not.toBeVisible();
  });

  test('friends shows active btn and message icon', async ({
    authedPage,
    testUser,
    secondTestUser,
  }) => {
    // Setup: make friends via API
    await makeFriendsViaApi(testUser.token, secondTestUser.token);

    await navigateWithAuth(
      authedPage,
      playerUrl(secondTestUser.playerId, secondTestUser.fullName),
    );

    // Active friend button visible
    await expect(authedPage.locator('[data-testid="friend-active-btn"]')).toBeVisible({ timeout: 10000 });

    // Message button visible (only for friends)
    await expect(authedPage.locator('[data-testid="player-message-btn"]')).toBeVisible();
  });

  test('incoming request shows accept button', async ({
    authedPage,
    testUser,
    secondTestUser,
  }) => {
    // Setup: secondUser sends friend request to testUser via API
    await sendFriendRequestApi(secondTestUser.token, testUser.playerId);

    // testUser views secondUser's profile — should see incoming accept button
    await navigateWithAuth(
      authedPage,
      playerUrl(secondTestUser.playerId, secondTestUser.fullName),
    );

    await expect(authedPage.locator('[data-testid="friend-incoming-btn"]')).toBeVisible({ timeout: 10000 });
  });

  test('mutual friends section renders', async ({
    authedPage,
    testUser,
    secondTestUser,
    thirdTestUser,
  }) => {
    // Setup: A↔C and B↔C friends (C = thirdTestUser is mutual)
    await makeFriendsViaApi(testUser.token, thirdTestUser.token);
    await makeFriendsViaApi(secondTestUser.token, thirdTestUser.token);

    // A views B's profile — should see C as mutual friend
    await navigateWithAuth(
      authedPage,
      playerUrl(secondTestUser.playerId, secondTestUser.fullName),
    );

    await expect(authedPage.locator('.public-player__mutual-friends')).toBeVisible({ timeout: 10000 });
    await expect(authedPage.locator('[data-testid="mutual-friend-name"]')).toContainText(thirdTestUser.fullName);
  });
});
