import { BasePage } from './BasePage.js';
import { formatPhoneForInput } from '../utils/test-helpers.js';

/**
 * Page Object Model for Authentication Modal
 */
export class AuthPage extends BasePage {
  constructor(page) {
    super(page);
    // Selectors
    this.selectors = {
      overlay: '.auth-modal-overlay',
      modal: '.auth-modal',
      closeButton: '.auth-modal__close',
      title: '.auth-modal__header h2',
      description: '.auth-modal__description',
      alert: '.auth-modal__alert',
      alertError: '.auth-modal__alert.error',
      alertSuccess: '.auth-modal__alert.success',
      form: '.auth-modal__form',
      
      // Form fields
      phoneInput: 'input.phone-input__input, input[type="tel"], input[name="phoneNumber"]',
      passwordInput: 'input[type="password"]',
      fullNameInput: 'input[name="fullName"]',
      emailInput: 'input[name="email"]',
      codeInput: 'input[name="code"]',
      
      // Buttons
      submitButton: '.auth-modal__submit',
      sendCodeButton: 'button:has-text("Send Code")',
      
      // Footer links
      signUpLink: 'button:has-text("Sign up")',
      signInLink: 'button:has-text("Log in")',
      forgotPasswordLink: 'button:has-text("Forgot password")',
    };
  }

  /**
   * Wait for auth modal to be visible
   */
  async waitForModal() {
    await this.waitForElement(this.selectors.modal);
  }

  /**
   * Check if modal is visible
   */
  async isModalVisible() {
    return await this.isVisible(this.selectors.modal);
  }

  /**
   * Close the modal
   */
  async close() {
    await this.click(this.selectors.closeButton);
    await this.page.waitForSelector(this.selectors.modal, { state: 'hidden' });
  }

  /**
   * Get modal title
   */
  async getTitle() {
    return await this.getText(this.selectors.title);
  }

  /**
   * Get alert message (error or success)
   */
  async getAlertMessage() {
    if (await this.isVisible(this.selectors.alert)) {
      const alertText = await this.getText(this.selectors.alert);
      return alertText?.trim() || null;
    }
    return null;
  }

  /**
   * Check if error alert is visible
   */
  async hasError() {
    return await this.isVisible(this.selectors.alertError);
  }

  /**
   * Check if success alert is visible
   */
  async hasSuccess() {
    return await this.isVisible(this.selectors.alertSuccess);
  }

  /**
   * Fill phone number
   * PhoneInput component formats the number, so we need to handle that
   */
  async fillPhoneNumber(phoneNumber) {
    // PhoneInput component uses class "phone-input__input" for the actual input
    // The component expects formatted input like (555) 123-4567
    const phoneInput = this.page.locator('input.phone-input__input').first();
    
    // Wait for input to be visible and ready
    await phoneInput.waitFor({ state: 'visible', timeout: 5000 });
    
    // Focus the input first
    await phoneInput.focus();
    
    // Clear any existing value first (select all and delete)
    await phoneInput.selectText();
    await phoneInput.press('Backspace');
    
    // Fill with the formatted phone number (component expects formatted input)
    // formatPhoneForInput converts E.164 to (555) 123-4567 format
    const formattedPhone = phoneNumber.includes('(') ? phoneNumber : formatPhoneForInput(phoneNumber);
    await phoneInput.fill(formattedPhone);
    
    // Trigger change event to ensure PhoneInput processes it
    await phoneInput.dispatchEvent('input');
    await phoneInput.dispatchEvent('change');
    
    // Blur to trigger validation
    await phoneInput.blur();
    
    // PhoneInput validation happens synchronously in useEffect, but we need a small delay
    // for React to process the state update (validation callback fires immediately)
    await this.page.waitForTimeout(200);
    
    // Verify the input was filled (this also serves as a wait for formatting to complete)
    const value = await phoneInput.inputValue();
    if (!value || value.length < 10) {
      throw new Error(`Failed to fill phone number. Input value after filling: "${value}" (expected formatted phone)`);
    }
  }

  /**
   * Fill password
   */
  async fillPassword(password) {
    await this.fill(this.selectors.passwordInput, password);
  }

  /**
   * Fill full name
   */
  async fillFullName(fullName) {
    await this.fill(this.selectors.fullNameInput, fullName);
  }

  /**
   * Fill email
   */
  async fillEmail(email) {
    await this.fill(this.selectors.emailInput, email);
  }

