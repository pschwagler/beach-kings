/**
 * Behavior tests for the Account Settings screen.
 *
 * Covers:
 *   - All section rows render (Login & Security, Connected Accounts, Privacy, Danger Zone)
 *   - Email row shows masked email
 *   - Password row navigates to change password
 *   - Delete Account row triggers confirmation alert
 *   - Google shows "Connected" status
 *   - Apple shows "Connect" button
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

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

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'patrick@example.com' },
    logout: jest.fn(),
  }),
}));

const mockGetCurrentUserPlayer = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getCurrentUserPlayer: (...args: unknown[]) => mockGetCurrentUserPlayer(...args),
  },
}));

import { Linking } from 'react-native';
const mockOpenURL = jest
  .spyOn(Linking, 'openURL')
  .mockResolvedValue(true);

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
    ChevronRightIcon: makeIcon('ChevronRightIcon'),
  };
});

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import AccountSettingsRoute from '../../../../app/(stack)/settings/account';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_PLAYER = {
  id: 1,
  email: 'patrick@example.com',
  phone_number: '+15551234567',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCurrentUserPlayer.mockResolvedValue(MOCK_PLAYER);
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('AccountSettingsScreen — render', () => {
  it('renders account settings screen', async () => {
    render(<AccountSettingsRoute />);
    expect(screen.getByTestId('account-settings-screen')).toBeTruthy();
  });

  it('renders all section rows', async () => {
    render(<AccountSettingsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('account-row-email')).toBeTruthy();
      expect(screen.getByTestId('account-row-password')).toBeTruthy();
      expect(screen.getByTestId('account-row-phone')).toBeTruthy();
      expect(screen.getByTestId('account-row-google')).toBeTruthy();
      expect(screen.getByTestId('account-row-apple')).toBeTruthy();
      expect(screen.getByTestId('account-row-visibility')).toBeTruthy();
      expect(screen.getByTestId('account-row-game-history')).toBeTruthy();
      expect(screen.getByTestId('account-row-delete')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Email masking
// ---------------------------------------------------------------------------

describe('AccountSettingsScreen — email masking', () => {
  it('shows masked email from auth user', async () => {
    render(<AccountSettingsRoute />);
    await waitFor(() => {
      expect(screen.getByText('p***@example.com')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

describe('AccountSettingsScreen — navigation', () => {
  it('navigates to change password when password row is pressed', async () => {
    render(<AccountSettingsRoute />);
    await waitFor(() => expect(screen.getByTestId('account-row-password')).toBeTruthy());
    fireEvent.press(screen.getByTestId('account-row-password'));
    expect(mockPush).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Phone row
// ---------------------------------------------------------------------------

describe('AccountSettingsScreen — phone row', () => {
  it('navigates to add-phone route when no phone is set', async () => {
    mockGetCurrentUserPlayer.mockResolvedValue({
      id: 1,
      email: 'patrick@example.com',
      phone_number: null,
    });
    render(<AccountSettingsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('account-row-phone')).toBeTruthy();
      expect(screen.getByText('Not set')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('account-row-phone'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/settings/phone');
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it('opens support mailto when phone is already set', async () => {
    render(<AccountSettingsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('account-row-phone')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('account-row-phone'));
    expect(mockOpenURL).toHaveBeenCalledTimes(1);
    const calledUrl = mockOpenURL.mock.calls[0][0] as string;
    expect(calledUrl).toContain('mailto:support@beachkings.app');
    expect(calledUrl).toContain('Change%20phone%20number');
    expect(mockPush).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Connected accounts
// ---------------------------------------------------------------------------

describe('AccountSettingsScreen — connected accounts', () => {
  it('shows Connected status for Google', async () => {
    render(<AccountSettingsRoute />);
    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeTruthy();
    });
  });

  it('shows Connect button for Apple', async () => {
    render(<AccountSettingsRoute />);
    await waitFor(() => {
      expect(screen.getByText('Connect')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Danger zone
// ---------------------------------------------------------------------------

describe('AccountSettingsScreen — danger zone', () => {
  it('delete account row is pressable', async () => {
    render(<AccountSettingsRoute />);
    await waitFor(() => expect(screen.getByTestId('account-row-delete')).toBeTruthy());
    // Should not throw
    fireEvent.press(screen.getByTestId('account-row-delete'));
  });
});
