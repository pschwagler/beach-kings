/**
 * Behavior tests for the Notifications Settings screen.
 *
 * Covers:
 *   - Loading skeleton while prefs are fetching
 *   - Error state on fetch failure + retry
 *   - Supported toggle rows render after data loads
 *   - Master toggle is on when all prefs are true
 *   - Master toggle is off when any pref is false
 *   - Individual toggle calls onToggle with the correct key
 *   - Notification types section dims when master is off
 */

import React from 'react';
import {
  render as rtlRender,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

let mockUserId = 7;
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: mockUserId } }),
}));

const mockEnablePush = jest.fn().mockResolvedValue('enabled');
const mockOpenSettings = jest.fn().mockResolvedValue(undefined);
let mockAuthorization = 'authorized';
jest.mock('@/features/notifications/nativePushContext', () => ({
  useNativePush: () => ({
    authorization: mockAuthorization,
    enablePush: mockEnablePush,
    openSettings: mockOpenSettings,
    isRegistering: false,
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

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import NotificationsRoute from '../../../../app/(stack)/settings/notifications';

function render(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  return rtlRender(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const ALL_ON_PREFS = {
  push_enabled: true,
  direct_messages: true,
  league_messages: true,
  friend_requests: true,
  match_invites: true,
  ranking_changes: true,
  tournament_updates: true,
};

const MIXED_PREFS = {
  ...ALL_ON_PREFS,
  push_enabled: false,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockUserId = 7;
  mockAuthorization = 'authorized';
  mockEnablePush.mockResolvedValue('enabled');
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

  it('renders supported notification type toggles and hides the dormant tournament preference', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('toggle-direct_messages')).toBeTruthy();
      expect(screen.getByTestId('toggle-league_messages')).toBeTruthy();
      expect(screen.getByTestId('toggle-friend_requests')).toBeTruthy();
      expect(screen.getByTestId('toggle-match_invites')).toBeTruthy();
      expect(screen.getByTestId('toggle-ranking_changes')).toBeTruthy();
      expect(screen.queryByTestId('toggle-tournament_updates')).toBeNull();
      expect(screen.queryByText('Tournament Alerts')).toBeNull();
    });
  });

  it('master toggle is on when push_enabled is true', async () => {
    mockGetPushNotificationPrefs.mockResolvedValue(ALL_ON_PREFS);
    render(<NotificationsRoute />);
    await waitFor(() => {
      const master = screen.getByTestId('toggle-master');
      expect(master.props.value).toBe(true);
    });
  });

  it('master toggle is off when push_enabled is false', async () => {
    mockGetPushNotificationPrefs.mockResolvedValue(MIXED_PREFS);
    render(<NotificationsRoute />);
    await waitFor(() => {
      const master = screen.getByTestId('toggle-master');
      expect(master.props.value).toBe(false);
    });
  });

  it('exposes notification type toggles as disabled when the master toggle is off', async () => {
    mockGetPushNotificationPrefs.mockResolvedValue(MIXED_PREFS);
    render(<NotificationsRoute />);
    await waitFor(() => {
      expect(screen.getByTestId('toggle-direct_messages')).toHaveAccessibilityState({
        disabled: true,
      });
    });
  });

  it('keeps category labels fully readable when only their switches are disabled', async () => {
    mockGetPushNotificationPrefs.mockResolvedValue(MIXED_PREFS);
    render(<NotificationsRoute />);

    await waitFor(() => {
      expect(screen.getByTestId('toggle-direct_messages')).toHaveAccessibilityState({
        disabled: true,
      });
    });

    expect(screen.getByTestId('notifications-types-section').props.className).toBeUndefined();
    expect(screen.getByTestId('toggle-direct_messages-row').props.className).not.toContain(
      'opacity',
    );
    expect(screen.getByText('Chat Messages').props.className).toContain('text-default');
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

  it('master toggle calls updatePushNotificationPrefs with push_enabled', async () => {
    render(<NotificationsRoute />);
    await waitFor(() => expect(screen.getByTestId('toggle-master')).toBeTruthy());
    fireEvent(screen.getByTestId('toggle-master'), 'valueChange', false);
    await waitFor(() => {
      expect(mockUpdatePushNotificationPrefs).toHaveBeenCalledWith(
        expect.objectContaining({ push_enabled: false }),
      );
    });
  });

  it('shows an Open Settings action when OS authorization is denied', async () => {
    mockAuthorization = 'denied';
    render(<NotificationsRoute />);
    await waitFor(() => expect(screen.getByTestId('notifications-open-settings')).toBeTruthy());
    fireEvent.press(screen.getByTestId('notifications-open-settings'));
    expect(mockOpenSettings).toHaveBeenCalled();
    expect(screen.getByTestId('toggle-master').props.value).toBe(false);
  });

  it('rolls back a rejected change, announces it, and retries successfully', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    mockUpdatePushNotificationPrefs
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ...ALL_ON_PREFS, direct_messages: false });
    render(<NotificationsRoute />);
    await waitFor(() => expect(screen.getByTestId('toggle-direct_messages')).toBeTruthy());

    fireEvent(screen.getByTestId('toggle-direct_messages'), 'valueChange', false);
    await waitFor(() => expect(
      screen.getByTestId('notification-action-error-direct_messages'),
    ).toBeTruthy());
    expect(screen.getByTestId('toggle-direct_messages').props.value).toBe(true);
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Retry is available'));

    mockGetPushNotificationPrefs.mockResolvedValue({ ...ALL_ON_PREFS, direct_messages: false });
    fireEvent.press(screen.getByTestId('notification-action-retry-direct_messages'));
    await waitFor(() => expect(mockUpdatePushNotificationPrefs).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(
      screen.queryByTestId('notification-action-error-direct_messages'),
    ).toBeNull());
    expect(screen.getByTestId('toggle-direct_messages').props.value).toBe(false);
    announce.mockRestore();
  });

  it('guards repeated activation while leaving unrelated controls enabled', async () => {
    const pending = deferred<typeof ALL_ON_PREFS>();
    mockUpdatePushNotificationPrefs.mockReturnValue(pending.promise);
    render(<NotificationsRoute />);
    await waitFor(() => expect(screen.getByTestId('toggle-direct_messages')).toBeTruthy());

    fireEvent(screen.getByTestId('toggle-direct_messages'), 'valueChange', false);
    fireEvent(screen.getByTestId('toggle-direct_messages'), 'valueChange', false);

    await waitFor(() => expect(mockUpdatePushNotificationPrefs).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('toggle-direct_messages')).toHaveAccessibilityState({ disabled: true });
    expect(screen.getByTestId('toggle-league_messages')).toHaveAccessibilityState({ disabled: false });
    await act(async () => { pending.resolve({ ...ALL_ON_PREFS, direct_messages: false }); });
  });

  it('retires a never-settling action after the documented deadline', async () => {
    jest.useFakeTimers();
    mockUpdatePushNotificationPrefs.mockReturnValue(new Promise(() => {}));
    render(<NotificationsRoute />);
    await waitFor(() => expect(screen.getByTestId('toggle-direct_messages')).toBeTruthy());
    fireEvent(screen.getByTestId('toggle-direct_messages'), 'valueChange', false);

    await waitFor(() => expect(mockUpdatePushNotificationPrefs).toHaveBeenCalledTimes(1));
    await act(async () => { jest.advanceTimersByTime(10_000); });
    await waitFor(() => expect(
      screen.getByText(/could not confirm the chat messages change in time/i),
    ).toBeTruthy());
    expect(screen.getByTestId('toggle-direct_messages')).toHaveAccessibilityState({ disabled: false });
    jest.useRealTimers();
  });

  it('bounds the master action while native registration waits behind older work', async () => {
    jest.useFakeTimers();
    mockAuthorization = 'not_determined';
    mockGetPushNotificationPrefs.mockResolvedValue(MIXED_PREFS);
    mockEnablePush.mockReturnValue(new Promise(() => {}));
    render(<NotificationsRoute />);
    await waitFor(() => expect(screen.getByTestId('toggle-master')).toBeTruthy());

    fireEvent(screen.getByTestId('toggle-master'), 'valueChange', true);
    await waitFor(() => expect(mockEnablePush).toHaveBeenCalledTimes(1));
    await act(async () => { jest.advanceTimersByTime(10_000); });

    await waitFor(() => expect(
      screen.getByText(/could not confirm the push notifications change in time/i),
    ).toBeTruthy());
    expect(screen.getByTestId('toggle-master')).toHaveAccessibilityState({ disabled: false });
    expect(screen.getByTestId('notification-action-retry-push_enabled')).toBeTruthy();
    jest.useRealTimers();
  });

  it('retries only the server preference after native registration partially succeeds', async () => {
    mockAuthorization = 'not_determined';
    mockGetPushNotificationPrefs.mockResolvedValue(MIXED_PREFS);
    mockEnablePush.mockResolvedValue('preference_failed');
    mockUpdatePushNotificationPrefs.mockResolvedValue({ ...ALL_ON_PREFS, push_enabled: true });
    render(<NotificationsRoute />);
    await waitFor(() => expect(screen.getByTestId('toggle-master')).toBeTruthy());

    fireEvent(screen.getByTestId('toggle-master'), 'valueChange', true);
    await waitFor(() => expect(screen.getByText(/device notifications are enabled/i)).toBeTruthy());
    fireEvent.press(screen.getByTestId('notification-action-retry-push_enabled'));

    await waitFor(() => expect(mockUpdatePushNotificationPrefs).toHaveBeenCalledWith({
      push_enabled: true,
    }));
    expect(mockEnablePush).toHaveBeenCalledTimes(1);
  });
});
