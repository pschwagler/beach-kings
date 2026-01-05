/**
 * Base page object with common functionality
 */
export class BasePage {
  constructor(page) {
    this.page = page;
  }

  /**
   * Navigate to a URL
   */
  async goto(path, options = {}) {
    // Use domcontentloaded for faster navigation - page is ready for interaction
    // Use explicit timeout to avoid hanging indefinitely
    await this.page.goto(path, {
      waitUntil: 'domcontentloaded',
      timeout: 30000, // 30 second timeout
      ...options
    });
  }

  /**
   * Wait for page to be loaded
   * Uses 'domcontentloaded' which is faster than 'networkidle' and sufficient for most cases
   * 'networkidle' can hang indefinitely if there are polling requests or websockets
   */
  async waitForLoad() {
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Get current URL
   */
  getUrl() {
    return this.page.url();
  }

  /**
   * Take a screenshot
   */
  async screenshot(options = {}) {
    return await this.page.screenshot(options);
  }

  /**
   * Wait for an element to be visible
   */
  async waitForElement(selector, options = {}) {
    await this.page.waitForSelector(selector, { state: 'visible', ...options });
  }

  /**
   * Click an element
   */
  async click(selector) {
    await this.page.click(selector);
  }

  /**
   * Fill an input field
   */
  async fill(selector, value) {
    await this.page.fill(selector, value);
  }

  /**
   * Get text content of an element
   */
  async getText(selector) {
    return await this.page.textContent(selector);
  }

  /**
   * Check if an element is visible
   */
  async isVisible(selector) {
    return await this.page.isVisible(selector);
  }
}

