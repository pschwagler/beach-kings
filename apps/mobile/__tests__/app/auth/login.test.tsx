/**
 * Tests for the enhanced Login screen.
 * Wireframe: TopNav back->welcome, email input, password,
 * "Forgot Password?" link, "Log In" button, OR divider,
 * Google + Apple OAuth buttons.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

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

/** The Sign In button (not the TopNav header). */
function getSignInButton(helpers: ReturnType<typeof render>) {
  return helpers.getByLabelText('Sign In');
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

  it('renders the Sign In button', () => {
    const result = render(<LoginScreen />);
    expect(getSignInButton(result)).toBeTruthy();
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

  it('renders Apple sign in button', () => {
    const { getByText } = render(<LoginScreen />);
    expect(getByText('Continue with Apple')).toBeTruthy();
  });

  it('calls login with email params on Sign In press', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    const result = render(<LoginScreen />);

    fireEvent.changeText(result.getByPlaceholderText('Email'), 'test@example.com');
    fireEvent.changeText(result.getByPlaceholderText('Password'), 'password123');
    fireEvent.press(getSignInButton(result));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });

  it('shows alert on login failure', async () => {
    mockLogin.mockRejectedValueOnce(new Error('fail'));
    const result = render(<LoginScreen />);

    fireEvent.changeText(result.getByPlaceholderText('Email'), 'test@example.com');
    fireEvent.changeText(result.getByPlaceholderText('Password'), 'wrong');
    fireEvent.press(getSignInButton(result));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Login Failed',
        expect.stringContaining('Invalid'),
      );
    });
  });

  it('does not submit when fields are empty', () => {
    const result = render(<LoginScreen />);
    fireEvent.press(getSignInButton(result));
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('renders "Sign Up" link for new users', () => {
    const { getByText } = render(<LoginScreen />);
    expect(getByText('Sign Up')).toBeTruthy();
  });
});
