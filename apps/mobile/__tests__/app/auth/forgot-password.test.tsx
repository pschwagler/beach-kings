/**
 * Tests for the Forgot Password screen.
 * 3-step flow: enter phone → enter OTP → set new password.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

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

const mockPost = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    client: {
      axiosInstance: {
        post: (...args: unknown[]) => mockPost(...args),
      },
    },
  },
}));

jest.spyOn(Alert, 'alert');

import ForgotPasswordScreen from '../../../app/(auth)/forgot-password';

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Step 1: Enter phone number
  // -----------------------------------------------------------------------

  it('renders TopNav with title "Reset Password"', () => {
    const { getByText } = render(<ForgotPasswordScreen />);
    expect(getByText('Reset Password')).toBeTruthy();
  });

  it('renders phone number input on step 1', () => {
    const { getByPlaceholderText } = render(<ForgotPasswordScreen />);
    expect(getByPlaceholderText('Phone Number')).toBeTruthy();
  });

  it('renders "Send Code" button on step 1', () => {
    const { getByLabelText } = render(<ForgotPasswordScreen />);
    expect(getByLabelText('Send Code')).toBeTruthy();
  });

  it('sends reset request on "Send Code" press', async () => {
    mockPost.mockResolvedValueOnce({
      data: { status: 'success', message: 'Code sent' },
    });

    const { getByPlaceholderText, getByLabelText } = render(
      <ForgotPasswordScreen />,
    );

    fireEvent.changeText(getByPlaceholderText('Phone Number'), '2025551234');
    fireEvent.press(getByLabelText('Send Code'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/auth/reset-password', {
        phone_number: '2025551234',
      });
    });
  });

  it('does not submit step 1 when phone is empty', () => {
    const { getByLabelText } = render(<ForgotPasswordScreen />);
    fireEvent.press(getByLabelText('Send Code'));
    expect(mockPost).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Step 2: Enter OTP code
  // -----------------------------------------------------------------------

  it('advances to OTP step after sending code', async () => {
    mockPost.mockResolvedValueOnce({
      data: { status: 'success', message: 'Code sent' },
    });

    const { getByPlaceholderText, getByLabelText, getAllByLabelText } = render(
      <ForgotPasswordScreen />,
    );

    fireEvent.changeText(getByPlaceholderText('Phone Number'), '2025551234');
    fireEvent.press(getByLabelText('Send Code'));

    await waitFor(() => {
      const cells = getAllByLabelText(/OTP digit/);
      expect(cells).toHaveLength(6);
    });
  });

  it('renders "Verify Code" button on step 2', async () => {
    mockPost.mockResolvedValueOnce({
      data: { status: 'success' },
    });

    const { getByPlaceholderText, getByLabelText } = render(
      <ForgotPasswordScreen />,
    );

    fireEvent.changeText(getByPlaceholderText('Phone Number'), '2025551234');
    fireEvent.press(getByLabelText('Send Code'));

    await waitFor(() => {
      expect(getByLabelText('Verify Code')).toBeTruthy();
    });
  });

  it('verifies OTP and advances to new password step', async () => {
    // Step 1: send code
    mockPost.mockResolvedValueOnce({
      data: { status: 'success' },
    });

    const helpers = render(<ForgotPasswordScreen />);

    fireEvent.changeText(
      helpers.getByPlaceholderText('Phone Number'),
      '2025551234',
    );
    fireEvent.press(helpers.getByLabelText('Send Code'));

    // Step 2: enter OTP
    await waitFor(() => {
      expect(helpers.getAllByLabelText(/OTP digit/)).toHaveLength(6);
    });

    mockPost.mockResolvedValueOnce({
      data: { status: 'success', reset_token: 'test_reset_token' },
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
      expect(mockPost).toHaveBeenCalledWith(
        '/api/auth/reset-password-verify',
        { phone_number: '2025551234', code: '123456' },
      );
    });

    // Step 3 should render new password input
    await waitFor(() => {
      expect(helpers.getByPlaceholderText('New Password')).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // Step 3: Set new password
  // -----------------------------------------------------------------------

  it('submits new password and shows success', async () => {
    // Step 1
    mockPost.mockResolvedValueOnce({ data: { status: 'success' } });
    const helpers = render(<ForgotPasswordScreen />);

    fireEvent.changeText(
      helpers.getByPlaceholderText('Phone Number'),
      '2025551234',
    );
    fireEvent.press(helpers.getByLabelText('Send Code'));

    await waitFor(() => {
      expect(helpers.getAllByLabelText(/OTP digit/)).toHaveLength(6);
    });

    // Step 2
    mockPost.mockResolvedValueOnce({
      data: { status: 'success', reset_token: 'test_reset_token' },
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

    // Step 3
    mockPost.mockResolvedValueOnce({
      data: { access_token: 'at', refresh_token: 'rt', user_id: 1 },
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
      expect(mockPost).toHaveBeenCalledWith(
        '/api/auth/reset-password-confirm',
        { reset_token: 'test_reset_token', new_password: 'NewPass123!' },
      );
    });
  });

  it('shows alert when passwords do not match', async () => {
    // Navigate to step 3
    mockPost.mockResolvedValueOnce({ data: { status: 'success' } });
    const helpers = render(<ForgotPasswordScreen />);

    fireEvent.changeText(
      helpers.getByPlaceholderText('Phone Number'),
      '2025551234',
    );
    fireEvent.press(helpers.getByLabelText('Send Code'));

    await waitFor(() => {
      expect(helpers.getAllByLabelText(/OTP digit/)).toHaveLength(6);
    });

    mockPost.mockResolvedValueOnce({
      data: { status: 'success', reset_token: 'tok' },
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
      expect(Alert.alert).toHaveBeenCalledWith(
        'Passwords Do Not Match',
        expect.any(String),
      );
    });
  });

  it('shows alert on send code failure', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network error'));

    const { getByPlaceholderText, getByLabelText } = render(
      <ForgotPasswordScreen />,
    );

    fireEvent.changeText(getByPlaceholderText('Phone Number'), '2025551234');
    fireEvent.press(getByLabelText('Send Code'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        expect.any(String),
      );
    });
  });

  it('renders "Back to Sign In" link', () => {
    const { getByText } = render(<ForgotPasswordScreen />);
    expect(getByText(/back to sign in/i)).toBeTruthy();
  });
});
