/**
 * Tests for the enhanced Signup screen.
 * Wireframe: Google+Apple at TOP, OR divider, first/last names,
 * email, password with hint, "Create Account", legal text.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, KeyboardAvoidingView } from 'react-native';

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
  hapticHeavy: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticError: jest.fn(),
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const mockSignup = jest.fn();
const mockLoginWithGoogle = jest.fn();
const mockLoginWithApple = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    signup: mockSignup,
    loginWithGoogle: mockLoginWithGoogle,
    loginWithApple: mockLoginWithApple,
  }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.spyOn(Alert, 'alert');

import SignupScreen from '../../../app/(auth)/signup';

/** The Create Account button (not the TopNav header). */
function getCreateButton(helpers: ReturnType<typeof render>) {
  return helpers.getByLabelText('Create Account');
}

describe('SignupScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Google OAuth button at the top', () => {
    const { getByText } = render(<SignupScreen />);
    expect(getByText('Continue with Google')).toBeTruthy();
  });

  it('renders Apple OAuth button on iOS when available', async () => {
    const AppleAuth = require('expo-apple-authentication');
    (AppleAuth.isAvailableAsync as jest.Mock).mockResolvedValueOnce(true);
    const Platform = require('react-native').Platform;
    Platform.OS = 'ios';
    const { findByText } = render(<SignupScreen />);
    expect(await findByText('Continue with Apple')).toBeTruthy();
  });

  it('renders OR divider', () => {
    const { getByText } = render(<SignupScreen />);
    expect(getByText('OR')).toBeTruthy();
  });

  it('renders name inputs', () => {
    const { getByPlaceholderText } = render(<SignupScreen />);
    expect(getByPlaceholderText('First Name')).toBeTruthy();
    expect(getByPlaceholderText('Last Name')).toBeTruthy();
  });

  it('renders email input', () => {
    const { getByPlaceholderText } = render(<SignupScreen />);
    expect(getByPlaceholderText('Email')).toBeTruthy();
  });

  it('does not render a phone input', () => {
    const { queryByPlaceholderText } = render(<SignupScreen />);
    expect(queryByPlaceholderText('Phone Number')).toBeNull();
  });

  it('renders password input', () => {
    const { getByPlaceholderText } = render(<SignupScreen />);
    expect(getByPlaceholderText('Password')).toBeTruthy();
  });

  it('renders Create Account button', () => {
    const result = render(<SignupScreen />);
    expect(getCreateButton(result)).toBeTruthy();
  });

  it('renders legal text', () => {
    const { getByText } = render(<SignupScreen />);
    expect(getByText(/terms of service/i)).toBeTruthy();
  });

  it('calls signup with correct params and navigates to verify', async () => {
    mockSignup.mockResolvedValueOnce(undefined);
    const result = render(<SignupScreen />);

    fireEvent.changeText(result.getByPlaceholderText('First Name'), 'John');
    fireEvent.changeText(result.getByPlaceholderText('Last Name'), 'Doe');
    fireEvent.changeText(result.getByPlaceholderText('Email'), 'john@example.com');
    fireEvent.changeText(result.getByPlaceholderText('Password'), 'StrongPass1!');
    fireEvent.press(getCreateButton(result));

    await waitFor(() => {
      expect(mockSignup).toHaveBeenCalledWith({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'StrongPass1!',
      });
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(auth)/verify',
        params: { email: 'john@example.com' },
      });
    });
  });

  it('does not submit when required fields are empty', () => {
    const result = render(<SignupScreen />);
    fireEvent.press(getCreateButton(result));
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it('shows alert on signup failure', async () => {
    mockSignup.mockRejectedValueOnce(new Error('fail'));
    const result = render(<SignupScreen />);

    fireEvent.changeText(result.getByPlaceholderText('First Name'), 'John');
    fireEvent.changeText(result.getByPlaceholderText('Last Name'), 'Doe');
    fireEvent.changeText(result.getByPlaceholderText('Email'), 'john@example.com');
    fireEvent.changeText(result.getByPlaceholderText('Password'), 'StrongPass1!');
    fireEvent.press(getCreateButton(result));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Signup Failed',
        expect.any(String),
      );
    });
  });

  it('renders "Sign In" link for existing users', () => {
    const { getByText } = render(<SignupScreen />);
    expect(getByText('Sign In')).toBeTruthy();
  });

  it('calls hapticError on signup failure', async () => {
    const { hapticError } = require('@/utils/haptics');
    mockSignup.mockRejectedValueOnce(new Error('fail'));
    const result = render(<SignupScreen />);

    fireEvent.changeText(result.getByPlaceholderText('First Name'), 'John');
    fireEvent.changeText(result.getByPlaceholderText('Last Name'), 'Doe');
    fireEvent.changeText(result.getByPlaceholderText('Email'), 'john@example.com');
    fireEvent.changeText(result.getByPlaceholderText('Password'), 'StrongPass1!');
    fireEvent.press(getCreateButton(result));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Signup Failed', expect.any(String));
    });
    expect(hapticError).toHaveBeenCalledTimes(1);
  });

  it('does NOT call hapticError on successful signup', async () => {
    const { hapticError } = require('@/utils/haptics');
    mockSignup.mockResolvedValueOnce(undefined);
    const result = render(<SignupScreen />);

    fireEvent.changeText(result.getByPlaceholderText('First Name'), 'John');
    fireEvent.changeText(result.getByPlaceholderText('Last Name'), 'Doe');
    fireEvent.changeText(result.getByPlaceholderText('Email'), 'john@example.com');
    fireEvent.changeText(result.getByPlaceholderText('Password'), 'StrongPass1!');
    fireEvent.press(getCreateButton(result));

    await waitFor(() => {
      expect(mockSignup).toHaveBeenCalled();
    });
    expect(hapticError).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // H1 — KeyboardAvoidingView structural check
  // -------------------------------------------------------------------------

  it('wraps content in KeyboardAvoidingView after TopNav', () => {
    const { UNSAFE_getAllByType } = render(<SignupScreen />);
    const kavInstances = UNSAFE_getAllByType(KeyboardAvoidingView);
    expect(kavInstances.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // P1 — Password toggle
  // -------------------------------------------------------------------------

  it('password field renders as secure by default', () => {
    const { getByPlaceholderText } = render(<SignupScreen />);
    const passwordInput = getByPlaceholderText('Password');
    expect(passwordInput.props.secureTextEntry).toBe(true);
  });

  it('pressing show-password toggle reveals the password', () => {
    const { getByPlaceholderText, getByLabelText } = render(<SignupScreen />);
    expect(getByPlaceholderText('Password').props.secureTextEntry).toBe(true);
    fireEvent.press(getByLabelText('Show password'));
    expect(getByPlaceholderText('Password').props.secureTextEntry).toBe(false);
  });

  it('toggle button changes a11y label after pressing', () => {
    const { getByLabelText } = render(<SignupScreen />);
    fireEvent.press(getByLabelText('Show password'));
    expect(getByLabelText('Hide password')).toBeTruthy();
  });
});
