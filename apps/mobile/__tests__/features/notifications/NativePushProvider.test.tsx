import React from 'react';
import { Alert, AppState, View } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import NativePushProvider from '@/features/notifications/NativePushProvider';
import { resetNotificationDedupeForTests } from '@/features/notifications/dedupe';
import { api } from '@/lib/api';
import {
  getSoftAskChoice,
  savePushRegistration,
  setSoftAskChoice,
} from '@/features/notifications/pushInstallationStore';

const mockPush = jest.fn();
const mockRefreshUser = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useSegments: () => ['(tabs)', 'home'],
  useRootNavigationState: () => ({ key: 'root' }),
}));

jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { easConfig: { projectId: 'eas-project-1' }, expoConfig: null },
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    profileComplete: true,
    user: { id: 7 },
    refreshUser: mockRefreshUser,
  }),
}));

const mockShowToast = jest.fn();
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockMarkAsRead = jest.fn();
const mockRefetch = jest.fn().mockResolvedValue([]);
jest.mock('@/features/notifications/useNotifications', () => ({
  useNotifications: () => ({
    unreadCount: 3,
    markAsRead: mockMarkAsRead,
    refetch: mockRefetch,
  }),
}));

const mockUpdatePreferences = jest.fn().mockResolvedValue({});
jest.mock('@/features/notifications/usePushPreferences', () => ({
  usePushPreferences: () => ({ updatePreferences: mockUpdatePreferences }),
}));

jest.mock('@/lib/api', () => ({
  api: { registerPushToken: jest.fn() },
}));

jest.mock('@/features/notifications/pushInstallationStore', () => ({
  getPushInstallationState: jest.fn(async () => ({
    installationId: 'installation-uuid-0001',
  })),
  getSoftAskChoice: jest.fn(),
  retryPendingPushUnregister: jest.fn(async () => true),
  savePushRegistration: jest.fn(),
  setSoftAskChoice: jest.fn(),
}));

const permissionUndetermined = {
  granted: false,
  status: 'undetermined',
  canAskAgain: true,
  expires: 'never',
};
const permissionGranted = {
  granted: true,
  status: 'granted',
  canAskAgain: false,
  expires: 'never',
};

function renderProvider() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NativePushProvider><View testID="child" /></NativePushProvider>
    </QueryClientProvider>,
  );
}

function alertButton(label: string): (() => void) {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? [];
  const button = buttons.find((candidate) => candidate.text === label);
  if (button?.onPress == null) throw new Error(`Missing alert button: ${label}`);
  return button.onPress;
}

