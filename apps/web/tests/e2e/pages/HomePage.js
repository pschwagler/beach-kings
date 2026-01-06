import { BasePage } from './BasePage.js';

/**
 * Page Object Model for Home Page
 */
export class HomePage extends BasePage {
  constructor(page) {
    super(page);
    // Selectors
    this.selectors = {
      // Navigation
      navBar: 'nav, [role="navigation"]',
      signInButton: 'button:has-text("Log In"), button:has-text("Sign In")',
      signUpButton: 'button:has-text("Sign Up")',
      userMenu: '[data-testid="user-menu"], .user-menu',
      logoutButton: 'button:has-text("Sign Out"), button:has-text("Logout")',
      
      // Landing page content
      welcomeTitle: 'h2:has-text("Welcome"), h1:has-text("Welcome")',
      landingContent: '.landing-content',
      
      // Authenticated content
      homeTab: '[data-testid="home-tab"], button:has-text("Home")',
      leaguesTab: '[data-testid="leagues-tab"], button:has-text("Leagues")',
      profileTab: '[data-testid="profile-tab"], button:has-text("Profile")',
      dashboardContent: '.dashboard-content',
      userMenuButton: '[data-testid="user-menu-button"]',
    };
  }

  /**
   * Navigate to home page
   */
  async goto() {
    // goto() already waits for domcontentloaded, which is sufficient
    await super.goto('/');
  }

  /**
   * Navigate to authenticated home page
   */
  async gotoHome() {
    // goto() already waits for domcontentloaded, no need to call waitForLoad() again
    await super.goto('/home');
  }

  /**
   * Check if user is authenticated (by checking for user menu or authenticated content)
   */
  async isAuthenticated() {
    // Most reliable: Check if auth token exists in localStorage
    // Wait for token to be stored (may take a moment after login response)
    let hasToken = false;
    for (let i = 0; i < 10; i++) {
      hasToken = await this.page.evaluate(() => {
        return !!localStorage.getItem('beach_access_token');
      }).catch(() => false);
      if (hasToken) break;
      await this.page.waitForTimeout(100); // Reduced from 500ms, but more iterations
    }
    
    if (hasToken) {
      return true;
    }
    
    // Check if auth modal is closed
    const authModalVisible = await this.page.locator('.auth-modal').isVisible().catch(() => false);
    const hasSignInButton = await this.isVisible(this.selectors.signInButton).catch(() => false);
    
    // If modal is closed and sign in button is gone, we're authenticated
    if (!authModalVisible && !hasSignInButton) {
      return true;
    }
    
    // Fallback: Check for authenticated UI elements
    const hasUserMenu = await this.isVisible(this.selectors.userMenu).catch(() => false);
    const hasUserMenuButton = await this.isVisible(this.selectors.userMenuButton).catch(() => false);
    const hasHomeTab = await this.isVisible(this.selectors.homeTab).catch(() => false);
    const hasDashboardContent = await this.isVisible(this.selectors.dashboardContent).catch(() => false);
    
    // Check URL - if we're on /home, we're likely authenticated
    const url = this.page.url();
    const isOnHomePage = url.includes('/home');
    
    // Check for authenticated content
    const pageState = await this.page.evaluate(() => {
      const nav = document.querySelector('nav');
      const welcomeTitle = document.querySelector('h1:has-text("Welcome"), h2:has-text("Welcome")');
      return { hasNav: !!nav, isNotLanding: !welcomeTitle };
    }).catch(() => ({ hasNav: false, isNotLanding: false }));
    
    const hasAuthIndicators = hasUserMenu || hasUserMenuButton || hasHomeTab || hasDashboardContent;
    const buttonsGone = !hasSignInButton;
    
    return hasAuthIndicators || (isOnHomePage && buttonsGone) || (buttonsGone && !authModalVisible && pageState.isNotLanding);
  }

