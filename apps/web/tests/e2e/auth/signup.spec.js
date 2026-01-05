import { test, expect } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage.js';
import { HomePage } from '../pages/HomePage.js';
import { cleanupTestData, generateTestPhoneNumber, getVerificationCodeForPhone, formatPhoneForInput, clearBrowserStorage } from '../utils/test-helpers.js';

test.describe('Signup Flow', () => {
  let testPhoneNumber;
  let testPassword = 'Test1234';
  let testFullName = 'Test User';

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

  test('should successfully signup new user', async ({ page }) => {
    const homePage = new HomePage(page);
    const authPage = new AuthPage(page);

    // Navigate to home page
    await homePage.goto();
    
    // Wait for page to settle
    await page.waitForTimeout(500);

    // Click sign up button - this should open the auth modal
    await homePage.clickSignUp();

    // Wait for auth modal to be fully visible
    await authPage.waitForModal();
    await page.waitForTimeout(300); // Give modal time to fully render

    // Fill in signup form
    await authPage.fillPhoneNumber(formatPhoneForInput(testPhoneNumber));
    await authPage.fillPassword(testPassword);
    await authPage.fillFullName(testFullName);

    // Wait for form validation to complete
    // PhoneInput validates asynchronously via useEffect - need to wait for React state update
    await page.waitForTimeout(2000);

    // Verify form fields are filled
    const phoneValue = await page.locator('input[type="tel"]').first().inputValue();
    const passwordValue = await page.locator('input[type="password"]').first().inputValue();
    const fullNameValue = await page.locator('input[name="fullName"]').first().inputValue();
    
    if (!phoneValue || !passwordValue || !fullNameValue) {
      throw new Error(`Form fields not filled: phone=${!!phoneValue}, password=${!!passwordValue}, fullName=${!!fullNameValue}`);
    }

    // Check for any validation errors before submitting
    const hasErrorBeforeSubmit = await authPage.hasError();
    if (hasErrorBeforeSubmit) {
      const errorMsg = await authPage.getAlertMessage();
      throw new Error(`Form has validation error before submission: ${errorMsg}`);
    }

    // Set up response listener BEFORE submitting
    const responsePromise = page.waitForResponse(
      response => response.url().includes('/api/auth/signup'),
      { timeout: 20000 }
    );

    // Submit form - use JavaScript click to ensure it fires
    const submitButton = page.locator('.auth-modal__submit').first();
    await submitButton.waitFor({ state: 'visible' });
    await submitButton.evaluate((el) => el.click());
    
    // Wait for signup response
    const signupResponse = await responsePromise;
    const status = signupResponse.status();
    
    // Should get 200 for successful signup
    if (status !== 200) {
      const responseData = await signupResponse.json().catch(() => ({}));
      throw new Error(`Signup failed with status ${status}: ${JSON.stringify(responseData)}`);
    }

    // Wait for verification code step UI to appear (indicates successful signup)
    await page.waitForSelector('input[name="code"]', { timeout: 5000 });

    // Get verification code from database
    const code = await getVerificationCodeForPhone(testPhoneNumber);
    if (!code) {
      throw new Error('No verification code found after signup');
    }

    // Fill verification code
    await authPage.fillVerificationCode(code);

    // Wait for verify-phone response
    const verifyResponsePromise = page.waitForResponse(
      response => response.url().includes('/api/auth/verify-phone') && response.status() === 200,
      { timeout: 10000 }
    );

    // Submit verification
    await authPage.submit();
    
    // Wait for successful verification
    await verifyResponsePromise;

    // Wait for redirect to /home
    await homePage.waitForRedirectToHome();

    // Verify we're on the home page and authenticated
    expect(page.url()).toContain('/home');
    expect(await homePage.isAuthenticated()).toBeTruthy();
  });

  test('should show error for invalid password', async ({ page }) => {
    const homePage = new HomePage(page);
    const authPage = new AuthPage(page);

    // Navigate to home page
    await homePage.goto();

    // Click sign up button
    await homePage.clickSignUp();

    // Wait for auth modal
    await authPage.waitForModal();

    // Fill in signup form with weak password
    await authPage.fillPhoneNumber(formatPhoneForInput(testPhoneNumber));
    await authPage.fillPassword('weak'); // Too short, no number
    await authPage.fillFullName(testFullName);

    // Wait for form validation
    await page.waitForTimeout(1500);

    // The form might show client-side validation error, or submit and get server error
    // Set up response listener (might not fire if client-side validation blocks)
    const responsePromise = page.waitForResponse(
      response => response.url().includes('/api/auth/signup'),
      { timeout: 5000 }
    ).catch(() => null); // If no response (client-side validation), that's okay

    // Submit form
    await authPage.submit();
    
    // Wait for response or check for client-side error
    await page.waitForTimeout(1000);
    
    // Check if there's a client-side validation error (form shows error without API call)
    const hasClientError = await authPage.hasError();
    if (hasClientError) {
      const errorMessage = await authPage.getAlertMessage();
      expect(errorMessage).toBeTruthy();
      expect(errorMessage.toLowerCase()).toMatch(/password|8|character/);
      return; // Client-side validation caught it, no API call needed
    }
    
    // If no client-side error, check API response
    if (responsePromise) {
      const signupResponse = await responsePromise;
      const status = signupResponse.status();
      
      // Should get 400 error for invalid password
      expect(status).toBe(400);
      
      // Verify error message in response
      const responseData = await signupResponse.json().catch(() => ({}));
      expect(responseData.detail).toBeTruthy();
      expect(responseData.detail.toLowerCase()).toMatch(/password|8|character/);
    }
  });

  test('should show error for missing full name', async ({ page }) => {
    const homePage = new HomePage(page);
    const authPage = new AuthPage(page);

    // Navigate to home page
    await homePage.goto();

    // Click sign up button
    await homePage.clickSignUp();

    // Wait for auth modal
    await authPage.waitForModal();

    // Fill in signup form without full name
    await authPage.fillPhoneNumber(formatPhoneForInput(testPhoneNumber));
    await authPage.fillPassword(testPassword);
    // Don't fill full name

    // Wait for form validation
    await page.waitForTimeout(1500);

    // Submit form - validation happens on submit, not before
    // The button should be enabled, and clicking it will trigger validation
    await authPage.submit();

    // Wait for error message to appear (validation happens in handleSubmit)
    // The error should appear immediately after submit
    await page.waitForSelector('.auth-modal__alert.error', { timeout: 5000 }).catch(() => {
      // If error doesn't appear, wait a bit more
    });
    
    await page.waitForTimeout(2000);

    // Verify error is shown
    const hasError = await authPage.hasError();
    expect(hasError).toBeTruthy();
    
    const errorMessage = await authPage.getAlertMessage();
    expect(errorMessage).toBeTruthy();
    expect(errorMessage.toLowerCase()).toMatch(/name|required|full name/);
  });

  test('should show error for invalid verification code', async ({ page }) => {
    const homePage = new HomePage(page);
    const authPage = new AuthPage(page);

    // Navigate to home page
    await homePage.goto();

    // Click sign up button
    await homePage.clickSignUp();

    // Wait for auth modal
    await authPage.waitForModal();

    // Fill in signup form
    await authPage.fillPhoneNumber(formatPhoneForInput(testPhoneNumber));
    await authPage.fillPassword(testPassword);
    await authPage.fillFullName(testFullName);

    // Wait for form validation
    await page.waitForTimeout(1500);

    // Set up response listener for signup
    const signupResponsePromise = page.waitForResponse(
      response => response.url().includes('/api/auth/signup') && response.status() === 200,
      { timeout: 15000 }
    );

    // Submit form
    await authPage.submit();
    
    // Wait for successful signup
    await signupResponsePromise;

    // Wait for verification code step
    await page.waitForTimeout(1000);
    await page.waitForSelector('input[name="code"]', { timeout: 5000 });

    // Fill invalid verification code
    await authPage.fillVerificationCode('0000');

    // Set up response listener for verify-phone (should fail)
    const verifyResponsePromise = page.waitForResponse(
      response => response.url().includes('/api/auth/verify-phone'),
      { timeout: 10000 }
    );

    // Submit verification
    await authPage.submit();
    
    // Wait for error response (could be 400 or 401 depending on code validation)
    const verifyResponse = await verifyResponsePromise;
    const status = verifyResponse.status();
    expect([400, 401]).toContain(status); // Accept either 400 or 401 for invalid code

    // Wait for error message
    await page.waitForTimeout(1000);

    // Verify error is shown
    expect(await authPage.hasError()).toBeTruthy();
    const errorMessage = await authPage.getAlertMessage();
    expect(errorMessage).toBeTruthy();
    expect(errorMessage.toLowerCase()).toMatch(/invalid|incorrect|code/);
  });

  test('should handle existing user gracefully', async ({ page }) => {
    // Setup: Create a test user first and complete signup
    // Wrap in try-catch in case user already exists from previous test run
    try {
      const { createTestUser } = await import('../fixtures/api.js');
      await createTestUser({
        phoneNumber: testPhoneNumber,
        password: testPassword,
        fullName: testFullName,
      });
      
      // Get the verification code from signup (this code has the password_hash)
      const code = await getVerificationCodeForPhone(testPhoneNumber);
      if (!code) {
        throw new Error('No verification code found after signup');
      }
      
      // Verify phone to complete signup (this creates the user account)
      const { verifyPhone } = await import('../fixtures/api.js');
      await verifyPhone(testPhoneNumber, code);
    } catch (error) {
      // If user already exists (400 error), that's fine - we'll test with existing user
      // If it's a different error, rethrow it
      if (error.response?.status === 400 || error.message?.includes('already registered')) {
        // User already exists, continue with test
      } else {
        throw error;
      }
    }

    const homePage = new HomePage(page);
    const authPage = new AuthPage(page);

    // Navigate to home page - ensure we're on a completely fresh page
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
    
    // Clear any existing state after page loads
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        // Ignore errors if storage is not accessible
      }
    });
    
    // Wait for page to be ready (wait for DOM to be ready)
    await page.waitForLoadState('domcontentloaded');

    // Check if user is logged in (they shouldn't be, but verify)
    const isAuthenticated = await homePage.isAuthenticated();
    if (isAuthenticated) {
      // User is logged in, log them out first
      await homePage.logout();
      // Wait for logout to complete (redirect to landing page)
      await page.waitForURL('**/', { timeout: 5000 });
    }

    // Check if modal is already open - if it is, use it directly (don't try to click button!)
    // AuthModal returns null when closed, so if it exists in DOM, it's open
    // Wait for any initial page renders to complete
    await page.waitForLoadState('domcontentloaded');
    
    // Simple check: if modal overlay exists in DOM, modal is open
    const modalExists = await page.locator('.auth-modal-overlay').count() > 0;
    
    if (modalExists) {
      // Modal is already open - use it directly, don't try to click the button!
      await authPage.waitForModal();
      
      // Switch to signup mode if needed
      const currentTitle = await authPage.getTitle();
      const isSignUpMode = currentTitle && (
        currentTitle.toLowerCase().includes('create account') ||
        currentTitle.toLowerCase().includes('sign up') ||
        currentTitle.toLowerCase().includes('signup')
      );
      if (!isSignUpMode) {
        await authPage.switchToSignUp();
        // Wait for mode switch to complete (modal content to update)
        await page.waitForTimeout(300);
      }
    } else {
      // Modal is NOT open - click the Sign Up button on the landing page to open it
      const signUpButton = page.locator('button:has-text("Sign Up"):not(.auth-modal button), button:has-text("Sign up"):not(.auth-modal button)').first();
      await signUpButton.waitFor({ state: 'visible', timeout: 10000 });
      
      // Click using JavaScript to open the modal
      await signUpButton.evaluate((el) => {
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        el.click();
      });
      
      // Wait for modal to appear
      await page.waitForSelector('.auth-modal', { state: 'visible', timeout: 10000 });
      await authPage.waitForModal();
      
      // Ensure we're in signup mode
      const currentTitle = await authPage.getTitle();
      const isSignUpMode = currentTitle && (
        currentTitle.toLowerCase().includes('create account') ||
        currentTitle.toLowerCase().includes('sign up') ||
        currentTitle.toLowerCase().includes('signup')
      );
      if (!isSignUpMode) {
        await authPage.switchToSignUp();
        // Wait for mode switch to complete
        await page.waitForTimeout(300);
      }
    }

    // Wait for phone input to be visible before filling
    await page.waitForSelector('input.phone-input__input', { state: 'visible', timeout: 10000 });

    // Try to signup with existing phone number
    await authPage.fillPhoneNumber(formatPhoneForInput(testPhoneNumber));
    await authPage.fillPassword(testPassword);
    await authPage.fillFullName(testFullName);

    // Wait for form validation to complete (phone input validates asynchronously)
    await page.waitForTimeout(1500);

    // Wait for signup response (should be 400 for existing user)
    const responsePromise = page.waitForResponse(
      response => response.url().includes('/api/auth/signup'),
      { timeout: 15000 }
    );

    // Submit form
    await authPage.submit();

    // Wait for response
    const signupResponse = await responsePromise;
    const status = signupResponse.status();
    
    // Should get 400 error for existing user
    expect(status).toBe(400);
    
    // Wait for error message to appear in UI
    await page.waitForSelector('.auth-modal__alert.error', { state: 'visible', timeout: 5000 });

    // Verify error is shown (user already exists)
    expect(await authPage.hasError()).toBeTruthy();
    const errorMessage = await authPage.getAlertMessage();
    expect(errorMessage).toBeTruthy();
    expect(errorMessage.toLowerCase()).toMatch(/already|registered|exists/);
  });
});

