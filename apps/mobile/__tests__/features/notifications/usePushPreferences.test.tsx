import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePushPreferences } from '@/features/notifications/usePushPreferences';
import { notificationKeys } from '@/features/notifications/keys';
import { api } from '@/lib/api';

let mockUserId = 7;
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: mockUserId }, isAuthenticated: true }),
}));

jest.mock('@/lib/api', () => ({
  api: {
    getPushNotificationPrefs: jest.fn(),
    updatePushNotificationPrefs: jest.fn(),
  },
}));

const mockApi = api as jest.Mocked<typeof api>;
const prefs = {
  push_enabled: true,
  direct_messages: true,
  league_messages: true,
  friend_requests: true,
  match_invites: true,
  ranking_changes: true,
  tournament_updates: true,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  const wrapper = ({ children }: { readonly children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => usePushPreferences(), { wrapper }) };
}

describe('usePushPreferences mutation ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 7;
    mockApi.getPushNotificationPrefs.mockResolvedValue(prefs);
  });

  it('does not let an older failed request roll back a newer choice', async () => {
    const older = deferred<typeof prefs>();
    mockApi.updatePushNotificationPrefs
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(prefs);
    const { client, result } = setup();
    await waitFor(() => expect(result.current.prefs).toEqual(prefs));

    let olderWork!: Promise<unknown>;
    act(() => {
      olderWork = result.current.updatePreferences({ direct_messages: false });
    });
    await waitFor(() => expect(
      client.getQueryData<typeof prefs>(notificationKeys.preferences(7))?.direct_messages,
    ).toBe(false));
    await act(async () => {
      await result.current.updatePreferences({ direct_messages: true });
    });
    older.reject(new Error('late failure'));
    await act(async () => { await olderWork.catch(() => undefined); });

    expect(
      client.getQueryData<typeof prefs>(notificationKeys.preferences(7))?.direct_messages,
    ).toBe(true);
  });

  it('settles the action when background invalidation never settles', async () => {
    mockApi.updatePushNotificationPrefs.mockResolvedValue({
      ...prefs,
      direct_messages: false,
    });
    const { client, result } = setup();
    await waitFor(() => expect(result.current.prefs).toEqual(prefs));
    jest.spyOn(client, 'invalidateQueries').mockReturnValue(new Promise(() => {}));

    await act(async () => {
      await expect(result.current.updatePreferences({ direct_messages: false }))
        .resolves.toMatchObject({ direct_messages: false });
    });

    await waitFor(() => expect(result.current.isSaving).toBe(false));
  });

  it('keeps a late completion scoped to the account that started it', async () => {
    const accountA = deferred<typeof prefs>();
    mockApi.updatePushNotificationPrefs.mockReturnValueOnce(accountA.promise);
    const { client, result, rerender } = setup();
    await waitFor(() => expect(result.current.prefs).toEqual(prefs));

    let accountAWork!: Promise<unknown>;
    act(() => {
      accountAWork = result.current.updatePreferences({ direct_messages: false });
    });
    await waitFor(() => expect(mockApi.updatePushNotificationPrefs).toHaveBeenCalledTimes(1));
    client.clear();
    mockUserId = 8;
    const accountBPrefs = { ...prefs, direct_messages: false };
    mockApi.getPushNotificationPrefs.mockResolvedValue(accountBPrefs);
    rerender(undefined);
    await waitFor(() => expect(result.current.prefs).toEqual(accountBPrefs));

    accountA.resolve({ ...prefs, direct_messages: false });
    await act(async () => { await accountAWork; });

    expect(client.getQueryData(notificationKeys.preferences(8))).toEqual(accountBPrefs);
    expect(client.getQueryData(notificationKeys.preferences(7))).toBeUndefined();
  });
});
