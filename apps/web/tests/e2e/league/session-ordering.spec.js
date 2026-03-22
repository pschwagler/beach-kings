import { test, expect } from '../fixtures/test-fixtures.js';
import { createApiClient } from '../fixtures/api.js';
import { LeaguePage } from '../pages/LeaguePage.js';

/**
 * Session Ordering E2E Tests
 *
 * Verifies that league sessions are displayed in descending date order,
 * matching the backend's ORDER BY date DESC, created_at DESC.
 */
test.describe('Session Ordering', () => {
  test('submitted sessions are ordered by date descending', async ({
    authedPage,
    testUser,
    leagueWithPlayers,
  }) => {
    const page = authedPage;
    const { token } = testUser;
    const { leagueId, seasonId, playerNames, playerIds } = leagueWithPlayers;
    const api = createApiClient(token);

    // Create 3 matches on different dates — each auto-creates its own session.
    // POST /api/matches with league_id + date auto-creates sessions.
    const dates = ['1/10/2025', '1/20/2025', '1/30/2025'];
    const sessionIds = [];

    for (const date of dates) {
      const matchResp = await api.post('/api/matches', {
        team1_player1_id: playerIds[playerNames[0]],
        team1_player2_id: playerIds[playerNames[1]],
        team2_player1_id: playerIds[playerNames[2]],
        team2_player2_id: playerIds[playerNames[3]],
        team1_score: 21,
        team2_score: 15,
        league_id: leagueId,
        season_id: seasonId,
        date,
        is_ranked: true,
      });
      const sid = matchResp.data.session_id;
      sessionIds.push(sid);

      // Submit (lock in) the session so it appears as a submitted group
      await api.patch(`/api/leagues/${leagueId}/sessions/${sid}`, { submit: true });
    }

    // Navigate to the league Games tab
    const leaguePage = new LeaguePage(page);
    await leaguePage.goto(leagueId);
    await leaguePage.clickGamesTab();
    await leaguePage.waitForMatchesTable();

    // Get all session group elements in display order
    const sessionGroups = page.locator('[data-session-id]');
    const count = await sessionGroups.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Collect session IDs in display order
    const displayedIds = [];
    for (let i = 0; i < count; i++) {
      const sid = await sessionGroups.nth(i).getAttribute('data-session-id');
      displayedIds.push(Number(sid));
    }

    // The newest session (Jan 30) should appear first, oldest (Jan 10) last
    const newestIdx = displayedIds.indexOf(sessionIds[2]);
    const middleIdx = displayedIds.indexOf(sessionIds[1]);
    const oldestIdx = displayedIds.indexOf(sessionIds[0]);

    expect(newestIdx).toBeLessThan(middleIdx);
    expect(middleIdx).toBeLessThan(oldestIdx);
  });
});