describe('NativePushProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    resetNotificationDedupeForTests();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });
    jest.mocked(getSoftAskChoice).mockResolvedValue(null);
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(
      permissionUndetermined as never,
    );
    jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue(
      permissionGranted as never,
    );
    jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({
      data: 'ExponentPushToken[native-test]',
      type: 'expo',
    } as never);
    jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(null);
    jest.mocked(api.registerPushToken).mockResolvedValue({
      id: 1,
      token: 'ExponentPushToken[native-test]',
      platform: 'ios',
      installation_id: 'installation-uuid-0001',
      unregister_secret: 'unregister-secret-value-000000000000',
      created_at: '2026-08-05T12:00:00Z',
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('records Not Now and disables the server master preference', async () => {
    renderProvider();
    await act(async () => { jest.advanceTimersByTime(800); });
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      'Stay in the game',
      expect.any(String),
      expect.any(Array),
    ));

    act(() => alertButton('Not Now')());

    await waitFor(() => {
      expect(setSoftAskChoice).toHaveBeenCalledWith(7, 'not_now');
      expect(mockUpdatePreferences).toHaveBeenCalledWith({ push_enabled: false });
    });
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests alert/sound/badge permission and registers after approval', async () => {
    renderProvider();
    await act(async () => { jest.advanceTimersByTime(800); });
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    act(() => alertButton('Allow Notifications')());

    await waitFor(() => expect(api.registerPushToken).toHaveBeenCalledWith({
      token: 'ExponentPushToken[native-test]',
      platform: 'ios',
      installation_id: 'installation-uuid-0001',
    }));
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledWith({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    expect(savePushRegistration).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      unregisterSecret: 'unregister-secret-value-000000000000',
    }));
    expect(mockUpdatePreferences).toHaveBeenCalledWith({ push_enabled: true });
  });

  it('retries registration when the app becomes active', async () => {
    let onAppStateChange: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      onAppStateChange = listener as (state: string) => void;
      return { remove: jest.fn() } as never;
    });
    jest.mocked(api.registerPushToken)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        id: 1,
        token: 'ExponentPushToken[native-test]',
        platform: 'ios',
        installation_id: 'installation-uuid-0001',
        unregister_secret: 'unregister-secret-value-000000000000',
        created_at: '2026-08-05T12:00:00Z',
      });
    jest.mocked(getSoftAskChoice).mockResolvedValue('allowed');

    renderProvider();
    await waitFor(() => expect(Notifications.getPermissionsAsync).toHaveBeenCalled());
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(
      permissionGranted as never,
    );
    await act(async () => { onAppStateChange?.('active'); });
    expect(mockShowToast).toHaveBeenCalledWith(
      'Notifications could not be registered. We will retry.',
      'error',
    );
    await act(async () => { onAppStateChange?.('active'); });

    expect(api.registerPushToken).toHaveBeenCalledTimes(2);
    expect(savePushRegistration).toHaveBeenCalledTimes(1);
  });

  it('re-registers the installation when Expo reports token rotation', async () => {
    let onTokenChange: (() => void) | undefined;
    jest.mocked(Notifications.addPushTokenListener).mockImplementation((listener) => {
      onTokenChange = () => listener({ type: 'ios', data: 'rotated-native-token' } as never);
      return { remove: jest.fn() } as never;
    });
    jest.mocked(getSoftAskChoice).mockResolvedValue('allowed');
    renderProvider();
    await waitFor(() => expect(Notifications.getPermissionsAsync).toHaveBeenCalled());
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(
      permissionGranted as never,
    );
    await act(async () => { onTokenChange?.(); });
    expect(savePushRegistration).toHaveBeenCalledTimes(1);
    await act(async () => { onTokenChange?.(); });

    expect(api.registerPushToken).toHaveBeenCalledTimes(2);
    expect(savePushRegistration).toHaveBeenCalledTimes(2);
  });

  it('handles a cold-start tap after auth/navigation readiness', async () => {
    jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue({
      actionIdentifier: 'default',
      notification: {
        request: {
          identifier: 'request-1',
          content: {
            title: 'Friend request',
            body: 'Alex sent a request',
            data: {
              notificationId: 91,
              type: 'friend_request',
              linkUrl: '/notifications',
              data: { friend_request_id: 12 },
            },
          },
        },
      },
    } as never);

    renderProvider();

    await waitFor(() => expect(mockMarkAsRead).toHaveBeenCalledWith(91));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/social?tab=notifications');
    expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalled();
  });

  it('handles the same response only once across listener and cold-start APIs', async () => {
    let respond: ((response: Notifications.NotificationResponse) => void) | undefined;
    jest.mocked(Notifications.addNotificationResponseReceivedListener).mockImplementation(
      (listener) => {
        respond = listener;
        return { remove: jest.fn() } as never;
      },
    );
    const response = {
      actionIdentifier: 'default',
      notification: {
        request: {
          identifier: 'request-shared',
          content: {
            title: 'Friend request',
            body: 'A player sent a request',
            data: {
              notificationId: 93,
              type: 'friend_request',
              linkUrl: '/notifications',
              data: { friend_request_id: 13 },
            },
          },
        },
      },
    } as never;
    jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(response);

    renderProvider();
    await waitFor(() => expect(mockMarkAsRead).toHaveBeenCalledWith(93));
    act(() => respond?.(response));

    expect(mockMarkAsRead).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('suppresses the native system alert and shows one in-app banner', async () => {
    let receive: ((notification: Notifications.Notification) => void) | undefined;
    jest.mocked(Notifications.addNotificationReceivedListener).mockImplementation((listener) => {
      receive = listener;
      return { remove: jest.fn() } as never;
    });
    renderProvider();
    const notification = {
      request: {
        identifier: 'request-2',
        content: {
          title: 'New message from Alex',
          body: 'A new message is available.',
          data: {
            notificationId: 92,
            type: 'direct_message',
            linkUrl: '/home?tab=messages',
            data: {},
          },
        },
      },
    } as unknown as Notifications.Notification;

    act(() => {
      receive?.(notification);
      receive?.(notification);
    });

    expect(mockShowToast).toHaveBeenCalledTimes(1);
  });
});
