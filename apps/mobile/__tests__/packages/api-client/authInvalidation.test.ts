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

describe("ApiClient auth invalidation", () => {
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
