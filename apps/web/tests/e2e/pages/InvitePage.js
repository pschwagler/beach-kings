import { BasePage } from './BasePage.js';

/**
 * Page Object Model for the Invite Landing Page (/invite/[token]).
 *
 * Handles three states:
 * - Unauthenticated: shows sign-up / log-in CTAs
 * - Authenticated (pending): shows "Claim My Matches" CTA
 * - Post-claim: shows success or error banners
 */
export class InvitePage extends BasePage {
  constructor(page) {
    super(page);
    this.selectors = {
      card: '.invite-page__card',
      heading: '.invite-page__heading',
      description: '.invite-page__description',
      matchCountNumber: '.invite-page__match-count-number',
      matchCountLabel: '.invite-page__match-count-label',
      leagueBadge: '.invite-page__league-badge',
      ctaGroup: '.invite-page__cta-group',

      // CTA buttons
      claimButton: '.invite-page__cta:has-text("Claim My Matches")',
      signUpButton: '.invite-page__cta:has-text("Sign Up")',
      logInButton: '.invite-page__cta:has-text("Log In")',

      // Post-claim states
      success: '.invite-page__success',
      errorIcon: '.invite-page__icon-wrapper--error',
      warnings: '.invite-page__warnings',

      // Loading
      skeleton: '.invite-page__skeleton',
      spinner: '.invite-page__spinner',

      // Auth modal (shared component)
      authModal: '.auth-modal',
    };
  }

  /**
   * Navigate to invite page (unauthenticated context).
   * Waits for skeleton to disappear and card to render.
   *
   * @param {string} token - Invite token
   */
  async goto(token) {
    await super.goto(`/invite/${token}`);
    // Wait for skeleton to disappear and real content to load
    await this.page.waitForSelector(this.selectors.skeleton, { state: 'hidden', timeout: 15000 }).catch(() => {});
    await this.page.waitForSelector(this.selectors.card, { state: 'visible', timeout: 15000 });
  }

  /**
   * Navigate to invite page with auth tokens pre-injected.
   * Navigates to "/" first to set the origin for localStorage,
   * injects tokens, then navigates to the invite URL.
   *
   * @param {string} token - Invite token
   * @param {string} accessToken - User's access token
   * @param {string} refreshToken - User's refresh token
   */
  async gotoAuthenticated(token, accessToken, refreshToken) {
    // Set origin first
    await this.page.goto('/');
    await this.page.evaluate(({ a, r }) => {
      localStorage.setItem('beach_access_token', a);
      localStorage.setItem('beach_refresh_token', r);
    }, { a: accessToken, r: refreshToken });

    // Set up auth/me listener before navigation
    const authMePromise = this.page.waitForResponse(
      r => r.url().includes('/api/auth/me'),
      { timeout: 15000 }
    ).catch(() => {});

    await super.goto(`/invite/${token}`);
    await authMePromise;

    // Wait for content to load
    await this.page.waitForSelector(this.selectors.skeleton, { state: 'hidden', timeout: 15000 }).catch(() => {});
    await this.page.waitForSelector(this.selectors.card, { state: 'visible', timeout: 15000 });
  }

  /**
   * Get the main heading text (e.g., "You've Been Invited!", "Matches Claimed!").
   */
  async getHeading() {
    await this.page.waitForSelector(this.selectors.heading, { state: 'visible', timeout: 10000 });
    return await this.getText(this.selectors.heading);
  }

  /**
   * Get the match count number displayed on the card.
   */
  async getMatchCount() {
    await this.page.waitForSelector(this.selectors.matchCountNumber, { state: 'visible', timeout: 10000 });
    const text = await this.getText(this.selectors.matchCountNumber);
    return text.trim();
  }

  /**
   * Get an array of league badge texts.
   */
  async getLeagueNames() {
    const badges = this.page.locator(this.selectors.leagueBadge);
    const count = await badges.count();
    const names = [];
    for (let i = 0; i < count; i++) {
      names.push((await badges.nth(i).textContent()).trim());
    }
    return names;
  }

  /**
   * Click "Claim My Matches" and wait for the claim API response.
   */
  async clickClaim() {
    const responsePromise = this.page.waitForResponse(
      r => r.url().includes('/claim') && r.request().method() === 'POST',
      { timeout: 15000 }
    );
    await this.page.locator(this.selectors.claimButton).click();
    await responsePromise;
  }

  /**
   * Click "Sign Up" and wait for the auth modal to appear.
   */
  async clickSignUp() {
    await this.page.locator(this.selectors.signUpButton).click();
    await this.page.waitForSelector(this.selectors.authModal, { state: 'visible', timeout: 10000 });
  }

  /**
   * Click "Log In" and wait for the auth modal to appear.
   */
  async clickLogIn() {
    await this.page.locator(this.selectors.logInButton).click();
    await this.page.waitForSelector(this.selectors.authModal, { state: 'visible', timeout: 10000 });
  }

  /**
   * Check whether the success state is visible.
   */
  async isClaimSuccess() {
    return await this.page.locator(this.selectors.success).isVisible({ timeout: 5000 }).catch(() => false);
  }

  /**
   * Check whether the error icon is visible.
   */
  async isError() {
    return await this.page.locator(this.selectors.errorIcon).isVisible({ timeout: 5000 }).catch(() => false);
  }

  /**
   * Check whether the "Claim My Matches" button is visible.
   */
  async isClaimButtonVisible() {
    return await this.page.locator(this.selectors.claimButton).isVisible({ timeout: 3000 }).catch(() => false);
  }

  /**
   * Check whether the "Sign Up" button is visible.
   */
  async isSignUpVisible() {
    return await this.page.locator(this.selectors.signUpButton).isVisible({ timeout: 3000 }).catch(() => false);
  }

  /**
   * Check whether the "Log In" button is visible.
   */
  async isLogInVisible() {
    return await this.page.locator(this.selectors.logInButton).isVisible({ timeout: 3000 }).catch(() => false);
  }
}
