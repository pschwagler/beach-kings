import { test, expect } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage.js';
import { HomePage } from '../pages/HomePage.js';
import { cleanupTestData, generateTestPhoneNumber, getVerificationCodeForPhone, formatPhoneForInput, clearBrowserStorage } from '../utils/test-helpers.js';
import { createTestUser, sendVerificationCode } from '../fixtures/api.js';

test.describe('Forgot Password Flow', () => {
  let testPhoneNumber;
  let testPassword = 'Test1234';

  test.beforeEach(async ({ page }) => {
    // Clear browser storage for test isolation
    await clearBrowserStorage(page);
    testPhoneNumber = generateTestPhoneNumber();
  });

  test.afterEach(async () => {
    if (testPhoneNumber) {
      await cleanupTestData(testPhoneNumber);
    }
  });

  test('should successfully reset password with verification code', async ({ page }) => {
    // Setup: Create a test user (createTestUser is now idempotent - handles existing users)
    await createTestUser({
      phoneNumber: testPhoneNumber,
      password: testPassword,
      fullName: 'Test User',
    });
    
    // Check if user is already verified by trying to login
    const { loginWithPassword, verifyPhone } = await import('../fixtures/api.js');
    let isVerified = false;
    try {
      await loginWithPassword(testPhoneNumber, testPassword);
      isVerified = true; // User exists and is verified
    } catch (error) {
      // User exists but not verified yet, or doesn't exist (shouldn't happen)
      isVerified = false;
    }
    
    // If not verified, complete the verification process
    if (!isVerified) {
      const code = await getVerificationCodeForPhone(testPhoneNumber);
      if (!code) {
        throw new Error('No verification code found after signup');
      }
      await verifyPhone(testPhoneNumber, code);
    }

    const homePage = new HomePage(page);
    const authPage = new AuthPage(page);

    // Navigate to home page
    await homePage.goto();

    // Click sign in button
    await homePage.clickSignIn();

    // Wait for auth modal
    await authPage.waitForModal();

    // Click "Forgot password?" link
    await authPage.clickForgotPassword();

    // Verify we're in reset password mode
    const title = await authPage.getTitle();
    expect(title).toContain('Send Code');

    // Fill phone number
    await authPage.fillPhoneNumber(formatPhoneForInput(testPhoneNumber));

    // Wait for reset password response
    const resetResponsePromise = page.waitForResponse(
      response => response.url().includes('/api/auth/reset-password'),
      { timeout: 10000 }
    );

    // Submit form to send code
    await authPage.submit();
    
    // Wait for response
    await resetResponsePromise;

    // Wait for code input to appear
    await page.waitForSelector('input[name="code"]', { timeout: 5000 });

    // Get verification code from database
    const resetCode = await getVerificationCodeForPhone(testPhoneNumber);
    if (!resetCode) {
      throw new Error('No verification code found for password reset');
    }

    // Fill verification code
    await authPage.fillVerificationCode(resetCode);

    // Wait for verify response
    const verifyResponsePromise = page.waitForResponse(
      response => response.url().includes('/api/auth/reset-password-verify'),
      { timeout: 10000 }
    );

    // Submit verification
    await authPage.submit();
    
    // Wait for response
    await verifyResponsePromise;

    // Wait for new password input to appear
    await page.waitForSelector('input[type="password"]', { timeout: 5000 });

    // Fill new password
    const newPassword = 'NewPassword123';
    await authPage.fillPassword(newPassword);

    // Wait for confirm password reset response
    const confirmResponsePromise = page.waitForResponse(
      response => response.url().includes('/api/auth/reset-password-confirm'),
      { timeout: 10000 }
    );

    // Submit new password
    await authPage.submit();
    
    // Wait for response
    await confirmResponsePromise;

    // Verify modal closes (user should be logged in with new password)
    await page.waitForSelector('.auth-modal', { state: 'hidden', timeout: 5000 });

    // Verify we're authenticated
    expect(await homePage.isAuthenticated()).toBeTruthy();
  });

  test('should show error for invalid phone number in forgot password', async ({ page }) => {
    const homePage = new HomePage(page);
    const authPage = new AuthPage(page);

    // Navigate to home page
    await homePage.goto();

    // Click sign in button
    await homePage.clickSignIn();

    // Wait for auth modal
    await authPage.waitForModal();

    // Click "Forgot password?" link
    await authPage.clickForgotPassword();

    // Fill invalid phone number
    await authPage.fillPhoneNumber('(123) 456-7890');

    // Wait for reset password response (should be 400 or 404)
    const resetResponsePromise = page.waitForResponse(
      response => response.url().includes('/api/auth/reset-password'),
      { timeout: 10000 }
    );

    // Submit form
    await authPage.submit();
    
    // Wait for response
    const resetResponse = await resetResponsePromise;
    const status = resetResponse.status();
    
    // Should get error for invalid/non-existent phone
    expect(status).toBeGreaterThanOrEqual(400);

    // Verify error is shown
    await page.waitForTimeout(1000);
    expect(await authPage.hasError()).toBeTruthy();
  });
});
