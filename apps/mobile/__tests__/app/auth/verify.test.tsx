/**
 * Tests for the Verify (OTP) screen.
 * Flow: user enters 6-digit code sent to their phone,
 * with a resend option and countdown timer.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
  useLocalSearchParams: () => ({ phone: '+12025551234' }),
}));

const mockVerifyPhone = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    verifyPhone: mockVerifyPhone,
  }),
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

import VerifyScreen from '../../../app/(auth)/verify';

describe('VerifyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the TopNav with title "Verify Phone"', () => {
    const { getByText } = render(<VerifyScreen />);
    expect(getByText('Verify Phone')).toBeTruthy();
  });

  it('renders instruction text with masked phone number', () => {
    const { getByText } = render(<VerifyScreen />);
    expect(getByText(/code.*1234/i)).toBeTruthy();
  });

  it('renders 6 OTP input cells', () => {
    const { getAllByLabelText } = render(<VerifyScreen />);
    const cells = getAllByLabelText(/OTP digit/);
    expect(cells).toHaveLength(6);
  });

  it('renders Verify button', () => {
    const { getByLabelText } = render(<VerifyScreen />);
    expect(getByLabelText('Verify')).toBeTruthy();
  });

  it('renders resend code link', () => {
    const { getByText } = render(<VerifyScreen />);
    expect(getByText(/resend/i)).toBeTruthy();
  });

  it('calls verifyPhone with phone and code on submit', async () => {
    mockVerifyPhone.mockResolvedValueOnce(undefined);
    const { getAllByLabelText, getByLabelText } = render(<VerifyScreen />);

    const cells = getAllByLabelText(/OTP digit/);
    // Type each digit
    fireEvent.changeText(cells[0], '1');
    fireEvent.changeText(cells[1], '2');
    fireEvent.changeText(cells[2], '3');
    fireEvent.changeText(cells[3], '4');
    fireEvent.changeText(cells[4], '5');
    fireEvent.changeText(cells[5], '6');

    fireEvent.press(getByLabelText('Verify'));

    await waitFor(() => {
      expect(mockVerifyPhone).toHaveBeenCalledWith('+12025551234', '123456');
    });
  });

  it('shows alert on verification failure', async () => {
    mockVerifyPhone.mockRejectedValueOnce(new Error('Invalid code'));
    const { getAllByLabelText, getByLabelText } = render(<VerifyScreen />);

    const cells = getAllByLabelText(/OTP digit/);
    fireEvent.changeText(cells[0], '9');
    fireEvent.changeText(cells[1], '9');
    fireEvent.changeText(cells[2], '9');
    fireEvent.changeText(cells[3], '9');
    fireEvent.changeText(cells[4], '9');
    fireEvent.changeText(cells[5], '9');

    fireEvent.press(getByLabelText('Verify'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Verification Failed',
        expect.any(String),
      );
    });
  });

  it('does not submit with incomplete code', () => {
    const { getAllByLabelText, getByLabelText } = render(<VerifyScreen />);

    const cells = getAllByLabelText(/OTP digit/);
    fireEvent.changeText(cells[0], '1');
    fireEvent.changeText(cells[1], '2');
    // Only 2 digits

    fireEvent.press(getByLabelText('Verify'));
    expect(mockVerifyPhone).not.toHaveBeenCalled();
  });

  it('shows countdown timer after resend', async () => {
    mockPost.mockResolvedValueOnce({ data: { status: 'success' } });

    const { getByText } = render(<VerifyScreen />);

    // Resend link should be available initially
    const resendLink = getByText(/resend/i);
    await act(async () => {
      fireEvent.press(resendLink);
    });

    // After pressing, should show countdown
    expect(getByText(/resend.*\d+/i)).toBeTruthy();
  });
});
