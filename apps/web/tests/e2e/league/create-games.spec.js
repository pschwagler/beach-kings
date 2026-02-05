import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage.js';
import { LeaguePage } from '../pages/LeaguePage.js';
import {
  cleanupTestData,
  generateTestPhoneNumber,
  getVerificationCodeForPhone,
  formatPhoneForInput,
  clearBrowserStorage,
  authenticateUser,
  completeTestUserProfile,
  createTestLeague,
  createTestSeason,
  addPlayerToLeague
} from '../utils/test-helpers.js';

test.describe('Create Games and Submit Session', () => {
  let testPhoneNumber;
  let testPassword = 'Test1234';
  let testFullName = 'Test User';
  let authToken;
  let leagueId;
  let seasonId;
  let playerNames;

  test.beforeEach(async ({ page }) => {
    // Clear browser storage for test isolation
    await clearBrowserStorage(page);
    // Generate a unique test phone number for each test
    testPhoneNumber = generateTestPhoneNumber();
    
    // Setup: Create test user
    const { createTestUser, verifyPhone } = await import('../fixtures/api.js');
    
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

    // Create test league
    const league = await createTestLeague(authToken, {
      name: `Test League ${Date.now()}`
    });
    leagueId = league.id;
    
    // Create test season (will be active since start_date is today and end_date is in the future)
    const season = await createTestSeason(authToken, leagueId, {
      name: `Test Season ${Date.now()}`
    });
    seasonId = season.id;
    
    // Get the current user's player (the user who created the league should already be a member/admin)
    // But we'll also add 4 more test players to have enough players for games
    playerNames = [
      `Player A ${Date.now()}`,
      `Player B ${Date.now()}`,
      `Player C ${Date.now()}`,
      `Player D ${Date.now()}`
    ];
    
    for (const playerName of playerNames) {
      await addPlayerToLeague(authToken, leagueId, playerName);
    }
    
    // Wait a bit for players to be added
    await page.waitForTimeout(500);
  });

  test.afterEach(async () => {
    // Clean up test data
    if (testPhoneNumber) {
      await cleanupTestData(testPhoneNumber);
    }
  });

  test('should create 2 new games and submit the session', async ({ page }) => {
    const homePage = new HomePage(page);
    const leaguePage = new LeaguePage(page);
    const authPage = (await import('../pages/AuthPage.js')).AuthPage;

    // 1. Start as logged in user on home page
    await homePage.goto();
    
    // Login via UI
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

    // 2. Navigate to "Games" tab of existing League
    await leaguePage.goto(leagueId);
    await leaguePage.clickGamesTab();
    await leaguePage.waitForMatchesTable();

    // 3. Add first game (this automatically creates a session if none exists)
    await leaguePage.clickAddGame();
    await page.waitForTimeout(500);
    
    await leaguePage.fillMatchForm({
      team1Player1: playerNames[0],
      team1Player2: playerNames[1],
      team2Player1: playerNames[2],
      team2Player2: playerNames[3],
      team1Score: 21,
      team2Score: 18
    });
    
    await leaguePage.submitMatchForm();
    await page.waitForTimeout(1000); // Wait for session to be created and UI to update
    
    // Verify active session is now visible (created by first match)
    expect(await leaguePage.hasActiveSession()).toBeTruthy();

    // 4. Add second game
    await leaguePage.clickAddGame();
    await page.waitForTimeout(500);
    
    await leaguePage.fillMatchForm({
      team1Player1: playerNames[1],
      team1Player2: playerNames[2],
      team2Player1: playerNames[0],
      team2Player2: playerNames[3],
      team1Score: 21,
      team2Score: 19
    });
    
    await leaguePage.submitMatchForm();
    await page.waitForTimeout(500);

    // 5. Submit the new session
    await leaguePage.submitSession();
    
    // Wait for data refresh after submission
    await page.waitForTimeout(3000);

    // 6. Verify the games are showing up in the most recent session
    // Wait a bit more for the page to update with submitted matches
    await page.waitForTimeout(2000);
    const matchesCount = await leaguePage.getMatchesCountInRecentSession();
    expect(matchesCount).toBeGreaterThanOrEqual(2);
    
    // Verify active session is no longer visible (it should be submitted/closed)
    const hasActive = await leaguePage.hasActiveSession();
    expect(hasActive).toBeFalsy();
  });
});
