import { createApiMethods } from "../../../../../packages/api-client/src/methods";
import type { ApiClient } from "../../../../../packages/api-client/src/client";
import type { Notification } from "../../../../../packages/shared/src/types/notification";

function makeClient(get: jest.Mock): ApiClient {
  return {
    axiosInstance: {
      get,
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    },
  } as unknown as ApiClient;
}

function notification(
  id: number,
  dismissedAt: string | null = null,
): Notification {
  return {
    id,
    user_id: 1,
    type: "friend_request",
    title: "Friend request",
    message: "Someone sent a request",
    data: null,
    is_read: false,
    read_at: null,
    dismissed_at: dismissedAt,
    link_url: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("notification API response contracts", () => {
  it.each([
    { items: [notification(1), notification(2, "2026-01-02T00:00:00Z")] },
    [notification(1), notification(2, "2026-01-02T00:00:00Z")],
  ])(
    "normalizes current and legacy feeds and filters dismissed rows",
    async (payload) => {
      const methods = createApiMethods(
        makeClient(jest.fn().mockResolvedValue({ data: payload })),
      );

      await expect(methods.getNotifications()).resolves.toEqual([
        notification(1),
      ]);
    },
  );

  it("uses an empty array for a missing legacy envelope items field", async () => {
    const methods = createApiMethods(
      makeClient(jest.fn().mockResolvedValue({ data: { total_count: 0 } })),
    );

    await expect(methods.getNotifications()).resolves.toEqual([]);
  });

  it("maps unreadOnly to the backend unread_only filter before pagination", async () => {
    const get = jest.fn().mockResolvedValue({ data: { items: [] } });
    const methods = createApiMethods(makeClient(get));

    await methods.getNotifications({
      unreadOnly: true,
      limit: 25,
      offset: 50,
    });

    expect(get).toHaveBeenCalledWith("/api/notifications", {
      params: { unread_only: true, limit: 25, offset: 50 },
    });
  });
});
