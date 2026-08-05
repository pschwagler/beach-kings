/**
 * Behavior tests for the Settings screen.
 *
 * Covers:
 *   - All section rows render (Login & Security, Connected Accounts,
 *     Privacy, Notifications, Appearance, Support, Danger Zone)
 *   - Email row shows masked email
 *   - Password row navigates to change password
 *   - Phone row: navigates to add-phone when unset, mailto when set
 *   - Connected accounts: Google/Apple show Connect button when not connected,
 *     Connected badge when connected
 *   - Privacy row navigates to privacy settings
 *   - Notifications row navigates to notifications settings
 *   - Log Out button opens logout modal
 *   - Logout modal: confirm triggers logout
 *   - Logout modal: cancel closes modal
 *   - Delete Account calls scheduleAccountDeletion API
 *   - Contact Support opens mailto link
 *   - OAuth users: password row hidden
 */

import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockLogout = jest.fn();
const mockRefreshUser = jest.fn().mockResolvedValue(undefined);

let mockUser: Record<string, unknown> = {
  email: 'test@example.com',
  has_password: true,
  google_connected: false,
  apple_connected: false,
  profile_is_private: false,
  show_game_history: false,
  deletion_scheduled_at: null,
};

let mockCurrentPlayer: Record<string, unknown> = {
  id: 1,
  email: 'test@example.com',
  phone_number: null,
};

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
    refreshUser: mockRefreshUser,
  }),
}));

// Settings behavior is independent of the legacy fetch hook's async lifecycle.
// Give these UI tests explicit, synchronous server state instead.
jest.mock('@/hooks/useApi', () => ({
  __esModule: true,
  default: () => ({
    data: mockCurrentPlayer,
    error: null,
    isLoading: false,
    refetch: jest.fn().mockResolvedValue(undefined),
    mutate: jest.fn(),
  }),
}));

const mockSubmitFeedback = jest.fn();
const mockGetCurrentUserPlayer = jest.fn();
const mockScheduleAccountDeletion = jest.fn();
const mockDeleteAccountNow = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    submitFeedback: (...args: unknown[]) => mockSubmitFeedback(...args),
    getCurrentUserPlayer: (...args: unknown[]) => mockGetCurrentUserPlayer(...args),
    scheduleAccountDeletion: (...args: unknown[]) => mockScheduleAccountDeletion(...args),
    deleteAccountNow: (...args: unknown[]) => mockDeleteAccountNow(...args),
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

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    brandTeal: '#00b4a2',
    bgElevated: '#ffffff',
    borderStrong: '#e0e0e0',
    textDefault: '#111111',
    bgSurface: '#ffffff',
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

// Mock expo-store-review
jest.mock('expo-store-review', () => ({
  hasAction: jest.fn().mockResolvedValue(false),
  requestReview: jest.fn().mockResolvedValue(undefined),
  storeUrl: jest.fn().mockReturnValue(null),
  isAvailableAsync: jest.fn().mockResolvedValue(false),
}));

// Mock useConnectedAccounts to avoid OAuth plumbing in unit tests
const mockHandleConnectGoogle = jest.fn();
const mockHandleConnectApple = jest.fn();

jest.mock(
  '@/components/screens/Settings/useConnectedAccounts',
  () => ({
    useConnectedAccounts: () => ({
      appleAvailable: false,
      isLinkingGoogle: false,
      isLinkingApple: false,
      handleConnectGoogle: mockHandleConnectGoogle,
      handleConnectApple: mockHandleConnectApple,
    }),
  }),
);

