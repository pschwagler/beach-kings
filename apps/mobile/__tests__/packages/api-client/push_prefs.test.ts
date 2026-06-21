/**
 * Unit tests for getPushNotificationPrefs and updatePushNotificationPrefs
 * in packages/api-client/src/methods.ts.
 *
 * Verifies:
 *   - GET /api/users/me/push-prefs is called and response data is returned
 *   - PATCH /api/users/me/push-prefs is called with the correct body
 *   - Partial updates are forwarded as-is (no client-side shape transformation)
 */

import { createApiMethods } from '../../../../../packages/api-client/src/methods';
import type { ApiClient } from '../../../../../packages/api-client/src/client';
import type { PushNotificationPrefs } from '../../../../../packages/shared/src/types/notification';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const FULL_PREFS: PushNotificationPrefs = {
  push_enabled: true,
  direct_messages: true,
  league_messages: true,
  friend_requests: true,
  match_invites: true,
  tournament_updates: false,
  ranking_changes: false,
};

// ---------------------------------------------------------------------------
// Client factory helpers
// ---------------------------------------------------------------------------

function makeGetClient(responseData: PushNotificationPrefs) {
  const mockGet = jest.fn().mockResolvedValue({ data: responseData });
  return {
    axiosInstance: { get: mockGet },
    _mockGet: mockGet,
  };
}

function makePatchClient(responseData: PushNotificationPrefs) {
  const mockPatch = jest.fn().mockResolvedValue({ data: responseData });
  return {
    axiosInstance: { patch: mockPatch },
    _mockPatch: mockPatch,
  };
}

// ---------------------------------------------------------------------------
// getPushNotificationPrefs
// ---------------------------------------------------------------------------

describe('getPushNotificationPrefs', () => {
  it('calls GET /api/users/me/push-prefs', async () => {
    const client = makeGetClient(FULL_PREFS);
    const api = createApiMethods(client as unknown as ApiClient);

    await api.getPushNotificationPrefs();

    expect(client._mockGet).toHaveBeenCalledWith('/api/users/me/push-prefs');
  });

  it('returns response data directly', async () => {
    const client = makeGetClient(FULL_PREFS);
    const api = createApiMethods(client as unknown as ApiClient);

    const result = await api.getPushNotificationPrefs();

    expect(result).toEqual(FULL_PREFS);
  });

  it('returns prefs with push_enabled field', async () => {
    const prefs: PushNotificationPrefs = { ...FULL_PREFS, push_enabled: false };
    const client = makeGetClient(prefs);
    const api = createApiMethods(client as unknown as ApiClient);

    const result = await api.getPushNotificationPrefs();

    expect(result.push_enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updatePushNotificationPrefs
// ---------------------------------------------------------------------------

describe('updatePushNotificationPrefs', () => {
  it('calls PATCH /api/users/me/push-prefs with the correct body', async () => {
    const updatedPrefs: PushNotificationPrefs = { ...FULL_PREFS, push_enabled: false };
    const client = makePatchClient(updatedPrefs);
    const api = createApiMethods(client as unknown as ApiClient);

    await api.updatePushNotificationPrefs({ push_enabled: false });

    expect(client._mockPatch).toHaveBeenCalledWith(
      '/api/users/me/push-prefs',
      { push_enabled: false },
    );
  });

  it('returns updated prefs from the response', async () => {
    const updatedPrefs: PushNotificationPrefs = { ...FULL_PREFS, direct_messages: false };
    const client = makePatchClient(updatedPrefs);
    const api = createApiMethods(client as unknown as ApiClient);

    const result = await api.updatePushNotificationPrefs({ direct_messages: false });

    expect(result).toEqual(updatedPrefs);
    expect(result.direct_messages).toBe(false);
  });

  it('sends partial updates as-is (no client-side transformation)', async () => {
    const partial: Partial<PushNotificationPrefs> = {
      ranking_changes: true,
      tournament_updates: true,
    };
    const updatedPrefs: PushNotificationPrefs = { ...FULL_PREFS, ...partial };
    const client = makePatchClient(updatedPrefs);
    const api = createApiMethods(client as unknown as ApiClient);

    await api.updatePushNotificationPrefs(partial);

    expect(client._mockPatch).toHaveBeenCalledWith(
      '/api/users/me/push-prefs',
      partial,
    );
  });

  it('supports empty partial (no-op update)', async () => {
    const client = makePatchClient(FULL_PREFS);
    const api = createApiMethods(client as unknown as ApiClient);

    const result = await api.updatePushNotificationPrefs({});

    expect(client._mockPatch).toHaveBeenCalledWith('/api/users/me/push-prefs', {});
    expect(result).toEqual(FULL_PREFS);
  });
});
