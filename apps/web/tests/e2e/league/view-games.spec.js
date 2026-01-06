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
  createTestLeague,
  createTestSeason,
  addPlayerToLeague,
  createTestSession
} from '../utils/test-helpers.js';

test.describe('View Games After Submission', () => {
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
    
    // Create test league
    const league = await createTestLeague(authToken, {
      name: `Test League ${Date.now()}`
    });
    leagueId = league.id;
    
    // Create test season (will be active since start_date is yesterday and end_date is in the future)
    const season = await createTestSeason(authToken, leagueId, {
      name: `Test Season ${Date.now()}`
    });
    seasonId = season.id;
    
    // Wait a moment for season to be fully committed
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
  });

  test.afterEach(async () => {
    // Clean up test data
    if (testPhoneNumber) {
      await cleanupTestData(testPhoneNumber);
    }
  });

  test('should view submitted games in the Games tab', async ({ page }) => {
    const homePage = new HomePage(page);
    const leaguePage = new LeaguePage(page);
    const authPage = (await import('../pages/AuthPage.js')).AuthPage;

    // Setup: Create a session with matches via API
    const { createApiClient } = await import('../fixtures/api.js');
    const api = createApiClient(authToken);
    
    // Session creation automatically uses the active season, so we don't need to pass season_id
    const session = await createTestSession(authToken, leagueId);
    
    // Get player IDs from names
    const getPlayerId = async (playerName) => {
      const playerResponse = await api.post('/api/players', { name: playerName });
      return playerResponse.data.player_id;
    };
    
    const playerIds = {};
    for (const name of playerNames) {
      playerIds[name] = await getPlayerId(name);
    }
    
    await api.post('/api/matches', {
      team1_player1_id: playerIds[playerNames[0]],
      team1_player2_id: playerIds[playerNames[1]],
      team2_player1_id: playerIds[playerNames[2]],
      team2_player2_id: playerIds[playerNames[3]],
      team1_score: 21,
      team2_score: 18,
      session_id: session.id,
      season_id: seasonId,
      league_id: leagueId,
      is_ranked: true
    });
    
    await api.post('/api/matches', {
      team1_player1_id: playerIds[playerNames[1]],
      team1_player2_id: playerIds[playerNames[2]],
      team2_player1_id: playerIds[playerNames[0]],
      team2_player2_id: playerIds[playerNames[3]],
      team1_score: 21,
      team2_score: 19,
      session_id: session.id,
      season_id: seasonId,
      league_id: leagueId,
      is_ranked: true
    });
    
    await api.patch(`/api/leagues/${leagueId}/sessions/${session.id}`, { submit: true });
    await page.waitForTimeout(2000);

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

    // 2. Navigate to Games tab
    await leaguePage.goto(leagueId);
    await leaguePage.clickGamesTab();
    await leaguePage.waitForMatchesTable();

    // 3. Verify the games are showing in the most recent session
    const matchesCount = await leaguePage.getMatchesCountInRecentSession();
    expect(matchesCount).toBeGreaterThanOrEqual(2);
    
    // Verify active session is not visible (session was submitted)
    expect(await leaguePage.hasActiveSession()).toBeFalsy();
  });
});
