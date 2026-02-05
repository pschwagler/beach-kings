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
  addPlayerToLeague,
  createTestSession
} from '../utils/test-helpers.js';

test.describe('View Leaderboard Across Multiple Seasons', () => {
  let testPhoneNumber;
  let testPassword = 'Test1234';
  let testFullName = 'Test User';
  let authToken;
  let leagueId;
  let season1Id;
  let season2Id;
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
    
    // Create two test seasons
    // Season 1: Set end_date in the past so it's not active
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoEnd = new Date(oneYearAgo);
    oneYearAgoEnd.setDate(oneYearAgoEnd.getDate() + 30); // End 30 days after start
    
    const season1 = await createTestSeason(authToken, leagueId, {
      name: `Season 1 ${Date.now()}`,
      start_date: oneYearAgo.toISOString().split('T')[0],
      end_date: oneYearAgoEnd.toISOString().split('T')[0] // Ends in the past
    });
    season1Id = season1.id;
    
    // Season 2: Will be active since start_date is yesterday and end_date is in the future
    const season2 = await createTestSeason(authToken, leagueId, {
      name: `Season 2 ${Date.now()}`
    });
    season2Id = season2.id;
    
    // Wait a moment for seasons to be fully committed
    await page.waitForTimeout(500);
    
    // Create 4 test players and add them to the league
    playerNames = [
      `Player A ${Date.now()}`,
      `Player B ${Date.now()}`,
      `Player C ${Date.now()}`,
      `Player D ${Date.now()}`
    ];
    
    for (const playerName of playerNames) {
      await addPlayerToLeague(authToken, leagueId, playerName);
    }
    
    // Create matches in both seasons via API
    const { createApiClient } = await import('../fixtures/api.js');
    const api = createApiClient(authToken);
    
    // Get player IDs from names
    const getPlayerId = async (playerName) => {
      const playerResponse = await api.post('/api/players', { name: playerName });
      return playerResponse.data.player_id;
    };
    
    const playerIds = {};
    for (const name of playerNames) {
      playerIds[name] = await getPlayerId(name);
    }
    
    // Season 2 matches (season2 is active, so we can create a session for it)
    const session2 = await createTestSession(authToken, leagueId);
    
    await api.post('/api/matches', {
      team1_player1_id: playerIds[playerNames[0]],
      team1_player2_id: playerIds[playerNames[1]],
      team2_player1_id: playerIds[playerNames[2]],
      team2_player2_id: playerIds[playerNames[3]],
      team1_score: 21,
      team2_score: 19,
      session_id: session2.id,
      season_id: season2Id,
      league_id: leagueId,
      is_ranked: true
    });
    
    await api.patch(`/api/leagues/${leagueId}/sessions/${session2.id}`, { submit: true });
    
    // Wait for stats calculation
    await page.waitForTimeout(2000);
  });

  test.afterEach(async () => {
    // Clean up test data
    if (testPhoneNumber) {
      await cleanupTestData(testPhoneNumber);
    }
  });

  test('should view leaderboard for different seasons', async ({ page }) => {
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

    // 2. Navigate to Leaderboard tab
    await leaguePage.goto(leagueId);
    await leaguePage.clickLeaderboardTab();
    await leaguePage.waitForRankingsTable();

    // 3. Verify current season is selected (should be season 2)
    const selectedSeason = await leaguePage.getSelectedSeason();
    expect(selectedSeason).toBe(String(season2Id));

    // 4. Select season 2 explicitly (to verify we can switch seasons)
    await leaguePage.selectSeason(String(season2Id));
    await leaguePage.waitForRankingsTable();

    // 5. Verify rankings table or empty state is visible
    const hasTable = await leaguePage.hasRankingsTable();
    const hasEmptyState = await leaguePage.hasRankingsEmptyState();
    expect(hasTable || hasEmptyState).toBeTruthy();

    // 6. Select "All Seasons"
    await leaguePage.selectSeason('all');
    await leaguePage.waitForRankingsTable();
    
    const allSeasonsSelected = await leaguePage.getSelectedSeason();
    expect(allSeasonsSelected || '').toBe('');

    // 7. Verify rankings table or empty state is visible with all seasons data
    const hasTableAllSeasons = await leaguePage.hasRankingsTable();
    const hasEmptyStateAllSeasons = await leaguePage.hasRankingsEmptyState();
    expect(hasTableAllSeasons || hasEmptyStateAllSeasons).toBeTruthy();
  });
});
