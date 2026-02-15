import { test, expect } from '../fixtures/test-fixtures.js';
import { SessionPage } from '../pages/SessionPage.js';
import {
  generateTestPhoneNumber,
  getVerificationCodeForPhone,
  authenticateUser,
  completeTestUserProfile,
  createPickupSession,
  invitePlayerToSession,
  cleanupTestData,
} from '../utils/test-helpers.js';
import { createTestUser, verifyPhone, createApiClient } from '../fixtures/api.js';

test.describe('Pickup Session (Non-League)', () => {
  test('should create a pickup session and add players', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    const { token } = testUser;

    // Create 4 test players
    const api = createApiClient(token);
    const playerIds = [];
    const playerNames = [
      `Player A ${Date.now()}`,
      `Player B ${Date.now()}`,
      `Player C ${Date.now()}`,
      `Player D ${Date.now()}`,
    ];
    for (const name of playerNames) {
      const resp = await api.post('/api/players', { name });
      playerIds.push({ id: resp.data.player_id, name });
    }

    // Navigate to My Games tab and create a pickup session
    await page.click('button:has-text("My Games"), [data-testid="my-games-tab"]');
    await page.waitForSelector('button:has-text("Create game")', { state: 'visible', timeout: 5000 });
    await page.click('button:has-text("Create game")');

    // Wait for redirect to session page
    await page.waitForURL('**/session/**', { timeout: 15000 });
    await sessionPage.waitForReady();

    // Verify it's a pickup session
    await expect(page.locator('.open-sessions-list-badge.pickup')).toBeVisible({ timeout: 5000 });

    // Should show "add players" block since we have < 4 players
    await expect(page.locator('.session-page-add-players-block')).toBeVisible({ timeout: 5000 });

    // The modal should auto-open when < 4 players
    await page.waitForSelector('.session-players-drawer, .session-players-modal', { state: 'visible', timeout: 5000 });

    // Add each test player
    for (const player of playerIds) {
      await sessionPage.searchPlayer(player.name);
      await sessionPage.addPlayerByName(player.name);
    }

    // Close the modal
    await sessionPage.closeManagePlayersModal();

    // "Add players" block should be gone now
    expect(await sessionPage.needsMorePlayers()).toBeFalsy();
  });

  test('should add a match to pickup session', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    const { token } = testUser;

    // Create 4 test players
    const api = createApiClient(token);
    const playerIds = [];
    const playerNames = [
      `Player A ${Date.now()}`,
      `Player B ${Date.now()}`,
      `Player C ${Date.now()}`,
      `Player D ${Date.now()}`,
    ];
    for (const name of playerNames) {
      const resp = await api.post('/api/players', { name });
      playerIds.push({ id: resp.data.player_id, name });
    }

    // Create session via API
    const session = await createPickupSession(token, { name: `Test Pickup ${Date.now()}` });

    // Add 4 players to the session via API
    for (const player of playerIds) {
      await invitePlayerToSession(token, session.id, player.id);
    }

    // Navigate to the session
    await sessionPage.goto(session.code);
    await sessionPage.waitForReady();

    // Add a match
    await sessionPage.clickAddMatch();
    await sessionPage.fillMatchForm({
      team1Player1: playerIds[0].name,
      team1Player2: playerIds[1].name,
      team2Player1: playerIds[2].name,
      team2Player2: playerIds[3].name,
      team1Score: 21,
      team2Score: 18,
    });
    await sessionPage.submitMatchForm();

    // Verify match was added
    await page.waitForSelector(sessionPage.selectors.matchCard, { state: 'visible', timeout: 5000 });
    const matchCount = await sessionPage.getMatchesCount();
    expect(matchCount).toBeGreaterThanOrEqual(1);
  });

  test('should not allow removing player with matches', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    const { token } = testUser;

    // Create 4 test players
    const api = createApiClient(token);
    const playerIds = [];
    const playerNames = [
      `Player A ${Date.now()}`,
      `Player B ${Date.now()}`,
      `Player C ${Date.now()}`,
      `Player D ${Date.now()}`,
    ];
    for (const name of playerNames) {
      const resp = await api.post('/api/players', { name });
      playerIds.push({ id: resp.data.player_id, name });
    }

    // Create session via API
    const session = await createPickupSession(token, { name: `Test Remove Player ${Date.now()}` });

    // Add 4 players to the session via API
    for (const player of playerIds) {
      await invitePlayerToSession(token, session.id, player.id);
    }

    // Add a match via API so player has games
    await api.post('/api/matches', {
      session_id: session.id,
      team1_player1_id: playerIds[0].id,
      team1_player2_id: playerIds[1].id,
      team2_player1_id: playerIds[2].id,
      team2_player2_id: playerIds[3].id,
      team1_score: 21,
      team2_score: 15,
    });

    // Navigate to the session
    await sessionPage.goto(session.code);
    await sessionPage.waitForReady();

    // Open manage players modal
    await sessionPage.openManagePlayersModal();

    // Try to remove a player who has matches
    await sessionPage.removePlayerByName(playerIds[0].name);

    // Should show error message
    const message = await sessionPage.getModalMessage();
    expect(message).toBeTruthy();
    expect(message.toLowerCase()).toContain('cannot remove');
  });

  test('should auto-join when opening session link', async ({ authedPage, testUser, browser }) => {
    const page = authedPage;
    const { token } = testUser;

    // Create session via API (creator will be auto-added)
    const session = await createPickupSession(token, { name: `Test Auto Join ${Date.now()}` });

    // Create a second user
    const secondPhone = generateTestPhoneNumber();
    const secondPassword = 'Test1234';
    await createTestUser({ phoneNumber: secondPhone, password: secondPassword, fullName: 'Second Test User' });
    const code = await getVerificationCodeForPhone(secondPhone);
    await verifyPhone(secondPhone, code);
    const { loginWithPassword } = await import('../fixtures/api.js');
    const secondLoginResponse = await loginWithPassword(secondPhone, secondPassword);
    const secondToken = secondLoginResponse.access_token;
    const secondRefreshToken = secondLoginResponse.refresh_token;
    await completeTestUserProfile(secondToken);

    // Open new browser context for second user, inject their tokens
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto('/');
    await page2.evaluate(({ accessToken, refreshToken }) => {
      window.localStorage.setItem('beach_access_token', accessToken);
      window.localStorage.setItem('beach_refresh_token', refreshToken);
    }, { accessToken: secondToken, refreshToken: secondRefreshToken });

    const sessionPage2 = new SessionPage(page2);

    // Navigate to the session - should auto-join
    await sessionPage2.goto(session.code);
    await sessionPage2.waitForReady();

    // Open manage players to verify auto-join worked
    await sessionPage2.openManagePlayersModal();

    // Should see at least 2 players (creator + second user)
    const playerCount = await sessionPage2.getPlayersCount();
    expect(playerCount).toBeGreaterThanOrEqual(2);

    // Cleanup
    await context2.close();
    await cleanupTestData(secondPhone);
  });

  test('should display "Created by you" for session creator', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const { token } = testUser;

    // Create session via API
    await createPickupSession(token, { name: `Test Created By ${Date.now()}` });

    // Navigate to My Games tab
    await page.click('button:has-text("My Games"), [data-testid="my-games-tab"]');
    await page.waitForSelector('.open-sessions-list-participation', { state: 'attached', timeout: 5000 }).catch(() => {});

    // Check that open sessions list shows "Created by you"
    const createdByText = page.locator('.open-sessions-list-participation:has-text("Created by you")').first();
    await expect(createdByText).toBeVisible({ timeout: 5000 });
  });
});
