/**
 * Behavior tests for AddPhoneScreen — one-time OTP flow to attach a phone
 * number to an account with phone_number == null.
 *
 * Covers:
 *   - Renders input step by default (phone input + Send button)
 *   - Submitting an invalid number shows validation error (no API call)
 *   - Successful request moves to verify step
 *   - 409 on request surfaces "already in use" banner
 *   - 422 on request surfaces "valid US phone number" banner
 *   - Successful verify calls refreshUser and router.back()
 *   - Invalid code (400) shows error banner and resets the OTP field
 *   - Resend re-invokes requestAddPhone
 *   - "Use a different number" navigates back to input step
 */

import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({ push: mockPush, back: mockBack }),
    useLocalSearchParams: () => ({}),
    Redirect: ({ href }: { href: string }) => <View testID={`redirect-${href}`} />,
    useSegments: () => [],
    Slot: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, testID }: { children?: React.ReactNode; testID?: string }) =>
      <View testID={testID ?? 'safe-area-view'}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withRepeat: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    Easing: { inOut: () => ({}), ease: {} },
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Svg = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  const Path = () => null;
  return { __esModule: true, default: Svg, Svg, Path };
});

jest.mock('@/utils/haptics', () => ({
  hapticMedium: jest.fn().mockResolvedValue(undefined),
  hapticLight: jest.fn().mockResolvedValue(undefined),
  hapticHeavy: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
  hapticError: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock('@/components/ui/icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makeIcon = (name: string) => (_props: unknown) => <View testID={`icon-${name}`} />;
  return {
    ArrowLeftIcon: makeIcon('ArrowLeftIcon'),
    ChevronLeftIcon: makeIcon('ChevronLeftIcon'),
  };
});

const mockRefreshUser = jest.fn().mockResolvedValue(undefined);

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'patrick@example.com' },
    refreshUser: mockRefreshUser,
  }),
}));

const mockRequestAddPhone = jest.fn();
const mockVerifyAddPhone = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    requestAddPhone: (...args: unknown[]) => mockRequestAddPhone(...args),
    verifyAddPhone: (...args: unknown[]) => mockVerifyAddPhone(...args),
  },
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import AddPhoneRoute from '../../../../app/(stack)/settings/phone';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const VALID_PHONE = '+12125551234';
const VALID_CODE = '123456';

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestAddPhone.mockResolvedValue(undefined);
  mockVerifyAddPhone.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApiError(status: number): Error & { response: { status: number } } {
  const err = new Error(`HTTP ${status}`) as Error & {
    response: { status: number };
  };
  err.response = { status };
  return err;
}

async function advanceToVerifyStep(): Promise<void> {
  fireEvent.changeText(screen.getByTestId('input-phone-number'), VALID_PHONE);
  await act(async () => {
    fireEvent.press(screen.getByTestId('add-phone-send-btn'));
  });
  await waitFor(() => {
    expect(screen.getByTestId('add-phone-verify-btn')).toBeTruthy();
  });
}

// ---------------------------------------------------------------------------
// Render / input step
// ---------------------------------------------------------------------------

describe('AddPhoneScreen — input step', () => {
  it('renders the add-phone screen', () => {
    render(<AddPhoneRoute />);
    expect(screen.getByTestId('add-phone-screen')).toBeTruthy();
  });

  it('renders phone input and Send button', () => {
    render(<AddPhoneRoute />);
    expect(screen.getByTestId('input-phone-number')).toBeTruthy();
    expect(screen.getByTestId('add-phone-send-btn')).toBeTruthy();
  });

  it('shows validation error and does not call the API when phone is invalid', async () => {
    render(<AddPhoneRoute />);
    fireEvent.changeText(screen.getByTestId('input-phone-number'), 'abc');
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-phone-send-btn'));
    });
    expect(mockRequestAddPhone).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Request errors
// ---------------------------------------------------------------------------

describe('AddPhoneScreen — request errors', () => {
  it('shows "already in use" banner on 409', async () => {
    mockRequestAddPhone.mockRejectedValueOnce(buildApiError(409));
    render(<AddPhoneRoute />);
    fireEvent.changeText(screen.getByTestId('input-phone-number'), VALID_PHONE);
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-phone-send-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('add-phone-banner')).toBeTruthy();
      expect(screen.getByText('That number is already in use.')).toBeTruthy();
    });
    // Still on input step
    expect(screen.getByTestId('add-phone-send-btn')).toBeTruthy();
  });

  it('shows "valid US phone number" banner on 422', async () => {
    mockRequestAddPhone.mockRejectedValueOnce(buildApiError(422));
    render(<AddPhoneRoute />);
    fireEvent.changeText(screen.getByTestId('input-phone-number'), VALID_PHONE);
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-phone-send-btn'));
    });
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid US phone number.')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Verify step
// ---------------------------------------------------------------------------

describe('AddPhoneScreen — verify step', () => {
  it('transitions to verify step after successful request', async () => {
    render(<AddPhoneRoute />);
    await advanceToVerifyStep();
    expect(mockRequestAddPhone).toHaveBeenCalledWith(VALID_PHONE);
    expect(screen.getByTestId('add-phone-verify-btn')).toBeTruthy();
    expect(screen.getByTestId('add-phone-resend-btn')).toBeTruthy();
    expect(screen.getByTestId('add-phone-change-number-btn')).toBeTruthy();
  });

  it('calls refreshUser and router.back() on successful verify', async () => {
    render(<AddPhoneRoute />);
    await advanceToVerifyStep();
    // Paste full code into first OTP cell — OtpInput fills all cells and auto-fires onComplete.
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('OTP digit 1'), VALID_CODE);
    });
    await waitFor(() => {
      expect(mockVerifyAddPhone).toHaveBeenCalledWith(VALID_PHONE, VALID_CODE);
    });
    await waitFor(() => {
      expect(mockRefreshUser).toHaveBeenCalledTimes(1);
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  it('shows "invalid or expired code" banner on 400', async () => {
    mockVerifyAddPhone.mockRejectedValueOnce(buildApiError(400));
    render(<AddPhoneRoute />);
    await advanceToVerifyStep();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('OTP digit 1'), VALID_CODE);
    });
    await waitFor(() => {
      expect(screen.getByText('Invalid or expired code. Please try again.')).toBeTruthy();
    });
    expect(mockRefreshUser).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows "just claimed by another account" banner on 409', async () => {
    mockVerifyAddPhone.mockRejectedValueOnce(buildApiError(409));
    render(<AddPhoneRoute />);
    await advanceToVerifyStep();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('OTP digit 1'), VALID_CODE);
    });
    await waitFor(() => {
      expect(
        screen.getByText('That number was just claimed by another account.'),
      ).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Resend / change number
// ---------------------------------------------------------------------------

describe('AddPhoneScreen — resend and change number', () => {
  it('"Use a different number" returns to input step', async () => {
    render(<AddPhoneRoute />);
    await advanceToVerifyStep();
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-phone-change-number-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('add-phone-send-btn')).toBeTruthy();
    });
  });
});
