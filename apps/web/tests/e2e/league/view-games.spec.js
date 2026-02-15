import { test, expect } from '../fixtures/test-fixtures.js';
import { LeaguePage } from '../pages/LeaguePage.js';

test.describe('View Games After Submission', () => {
  test('should view submitted games in the Games tab', async ({ authedPage, sessionWithMatches }) => {
    const page = authedPage;
    const leaguePage = new LeaguePage(page);
    const { leagueId } = sessionWithMatches;

    // 1. Navigate to Games tab
    await leaguePage.goto(leagueId);
    await leaguePage.clickGamesTab();
    await leaguePage.waitForMatchesTable();

    // 2. Verify the games are showing in the most recent session
    const matchesCount = await leaguePage.getMatchesCountInRecentSession();
    expect(matchesCount).toBeGreaterThanOrEqual(2);

    // Verify active session is not visible (session was submitted)
    expect(await leaguePage.hasActiveSession()).toBeFalsy();
  });
});
