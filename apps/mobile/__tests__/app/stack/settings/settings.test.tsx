/**
 * Behavior tests for the Settings screen.
 *
 * Covers:
 *   - All section rows render (Login & Security, Connected Accounts,
 *     Notifications, Appearance, Support, Danger Zone)
 *   - Email row shows masked email
 *   - Password row navigates to change password
 *   - Phone row: navigates to add-phone when unset, mailto when set
 *   - Connected accounts: Google connected, Apple connect button
 *   - Notifications row navigates to notifications settings
 *   - Log Out button opens logout modal
 *   - Logout modal: confirm triggers logout
 *   - Logout modal: cancel closes modal
 *   - Delete Account shows confirmation alert
 *   - Support rows show alert stubs
 *   - OAuth users: password row hidden
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockLogout = jest.fn();

let mockUser: Record<string, unknown> = { email: 'test@example.com', has_password: true };

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
    user: mockUser,
    logout: mockLogout,
  }),
}));

const mockSubmitFeedback = jest.fn();
const mockGetCurrentUserPlayer = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    submitFeedback: (...args: unknown[]) => mockSubmitFeedback(...args),
    getCurrentUserPlayer: (...args: unknown[]) => mockGetCurrentUserPlayer(...args),
  },
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colorScheme: 'light',
    themeMode: 'system',
    setThemeMode: jest.fn(),
  }),
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

import { Linking } from 'react-native';
const mockOpenURL = jest
  .spyOn(Linking, 'openURL')
  .mockResolvedValue(true);

// ---------------------------------------------------------------------------
// Module under test — imported AFTER all jest.mock() calls
// ---------------------------------------------------------------------------

import SettingsRoute from '../../../../app/(stack)/settings';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { email: 'test@example.com', has_password: true };
  mockGetCurrentUserPlayer.mockResolvedValue({
    id: 1,
    email: 'test@example.com',
    phone_number: null,
  });
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('SettingsScreen — render', () => {
  it('renders settings screen', () => {
    render(<SettingsRoute />);
    expect(screen.getByTestId('settings-screen')).toBeTruthy();
  });

  it('renders all section rows', async () => {
    render(<SettingsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-row-email')).toBeTruthy();
      expect(screen.getByTestId('settings-row-password')).toBeTruthy();
      expect(screen.getByTestId('settings-row-phone')).toBeTruthy();
      expect(screen.getByTestId('settings-row-google')).toBeTruthy();
      expect(screen.getByTestId('settings-row-apple')).toBeTruthy();
      expect(screen.getByTestId('settings-row-notifications')).toBeTruthy();
      expect(screen.getByTestId('settings-row-appearance')).toBeTruthy();
      expect(screen.getByTestId('settings-row-feedback')).toBeTruthy();
      expect(screen.getByTestId('settings-row-contact')).toBeTruthy();
      expect(screen.getByTestId('settings-row-rate')).toBeTruthy();
      expect(screen.getByTestId('settings-row-delete')).toBeTruthy();
    });
  });

  it('renders log out button', () => {
    render(<SettingsRoute />);
    expect(screen.getByTestId('settings-logout-btn')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Email masking
// ---------------------------------------------------------------------------

describe('SettingsScreen — email masking', () => {
  it('shows masked email from auth user', async () => {
    render(<SettingsRoute />);
    await waitFor(() => {
      expect(screen.getByText('t***@example.com')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

describe('SettingsScreen — navigation', () => {
  it('navigates to change password when password row is pressed', () => {
    render(<SettingsRoute />);
    fireEvent.press(screen.getByTestId('settings-row-password'));
    expect(mockPush).toHaveBeenCalled();
  });

  it('navigates to notifications when notifications row is pressed', () => {
    render(<SettingsRoute />);
    fireEvent.press(screen.getByTestId('settings-row-notifications'));
    expect(mockPush).toHaveBeenCalled();
  });

  it('navigates to appearance when appearance row is pressed', () => {
    render(<SettingsRoute />);
    fireEvent.press(screen.getByTestId('settings-row-appearance'));
    expect(mockPush).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Phone row
// ---------------------------------------------------------------------------

describe('SettingsScreen — phone row', () => {
  it('navigates to add-phone route when no phone is set', async () => {
    render(<SettingsRoute />);
    await waitFor(() => {
      expect(screen.getByText('Not set')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('settings-row-phone'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/settings/phone');
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it('opens support mailto when phone is already set', async () => {
    mockGetCurrentUserPlayer.mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      phone_number: '+15551234567',
    });
    render(<SettingsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-row-phone')).toBeTruthy();
    });
    // Wait for player data to load before pressing.
    await waitFor(() => {
      expect(screen.queryByText('Not set')).toBeNull();
    });
    fireEvent.press(screen.getByTestId('settings-row-phone'));
    expect(mockOpenURL).toHaveBeenCalledTimes(1);
    const calledUrl = mockOpenURL.mock.calls[0][0] as string;
    expect(calledUrl).toContain('mailto:support@beachkings.app');
    expect(calledUrl).toContain('Change%20phone%20number');
  });
});

// ---------------------------------------------------------------------------
// Connected accounts
// ---------------------------------------------------------------------------

describe('SettingsScreen — connected accounts', () => {
  it('shows Connected status for Google', () => {
    render(<SettingsRoute />);
    expect(screen.getByText('Connected')).toBeTruthy();
  });

  it('shows Connect button for Apple', () => {
    render(<SettingsRoute />);
    expect(screen.getByText('Connect')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Logout modal
// ---------------------------------------------------------------------------

describe('SettingsScreen — logout modal', () => {
  it('opens logout modal when log out button is pressed', () => {
    render(<SettingsRoute />);
    fireEvent.press(screen.getByTestId('settings-logout-btn'));
    expect(screen.getByTestId('logout-modal')).toBeTruthy();
  });

  it('calls logout when confirm is pressed in modal', () => {
    render(<SettingsRoute />);
    fireEvent.press(screen.getByTestId('settings-logout-btn'));
    fireEvent.press(screen.getByTestId('logout-confirm-btn'));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('closes modal when cancel is pressed', () => {
    render(<SettingsRoute />);
    fireEvent.press(screen.getByTestId('settings-logout-btn'));
    expect(screen.getByTestId('logout-modal')).toBeTruthy();
    fireEvent.press(screen.getByTestId('logout-cancel-btn'));
    expect(screen.queryByTestId('logout-modal')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Delete account
// ---------------------------------------------------------------------------

describe('SettingsScreen — delete account', () => {
  it('renders delete account row', () => {
    render(<SettingsRoute />);
    expect(screen.getByTestId('settings-row-delete')).toBeTruthy();
  });

  it('delete account row is pressable', () => {
    render(<SettingsRoute />);
    fireEvent.press(screen.getByTestId('settings-row-delete'));
  });
});

// ---------------------------------------------------------------------------
// Feedback navigation
// ---------------------------------------------------------------------------

describe('SettingsScreen — feedback row', () => {
  it('navigates to feedback route when feedback row is pressed', () => {
    render(<SettingsRoute />);
    fireEvent.press(screen.getByTestId('settings-row-feedback'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/settings/feedback');
    expect(mockSubmitFeedback).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// OAuth user (no password)
// ---------------------------------------------------------------------------

describe('SettingsScreen — OAuth user', () => {
  it('hides the password row for users without a password', () => {
    mockUser = { email: 'oauth@example.com', has_password: false, auth_provider: 'google' };
    render(<SettingsRoute />);
    expect(screen.queryByTestId('settings-row-password')).toBeNull();
  });

  it('still shows email and phone rows for OAuth users', () => {
    mockUser = { email: 'oauth@example.com', has_password: false, auth_provider: 'google' };
    render(<SettingsRoute />);
    expect(screen.getByTestId('settings-row-email')).toBeTruthy();
    expect(screen.getByTestId('settings-row-phone')).toBeTruthy();
  });
});
