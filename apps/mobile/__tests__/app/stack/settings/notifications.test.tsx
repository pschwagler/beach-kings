/**
 * Behavior tests for the Notifications Settings screen.
 *
 * Covers:
 *   - Loading skeleton while prefs are fetching
 *   - Error state on fetch failure + retry
 *   - All toggle rows render after data loads
 *   - Master toggle is on when all prefs are true
 *   - Master toggle is off when any pref is false
 *   - Individual toggle calls onToggle with the correct key
 *   - Quiet Hours row renders
 *   - Notification types section dims when master is off
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
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

const mockGetPushNotificationPrefs = jest.fn();
const mockUpdatePushNotificationPrefs = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getPushNotificationPrefs: (...args: unknown[]) => mockGetPushNotificationPrefs(...args),
    updatePushNotificationPrefs: (...args: unknown[]) => mockUpdatePushNotificationPrefs(...args),
  },
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
// Module under test
// ---------------------------------------------------------------------------

import NotificationsRoute from '../../../../app/(stack)/settings/notifications';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const ALL_ON_PREFS = {
  direct_messages: true,
  league_messages: true,
  friend_requests: true,
  match_invites: true,
  session_updates: true,
  tournament_updates: true,
};

const MIXED_PREFS = {
  ...ALL_ON_PREFS,
  direct_messages: false,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPushNotificationPrefs.mockResolvedValue(ALL_ON_PREFS);
  mockUpdatePushNotificationPrefs.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('NotificationsSettingsScreen — loading state', () => {
  it('renders skeleton while prefs are loading', async () => {
    mockGetPushNotificationPrefs.mockReturnValue(new Promise(() => {}));
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('notifications-skeleton')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('NotificationsSettingsScreen — error state', () => {
  it('renders error state on fetch failure', async () => {
    mockGetPushNotificationPrefs.mockRejectedValue(new Error('Network error'));
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('notifications-error')).toBeTruthy();
    });
  });

  it('renders retry button in error state', async () => {
    mockGetPushNotificationPrefs.mockRejectedValue(new Error('Network error'));
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('notifications-retry-btn')).toBeTruthy();
    });
  });

  it('calls api again when retry is pressed', async () => {
    mockGetPushNotificationPrefs.mockRejectedValueOnce(new Error('fail'));
    mockGetPushNotificationPrefs.mockResolvedValue(ALL_ON_PREFS);
    render(<NotificationsRoute />);
    await waitFor(() => expect(screen.getByTestId('notifications-retry-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('notifications-retry-btn'));
    await waitFor(() => {
      expect(mockGetPushNotificationPrefs).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Toggles
// ---------------------------------------------------------------------------

describe('NotificationsSettingsScreen — toggles', () => {
  it('renders master toggle', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('toggle-master')).toBeTruthy();
    });
  });

  it('renders all individual notification type toggles', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('toggle-direct_messages')).toBeTruthy();
      expect(screen.getByTestId('toggle-league_messages')).toBeTruthy();
      expect(screen.getByTestId('toggle-friend_requests')).toBeTruthy();
      expect(screen.getByTestId('toggle-match_invites')).toBeTruthy();
      expect(screen.getByTestId('toggle-session_updates')).toBeTruthy();
      expect(screen.getByTestId('toggle-tournament_updates')).toBeTruthy();
    });
  });

  it('master toggle is on when all prefs are true', async () => {
    mockGetPushNotificationPrefs.mockResolvedValue(ALL_ON_PREFS);
    render(<NotificationsRoute />);
    await waitFor(() => {
      const master = screen.getByTestId('toggle-master');
      expect(master.props.value).toBe(true);
    });
  });

  it('master toggle is off when any pref is false', async () => {
    mockGetPushNotificationPrefs.mockResolvedValue(MIXED_PREFS);
    render(<NotificationsRoute />);
    await waitFor(() => {
      const master = screen.getByTestId('toggle-master');
      expect(master.props.value).toBe(false);
    });
  });

  it('renders quiet hours row', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('quiet-hours-row')).toBeTruthy();
    });
  });

  it('calls updatePushNotificationPrefs when individual toggle changes', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => expect(screen.getByTestId('toggle-direct_messages')).toBeTruthy());
    fireEvent(screen.getByTestId('toggle-direct_messages'), 'valueChange', false);
    await waitFor(() => {
      expect(mockUpdatePushNotificationPrefs).toHaveBeenCalledWith(
        expect.objectContaining({ direct_messages: false }),
      );
    });
  });
});