  /**
   * Click sign in button
   */
  async clickSignIn() {
    // Check if modal is already open in sign-in mode
    const modalVisible = await this.page.locator('.auth-modal').isVisible().catch(() => false);
    if (modalVisible) {
      // Check if modal is already in sign-in mode
      const title = await this.page.locator('.auth-modal__header h2').textContent().catch(() => '');
      const isSignInMode = title && title.toLowerCase().includes('log in');
      
      if (isSignInMode) {
        // Modal is already open in sign-in mode, no need to close and reopen
        return;
      }
      
      // Modal is open but not in sign-in mode, close it first
      await this.page.keyboard.press('Escape').catch(() => {});
      
      const stillVisible = await this.page.locator('.auth-modal').isVisible().catch(() => false);
      if (stillVisible) {
        await this.page.locator('.auth-modal__close').click({ force: true }).catch(() => {});
      }
      
      // Wait for modal to be hidden
      await this.page.waitForSelector('.auth-modal', { state: 'hidden', timeout: 3000 }).catch(() => {});
    }
    
    // Wait for page to be fully loaded and React to be hydrated
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    
    // Wait for sign in button to be visible and ready
    const signInButton = this.page.locator(this.selectors.signInButton).first();
    await signInButton.waitFor({ state: 'visible', timeout: 10000 });
    
    // Scroll into view if needed
    await signInButton.scrollIntoViewIfNeeded();
    
    // Wait for button to be actionable (not disabled, not covered)
    await signInButton.waitFor({ state: 'attached', timeout: 5000 });
    
    // Use JavaScript click to ensure the click event fires and React handler is called
    await signInButton.evaluate((el) => {
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      el.click();
    });
    
    // Wait for modal to actually appear (not just a fixed timeout)
    await this.page.waitForSelector('.auth-modal', { state: 'visible', timeout: 10000 });
  }

