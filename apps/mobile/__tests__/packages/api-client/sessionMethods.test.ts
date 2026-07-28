import { createApiMethods } from '../../../../../packages/api-client/src/methods';
import type { ApiClient } from '../../../../../packages/api-client/src/client';

function makeClient(post: jest.Mock, patch: jest.Mock): ApiClient {
  return {
    axiosInstance: {
      get: jest.fn(),
      post,
      put: jest.fn(),
      patch,
      delete: jest.fn(),
    },
  } as unknown as ApiClient;
}

describe('session API methods', () => {
  it('posts create payloads with court_id and ranked intent', async () => {
    const post = jest.fn().mockResolvedValue({ data: { status: 'ok', message: 'created', session: { id: 7 } } });
    const methods = createApiMethods(makeClient(post, jest.fn()));

    await methods.createSession({ court_id: 12, is_ranked: false });

    expect(post).toHaveBeenCalledWith('/api/sessions', { court_id: 12, is_ranked: false });
  });

  it('patches updates with the typed session update payload', async () => {
    const patch = jest.fn().mockResolvedValue({ data: { status: 'ok', message: 'updated', session: { id: 7 } } });
    const methods = createApiMethods(makeClient(jest.fn(), patch));

    await methods.updateSession(7, { court_id: 12, is_ranked: true });

    expect(patch).toHaveBeenCalledWith('/api/sessions/7', { court_id: 12, is_ranked: true });
  });

  it('batch-invites selected players into an active session', async () => {
    const post = jest.fn().mockResolvedValue({
      data: { added: [10, 11], failed: [] },
    });
    const methods = createApiMethods(makeClient(post, jest.fn()));

    await expect(methods.inviteSessionPlayers(7, [10, 11])).resolves.toEqual({
      added: [10, 11],
      failed: [],
    });
    expect(post).toHaveBeenCalledWith('/api/sessions/7/invite_batch', {
      player_ids: [10, 11],
    });
  });
});
