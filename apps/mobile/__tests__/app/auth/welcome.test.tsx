/**
 * Tests for the Welcome screen.
 * Wireframe: dark navy bg, crown icon, "BEACH LEAGUE" branding,
 * "Get Started" -> signup, "I Already Have an Account" -> login.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

import WelcomeScreen from '../../../app/(auth)/welcome';

describe('WelcomeScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('renders the app title', () => {
    const { getByText } = render(<WelcomeScreen />);
    expect(getByText('BEACH LEAGUE')).toBeTruthy();
  });

  it('renders the crown icon', () => {
    const { getByTestId } = render(<WelcomeScreen />);
    expect(getByTestId('welcome-crown-icon')).toBeTruthy();
  });

  it('renders "Get Started" button', () => {
    const { getByText } = render(<WelcomeScreen />);
    expect(getByText('Get Started')).toBeTruthy();
  });

  it('renders "I Already Have an Account" link', () => {
    const { getByText } = render(<WelcomeScreen />);
    expect(getByText('I Already Have an Account')).toBeTruthy();
  });

  it('navigates to signup when "Get Started" is pressed', () => {
    const { getByText } = render(<WelcomeScreen />);
    fireEvent.press(getByText('Get Started'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/signup');
  });

  it('navigates to login when "I Already Have an Account" is pressed', () => {
    const { getByText } = render(<WelcomeScreen />);
    fireEvent.press(getByText('I Already Have an Account'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
  });

  it('has proper accessibility on the Get Started button', () => {
    const { getByLabelText } = render(<WelcomeScreen />);
    expect(getByLabelText('Get Started')).toBeTruthy();
  });

  it('has proper accessibility on the sign in link', () => {
    const { getByLabelText } = render(<WelcomeScreen />);
    expect(getByLabelText('Sign in to existing account')).toBeTruthy();
  });
});
