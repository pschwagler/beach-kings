import { test, expect } from '../fixtures/test-fixtures.js';
import { LeaguePage } from '../pages/LeaguePage.js';
import {
  createTestLeague,
  createTestSeason,
  addPlayerToLeague,
  createTestSession,
} from '../utils/test-helpers.js';
import { createApiClient } from '../fixtures/api.js';

test.describe('View Leaderboard Across Multiple Seasons', () => {
  test('should view leaderboard for different seasons', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const leaguePage = new LeaguePage(page);
    const { token } = testUser;

    // Create league
    const league = await createTestLeague(token, { name: `Test League ${Date.now()}` });
    const leagueId = league.id;

    // Season 1: past (inactive)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoEnd = new Date(oneYearAgo);
    oneYearAgoEnd.setDate(oneYearAgoEnd.getDate() + 30);

    await createTestSeason(token, leagueId, {
      name: `Season 1 ${Date.now()}`,
      start_date: oneYearAgo.toISOString().split('T')[0],
      end_date: oneYearAgoEnd.toISOString().split('T')[0],
    });

    // Season 2: active (yesterday → future)
    const season2 = await createTestSeason(token, leagueId, {
      name: `Season 2 ${Date.now()}`,
    });
    const season2Id = season2.id;

    // Create 4 players
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

    // Create & submit session in season 2
    const session2 = await createTestSession(token, leagueId);
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
      is_ranked: true,
    });
    await api.patch(`/api/leagues/${leagueId}/sessions/${session2.id}`, { submit: true });

    // 1. Navigate to Leaderboard tab
    await leaguePage.goto(leagueId);
    await leaguePage.clickLeaderboardTab();
    await leaguePage.waitForRankingsTable();

    // 2. Verify current season is selected (should be season 2)
    const selectedSeason = await leaguePage.getSelectedSeason();
    expect(selectedSeason).toBe(String(season2Id));

    // 3. Select season 2 explicitly (verify switching works)
    await leaguePage.selectSeason(String(season2Id));
    await leaguePage.waitForRankingsTable();

    const hasTable = await leaguePage.hasRankingsTable();
    const hasEmptyState = await leaguePage.hasRankingsEmptyState();
    expect(hasTable || hasEmptyState).toBeTruthy();

    // 4. Select "All Seasons"
    await leaguePage.selectSeason('all');
    await leaguePage.waitForRankingsTable();

    const allSeasonsSelected = await leaguePage.getSelectedSeason();
    expect(allSeasonsSelected || '').toBe('');

    const hasTableAll = await leaguePage.hasRankingsTable();
    const hasEmptyAll = await leaguePage.hasRankingsEmptyState();
    expect(hasTableAll || hasEmptyAll).toBeTruthy();
  });
});