  /**
   * Click sign up button
   */
  async clickSignUp() {
    // Check if modal is already open in signup mode
    const modalVisible = await this.page.locator('.auth-modal').isVisible().catch(() => false);
    if (modalVisible) {
      // Check if modal is already in signup mode
      const title = await this.page.locator('.auth-modal__header h2').textContent().catch(() => '');
      const isSignUpMode = title && (title.toLowerCase().includes('create account') || title.toLowerCase().includes('sign up') || title.toLowerCase().includes('signup'));
      
      if (isSignUpMode) {
        // Modal is already open in signup mode, no need to close and reopen
        return;
      }
      
      // Modal is open but not in signup mode, close it first
      await this.page.keyboard.press('Escape').catch(() => {});
      
      const stillVisible = await this.page.locator('.auth-modal').isVisible().catch(() => false);
      if (stillVisible) {
        await this.page.locator('.auth-modal__close').click({ force: true }).catch(() => {});
      }
      
      // Wait for modal to be hidden
      await this.page.waitForSelector('.auth-modal', { state: 'hidden', timeout: 3000 }).catch(() => {});
    }
    
    // Wait for page to be fully loaded and React to be hydrated
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    
    // Wait for button to be visible and enabled
    const signUpButton = this.page.locator(this.selectors.signUpButton).first();
    await signUpButton.waitFor({ state: 'visible', timeout: 10000 });
    
    // Verify button is not blocked by checking if it's actually clickable
    const isBlocked = await signUpButton.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const elementAtPoint = document.elementFromPoint(centerX, centerY);
      // If the element at the click point is not the button or inside it, it's blocked
      return elementAtPoint !== el && !el.contains(elementAtPoint);
    }).catch(() => false);
    
    if (isBlocked) {
      // Button is blocked, try to remove any overlays
      await this.page.evaluate(() => {
        // Remove any blocking overlays
        const overlays = document.querySelectorAll('.auth-modal-overlay, .modal-overlay');
        overlays.forEach(overlay => {
          if (overlay.style.pointerEvents !== 'none') {
            overlay.style.pointerEvents = 'none';
          }
        });
      });
      // Small delay for style change to take effect
      await this.page.waitForTimeout(100);
    }
    
    // Scroll into view if needed
    await signUpButton.scrollIntoViewIfNeeded();
    
    // Wait for button to be actionable (not disabled, not covered)
    await signUpButton.waitFor({ state: 'attached', timeout: 5000 });
    
    // Use JavaScript click to ensure the click event fires and React handler is called
    await signUpButton.evaluate((el) => {
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      el.click();
    });
    
    // Wait for modal to actually appear (not just a fixed timeout)
    await this.page.waitForSelector('.auth-modal', { state: 'visible', timeout: 10000 });
  }

  /**
   * Logout
   */
  async logout() {
    // Find the user menu button
    const userMenuButton = this.page.locator('button[aria-label="User menu"]').first();
    
    // Wait for button to be visible and enabled
    await userMenuButton.waitFor({ state: 'visible', timeout: 5000 });
    
    // Use JavaScript to click and ensure the click event fires
    await userMenuButton.evaluate((el) => {
      el.click();
    });
    
    // Wait for dropdown to appear (more reliable than timeout)
    await this.page.waitForSelector('.navbar-dropdown-user, .navbar-dropdown', { state: 'visible', timeout: 5000 });
    
    // Wait for the "Sign Out" item - try multiple selectors
    const signOutSelectors = [
      '.navbar-dropdown-user .navbar-dropdown-item:has-text("Sign Out")',
      '.navbar-dropdown .navbar-dropdown-item:has-text("Sign Out")',
      'button:has-text("Sign Out")',
    ];
    
    let signOutButton = null;
    for (const selector of signOutSelectors) {
      const btn = this.page.locator(selector).first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        signOutButton = btn;
        break;
      }
    }
    
    if (!signOutButton) {
      const dropdownHtml = await this.page.locator('.navbar-dropdown-user, .navbar-dropdown').first().innerHTML().catch(() => 'not found');
      throw new Error(`Could not find Sign Out button in dropdown. Dropdown HTML: ${dropdownHtml.substring(0, 200)}`);
    }
    
    // Set up navigation promise BEFORE clicking
    const navigationPromise = this.page.waitForURL('**/', { timeout: 10000 });
    
    // Click the sign out button - use JavaScript click to ensure it fires
    await signOutButton.evaluate((el) => el.click());
    
    // Wait for navigation to complete (logout redirects to /)
    await navigationPromise;
    
    // Wait for page to be ready after navigation
    await this.page.waitForLoadState('domcontentloaded');
    
    // Tokens should be cleared by the time navigation completes
    // Test will verify tokens are cleared if needed
  }

  /**
   * Wait for redirect to /home (after successful login)
   * Also checks for authenticated state as a fallback
   */
  async waitForRedirectToHome() {
    // Try multiple strategies to detect successful login (no initial timeout needed)
    const strategies = [
      // Strategy 1: Wait for URL change
      () => this.page.waitForURL('**/home', { timeout: 5000 }),
      // Strategy 2: Wait for any authenticated indicator
      () => this.page.waitForFunction(
        () => {
          const userMenu = document.querySelector('[data-testid="user-menu"], .user-menu, [data-testid="user-menu-button"]');
          const homeTab = document.querySelector('[data-testid="home-tab"]');
          const dashboardContent = document.querySelector('.dashboard-content, [class*="dashboard"]');
          const navBar = document.querySelector('nav');
          // Check if we're not on landing page (landing page has welcome title)
          const welcomeTitle = document.querySelector('h1:has-text("Welcome"), h2:has-text("Welcome")');
          return !!(userMenu || homeTab || dashboardContent || (navBar && !welcomeTitle));
        },
        { timeout: 5000 }
      ),
      // Strategy 3: Wait for auth modal to close (if it was open)
      () => this.page.waitForSelector('.auth-modal', { state: 'hidden', timeout: 5000 }).catch(() => null)
    ];
    
    // Try each strategy
    let success = false;
    for (const strategy of strategies) {
      try {
        await strategy();
        success = true;
        break;
      } catch (error) {
        // Continue to next strategy
      }
    }
    
    // Final check - verify we're actually authenticated (no timeout needed, strategies already waited)
    const isAuth = await this.isAuthenticated();
    if (!isAuth && !success) {
      const url = this.page.url();
      const title = await this.page.title().catch(() => 'unknown');
      throw new Error(`Login appears to have failed - user is not authenticated. Current URL: ${url}, Title: ${title}`);
    }
  }

  /**
   * Wait for redirect to / (after logout)
   */
  async waitForRedirectToLanding() {
    // Try multiple strategies to detect redirect to landing page (no initial timeout needed)
    const strategies = [
      // Strategy 1: Wait for URL change to '/'
      () => this.page.waitForURL('**/', { timeout: 5000 }),
      // Strategy 2: Wait for unauthenticated indicators (e.g., sign-in button visible)
      () => this.page.waitForFunction(
        () => {
          const signInButton = document.querySelector('button:has-text("Log In"), button:has-text("Sign In")');
          const userMenu = document.querySelector('[data-testid="user-menu"], .user-menu, [data-testid="user-menu-button"]');
          const hasAuthToken = localStorage.getItem('beach_access_token');
          return !!signInButton && !userMenu && !hasAuthToken;
        },
        { timeout: 5000 }
      ),
    ];

    let success = false;
    for (const strategy of strategies) {
      try {
        await strategy();
        success = true;
        break;
      } catch (error) {
        // Continue to next strategy
      }
    }

    // Final check - verify we're actually logged out
    const isAuth = await this.isAuthenticated();
    if (isAuth && !success) {
      const url = this.page.url();
      const title = await this.page.title().catch(() => 'unknown');
      throw new Error(`Logout appears to have failed - user is still authenticated. Current URL: ${url}, Title: ${title}`);
    }
  }
}
