import { test, expect } from '../fixtures/test-fixtures.js';
import { createPlaceholderPlayer, createTestLeague, createTestSeason } from '../utils/test-helpers.js';
import { createApiClient } from '../fixtures/api.js';

/**
 * Placeholder Share Invite — Recent Games (MyMatchesWidget)
 *
 * Regression test for the bug where ShareInviteIcon was permanently disabled
 * because GET /api/players/{id}/invite-url was 500ing (missing get_player_by_id).
 *
 * Covers:
 *   A. ShareInviteIcon in recent games becomes enabled after invite-url loads
 */

test.describe('Placeholder share invite icon in recent games', () => {
  test('A — share invite icon in My Games > Recent games is enabled once invite URL loads', async ({
    authedPage,
    testUser,
  }) => {
    const page = authedPage;
    const { token, playerId } = testUser;
    const api = createApiClient(token);

    // --- Setup: create league + season so we can attach a match to the test user ---
    const league = await createTestLeague(token, {
      name: `Share Invite Test League ${Date.now()}`,
    });
    const leagueId = league.id;

    const season = await createTestSeason(token, leagueId, {
      name: `Share Invite Season ${Date.now()}`,
    });
    const seasonId = season.id;

    // Create two placeholder players — one as partner, one as opponent pair
    const placeholderName1 = `Invite PH1 ${Date.now()}`;
    const placeholderName2 = `Invite PH2 ${Date.now()}`;

    const ph1 = await createPlaceholderPlayer(token, placeholderName1, {
      league_id: leagueId,
    });
    const ph2 = await createPlaceholderPlayer(token, placeholderName2, {
      league_id: leagueId,
    });

    // Create an extra real player to fill the fourth match slot
    const extraPlayerResp = await api.post('/api/players', {
      name: `Extra Player ${Date.now()}`,
    });
    const extraPlayerId = extraPlayerResp.data.player_id;

    // Create a match via POST /api/matches with league_id + season_id (auto-creates session)
    //   team1: testUser.playerId + ph1 (placeholder)
    //   team2: extraPlayer + ph2 (placeholder)
    await api.post('/api/matches', {
      team1_player1_id: playerId,
      team1_player2_id: ph1.player_id,
      team2_player1_id: extraPlayerId,
      team2_player2_id: ph2.player_id,
      team1_score: 21,
      team2_score: 18,
      season_id: seasonId,
      league_id: leagueId,
    });

    // --- Navigate to /home?tab=my-games ---
    // Direct URL navigation is reliable for this tab (not subject to the
    // Suspense/hydration issue that affects the friends tab).
    // Register response waiters BEFORE navigation so we don't race against them.
    // Both requests fire as soon as the component mounts, so the promises must
    // be created before page.goto().
    const matchHistoryResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/players/') &&
        resp.url().includes('/match-history'),
      { timeout: 15000 },
    );

    const inviteUrlResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/invite-url'),
      { timeout: 15000 },
    );

    await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes('/api/auth/me'),
        { timeout: 15000 },
      ),
      page.goto('/home?tab=my-games'),
    ]);

    // Wait for the "Recent games" section heading to be visible
    await page.waitForSelector('.my-games-tab-section-title', {
      state: 'visible',
      timeout: 15000,
    });

    // The MyGamesTab calls getPlayerMatchHistory which hits /api/players/{id}/match-history.
    // Wait for that response to confirm data has loaded.
    await matchHistoryResponsePromise;

    // Wait for at least one share invite icon to appear in the DOM.
    // The icon is rendered only when IsPlaceholder=true for a player in the match row.
    await page.waitForSelector('.share-invite-icon', {
      state: 'visible',
      timeout: 15000,
    });

    // --- Core assertion ---
    // The button starts disabled (inviteUrl === null) and becomes enabled once
    // GET /api/players/{id}/invite-url resolves successfully.
    await inviteUrlResponsePromise;

    const shareIcon = page.locator('.share-invite-icon').first();
    await expect(shareIcon).toBeEnabled({ timeout: 10000 });
  });
});