// Mock expo-auth-session (pulled in transitively via oauth.ts even with the above mock)
jest.mock('expo-auth-session/providers/google', () => ({
  useAuthRequest: jest.fn(() => [null, null, jest.fn()]),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

import { Alert, Linking } from 'react-native';
const mockCanOpenURL = jest
  .spyOn(Linking, 'canOpenURL')
  .mockResolvedValue(true);
const mockOpenURL = jest
  .spyOn(Linking, 'openURL')
  .mockResolvedValue(true);
const mockAlert = jest
  .spyOn(Alert, 'alert')
  .mockImplementation(() => {});

// ---------------------------------------------------------------------------
// Module under test — imported AFTER all jest.mock() calls
// ---------------------------------------------------------------------------

import SettingsRoute from '../../../../app/(stack)/settings';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockCanOpenURL.mockResolvedValue(true);
  mockOpenURL.mockResolvedValue(true);
  mockUser = {
    email: 'test@example.com',
    has_password: true,
    google_connected: false,
    apple_connected: false,
    profile_is_private: false,
    show_game_history: false,
    deletion_scheduled_at: null,
  };
  mockCurrentPlayer = {
    id: 1,
    email: 'test@example.com',
    phone_number: null,
  };
  mockGetCurrentUserPlayer.mockResolvedValue({
    id: 1,
    email: 'test@example.com',
    phone_number: null,
  });
  mockScheduleAccountDeletion.mockResolvedValue({ status: 'ok' });
  mockDeleteAccountNow.mockResolvedValue({ status: 'ok' });
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
      expect(screen.getByTestId('settings-row-privacy')).toBeTruthy();
      expect(screen.getByTestId('settings-row-notifications')).toBeTruthy();
      expect(screen.getByTestId('settings-row-appearance')).toBeTruthy();
      expect(screen.getByTestId('settings-row-feedback')).toBeTruthy();
      expect(screen.getByTestId('settings-row-contact')).toBeTruthy();
      expect(screen.getByTestId('settings-row-rate')).toBeTruthy();
      expect(screen.getByTestId('settings-row-terms')).toBeTruthy();
      expect(screen.getByTestId('settings-row-privacy-policy')).toBeTruthy();
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

  it('navigates to privacy settings when privacy row is pressed', () => {
    render(<SettingsRoute />);
    fireEvent.press(screen.getByTestId('settings-row-privacy'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/settings/privacy');
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
    mockCurrentPlayer = {
      id: 1,
      email: 'test@example.com',
      phone_number: '+15551234567',
    };
    render(<SettingsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-row-phone')).toBeTruthy();
    });
    // Wait for player data to load before pressing.
    await waitFor(() => {
      expect(screen.queryByText('Not set')).toBeNull();
    });
    fireEvent.press(screen.getByTestId('settings-row-phone'));
    await waitFor(() => {
      expect(mockOpenURL).toHaveBeenCalledTimes(1);
    });
    const calledUrl = mockOpenURL.mock.calls[0][0] as string;
    expect(calledUrl).toContain('mailto:beachleaguevb+support@gmail.com');
    expect(calledUrl).toContain('Change%20phone%20number');
  });
});

// ---------------------------------------------------------------------------
// Connected accounts
// ---------------------------------------------------------------------------

describe('SettingsScreen — connected accounts', () => {
  it('shows Connect button for Google when not connected', () => {
    render(<SettingsRoute />);
    expect(screen.getByTestId('settings-connect-google-btn')).toBeTruthy();
  });

  it('shows Connected badge for Google when connected', () => {
    mockUser = { ...mockUser, google_connected: true };
    render(<SettingsRoute />);
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.queryByTestId('settings-connect-google-btn')).toBeNull();
  });

  it('Apple row is hidden on non-iOS platforms (test env)', () => {
    // In jest (node environment), Platform.OS is not 'ios' so Apple row should not render
    render(<SettingsRoute />);
    expect(screen.queryByTestId('settings-row-apple')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Contact support
// ---------------------------------------------------------------------------

describe('SettingsScreen — contact support', () => {
  it('opens the canonical public support page', async () => {
    render(<SettingsRoute />);
    fireEvent.press(screen.getByTestId('settings-row-contact'));
    await waitFor(() => {
      expect(mockOpenURL).toHaveBeenCalledTimes(1);
    });
    const calledUrl = mockOpenURL.mock.calls[0][0] as string;
    expect(calledUrl).toBe('https://beachleaguevb.com/support');
  });
});

describe('SettingsScreen — legal links', () => {
  it.each([
    ['settings-row-terms', 'https://beachleaguevb.com/terms-of-service'],
    ['settings-row-privacy-policy', 'https://beachleaguevb.com/privacy-policy'],
  ])('opens the canonical URL from %s', (testID, expectedUrl) => {
    render(<SettingsRoute />);
    fireEvent.press(screen.getByTestId(testID));
    expect(mockOpenURL).toHaveBeenCalledWith(expectedUrl);
  });
});

// ---------------------------------------------------------------------------
// Logout modal
// ---------------------------------------------------------------------------

describe('SettingsScreen — logout modal', () => {
  it('opens logout modal when log out button is pressed', () => {
    render(<SettingsRoute />);
    fireEvent.press(screen.getByTestId('settings-logout-btn'));
    expect(screen.getByTestId('logout-dialog')).toBeTruthy();
  });

  it('calls logout when confirm is pressed in modal', () => {
    render(<SettingsRoute />);
    fireEvent.press(screen.getByTestId('settings-logout-btn'));
    fireEvent.press(screen.getByTestId('logout-dialog-confirm'));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('closes modal when cancel is pressed', () => {
    render(<SettingsRoute />);
    fireEvent.press(screen.getByTestId('settings-logout-btn'));
    expect(screen.getByTestId('logout-dialog')).toBeTruthy();
    fireEvent.press(screen.getByTestId('logout-dialog-cancel'));
    expect(screen.queryByTestId('logout-dialog')).toBeNull();
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

  it('offers cancel, scheduled deletion, and immediate deletion', () => {
    render(<SettingsRoute />);
    fireEvent.press(screen.getByTestId('settings-row-delete'));

    expect(mockAlert).toHaveBeenCalledWith(
      'Delete Account?',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Delete in 30 Days' }),
        expect.objectContaining({ text: 'Delete Now' }),
      ]),
    );
  });

  it('calls the scheduled deletion endpoint for the recovery option', async () => {
    render(<SettingsRoute />);
    fireEvent.press(screen.getByTestId('settings-row-delete'));
    const buttons = mockAlert.mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    await act(async () => {
      buttons.find(({ text }) => text === 'Delete in 30 Days')?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => expect(mockScheduleAccountDeletion).toHaveBeenCalledTimes(1));
    expect(mockDeleteAccountNow).not.toHaveBeenCalled();
  });

  it('calls immediate deletion for Delete Now', async () => {
    render(<SettingsRoute />);
    fireEvent.press(screen.getByTestId('settings-row-delete'));
    const buttons = mockAlert.mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    await act(async () => {
      buttons.find(({ text }) => text === 'Delete Now')?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => expect(mockDeleteAccountNow).toHaveBeenCalledTimes(1));
    expect(mockScheduleAccountDeletion).not.toHaveBeenCalled();
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
    mockUser = { ...mockUser, email: 'oauth@example.com', has_password: false, auth_provider: 'google' };
    render(<SettingsRoute />);
    expect(screen.queryByTestId('settings-row-password')).toBeNull();
  });

  it('still shows email and phone rows for OAuth users', () => {
    mockUser = { ...mockUser, email: 'oauth@example.com', has_password: false, auth_provider: 'google' };
    render(<SettingsRoute />);
    expect(screen.getByTestId('settings-row-email')).toBeTruthy();
    expect(screen.getByTestId('settings-row-phone')).toBeTruthy();
  });
});
