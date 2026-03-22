import { test, expect } from '../fixtures/test-fixtures.js';
import { LeaguePage } from '../pages/LeaguePage.js';
import {
  createTestLeague,
  createTestSeason,
  addPlayerToLeague,
} from '../utils/test-helpers.js';
import { createApiClient } from '../fixtures/api.js';

test.describe('Season Switching on Games Tab', () => {
  test('should default to All Seasons and switch between seasons', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const leaguePage = new LeaguePage(page);
    const { token } = testUser;

    // Create league
    const league = await createTestLeague(token, { name: `Season Switch ${Date.now()}` });
    const leagueId = league.id;

    // Season 1: past
    const pastStart = new Date();
    pastStart.setFullYear(pastStart.getFullYear() - 1);
    const pastEnd = new Date(pastStart);
    pastEnd.setDate(pastEnd.getDate() + 30);

    const season1 = await createTestSeason(token, leagueId, {
      name: `Season 1 ${Date.now()}`,
      start_date: pastStart.toISOString().split('T')[0],
      end_date: pastEnd.toISOString().split('T')[0],
    });
    const season1Id = season1.id;

    // Season 2: active
    const season2 = await createTestSeason(token, leagueId, {
      name: `Season 2 ${Date.now()}`,
    });
    const season2Id = season2.id;

    // Create 4 players
    const playerNames = [
      `PA ${Date.now()}`,
      `PB ${Date.now()}`,
      `PC ${Date.now()}`,
      `PD ${Date.now()}`,
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

    // Create matches via the match endpoint (no session_id) — the backend
    // auto-creates sessions with the correct season_id when season_id + league_id are provided.
    // This is important because the league session endpoint auto-assigns the active season,
    // which wouldn't work for past seasons.

    // Match in season 1
    const match1Resp = await api.post('/api/matches', {
      team1_player1_id: playerIds[playerNames[0]],
      team1_player2_id: playerIds[playerNames[1]],
      team2_player1_id: playerIds[playerNames[2]],
      team2_player2_id: playerIds[playerNames[3]],
      team1_score: 21,
      team2_score: 15,
      season_id: season1Id,
      league_id: leagueId,
      is_ranked: true,
    });
    const session1Id = match1Resp.data.session_id;
    await api.patch(`/api/leagues/${leagueId}/sessions/${session1Id}`, { submit: true });

    // Match in season 2
    const match2Resp = await api.post('/api/matches', {
      team1_player1_id: playerIds[playerNames[2]],
      team1_player2_id: playerIds[playerNames[3]],
      team2_player1_id: playerIds[playerNames[0]],
      team2_player2_id: playerIds[playerNames[1]],
      team1_score: 21,
      team2_score: 18,
      season_id: season2Id,
      league_id: leagueId,
      is_ranked: true,
    });
    const session2Id = match2Resp.data.session_id;
    await api.patch(`/api/leagues/${leagueId}/sessions/${session2Id}`, { submit: true });

    // Navigate to Games tab
    await leaguePage.goto(leagueId);
    await leaguePage.clickGamesTab();
    await leaguePage.waitForMatchesTable();

    // 1. Verify "All Seasons" is the default selection
    const defaultSeason = await leaguePage.getSelectedSeasonOnGamesTab();
    expect(defaultSeason || '').toBe('');

    // "All Seasons" should show matches from both sessions (2 session groups)
    const allSessionGroups = page.locator(leaguePage.selectors.sessionGroup);
    await expect(allSessionGroups).toHaveCount(2, { timeout: 10000 });

    // 2. Switch to season 1 — should only show season 1 matches
    await leaguePage.selectSeasonOnGamesTab(String(season1Id));
    await leaguePage.waitForMatchesTable();

    const season1Selected = await leaguePage.getSelectedSeasonOnGamesTab();
    expect(season1Selected).toBe(String(season1Id));

    const season1Sessions = page.locator(leaguePage.selectors.sessionGroup);
    await expect(season1Sessions).toHaveCount(1, { timeout: 10000 });

    // 3. Switch to season 2 — should only show season 2 matches
    await leaguePage.selectSeasonOnGamesTab(String(season2Id));
    await leaguePage.waitForMatchesTable();

    const season2Selected = await leaguePage.getSelectedSeasonOnGamesTab();
    expect(season2Selected).toBe(String(season2Id));

    const season2Sessions = page.locator(leaguePage.selectors.sessionGroup);
    await expect(season2Sessions).toHaveCount(1, { timeout: 10000 });

    // 4. Switch back to "All Seasons" — should show both again
    await leaguePage.selectSeasonOnGamesTab('all');
    await leaguePage.waitForMatchesTable();

    const backToAll = await leaguePage.getSelectedSeasonOnGamesTab();
    expect(backToAll || '').toBe('');

    const allSessionsAgain = page.locator(leaguePage.selectors.sessionGroup);
    await expect(allSessionsAgain).toHaveCount(2, { timeout: 10000 });
  });
});
