import { createApiMethods } from '../../../../../packages/api-client/src/methods';
import type { ApiClient } from '../../../../../packages/api-client/src/client';
import type { ReadRequestOptions } from '../../../../../packages/api-client/src/readRequest';

type Methods = ReturnType<typeof createApiMethods>;
const reads: Array<[string, (api: Methods, options: ReadRequestOptions) => Promise<unknown>]> = [
  ['friends', (api, options) => api.getFriends(undefined, options)],
  ['friend count', (api, options) => api.getFriendsPage({ page_size: 1 }, options)],
  ['suggestions', (api, options) => api.getFriendSuggestions(options)],
  ['discovery', (api, options) => api.discoverPlayers({}, options)],
  ['relationship read-only POST', (api, options) => api.batchFriendStatus([1], options)],
  ['mutual friends', (api, options) => api.getMutualFriends(1, options)],
  ['public profile', (api, options) => api.getPublicPlayer(1, options)],
  ['player leagues', (api, options) => api.getPlayerLeagues(1, options)],
  ['league search read-only POST', (api, options) => api.queryLeagues({}, options)],
  ['conversations', (api, options) => api.getConversations(1, 50, 'hidden', options)],
  ['thread', (api, options) => api.getThread(1, 1, 50, options)],
  ['DM count', (api, options) => api.getDmUnreadCount(options)],
  ['notifications', (api, options) => api.getNotifications({ unreadOnly: true }, options)],
  ['notification count', (api, options) => api.getUnreadNotificationCount(options)],
  ['catalog', (api, options) => api.getCourts({ all: true }, options)],
  ['court detail', (api, options) => api.getCourtById(1, options)],
  ['court photos', (api, options) => api.getCourtPhotos(1, options)],
  ['game history', (api, options) => api.getMyGames({}, options)],
  ['session detail', (api, options) => api.getSessionById(1, options)],
];

describe('all expanded refresh read transports', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it.each(reads)('%s has a finite deadline that aborts actual transport', async (_label, read) => {
    const request = jest.fn(() => new Promise(() => undefined));
    const api = createApiMethods({ axiosInstance: { get: request, post: request } } as unknown as ApiClient);
    const result = read(api, { timeoutMs: 100 });
    const failed = expect(result).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    await Promise.resolve();
    const args = request.mock.calls[0] as unknown as Array<unknown>;
    const config = args[args.length - 1] as { signal: AbortSignal; timeout: number };
    expect(config.timeout).toBe(100);
    expect(config.signal.aborted).toBe(false);
    jest.advanceTimersByTime(100);
    await failed;
    expect(config.signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
  it.each(reads)('%s forwards canonical Query cancellation', async (_label, read) => {
    const request = jest.fn(() => new Promise(() => undefined));
    const api = createApiMethods({ axiosInstance: { get: request, post: request } } as unknown as ApiClient);
    const controller = new AbortController();
    const result = read(api, { signal: controller.signal });
    const failed = expect(result).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await Promise.resolve();
    controller.abort();
    await failed;
    const args = request.mock.calls[0] as unknown as Array<unknown>;
    expect((args[args.length - 1] as { signal: AbortSignal }).signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
});
