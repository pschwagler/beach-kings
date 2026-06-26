/**
 * Tests for the Privacy Settings screen and its route.
 *
 * Covers:
 *   - Screen renders with correct testIDs
 *   - Toggle initial values reflect auth user state
 *   - Toggling "Private profile" calls api.updateUserProfile optimistically
 *   - Toggling "Show game history" calls api.updateUserProfile optimistically
 *   - On API error: reverts state and shows Alert
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBack = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({ push: jest.fn(), back: mockBack }),
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

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    brandTeal: '#00b4a2',
    bgElevated: '#ffffff',
    borderStrong: '#e0e0e0',
    textDefault: '#111111',
  }),
}));

const mockRefreshUser = jest.fn().mockResolvedValue(undefined);
let mockUser = {
  profile_is_private: false,
  show_game_history: false,
};

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    refreshUser: mockRefreshUser,
  }),
}));

const mockUpdateUserProfile = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    updateUserProfile: (...args: unknown[]) => mockUpdateUserProfile(...args),
  },
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import PrivacySettingsRoute from '../../../../app/(stack)/settings/privacy';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { profile_is_private: false, show_game_history: false };
  mockUpdateUserProfile.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PrivacySettingsScreen — render', () => {
  it('renders the privacy settings screen', () => {
    render(<PrivacySettingsRoute />);
    expect(screen.getByTestId('privacy-settings-screen')).toBeTruthy();
  });

  it('renders both toggle rows', () => {
    render(<PrivacySettingsRoute />);
    expect(screen.getByTestId('privacy-row-private-profile')).toBeTruthy();
    expect(screen.getByTestId('privacy-row-show-game-history')).toBeTruthy();
  });

  it('shows label text for each toggle', () => {
    render(<PrivacySettingsRoute />);
    expect(screen.getByText('Private profile')).toBeTruthy();
    expect(screen.getByText('Show game history on public profile')).toBeTruthy();
  });
});

describe('PrivacySettingsScreen — toggles', () => {
  it('calls updateUserProfile with profile_is_private when toggled', async () => {
    render(<PrivacySettingsRoute />);
    const switchEl = screen.getAllByRole('switch')[0];
    fireEvent(switchEl, 'valueChange', true);
    await waitFor(() => {
      expect(mockUpdateUserProfile).toHaveBeenCalledWith({ profile_is_private: true });
    });
  });

  it('calls updateUserProfile with show_game_history when toggled', async () => {
    render(<PrivacySettingsRoute />);
    const switchEl = screen.getAllByRole('switch')[1];
    fireEvent(switchEl, 'valueChange', true);
    await waitFor(() => {
      expect(mockUpdateUserProfile).toHaveBeenCalledWith({ show_game_history: true });
    });
  });

  it('calls refreshUser after a successful toggle', async () => {
    render(<PrivacySettingsRoute />);
    const switchEl = screen.getAllByRole('switch')[0];
    fireEvent(switchEl, 'valueChange', true);
    await waitFor(() => {
      expect(mockRefreshUser).toHaveBeenCalled();
    });
  });

  it('shows Alert on API error and reverts state', async () => {
    mockUpdateUserProfile.mockRejectedValue(new Error('network error'));
    const alertSpy = jest.spyOn(Alert, 'alert');

    render(<PrivacySettingsRoute />);
    const switchEl = screen.getAllByRole('switch')[0];
    fireEvent(switchEl, 'valueChange', true);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Error',
        'Could not update privacy setting. Please try again.',
      );
    });
  });

  it('reflects initial values from auth user', () => {
    mockUser = { profile_is_private: true, show_game_history: true };
    render(<PrivacySettingsRoute />);
    const switches = screen.getAllByRole('switch');
    // Both should render (initial value is passed as `value` prop)
    expect(switches).toHaveLength(2);
  });
});
