import * as SecureStore from 'expo-secure-store';
import { api } from '@/lib/api';
import {
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
});
