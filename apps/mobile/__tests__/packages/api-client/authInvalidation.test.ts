const mockAxiosInstances: Array<jest.Mock & Record<string, unknown>> = [];

jest.mock("axios", () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => {
      const instance = jest.fn(async (config: { url?: string }) => ({
        data: { ok: config.url },
      })) as jest.Mock & Record<string, unknown>;
      instance.get = jest.fn();
      instance.post = jest.fn();
      instance.put = jest.fn();
      instance.patch = jest.fn();
      instance.delete = jest.fn();
      instance.interceptors = {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      };
      mockAxiosInstances.push(instance);
      return instance;
    }),
  },
}));

import { ApiClient } from "../../../../../packages/api-client/src/client";
import type { StorageAdapter } from "../../../../../packages/api-client/src/storage";

class MemoryStorage implements StorageAdapter {
  private values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

interface FakeAxiosInstance extends jest.Mock {
  post: jest.Mock;
  interceptors: {
    response: { use: jest.Mock };
  };
}

type RejectInterceptor = (error: {
  config: Record<string, unknown>;
  response: { status: number };
}) => Promise<unknown>;

async function makeClient(): Promise<{
  client: ApiClient;
  api: FakeAxiosInstance;
  refresh: FakeAxiosInstance;
  rejectResponse: RejectInterceptor;
}> {
  mockAxiosInstances.splice(0);
  const client = new ApiClient("https://example.test", new MemoryStorage());
  // Let the constructor's asynchronous storage restore finish before a test
  // installs credentials explicitly.
  await Promise.resolve();
  const api = mockAxiosInstances[0] as unknown as FakeAxiosInstance;
  const refresh = mockAxiosInstances[1] as unknown as FakeAxiosInstance;
  const rejectResponse = api.interceptors.response.use.mock
    .calls[0][1] as RejectInterceptor;
  return { client, api, refresh, rejectResponse };
}

function unauthorized(url: string) {
  return {
    config: { url, headers: {} },
    response: { status: 401 },
  };
}

function forbidden(url: string) {
  return {
    config: { url, headers: {} },
    response: { status: 403 },
  };
}

describe("ApiClient auth invalidation", () => {
  it.each(['read', 'write'])('retires shared refresh and queue when native storage %s stalls', async stage => {
    jest.useFakeTimers();
    try {
      mockAxiosInstances.splice(0);
      const values = new Map<string, string>();
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      let block = false;
      const storage: StorageAdapter = {
        getItem: async key => {
          if (block && stage === 'read' && key === 'beach_refresh_token') await gate;
          return values.get(key) ?? null;
        },
        setItem: async (key, value) => {
          if (block && stage === 'write' && value === 'fresh') await gate;
          values.set(key, value);
        },
        removeItem: async key => { values.delete(key); },
      };
      const client = new ApiClient('https://example.test', storage);
      await client.setAuthTokens('expired', 'old-refresh');
      block = true;
      const api = mockAxiosInstances[0] as unknown as FakeAxiosInstance;
      const refresh = mockAxiosInstances[1] as unknown as FakeAxiosInstance;
      refresh.post.mockResolvedValue({ data: { access_token: 'fresh' } });
      const rejectResponse = api.interceptors.response.use.mock.calls[0][1] as RejectInterceptor;
      const outcomes = Promise.allSettled([
        rejectResponse(unauthorized('/first')), rejectResponse(unauthorized('/queued')),
      ]);
      for (let attempt = 0; attempt < 12; attempt += 1) await Promise.resolve();
      jest.advanceTimersByTime(15_000);
      expect((await outcomes).every(result => result.status === 'rejected')).toBe(true);
      const state = client as unknown as { isRefreshing: boolean; failedQueue: unknown[] };
      expect(state.isRefreshing).toBe(false);
      expect(state.failedQueue).toHaveLength(0);
      expect(api).not.toHaveBeenCalled();
      const signIn = client.setAuthTokens('new-access', 'new-refresh');
      block = false;
      release();
      await signIn;
      for (let attempt = 0; attempt < 12; attempt += 1) await Promise.resolve();
      expect(await client.getStoredTokens()).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh' });
      expect(api).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('orders delayed old storage removal before new sign-in and does not invalidate the new identity', async () => {
    mockAxiosInstances.splice(0);
    const values = new Map<string, string>();
    let release!: () => void;
    const blockedRemoval = new Promise<void>(resolve => { release = resolve; });
    const removeItem = jest.fn(async (key: string) => { await blockedRemoval; values.delete(key); });
    const storage: StorageAdapter = {
      getItem: async key => values.get(key) ?? null,
      setItem: async (key, value) => { values.set(key, value); },
      removeItem,
    };
    const client = new ApiClient('https://example.test', storage);
    await client.setAuthTokens('old-access', 'old-refresh');
    const api = mockAxiosInstances[0] as unknown as FakeAxiosInstance;
    const refresh = mockAxiosInstances[1] as unknown as FakeAxiosInstance;
    const rejectResponse = api.interceptors.response.use.mock.calls[0][1] as RejectInterceptor;
    refresh.post.mockRejectedValue(new Error('refresh rejected'));
    const listener = jest.fn();
    client.onAuthInvalidated(listener);
    const first = rejectResponse(unauthorized('/old')).catch(() => undefined);
    for (let attempt = 0; attempt < 12; attempt += 1) await Promise.resolve();
    expect(removeItem).toHaveBeenCalled();
    const signIn = client.setAuthTokens('new-access', 'new-refresh');
    release();
    await Promise.all([first, signIn]);
    expect(listener).not.toHaveBeenCalled();
    expect(await client.getStoredTokens()).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh' });
  });

  it.each(['logout', 'switch'])('cannot resurrect an old identity after %s during deferred refresh', async transition => {
    const { client, api, refresh, rejectResponse } = await makeClient();
    await client.setAuthTokens('old-access', 'old-refresh');
    let finish!: (value: unknown) => void;
    refresh.post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const first = rejectResponse(unauthorized('/old-account'));
    const result = Promise.allSettled([first]);
    await Promise.resolve();
    await Promise.resolve();
    if (transition === 'logout') await client.clearAuthTokens();
    else await client.setAuthTokens('new-access', 'new-refresh');
    finish({ data: { access_token: 'obsolete-access' } });
    await result;
    expect(await client.getStoredTokens()).toEqual(transition === 'logout'
      ? { accessToken: null, refreshToken: null }
      : { accessToken: 'new-access', refreshToken: 'new-refresh' });
    expect(api).not.toHaveBeenCalled();
  });

  it('removes cancelled queued reads, never replays them, and preserves auth on cancellation', async () => {
    const { client, api, refresh, rejectResponse } = await makeClient();
    await client.setAuthTokens('expired', 'valid-refresh');
    let finish!: (value: unknown) => void;
    refresh.post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const listener = jest.fn();
    client.onAuthInvalidated(listener);
    const first = rejectResponse(unauthorized('/first'));
    const controller = new AbortController();
    const queued = rejectResponse({ ...unauthorized('/queued'), config: { url: '/queued', signal: controller.signal } });
    const rejection = expect(queued).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    await rejection;
    expect((client as unknown as { failedQueue: unknown[] }).failedQueue).toHaveLength(0);
    finish({ data: { access_token: 'fresh' } });
    await first;
    expect(api).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not invalidate auth or replay when the initiating read is cancelled during successful refresh', async () => {
    const { client, api, refresh, rejectResponse } = await makeClient();
    await client.setAuthTokens('expired', 'valid-refresh');
    let finish!: (value: unknown) => void;
    refresh.post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const listener = jest.fn();
    client.onAuthInvalidated(listener);
    const controller = new AbortController();
    const first = rejectResponse({ ...unauthorized('/first'), config: { url: '/first', signal: controller.signal } });
    const rejection = expect(first).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    finish({ data: { access_token: 'fresh' } });
    await rejection;
    expect(api).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    expect((await client.getStoredTokens()).accessToken).toBe('fresh');
  });

  it('bounds a stalled shared refresh and releases every queued request with existing invalidation policy', async () => {
    jest.useFakeTimers();
    try {
      const { client, refresh, rejectResponse } = await makeClient();
      await client.setAuthTokens('expired', 'valid-refresh');
      refresh.post.mockImplementation(() => new Promise(() => undefined));
      const listener = jest.fn();
      client.onAuthInvalidated(listener);
      const outcomes = Promise.allSettled([
        rejectResponse(unauthorized('/first')), rejectResponse(unauthorized('/second')),
      ]);
      await Promise.resolve();
      await Promise.resolve();
      const config = refresh.post.mock.calls[0][2] as { signal: AbortSignal };
      jest.advanceTimersByTime(15_000);
      expect((await outcomes).every(result => result.status === 'rejected')).toBe(true);
      expect(config.signal.aborted).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
      expect((client as unknown as { failedQueue: unknown[] }).failedQueue).toHaveLength(0);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it("returns the original 403 when CustomEvent is unavailable on native", async () => {
    const { rejectResponse } = await makeClient();
    const customEventDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "CustomEvent",
    );
    Object.defineProperty(globalThis, "CustomEvent", {
      configurable: true,
      value: undefined,
    });

    try {
      await expect(
        rejectResponse(forbidden("/api/sessions/9/participants/5")),
      ).rejects.toMatchObject({
        response: { status: 403 },
      });
    } finally {
      if (customEventDescriptor == null) {
        delete (globalThis as { CustomEvent?: unknown }).CustomEvent;
      } else {
        Object.defineProperty(
          globalThis,
          "CustomEvent",
          customEventDescriptor,
        );
      }
    }
  });

  it("attempts to remove both stored credentials when one removal fails", async () => {
    const removeItem = jest.fn(async (key: string) => {
      if (key === "beach_access_token") throw new Error("storage failed");
    });
    const storage: StorageAdapter = {
      getItem: jest.fn(async () => null),
      setItem: jest.fn(async () => undefined),
      removeItem,
    };
    const client = new ApiClient("https://example.test", storage);
    await Promise.resolve();

    await expect(client.clearAuthTokens()).rejects.toThrow("storage failed");
    expect(removeItem).toHaveBeenCalledWith("beach_access_token");
    expect(removeItem).toHaveBeenCalledWith("beach_refresh_token");
  });

  it("emits once after refresh failure and clears credentials", async () => {
    const { client, refresh, rejectResponse } = await makeClient();
    await client.setAuthTokens("expired", "bad-refresh");
    refresh.post.mockRejectedValue(new Error("refresh rejected"));
    const listener = jest.fn();
    client.onAuthInvalidated(listener);

    await expect(
      rejectResponse(unauthorized("/private")),
    ).rejects.toBeDefined();
    await expect(
      rejectResponse(unauthorized("/private")),
    ).rejects.toBeDefined();

    expect(listener).toHaveBeenCalledTimes(1);
    await expect(client.getStoredTokens()).resolves.toEqual({
      accessToken: null,
      refreshToken: null,
    });
  });

  it("emits when an authenticated request has no usable refresh token", async () => {
    const { client, rejectResponse } = await makeClient();
    await client.setAuthTokens("expired", null);
    const listener = jest.fn();
    client.onAuthInvalidated(listener);

    await expect(
      rejectResponse(unauthorized("/private")),
    ).rejects.toBeDefined();

    expect(listener).toHaveBeenCalledTimes(1);
    await expect(client.getStoredTokens()).resolves.toEqual({
      accessToken: null,
      refreshToken: null,
    });
  });

  it("does not emit for a public auth 401", async () => {
    const { client, rejectResponse } = await makeClient();
    const listener = jest.fn();
    client.onAuthInvalidated(listener);

    await expect(
      rejectResponse(unauthorized("/api/auth/login")),
    ).rejects.toBeDefined();

    expect(listener).not.toHaveBeenCalled();
  });

  it("refreshes and retries queued requests without invalidating auth", async () => {
    const { client, api, refresh, rejectResponse } = await makeClient();
    await client.setAuthTokens("expired", "valid-refresh");
    refresh.post.mockResolvedValue({ data: { access_token: "fresh" } });
    const listener = jest.fn();
    client.onAuthInvalidated(listener);

    const [first, second] = await Promise.all([
      rejectResponse(unauthorized("/first")),
      rejectResponse(unauthorized("/second")),
    ]);

    expect(first).toEqual({ data: { ok: "/first" } });
    expect(second).toEqual({ data: { ok: "/second" } });
    expect(refresh.post).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledTimes(2);
    expect(listener).not.toHaveBeenCalled();
    await expect(client.getStoredTokens()).resolves.toEqual({
      accessToken: "fresh",
      refreshToken: "valid-refresh",
    });
  });

  it("unsubscribes auth invalidation listeners", async () => {
    const { client, rejectResponse } = await makeClient();
    await client.setAuthTokens("expired", null);
    const listener = jest.fn();
    const unsubscribe = client.onAuthInvalidated(listener);
    unsubscribe();

    await expect(
      rejectResponse(unauthorized("/private")),
    ).rejects.toBeDefined();

    expect(listener).not.toHaveBeenCalled();
  });
});
