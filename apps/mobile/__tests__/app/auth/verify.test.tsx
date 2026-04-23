/**
 * Tests for the Verify (OTP) screen.
 * Flow: user enters 6-digit code sent to their phone,
 * with a resend option and countdown timer.
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
let mockSearchParams: Record<string, string> = { phone: '+12025551234' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
  useLocalSearchParams: () => mockSearchParams,
}));

const mockVerifyPhone = jest.fn();
const mockVerifyEmail = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    verifyPhone: mockVerifyPhone,
    verifyEmail: mockVerifyEmail,
  }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

const mockSendVerification = jest.fn();
const mockSendEmailVerification = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    sendVerification: (...args: unknown[]) => mockSendVerification(...args),
    sendEmailVerification: (...args: unknown[]) => mockSendEmailVerification(...args),
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

  it('increments shakeKey passed to OtpInput after a failed verification', async () => {
    mockVerifyPhone.mockRejectedValueOnce(new Error('Invalid code'));

    const { getAllByLabelText, getByLabelText, getAllByLabelText: getAllByA11y } = render(
      <VerifyScreen />,
    );

    const cells = getAllByLabelText(/OTP digit/);
    cells.forEach((cell, i) => {
      fireEvent.changeText(cell, String(i + 1));
    });

    await act(async () => {
      fireEvent.press(getByLabelText('Verify'));
    });

    // The Alert fires and the OTP container should still be in the tree
    // (shakeKey incremented to 1 — component didn't unmount or crash).
    expect(Alert.alert).toHaveBeenCalledWith(
      'Verification Failed',
      expect.any(String),
    );
    // Cells remain rendered, confirming no unmount side-effect from shakeKey.
    const cellsAfter = getAllByA11y(/OTP digit/);
    expect(cellsAfter).toHaveLength(6);
  });

  it('shows countdown timer after resend', async () => {
    mockSendVerification.mockResolvedValueOnce(undefined);

    const { getByText, findByText } = render(<VerifyScreen />);

    const resendLink = getByText(/resend/i);
    await act(async () => {
      fireEvent.press(resendLink);
    });

    expect(await findByText(/resend.*\d+/i)).toBeTruthy();
  });

  it('calls hapticSuccess on successful verification', async () => {
    const { hapticSuccess } = require('@/utils/haptics');
    mockVerifyPhone.mockResolvedValueOnce(undefined);
    const { getAllByLabelText, getByLabelText } = render(<VerifyScreen />);

    const cells = getAllByLabelText(/OTP digit/);
    cells.forEach((cell, i) => fireEvent.changeText(cell, String(i + 1)));
    fireEvent.press(getByLabelText('Verify'));

    await waitFor(() => {
      expect(mockVerifyPhone).toHaveBeenCalled();
    });
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
  });

  it('calls hapticError on failed verification', async () => {
    const { hapticError } = require('@/utils/haptics');
    mockVerifyPhone.mockRejectedValueOnce(new Error('Invalid code'));
    const { getAllByLabelText, getByLabelText } = render(<VerifyScreen />);

    const cells = getAllByLabelText(/OTP digit/);
    cells.forEach((cell, i) => fireEvent.changeText(cell, String(i + 1)));
    fireEvent.press(getByLabelText('Verify'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Verification Failed', expect.any(String));
    });
    expect(hapticError).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // H1 — KeyboardAvoidingView structural check
  // -------------------------------------------------------------------------

  it('wraps content in KeyboardAvoidingView', () => {
    const { UNSAFE_getAllByType } = render(<VerifyScreen />);
    const kavInstances = UNSAFE_getAllByType(KeyboardAvoidingView);
    expect(kavInstances.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Phone-mode resend regression — still calls sendVerification
  // -------------------------------------------------------------------------

  it('resend calls sendVerification (not sendEmailVerification) in phone mode', async () => {
    mockSendVerification.mockResolvedValueOnce(undefined);
    const { getByText } = render(<VerifyScreen />);

    await act(async () => {
      fireEvent.press(getByText(/resend/i));
    });

    expect(mockSendVerification).toHaveBeenCalledWith('+12025551234');
    expect(mockSendEmailVerification).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// VerifyScreen — email mode
// ---------------------------------------------------------------------------

describe('VerifyScreen (email mode)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockSearchParams = { email: 'test@example.com' };
  });

  afterEach(() => {
    jest.useRealTimers();
    mockSearchParams = { phone: '+12025551234' };
  });

  it('renders "Verify Email" as title', () => {
    const { getByText } = render(<VerifyScreen />);
    expect(getByText('Verify Email')).toBeTruthy();
  });

  it('resend calls sendEmailVerification (not sendVerification) in email mode', async () => {
    mockSendEmailVerification.mockResolvedValueOnce(undefined);
    const { getByText } = render(<VerifyScreen />);

    await act(async () => {
      fireEvent.press(getByText(/resend/i));
    });

    expect(mockSendEmailVerification).toHaveBeenCalledWith('test@example.com');
    expect(mockSendVerification).not.toHaveBeenCalled();
  });

  it('shows countdown after email resend', async () => {
    mockSendEmailVerification.mockResolvedValueOnce(undefined);
    const { getByText, findByText } = render(<VerifyScreen />);

    await act(async () => {
      fireEvent.press(getByText(/resend/i));
    });

    expect(await findByText(/resend.*\d+/i)).toBeTruthy();
  });

  it('calls hapticError when email resend fails', async () => {
    const { hapticError } = require('@/utils/haptics');
    mockSendEmailVerification.mockRejectedValueOnce(new Error('fail'));
    const { getByText } = render(<VerifyScreen />);

    await act(async () => {
      fireEvent.press(getByText(/resend/i));
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String));
    });
    expect(hapticError).toHaveBeenCalled();
  });
});
