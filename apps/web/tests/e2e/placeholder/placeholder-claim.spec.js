import { test, expect } from '../fixtures/test-fixtures.js';
import {
  claimInvite,
  getInviteDetails,
  getMatchIsRanked,
  getMatchPlayerIds,
  createPlaceholderPlayer,
  createTestLeague,
  createTestSeason,
  createTestSession,
} from '../utils/test-helpers.js';
import { createApiClient } from '../fixtures/api.js';
import { executeQuery } from '../fixtures/db.js';
import { InvitePage } from '../pages/InvitePage.js';

/**
 * Placeholder Players — Claim & Merge tests (Epics 7.1, 7.2, 7.4).
 *
 * Covers:
 *   E. Claim via landing page (logged-in user)
 *   F. Merge — matches transferred to claiming user's player
 *   G. Multi-match reuse → claim updates all matches
 *   H. Ranked flip only when ALL placeholders in a match are resolved
 */

test.describe('Placeholder Claim', () => {
  test('E — claim via landing page (logged-in)', async ({
    page,
    testUser,
    secondTestUser,
    leagueWithPlaceholder,
  }) => {
    const { inviteToken, matchId, placeholderName } = leagueWithPlaceholder;

    // Open invite page as secondTestUser using a new browser context
    const browser = page.context().browser();
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();

    const invitePage = new InvitePage(p2);
    await invitePage.gotoAuthenticated(
      inviteToken,
      secondTestUser.token,
      secondTestUser.refreshToken
    );

    // Verify invite context
    const heading = await invitePage.getHeading();
    expect(heading).toContain("Been Invited");

    const matchCount = await invitePage.getMatchCount();
    expect(matchCount).toBe('1');

    // Verify league badge is present
    const leagues = await invitePage.getLeagueNames();
    expect(leagues.length).toBeGreaterThanOrEqual(1);

    // Claim My Matches button should be visible (authenticated)
    const claimVisible = await invitePage.isClaimButtonVisible();
    expect(claimVisible).toBe(true);

    // Sign Up / Log In should NOT be visible
    const signUpVisible = await invitePage.isSignUpVisible();
    expect(signUpVisible).toBe(false);

    // Click claim
    await invitePage.clickClaim();

    // Verify success heading
    const successHeading = await invitePage.getHeading();
    expect(successHeading).toContain('Matches Claimed');

    const isSuccess = await invitePage.isClaimSuccess();
    expect(isSuccess).toBe(true);

    // DB verification: match should now be ranked
    const isRanked = await getMatchIsRanked(matchId);
    expect(isRanked).toBe(true);

    await ctx.close();
  });

  test('F — merge transfers matches to claiming user', async ({
    testUser,
    secondTestUser,
    leagueWithPlaceholder,
  }) => {
    const { inviteToken, matchId, placeholderPlayerId } =
      leagueWithPlaceholder;

    // Claim via API
    const claimResult = await claimInvite(secondTestUser.token, inviteToken);
    expect(claimResult.success).toBe(true);

    // DB: match now references secondTestUser's player_id
    const matchPlayers = await getMatchPlayerIds(matchId);
    const allPlayerIds = [
      matchPlayers.team1_player1_id,
      matchPlayers.team1_player2_id,
      matchPlayers.team2_player1_id,
      matchPlayers.team2_player2_id,
    ];
    // Placeholder was in team1_player2; should now be secondTestUser's player
    expect(allPlayerIds).not.toContain(placeholderPlayerId);
    // The claiming user's player should now be in the match
    expect(allPlayerIds).toContain(claimResult.player_id);

    // Placeholder player should be deleted
    const phResult = await executeQuery(
      'SELECT id FROM players WHERE id = $1',
      [placeholderPlayerId]
    );
    expect(phResult.rows.length).toBe(0);

    // Match should be ranked
    const isRanked = await getMatchIsRanked(matchId);
    expect(isRanked).toBe(true);

    // Invite details should show status=claimed
    const details = await getInviteDetails(inviteToken);
    expect(details.status).toBe('claimed');
  });

  test('G — multi-match reuse: claim updates all matches', async ({
    testUser,
    secondTestUser,
  }) => {
    const { token } = testUser;
    const api = createApiClient(token);

    // Set up league + season
    const league = await createTestLeague(token, {
      name: `Multi-Match League ${Date.now()}`,
    });
    const season = await createTestSeason(token, league.id);

    // Create 3 real players (need 4 distinct players per match)
    const realNames = [
      `Real A ${Date.now()}`,
      `Real B ${Date.now()}`,
      `Real C ${Date.now()}`,
    ];
    const realIds = [];
    for (const name of realNames) {
      const resp = await api.post('/api/players', { name });
      realIds.push(resp.data.player_id);
      await api.post(`/api/leagues/${league.id}/members`, {
        player_id: resp.data.player_id,
        role: 'member',
      });
    }

    // Create 1 placeholder reused in 3 matches
    const phName = `Multi PH ${Date.now()}`;
    const ph = await createPlaceholderPlayer(token, phName, {
      league_id: league.id,
    });

    // Create session + 3 matches, each using the same placeholder
    const session = await createTestSession(token, league.id);
    const matchIds = [];
    for (let i = 0; i < 3; i++) {
      const matchResp = await api.post('/api/matches', {
        team1_player1_id: realIds[0],
        team1_player2_id: ph.player_id,
        team2_player1_id: realIds[1],
        team2_player2_id: realIds[2],
        team1_score: 21,
        team2_score: 15 + i,
        session_id: session.id,
        season_id: season.id,
        league_id: league.id,
      });
      matchIds.push(matchResp.data.match_id);
    }

    // Submit session
    await api.patch(
      `/api/leagues/${league.id}/sessions/${session.id}`,
      { submit: true }
    );

    // Pre-claim: invite shows match_count=3, all is_ranked=false
    const details = await getInviteDetails(ph.invite_token);
    expect(details.match_count).toBe(3);

    for (const id of matchIds) {
      const ranked = await getMatchIsRanked(id);
      expect(ranked).toBe(false);
    }

    // Claim
    const result = await claimInvite(secondTestUser.token, ph.invite_token);
    expect(result.success).toBe(true);

    // Post-claim: all 3 matches reference the new player and are ranked
    for (const id of matchIds) {
      const players = await getMatchPlayerIds(id);
      const ids = [
        players.team1_player1_id,
        players.team1_player2_id,
        players.team2_player1_id,
        players.team2_player2_id,
      ];
      expect(ids).toContain(result.player_id);
      expect(ids).not.toContain(ph.player_id);

      const ranked = await getMatchIsRanked(id);
      expect(ranked).toBe(true);
    }
  });

  test('H — ranked flip only when ALL placeholders resolved', async ({
    testUser,
    secondTestUser,
  }) => {
    const { token } = testUser;
    const api = createApiClient(token);

    // Set up league + season
    const league = await createTestLeague(token, {
      name: `Double PH League ${Date.now()}`,
    });
    const season = await createTestSeason(token, league.id);

    // 2 real players
    const realNames = [`DPH Real A ${Date.now()}`, `DPH Real B ${Date.now()}`];
    const realIds = [];
    for (const name of realNames) {
      const resp = await api.post('/api/players', { name });
      realIds.push(resp.data.player_id);
      await api.post(`/api/leagues/${league.id}/members`, {
        player_id: resp.data.player_id,
        role: 'member',
      });
    }

    // 2 placeholders in the SAME match
    const ph1 = await createPlaceholderPlayer(token, `PH1 ${Date.now()}`, {
      league_id: league.id,
    });
    const ph2 = await createPlaceholderPlayer(token, `PH2 ${Date.now()}`, {
      league_id: league.id,
    });

    // Create session + match with both placeholders
    const session = await createTestSession(token, league.id);
    const matchResp = await api.post('/api/matches', {
      team1_player1_id: realIds[0],
      team1_player2_id: ph1.player_id,
      team2_player1_id: realIds[1],
      team2_player2_id: ph2.player_id,
      team1_score: 21,
      team2_score: 19,
      session_id: session.id,
      season_id: season.id,
      league_id: league.id,
    });
    const matchId = matchResp.data.match_id;

    // Submit session
    await api.patch(
      `/api/leagues/${league.id}/sessions/${session.id}`,
      { submit: true }
    );

    // Pre-claim: is_ranked=false
    expect(await getMatchIsRanked(matchId)).toBe(false);

    // Claim only the FIRST placeholder
    await claimInvite(secondTestUser.token, ph1.invite_token);

    // Match should STILL be is_ranked=false (ph2 unresolved)
    expect(await getMatchIsRanked(matchId)).toBe(false);
  });
});
