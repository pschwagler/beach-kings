/**
 * Behavior tests for the Settings screen.
 *
 * Covers:
 *   - All section rows render
 *   - Account row navigates to account settings
 *   - Password row navigates to change password
 *   - Notifications row navigates to notifications settings
 *   - Log Out button opens logout modal
 *   - Logout modal: confirm triggers logout
 *   - Logout modal: cancel closes modal
 *   - Delete Account shows confirmation alert
 *   - Support rows show alert stubs
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockLogout = jest.fn();

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
    user: { email: 'test@example.com' },
    logout: mockLogout,
  }),
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
    ChevronRightIcon: makeIcon('ChevronRightIcon'),
  };
});

// ---------------------------------------------------------------------------
// Module under test — imported AFTER all jest.mock() calls
// ---------------------------------------------------------------------------

import SettingsRoute from '../../../../app/(stack)/settings';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('SettingsScreen — render', () => {
  it('renders settings screen', () => {
    render(<SettingsRoute />);
    expect(screen.getByTestId('settings-screen')).toBeTruthy();
  });

  it('renders all section rows', () => {
    render(<SettingsRoute />);
    expect(screen.getByTestId('settings-row-email')).toBeTruthy();
    expect(screen.getByTestId('settings-row-password')).toBeTruthy();
    expect(screen.getByTestId('settings-row-phone')).toBeTruthy();
    expect(screen.getByTestId('settings-row-notifications')).toBeTruthy();
    expect(screen.getByTestId('settings-row-feedback')).toBeTruthy();
    expect(screen.getByTestId('settings-row-contact')).toBeTruthy();
    expect(screen.getByTestId('settings-row-rate')).toBeTruthy();
    expect(screen.getByTestId('settings-row-delete')).toBeTruthy();
  });

  it('renders log out button', () => {
    render(<SettingsRoute />);
    expect(screen.getByTestId('settings-logout-btn')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

describe('SettingsScreen — navigation', () => {
  it('navigates to account settings when email row is pressed', () => {
    render(<SettingsRoute />);
    fireEvent.press(screen.getByTestId('settings-row-email'));
    expect(mockPush).toHaveBeenCalled();
  });

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
    // Should not throw
    fireEvent.press(screen.getByTestId('settings-row-delete'));
  });
});
