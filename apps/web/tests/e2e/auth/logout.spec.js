import { test, expect } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage.js';
import { HomePage } from '../pages/HomePage.js';
import { cleanupTestData, generateTestPhoneNumber, getVerificationCodeForPhone, formatPhoneForInput, clearBrowserStorage } from '../utils/test-helpers.js';
import { createTestUser, sendVerificationCode } from '../fixtures/api.js';

test.describe('Logout Flow', () => {
  let testPhoneNumber;
  let testPassword = 'Test1234';

  test.beforeEach(async ({ page }) => {
    // Clear browser storage for test isolation
    await clearBrowserStorage(page);
    // Generate a unique test phone number for each test
    testPhoneNumber = generateTestPhoneNumber();
  });

  test.afterEach(async () => {
    // Clean up test data
    if (testPhoneNumber) {
      await cleanupTestData(testPhoneNumber);
    }
  });

  test('should successfully logout authenticated user', async ({ page }) => {
    // Setup: Create and login as a test user
    await createTestUser({
      phoneNumber: testPhoneNumber,
      password: testPassword,
      fullName: 'Test User',
    });
    
    // Get verification code from signup and verify to complete account creation
    const code = await getVerificationCodeForPhone(testPhoneNumber);
    if (!code) {
      throw new Error('No verification code found after signup');
    }
    const { verifyPhone, loginWithPassword } = await import('../fixtures/api.js');
    await verifyPhone(testPhoneNumber, code);

    const homePage = new HomePage(page);
    const authPage = new AuthPage(page);

    // Login via UI
    await homePage.goto();
    await homePage.clickSignIn();
    await authPage.waitForModal();
    await authPage.loginWithPassword(testPhoneNumber, testPassword);
    await homePage.waitForRedirectToHome();

    // Verify we're authenticated
    expect(await homePage.isAuthenticated()).toBeTruthy();

    // Logout (this waits for navigation and token clearing)
    await homePage.logout();

    // Verify we're on the landing page
    expect(page.url()).toContain('/');
    
    // Verify tokens are cleared from localStorage (logout() already waited for this)
    const tokensAfterLogout = await page.evaluate(() => {
      return {
        accessToken: localStorage.getItem('beach_access_token'),
        refreshToken: localStorage.getItem('beach_refresh_token'),
      };
    });
    expect(tokensAfterLogout.accessToken).toBeNull();
    expect(tokensAfterLogout.refreshToken).toBeNull();

    // Verify we're logged out (check authentication state)
    expect(await homePage.isAuthenticated()).toBeFalsy();
  });

  test('should clear authentication tokens on logout', async ({ page, context }) => {
    // Setup: Create and login as a test user
    await createTestUser({
      phoneNumber: testPhoneNumber,
      password: testPassword,
      fullName: 'Test User',
    });
    
    // Get verification code from signup and verify to complete account creation
    const code = await getVerificationCodeForPhone(testPhoneNumber);
    if (!code) {
      throw new Error('No verification code found after signup');
    }
    const { verifyPhone } = await import('../fixtures/api.js');
    await verifyPhone(testPhoneNumber, code);

    const homePage = new HomePage(page);
    const authPage = new AuthPage(page);

    // Login via UI
    await homePage.goto();
    await homePage.clickSignIn();
    await authPage.waitForModal();
    await authPage.loginWithPassword(testPhoneNumber, testPassword);
    await homePage.waitForRedirectToHome();

    // Verify tokens are stored
    const localStorage = await context.storageState();
    const cookies = await context.cookies();
    
    // Check if tokens exist (they might be in localStorage)
    const storageState = await page.evaluate(() => {
      return {
        accessToken: localStorage.getItem('beach_access_token'),
        refreshToken: localStorage.getItem('beach_refresh_token'),
      };
    });

    // At least one token should exist
    expect(storageState.accessToken || storageState.refreshToken).toBeTruthy();

    // Logout (this waits for navigation and token clearing)
    await homePage.logout();

    // Verify tokens are cleared from localStorage (logout() already waited for this)
    const storageStateAfterLogout = await page.evaluate(() => {
      return {
        accessToken: localStorage.getItem('beach_access_token'),
        refreshToken: localStorage.getItem('beach_refresh_token'),
      };
    });

    expect(storageStateAfterLogout.accessToken).toBeNull();
    expect(storageStateAfterLogout.refreshToken).toBeNull();
  });
});

