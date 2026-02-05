import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage.js';
import { SessionPage } from '../pages/SessionPage.js';
import {
  cleanupTestData,
  generateTestPhoneNumber,
  getVerificationCodeForPhone,
  formatPhoneForInput,
  clearBrowserStorage,
  authenticateUser,
  completeTestUserProfile,
  createPickupSession,
  invitePlayerToSession,
} from '../utils/test-helpers.js';

test.describe('Pickup Session (Non-League)', () => {
  let testPhoneNumber;
  let testPassword = 'Test1234';
  let testFullName = 'Test Session User';
  let authToken;
  let sessionCode;
  let sessionId;
  let playerIds = [];

  test.beforeEach(async ({ page }) => {
    // Clear browser storage for test isolation
    await clearBrowserStorage(page);
    // Generate a unique test phone number for each test
    testPhoneNumber = generateTestPhoneNumber();

    // Setup: Create test user
    const { createTestUser, verifyPhone, createApiClient } = await import('../fixtures/api.js');

    try {
      await createTestUser({
        phoneNumber: testPhoneNumber,
        password: testPassword,
        fullName: testFullName,
      });

      const code = await getVerificationCodeForPhone(testPhoneNumber);
      if (!code) {
        throw new Error('No verification code found after signup');
      }

      await verifyPhone(testPhoneNumber, code);
    } catch (error) {
      // User might already exist from previous test run, continue
      if (error.response?.status !== 400) {
        throw error;
      }
    }

    // Authenticate to get token for API calls
    authToken = await authenticateUser(testPhoneNumber, testPassword);

    // Complete profile to prevent "Complete Your Profile" modal from blocking tests
    await completeTestUserProfile(authToken);

    // Create 4 test players that we can add to sessions
    const api = createApiClient(authToken);
    playerIds = [];
    const playerNames = [
      `Player A ${Date.now()}`,
      `Player B ${Date.now()}`,
      `Player C ${Date.now()}`,
      `Player D ${Date.now()}`,
    ];

    for (const playerName of playerNames) {
      const response = await api.post('/api/players', { name: playerName });
      playerIds.push({ id: response.data.player_id, name: playerName });
    }

    // Wait a bit for players to be created
    await page.waitForTimeout(300);
  });

  test.afterEach(async () => {
    // Clean up test data
    if (testPhoneNumber) {
      await cleanupTestData(testPhoneNumber);
    }
  });

  test('should create a pickup session and add players', async ({ page }) => {
    const homePage = new HomePage(page);
    const sessionPage = new SessionPage(page);
    const authPage = (await import('../pages/AuthPage.js')).AuthPage;

    // 1. Login via UI
    await homePage.goto();
    const auth = new authPage(page);
    await homePage.clickSignIn();
    await auth.waitForModal();
    await auth.fillPhoneNumber(formatPhoneForInput(testPhoneNumber));
    await auth.fillPassword(testPassword);

    const responsePromise = page.waitForResponse(
      response => response.url().includes('/api/auth/login'),
      { timeout: 15000 }
    );
    await auth.submit();
    await responsePromise;
    await homePage.waitForRedirectToHome();
    expect(await homePage.isAuthenticated()).toBeTruthy();

    // 2. Navigate to My Games tab and create a pickup session
    await page.click('button:has-text("My Games"), [data-testid="my-games-tab"]');
    await page.waitForTimeout(500);

    // Click "Create game" button
    await page.click('button:has-text("Create game")');

    // Wait for redirect to session page
    await page.waitForURL('**/session/**', { timeout: 15000 });
    await sessionPage.waitForReady();

    // 3. Verify it's a pickup session
    await expect(page.locator('.open-sessions-list-badge.pickup')).toBeVisible({ timeout: 5000 });

    // 4. Should show "add players" block since we have < 4 players
    await expect(page.locator('.session-page-add-players-block')).toBeVisible({ timeout: 5000 });

    // 5. Add 4 players via the modal (should auto-open)
    // The modal should auto-open when < 4 players
    await page.waitForSelector('.session-players-drawer, .session-players-modal', { state: 'visible', timeout: 5000 });

    // Add each test player
    for (const player of playerIds) {
      await sessionPage.searchPlayer(player.name);
      await sessionPage.addPlayerByName(player.name);
    }

    // Close the modal
    await sessionPage.closeManagePlayersModal();

    // Wait for UI to update
    await page.waitForTimeout(500);

    // 6. "Add players" block should be gone now
    expect(await sessionPage.needsMorePlayers()).toBeFalsy();
  });

  test('should add a match to pickup session', async ({ page }) => {
    const sessionPage = new SessionPage(page);

    // Create session via API
    const session = await createPickupSession(authToken, {
      name: `Test Pickup ${Date.now()}`
    });
    sessionCode = session.code;
    sessionId = session.id;

    // Add 4 players to the session via API
    for (const player of playerIds) {
      await invitePlayerToSession(authToken, sessionId, player.id);
    }

    // Login and navigate to session
    const homePage = new HomePage(page);
    const authPage = (await import('../pages/AuthPage.js')).AuthPage;

    await homePage.goto();
    const auth = new authPage(page);
    await homePage.clickSignIn();
    await auth.waitForModal();
    await auth.fillPhoneNumber(formatPhoneForInput(testPhoneNumber));
    await auth.fillPassword(testPassword);

    const responsePromise = page.waitForResponse(
      response => response.url().includes('/api/auth/login'),
      { timeout: 15000 }
    );
    await auth.submit();
    await responsePromise;
    await homePage.waitForRedirectToHome();

    // Navigate to the session
    await sessionPage.goto(sessionCode);
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

    // Wait for UI update
    await page.waitForTimeout(1000);

    // Verify match was added
    const matchCount = await sessionPage.getMatchesCount();
    expect(matchCount).toBeGreaterThanOrEqual(1);
  });

  test('should not allow removing player with matches', async ({ page }) => {
    const sessionPage = new SessionPage(page);
    const { createApiClient } = await import('../fixtures/api.js');

    // Create session via API
    const session = await createPickupSession(authToken, {
      name: `Test Remove Player ${Date.now()}`
    });
    sessionCode = session.code;
    sessionId = session.id;

    // Add 4 players to the session via API
    for (const player of playerIds) {
      await invitePlayerToSession(authToken, sessionId, player.id);
    }

    // Add a match via API so player has games
    const api = createApiClient(authToken);
    await api.post('/api/matches', {
      session_id: sessionId,
      team1_player1_id: playerIds[0].id,
      team1_player2_id: playerIds[1].id,
      team2_player1_id: playerIds[2].id,
      team2_player2_id: playerIds[3].id,
      team1_score: 21,
      team2_score: 15,
    });

    // Login and navigate to session
    const homePage = new HomePage(page);
    const authPage = (await import('../pages/AuthPage.js')).AuthPage;

    await homePage.goto();
    const auth = new authPage(page);
    await homePage.clickSignIn();
    await auth.waitForModal();
    await auth.fillPhoneNumber(formatPhoneForInput(testPhoneNumber));
    await auth.fillPassword(testPassword);

    const responsePromise = page.waitForResponse(
      response => response.url().includes('/api/auth/login'),
      { timeout: 15000 }
    );
    await auth.submit();
    await responsePromise;
    await homePage.waitForRedirectToHome();

    // Navigate to the session
    await sessionPage.goto(sessionCode);
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

  test('should auto-join when opening session link', async ({ page, browser }) => {
    const sessionPage = new SessionPage(page);

    // Create session via API (creator will be auto-added)
    const session = await createPickupSession(authToken, {
      name: `Test Auto Join ${Date.now()}`
    });
    sessionCode = session.code;

    // Create a second user
    const secondPhone = generateTestPhoneNumber();
    const { createTestUser, verifyPhone } = await import('../fixtures/api.js');

    await createTestUser({
      phoneNumber: secondPhone,
      password: testPassword,
      fullName: 'Second Test User',
    });

    const code = await getVerificationCodeForPhone(secondPhone);
    await verifyPhone(secondPhone, code);

    // Complete second user's profile
    const secondToken = await authenticateUser(secondPhone, testPassword);
    await completeTestUserProfile(secondToken);

    // Open new browser context for second user
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();

    const homePage2 = new HomePage(page2);
    const sessionPage2 = new SessionPage(page2);
    const authPage = (await import('../pages/AuthPage.js')).AuthPage;

    // Login as second user
    await homePage2.goto();
    const auth2 = new authPage(page2);
    await homePage2.clickSignIn();
    await auth2.waitForModal();
    await auth2.fillPhoneNumber(formatPhoneForInput(secondPhone));
    await auth2.fillPassword(testPassword);

    const responsePromise2 = page2.waitForResponse(
      response => response.url().includes('/api/auth/login'),
      { timeout: 15000 }
    );
    await auth2.submit();
    await responsePromise2;
    await homePage2.waitForRedirectToHome();

    // Navigate to the session - should auto-join
    await sessionPage2.goto(sessionCode);
    await sessionPage2.waitForReady();

    // Open manage players to verify auto-join worked
    await sessionPage2.openManagePlayersModal();

    // Should see at least 2 players (creator + second user)
    const playerCount = await sessionPage2.getPlayersCount();
    expect(playerCount).toBeGreaterThanOrEqual(2);

    // Cleanup second user
    await context2.close();
    await cleanupTestData(secondPhone);
  });

  test('should display "Created by you" for session creator', async ({ page }) => {
    // Create session via API
    const session = await createPickupSession(authToken, {
      name: `Test Created By ${Date.now()}`
    });
    sessionCode = session.code;

    // Login
    const homePage = new HomePage(page);
    const authPage = (await import('../pages/AuthPage.js')).AuthPage;

    await homePage.goto();
    const auth = new authPage(page);
    await homePage.clickSignIn();
    await auth.waitForModal();
    await auth.fillPhoneNumber(formatPhoneForInput(testPhoneNumber));
    await auth.fillPassword(testPassword);

    const responsePromise = page.waitForResponse(
      response => response.url().includes('/api/auth/login'),
      { timeout: 15000 }
    );
    await auth.submit();
    await responsePromise;
    await homePage.waitForRedirectToHome();

    // Navigate to My Games tab
    await page.click('button:has-text("My Games"), [data-testid="my-games-tab"]');
    await page.waitForTimeout(500);

    // Check that open sessions list shows "Created by you"
    const createdByText = await page.locator('.open-sessions-list-participation:has-text("Created by you")').first();
    await expect(createdByText).toBeVisible({ timeout: 5000 });
  });
});
