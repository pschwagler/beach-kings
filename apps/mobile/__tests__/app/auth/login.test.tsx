/**
 * Tests for the Login screen.
 * Wireframe: TopNav back->welcome, email input, password,
 * "Forgot Password?" link, "Log In" button, OR divider,
 * Google + Apple OAuth buttons.
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

const mockLogin = jest.fn();
const mockLoginWithGoogle = jest.fn();
const mockLoginWithApple = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    loginWithGoogle: mockLoginWithGoogle,
    loginWithApple: mockLoginWithApple,
  }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.spyOn(Alert, 'alert');

import LoginScreen from '../../../app/(auth)/login';

/** The Log In button (not the TopNav header). */
function getLogInButton(helpers: ReturnType<typeof render>) {
  return helpers.getByLabelText('Log In');
}

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders email and password inputs', () => {
    const { getByPlaceholderText } = render(<LoginScreen />);
    expect(getByPlaceholderText('Email')).toBeTruthy();
    expect(getByPlaceholderText('Password')).toBeTruthy();
  });

  it('renders "Log In" text (button title and/or nav title) but not "Sign In"', () => {
    const result = render(<LoginScreen />);
    // At least one "Log In" text should appear (button and/or nav title)
    expect(result.getAllByText('Log In').length).toBeGreaterThanOrEqual(1);
    // "Sign In" must not appear as button/heading text (standalone, not part of "Sign Up")
    expect(result.queryByText('Sign In')).toBeNull();
  });

  it('renders "Forgot Password?" link', () => {
    const { getByText } = render(<LoginScreen />);
    expect(getByText('Forgot Password?')).toBeTruthy();
  });

  it('navigates to forgot-password when link is pressed', () => {
    const { getByText } = render(<LoginScreen />);
    fireEvent.press(getByText('Forgot Password?'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/forgot-password');
  });

  it('renders OR divider text', () => {
    const { getByText } = render(<LoginScreen />);
    expect(getByText('OR')).toBeTruthy();
  });

  it('renders Google sign in button', () => {
    const { getByText } = render(<LoginScreen />);
    expect(getByText('Continue with Google')).toBeTruthy();
  });

  it('renders Apple sign in button on iOS when available', async () => {
    const AppleAuth = require('expo-apple-authentication');
    (AppleAuth.isAvailableAsync as jest.Mock).mockResolvedValueOnce(true);
    const OriginalPlatform = require('react-native').Platform;
    OriginalPlatform.OS = 'ios';
    const { getByText, findByText } = render(<LoginScreen />);
    expect(getByText('Continue with Google')).toBeTruthy();
    expect(await findByText('Continue with Apple')).toBeTruthy();
  });

  it('calls login with email params on Log In press', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    const result = render(<LoginScreen />);

    fireEvent.changeText(result.getByPlaceholderText('Email'), 'test@example.com');
    fireEvent.changeText(result.getByPlaceholderText('Password'), 'password123');
    fireEvent.press(getLogInButton(result));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });

  it('does not call console.log during a successful submit', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockLogin.mockResolvedValueOnce(undefined);
    const result = render(<LoginScreen />);

    fireEvent.changeText(result.getByPlaceholderText('Email'), 'test@example.com');
    fireEvent.changeText(result.getByPlaceholderText('Password'), 'password123');
    fireEvent.press(getLogInButton(result));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalled();
    });
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('does not call console.log when login fails', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockLogin.mockRejectedValueOnce(new Error('fail'));
    const result = render(<LoginScreen />);

    fireEvent.changeText(result.getByPlaceholderText('Email'), 'test@example.com');
    fireEvent.changeText(result.getByPlaceholderText('Password'), 'wrongpass');
    fireEvent.press(getLogInButton(result));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
    });
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('shows alert on login failure', async () => {
    mockLogin.mockRejectedValueOnce(new Error('fail'));
    const result = render(<LoginScreen />);

    fireEvent.changeText(result.getByPlaceholderText('Email'), 'test@example.com');
    fireEvent.changeText(result.getByPlaceholderText('Password'), 'wrongpass');
    fireEvent.press(getLogInButton(result));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Login Failed',
        expect.stringContaining('Invalid'),
      );
    });
  });

  it('does not submit when fields are empty', () => {
    const result = render(<LoginScreen />);
    fireEvent.press(getLogInButton(result));
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('renders "Sign Up" link for new users', () => {
    const { getByText } = render(<LoginScreen />);
    expect(getByText('Sign Up')).toBeTruthy();
  });

  it('does NOT call hapticError on successful login', async () => {
    const { hapticError } = require('@/utils/haptics');
    mockLogin.mockResolvedValueOnce(undefined);
    const result = render(<LoginScreen />);

    fireEvent.changeText(result.getByPlaceholderText('Email'), 'test@example.com');
    fireEvent.changeText(result.getByPlaceholderText('Password'), 'password123');
    fireEvent.press(getLogInButton(result));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalled();
    });
    expect(hapticError).not.toHaveBeenCalled();
  });

  it('calls hapticError on login failure', async () => {
    const { hapticError } = require('@/utils/haptics');
    mockLogin.mockRejectedValueOnce(new Error('fail'));
    const result = render(<LoginScreen />);

    fireEvent.changeText(result.getByPlaceholderText('Email'), 'test@example.com');
    fireEvent.changeText(result.getByPlaceholderText('Password'), 'wrongpass');
    fireEvent.press(getLogInButton(result));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Login Failed', expect.any(String));
    });
    expect(hapticError).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // H1 — KeyboardAvoidingView structural check
  // -------------------------------------------------------------------------

  it('wraps content in KeyboardAvoidingView after TopNav', () => {
    const { UNSAFE_getAllByType } = render(<LoginScreen />);
    const kavInstances = UNSAFE_getAllByType(KeyboardAvoidingView);
    expect(kavInstances.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // P1 — Password toggle
  // -------------------------------------------------------------------------

  it('password field renders as secure by default', () => {
    const { getByPlaceholderText } = render(<LoginScreen />);
    const passwordInput = getByPlaceholderText('Password');
    expect(passwordInput.props.secureTextEntry).toBe(true);
  });

  it('pressing show-password toggle reveals the password', () => {
    const { getByPlaceholderText, getByLabelText } = render(<LoginScreen />);
    const passwordInput = getByPlaceholderText('Password');
    expect(passwordInput.props.secureTextEntry).toBe(true);
    fireEvent.press(getByLabelText('Show password'));
    expect(getByPlaceholderText('Password').props.secureTextEntry).toBe(false);
  });

  it('toggle button changes a11y label after pressing', () => {
    const { getByLabelText } = render(<LoginScreen />);
    fireEvent.press(getByLabelText('Show password'));
    expect(getByLabelText('Hide password')).toBeTruthy();
  });
});
