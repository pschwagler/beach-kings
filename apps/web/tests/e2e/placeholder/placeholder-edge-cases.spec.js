import { test, expect } from '../fixtures/test-fixtures.js';
import {
  claimInvite,
  getInviteDetails,
} from '../utils/test-helpers.js';
import { createApiClient } from '../fixtures/api.js';
import { executeQuery } from '../fixtures/db.js';
import { InvitePage } from '../pages/InvitePage.js';

/**
 * Placeholder Players — Edge Cases (Epics 7.5, 7.6).
 *
 * Covers:
 *   I. League membership granted on claim
 *   J. Already-claimed token returns error / UI state
 *   K. Invalid token shows error page
 *   L. Unauthenticated landing page shows Sign Up / Log In
 *   M. Already-logged-in user sees Claim button directly
 */

test.describe('Placeholder Edge Cases', () => {
  test('I — league membership granted on claim', async ({
    testUser,
    secondTestUser,
    leagueWithPlaceholder,
  }) => {
    const { leagueId, inviteToken, placeholderPlayerId } =
      leagueWithPlaceholder;

    // Pre-claim: placeholder has role "placeholder" in league
    const preMember = await executeQuery(
      'SELECT role FROM league_members WHERE league_id = $1 AND player_id = $2',
      [leagueId, placeholderPlayerId]
    );
    expect(preMember.rows.length).toBe(1);
    expect(preMember.rows[0].role).toBe('placeholder');

    // Claim
    const result = await claimInvite(secondTestUser.token, inviteToken);
    expect(result.success).toBe(true);

    // Post-claim: secondTestUser's player is now a member
    const postMember = await executeQuery(
      'SELECT role FROM league_members WHERE league_id = $1 AND player_id = $2',
      [leagueId, result.player_id]
    );
    expect(postMember.rows.length).toBe(1);
    expect(postMember.rows[0].role).toBe('member');

    // Placeholder should be gone from league_members
    const phMember = await executeQuery(
      'SELECT id FROM league_members WHERE league_id = $1 AND player_id = $2',
      [leagueId, placeholderPlayerId]
    );
    expect(phMember.rows.length).toBe(0);
  });

  test('J — already-claimed token returns error and shows UI state', async ({
    page,
    testUser,
    secondTestUser,
    leagueWithPlaceholder,
  }) => {
    const { inviteToken } = leagueWithPlaceholder;

    // First claim succeeds
    const result = await claimInvite(secondTestUser.token, inviteToken);
    expect(result.success).toBe(true);

    // Second claim via API should fail
    const api = createApiClient(secondTestUser.token);
    try {
      await api.post(`/api/invites/${inviteToken}/claim`);
      // Should not reach here
      expect(true).toBe(false);
    } catch (err) {
      expect(err.response.status).toBe(400);
    }

    // UI: anon context should show "Already Claimed"
    const invitePage = new InvitePage(page);
    await invitePage.goto(inviteToken);

    const heading = await invitePage.getHeading();
    expect(heading).toContain('Already Claimed');
  });

  test('K — invalid token shows error page', async ({ page }) => {
    const invitePage = new InvitePage(page);
    await invitePage.goto('invalid-token-xyz-123');

    const heading = await invitePage.getHeading();
    expect(heading).toContain('Invalid Invite');

    const isError = await invitePage.isError();
    expect(isError).toBe(true);

    // "Go to Home" button should be visible
    const goHomeBtn = page.locator('.invite-page__cta:has-text("Go to Home")');
    await expect(goHomeBtn).toBeVisible();
  });

  test('L — unauthenticated landing page shows Sign Up / Log In', async ({
    page,
    testUser,
    leagueWithPlaceholder,
  }) => {
    const { inviteToken, placeholderName } = leagueWithPlaceholder;

    // Open in anon context (no tokens)
    const invitePage = new InvitePage(page);
    await invitePage.goto(inviteToken);

    // Heading should say invited
    const heading = await invitePage.getHeading();
    expect(heading).toContain("Been Invited");

    // Sign Up and Log In should be visible
    const signUpVisible = await invitePage.isSignUpVisible();
    expect(signUpVisible).toBe(true);

    const logInVisible = await invitePage.isLogInVisible();
    expect(logInVisible).toBe(true);

    // Claim My Matches should NOT be visible (not authenticated)
    const claimVisible = await invitePage.isClaimButtonVisible();
    expect(claimVisible).toBe(false);

    // Click Sign Up → auth modal opens
    await invitePage.clickSignUp();
    const authModal = page.locator('.auth-modal');
    await expect(authModal).toBeVisible();
  });

  test('M — authenticated user sees Claim button directly', async ({
    page,
    testUser,
    secondTestUser,
    leagueWithPlaceholder,
  }) => {
    const { inviteToken } = leagueWithPlaceholder;

    // Open as authenticated secondTestUser
    const browser = page.context().browser();
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();

    const invitePage = new InvitePage(p2);
    await invitePage.gotoAuthenticated(
      inviteToken,
      secondTestUser.token,
      secondTestUser.refreshToken
    );

    // Should see Claim My Matches directly
    const claimVisible = await invitePage.isClaimButtonVisible();
    expect(claimVisible).toBe(true);

    // Should NOT see Sign Up / Log In
    const signUpVisible = await invitePage.isSignUpVisible();
    expect(signUpVisible).toBe(false);

    const logInVisible = await invitePage.isLogInVisible();
    expect(logInVisible).toBe(false);

    // Heading should be the invite heading
    const heading = await invitePage.getHeading();
    expect(heading).toContain("Been Invited");

    await ctx.close();
  });
});
