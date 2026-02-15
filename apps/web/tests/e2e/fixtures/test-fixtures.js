import { test as base, expect } from '@playwright/test';
import {
  generateTestPhoneNumber,
  getVerificationCodeForPhone,
  authenticateUser,
  completeTestUserProfile,
  createTestLeague,
  createTestSeason,
  addPlayerToLeague,
  createTestSession,
  createPlaceholderPlayer,
  cleanupTestData,
} from '../utils/test-helpers.js';
import { createTestUser, verifyPhone, loginWithPassword, createApiClient } from './api.js';

/**
 * Shared Playwright fixtures for e2e tests.
 *
 * Usage:
 *   import { test, expect } from '../fixtures/test-fixtures.js';
 *   test('my test', async ({ authedPage, testUser }) => { ... });
 *
 * Fixtures:
 *   testUser            – creates, verifies, and authenticates a fresh test user
 *   secondTestUser      – independent second test user (for claim flows)
 *   authedPage          – a Playwright page with auth tokens injected (no UI login)
 *   leagueWithPlayers   – a league with an active season and 4 test players
 *   leagueWithPlaceholder – league + season + 3 real players + 1 placeholder + submitted match
 *   sessionWithMatches  – a submitted session with 2 matches (extends leagueWithPlayers)
 */

export { expect };

