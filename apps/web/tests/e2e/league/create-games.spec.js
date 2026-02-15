import { test, expect } from '../fixtures/test-fixtures.js';
import { LeaguePage } from '../pages/LeaguePage.js';

test.describe('Create Games and Submit Session', () => {
  test('should create 2 new games and submit the session', async ({ authedPage, leagueWithPlayers }) => {
    const page = authedPage;
    const leaguePage = new LeaguePage(page);
    const { leagueId, playerNames } = leagueWithPlayers;

    // 1. Navigate to "Games" tab of existing League
    await leaguePage.goto(leagueId);
    await leaguePage.clickGamesTab();
    await leaguePage.waitForMatchesTable();

    // 2. Add first game (this automatically creates a session if none exists)
    await leaguePage.clickAddGame();

    await leaguePage.fillMatchForm({
      team1Player1: playerNames[0],
      team1Player2: playerNames[1],
      team2Player1: playerNames[2],
      team2Player2: playerNames[3],
      team1Score: 21,
      team2Score: 18,
    });

    await leaguePage.submitMatchForm();

    // Verify active session is now visible (created by first match)
    await expect(page.locator(leaguePage.selectors.activeSessionPanel)).toBeVisible({ timeout: 5000 });

    // 3. Add second game
    await leaguePage.clickAddGame();

    await leaguePage.fillMatchForm({
      team1Player1: playerNames[1],
      team1Player2: playerNames[2],
      team2Player1: playerNames[0],
      team2Player2: playerNames[3],
      team1Score: 21,
      team2Score: 19,
    });

    await leaguePage.submitMatchForm();

    // 4. Submit the new session
    await leaguePage.submitSession();

    // 5. Verify the games are showing up in the most recent session
    await leaguePage.waitForMatchesTable();
    const matchesCount = await leaguePage.getMatchesCountInRecentSession();
    expect(matchesCount).toBeGreaterThanOrEqual(2);

    // Verify active session is no longer visible (it should be submitted/closed)
    const hasActive = await leaguePage.hasActiveSession();
    expect(hasActive).toBeFalsy();
  });
});