  /**
   * Fill verification code
   */
  async fillVerificationCode(code) {
    await this.fill(this.selectors.codeInput, code);
  }

  /**
   * Click submit button
   */
  async submit() {
    // Wait for submit button to be visible and enabled
    const submitButton = this.page.locator(this.selectors.submitButton).first();
    await submitButton.waitFor({ state: 'visible', timeout: 5000 });
    
    // Check if button is disabled (form validation might be blocking)
    const isDisabled = await submitButton.isDisabled().catch(() => false);
    if (isDisabled) {
      // Validation happens quickly, so wait a short time for it to complete
      // If button stays disabled, it's likely a validation error (which is expected in some tests)
      await this.page.waitForTimeout(300);
      const stillDisabled = await submitButton.isDisabled().catch(() => false);
      if (stillDisabled) {
        // If button is still disabled, try clicking anyway (might trigger validation error)
        // This is useful for testing validation errors
        await submitButton.click({ force: true });
        return;
      }
    }
    
    await submitButton.click();
  }

  /**
   * Click send code button
   */
  async sendCode() {
    await this.click(this.selectors.sendCodeButton);
  }

  /**
   * Switch to sign up mode
   */
  async switchToSignUp() {
    await this.click(this.selectors.signUpLink);
    // Wait for modal title to change to signup mode
    await this.page.waitForFunction(
      () => {
        const title = document.querySelector('.auth-modal__header h2');
        return title && title.textContent.toLowerCase().includes('create account');
      },
      { timeout: 2000 }
    ).catch(() => {
      // Fallback: small timeout if waitForFunction fails
      return this.page.waitForTimeout(100);
    });
  }

  /**
   * Switch to sign in mode
   */
  async switchToSignIn() {
    await this.click(this.selectors.signInLink);
    // Wait for modal title to change to signin mode
    await this.page.waitForFunction(
      () => {
        const title = document.querySelector('.auth-modal__header h2');
        return title && title.textContent.toLowerCase().includes('log in');
      },
      { timeout: 2000 }
    ).catch(() => {
      // Fallback: small timeout if waitForFunction fails
      return this.page.waitForTimeout(100);
    });
  }

  /**
   * Click forgot password link
   */
  async clickForgotPassword() {
    await this.click(this.selectors.forgotPasswordLink);
    // Wait for modal title to change (password reset mode)
    await this.page.waitForFunction(
      () => {
        const title = document.querySelector('.auth-modal__header h2');
        return title && (title.textContent.toLowerCase().includes('send code') || 
                         title.textContent.toLowerCase().includes('reset'));
      },
      { timeout: 2000 }
    ).catch(() => {
      // Fallback: small timeout if waitForFunction fails
      return this.page.waitForTimeout(100);
    });
  }


  /**
   * Perform login with password
   * @param {string} phoneNumber - Phone number in E.164 format or formatted
   * @param {string} password - User password
   */
  async loginWithPassword(phoneNumber, password) {
    // PhoneInput component handles formatting, but we should provide formatted input
    await this.fillPhoneNumber(phoneNumber);
    await this.fillPassword(password);
    await this.submit();
  }

  /**
   * Perform signup
   * @param {string} phoneNumber - Phone number in E.164 format or formatted
   * @param {string} password - User password
   * @param {string} fullName - User's full name
   * @param {string} email - Optional email address
   */
  async signup(phoneNumber, password, fullName, email = '') {
    await this.fillPhoneNumber(phoneNumber);
    await this.fillPassword(password);
    await this.fillFullName(fullName);
    if (email) {
      await this.fillEmail(email);
    }
    await this.submit();
  }

  /**
   * Perform SMS login
   * @param {string} phoneNumber - Phone number in E.164 format or formatted
   * @param {string} code - Verification code
   */
  async loginWithSms(phoneNumber, code) {
    await this.fillPhoneNumber(phoneNumber);
    await this.sendCode();
    // Wait for code input to appear or status message (indicates code was sent)
    await Promise.race([
      this.page.waitForSelector('input[name="code"]', { state: 'visible', timeout: 5000 }).catch(() => null),
      this.page.waitForSelector('.auth-modal__alert.success', { state: 'visible', timeout: 5000 }).catch(() => null),
    ]);
    await this.fillVerificationCode(code);
    await this.submit();
  }

  /**
   * Verify phone number (after signup)
   */
  async verifyPhone(code) {
    await this.fillVerificationCode(code);
    await this.submit();
  }
}
