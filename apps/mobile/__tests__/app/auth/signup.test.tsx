/**
 * Tests for the enhanced Signup screen.
 * Wireframe: Google+Apple at TOP, OR divider, first/last names,
 * phone, email (optional), password with hint, "Create Account", legal text.
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

  it('renders Google and Apple OAuth buttons at the top', () => {
    const { getByText } = render(<SignupScreen />);
    expect(getByText('Continue with Google')).toBeTruthy();
    expect(getByText('Continue with Apple')).toBeTruthy();
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

  it('renders phone input', () => {
    const { getByPlaceholderText } = render(<SignupScreen />);
    expect(getByPlaceholderText('Phone Number')).toBeTruthy();
  });

  it('renders email input (optional)', () => {
    const { getByPlaceholderText } = render(<SignupScreen />);
    expect(getByPlaceholderText('Email (optional)')).toBeTruthy();
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

  it('calls signup with correct params', async () => {
    mockSignup.mockResolvedValueOnce(undefined);
    const result = render(<SignupScreen />);

    fireEvent.changeText(result.getByPlaceholderText('First Name'), 'John');
    fireEvent.changeText(result.getByPlaceholderText('Last Name'), 'Doe');
    fireEvent.changeText(result.getByPlaceholderText('Phone Number'), '2025551234');
    fireEvent.changeText(result.getByPlaceholderText('Email (optional)'), 'john@example.com');
    fireEvent.changeText(result.getByPlaceholderText('Password'), 'StrongPass1!');
    fireEvent.press(getCreateButton(result));

    await waitFor(() => {
      expect(mockSignup).toHaveBeenCalledWith({
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '2025551234',
        email: 'john@example.com',
        password: 'StrongPass1!',
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
    fireEvent.changeText(result.getByPlaceholderText('Phone Number'), '2025551234');
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
});
