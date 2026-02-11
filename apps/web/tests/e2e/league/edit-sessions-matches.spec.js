import { test, expect } from '../fixtures/test-fixtures.js';
import { LeaguePage } from '../pages/LeaguePage.js';

test.describe('Edit Sessions and Matches', () => {
  test('should edit a submitted session and update a match', async ({ authedPage, sessionWithMatches }) => {
    const page = authedPage;
    const leaguePage = new LeaguePage(page);
    const { sessionId, leagueId } = sessionWithMatches;

    // 1. Navigate to "Games" tab of existing League
    await leaguePage.goto(leagueId);
    await leaguePage.clickGamesTab();
    await leaguePage.waitForMatchesTable();

    // 2. Find the submitted session and click edit button
    await leaguePage.clickEditSession(sessionId);

    // 3. Verify we're in edit mode
    expect(await leaguePage.isSessionInEditMode()).toBeTruthy();

    // 4. Click on the first match card to edit it
    await leaguePage.clickMatchCardToEdit(0);

    // 5. Update the match - change the score
    await leaguePage.fillMatchForm({
      team1Score: 25,
      team2Score: 23,
    });

    // 6. Submit the updated match (in edit mode, changes are stored locally)
    await leaguePage.submitMatchForm(true);

    // 7. Save the edited session
    await leaguePage.saveEditedSession();

    // 8. Verify we're no longer in edit mode
    expect(await leaguePage.isSessionInEditMode()).toBeFalsy();

    // 9. Verify the match shows the updated score
    // Wait for the matches to refresh with updated data
    await page.waitForSelector('.team-score:has-text("25")', { state: 'visible', timeout: 10000 });

    const matchCards = page.locator(leaguePage.selectors.matchCard);
    const firstMatch = matchCards.first();

    await expect(firstMatch).toBeVisible({ timeout: 5000 });

    // Verify the match card contains the updated score (25-23)
    const matchCardText = await firstMatch.textContent();
    expect(matchCardText).toContain('25');
  });

  test('should cancel editing a session without saving changes', async ({ authedPage, sessionWithMatches }) => {
    const page = authedPage;
    const leaguePage = new LeaguePage(page);
    const { sessionId, leagueId } = sessionWithMatches;

    // 1. Navigate to "Games" tab
    await leaguePage.goto(leagueId);
    await leaguePage.clickGamesTab();
    await leaguePage.waitForMatchesTable();

    // 2. Enter edit mode
    await leaguePage.clickEditSession(sessionId);
    expect(await leaguePage.isSessionInEditMode()).toBeTruthy();

    // 3. Click on a match to edit it
    await leaguePage.clickMatchCardToEdit(0);

    // 4. Make a change (but don't save yet)
    await leaguePage.fillMatchForm({
      team1Score: 30,
      team2Score: 28,
    });

    // 5. Close the modal without submitting (click the Cancel button)
    const cancelButton = page.locator('[data-testid="add-match-form"]').locator('..').locator('button:has-text("Cancel")').first();
    await cancelButton.waitFor({ state: 'visible', timeout: 5000 });
    await cancelButton.click();

    // 6. Cancel the edit session (click cancel button)
    await leaguePage.cancelEditSession();

    // 7. Verify we're no longer in edit mode
    expect(await leaguePage.isSessionInEditMode()).toBeFalsy();

    // 8. Verify the match still shows the original score (21-18, not 30-28)
    const matchCards = page.locator(leaguePage.selectors.matchCard);
    const firstMatch = matchCards.first();
    const scores = await firstMatch.locator('.team-score').allTextContents();
    const scoreText = scores.join('-');
    expect(scoreText).toContain('21');
    expect(scoreText).not.toContain('30');
  });
});
