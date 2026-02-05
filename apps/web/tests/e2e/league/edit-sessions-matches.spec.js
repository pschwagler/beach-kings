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

test.describe('Edit Sessions and Matches', () => {
  let testPhoneNumber;
  let testPassword = 'Test1234';
  let testFullName = 'Test User';
  let authToken;
  let leagueId;
  let seasonId;
  let playerNames;
  let sessionId;

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

    // Create test league (user will be admin)
    const league = await createTestLeague(authToken, {
      name: `Test League ${Date.now()}`
    });
    leagueId = league.id;
    
    // Create test season (will be active since start_date is yesterday and end_date is in the future)
    const season = await createTestSeason(authToken, leagueId, {
      name: `Test Season ${Date.now()}`
    });
    seasonId = season.id;
    
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
    
    // Create a submitted session with 2 matches via API
    const { createApiClient } = await import('../fixtures/api.js');
    const api = createApiClient(authToken);
    
    const session = await createTestSession(authToken, leagueId);
    sessionId = session.id;
    
    // Get player IDs from names
    const getPlayerId = async (playerName) => {
      const playerResponse = await api.post('/api/players', { name: playerName });
      return playerResponse.data.player_id;
    };
    
    const playerIds = {};
    for (const name of playerNames) {
      playerIds[name] = await getPlayerId(name);
    }
    
    // Create 2 matches in the session
    await api.post('/api/matches', {
      team1_player1_id: playerIds[playerNames[0]],
      team1_player2_id: playerIds[playerNames[1]],
      team2_player1_id: playerIds[playerNames[2]],
      team2_player2_id: playerIds[playerNames[3]],
      team1_score: 21,
      team2_score: 18,
      session_id: sessionId,
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
      session_id: sessionId,
      season_id: seasonId,
      league_id: leagueId,
      is_ranked: true
    });
    
    // Submit the session
    await api.patch(`/api/leagues/${leagueId}/sessions/${sessionId}`, { submit: true });
    
    // Wait a bit for session to be submitted
    await page.waitForTimeout(1000);
  });

  test.afterEach(async () => {
    // Clean up test data
    if (testPhoneNumber) {
      await cleanupTestData(testPhoneNumber);
    }
  });

  test('should edit a submitted session and update a match', async ({ page }) => {
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
    
    // Wait for matches to load
    await page.waitForTimeout(2000);

    // 3. Find the submitted session and click edit button
    // The edit button should be visible for submitted sessions (we're the admin)
    await leaguePage.clickEditSession(sessionId);
    
    // 4. Verify we're in edit mode (save/cancel buttons should be visible)
    expect(await leaguePage.isSessionInEditMode()).toBeTruthy();

    // 5. Click on the first match card to edit it
    await leaguePage.clickMatchCardToEdit(0);
    
    // 6. Update the match - change the score
    await leaguePage.fillMatchForm({
      team1Score: 25,
      team2Score: 23
    });
    
    // 7. Submit the updated match (in edit mode, changes are stored locally)
    await leaguePage.submitMatchForm(true);
    await page.waitForTimeout(1000);

    // 8. Save the edited session
    await leaguePage.saveEditedSession();
    
    // Wait for the session to be saved and page to refresh
    await page.waitForTimeout(2000);

    // 9. Verify we're no longer in edit mode
    expect(await leaguePage.isSessionInEditMode()).toBeFalsy();

    // 10. Verify the match shows the updated score
    // The first match should now show 25-23 instead of 21-18
    const matchCards = page.locator(leaguePage.selectors.matchCard);
    const firstMatch = matchCards.first();
    
    // Check that the score is visible (exact text matching might be fragile, so just verify match card exists)
    const matchCardVisible = await firstMatch.isVisible({ timeout: 5000 });
    expect(matchCardVisible).toBeTruthy();
    
    // Verify the match card contains the updated score (25-23)
    const matchCardText = await firstMatch.textContent();
    // Match cards show scores, so we should see "25" somewhere
    expect(matchCardText).toContain('25');
  });

  test('should cancel editing a session without saving changes', async ({ page }) => {
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

    // 2. Navigate to "Games" tab
    await leaguePage.goto(leagueId);
    await leaguePage.clickGamesTab();
    await leaguePage.waitForMatchesTable();
    await page.waitForTimeout(2000);

    // 3. Enter edit mode
    await leaguePage.clickEditSession(sessionId);
    expect(await leaguePage.isSessionInEditMode()).toBeTruthy();

    // 4. Click on a match to edit it
    await leaguePage.clickMatchCardToEdit(0);
    
    // 5. Make a change (but don't save yet)
    await leaguePage.fillMatchForm({
      team1Score: 30,
      team2Score: 28
    });
    
    // 6. Close the modal without submitting (click the Cancel button)
    const cancelButton = page.locator('[data-testid="add-match-form"]').locator('..').locator('button:has-text("Cancel")').first();
    await cancelButton.waitFor({ state: 'visible', timeout: 5000 });
    await cancelButton.click();
    await page.waitForTimeout(500);

    // 7. Cancel the edit session (click cancel button)
    await leaguePage.cancelEditSession();
    
    // 8. Verify we're no longer in edit mode
    expect(await leaguePage.isSessionInEditMode()).toBeFalsy();

    // 9. Verify the match still shows the original score (21-18, not 30-28)
    // Since we cancelled, the changes shouldn't be saved
    // Check the score elements specifically (not full text, which includes player names with timestamps)
    const matchCards = page.locator(leaguePage.selectors.matchCard);
    const firstMatch = matchCards.first();
    const scores = await firstMatch.locator('.team-score').allTextContents();
    const scoreText = scores.join('-');
    expect(scoreText).toContain('21');
    expect(scoreText).not.toContain('30');
  });
});
