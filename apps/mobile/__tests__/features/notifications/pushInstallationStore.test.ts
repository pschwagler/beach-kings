import * as SecureStore from 'expo-secure-store';
import { api } from '@/lib/api';
import {
  __resetPushInstallationStoreForTests,
  getPushInstallationState,
  retirePushInstallation,
  retryPendingPushUnregister,
  savePushRegistration,
} from '@/features/notifications/pushInstallationStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({ randomUUID: () => 'installation-uuid-0001' }));

jest.mock('@/lib/api', () => ({
  api: { unregisterPushInstallation: jest.fn() },
}));

const getItem = SecureStore.getItemAsync as jest.Mock;
const setItem = SecureStore.setItemAsync as jest.Mock;
const unregister = api.unregisterPushInstallation as jest.Mock;

describe('push installation persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetPushInstallationStoreForTests();
    getItem.mockResolvedValue(null);
    setItem.mockResolvedValue(undefined);
    unregister.mockResolvedValue({ success: true });
  });

  it('creates and persists a stable random installation ID', async () => {
    await expect(getPushInstallationState()).resolves.toEqual({
      installationId: 'installation-uuid-0001',
    });
    expect(setItem).toHaveBeenCalledWith(
      'beachleague.push.installation.v1',
      JSON.stringify({ installationId: 'installation-uuid-0001' }),
    );
  });

  it('persists registration metadata and the unregister credential', async () => {
    await savePushRegistration({
      token: 'ExponentPushToken[one]',
      platform: 'ios',
      projectId: 'project-1',
      userId: 7,
      unregisterSecret: 'secret-value',
    });
    const persisted = JSON.parse(setItem.mock.calls.at(-1)?.[1]);
    expect(persisted).toMatchObject({
      installationId: 'installation-uuid-0001',
      token: 'ExponentPushToken[one]',
      platform: 'ios',
      projectId: 'project-1',
      registeredUserId: 7,
      unregisterSecret: 'secret-value',
    });
  });

  it('retains a pending credential when logout cleanup is offline', async () => {
    getItem.mockResolvedValue(JSON.stringify({
      installationId: 'installation-uuid-0001',
      token: 'ExponentPushToken[one]',
      platform: 'ios',
      unregisterSecret: 'secret-value',
    }));
    unregister.mockRejectedValue(new Error('offline'));

    await retirePushInstallation();

    expect(JSON.parse(setItem.mock.calls.at(-1)?.[1])).toEqual({
      installationId: 'installation-uuid-0001',
      pendingUnregister: {
        installationId: 'installation-uuid-0001',
        unregisterSecret: 'secret-value',
      },
    });
  });

  it('retries pending unregister without restoring the old account', async () => {
    getItem.mockResolvedValue(JSON.stringify({
      installationId: 'installation-uuid-0001',
      pendingUnregister: {
        installationId: 'installation-uuid-0001',
        unregisterSecret: 'secret-value',
      },
    }));

    await expect(retryPendingPushUnregister()).resolves.toBe(true);
    expect(unregister).toHaveBeenCalledWith({
      installation_id: 'installation-uuid-0001',
      unregister_secret: 'secret-value',
    });
    expect(JSON.parse(setItem.mock.calls.at(-1)?.[1])).toEqual({
      installationId: 'installation-uuid-0001',
    });
  });

  it('persists token-free retry metadata before a stalled unregister', async () => {
    jest.useFakeTimers();
    getItem.mockResolvedValue(JSON.stringify({
      installationId: 'installation-uuid-0001',
      token: 'ExponentPushToken[one]',
      platform: 'ios',
      registeredUserId: 7,
      unregisterSecret: 'secret-value',
    }));
    unregister.mockReturnValue(new Promise(() => {}));

    const retirement = retirePushInstallation();
    await Promise.resolve();
    await Promise.resolve();
    const persisted = JSON.parse(setItem.mock.calls.at(-1)?.[1]);
    expect(persisted).toEqual({
      installationId: 'installation-uuid-0001',
      pendingUnregister: {
        installationId: 'installation-uuid-0001',
        unregisterSecret: 'secret-value',
      },
    });
    expect(JSON.stringify(persisted)).not.toContain('ExponentPushToken');
    expect(JSON.stringify(persisted)).not.toContain('registeredUserId');

    await jest.advanceTimersByTimeAsync(5_000);
    await expect(retirement).resolves.toBeUndefined();
    jest.useRealTimers();
  });

  it('does not let late retirement clear a newer account registration', async () => {
    const unregisterRequest = deferred<{ success: boolean }>();
    getItem.mockResolvedValue(JSON.stringify({
      installationId: 'installation-uuid-0001',
      token: 'ExponentPushToken[old]',
      platform: 'ios',
      unregisterSecret: 'old-secret',
    }));
    unregister.mockReturnValue(unregisterRequest.promise);

    const retirement = retirePushInstallation();
    await Promise.resolve();
    await savePushRegistration({
      token: 'ExponentPushToken[new]',
      platform: 'ios',
      projectId: 'project-1',
      userId: 8,
      unregisterSecret: 'new-secret',
    });
    unregisterRequest.resolve({ success: true });
    await retirement;

    const persisted = JSON.parse(setItem.mock.calls.at(-1)?.[1]);
    expect(persisted).toMatchObject({
      token: 'ExponentPushToken[new]',
      registeredUserId: 8,
      unregisterSecret: 'new-secret',
    });
  });
});

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