export const test = base.extend({
  /**
   * Creates a fresh test user (signup → verify → login → complete profile).
   * Provides { phone, password, token, refreshToken, fullName }.
   * Automatically cleans up the user on teardown.
   */
  testUser: [async ({}, use) => {
    const phone = generateTestPhoneNumber();
    const password = 'Test1234';
    const fullName = 'Test User';

    // Create and verify user
    await createTestUser({ phoneNumber: phone, password, fullName });
    const code = await getVerificationCodeForPhone(phone);
    if (!code) throw new Error('No verification code found after signup');
    await verifyPhone(phone, code);

    // Login to get tokens
    const loginResponse = await loginWithPassword(phone, password);
    const token = loginResponse.access_token;
    const refreshToken = loginResponse.refresh_token;

    // Complete profile to prevent modal from blocking tests
    await completeTestUserProfile(token);

    await use({ phone, password, fullName, token, refreshToken });

    // Teardown: clean up test data
    await cleanupTestData(phone);
  }, { scope: 'test' }],

  /**
   * A Playwright page with auth tokens pre-injected into localStorage.
   * Navigates to /home and waits for the /api/auth/me response so the
   * app's AuthProvider recognises the user as logged in.
   *
   * Depends on: testUser
   */
  authedPage: [async ({ page, testUser }, use) => {
    // Navigate to base URL first so we have an origin for localStorage
    await page.goto('/');

    // Inject tokens into localStorage
    await page.evaluate(({ accessToken, refreshToken }) => {
      window.localStorage.setItem('beach_access_token', accessToken);
      window.localStorage.setItem('beach_refresh_token', refreshToken);
    }, { accessToken: testUser.token, refreshToken: testUser.refreshToken });

    // Set up response promise BEFORE navigation
    const authMePromise = page.waitForResponse(
      response => response.url().includes('/api/auth/me'),
      { timeout: 15000 }
    );

    // Navigate to home — triggers AuthProvider useEffect
    await page.goto('/home');
    await authMePromise;

    await use(page);
  }, { scope: 'test' }],

  /**
   * Creates a league with an active season and 4 named players.
   * Provides { leagueId, seasonId, playerNames, playerIds }.
   *
   * Depends on: testUser
   */
  leagueWithPlayers: [async ({ testUser }, use) => {
    const { token } = testUser;

    // Create league
    const league = await createTestLeague(token, {
      name: `Test League ${Date.now()}`,
    });
    const leagueId = league.id;

    // Create active season
    const season = await createTestSeason(token, leagueId, {
      name: `Test Season ${Date.now()}`,
    });
    const seasonId = season.id;

    // Create 4 players and add to league
    const playerNames = [
      `Player A ${Date.now()}`,
      `Player B ${Date.now()}`,
      `Player C ${Date.now()}`,
      `Player D ${Date.now()}`,
    ];

    for (const name of playerNames) {
      await addPlayerToLeague(token, leagueId, name);
    }

    // Resolve player IDs
    const api = createApiClient(token);
    const playerIds = {};
    for (const name of playerNames) {
      const resp = await api.post('/api/players', { name });
      playerIds[name] = resp.data.player_id;
    }

    await use({ leagueId, seasonId, playerNames, playerIds });
  }, { scope: 'test' }],

  /**
   * Creates a submitted session with 2 ranked matches.
   * Provides { sessionId, leagueId, seasonId, playerNames, playerIds }.
   *
   * Depends on: testUser, leagueWithPlayers
   */
  sessionWithMatches: [async ({ testUser, leagueWithPlayers }, use) => {
    const { token } = testUser;
    const { leagueId, seasonId, playerNames, playerIds } = leagueWithPlayers;
    const api = createApiClient(token);

    // Create session
    const session = await createTestSession(token, leagueId);
    const sessionId = session.id;

    // Create 2 matches
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
      is_ranked: true,
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
      is_ranked: true,
    });

    // Submit session
    await api.patch(`/api/leagues/${leagueId}/sessions/${sessionId}`, { submit: true });

    await use({ sessionId, leagueId, seasonId, playerNames, playerIds });
  }, { scope: 'test' }],

  /**
   * Creates an independent second test user (signup → verify → login → profile).
   * Provides { phone, password, token, refreshToken, fullName }.
   * Automatically cleans up on teardown.
   */
  secondTestUser: [async ({}, use) => {
    const phone = generateTestPhoneNumber();
    const password = 'Test1234';
    const fullName = 'Second User';

    await createTestUser({ phoneNumber: phone, password, fullName });
    const code = await getVerificationCodeForPhone(phone);
    if (!code) throw new Error('No verification code found for secondTestUser');
    await verifyPhone(phone, code);

    const loginResponse = await loginWithPassword(phone, password);
    const token = loginResponse.access_token;
    const refreshToken = loginResponse.refresh_token;

    await completeTestUserProfile(token);

    await use({ phone, password, fullName, token, refreshToken });

    await cleanupTestData(phone);
  }, { scope: 'test' }],

  /**
   * Creates a league with 3 real players + 1 placeholder, a session, and a
   * submitted match that includes the placeholder in team1_player2.
   *
   * Provides:
   *   { leagueId, seasonId, playerIds, playerNames,
   *     placeholderPlayerId, placeholderName, inviteToken, matchId }
   *
   * Depends on: testUser
   */
  leagueWithPlaceholder: [async ({ testUser }, use) => {
    const { token } = testUser;
    const api = createApiClient(token);

    // Create league + season
    const league = await createTestLeague(token, {
      name: `Placeholder League ${Date.now()}`,
    });
    const leagueId = league.id;

    const season = await createTestSeason(token, leagueId, {
      name: `PH Season ${Date.now()}`,
    });
    const seasonId = season.id;

    // Create 3 real players and add to league
    const playerNames = [
      `PH Player A ${Date.now()}`,
      `PH Player B ${Date.now()}`,
      `PH Player C ${Date.now()}`,
    ];

    for (const name of playerNames) {
      await addPlayerToLeague(token, leagueId, name);
    }

    // Resolve real player IDs
    const playerIds = {};
    for (const name of playerNames) {
      const resp = await api.post('/api/players', { name });
      playerIds[name] = resp.data.player_id;
    }

    // Create placeholder player via API
    const placeholderName = `Placeholder ${Date.now()}`;
    const phResult = await createPlaceholderPlayer(token, placeholderName, {
      league_id: leagueId,
    });
    const placeholderPlayerId = phResult.player_id;
    const inviteToken = phResult.invite_token;

    // Create session
    const session = await createTestSession(token, leagueId);
    const sessionId = session.id;

    // Create match with placeholder as team1_player2
    const matchResp = await api.post('/api/matches', {
      team1_player1_id: playerIds[playerNames[0]],
      team1_player2_id: placeholderPlayerId,
      team2_player1_id: playerIds[playerNames[1]],
      team2_player2_id: playerIds[playerNames[2]],
      team1_score: 21,
      team2_score: 18,
      session_id: sessionId,
      season_id: seasonId,
      league_id: leagueId,
    });
    const matchId = matchResp.data.match_id;

    // Submit session
    await api.patch(`/api/leagues/${leagueId}/sessions/${sessionId}`, { submit: true });

    await use({
      leagueId,
      seasonId,
      playerIds,
      playerNames,
      placeholderPlayerId,
      placeholderName,
      inviteToken,
      matchId,
    });
  }, { scope: 'test' }],
});
