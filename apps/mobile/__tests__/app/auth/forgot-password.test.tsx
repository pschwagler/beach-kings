/**
 * Tests for the Forgot Password screen.
 * 3-step flow with method toggle: email (default) or phone → OTP → new password.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert, KeyboardAvoidingView } from 'react-native';

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
  hapticHeavy: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticError: jest.fn(),
}));

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({}),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

const mockResetPassword = jest.fn();
const mockResetPasswordVerify = jest.fn();
const mockResetPasswordConfirm = jest.fn();
const mockResetPasswordEmail = jest.fn();
const mockResetPasswordEmailVerify = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    resetPassword: (...args: unknown[]) => mockResetPassword(...args),
    resetPasswordVerify: (...args: unknown[]) =>
      mockResetPasswordVerify(...args),
    resetPasswordConfirm: (...args: unknown[]) =>
      mockResetPasswordConfirm(...args),
    resetPasswordEmail: (...args: unknown[]) => mockResetPasswordEmail(...args),
    resetPasswordEmailVerify: (...args: unknown[]) =>
      mockResetPasswordEmailVerify(...args),
  },
}));

jest.spyOn(Alert, 'alert');

import ForgotPasswordScreen from '../../../app/(auth)/forgot-password';

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Step 1 (default — email)
  // -----------------------------------------------------------------------

  it('renders TopNav with title "Reset Password"', () => {
    const { getByText } = render(<ForgotPasswordScreen />);
    expect(getByText('Reset Password')).toBeTruthy();
  });

  it('defaults to the email method with an email input', () => {
    const { getByPlaceholderText } = render(<ForgotPasswordScreen />);
    expect(getByPlaceholderText('Email')).toBeTruthy();
  });

  it('renders method toggle (Email / Phone)', () => {
    const { getByLabelText } = render(<ForgotPasswordScreen />);
    expect(getByLabelText('Use email to reset password')).toBeTruthy();
    expect(getByLabelText('Use phone number to reset password')).toBeTruthy();
  });

  it('renders phone number input after toggling to Phone', () => {
    const { getByLabelText, getByPlaceholderText } = render(
      <ForgotPasswordScreen />,
    );
    fireEvent.press(getByLabelText('Use phone number to reset password'));
    expect(getByPlaceholderText('Phone Number')).toBeTruthy();
  });

  it('renders "Send Code" button on step 1', () => {
    const { getByLabelText } = render(<ForgotPasswordScreen />);
    expect(getByLabelText('Send Code')).toBeTruthy();
  });

  it('sends email reset request on "Send Code" press (default)', async () => {
    mockResetPasswordEmail.mockResolvedValueOnce({
      status: 'success',
      message: 'Code sent',
    });

    const { getByPlaceholderText, getByLabelText } = render(
      <ForgotPasswordScreen />,
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'user@example.com');
    fireEvent.press(getByLabelText('Send Code'));

    await waitFor(() => {
      expect(mockResetPasswordEmail).toHaveBeenCalledWith('user@example.com');
    });
  });

  it('sends phone reset request after toggling to Phone', async () => {
    mockResetPassword.mockResolvedValueOnce({
      status: 'success',
      message: 'Code sent',
    });

    const { getByPlaceholderText, getByLabelText } = render(
      <ForgotPasswordScreen />,
    );
    fireEvent.press(getByLabelText('Use phone number to reset password'));
    fireEvent.changeText(getByPlaceholderText('Phone Number'), '2025551234');
    fireEvent.press(getByLabelText('Send Code'));

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith('2025551234');
    });
  });

  it('does not submit step 1 when email is empty', () => {
    const { getByLabelText } = render(<ForgotPasswordScreen />);
    fireEvent.press(getByLabelText('Send Code'));
    expect(mockResetPasswordEmail).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Step 2 — OTP
  // -----------------------------------------------------------------------

  it('advances to OTP step after sending email code', async () => {
    mockResetPasswordEmail.mockResolvedValueOnce({ status: 'success' });

    const { getByPlaceholderText, getByLabelText, getAllByLabelText } = render(
      <ForgotPasswordScreen />,
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'user@example.com');
    fireEvent.press(getByLabelText('Send Code'));

    await waitFor(() => {
      const cells = getAllByLabelText(/OTP digit/);
      expect(cells).toHaveLength(6);
    });
  });

  it('renders "Verify Code" button on step 2', async () => {
    mockResetPasswordEmail.mockResolvedValueOnce({ status: 'success' });

    const { getByPlaceholderText, getByLabelText } = render(
      <ForgotPasswordScreen />,
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'user@example.com');
    fireEvent.press(getByLabelText('Send Code'));

    await waitFor(() => {
      expect(getByLabelText('Verify Code')).toBeTruthy();
    });
  });

  it('verifies email OTP and advances to new password step', async () => {
    mockResetPasswordEmail.mockResolvedValueOnce({ status: 'success' });
    mockResetPasswordEmailVerify.mockResolvedValueOnce({
      status: 'success',
      reset_token: 'test_reset_token',
    });

    const helpers = render(<ForgotPasswordScreen />);

    fireEvent.changeText(
      helpers.getByPlaceholderText('Email'),
      'user@example.com',
    );
    fireEvent.press(helpers.getByLabelText('Send Code'));

    await waitFor(() => {
      expect(helpers.getAllByLabelText(/OTP digit/)).toHaveLength(6);
    });

    const cells = helpers.getAllByLabelText(/OTP digit/);
    fireEvent.changeText(cells[0], '1');
    fireEvent.changeText(cells[1], '2');
    fireEvent.changeText(cells[2], '3');
    fireEvent.changeText(cells[3], '4');
    fireEvent.changeText(cells[4], '5');
    fireEvent.changeText(cells[5], '6');

    fireEvent.press(helpers.getByLabelText('Verify Code'));

    await waitFor(() => {
      expect(mockResetPasswordEmailVerify).toHaveBeenCalledWith(
        'user@example.com',
        '123456',
      );
    });

    await waitFor(() => {
      expect(helpers.getByPlaceholderText('New Password')).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // Step 3 — Set new password
  // -----------------------------------------------------------------------

  it('submits new password and shows success', async () => {
    mockResetPasswordEmail.mockResolvedValueOnce({ status: 'success' });
    mockResetPasswordEmailVerify.mockResolvedValueOnce({
      status: 'success',
      reset_token: 'test_reset_token',
    });
    mockResetPasswordConfirm.mockResolvedValueOnce({
      access_token: 'at',
      refresh_token: 'rt',
      user_id: 1,
    });

    const helpers = render(<ForgotPasswordScreen />);

    fireEvent.changeText(
      helpers.getByPlaceholderText('Email'),
      'user@example.com',
    );
    fireEvent.press(helpers.getByLabelText('Send Code'));

    await waitFor(() => {
      expect(helpers.getAllByLabelText(/OTP digit/)).toHaveLength(6);
    });

    const cells = helpers.getAllByLabelText(/OTP digit/);
    fireEvent.changeText(cells[0], '1');
    fireEvent.changeText(cells[1], '2');
    fireEvent.changeText(cells[2], '3');
    fireEvent.changeText(cells[3], '4');
    fireEvent.changeText(cells[4], '5');
    fireEvent.changeText(cells[5], '6');
    fireEvent.press(helpers.getByLabelText('Verify Code'));

    await waitFor(() => {
      expect(helpers.getByPlaceholderText('New Password')).toBeTruthy();
    });

    fireEvent.changeText(
      helpers.getByPlaceholderText('New Password'),
      'NewPass123!',
    );
    fireEvent.changeText(
      helpers.getByPlaceholderText('Confirm Password'),
      'NewPass123!',
    );
    fireEvent.press(helpers.getByLabelText('Reset Password'));

    await waitFor(() => {
      expect(mockResetPasswordConfirm).toHaveBeenCalledWith(
        'test_reset_token',
        'NewPass123!',
      );
    });
  });

  it('shows inline error when passwords do not match', async () => {
    mockResetPasswordEmail.mockResolvedValueOnce({ status: 'success' });
    mockResetPasswordEmailVerify.mockResolvedValueOnce({
      status: 'success',
      reset_token: 'tok',
    });

    const helpers = render(<ForgotPasswordScreen />);

    fireEvent.changeText(
      helpers.getByPlaceholderText('Email'),
      'user@example.com',
    );
    fireEvent.press(helpers.getByLabelText('Send Code'));

    await waitFor(() => {
      expect(helpers.getAllByLabelText(/OTP digit/)).toHaveLength(6);
    });

    const cells = helpers.getAllByLabelText(/OTP digit/);
    fireEvent.changeText(cells[0], '1');
    fireEvent.changeText(cells[1], '2');
    fireEvent.changeText(cells[2], '3');
    fireEvent.changeText(cells[3], '4');
    fireEvent.changeText(cells[4], '5');
    fireEvent.changeText(cells[5], '6');
    fireEvent.press(helpers.getByLabelText('Verify Code'));

    await waitFor(() => {
      expect(helpers.getByPlaceholderText('New Password')).toBeTruthy();
    });

    fireEvent.changeText(
      helpers.getByPlaceholderText('New Password'),
      'Password1!',
    );
    fireEvent.changeText(
      helpers.getByPlaceholderText('Confirm Password'),
      'Different1!',
    );
    fireEvent.press(helpers.getByLabelText('Reset Password'));

    await waitFor(() => {
      expect(helpers.getByText(/passwords do not match/i)).toBeTruthy();
    });
    expect(mockResetPasswordConfirm).not.toHaveBeenCalled();
  });

  it('shows alert on send code failure', async () => {
    mockResetPasswordEmail.mockRejectedValueOnce(new Error('Network error'));

    const { getByPlaceholderText, getByLabelText } = render(
      <ForgotPasswordScreen />,
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'user@example.com');
    fireEvent.press(getByLabelText('Send Code'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String));
    });
  });

  it('renders "Back to Sign In" link', () => {
    const { getByText } = render(<ForgotPasswordScreen />);
    expect(getByText(/back to sign in/i)).toBeTruthy();
  });

  it('calls hapticError when send code fails', async () => {
    const { hapticError } = require('@/utils/haptics');
    mockResetPasswordEmail.mockRejectedValueOnce(new Error('Network error'));

    const { getByPlaceholderText, getByLabelText } = render(<ForgotPasswordScreen />);
    fireEvent.changeText(getByPlaceholderText('Email'), 'user@example.com');
    fireEvent.press(getByLabelText('Send Code'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String));
    });
    expect(hapticError).toHaveBeenCalledTimes(1);
  });

  it('calls hapticSuccess after successful password reset', async () => {
    const { hapticSuccess } = require('@/utils/haptics');
    mockResetPasswordEmail.mockResolvedValueOnce({ status: 'success' });
    mockResetPasswordEmailVerify.mockResolvedValueOnce({
      status: 'success',
      reset_token: 'tok',
    });
    mockResetPasswordConfirm.mockResolvedValueOnce({
      access_token: 'at',
      refresh_token: 'rt',
      user_id: 1,
    });

    const helpers = render(<ForgotPasswordScreen />);

    fireEvent.changeText(helpers.getByPlaceholderText('Email'), 'user@example.com');
    fireEvent.press(helpers.getByLabelText('Send Code'));

    await waitFor(() => {
      expect(helpers.getAllByLabelText(/OTP digit/)).toHaveLength(6);
    });

    const cells = helpers.getAllByLabelText(/OTP digit/);
    cells.forEach((cell, i) => fireEvent.changeText(cell, String(i + 1)));
    fireEvent.press(helpers.getByLabelText('Verify Code'));

    await waitFor(() => {
      expect(helpers.getByPlaceholderText('New Password')).toBeTruthy();
    });

    fireEvent.changeText(helpers.getByPlaceholderText('New Password'), 'NewPass1!');
    fireEvent.changeText(helpers.getByPlaceholderText('Confirm Password'), 'NewPass1!');
    fireEvent.press(helpers.getByLabelText('Reset Password'));

    await waitFor(() => {
      expect(mockResetPasswordConfirm).toHaveBeenCalled();
    });
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // H1 — KeyboardAvoidingView structural check
  // -------------------------------------------------------------------------

  it('wraps content in KeyboardAvoidingView after TopNav', () => {
    const { UNSAFE_getAllByType } = render(<ForgotPasswordScreen />);
    const kavInstances = UNSAFE_getAllByType(KeyboardAvoidingView);
    expect(kavInstances.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // H2 — Resend button with countdown on OTP step
  // -------------------------------------------------------------------------

  /** UI-only helper: advance from 'request' step to 'otp' step.
   * Callers MUST set up mockResetPasswordEmail before calling this. */
  async function advanceToOtpStep(helpers: ReturnType<typeof render>) {
    fireEvent.changeText(helpers.getByPlaceholderText('Email'), 'user@example.com');
    fireEvent.press(helpers.getByLabelText('Send Code'));
    await waitFor(() => {
      expect(helpers.getAllByLabelText(/OTP digit/)).toHaveLength(6);
    });
  }

  it('shows resend link on OTP step', async () => {
    mockResetPasswordEmail.mockResolvedValueOnce({ status: 'success' });
    const helpers = render(<ForgotPasswordScreen />);
    await advanceToOtpStep(helpers);
    expect(helpers.getByText(/resend/i)).toBeTruthy();
  });

  it('calls resetPasswordEmail again when resend pressed (email mode)', async () => {
    // First value: initial send; second value: resend
    mockResetPasswordEmail
      .mockResolvedValueOnce({ status: 'success' })
      .mockResolvedValueOnce({ status: 'success' });

    const helpers = render(<ForgotPasswordScreen />);
    await advanceToOtpStep(helpers);

    await act(async () => {
      fireEvent.press(helpers.getByText(/resend/i));
    });

    expect(mockResetPasswordEmail).toHaveBeenCalledTimes(2);
  });

  it('shows countdown after resend is pressed', async () => {
    // First value: initial send; second value: resend
    mockResetPasswordEmail
      .mockResolvedValueOnce({ status: 'success' })
      .mockResolvedValueOnce({ status: 'success' });

    const helpers = render(<ForgotPasswordScreen />);
    await advanceToOtpStep(helpers);

    await act(async () => {
      fireEvent.press(helpers.getByText(/resend/i));
    });

    // After a successful resend, the countdown state is set — verify the text changes.
    await waitFor(() => {
      expect(helpers.getByText(/resend.*\d+/i)).toBeTruthy();
    });
  });

  it('calls hapticError when resend fails', async () => {
    const { hapticError } = require('@/utils/haptics');
    // First value: initial send; second value: resend (fails)
    mockResetPasswordEmail
      .mockResolvedValueOnce({ status: 'success' })
      .mockRejectedValueOnce(new Error('Network error'));

    const helpers = render(<ForgotPasswordScreen />);
    await advanceToOtpStep(helpers);

    await act(async () => {
      fireEvent.press(helpers.getByText(/Didn't receive/i));
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String));
    });
    expect(hapticError).toHaveBeenCalled();
  });

  it('resend calls resetPassword in phone mode', async () => {
    // First value: initial send; second value: resend
    mockResetPassword
      .mockResolvedValueOnce({ status: 'success' })
      .mockResolvedValueOnce({ status: 'success' });

    const helpers = render(<ForgotPasswordScreen />);
    fireEvent.press(helpers.getByLabelText('Use phone number to reset password'));
    fireEvent.changeText(helpers.getByPlaceholderText('Phone Number'), '2025551234');
    fireEvent.press(helpers.getByLabelText('Send Code'));

    await waitFor(() => {
      expect(helpers.getAllByLabelText(/OTP digit/)).toHaveLength(6);
    });

    await act(async () => {
      fireEvent.press(helpers.getByText(/resend/i));
    });

    expect(mockResetPassword).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // P1 — Password toggle on new-password step
  // -------------------------------------------------------------------------

  async function advanceToNewPasswordStep(helpers: ReturnType<typeof render>) {
    mockResetPasswordEmail.mockResolvedValueOnce({ status: 'success' });
    mockResetPasswordEmailVerify.mockResolvedValueOnce({
      status: 'success',
      reset_token: 'tok',
    });
    fireEvent.changeText(helpers.getByPlaceholderText('Email'), 'user@example.com');
    fireEvent.press(helpers.getByLabelText('Send Code'));

    await waitFor(() => {
      expect(helpers.getAllByLabelText(/OTP digit/)).toHaveLength(6);
    });

    const cells = helpers.getAllByLabelText(/OTP digit/);
    cells.forEach((cell, i) => fireEvent.changeText(cell, String(i + 1)));
    fireEvent.press(helpers.getByLabelText('Verify Code'));

    await waitFor(() => {
      expect(helpers.getByPlaceholderText('New Password')).toBeTruthy();
    });
  }

  it('new password field is secure by default', async () => {
    const helpers = render(<ForgotPasswordScreen />);
    await advanceToNewPasswordStep(helpers);
    expect(helpers.getByPlaceholderText('New Password').props.secureTextEntry).toBe(true);
  });

  it('toggle reveals new password', async () => {
    const helpers = render(<ForgotPasswordScreen />);
    await advanceToNewPasswordStep(helpers);
    const toggles = helpers.getAllByLabelText('Show password');
    fireEvent.press(toggles[0]);
    expect(helpers.getByPlaceholderText('New Password').props.secureTextEntry).toBe(false);
  });

  it('confirm password field is secure by default', async () => {
    const helpers = render(<ForgotPasswordScreen />);
    await advanceToNewPasswordStep(helpers);
    expect(helpers.getByPlaceholderText('Confirm Password').props.secureTextEntry).toBe(true);
  });
});
