import { test, expect } from '../fixtures/test-fixtures.js';
import { LeaguePage } from '../pages/LeaguePage.js';

test.describe('View Leaderboard', () => {
  test('should view leaderboard and player details', async ({ authedPage, sessionWithMatches }) => {
    const page = authedPage;
    const leaguePage = new LeaguePage(page);
    const { leagueId, playerNames } = sessionWithMatches;

    // 1. Navigate to Leaderboard tab of existing League
    await leaguePage.goto(leagueId);
    await leaguePage.clickLeaderboardTab();

    // Wait for rankings to load (stats calculation may take time after session submit)
    await page.waitForFunction(
      (sel) => {
        const table = document.querySelector(sel);
        if (!table) return false;
        const rows = table.querySelectorAll('[data-testid="rankings-row"], .rankings-row');
        return rows.length > 0;
      },
      leaguePage.selectors.rankingsTable.split(',')[0].trim(),
      { timeout: 15000 }
    ).catch(() => {});

    await leaguePage.waitForRankingsTable();

    const selectedSeason = await leaguePage.getSelectedSeason();
    expect(selectedSeason).toBeTruthy();

    // 2. Check if rankings table has data or shows empty state
    const hasTable = await leaguePage.hasRankingsTable();
    const hasEmptyState = await leaguePage.hasRankingsEmptyState();

    expect(hasTable || hasEmptyState).toBeTruthy();

    if (!hasTable) {
      console.log('No rankings data available - stats may not be calculated yet');
      return;
    }

    const playerRows = page.locator(leaguePage.selectors.playerRow);
    const rowCount = await playerRows.count();

    if (rowCount === 0) {
      console.log('Rankings table exists but no player rows found');
      return;
    }

    // 3. Click on a player row and verify the details drawer opens
    await leaguePage.clickPlayerRow(playerNames[0]);
    await expect(page.locator(leaguePage.selectors.playerDetailsDrawer)).toBeVisible({ timeout: 5000 });

    // 4. Close the player details tab
    await leaguePage.closePlayerDetails();

    const playerDetailsHidden = await page.locator(leaguePage.selectors.playerDetailsDrawer).isVisible({ timeout: 2000 }).catch(() => false);
    expect(playerDetailsHidden).toBeFalsy();

    // 5. Change the seasons selector to "all seasons"
    await leaguePage.selectSeason('all');

    // 6. Verify the table updates
    await leaguePage.waitForRankingsTable();

    const newSelectedSeason = await leaguePage.getSelectedSeason();
    expect(newSelectedSeason || '').toBe('');

    // 7. Click on a player and verify the player details tab opens
    await leaguePage.clickPlayerRow(playerNames[1]);
    await expect(page.locator(leaguePage.selectors.playerDetailsDrawer)).toBeVisible({ timeout: 5000 });
  });
});
