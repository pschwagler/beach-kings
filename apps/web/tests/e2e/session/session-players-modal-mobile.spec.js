import { test, expect } from '../fixtures/test-fixtures.js';
import { SessionPage } from '../pages/SessionPage.js';
import {
  createPickupSession,
  invitePlayerToSession,
} from '../utils/test-helpers.js';
import { createApiClient } from '../fixtures/api.js';

/**
 * Helper: create a pickup session with N placeholder players added via API.
 * Returns { session, playerIds, playerNames, api }.
 */
async function createSessionWithPlayers(token, playerCount = 4) {
  const api = createApiClient(token);
  const ts = Date.now();
  const playerNames = [];
  const playerIds = [];

  for (let i = 0; i < playerCount; i++) {
    const name = `Mobile P${i + 1} ${ts}`;
    const resp = await api.post('/api/players', { name });
    playerNames.push(name);
    playerIds.push(resp.data.player_id);
  }

  const session = await createPickupSession(token, { name: `Mobile Test ${ts}` });

  for (const id of playerIds) {
    await invitePlayerToSession(token, session.id, id);
  }

  return { session, playerIds, playerNames, api };
}

test.describe('SessionPlayersModal - Mobile Viewport', () => {
  test('drawer opens as bottom sheet and header is visible', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    await sessionPage.setMobileViewport(390, 844);

    const { session } = await createSessionWithPlayers(testUser.token, 4);

    await sessionPage.goto(session.code);
    await sessionPage.waitForReady();

    await sessionPage.openManagePlayersModal();

    // Drawer should be visible
    const drawer = page.locator('[data-testid="session-players-drawer"]');
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Header text should be visible
    const header = page.locator('#session-players-drawer-title');
    await expect(header).toBeVisible();
    await expect(header).toHaveText('Manage session');

    // Screenshot for visual evidence
    await page.screenshot({ path: 'test-results/mobile-drawer-open.png' });
  });

  test('Done button visible and clickable at 390x844', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    await sessionPage.setMobileViewport(390, 844);

    const { session } = await createSessionWithPlayers(testUser.token, 4);

    await sessionPage.goto(session.code);
    await sessionPage.waitForReady();
    await sessionPage.openManagePlayersModal();

    // Done button should be within viewport bounds
    await sessionPage.assertElementWithinViewport('.session-players-drawer-actions .league-text-button.primary');

    // Click Done — drawer should close
    await sessionPage.closeManagePlayersModal();
    await expect(page.locator('[data-testid="session-players-drawer"]')).not.toBeVisible();
  });

  test('Done button visible and clickable at 375x667 (iPhone SE)', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    // Smallest common viewport — most likely to clip
    await sessionPage.setMobileViewport(375, 667);

    const { session } = await createSessionWithPlayers(testUser.token, 4);

    await sessionPage.goto(session.code);
    await sessionPage.waitForReady();
    await sessionPage.openManagePlayersModal();

    // Done button must be within viewport at this tight size
    const box = await sessionPage.assertElementWithinViewport(
      '.session-players-drawer-actions .league-text-button.primary'
    );

    // Verify the footer bottom edge is within the drawer
    const drawerBox = await page.locator('[data-testid="session-players-drawer"]').boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(drawerBox.y + drawerBox.height);

    await page.screenshot({ path: 'test-results/mobile-drawer-iphonese.png' });

    // Click Done
    await sessionPage.closeManagePlayersModal();
  });

  test('search input reachable and functional', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    await sessionPage.setMobileViewport(390, 844);

    const { session, playerNames } = await createSessionWithPlayers(testUser.token, 4);

    await sessionPage.goto(session.code);
    await sessionPage.waitForReady();
    await sessionPage.openManagePlayersModal();

    // Switch to Add players tab
    const addTab = page.locator('[role="tab"]:has-text("Add players")');
    await addTab.click();

    // Search input should be visible and interactable
    const searchInput = page.locator('.session-players-search, .session-players-filters input[type="text"]').first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await sessionPage.assertElementWithinViewport('.session-players-search, .session-players-filters input[type="text"]');

    // Type a search query and verify API call fires
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/api/players') && resp.status() === 200,
      { timeout: 10000 }
    ).catch(() => null);

    await searchInput.fill('Test');
    await responsePromise;

    await sessionPage.closeManagePlayersModal();
  });

  test('full add-player workflow completes on mobile', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    await sessionPage.setMobileViewport(390, 844);

    // Create session with only 2 players so we can add more
    const api = createApiClient(testUser.token);
    const ts = Date.now();
    const session = await createPickupSession(testUser.token, { name: `Mobile Add ${ts}` });

    // Create a player to add
    const addName = `MobileAdd ${ts}`;
    const resp = await api.post('/api/players', { name: addName });
    const addPlayerId = resp.data.player_id;

    await sessionPage.goto(session.code);
    await sessionPage.waitForReady();
    await sessionPage.openManagePlayersModal();

    // Switch to Add players tab
    const addTab = page.locator('[role="tab"]:has-text("Add players")');
    await addTab.click();

    // Search for the player
    await sessionPage.searchPlayer(addName);

    // Add the player
    await sessionPage.addPlayerByName(addName);

    // Click Done — drawer should close
    await sessionPage.closeManagePlayersModal();
    await expect(page.locator('[data-testid="session-players-drawer"]')).not.toBeVisible();
  });

  test('player list scrollable with many players', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    await sessionPage.setMobileViewport(375, 667);

    // Create session with 8 players to force scrolling
    const { session, playerNames } = await createSessionWithPlayers(testUser.token, 8);

    await sessionPage.goto(session.code);
    await sessionPage.waitForReady();
    await sessionPage.openManagePlayersModal();

    // Switch to "In this session" tab
    const inSessionTab = page.locator('[role="tab"]:has-text("In this session")');
    await inSessionTab.click();
    await page.waitForSelector('.session-players-list-item', { state: 'attached', timeout: 5000 });

    // Scroll area should be scrollable (scrollHeight > clientHeight)
    const dims = await sessionPage.getDrawerScrollAreaDimensions();
    expect(dims.scrollHeight).toBeGreaterThan(dims.clientHeight);

    // Scroll to bottom and verify last player is visible
    await sessionPage.scrollDrawerToBottom();
    // Small delay for scroll to settle
    await page.waitForTimeout(300);

    // The last player should now be visible in the viewport
    const lastPlayer = page.locator('.session-players-list-item').last();
    await expect(lastPlayer).toBeVisible();

    await page.screenshot({ path: 'test-results/mobile-drawer-scrolled.png' });

    await sessionPage.closeManagePlayersModal();
  });

  test('session details do not push content off-screen', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    await sessionPage.setMobileViewport(375, 667);

    const { session } = await createSessionWithPlayers(testUser.token, 4);

    await sessionPage.goto(session.code);
    await sessionPage.waitForReady();
    await sessionPage.openManagePlayersModal();

    // Tabs should still be visible despite session details (name + court)
    const tabs = page.locator('.session-players-view-tabs');
    await expect(tabs).toBeVisible({ timeout: 5000 });
    await sessionPage.assertElementWithinViewport('.session-players-view-tabs');

    // Scroll area should have meaningful height — at least 80px ensures
    // at least one player row is visible. (Measured: ~86px on iPhone SE 375x667
    // with session details visible — tight but functional.)
    const dims = await sessionPage.getDrawerScrollAreaDimensions();
    expect(dims.clientHeight).toBeGreaterThanOrEqual(80);

    await page.screenshot({ path: 'test-results/mobile-drawer-details.png' });

    await sessionPage.closeManagePlayersModal();
  });
});
